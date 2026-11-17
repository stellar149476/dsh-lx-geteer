import { randomUUID } from 'node:crypto'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PLATFORM_HEADERS = {
  kw: { Referer: 'http://www.kuwo.cn/', Origin: 'http://www.kuwo.cn' },
  kg: { Referer: 'https://www.kugou.com/', Origin: 'https://www.kugou.com' },
  tx: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
  wy: { Referer: 'https://music.163.com/', Origin: 'https://music.163.com' },
  mg: { Referer: 'https://music.migu.cn/', Origin: 'https://music.migu.cn' },
}
const TOKEN_TTL = 6 * 60 * 60 * 1000

function contentTypeFor(url, upstreamType) {
  const declared = String(upstreamType || '').split(';')[0].trim().toLowerCase()
  if (declared && declared !== 'application/octet-stream' && declared !== 'text/plain') return declared
  try {
    const ext = new URL(url).pathname.split('.').pop().toLowerCase()
    if (ext === 'flac') return 'audio/flac'
    if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4'
    if (ext === 'ogg' || ext === 'opus') return 'audio/ogg'
    if (ext === 'wav') return 'audio/wav'
    if (ext === 'aac') return 'audio/aac'
  } catch {
    /* fall through */
  }
  return 'audio/mpeg'
}

function sniffAudioType(bytes) {
  if (!bytes || bytes.length < 4) return ''
  const b = Buffer.from(bytes)
  if (b.subarray(0, 3).toString('latin1') === 'ID3') return 'audio/mpeg'
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'audio/mpeg'
  const magic = b.subarray(0, 4).toString('latin1')
  if (magic === 'fLaC') return 'audio/flac'
  if (magic === 'OggS') return 'audio/ogg'
  if (magic === 'RIFF') return 'audio/wav'
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return 'audio/mp4'
  return ''
}

/** Write a short failure body without ever throwing back into the caller. */
function fail(res, status, message) {
  try {
    if (res.writableEnded || res.destroyed) return
    if (res.headersSent) res.destroy()
    else {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(message)
    }
  } catch {
    /* socket already gone */
  }
}

/** Drop an upstream body we will not read, so undici never reports it later. */
async function discard(upstream) {
  if (!upstream || !upstream.body) return
  try {
    const canceled = upstream.body.cancel()
    if (canceled && typeof canceled.catch === 'function') await canceled.catch(() => {})
  } catch {
    /* already closed */
  }
}

/**
 * Holds the current playback item and proxies its upstream URL so the browser
 * can seek by byte range while the Host supplies the platform Referer/UA that
 * direct media elements cannot set.
 *
 * Every exit from `stream()` must settle `res` and never leave a rejected
 * promise behind: the Host exits the whole process on an unhandled rejection,
 * which costs the user their window (see lib/safety.js).
 */
export class PlayerHub {
  constructor() {
    this.state = {
      status: 'idle',
      revision: 0,
      token: '',
      title: '',
      singer: '',
      album: '',
      cover: '',
      quality: '',
      platform: '',
      query: '',
      playlist: null,
      error: '',
      startedAt: 0,
      updatedAt: 0,
    }
    this.tokens = new Map()
  }

  publish(patch) {
    this.state = {
      ...this.state,
      ...patch,
      revision: this.state.revision + 1,
      updatedAt: Date.now(),
    }
    return this.state
  }

  current() {
    return {
      ...this.state,
      streamPath: this.state.token ? `/lx-geteer-stream?id=${encodeURIComponent(this.state.token)}` : '',
    }
  }

  remember(url, platform) {
    const token = randomUUID()
    this.tokens.set(token, { url, platform, at: Date.now() })
    this.prune()
    return token
  }

  prune() {
    const cutoff = Date.now() - TOKEN_TTL
    for (const [token, item] of this.tokens) {
      if (item.at < cutoff) this.tokens.delete(token)
    }
  }

