import { createHash } from 'node:crypto'
import { decodeName, formatPlayTime } from './util.js'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CACHE_TTL = 5 * 60 * 1000
const cache = new Map()

export const SEARCH_PROVIDERS = [
  { platform: 'kw', label: '酷我音乐' },
  { platform: 'tx', label: 'QQ 音乐' },
  { platform: 'wy', label: '网易云音乐' },
  { platform: 'kg', label: '酷狗音乐' },
  { platform: 'mg', label: '咪咕音乐' },
]

const PLATFORM_LABELS = Object.fromEntries(SEARCH_PROVIDERS.map((p) => [p.platform, p.label]))

function cacheKey(platform, query, page, limit) {
  return `${platform}\u0000${query}\u0000${page}\u0000${limit}`
}

function remember(key, value) {
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 120) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 30)
    for (const [k] of oldest) cache.delete(k)
  }
}

async function requestJson(url, options = {}, timeout = 15_000) {
  const headers = { 'User-Agent': UA, ...(options.headers || {}) }
  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(timeout),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`搜索接口 HTTP ${response.status}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('搜索接口返回的不是 JSON')
  }
}

function typeOfSize(size, type, hash) {
  const bytes = Number(size)
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  return { type, size: bytes, ...(hash ? { hash } : {}) }
}

function dedupeTypes(types) {
  const seen = new Set()
  return types.filter((item) => {
    if (!item || seen.has(item.type)) return false
    seen.add(item.type)
    return true
  })
}

function baseSong(source, fields) {
  const singer = decodeName(fields.singer || '')
  const name = decodeName(fields.name || '')
  const albumName = decodeName(fields.albumName || '')
  const songmid = fields.songmid === undefined || fields.songmid === null ? '' : String(fields.songmid)
  const hash = fields.hash ? String(fields.hash) : ''
  const musicInfo = {
    source,
    songmid,
    name,
    singer,
    albumName,
    albumId: fields.albumId === undefined ? '' : String(fields.albumId),
    interval: fields.interval || '',
    ...(hash ? { hash } : {}),
    ...(fields.strMediaMid ? { strMediaMid: String(fields.strMediaMid) } : {}),
    ...(fields.songId ? { songId: String(fields.songId) } : {}),
    ...(fields.copyrightId ? { copyrightId: String(fields.copyrightId) } : {}),
    ...(fields.albumMid ? { albumMid: String(fields.albumMid) } : {}),
    ...(fields.albumAudioId ? { albumAudioId: String(fields.albumAudioId) } : {}),
  }
  return {
    key: `${source}:${songmid}:${hash}`,
    source,
    sourceLabel: PLATFORM_LABELS[source] || source,
    songmid,
    hash,
    strMediaMid: musicInfo.strMediaMid || '',
    copyrightId: musicInfo.copyrightId || '',
    songId: musicInfo.songId || '',
    name,
    singer,
    albumName,
    albumId: musicInfo.albumId,
    interval: musicInfo.interval,
    durationSeconds: fields.durationSeconds || 0,
    img: fields.img || '',
    types: dedupeTypes(fields.types || []),
    musicInfo,
  }
}

function parseKwTypes(minfo) {
  const types = []
  for (const part of String(minfo || '').split(';')) {
    const m = /level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/.exec(part)
    if (!m) continue
    const bitrate = Number(m[2])
    const type = bitrate === 4000 ? 'flac24bit' : bitrate === 2000 ? 'flac' : bitrate === 320 ? '320k' : bitrate === 128 ? '128k' : ''
    if (!type) continue
    const sizeText = m[4].toUpperCase()
    const size = /MB$/.test(sizeText)
      ? Math.round(parseFloat(sizeText) * 1024 * 1024)
      : /KB$/.test(sizeText) ? Math.round(parseFloat(sizeText) * 1024) : Number(sizeText)
    types.push({ type, size: Number.isFinite(size) ? size : 0 })
  }
  return types.reverse()
}

async function searchKw(query, page, limit) {
  const url = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(query)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
  const body = await requestJson(url)
  const rows = Array.isArray(body.abslist) ? body.abslist : []
  const list = rows.map((row) => {
    const songmid = String(row.MUSICRID || '').replace('MUSIC_', '')
    return baseSong('kw', {
      songmid,
      name: row.SONGNAME,
      singer: row.ARTIST,
      albumName: row.ALBUM,
      albumId: row.ALBUMID,
      durationSeconds: Number(row.DURATION) || 0,
      interval: formatPlayTime(Number(row.DURATION) || 0),
      types: parseKwTypes(row.N_MINFO || row.MINFO),
      img: row.ALBUMID ? `https://img1.kuwo.cn/star/albumcover/${row.ALBUMID}.jpg` : '',
    })
  }).filter((song) => song.songmid && song.name)
  return { list, total: Number(body.TOTAL) || list.length }
}

