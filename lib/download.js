import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import { sanitizeFilename } from './util.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const PLATFORM_HEADERS = {
  kw: { Referer: 'http://www.kuwo.cn/', Origin: 'http://www.kuwo.cn' },
  kg: { Referer: 'https://www.kugou.com/', Origin: 'https://www.kugou.com' },
  tx: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
  wy: { Referer: 'https://music.163.com/', Origin: 'https://music.163.com' },
  mg: { Referer: 'https://music.migu.cn/', Origin: 'https://music.migu.cn' },
}

const MIME_EXT = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

function extensionFrom(url, contentType, quality) {
  try {
    const ext = extname(new URL(url).pathname).replace('.', '').toLowerCase()
    if (/^(mp3|flac|m4a|aac|ogg|opus|wav)$/.test(ext)) return ext
  } catch {
    /* invalid URL handled by fetch */
  }
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase()
  if (MIME_EXT[mime]) return MIME_EXT[mime]
  return /flac|hires|master|atmos|24bit/i.test(String(quality || '')) ? 'flac' : 'mp3'
}

function freePath(dir, base, ext) {
  let target = join(dir, `${base}.${ext}`)
  let n = 2
  while (existsSync(target)) {
    target = join(dir, `${base} (${n}).${ext}`)
    n += 1
    if (n > 999) break
  }
  return target
}

export class DownloadJobs {
  constructor(logger = null) {
    this.jobs = new Map()
    this.logger = logger
  }

  create({ platform, quality, song, settings, resolveUrl }) {
    const id = randomUUID()
    const job = {
      id,
      state: 'running',
      phase: 'resolving',
      platform,
      quality,
      name: song && song.name ? String(song.name) : '',
      singer: song && song.singer ? String(song.singer) : '',
      songKey: song && song.songKey ? String(song.songKey) : '',
      received: 0,
      total: 0,
      path: '',
      fileName: '',
      url: '',
      error: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      controller: new AbortController(),
    }
    this.jobs.set(id, job)
    this.cleanup()
    this.run(job, song, settings, resolveUrl).catch((error) => {
      job.state = 'error'
      job.phase = 'error'
      job.error = error && error.message ? error.message : String(error)
      job.updatedAt = Date.now()
      if (this.logger) this.logger(`[job ${id.slice(0, 8)}] ${job.error}`)
    })
    return this.public(job)
  }

  async run(job, song, settings, resolveUrl) {
    const url = await resolveUrl(job.platform, job.quality, song)
    if (job.controller.signal.aborted) throw new Error('下载已取消')
    job.url = url
    job.phase = 'downloading'
    job.updatedAt = Date.now()

    const dir = settings.downloadDir
    mkdirSync(dir, { recursive: true })
    const attempts = [
      {
        'User-Agent': UA,
        ...(PLATFORM_HEADERS[job.platform] || {}),
      },
      // Some proxy backends reject a browser Referer but accept the player UA.
      { 'User-Agent': 'lx-music-desktop/2.0.0' },
    ]
    let response = null
    let lastError = null
    for (const headers of attempts) {
      try {
        const candidate = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: job.controller.signal,
        })
        if (candidate.ok) {
          const contentType = candidate.headers.get('content-type') || ''
          if (!/text\/html|application\/json/i.test(contentType)) {
            response = candidate
            break
          }
          lastError = new Error(`服务器返回的不是音频（${contentType}）`)
        } else {
          lastError = new Error(`下载失败：HTTP ${candidate.status}`)
        }
        try {
          await candidate.body?.cancel()
        } catch {
          /* discard failed attempt */
        }
      } catch (error) {
        lastError = new Error(`下载请求失败：${error && error.message ? error.message : String(error)}`)
      }
    }
    if (!response) throw lastError || new Error('下载失败')
    if (!response.body) throw new Error('下载响应没有内容')
    const contentType = response.headers.get('content-type') || ''

    const ext = extensionFrom(url, contentType, job.quality)
    const base = sanitizeFilename([job.singer, job.name].filter(Boolean).join(' - ') || 'audio')
    const target = freePath(dir, base, ext)
    const temp = `${target}.part`
    job.path = target
    job.fileName = target.slice(dir.length).replace(/^\/+/, '')
    job.total = Number(response.headers.get('content-length')) || 0
    job.updatedAt = Date.now()

    try {
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          job.received += chunk.length
          job.updatedAt = Date.now()
          callback(null, chunk)
        },
      })
      await pipeline(
        Readable.fromWeb(response.body),
        counter,
        createWriteStream(temp),
      )
      if (job.controller.signal.aborted) throw new Error('下载已取消')
      const size = statSync(temp).size
      if (size < 1024) throw new Error(`下载内容过小（${size} 字节），可能不是有效音频`)
      renameSync(temp, target)
      job.received = size
      job.total = job.total || size
      job.state = 'done'
      job.phase = 'done'
      job.updatedAt = Date.now()
      if (this.logger) this.logger(`[job ${job.id.slice(0, 8)}] saved ${target} (${size} bytes)`)
    } catch (error) {
      try {
        unlinkSync(temp)
      } catch {
        /* partial file already gone */
      }
      throw error
    }
  }

  get(id) {
    return this.jobs.get(id)
  }

  list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((job) => this.public(job))
  }

  public(job) {
    return {
      id: job.id,
      state: job.state,
      phase: job.phase,
      platform: job.platform,
      quality: job.quality,
      name: job.name,
      singer: job.singer,
      songKey: job.songKey,
      received: job.received,
      total: job.total,
      path: job.path,
      fileName: job.fileName,
      error: job.error,
      url: job.state === 'done' ? job.url : '',
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    }
  }

  cleanup() {
    const cutoff = Date.now() - 30 * 60 * 1000
    for (const [id, job] of this.jobs) {
      if (job.updatedAt < cutoff) this.jobs.delete(id)
    }
  }
}
