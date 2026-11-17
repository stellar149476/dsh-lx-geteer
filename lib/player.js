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

/**
 * Holds the current playback item and proxies its upstream URL so the browser
 * can seek by byte range while the Host supplies the platform Referer/UA that
 * direct media elements cannot set.
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
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('播放链接已过期，请重新获取')
      return
    }
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
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`音频代理失败：${error && error.message ? error.message : String(error)}`)
      return
    } finally {
      clearTimeout(connectTimer)
    }
    if (!upstream.ok && upstream.status !== 206) {
      res.writeHead(upstream.status === 416 ? 416 : 502, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`上游返回 HTTP ${upstream.status}`)
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
        reader = null
      }
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
    res.writeHead(upstream.status, outHeaders)
    if (method === 'HEAD' || !reader) {
      if (head && head.length) res.write(head)
      res.end()
      return
    }
    if (head && head.length) res.write(head)
    const pump = async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value && value.length && !res.write(Buffer.from(value))) {
            await new Promise((resolve) => res.once('drain', resolve))
          }
        }
        res.end()
      } catch {
        try {
          res.destroy()
        } catch {
          /* already closed */
        }
      }
    }
    res.on('close', () => {
      try {
        reader.cancel()
      } catch {
        /* already closed */
      }
    })
    pump()
  }
}