async function searchTx(query, page, limit) {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=${page}&n=${limit}&w=${encodeURIComponent(query)}&format=json&cr=1&new_json=1&t=0`
  const body = await requestJson(url, { headers: { Referer: 'https://y.qq.com/' } })
  const data = body?.data?.song
  const rows = Array.isArray(data?.list) ? data.list : []
  const list = rows.map((row) => {
    const file = row.file || {}
    const album = row.album || {}
    const albumMid = album.mid || ''
    const types = [
      typeOfSize(file.size_128mp3, '128k'),
      typeOfSize(file.size_320mp3, '320k'),
      typeOfSize(file.size_flac, 'flac'),
      typeOfSize(file.size_hires, 'flac24bit'),
    ].filter(Boolean)
    return baseSong('tx', {
      songmid: row.mid || '',
      name: row.title || row.name || '',
      singer: (row.singer || []).map((s) => s.name).filter(Boolean).join('、'),
      albumName: album.name || '',
      albumId: albumMid,
      albumMid,
      durationSeconds: Number(row.interval) || 0,
      interval: formatPlayTime(Number(row.interval) || 0),
      types,
      img: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
      strMediaMid: file.media_mid || '',
      songId: row.id || '',
      albumAudioId: file.media_mid || '',
    })
  }).filter((song) => song.songmid && song.name)
  return { list, total: Number(data?.totalnum) || list.length }
}

async function searchWy(query, page, limit) {
  const body = await requestJson('https://music.163.com/api/cloudsearch/pc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://music.163.com/',
      Origin: 'https://music.163.com',
    },
    body: new URLSearchParams({
      s: query,
      type: '1',
      limit: String(limit),
      offset: String((page - 1) * limit),
      total: page === 1 ? 'true' : 'false',
    }).toString(),
  })
  const result = body?.result || {}
  const rows = Array.isArray(result.songs) ? result.songs : []
  const list = rows.map((row) => {
    const privilege = row.privilege || {}
    const album = row.al || {}
    const types = []
    if (privilege.maxBrLevel === 'hires' && row.hr) types.push(typeOfSize(row.hr.size, 'flac24bit'))
    if ([999000, 1900000].includes(Number(privilege.maxbr)) && row.sq) types.push(typeOfSize(row.sq.size, 'flac'))
    if ([320000, 192000].includes(Number(privilege.maxbr)) && row.h) types.push(typeOfSize(row.h.size, '320k'))
    if (row.l) types.push(typeOfSize(row.l.size, '128k'))
    if (!types.length) {
      if (row.sq) types.push(typeOfSize(row.sq.size, 'flac'))
      if (row.h) types.push(typeOfSize(row.h.size, '320k'))
      if (row.l) types.push(typeOfSize(row.l.size, '128k'))
    }
    return baseSong('wy', {
      songmid: row.id,
      name: row.name,
      singer: (row.ar || []).map((s) => s.name).filter(Boolean).join('、'),
      albumName: album.name || '',
      albumId: album.id || '',
      interval: formatPlayTime((row.dt || 0) / 1000),
      durationSeconds: Math.round((row.dt || 0) / 1000),
      types,
      img: album.picUrl || '',
    })
  }).filter((song) => song.songmid && song.name)
  return { list, total: Number(result.songCount) || list.length }
}

async function searchKg(query, page, limit) {
  const url = `http://songsearch.kugou.com/song_search_v2?platform=AndroidFilter&iscorrection=1&keyword=${encodeURIComponent(query)}&hifiquality=0&pagesize=${limit}&PrivilegeFilter=0&page=${page}`
  const body = await requestJson(url)
  const data = body?.data || {}
  const rows = Array.isArray(data.lists) ? data.lists : []
  const list = []
  const seen = new Set()
  const push = (row) => {
    const key = `${row.Audioid || ''}:${row.FileHash || ''}`
    if (!row.SongName || !row.FileHash || seen.has(key)) return
    seen.add(key)
    const types = [
      typeOfSize(row.FileSize, '128k', row.FileHash),
      typeOfSize(row.HQFileSize, '320k', row.HQFileHash),
      typeOfSize(row.SQFileSize, 'flac', row.SQFileHash),
      typeOfSize(row.ResFileSize, 'flac24bit', row.ResFileHash),
    ].filter(Boolean)
    list.push(baseSong('kg', {
      songmid: row.Audioid || row.MixSongID || '',
      hash: row.FileHash,
      name: `${row.OriSongName || row.SongName}${row.Suffix ? ` ${row.Suffix}` : ''}`,
      singer: (row.Singers || []).map((s) => s.name).filter(Boolean).join('、'),
      albumName: row.AlbumName || '',
      albumId: row.AlbumID || '',
      interval: formatPlayTime(Number(row.Duration) || 0),
      durationSeconds: Number(row.Duration) || 0,
      types,
      albumAudioId: row.MixSongID || '',
    }))
  }
  for (const row of rows) {
    push(row)
    for (const child of Array.isArray(row.Grp) ? row.Grp : []) push(child)
  }
  return { list, total: Number(data.total) || list.length }
}

