import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { SourceStore } from './lib/store.js'
import { LxRuntime } from './lib/lx-runtime.js'
import { SEARCH_PROVIDERS, searchSongs, platformLabel } from './lib/search.js'
import { DownloadJobs } from './lib/download.js'
import { PlayerHub } from './lib/player.js'
import { PlaylistStore } from './lib/playlist.js'
import {
  VERSION, dataDir, isTrustedRequest, readJsonBody, sendJson,
} from './lib/util.js'

export const inject = ['webServer']

const PACKAGE_DIR = fileURLToPath(new URL('.', import.meta.url))
const searchablePlatforms = new Set(SEARCH_PROVIDERS.map((p) => p.platform))

export function apply(ctx) {
  const store = new SourceStore(PACKAGE_DIR).load()
  const jobs = new DownloadJobs((line) => console.log('[lx-geteer]', line))
  const playerHub = new PlayerHub()
  const playlists = new PlaylistStore().load()
  let runtime = null
  let runtimeSourceId = ''
  let runtimeError = ''
  let runtimeReady = false
  let starting = null

  const log = (...args) => console.log('[lx-geteer]', ...args)

  function disposeRuntime() {
    if (runtime) {
      try {
        runtime.dispose()
      } catch {
        /* ignore */
      }
    }
    runtime = null
    runtimeSourceId = ''
    runtimeReady = false
  }

  async function loadRuntime(source) {
    const script = store.readScript(source)
    const instance = new LxRuntime({
      source,
      script,
      timeoutMs: store.getSettings().requestTimeout * 1000,
      onLog: (level, line) => {
        if (level === 'error') console.error('[lx-geteer]', line)
      },
    })
    try {
      await instance.start()
      return instance
    } catch (error) {
      try {
        instance.dispose()
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  async function ensureRuntime() {
    if (runtime && runtimeReady && runtimeSourceId === store.getActiveId()) return runtime
    if (starting) return starting
    const source = store.getActive()
    if (!source) {
      runtimeError = '还没有音源，请先导入 LX Music 自定义源'
      throw new Error(runtimeError)
    }
    starting = (async () => {
      runtimeError = ''
      const loaded = await loadRuntime(source)
      disposeRuntime()
      runtime = loaded
      runtimeSourceId = source.id
      runtimeReady = true
      runtimeError = ''
      log(`active source ready: ${source.name}`)
      return runtime
    })()
    try {
      return await starting
    } catch (error) {
      runtimeError = error && error.message ? error.message : String(error)
      runtimeReady = false
      throw error
    } finally {
      starting = null
    }
  }

  async function switchSource(id) {
    const source = store.getSource(id)
    if (!source) throw new Error('音源不存在')
    if (id === runtimeSourceId && runtimeReady) return source
    const loaded = await loadRuntime(source)
    disposeRuntime()
    runtime = loaded
    runtimeSourceId = source.id
    runtimeReady = true
    runtimeError = ''
    store.setActive(id)
    return source
  }

  function support() {
    if (!runtime || !runtimeReady) return []
    try {
      return runtime.support()
    } catch {
      return []
    }
  }

  function providers() {
    const supported = new Set(support().map((s) => s.platform))
    return SEARCH_PROVIDERS.filter((p) => supported.has(p.platform))
  }

  function activeSource() {
    const source = store.getActive()
    if (!source) return null
    return {
      id: source.id,
      name: source.name,
      description: source.description || '',
      version: source.version || '',
      author: source.author || '',
      homepage: source.homepage || '',
      builtin: false,
    }
  }

  function state() {
    return {
      ok: true,
      version: VERSION,
      active: activeSource(),
      sources: store.listSources(),
      support: support(),
      providers: providers(),
      searchProviders: SEARCH_PROVIDERS,
      settings: store.getSettings(),
      jobs: jobs.list(),
      player: playerHub.current(),
      playlists: playlists.summaries(),
      runtime: {
        ready: runtimeReady,
        error: runtimeError,
        sourceId: runtimeSourceId,
        logs: runtime ? runtime.logs.slice(-40) : [],
      },
      storage: {
        dataDir: dataDir(),
        downloadDir: store.getSettings().downloadDir,
      },
    }
  }

  function requirePlatform(platform) {
    if (!searchablePlatforms.has(platform)) throw new Error('该平台暂不支持在线搜索')
    const supported = support().find((s) => s.platform === platform)
    if (!supported) throw new Error(`当前音源不支持 ${platform} 平台`)
    return supported
  }

  function qualityOf(platform, wanted) {
    const supported = requirePlatform(platform)
    const qualities = supported.qualities || []
    if (wanted && qualities.includes(wanted)) return wanted
    const preferred = ['320k', 'flac', '128k', '192k', 'flac24bit']
    const picked = preferred.find((q) => qualities.includes(q)) || qualities[0]
    if (!picked) throw new Error('当前音源没有声明可用音质')
    return picked
  }

  function withTimeout(promise, ms, message) {
    let timer = null
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms)
      timer.unref?.()
    })
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }

  function pickBest(list, query) {
    const tokens = String(query || '').toLowerCase().split(/[\s,，、/]+/).filter(Boolean)
    let best = list[0]
    let bestScore = -Infinity
    for (const song of list.slice(0, 10)) {
      const text = `${song.name} ${song.singer}`.toLowerCase()
      let score = tokens.reduce((total, token) => total + (text.includes(token) ? 2 : 0), 0)
      if (song.name.toLowerCase() === String(query || '').toLowerCase()) score += 4
      if (score > bestScore) {
        bestScore = score
        best = song
      }
    }
    return best
  }

  /**
   * Search for a song, resolve it through the active LX source, and publish it
   * to the player. Tries the most useful platforms in order so one dead source
   * backend does not fail the whole request.
   */
  async function playSong({ query, platform, quality } = {}) {
    const q = String(query || '').trim()
    if (!q) return { ok: false, message: '请告诉我想听什么歌，例如「周杰伦 晴天」。' }
    try {
      await ensureRuntime()
    } catch (error) {
      return { ok: false, message: `现在还不能播放：${error && error.message ? error.message : String(error)}` }
    }
    const supported = support()
    const selected = platform ? String(platform) : (store.getSettings().platform || 'wy')
    const order = [...new Set([selected, 'wy', 'tx', 'kw', 'kg', 'mg'])]
    let platforms = (platform ? [selected] : order)
      .filter((p) => supported.some((s) => s.platform === p) && searchablePlatforms.has(p))
    if (platform) platforms = platforms.slice(0, 1)
    if (!platforms.length) {
      return { ok: false, message: '当前音源没有可用于搜索播放的平台，请先在设置页导入支持酷我/QQ/网易云/酷狗/咪咕的音源。' }
    }
    let lastError = ''
    for (const p of platforms.slice(0, platform ? 1 : 4)) {
      try {
        const data = await searchSongs(p, q, 1, 15)
        if (!data.list.length) {
          lastError = `在${platformLabel(p)}没有找到「${q}」`
          continue
        }
        const song = pickBest(data.list, q)
        const chosenQuality = qualityOf(p, quality || store.getSettings().quality)
        if (!runtime || !runtimeReady) throw new Error('音源尚未就绪')
        const url = await withTimeout(
          runtime.musicUrl(p, chosenQuality, song.musicInfo),
          20_000,
          `解析${platformLabel(p)}播放链接超时`,
        )
        const token = playerHub.remember(url, p)
        playerHub.publish({
          status: 'ready',
          token,
          title: song.name,
          singer: song.singer,
          album: song.albumName,
          cover: song.img,
          quality: chosenQuality,
          platform: p,
          query: q,
          error: '',
          startedAt: Date.now(),
        })
        return {
          ok: true,
          message: `正在播放：${song.name}${song.singer ? ` — ${song.singer}` : ''}（${chosenQuality} / ${platformLabel(p)}）`,
          title: song.name,
          singer: song.singer,
          album: song.albumName,
          quality: chosenQuality,
          platform: p,
        }
      } catch (error) {
        lastError = error && error.message ? error.message : String(error)
      }
    }
    playerHub.publish({
      status: 'error',
      token: '',
      title: q,
      query: q,
      error: lastError || '没有找到歌曲',
      startedAt: Date.now(),
    })
    return {
      ok: false,
      message: `播放失败：${lastError || '没有找到歌曲'}。可以在对话框下方的音质按钮换音质，或在设置页换一个音源。`,
    }
  }

  function playlistMode() {
    return store.getSettings().playMode || 'list'
  }

  function pickItemQuality(item, wanted) {
    const list = item.qualitys || []
    if (wanted && list.some((q) => q.type === wanted)) return wanted
    const order = ['320k', 'flac', 'flac24bit', '128k', '192k']
    return order.find((type) => list.some((q) => q.type === type)) || list[0]?.type || wanted
  }

  function playlistMusicInfo(item, source, quality) {
    const chosen = (item.qualitys || []).find((q) => q.type === quality)
    const hash = chosen?.hash || item.hash
    const types = (item.qualitys || []).map((q) => ({ type: q.type, size: q.size, hash: q.hash }))
    const qualitys = {}
    for (const q of item.qualitys || []) qualitys[q.type] = { size: q.size, hash: q.hash }
    return {
      source,
      songmid: item.songmid,
      ...(hash ? { hash } : {}),
      name: item.name,
      singer: item.singer,
      albumName: item.albumName,
      albumId: item.albumId,
      interval: item.interval,
      types,
      _types: qualitys,
    }
  }

  async function resolvePlaylistItem(playlist, index, wantedQuality) {
    const item = playlist.items[index]
    if (!item) throw new Error('歌单里没有这一首')
    const source = item.source || playlist.source
    if (!searchablePlatforms.has(source)) throw new Error(`歌单指定的平台不支持：${source}`)
    const supported = support().find((s) => s.platform === source)
    if (!supported) throw new Error(`当前音源不支持${platformLabel(source)}（歌单指定 ${source}），请先切换到一个支持该平台的音源`)
    const sourceQuality = qualityOf(source, wantedQuality || store.getSettings().quality)
    const chosenQuality = pickItemQuality(item, sourceQuality) || sourceQuality
    const musicInfo = playlistMusicInfo(item, source, chosenQuality)
    if (!runtime || !runtimeReady) throw new Error('音源尚未就绪')
    const url = await withTimeout(
      runtime.musicUrl(source, chosenQuality, musicInfo),
      20_000,
      `解析${platformLabel(source)}播放链接超时`,
    )
    return { url, item, source, quality: chosenQuality }
  }

  function publishPlaylistItem(playlist, index, resolved) {
    playerHub.publish({
      status: 'ready',
      token: playerHub.remember(resolved.url, resolved.source),
      title: resolved.item.name,
      singer: resolved.item.singer,
      album: resolved.item.albumName,
      cover: resolved.item.picUrl,
      quality: resolved.quality,
      platform: resolved.source,
      query: `${resolved.item.name} ${resolved.item.singer}`.trim(),
      error: '',
      startedAt: Date.now(),
      playlist: {
        id: playlist.id,
        name: playlist.name,
        source: playlist.source,
        index,
        total: playlist.items.length,
        mode: playlistMode(),
      },
    })
  }

  async function playPlaylistIndex(playlist, startIndex, quality) {
    const total = playlist.items.length
    const start = Math.max(0, Math.min(total - 1, Number(startIndex) || 0))
    let lastError = null
    for (let attempt = 0; attempt < total; attempt += 1) {
      const index = (start + attempt) % total
      try {
        const resolved = await resolvePlaylistItem(playlist, index, quality)
        publishPlaylistItem(playlist, index, resolved)
        return { index, resolved }
      } catch (error) {
        lastError = error
      }
    }
    throw lastError || new Error('歌单里的歌曲都解析失败')
  }

  async function playPlaylist(id, index, quality) {
    const playlist = playlists.get(String(id || ''))
    if (!playlist) return { ok: false, message: '歌单不存在，请重新导入' }
    try {
      await ensureRuntime()
      const result = await playPlaylistIndex(playlist, index, quality)
      return {
        ok: true,
        message: `正在播放歌单《${playlist.name}》第 ${result.index + 1}/${playlist.items.length} 首：${result.resolved.item.name}${result.resolved.item.singer ? ` — ${result.resolved.item.singer}` : ''}（${result.resolved.quality} / ${platformLabel(result.resolved.source)}）`,
        playlist: { id: playlist.id, name: playlist.name, index: result.index, total: playlist.items.length },
        title: result.resolved.item.name,
        singer: result.resolved.item.singer,
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      playerHub.publish({ status: 'error', token: '', title: playlist.name, error: message, startedAt: Date.now() })
      return { ok: false, message: `歌单播放失败：${message}` }
    }
  }

  async function playlistStep(delta, auto = false) {
    const context = playerHub.state.playlist
    if (!context || !context.id) throw new Error('当前没有正在播放的歌单')
    const playlist = playlists.get(context.id)
    if (!playlist) throw new Error('歌单已被删除')
    const total = playlist.items.length
    const mode = playlistMode()
    let next = context.index + delta
    if (auto && mode === 'single') {
      next = context.index
    } else if (mode === 'shuffle' && delta > 0) {
      if (total <= 1) next = context.index
      else {
        let candidate = context.index
        while (candidate === context.index) candidate = Math.floor(Math.random() * total)
        next = candidate
      }
    } else if (mode === 'sequential' && delta > 0 && next >= total) {
      playerHub.publish({
        status: 'ended',
        token: '',
        playlist: { ...context, mode },
        error: '',
        startedAt: Date.now(),
      })
      return { ok: true, ended: true, message: '歌单播放结束' }
    } else if (mode === 'sequential' && delta < 0 && next < 0) {
      next = 0
    } else {
      next = ((next % total) + total) % total
    }
    try {
      const result = await playPlaylistIndex(playlist, next, store.getSettings().quality)
      return {
        ok: true,
        message: `正在播放：${result.resolved.item.name} — ${result.resolved.item.singer}（${result.index + 1}/${total}）`,
        playlist: { id: playlist.id, name: playlist.name, index: result.index, total },
      }
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      playerHub.publish({ status: 'error', token: '', playlist: { ...context, mode }, title: playlist.name, error: message, startedAt: Date.now() })
      return { ok: false, message: `播放失败：${message}` }
    }
  }

  async function handle(action, payload) {
    switch (action) {
      case 'state':
        return state()
      case 'logs':
        return { ok: true, logs: runtime ? runtime.logs.slice(-200) : [] }
      case 'player':
        return { ok: true, player: playerHub.current() }
      case 'play': {
        return { ok: true, ...(await playSong({
          query: payload.query,
          platform: payload.platform,
          quality: payload.quality,
        })) }
      }
      case 'playlists':
        return { ok: true, playlists: playlists.summaries() }
      case 'importPlaylist': {
        const data = String(payload.data || '')
        if (!data) throw new Error('缺少歌单数据')
        const buffer = Buffer.from(data, 'base64')
        if (buffer.length < 16 || buffer.length > 20 * 1024 * 1024) throw new Error('歌单文件大小异常')
        const playlist = playlists.add(buffer, payload.filename || '')
        return {
          ok: true,
          playlist: { id: playlist.id, name: playlist.name, source: playlist.source, count: playlist.count },
          playlists: playlists.summaries(),
        }
      }
      case 'deletePlaylist': {
        const playlist = playlists.remove(String(payload.id || ''))
        if (playerHub.state.playlist && playerHub.state.playlist.id === playlist.id) {
          playerHub.publish({ playlist: null })
        }
        return { ok: true, playlists: playlists.summaries() }
      }
      case 'playPlaylist':
        return { ok: true, ...(await playPlaylist(payload.id, payload.index || 0, payload.quality)) }
      case 'playlistNext':
        return { ok: true, ...(await playlistStep(1, payload.auto === true)) }
      case 'playlistPrev':
        return { ok: true, ...(await playlistStep(-1, false)) }
      case 'setPlayMode': {
        const mode = String(payload.mode || '')
        if (!['single', 'list', 'shuffle', 'sequential'].includes(mode)) throw new Error('未知播放模式')
        const settings = store.updateSettings({ playMode: mode })
        const context = playerHub.state.playlist
        if (context) playerHub.publish({ playlist: { ...context, mode } })
        return { ok: true, mode, settings }
      }
      case 'search': {
        const platform = String(payload.platform || '')
        requirePlatform(platform)
        await ensureRuntime()
        const data = await searchSongs(platform, payload.query, payload.page, payload.limit || store.getSettings().pageSize)
        return { ok: true, ...data }
      }
      case 'download': {
        const platform = String(payload.platform || '')
        const supported = requirePlatform(platform)
        const quality = qualityOf(platform, String(payload.quality || store.getSettings().quality))
        const song = payload.song && typeof payload.song === 'object' ? payload.song : null
        if (!song || !song.name) throw new Error('缺少歌曲信息')
        if (!supported.qualities.includes(quality)) {
          throw new Error(`音源不支持音质 ${quality}，可用：${supported.qualities.join(', ')}`)
        }
        await ensureRuntime()
        const musicInfo = song.musicInfo && typeof song.musicInfo === 'object'
          ? { ...song.musicInfo, source: platform }
          : {
            source: platform,
            songmid: song.songmid || '',
            hash: song.hash || '',
            name: song.name,
            singer: song.singer || '',
            albumName: song.albumName || '',
            ...(song.strMediaMid ? { strMediaMid: song.strMediaMid } : {}),
            ...(song.songId ? { songId: song.songId } : {}),
            ...(song.copyrightId ? { copyrightId: song.copyrightId } : {}),
          }
        const job = jobs.create({
          platform,
          quality,
          song: { name: song.name, singer: song.singer, songKey: song.key || '', musicInfo },
          settings: store.getSettings(),
          resolveUrl: (p, q, info) => {
            if (!runtime || !runtimeReady) return Promise.reject(new Error('音源尚未就绪'))
            return runtime.musicUrl(p, q, info.musicInfo)
          },
        })
        return { ok: true, job }
      }
      case 'job': {
        const job = jobs.get(String(payload.id || ''))
        if (!job) throw new Error('下载任务不存在')
        return { ok: true, job: jobs.public(job) }
      }
      case 'jobs':
        return { ok: true, jobs: jobs.list() }
      case 'cancelJob': {
        const job = jobs.get(String(payload.id || ''))
        if (job && job.state === 'running') {
          job.controller.abort(new Error('用户取消'))
          job.state = 'error'
          job.phase = 'error'
          job.error = '下载已取消'
          job.updatedAt = Date.now()
        }
        return { ok: true }
      }
      case 'activate': {
        const id = String(payload.id || '')
        const source = await switchSource(id)
        return {
          ok: true,
          active: { id: source.id, name: source.name },
          support: support(),
          providers: providers(),
        }
      }
      case 'import': {
        const script = String(payload.script || '')
        const entry = store.addCustom(script, payload.filename || '')
        const source = store.getSource(entry.id)
        let platforms = []
        let instance = null
        try {
          instance = await loadRuntime(source)
          platforms = instance.support().map((s) => s.platform)
        } catch (error) {
          store.removeCustom(entry.id)
          throw new Error(`音源校验失败，已撤销导入：${error && error.message ? error.message : String(error)}`)
        }
        // First import becomes the active source; later imports leave the
        // current selection alone and just join the library.
        const becomesActive = !store.getActiveId()
        if (becomesActive) {
          disposeRuntime()
          runtime = instance
          runtimeSourceId = entry.id
          runtimeReady = true
          runtimeError = ''
          store.setActive(entry.id)
        } else {
          instance.dispose()
        }
        return {
          ok: true,
          source: { ...entry, builtin: false, active: becomesActive, platforms },
          sources: store.listSources(),
          active: activeSource(),
          support: support(),
          providers: providers(),
        }
      }
      case 'delete': {
        const id = String(payload.id || '')
        if (id === runtimeSourceId) disposeRuntime()
        store.removeCustom(id)
        runtimeError = ''
        if (!store.getActive()) {
          disposeRuntime()
        } else {
          ensureRuntime().catch((error) => {
            runtimeError = error && error.message ? error.message : String(error)
          })
        }
        return { ok: true, sources: store.listSources(), active: activeSource(), support: support(), providers: providers() }
      }
      case 'settings': {
        const settings = store.updateSettings(payload.settings || payload.patch || {})
        return { ok: true, settings }
      }
      case 'testSource': {
        const id = String(payload.id || store.getActiveId())
        const source = store.getSource(id)
        if (!source) throw new Error('音源不存在')
        const instance = await loadRuntime(source)
        const result = { ok: true, support: instance.support(), ms: Date.now() - instance.startedAt }
        instance.dispose()
        return result
      }
      case 'reload': {
        if (!store.getActive()) throw new Error('还没有音源，请先导入')
        disposeRuntime()
        await ensureRuntime()
        return { ok: true, support: support(), providers: providers() }
      }
      default:
        throw new Error(`未知操作：${action}`)
    }
  }

  const webServer = ctx.get('webServer')
  if (!webServer) {
    log('Web server is unavailable; the settings panel cannot reach the plugin')
    return
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/lx-geteer-api',
    async handler(req, res) {
      if (!isTrustedRequest(req)) {
        sendJson(res, 403, { ok: false, error: '仅允许同源页面访问' })
        return
      }
      try {
        if (req.method === 'GET') {
          const url = new URL(req.url || '/', 'http://localhost')
          const action = url.searchParams.get('op') || 'state'
          const payload = Object.fromEntries(url.searchParams.entries())
          sendJson(res, 200, await handle(action, payload))
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: '只支持 GET/POST' })
          return
        }
        const payload = await readJsonBody(req)
        const action = String(payload.op || '')
        if (!action) throw new Error('缺少 op')
        sendJson(res, 200, await handle(action, payload))
      } catch (error) {
        const message = error && error.message ? error.message : String(error)
        sendJson(res, 400, { ok: false, error: message })
      }
    },
  }), 'dsh-lx-geteer: /lx-geteer-api')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/lx-geteer-stream',
    async handler(req, res) {
      if (!isTrustedRequest(req)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('仅允许同源页面访问')
        return
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        res.end()
        return
      }
      try {
        const url = new URL(req.url || '/', 'http://localhost')
        await playerHub.stream(url.searchParams.get('id'), req, res)
      } catch (error) {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(`音频代理失败：${error && error.message ? error.message : String(error)}`)
      }
    },
  }), 'dsh-lx-geteer: /lx-geteer-stream')

  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    ctx.effect(() => systemPrompt.section({
      name: 'lx-geteer-playback',
      order: 55,
      text: '音乐播放：当用户表达“想听某首歌 / 放首歌 / 来一首 / 播放某首歌”时，直接调用 play_music 工具，把歌名和歌手放进 query（例如“周杰伦 晴天”），不要把整句“想听…”当普通聊天。' +
        '播放器会自动在右侧打开。音质与音源默认跟随输入框下方的按钮（音质默认 320K，音源默认网易云），不要反复询问用户；只有用户明确指定平台或音质时才传 platform/quality。' +
        '成功后用一句话确认正在播放；失败时简短说明原因，并建议换音源或音质，不要编造播放成功。',
    }), 'dsh-lx-geteer: playback prompt')
  }

  const tools = ctx.get('tools')
  if (tools && typeof tools.register === 'function') {
    const playTool = defineTool({
      name: 'play_music',
      description: '当用户表达“想听歌 / 放首歌 / 来一首 / 播放某首歌”时调用：搜索歌曲，用当前 LX 音源解析播放链接，并让 Harness 右侧播放器自动打开播放。' +
        '用户只是讨论音乐、问歌词、要推荐歌单时不要调用。' +
        'query 传歌名和歌手（例如“周杰伦 晴天”），不要传“想听”“播放”等指令词。' +
        '默认使用输入框下方音质按钮和音源按钮当前的选择（音质默认 320k，音源默认网易云）；用户明确指定平台/音质时才传 platform/quality。' +
        '成功返回“正在播放…”，失败返回原因，可以换平台或音源后重试。',
      parameters: {
        query: { type: 'string', description: '歌曲名 + 歌手，例如“周杰伦 晴天”“告五人 爱人错过”' },
        platform: { type: 'string', description: '可选。用户明确指定平台时传：kw 酷我 / tx QQ音乐 / wy 网易云 / kg 酷狗 / mg 咪咕' },
        quality: { type: 'string', description: '可选。用户明确指定音质时传：128k / 320k / flac / flac24bit；默认跟随音质按钮' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: value && value.message ? value.message : '播放器已更新' }],
      },
      async execute(args) {
        const platform = ['kw', 'tx', 'wy', 'kg', 'mg'].includes(args.platform) ? args.platform : ''
        const quality = ['128k', '320k', 'flac', 'flac24bit'].includes(args.quality) ? args.quality : ''
        try {
          return await playSong({ query: args.query, platform, quality })
        } catch (error) {
          return { ok: false, message: `播放失败：${error && error.message ? error.message : String(error)}` }
        }
      },
    })
    ctx.effect(() => tools.register(playTool), 'dsh-lx-geteer: play_music tool')
    log('play_music tool registered')
  } else {
    log('tools service is unavailable; play_music is not registered')
  }

  ctx.effect(() => () => {
    disposeRuntime()
    jobs.cleanup()
  }, 'dsh-lx-geteer: dispose runtime')

  // Warm the selected source in the background so the first search is fast.
  // A fresh install has no source at all; the panel then guides the user to
  // import one instead of reporting a failed initialization.
  if (store.getActive()) {
    ensureRuntime().catch((error) => {
      runtimeError = error && error.message ? error.message : String(error)
      console.error('[lx-geteer] active source failed to initialize:', runtimeError)
    })
  } else {
    runtimeError = ''
    log('no source imported yet')
  }

  const data = store.stat()
  log(`ready v${VERSION}; customSources=${data.customCount}; data=${data.root}; active=${store.getActiveId() || '-'}`)
}
