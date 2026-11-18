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

/**
 * Cover art hosts we are willing to fetch for the renderer. Kugou serves its
 * covers over plain http, which the desktop renderer blocks as mixed content
 * inside the secure app shell -- so the client asks this proxy instead.
 */
const COVER_HOSTS = ['kugou.com', 'kuwo.cn', '126.net', 'gtimg.cn', 'migu.cn', 'qq.com']

function coverAllowed(target) {
  try {
    const url = new URL(String(target || ''))
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    return COVER_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false
  }
}

const COVER_REFERERS = [
  ['kugou.com', 'https://www.kugou.com/'],
  ['kuwo.cn', 'http://www.kuwo.cn/'],
  ['126.net', 'https://music.163.com/'],
  ['gtimg.cn', 'https://y.qq.com/'],
  ['migu.cn', 'https://music.migu.cn/'],
]

function refererFor(host) {
  const lower = String(host || '').toLowerCase()
  const match = COVER_REFERERS.find(([suffix]) => lower === suffix || lower.endsWith(`.${suffix}`))
  return match ? match[1] : ''
}


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

  /**
   * Proxy a cover image for the renderer.
   *
   * Kugou (and friends) hand out plain-http cover URLs, and the desktop shell
   * is a secure context, so a direct <img> is dropped as mixed content -- the
   * card showed the placeholder instead. Fetching it here gives the renderer a
   * same-origin https URL and lets us attach the referer those CDNs expect.
   */
  async cover(target, req, res) {
    const raw = String(target || '')
    if (!coverAllowed(raw)) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('不支持的封面地址')
      return
    }
    const url = new URL(raw)
    const headers = { 'User-Agent': UA }
    const referer = refererFor(url.hostname)
    if (referer) headers.Referer = referer
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('封面请求超时')), 15_000)
    let upstream
    try {
      upstream = await fetch(url.href, { headers, redirect: 'follow', signal: controller.signal })
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`封面获取失败：${error && error.message ? error.message : String(error)}`)
      return
    } finally {
      clearTimeout(timer)
    }
    if (!upstream.ok) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`封面上游返回 HTTP ${upstream.status}`)
      return
    }
    let buffer
    try {
      buffer = Buffer.from(await upstream.arrayBuffer())
    } catch {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('封面读取失败')
      return
    }
    if (buffer.length > 8 * 1024 * 1024) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('封面过大')
      return
    }
    const declared = String(upstream.headers.get('content-type') || '').toLowerCase()
    const extension = url.pathname.split('.').pop().toLowerCase()
    const type = declared.startsWith('image/')
      ? declared.split(';')[0]
      : extension === 'png' ? 'image/png'
        : extension === 'webp' ? 'image/webp'
          : extension === 'gif' ? 'image/gif'
            : 'image/jpeg'
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=86400',
    })
    res.end(buffer)
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