function mixSign(query, timestamp) {
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20'
  return {
    deviceId,
    sign: createHash('md5')
      .update(`${query}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${timestamp}`)
      .digest('hex'),
  }
}

async function searchMg(query, page, limit) {
  const timestamp = String(Date.now())
  const { deviceId, sign } = mixSign(query, timestamp)
  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(query)}&pageNo=${page}&sort=0&sid=USS`
  const body = await requestJson(url, {
    headers: {
      uiVersion: 'A_music_3.6.1',
      deviceId,
      timestamp,
      sign,
      channel: '0146921',
      'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
    },
  })
  if (body?.code !== '000000') throw new Error(`咪咕搜索失败：${body?.info || body?.code || '未知错误'}`)
  const result = body.songResultData || {}
  const groups = Array.isArray(result.resultList) ? result.resultList : []
  const list = []
  const seen = new Set()
  for (const group of groups) {
    for (const row of Array.isArray(group) ? group : [group]) {
      if (!row || !row.songId || !row.copyrightId || seen.has(row.copyrightId)) continue
      seen.add(row.copyrightId)
      const types = []
      for (const format of row.audioFormats || []) {
        const size = Number(format.asize ?? format.isize) || 0
        const type = format.formatType === 'PQ' ? '128k'
          : format.formatType === 'HQ' ? '320k'
            : format.formatType === 'SQ' ? 'flac'
              : format.formatType === 'ZQ24' || format.formatType === 'ZQ' ? 'flac24bit' : ''
        if (type) types.push({ type, size })
      }
      let img = row.img3 || row.img2 || row.img1 || ''
      if (img && !/^https?:/i.test(img)) img = `https://d.musicapp.migu.cn${img}`
      const duration = Number(row.duration) || 0
      list.push(baseSong('mg', {
        songmid: row.songId,
        name: row.name || row.songName || '',
        singer: (row.singerList || []).map((s) => s.name).filter(Boolean).join('、'),
        albumName: row.album || '',
        albumId: row.albumId || '',
        durationSeconds: duration,
        interval: formatPlayTime(duration),
        types,
        img,
        copyrightId: row.copyrightId,
      }))
    }
  }
  return { list, total: Number(result.totalCount) || list.length }
}

const SEARCHERS = { kw: searchKw, tx: searchTx, wy: searchWy, kg: searchKg, mg: searchMg }

export async function searchSongs(platform, query, page = 1, limit = 30) {
  const q = String(query || '').trim()
  if (!q) throw new Error('请输入搜索关键词')
  if (!SEARCHERS[platform]) throw new Error(`不支持的搜索平台：${platform}`)
  const p = Math.max(1, Number(page) || 1)
  const n = Math.min(50, Math.max(10, Number(limit) || 30))
  const key = cacheKey(platform, q, p, n)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.value, cached: true }
  const { list, total } = await SEARCHERS[platform](q, p, n)
  const value = {
    list,
    page: p,
    limit: n,
    total,
    allPage: Math.max(1, Math.ceil(total / n)),
    platform,
    query: q,
  }
  remember(key, value)
  return value
}

export function platformLabel(platform) {
  return PLATFORM_LABELS[platform] || platform
}
