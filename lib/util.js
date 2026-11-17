import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export const VERSION = '0.4.12'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function dataDir() {
  return join(dshHome(), 'lx-geteer')
}

export function sha1(value) {
  return createHash('sha1').update(value).digest('hex')
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true })
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

export function writeJson(file, value) {
  ensureDir(dirname(file))
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(tmp, file)
}

export function fileSize(file) {
  try {
    return statSync(file).size
  } catch {
    return 0
  }
}

/** Decode the small HTML-entity subset music APIs actually return. */
export function decodeName(value) {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim()
}

export function formatPlayTime(seconds) {
  const n = Number(seconds)
  if (!Number.isFinite(n) || n <= 0) return ''
  const total = Math.round(n)
  const mm = Math.floor(total / 60)
  const ss = total % 60
  return `${mm}:${String(ss).padStart(2, '0')}`
}

export function formatSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`
  if (n > 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

/**
 * Parse the leading JSDoc-ish header LX Music requires on a custom source.
 * Returns `{}` for a script without a header.
 */
export function parseScriptMeta(script, fallbackName = '') {
  const match = /^\s*\/\*!?([\s\S]*?)\*\//.exec(String(script || ''))
  const meta = { name: fallbackName, description: '', version: '', author: '', homepage: '' }
  if (!match) return meta
  const field = (key) => {
    const m = new RegExp(`@${key}\\s+([^\\n\\r]+)`).exec(match[1])
    return m ? m[1].trim() : ''
  }
  meta.name = field('name') || fallbackName
  meta.description = field('description')
  meta.version = field('version')
  meta.author = field('author')
  meta.homepage = field('homepage')
  return meta
}

export function sanitizeFilename(value, max = 120) {
  let out = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
  if (out.length > max) out = out.slice(0, max).trim()
  return out || 'audio'
}

/** Read a JSON request body with a hard byte cap. */
export function readJsonBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error(`请求体超过 ${Math.round(limit / 1024 / 1024)} MB`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolvePromise({})
        return
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * `sendJson` for failure paths: a client that already vanished must not turn a
 * write error into an unhandled rejection (the Host exits the process on one).
 */
export function sendJsonSafe(res, status, value) {
  try {
    if (res.writableEnded || res.destroyed) return
    if (res.headersSent) {
      res.destroy()
      return
    }
    sendJson(res, status, value)
  } catch {
    /* socket already gone */
  }
}


/**
 * Only same-origin loopback/LAN pages should reach the private API. This is a
 * CSRF guard, not an authentication boundary: the DSH Web server already owns
 * peer admission.
 */
export function isTrustedRequest(req) {
  const host = String(req.headers.host || '')
  const origin = String(req.headers.origin || '')
  if (!origin) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function isInside(root, candidate) {
  const a = resolve(root)
  const b = resolve(candidate)
  return b === a || b.startsWith(`${a}/`)
}