  async stream(token, req, res) {
    const item = this.tokens.get(String(token || ''))
    if (!item) {
      fail(res, 404, '播放链接已过期，请重新获取')
      return
    }
    // A dropped client connection surfaces as an 'error' event on either
    // socket; without a listener Node turns that into an uncaught exception.
    const swallow = () => {}
    req.on('error', swallow)
    res.on('error', swallow)

    const headers = {
      'User-Agent': UA,
      ...(PLATFORM_HEADERS[item.platform] || {}),
    }
    if (req.headers.range) headers.Range = req.headers.range
    const method = req.method === 'HEAD' ? 'HEAD' : 'GET'
    // Bound only the connection phase; the body may stream for a whole song.
    const controller = new AbortController()
    const connectTimer = setTimeout(() => controller.abort(new Error('连接音频源超时')), 20_000)
    let upstream
    try {
      upstream = await fetch(item.url, { method, headers, redirect: 'follow', signal: controller.signal })
    } catch (error) {
      clearTimeout(connectTimer)
      fail(res, 502, `音频代理失败：${error && error.message ? error.message : String(error)}`)
      return
    }
    clearTimeout(connectTimer)
    if (!upstream.ok && upstream.status !== 206) {
      const status = upstream.status
      await discard(upstream)
      fail(res, status === 416 ? 416 : 502, `上游返回 HTTP ${status}`)
      return
    }

    let declaredType = contentTypeFor(item.url, upstream.headers.get('content-type'))
    let head = null
    let reader = null
    if (method !== 'HEAD' && upstream.body) {
      reader = upstream.body.getReader()
      try {
        const first = await reader.read()
        if (first.value && first.value.length) {
          head = Buffer.from(first.value)
          const sniffed = sniffAudioType(head)
          if (sniffed) declaredType = sniffed
        }
        if (first.done) reader = null
      } catch {
        try {
          const canceled = reader.cancel()
          if (canceled && typeof canceled.catch === 'function') await canceled.catch(() => {})
        } catch {
          /* already closed */
        }
        reader = null
      }
    } else {
      await discard(upstream)
    }

    const outHeaders = {
      'Content-Type': declaredType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    for (const name of ['content-length', 'content-range']) {
      const value = upstream.headers.get(name)
      if (value) outHeaders[name] = value
    }
    try {
      res.writeHead(upstream.status, outHeaders)
    } catch {
      await discard(upstream)
      fail(res, 502, '音频代理失败：响应头已失效')
      return
    }
    if (method === 'HEAD' || !reader) {
      try {
        if (head && head.length) res.write(head)
        res.end()
      } catch {
        /* client already gone */
      }
      return
    }
    if (head && head.length) {
      try {
        res.write(head)
      } catch {
        /* client already gone */
      }
    }

    // The browser dropped the stream (seek, next track): stop the upstream body
    // too, so the abandoned socket does not error on its own later.
    res.on('close', () => {
      try {
        controller.abort()
      } catch {
        /* already aborted */
      }
      // `cancel()` returns a promise that rejects when the body already errored,
      // so swallow it: an unhandled rejection here takes the whole host down.
      try {
        const canceled = reader.cancel()
        if (canceled && typeof canceled.catch === 'function') canceled.catch(() => {})
      } catch {
        /* already closed */
      }
    })

    const pump = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (res.destroyed || res.writableEnded) break
          if (value && value.length && !res.write(Buffer.from(value))) {
            await new Promise((resolve) => {
              const finish = () => {
                res.removeListener('drain', finish)
                res.removeListener('close', finish)
                res.removeListener('error', finish)
                resolve()
              }
              res.once('drain', finish)
              res.once('close', finish)
              res.once('error', finish)
            })
          }
        }
        if (!res.writableEnded && !res.destroyed) res.end()
      } catch {
        try {
          res.destroy()
        } catch {
          /* already closed */
        }
      }
    }
    // Never leave this promise floating: the Host treats a stray rejection as
    // fatal, and `pump` runs long after the request handler returned.
    pump().catch(() => {})
  }
}
