import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { inflateRawSync, gunzipSync } from 'node:zlib'
import { dataDir, ensureDir, readJson, sha1, writeJson } from './util.js'

function extractZipEntry(buffer) {
  // Prefer the central directory: local headers may carry zero sizes when the
  // writer used a data descriptor.
  let eocd = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i -= 1) {
    if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x05 && buffer[i + 3] === 0x06) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 文件')
  const centralOffset = buffer.readUInt32LE(eocd + 16)
  let cursor = centralOffset
  if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('ZIP 中央目录损坏')
  const method = buffer.readUInt16LE(cursor + 10)
  const compressedSize = buffer.readUInt32LE(cursor + 20)
  const nameLength = buffer.readUInt16LE(cursor + 28)
  const extraLength = buffer.readUInt16LE(cursor + 30)
  const commentLength = buffer.readUInt16LE(cursor + 32)
  const localOffset = buffer.readUInt32LE(cursor + 42)
  const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
  cursor += 46 + nameLength + extraLength + commentLength
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP 本地文件头损坏')
  const localNameLength = buffer.readUInt16LE(localOffset + 26)
  const localExtraLength = buffer.readUInt16LE(localOffset + 28)
  const dataStart = localOffset + 30 + localNameLength + localExtraLength
  const data = buffer.subarray(dataStart, dataStart + compressedSize)
  if (method === 0) return { name, data }
  if (method === 8) return { name, data: inflateRawSync(data) }
  throw new Error(`不支持的 ZIP 压缩方式：${method}`)
}

/** Decode an `.lxmc` playlist (gzip JSON, with a ZIP fallback). */
export function decodeLxmc(buffer, filename = '') {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  let text
  if (input[0] === 0x1f && input[1] === 0x8b) {
    text = gunzipSync(input).toString('utf8')
  } else if (input[0] === 0x50 && input[1] === 0x4b) {
    text = extractZipEntry(input).data.toString('utf8')
  } else {
    text = input.toString('utf8')
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('歌单内容不是合法 JSON')
  }
  const data = parsed && parsed.data ? parsed.data : parsed
  if (!data || !Array.isArray(data.list)) throw new Error('不是 LX Music 歌单文件（缺少 data.list）')
  const fallbackSource = data.source || data.list.find((item) => item && item.source)?.source || ''
  const items = data.list.map((item, index) => {
    const meta = item && item.meta && typeof item.meta === 'object' ? item.meta : {}
    const qualitys = Array.isArray(meta.qualitys)
      ? meta.qualitys.filter((q) => q && typeof q.type === 'string' && typeof q.hash === 'string')
      : []
    const source = typeof item.source === 'string' && item.source ? item.source : fallbackSource
    return {
      id: String(item.id || `${meta.songId || index}_${meta.hash || ''}`),
      name: String(item.name || ''),
      singer: String(item.singer || ''),
      source,
      interval: String(item.interval || ''),
      songmid: meta.songId === undefined || meta.songId === null ? '' : String(meta.songId),
      hash: meta.hash ? String(meta.hash) : (qualitys[0]?.hash || ''),
      albumName: String(meta.albumName || ''),
      albumId: meta.albumId === undefined || meta.albumId === null ? '' : String(meta.albumId),
      picUrl: meta.picUrl || '',
      qualitys: qualitys.map((q) => ({ type: q.type, size: q.size === undefined ? '' : String(q.size), hash: q.hash })),
    }
  }).filter((item) => item.name)
  if (!items.length) throw new Error('歌单里没有可播放的歌曲')
  const identity = `${data.source || fallbackSource}|${data.sourceListId || ''}|${data.name || filename}|${items.length}|${items[0].id}`
  return {
    id: `pl-${sha1(identity).slice(0, 12)}`,
    name: String(data.name || filename || '未命名歌单'),
    source: fallbackSource || items[0].source || '',
    sourceListId: data.sourceListId ? String(data.sourceListId) : '',
    count: items.length,
    items,
  }
}

export class PlaylistStore {
  constructor() {
    this.root = join(dataDir(), 'playlists')
    this.playlists = []
  }

  load() {
    ensureDir(this.root)
    const list = []
    for (const name of readdirSync(this.root)) {
      if (!name.endsWith('.json')) continue
      const value = readJson(join(this.root, name), null)
      if (value && value.id && Array.isArray(value.items)) list.push(value)
    }
    list.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0))
    this.playlists = list
    return this
  }

  summaries() {
    return this.playlists.map((p) => ({
      id: p.id,
      name: p.name,
      source: p.source,
      sourceListId: p.sourceListId || '',
      count: p.count || p.items.length,
      importedAt: p.importedAt || 0,
    }))
  }

  get(id) {
    return this.playlists.find((p) => p.id === id) || null
  }

  add(buffer, filename = '') {
    const parsed = decodeLxmc(buffer, filename)
    const existing = this.get(parsed.id)
    const value = { ...parsed, importedAt: existing ? existing.importedAt : Date.now() }
    writeJson(join(this.root, `${parsed.id}.json`), value)
    if (existing) {
      const index = this.playlists.findIndex((p) => p.id === parsed.id)
      this.playlists[index] = value
    } else {
      this.playlists.unshift(value)
    }
    return value
  }

  remove(id) {
    const index = this.playlists.findIndex((p) => p.id === id)
    if (index < 0) throw new Error('歌单不存在')
    const [value] = this.playlists.splice(index, 1)
    try {
      unlinkSync(join(this.root, `${id}.json`))
    } catch {
      /* file already gone */
    }
    return value
  }
}
