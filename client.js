/**
 * dsh-lx-geteer — Client half.
 *
 * Registers one Settings section that searches the five platforms built into
 * the Host half, resolves a playable URL through the selected LX Music custom
 * source, and downloads the audio into the configured directory.
 */
window.__ModuleLoader__.load({
  id: 'dsh-lx-geteer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /* ------------------------------------------------------------------ *
     * API base (works behind a reverse-proxy sub-path)
     * ------------------------------------------------------------------ */
    const detectAppBase = (doc, href) => {
      const strip = (p) => String(p || '').replace(/\/+$/, '')
      const fromPath = (p) => {
        const m = /^(.*?)\/plugins\//.exec(String(p || ''))
        return m ? strip(m[1]) : null
      }
      if (!doc) return ''
      try {
        const src = doc.currentScript && doc.currentScript.src
        if (src) {
          const base = fromPath(new URL(src, doc.baseURI || href).pathname)
          if (base !== null) return base
        }
      } catch { /* not a browser script context */ }
      try {
        for (const el of doc.querySelectorAll('script[src]')) {
          const base = fromPath(new URL(el.src, doc.baseURI || href).pathname)
          if (base !== null) return base
        }
      } catch { /* minimal DOM */ }
      try {
        const path = new URL(doc.baseURI).pathname
        if (path.endsWith('/')) return strip(path)
      } catch { /* no baseURI */ }
      return ''
    }
    const APP_BASE = detectAppBase(
      typeof document === 'undefined' ? null : document,
      typeof location === 'undefined' ? '' : location.href,
    )
    const absAppPath = (value) => {
      const s = String(value == null ? '' : value)
      if (!s || s[0] !== '/' || s[1] === '/') return s
      if (!APP_BASE || s === APP_BASE || s.indexOf(`${APP_BASE}/`) === 0) return s
      return `${APP_BASE}${s}`
    }

    const API = '/lx-geteer-api'
    async function api(op, payload) {
      if (op === 'state' || op === 'jobs' || op === 'logs' || op === 'job') {
        const qs = new URLSearchParams({ op })
        if (payload && payload.id) qs.set('id', payload.id)
        const res = await fetch(`${absAppPath(API)}?${qs.toString()}`, { cache: 'no-store' })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || '请求失败')
        return data
      }
      const res = await fetch(absAppPath(API), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, ...(payload || {}) }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.message || data.error || '请求失败')
      return data
    }

    /* ------------------------------------------------------------------ *
     * Locale dictionaries
     * ------------------------------------------------------------------ */
    const ZH = {
      'nav.label': 'LX 音源抓取',
      'app.title': 'LX 音源抓取',
      'app.subtitle': '导入你信任的 LX Music 自定义音源，在 Harness 里搜索并下载歌曲。',
      'app.active': '当前音源：{name}',
      'app.noActive': '尚未导入音源',
      'app.reload': '刷新',
      'app.version': 'v{version}',
      'tabs.search': '搜索下载',
      'tabs.sources': '音源与设置',
      'search.placeholder': '搜索歌曲、歌手或专辑',
      'search.button': '搜索',
      'search.searching': '搜索中…',
      'search.empty': '输入关键词开始搜索',
      'search.noResult': '没有找到结果，换个关键词试试',
      'search.error': '搜索失败：{error}',
      'search.total': '共 {total} 首',
      'search.page': '第 {page} / {pages} 页',
      'search.prev': '上一页',
      'search.next': '下一页',
      'search.platform': '平台',
      'search.quality': '音质',
      'search.noPlatforms': '当前音源没有插件可搜索的平台，请在「音源与设置」里换一个音源。',
      'search.needImport': '还没有可用的音源。请先在「音源与设置」里导入一个 LX 自定义源。',
      'search.hint': '搜索由插件内置的平台接口完成；播放链接由所选 LX 音源解析。',
      'search.needSource': '音源初始化失败，暂时不能搜索。',
      'song.download': '下载',
      'song.downloading': '下载中',
      'song.resolving': '解析链接…',
      'song.done': '已保存',
      'song.failed': '失败',
      'song.cancel': '取消',
      'song.retry': '重试',
      'song.queued': '排队中',
      'song.size': '{size}',
      'song.qualityTag': '{quality}',
      'song.noPreview': '无封面',
      'source.activeTitle': '当前音源',
      'source.noActive': '还没有导入音源',
      'source.ready': '已就绪',
      'source.notReady': '未就绪',
      'source.platforms': '支持平台',
      'source.reload': '重新加载',
      'source.test': '检测',
      'source.logs': '运行日志',
      'source.hideLogs': '收起日志',
      'source.import': '导入音源',
      'source.importTitle': '导入 LX Music 自定义源',
      'source.importHint': '插件不附带音源。选择 .js 文件或粘贴脚本；导入时会实际初始化一次，失败会自动撤销。',
      'source.chooseFile': '选择 .js 文件',
      'source.paste': '粘贴脚本内容…',
      'source.importButton': '导入并校验',
      'source.importing': '校验中…',
      'source.imported': '已导入：{name}（支持 {platforms}）',
      'source.filter': '筛选音源',
      'source.allCategories': '全部分类',
      'source.categoryCustom': '导入',
      'source.empty': '没有匹配的音源',
      'source.emptyLibrary': '还没有导入任何音源。点上方「导入音源」添加你信任的 .js 脚本。',
      'source.importFirst': '导入音源',
      'source.activate': '使用',
      'source.active': '使用中',
      'source.delete': '删除',
      'source.confirmDelete': '确定删除音源「{name}」？',
      'source.builtin': '内置',
      'source.custom': '导入',
      'source.count': '共 {count} 个音源',
      'source.version': '版本 {version}',
      'source.author': '作者 {author}',
      'source.size': '{size}',
      'source.qualityCount': '{n} 种音质',
      'source.more': '展开',
      'source.less': '收起',
      'source.deleteOk': '已删除音源',
      'settings.title': '下载设置',
      'settings.downloadDir': '下载目录',
      'settings.downloadDirHint': '保存在本机「下载」文件夹下的 lx-geteer（Windows 默认 C:\\Users\\<你>\\Downloads\\lx-geteer）',
      'settings.defaultQuality': '默认音质',
      'settings.pageSize': '每页结果',
      'settings.timeout': '解析超时（秒）',
      'settings.save': '保存设置',
      'settings.saved': '设置已保存',
      'settings.dataDir': '数据与导入音源保存在：{dir}',
      'runtime.title': '音源状态',
      'runtime.ready': '运行中',
      'runtime.starting': '初始化中…',
      'runtime.failed': '初始化失败：{error}',
      'runtime.retry': '重试',
      'runtime.none': '没有已激活的音源',
      'common.close': '关闭',
      'common.cancel': '取消',
      'common.confirm': '确定',
      'common.refresh': '刷新',
      'common.error': '出错了：{error}',
      'common.loading': '加载中…',
      'common.note': '提示：自定义音源是第三方脚本，会在本机执行并访问网络。请只导入你信任的来源。',
      'common.src': '来源',
      'quality.title': '默认音质',
      'platform.title': '默认音源',
      'platform.hint': '点击切换默认音源（默认网易云）',
      'music.title': '音乐',
      'music.tabTitle': 'LX 音乐',
      'music.guide': '搜索歌曲、播放 .lxmc 歌单',
      'music.play': '播放',
      'music.results': '搜索结果',
      'music.openPlayer': '打开播放器',
      'music.idle': '暂无播放',
      'music.playError': '播放失败',
      'playlist.title': '歌单库',
      'playlist.import': '导入 .lxmc 歌单',
      'playlist.importing': '导入中…',
      'playlist.hint': '歌单会用文件内标注的音源播放；.lxmc 是 LX Music 的歌单文件。',
      'playlist.empty': '还没有导入歌单。',
      'playlist.count': '{count} 首',
      'playlist.play': '播放',
      'playlist.playing': '正在播放歌单…',
      'playlist.delete': '删除',
      'playlist.confirmDelete': '确认删除',
      'playlist.imported': '已导入歌单：{name}（{count} 首）',
      'playlist.deleted': '歌单已删除',
      'playlist.source': '源：{source}',
      'playlist.error': '歌单导入失败：{error}',
      'playlist.needSource': '当前音源不支持歌单指定的平台，请先切换音源。',
      'mode.title': '播放方式',
      'mode.single': '单曲循环',
      'mode.list': '列表循环',
      'mode.shuffle': '随机播放',
      'mode.sequential': '顺序播放',
      'mode.changed': '播放方式：{mode}',
      'player.playlistLine': '{name} · {index}/{total}',
      'player.skipped': '已跳过 {count} 首解析失败：{names}',
      'player.prev': '上一首',
      'player.next': '下一首',
      'player.ended': '歌单播放结束',
      'player.replay': '从头播放',
      'player.mode': '{mode}',
      'quality.hint': '点击切换默认音质',
      'player.tabTitle': '正在播放',
      'player.title': '正在播放',
      'player.empty': '在对话框里说：想听周杰伦的晴天',
      'player.emptyHint': '歌曲会由当前 LX 音源解析，并在这里自动播放。',
      'player.unknownArtist': '未知歌手',
      'player.retry': '重新获取',
      'player.retrying': '重新获取中…',
      'player.tapToPlay': '浏览器拦截了自动播放，点此播放',
      'player.error': '播放失败：{error}',
      'player.expired': '链接可能已过期，点「重新获取」再试。',
      'player.needSource': '还没有导入音源，请先在设置页导入一个 LX 自定义源。',
      'player.loading': '正在解析…',
      'player.qualityChip': '音质 {quality}',
      'player.platformChip': '{platform}',
      'player.openSettings': '去设置页换音源',
      'player.unavailable': '播放器打不开：当前窗口没有侧栏服务（sidebarRight），请刷新界面后重试。',
      'player.openFailed': '播放器打不开：{error}',
    }
    const EN = {
      'nav.label': 'LX source getter',
      'app.title': 'LX source getter',
      'app.subtitle': 'Import your own LX Music custom sources, then search and download songs inside Harness.',
      'app.active': 'Active source: {name}',
      'app.noActive': 'No source imported yet',
      'app.reload': 'Refresh',
      'app.version': 'v{version}',
      'tabs.search': 'Search & download',
      'tabs.sources': 'Sources & settings',
      'search.placeholder': 'Search songs, artists, or albums',
      'search.button': 'Search',
      'search.searching': 'Searching…',
      'search.empty': 'Type a keyword to start searching',
      'search.noResult': 'No results. Try another keyword.',
      'search.error': 'Search failed: {error}',
      'search.total': '{total} songs',
      'search.page': 'Page {page} / {pages}',
      'search.prev': 'Previous',
      'search.next': 'Next',
      'search.platform': 'Platform',
      'search.quality': 'Quality',
      'search.noPlatforms': 'The active source has no searchable platform. Pick another source under "Sources & settings".',
      'search.needImport': 'No source available. Import an LX custom source under "Sources & settings" first.',
      'search.hint': 'Search uses the plugin built-in platform APIs; playable URLs come from the selected LX source.',
      'search.needSource': 'The source failed to initialize, so search is unavailable.',
      'song.download': 'Download',
      'song.downloading': 'Downloading',
      'song.resolving': 'Resolving…',
      'song.done': 'Saved',
      'song.failed': 'Failed',
      'song.cancel': 'Cancel',
      'song.retry': 'Retry',
      'song.queued': 'Queued',
      'song.size': '{size}',
      'song.qualityTag': '{quality}',
      'song.noPreview': 'No cover',
      'source.activeTitle': 'Active source',
      'source.noActive': 'No source imported',
      'source.ready': 'Ready',
      'source.notReady': 'Not ready',
      'source.platforms': 'Platforms',
      'source.reload': 'Reload',
      'source.test': 'Test',
      'source.logs': 'Runtime logs',
      'source.hideLogs': 'Hide logs',
      'source.import': 'Import source',
      'source.importTitle': 'Import an LX Music custom source',
      'source.importHint': 'No sources are bundled. Choose a .js file or paste the script; import initializes it once and rolls back on failure.',
      'source.chooseFile': 'Choose .js file',
      'source.paste': 'Paste script content…',
      'source.importButton': 'Import & validate',
      'source.importing': 'Validating…',
      'source.imported': 'Imported: {name} (supports {platforms})',
      'source.filter': 'Filter sources',
      'source.allCategories': 'All categories',
      'source.categoryCustom': 'Imported',
      'source.empty': 'No matching source',
      'source.emptyLibrary': 'No sources imported yet. Use "Import source" above to add a .js script you trust.',
      'source.importFirst': 'Import source',
      'source.activate': 'Use',
      'source.active': 'Active',
      'source.delete': 'Delete',
      'source.confirmDelete': 'Delete source "{name}"?',
      'source.builtin': 'Bundled',
      'source.custom': 'Imported',
      'source.count': '{count} sources',
      'source.version': 'Version {version}',
      'source.author': 'By {author}',
      'source.size': '{size}',
      'source.qualityCount': '{n} qualities',
      'source.more': 'Show more',
      'source.less': 'Show less',
      'source.deleteOk': 'Source deleted',
      'settings.title': 'Download settings',
      'settings.downloadDir': 'Download directory',
      'settings.downloadDirHint': 'Written to the lx-geteer folder inside your Downloads directory (Windows: C:\\Users\\<you>\\Downloads\\lx-geteer)',
      'settings.defaultQuality': 'Default quality',
      'settings.pageSize': 'Results per page',
      'settings.timeout': 'Resolve timeout (s)',
      'settings.save': 'Save settings',
      'settings.saved': 'Settings saved',
      'settings.dataDir': 'State and imported sources live in: {dir}',
      'runtime.title': 'Source status',
      'runtime.ready': 'Running',
      'runtime.starting': 'Initializing…',
      'runtime.failed': 'Initialization failed: {error}',
      'runtime.retry': 'Retry',
      'runtime.none': 'No active source',
      'common.close': 'Close',
      'common.cancel': 'Cancel',
      'common.confirm': 'Confirm',
      'common.refresh': 'Refresh',
      'common.error': 'Error: {error}',
      'common.loading': 'Loading…',
      'common.note': 'Note: custom sources are third-party scripts that run locally and access the network. Only import sources you trust.',
      'common.src': 'Source',
      'quality.title': 'Default quality',
      'platform.title': 'Default source',
      'platform.hint': 'Click to change the default source (NetEase by default)',
      'music.title': 'Music',
      'music.tabTitle': 'LX Music',
      'music.guide': 'Search songs and play .lxmc playlists',
      'music.play': 'Play',
      'music.results': 'Results',
      'music.openPlayer': 'Open player',
      'music.idle': 'Nothing playing',
      'music.playError': 'Playback failed',
      'playlist.title': 'Playlists',
      'playlist.import': 'Import .lxmc playlist',
      'playlist.importing': 'Importing…',
      'playlist.hint': 'The playlist plays through the source written in the file; .lxmc is an LX Music playlist.',
      'playlist.empty': 'No playlist imported yet.',
      'playlist.count': '{count} songs',
      'playlist.play': 'Play',
      'playlist.playing': 'Starting playlist…',
      'playlist.delete': 'Delete',
      'playlist.confirmDelete': 'Confirm delete',
      'playlist.imported': 'Imported playlist: {name} ({count} songs)',
      'playlist.deleted': 'Playlist deleted',
      'playlist.source': 'Source: {source}',
      'playlist.error': 'Playlist import failed: {error}',
      'playlist.needSource': 'The active source does not support the playlist source. Switch sources first.',
      'mode.title': 'Play mode',
      'mode.single': 'Repeat one',
      'mode.list': 'Repeat all',
      'mode.shuffle': 'Shuffle',
      'mode.sequential': 'Sequential',
      'mode.changed': 'Play mode: {mode}',
      'player.playlistLine': '{name} · {index}/{total}',
      'player.skipped': 'Skipped {count} unresolved track(s): {names}',
      'player.prev': 'Previous',
      'player.next': 'Next',
      'player.ended': 'Playlist finished',
      'player.replay': 'Play from start',
      'player.mode': '{mode}',
      'quality.hint': 'Click to change the default quality',
      'player.tabTitle': 'Now playing',
      'player.title': 'Now playing',
      'player.empty': 'Tell the chat: play Jay Chou — Qing Tian',
      'player.emptyHint': 'The song is resolved by the active LX source and plays here automatically.',
      'player.unknownArtist': 'Unknown artist',
      'player.retry': 'Reload stream',
      'player.retrying': 'Reloading…',
      'player.tapToPlay': 'Autoplay was blocked — tap to play',
      'player.error': 'Playback failed: {error}',
      'player.expired': 'The URL may have expired. Tap "Reload stream" to retry.',
      'player.needSource': 'No source imported. Import an LX custom source in Settings first.',
      'player.loading': 'Resolving…',
      'player.qualityChip': 'Quality {quality}',
      'player.platformChip': '{platform}',
      'player.openSettings': 'Change source in settings',
      'player.unavailable': 'The player cannot open: this window has no right-column service (sidebarRight). Refresh the interface and retry.',
      'player.openFailed': 'The player cannot open: {error}',
    }

    const KNOWN_QUALITIES = ['128k', '192k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master', '24bit']
    const QUALITY_PREFERENCE = ['320k', 'flac', '128k', '192k', 'flac24bit', 'hires', 'atmos', 'master', '24bit']
    const PLATFORM_ORDER = ['kw', 'tx', 'wy', 'kg', 'mg', 'qs', 'sd', 'joox', 'bili', 'ytb', 'xm', 'local']
    const PLATFORM_LABELS = {
      kw: '酷我音乐',
      tx: 'QQ 音乐',
      wy: '网易云音乐',
      kg: '酷狗音乐',
      mg: '咪咕音乐',
      qs: '汽水音乐',
      sd: '汽水音乐',
      joox: 'JOOX',
      bili: '哔哩哔哩',
      ytb: 'YouTube',
      xm: '喜马拉雅',
      local: '本地音乐',
    }

    const fmtSize = (bytes) => {
      const n = Number(bytes)
      if (!Number.isFinite(n) || n <= 0) return ''
      if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`
      if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
      return `${n} B`
    }
    function bufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

    const pickQuality = (qualities, wanted) => {
      if (wanted && qualities.includes(wanted)) return wanted
      return QUALITY_PREFERENCE.find((q) => qualities.includes(q)) || qualities[0] || ''
    }
    const platformLabel = (key, name) => PLATFORM_LABELS[key] || name || key

    function Icon({ name, size = 16 }) {
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }
      if (name === 'search') return h('svg', common, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'm20 20-3.2-3.2' }))
      if (name === 'download') return h('svg', common, h('path', { d: 'M12 3v12' }), h('path', { d: 'm7 10 5 5 5-5' }), h('path', { d: 'M4 21h16' }))
      if (name === 'check') return h('svg', common, h('path', { d: 'm4 12 5 5L20 6' }))
      if (name === 'note') return h('svg', common, h('path', { d: 'M9 18V6l10-2v12' }), h('circle', { cx: 6, cy: 18, r: 3 }), h('circle', { cx: 16, cy: 16, r: 3 }))
      if (name === 'refresh') return h('svg', common, h('path', { d: 'M20 11a8 8 0 1 0-2.3 5.7' }), h('path', { d: 'M20 4v7h-7' }))
      if (name === 'plus') return h('svg', common, h('path', { d: 'M12 5v14M5 12h14' }))
      if (name === 'trash') return h('svg', common, h('path', { d: 'M4 7h16' }), h('path', { d: 'M9 7V4h6v3' }), h('path', { d: 'M6 7l1 13h10l1-13' }))
      if (name === 'chevron') return h('svg', common, h('path', { d: 'm9 6 6 6-6 6' }))
      if (name === 'close') return h('svg', common, h('path', { d: 'M6 6l12 12M18 6 6 18' }))
      return h('svg', common, h('circle', { cx: 12, cy: 12, r: 9 }))
    }

    function Logo() {
      return h('svg', {
        width: 34,
        height: 34,
        viewBox: '0 0 48 48',
        'aria-hidden': true,
        style: { flex: '0 0 auto' },
      },
        h('rect', { x: 4, y: 8, width: 40, height: 32, rx: 10, fill: 'var(--dsw-alias-brand-primary)', opacity: 0.16 }),
        h('path', { d: 'M16 31V17l13-2v13', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('circle', { cx: 13, cy: 31, r: 4, fill: 'var(--dsw-alias-brand-primary)' }),
        h('circle', { cx: 26, cy: 28, r: 4, fill: 'var(--dsw-alias-brand-primary)' }),
        h('path', { d: 'M33 13h6M36 10v6', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2, strokeLinecap: 'round' }),
      )
    }

    /* ------------------------------------------------------------------ *
     * Playback: shared store, composer quality pill, right-sidebar player
     * ------------------------------------------------------------------ */
    const PLAYER_KIND = 'lx-geteer/player'
    /** Right-sidebar tab for the music hub (search + playlists). */
    const MUSIC_KIND = 'lx-geteer/music'
    /** Left-rail panellist entry; the same id keys its `main` panel. */
    const MUSIC_PANEL_ID = 'lx-geteer'
    /**
     * Resolve the right-column navigation service. Built-in plugins read it as
     * `ctx.sidebarRight`; `get` keeps older runtimes working. Returns undefined
     * when the window has no right column at all (no silent optional chaining
     * at the call sites, so a missing service can be reported to the user).
     */
    function resolveSidebarRight(ctx) {
      if (!ctx) return undefined
      if (ctx.sidebarRight && typeof ctx.sidebarRight.openTab === 'function') return ctx.sidebarRight
      if (typeof ctx.get === 'function') {
        try {
          const service = ctx.get('sidebarRight')
          if (service && typeof service.openTab === 'function') return service
        } catch { /* service not in this scope */ }
      }
      return undefined
    }
    const BASE_QUALITIES = ['128k', '320k', 'flac', 'flac24bit']
    const PLAY_MODES = ['single', 'list', 'shuffle', 'sequential']
    const PLATFORM_OPTIONS = [
      ['wy', '网易云'],
      ['tx', 'QQ'],
      ['kw', '酷我'],
      ['kg', '酷狗'],
      ['mg', '咪咕'],
    ]
    const QUALITY_LABELS = {
      '128k': '128K',
      '192k': '192K',
      '320k': '320K',
      flac: 'FLAC',
      flac24bit: '24BIT',
      '24bit': '24BIT',
      hires: 'HIRES',
      master: 'MASTER',
      atmos: 'ATMOS',
      'atmos_plus': 'ATMOS+',
      spatial: 'SPATIAL',
    }

    function createPlayerStore() {
      let state = { status: 'idle', revision: 0 }
      const listeners = new Set()
      return {
        get: () => state,
        set(next) {
          state = next || state
          for (const listener of listeners) listener(state)
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    }
    const playerStore = createPlayerStore()

    function translate(locale, key, vars) {
      let text = ''
      try {
        const fn = locale && typeof locale.bind === 'function' ? locale.bind('lx-geteer') : null
        text = fn ? fn(key) : ''
      } catch { /* dictionary not ready */ }
      if (!text || text === key) text = ZH[key] || EN[key] || key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value))
      }
      return text
    }

    function usePlayerStore(store) {
      const [state, setState] = React.useState(store.get())
      React.useEffect(() => store.subscribe(setState), [store])
      return state
    }

    function QualityButton({ ctx }) {
      const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const [, forceLocale] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => forceLocale((x) => x + 1))
      }, [locale])
      const t = (key, vars) => translate(locale, key, vars)
      const [quality, setQuality] = React.useState('320k')
      const [options, setOptions] = React.useState(BASE_QUALITIES)
      const refresh = React.useCallback(async () => {
        try {
          const data = await api('state')
          const nextQuality = (data.settings && data.settings.quality) || '320k'
          const list = [...BASE_QUALITIES]
          for (const entry of data.support || []) {
            for (const q of entry.qualities || []) {
              if (typeof q === 'string' && q && !list.includes(q)) list.push(q)
            }
          }
          if (nextQuality && !list.includes(nextQuality)) list.push(nextQuality)
          list.sort((a, b) => {
            const ai = QUALITY_PREFERENCE.indexOf(a)
            const bi = QUALITY_PREFERENCE.indexOf(b)
            return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
          })
          setOptions(list)
          setQuality(nextQuality)
        } catch { /* keep the last known quality */ }
      }, [])
      React.useEffect(() => {
        refresh()
        const id = setInterval(refresh, 15_000)
        return () => clearInterval(id)
      }, [refresh])
      const change = async (event) => {
        const next = event.target.value
        setQuality(next)
        try {
          await api('settings', { settings: { quality: next } })
        } catch { /* selection still applies to the next tool call */ }
      }
      return h('label', { className: 'lxgq', title: t('quality.hint') },
        h('style', null, `
          .lxgq { display:inline-flex; align-items:center; gap:4px; height:26px; padding:0 7px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; background:transparent; color:var(--dsw-alias-label-secondary); font-size:11.5px; cursor:pointer; }
          .lxgq:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
          .lxgq select { appearance:none; border:0; outline:0; background:transparent; color:inherit; font:inherit; font-size:11.5px; cursor:pointer; padding:0 1px; }
          .lxgq select option { background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary); }
        `),
        h(Icon, { name: 'note', size: 13 }),
        h('select', {
          className: 'lxgq-select',
          value: quality,
          onChange: change,
          'aria-label': t('quality.title'),
          title: t('quality.hint'),
        }, options.map((q) => h('option', { key: q, value: q }, QUALITY_LABELS[q] || q.toUpperCase()))),
      )
    }

    function PlatformButton({ ctx }) {
      const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const [, forceLocale] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => forceLocale((x) => x + 1))
      }, [locale])
      const t = (key, vars) => translate(locale, key, vars)
      const [platform, setPlatform] = React.useState('wy')
      const refresh = React.useCallback(async () => {
        try {
          const data = await api('state')
          const next = (data.settings && data.settings.platform) || 'wy'
          setPlatform(PLATFORM_OPTIONS.some(([key]) => key === next) ? next : 'wy')
        } catch { /* keep the last selection */ }
      }, [])
      React.useEffect(() => {
        refresh()
        const id = setInterval(refresh, 15_000)
        return () => clearInterval(id)
      }, [refresh])
      const change = async (event) => {
        const next = event.target.value
        setPlatform(next)
        try {
          await api('settings', { settings: { platform: next } })
        } catch { /* still applies to the next tool call */ }
      }
      return h('label', { className: 'lxgq', title: t('platform.hint') },
        h('style', null, `
          .lxgq { display:inline-flex; align-items:center; gap:4px; height:26px; padding:0 7px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; background:transparent; color:var(--dsw-alias-label-secondary); font-size:11.5px; cursor:pointer; }
          .lxgq:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
          .lxgq select { appearance:none; border:0; outline:0; background:transparent; color:inherit; font:inherit; font-size:11.5px; cursor:pointer; padding:0 1px; }
          .lxgq select option { background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary); }
        `),
        h('select', {
          className: 'lxgq-select',
          value: platform,
          onChange: change,
          'aria-label': t('platform.title'),
          title: t('platform.hint'),
        }, PLATFORM_OPTIONS.map(([key, label]) => h('option', { key, value: key }, label))),
      )
    }

    function PlayerTitle({ ctx }) {
      const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const player = usePlayerStore(playerStore)
      const t = (key, vars) => translate(locale, key, vars)
      const text = player && player.title
        ? `${player.title}${player.singer ? ` · ${player.singer}` : ''}`
        : t('player.tabTitle')
      return h('span', { className: 'lxgp-tab-title' }, text)
    }

    function PlayerTab({ ctx }) {
      const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const [, forceLocale] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => forceLocale((x) => x + 1))
      }, [locale])
      const t = (key, vars) => translate(locale, key, vars)
      const player = usePlayerStore(playerStore)
      const audioRef = React.useRef(null)
      const [blocked, setBlocked] = React.useState(false)
      const [mediaError, setMediaError] = React.useState('')
      const [retrying, setRetrying] = React.useState(false)
      const token = player && player.token ? player.token : ''
      const src = token ? absAppPath(`/lx-geteer-stream?id=${encodeURIComponent(token)}`) : ''

      React.useEffect(() => {
        setBlocked(false)
        setMediaError('')
        const audio = audioRef.current
        if (!audio || !src) return undefined
        try { audio.load() } catch { /* source will load on play */ }
        const attempt = audio.play()
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => setBlocked(true))
        return undefined
      }, [src])

      React.useEffect(() => {
        try {
          if (!player || !player.title || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return
          navigator.mediaSession.metadata = new MediaMetadata({
            title: player.title,
            artist: player.singer || '',
            album: player.album || '',
            artwork: player.cover ? [{ src: player.cover }] : [],
          })
        } catch { /* Media Session is optional */ }
      }, [player && player.title, player && player.singer, player && player.album, player && player.cover])

      const retry = async () => {
        if (!player || retrying) return
        setRetrying(true)
        setMediaError('')
        try {
          const result = player.playlist
            ? await api('playPlaylist', { id: player.playlist.id, index: player.playlist.index, quality: player.quality })
            : await api('play', { query: player.query, platform: player.platform, quality: player.quality })
          if (!result.ok) setMediaError(result.message || '重新获取失败')
        } catch (error) {
          setMediaError(error.message)
        } finally {
          setRetrying(false)
        }
      }

      const stepPlaylist = async (direction) => {
        if (!player || !player.playlist || retrying) return
        setRetrying(true)
        setMediaError('')
        try {
          const result = await api(direction > 0 ? 'playlistNext' : 'playlistPrev')
          if (!result.ok) setMediaError(result.message || '切换歌曲失败')
        } catch (error) {
          setMediaError(error.message)
        } finally {
          setRetrying(false)
        }
      }

      const cycleMode = async () => {
        if (!player || !player.playlist || retrying) return
        const current = player.playlist.mode || 'list'
        const index = PLAY_MODES.indexOf(current)
        const next = PLAY_MODES[(index + 1) % PLAY_MODES.length]
        try {
          await api('setPlayMode', { mode: next })
        } catch (error) {
          setMediaError(error.message)
        }
      }

      const replayPlaylist = async () => {
        if (!player || !player.playlist || retrying) return
        setRetrying(true)
        setMediaError('')
        try {
          const result = await api('playPlaylist', { id: player.playlist.id, index: 0 })
          if (!result.ok) setMediaError(result.message || '重新播放失败')
        } catch (error) {
          setMediaError(error.message)
        } finally {
          setRetrying(false)
        }
      }

      const playNow = () => {
        const audio = audioRef.current
        if (!audio) return
        audio.play().then(() => setBlocked(false)).catch((error) => setMediaError(error.message || '播放失败'))
      }

      const css = h('style', null, `
        .lxgp { display:flex; flex-direction:column; gap:12px; padding:14px 14px 20px; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; box-sizing:border-box; }
        .lxgp * { box-sizing:border-box; }
        .lxgp-cover { width:100%; aspect-ratio:1/1; max-height:280px; border-radius:14px; overflow:hidden; background:var(--dsw-alias-bg-layer-2); display:flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-secondary); }
        .lxgp-cover img { width:100%; height:100%; object-fit:cover; display:block; }
        .lxgp-title { font-size:17px; font-weight:650; line-height:1.35; word-break:break-word; }
        .lxgp-sub { color:var(--dsw-alias-label-secondary); font-size:12px; margin-top:-6px; }
        .lxgp-chips { display:flex; gap:6px; flex-wrap:wrap; }
        .lxgp-chip { font-size:10.5px; padding:2px 7px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
        .lxgp audio { width:100%; display:block; }
        .lxgp-note { font-size:11px; color:var(--dsw-alias-label-secondary); }
        .lxgp-skip { color:var(--dsw-alias-state-warn-primary, #d9a441); }
        .lxgp-error { font-size:11.5px; color:var(--dsw-alias-state-error-primary); background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); border-radius:8px; padding:7px 9px; }
        .lxgp-btn { appearance:none; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); border-radius:8px; height:32px; padding:0 12px; font:inherit; font-size:12px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
        .lxgp-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2); }
        .lxgp-btn:disabled { opacity:.5; cursor:not-allowed; }
        .lxgp-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
        .lxgp-controls { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
        .lxgp-mode { border-radius:999px; }
        .lxgp-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:36px 16px; color:var(--dsw-alias-label-secondary); }
        .lxgp-empty strong { color:var(--dsw-alias-label-primary); font-size:13.5px; font-weight:600; }
        .lxgp-tab-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; display:inline-block; vertical-align:bottom; }
      `)

      if (!player || player.status === 'idle') {
        return h('div', { className: 'lxgp' }, css,
          h('div', { className: 'lxgp-empty' },
            h(Icon, { name: 'note', size: 34 }),
            h('strong', null, t('player.empty')),
            h('span', { className: 'lxgp-note' }, t('player.emptyHint')),
          ),
        )
      }

      if (player.status === 'error') {
        return h('div', { className: 'lxgp' }, css,
          h('div', { className: 'lxgp-empty' },
            h(Icon, { name: 'note', size: 30 }),
            h('strong', null, t('player.error', { error: player.error || '未知错误' })),
            player.query ? h('button', { type: 'button', className: 'lxgp-btn', onClick: retry, disabled: retrying }, retrying ? t('player.retrying') : t('player.retry')) : null,
          ),
        )
      }

      if (player.status === 'ended') {
        return h('div', { className: 'lxgp' }, css,
          h('div', { className: 'lxgp-empty' },
            h(Icon, { name: 'note', size: 30 }),
            h('strong', null, t('player.ended')),
            player.playlist ? h('span', { className: 'lxgp-note' }, t('player.playlistLine', {
              name: player.playlist.name,
              index: (player.playlist.total || 0),
              total: player.playlist.total || 0,
            })) : null,
            h('button', { type: 'button', className: 'lxgp-btn lxgp-btn-primary', onClick: replayPlaylist, disabled: retrying }, retrying ? t('player.retrying') : t('player.replay')),
          ),
        )
      }

      return h('div', { className: 'lxgp' }, css,
        h('div', { className: 'lxgp-cover' },
          player.cover
            ? h('img', { src: player.cover, alt: '', referrerPolicy: 'no-referrer', onError: (e) => { e.currentTarget.style.display = 'none' } })
            : h(Icon, { name: 'note', size: 44 }),
        ),
        h('div', { className: 'lxgp-title' }, player.title || t('player.title')),
        h('div', { className: 'lxgp-sub' },
          [player.singer || t('player.unknownArtist'), player.album].filter(Boolean).join(' · '),
        ),
        player.playlist ? h('div', { className: 'lxgp-note' }, t('player.playlistLine', {
          name: player.playlist.name,
          index: (player.playlist.index || 0) + 1,
          total: player.playlist.total || 0,
        })) : null,
        player.playlist && Array.isArray(player.playlist.skipped) && player.playlist.skipped.length
          ? h('div', { className: 'lxgp-note lxgp-skip' }, t('player.skipped', {
            count: player.playlist.skipped.length,
            names: player.playlist.skipped.map((entry) => entry && entry.name ? entry.name : '').filter(Boolean).slice(0, 5).join('、'),
          }))
          : null,
        h('div', { className: 'lxgp-chips' },
          player.quality ? h('span', { className: 'lxgp-chip' }, t('player.qualityChip', { quality: QUALITY_LABELS[player.quality] || player.quality })) : null,
          player.platform ? h('span', { className: 'lxgp-chip' }, platformLabel(player.platform)) : null,
        ),
        h('audio', {
          ref: audioRef,
          src,
          controls: true,
          autoPlay: true,
          preload: 'auto',
          playsInline: true,
          onPlay: () => setBlocked(false),
          onError: () => setMediaError(t('player.expired')),
          onEnded: () => {
            if (!player.playlist) return
            if (player.playlist.mode === 'single') {
              const audio = audioRef.current
              if (!audio) return
              audio.currentTime = 0
              audio.play().catch(() => setBlocked(true))
              return
            }
            stepPlaylist(1)
          },
        }),
        blocked ? h('button', { type: 'button', className: 'lxgp-btn lxgp-btn-primary', onClick: playNow }, t('player.tapToPlay')) : null,
        mediaError ? h('div', { className: 'lxgp-error' }, mediaError) : null,
        h('div', { className: 'lxgp-note' }, t('player.emptyHint')),
        player.playlist ? h('div', { className: 'lxgp-controls' },
          h('button', { type: 'button', className: 'lxgp-btn', onClick: () => stepPlaylist(-1), disabled: retrying }, t('player.prev')),
          h('button', { type: 'button', className: 'lxgp-btn', onClick: () => stepPlaylist(1), disabled: retrying }, t('player.next')),
          h('button', {
            type: 'button', className: 'lxgp-btn lxgp-mode', onClick: cycleMode, disabled: retrying,
            title: t('mode.title'), 'aria-label': t('mode.title'),
          }, t('mode.' + (player.playlist.mode || 'list'))),
        ) : null,
        h('div', { style: { display: 'flex', gap: 8 } },
          h('button', { type: 'button', className: 'lxgp-btn', onClick: retry, disabled: retrying }, retrying ? t('player.retrying') : t('player.retry')),
        ),
      )
    }

    /* ------------------------------------------------------------------ *
     * Music hub — shared by the left rail entry and the right-sidebar tab
     * ------------------------------------------------------------------ */
    function MusicRailIcon({ size = 18 }) {
      return h(Icon, { name: 'note', size })
    }

    function MusicPage({ ctx, embedded = false }) {
      const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const [, bumpLocale] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => bumpLocale((x) => x + 1))
      }, [locale])
      const t = React.useCallback((key, vars) => translate(locale, key, vars), [locale, bumpLocale])
      const player = usePlayerStore(playerStore)

      const [snap, setSnap] = React.useState(null)
      const [playlists, setPlaylists] = React.useState([])
      const [query, setQuery] = React.useState('')
      const [platform, setPlatform] = React.useState('wy')
      const [results, setResults] = React.useState([])
      const [resultsQuery, setResultsQuery] = React.useState('')
      const [searching, setSearching] = React.useState(false)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [toast, setToast] = React.useState('')
      const fileRef = React.useRef(null)

      const refresh = React.useCallback(async () => {
        try {
          const data = await api('state')
          setSnap(data)
          setPlaylists(Array.isArray(data.playlists) ? data.playlists : [])
          const selected = data.settings && data.settings.platform
          if (selected) setPlatform((prev) => prev || selected)
        } catch (e) {
          setError(e.message)
        }
      }, [])

      React.useEffect(() => { refresh() }, [refresh])

      // The right column is driven by the `sidebarRight` service. Never fail
      // silently: this button used to do nothing when the service was missing
      // or the column refused the open, which reads as a dead button.
      const openPlayer = async () => {
        const face = resolveSidebarRight(ctx)
        if (!face) {
          setError(t('player.unavailable'))
          return
        }
        let failure = null
        for (const options of [{ revealIfOpened: true }, {}]) {
          try {
            await face.openTab(PLAYER_KIND, options)
            setError('')
            return
          } catch (error) {
            failure = error
          }
        }
        // The seat may still be minting its store on the frame after a session
        // switch; one delayed retry covers that race instead of swallowing it.
        await new Promise((resolve) => setTimeout(resolve, 120))
        try {
          await face.openTab(PLAYER_KIND, { revealIfOpened: true })
          setError('')
          return
        } catch (error) {
          failure = error
        }
        setError(t('player.openFailed', {
          error: failure && failure.message ? failure.message : String(failure),
        }))
      }

      const runSearch = async () => {
        const q = query.trim()
        if (!q || searching) return
        setSearching(true)
        setError('')
        setToast('')
        try {
          const data = await api('search', { platform, query: q, page: 1, limit: 20 })
          setResults(Array.isArray(data.list) ? data.list : [])
          setResultsQuery(q)
        } catch (e) {
          setError(t('search.error', { error: e.message }))
          setResults([])
          setResultsQuery(q)
        } finally {
          setSearching(false)
        }
      }

      const playSong = async (song) => {
        if (busy) return
        setBusy(`song:${song.songmid || song.name}`)
        setError('')
        setToast('')
        try {
          const result = await api('play', {
            query: `${song.name || ''} ${song.singer || ''}`.trim(),
            platform,
          })
          if (result && result.message) setToast(result.message)
          await openPlayer()
        } catch (e) {
          setError(`${t('music.playError')}：${e.message}`)
        } finally {
          setBusy('')
        }
      }

      const playList = async (playlist) => {
        if (busy) return
        setBusy(`pl:${playlist.id}`)
        setError('')
        setToast('')
        try {
          const result = await api('playPlaylist', { id: playlist.id, index: 0 })
          if (result && result.message) setToast(result.message)
          await openPlayer()
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy('')
        }
      }

      const importPlaylist = async (file) => {
        if (!file || busy) return
        setBusy('import')
        setError('')
        setToast('')
        try {
          const data = bufferToBase64(await file.arrayBuffer())
          const result = await api('importPlaylist', { data, filename: file.name })
          const info = result && result.playlist ? result.playlist : {}
          setToast(t('playlist.imported', { name: info.name || file.name, count: info.count || 0 }))
          await refresh()
        } catch (e) {
          setError(t('playlist.error', { error: e.message }))
        } finally {
          setBusy('')
        }
      }

      const providers = snap && Array.isArray(snap.providers) && snap.providers.length
        ? snap.providers.map((item) => [item.platform, item.label])
        : PLATFORM_OPTIONS
      const playing = player && player.status === 'ready' && player.title

      const css = h('style', null, `
        .lxgm { display:flex; flex-direction:column; gap:12px; height:100%; overflow-y:auto; padding:18px 20px 28px; box-sizing:border-box; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; }
        .lxgm * { box-sizing:border-box; }
        .lxgm-embedded { padding:12px 12px 20px; gap:10px; }
        .lxgm-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .lxgm-title { font-size:15px; font-weight:650; }
        .lxgm-now { display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }
        .lxgm-searchbar { display:flex; gap:8px; align-items:center; }
        .lxgm-input { flex:1; min-width:0; height:34px; padding:0 11px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:inherit; font:inherit; outline:none; }
        .lxgm-input:focus { border-color:var(--dsw-alias-brand-primary); }
        .lxgm-select { height:34px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:inherit; font:inherit; padding:0 6px; }
        .lxgm-btn { appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:32px; padding:0 12px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
        .lxgm-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2); }
        .lxgm-btn:disabled { opacity:.45; cursor:not-allowed; }
        .lxgm-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
        .lxgm-btn-sm { height:26px; padding:0 8px; font-size:11.5px; }
        .lxgm-section { display:flex; flex-direction:column; gap:2px; }
        .lxgm-section-head { display:flex; align-items:center; gap:8px; margin:2px 2px 4px; font-size:11.5px; color:var(--dsw-alias-label-secondary); }
        .lxgm-row { display:flex; align-items:center; gap:10px; padding:7px 8px; border-radius:10px; }
        .lxgm-row:hover { background:var(--dsw-alias-bg-layer-2); }
        .lxgm-row-main { flex:1; min-width:0; }
        .lxgm-name { font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lxgm-sub { font-size:11px; color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .lxgm-empty { font-size:11.5px; color:var(--dsw-alias-label-secondary); padding:6px 8px; }
        .lxgm-error { font-size:11.5px; color:var(--dsw-alias-state-error-primary); background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent); border-radius:8px; padding:7px 9px; }
        .lxgm-toast { font-size:11.5px; color:var(--dsw-alias-state-success-primary); }
      `)

      return h('div', { className: embedded ? 'lxgm lxgm-embedded' : 'lxgm' }, css,
        h('div', { className: 'lxgm-head' },
          h('div', { className: 'lxgm-title' }, t('music.title')),
          h('button', { type: 'button', className: 'lxgm-btn', onClick: openPlayer },
            h(Icon, { name: 'note', size: 14 }),
            t('music.openPlayer')),
        ),
        playing ? h('div', { className: 'lxgm-now' },
          h('div', { className: 'lxgm-row-main' },
            h('div', { className: 'lxgm-name' }, player.title),
            h('div', { className: 'lxgm-sub' }, [player.singer, player.platform ? platformLabel(player.platform) : ''].filter(Boolean).join(' · ')),
          ),
          h('button', { type: 'button', className: 'lxgm-btn', onClick: openPlayer }, t('music.openPlayer')),
        ) : null,
        h('div', { className: 'lxgm-searchbar' },
          h('select', {
            className: 'lxgm-select',
            value: platform,
            onChange: (event) => setPlatform(event.target.value),
            'aria-label': t('search.platform'),
          }, providers.map(([key, label]) => h('option', { key, value: key }, label))),
          h('input', {
            className: 'lxgm-input',
            value: query,
            placeholder: t('search.placeholder'),
            onChange: (event) => setQuery(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') runSearch() },
          }),
          h('button', {
            type: 'button',
            className: 'lxgm-btn lxgm-btn-primary',
            onClick: runSearch,
            disabled: searching || !query.trim(),
          }, searching ? t('search.searching') : t('search.button')),
        ),
        error ? h('div', { className: 'lxgm-error' }, error) : null,
        toast ? h('div', { className: 'lxgm-toast' }, toast) : null,
        h('div', { className: 'lxgm-section' },
          h('div', { className: 'lxgm-section-head' },
            h('span', null, t('music.results')),
            resultsQuery ? h('span', { className: 'lxgm-sub' }, resultsQuery) : null,
          ),
          !resultsQuery
            ? h('div', { className: 'lxgm-empty' }, t('search.empty'))
            : results.length === 0
              ? h('div', { className: 'lxgm-empty' }, t('search.noResult'))
              : results.map((song, index) => h('div', { className: 'lxgm-row', key: `${song.songmid || song.name}-${index}` },
                h('div', { className: 'lxgm-row-main' },
                  h('div', { className: 'lxgm-name' }, song.name),
                  h('div', { className: 'lxgm-sub' }, [song.singer, song.albumName].filter(Boolean).join(' · ')),
                ),
                h('button', {
                  type: 'button',
                  className: 'lxgm-btn',
                  disabled: Boolean(busy),
                  onClick: () => playSong(song),
                }, busy === `song:${song.songmid || song.name}` ? t('player.loading') : t('music.play')),
              )),
        ),
        h('div', { className: 'lxgm-section' },
          h('div', { className: 'lxgm-section-head' },
            h('span', null, t('playlist.title')),
            h('button', {
              type: 'button',
              className: 'lxgm-btn lxgm-btn-sm',
              disabled: Boolean(busy),
              onClick: () => { if (fileRef.current) fileRef.current.click() },
            }, t('playlist.import')),
            h('input', {
              ref: fileRef,
              type: 'file',
              accept: '.lxmc,application/octet-stream',
              style: { display: 'none' },
              onChange: (event) => {
                const file = event.target.files && event.target.files[0]
                event.target.value = ''
                if (file) importPlaylist(file)
              },
            }),
          ),
          playlists.length === 0
            ? h('div', { className: 'lxgm-empty' }, t('playlist.empty'))
            : playlists.map((playlist) => h('div', { className: 'lxgm-row', key: playlist.id },
              h('div', { className: 'lxgm-row-main' },
                h('div', { className: 'lxgm-name' }, playlist.name),
                h('div', { className: 'lxgm-sub' }, t('playlist.count', { count: playlist.count || 0 })),
              ),
              h('button', {
                type: 'button',
                className: 'lxgm-btn',
                disabled: Boolean(busy),
                onClick: () => playList(playlist),
              }, busy === `pl:${playlist.id}` ? t('player.loading') : t('playlist.play')),
            )),
        ),
      )
    }

    function Panel({ ctx }) {
      const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined
      const [, bumpLocale] = React.useState(0)
      React.useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return undefined
        return locale.subscribe(() => bumpLocale((x) => x + 1))
      }, [locale])
      const t = React.useCallback((key, vars) => {
        const fn = locale && typeof locale.bind === 'function' ? locale.bind('lx-geteer') : null
        let text = fn ? fn(key) : key
        if (!text || text === key) {
          text = ZH[key] || EN[key] || key
        }
        if (vars) {
          for (const [name, value] of Object.entries(vars)) {
            text = text.split(`{${name}}`).join(String(value))
          }
        }
        return text
      }, [locale, bumpLocale])

      const [snap, setSnap] = React.useState(null)
      const [jobs, setJobs] = React.useState([])
      const [loading, setLoading] = React.useState(true)
      const [error, setError] = React.useState('')
      const [toast, setToast] = React.useState('')
      const [tab, setTab] = React.useState('search')
      const [busy, setBusy] = React.useState(false)

      const [query, setQuery] = React.useState('')
      const [platform, setPlatform] = React.useState('')
      const [quality, setQuality] = React.useState('')
      const [results, setResults] = React.useState([])
      const [page, setPage] = React.useState(1)
      const [allPage, setAllPage] = React.useState(1)
      const [total, setTotal] = React.useState(0)
      const [searching, setSearching] = React.useState(false)
      const [searchError, setSearchError] = React.useState('')
      const [searched, setSearched] = React.useState(false)

      const [sourceFilter, setSourceFilter] = React.useState('')
      const [expanded, setExpanded] = React.useState(false)
      const [showImport, setShowImport] = React.useState(false)
      const [importText, setImportText] = React.useState('')
      const [importName, setImportName] = React.useState('')
      const [importing, setImporting] = React.useState(false)
      const [logsOpen, setLogsOpen] = React.useState(false)
      const [settingsDraft, setSettingsDraft] = React.useState(null)
      const [savingSettings, setSavingSettings] = React.useState(false)
      const [pendingDelete, setPendingDelete] = React.useState('')
      const [pendingPlaylistDelete, setPendingPlaylistDelete] = React.useState('')
      const [playlistBusy, setPlaylistBusy] = React.useState(false)
      const [importingPlaylist, setImportingPlaylist] = React.useState(false)

      const refresh = React.useCallback(async (quiet) => {
        if (!quiet) setLoading(true)
        try {
          const data = await api('state')
          setSnap(data)
          setJobs(data.jobs || [])
          setSettingsDraft((prev) => prev || data.settings)
          setError('')
        } catch (e) {
          setError(e.message)
        } finally {
          if (!quiet) setLoading(false)
        }
      }, [])

      React.useEffect(() => { refresh() }, [refresh])

      const sourceCount = snap && Array.isArray(snap.sources) ? snap.sources.length : -1
      React.useEffect(() => {
        if (sourceCount === 0) setShowImport(true)
      }, [sourceCount])

      const runtimePending = !!(snap && snap.runtime && snap.runtime.ready === false && !snap.runtime.error)
      React.useEffect(() => {
        if (!runtimePending) return undefined
        let cancelled = false
        const id = setInterval(async () => {
          try {
            const data = await api('state')
            if (cancelled) return
            setSnap(data)
            setJobs(data.jobs || [])
          } catch { /* source is still starting */ }
        }, 1500)
        return () => { cancelled = true; clearInterval(id) }
      }, [runtimePending])

      React.useEffect(() => {
        if (!toast) return undefined
        const id = setTimeout(() => setToast(''), 4200)
        return () => clearTimeout(id)
      }, [toast])

      React.useEffect(() => {
        if (!pendingDelete) return undefined
        const id = setTimeout(() => setPendingDelete(''), 4000)
        return () => clearTimeout(id)
      }, [pendingDelete])

      React.useEffect(() => {
        if (!pendingPlaylistDelete) return undefined
        const id = setTimeout(() => setPendingPlaylistDelete(''), 4000)
        return () => clearTimeout(id)
      }, [pendingPlaylistDelete])

      const providers = (snap && snap.providers) || []
      const active = snap && snap.active
      const support = (snap && snap.support) || []
      const runningJobs = jobs.filter((j) => j.state === 'running')

      React.useEffect(() => {
        if (runningJobs.length === 0) return undefined
        let cancelled = false
        const tick = async () => {
          try {
            const data = await api('jobs')
            if (!cancelled) setJobs(data.jobs || [])
          } catch { /* transient */ }
        }
        const id = setInterval(tick, 1200)
        return () => { cancelled = true; clearInterval(id) }
      }, [runningJobs.length])

      React.useEffect(() => {
        if (providers.length === 0) {
          if (platform) setPlatform('')
          return
        }
        if (!providers.some((p) => p.platform === platform)) {
          const preferred = snap && snap.settings ? snap.settings.platform : ''
          setPlatform(providers.some((p) => p.platform === preferred) ? preferred : providers[0].platform)
        }
      }, [providers.map((p) => p.platform).join(','), platform, snap && snap.settings && snap.settings.platform])

      const currentSupport = support.find((s) => s.platform === platform)
      const qualities = (currentSupport && currentSupport.qualities) || []

      React.useEffect(() => {
        if (!qualities.length) return
        if (!qualities.includes(quality)) {
          setQuality(pickQuality(qualities, snap && snap.settings ? snap.settings.quality : '320k'))
        }
      }, [qualities.join(','), quality, snap && snap.settings && snap.settings.quality])

      const doSearch = async (nextPage) => {
        const q = query.trim()
        if (!q || !platform) return
        const p = nextPage || 1
        setSearching(true)
        setSearchError('')
        try {
          const data = await api('search', { platform, query: q, page: p, limit: (snap && snap.settings && snap.settings.pageSize) || 30 })
          setResults(data.list || [])
          setPage(data.page || p)
          setTotal(data.total || 0)
          setAllPage(data.allPage || 1)
          setSearched(true)
        } catch (e) {
          setSearchError(e.message)
          setSearched(true)
        } finally {
          setSearching(false)
        }
      }

      const startDownload = async (song) => {
        setError('')
        try {
          const data = await api('download', { platform, quality, song })
          setJobs((prev) => [data.job, ...prev.filter((j) => j.id !== data.job.id)])
          setToast(t('song.downloading'))
        } catch (e) {
          setError(e.message)
        }
      }

      const cancelJob = async (job) => {
        try {
          await api('cancelJob', { id: job.id })
          setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, state: 'error', phase: 'error', error: t('song.cancel') } : j)))
        } catch (e) {
          setError(e.message)
        }
      }

      const activate = async (source) => {
        if (!source || busy) return
        setBusy(true)
        setError('')
        try {
          await api('activate', { id: source.id })
          await refresh(true)
          setResults([])
          setSearched(false)
          setToast(t('source.active'))
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }

      const reloadRuntime = async () => {
        setBusy(true)
        setError('')
        try {
          await api('reload')
          await refresh(true)
          setToast(t('source.ready'))
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }

      const doImport = async () => {
        if (!importText.trim() || importing) return
        setImporting(true)
        setError('')
        try {
          const data = await api('import', { script: importText, filename: importName })
          const platforms = (data.source && data.source.platforms) || []
          setToast(t('source.imported', {
            name: (data.source && data.source.name) || '',
            platforms: platforms.map((p) => platformLabel(p)).join('、') || '—',
          }))
          setImportText('')
          setImportName('')
          setShowImport(false)
          await refresh(true)
        } catch (e) {
          setError(e.message)
        } finally {
          setImporting(false)
        }
      }

      const deleteSource = async (source, confirmed) => {
        if (!source || busy) return
        if (!confirmed) {
          setPendingDelete(source.id)
          return
        }
        setPendingDelete('')
        setBusy(true)
        try {
          await api('delete', { id: source.id })
          await refresh(true)
          setToast(t('source.deleteOk'))
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }

      const importPlaylistFile = async (file) => {
        if (!file || importingPlaylist) return
        setImportingPlaylist(true)
        setError('')
        try {
          const data = bufferToBase64(await file.arrayBuffer())
          const result = await api('importPlaylist', { data, filename: file.name })
          setToast(t('playlist.imported', {
            name: (result.playlist && result.playlist.name) || file.name,
            count: (result.playlist && result.playlist.count) || 0,
          }))
          await refresh(true)
        } catch (e) {
          setError(t('playlist.error', { error: e.message }))
        } finally {
          setImportingPlaylist(false)
        }
      }

      const playPlaylist = async (playlist) => {
        if (!playlist || playlistBusy) return
        setPlaylistBusy(true)
        setError('')
        try {
          const result = await api('playPlaylist', { id: playlist.id })
          if (!result.ok) setError(result.message || t('playlist.needSource'))
          else setToast(result.message || t('playlist.playing'))
        } catch (e) {
          setError(e.message)
        } finally {
          setPlaylistBusy(false)
        }
      }

      const deletePlaylist = async (playlist, confirmed) => {
        if (!playlist || playlistBusy) return
        if (!confirmed) {
          setPendingPlaylistDelete(playlist.id)
          return
        }
        setPendingPlaylistDelete('')
        setPlaylistBusy(true)
        setError('')
        try {
          await api('deletePlaylist', { id: playlist.id })
          await refresh(true)
          setToast(t('playlist.deleted'))
        } catch (e) {
          setError(e.message)
        } finally {
          setPlaylistBusy(false)
        }
      }

      const saveSettings = async () => {
        if (!settingsDraft || savingSettings) return
        setSavingSettings(true)
        setError('')
        try {
          const data = await api('settings', { settings: settingsDraft })
          setSettingsDraft(data.settings)
          setSnap((prev) => (prev ? { ...prev, settings: data.settings } : prev))
          setToast(t('settings.saved'))
        } catch (e) {
          setError(e.message)
        } finally {
          setSavingSettings(false)
        }
      }

      const loadLogs = async () => {
        const next = !logsOpen
        setLogsOpen(next)
        if (next) {
          try {
            const data = await api('logs')
            setSnap((prev) => (prev ? { ...prev, runtime: { ...prev.runtime, logs: data.logs || [] } } : prev))
          } catch { /* logs are optional */ }
        }
      }

      const jobFor = (song) => jobs.find((j) => j.songKey === song.key && j.platform === platform)

      const visibleSources = React.useMemo(() => {
        const list = (snap && snap.sources) || []
        const q = sourceFilter.trim().toLowerCase()
        if (!q) return list
        return list.filter((s) => `${s.name} ${s.author} ${s.description}`.toLowerCase().includes(q))
      }, [snap && snap.sources, sourceFilter])

      const sourceChip = (key, name) => h('span', { key, className: 'lxg-chip' }, platformLabel(key, name))

      const renderJob = (song) => {
        const job = jobFor(song)
        if (!job) {
          return h('button', {
            type: 'button',
            className: 'lxg-btn lxg-btn-primary lxg-btn-sm',
            onClick: () => startDownload(song),
            disabled: !quality,
          }, h(Icon, { name: 'download', size: 14 }), h('span', null, t('song.download')))
        }
        if (job.state === 'running') {
          const pct = job.total > 0 ? Math.min(100, Math.round((job.received / job.total) * 100)) : 0
          return h('div', { className: 'lxg-job' },
            h('div', { className: 'lxg-job-line' },
              h('span', { className: 'lxg-job-text' }, job.phase === 'resolving' ? t('song.resolving') : `${t('song.downloading')} ${pct > 0 ? `${pct}%` : ''}`),
              h('button', { type: 'button', className: 'lxg-link', onClick: () => cancelJob(job) }, t('song.cancel')),
            ),
            h('div', { className: 'lxg-progress' }, h('span', { style: { width: `${pct}%` } })),
            h('div', { className: 'lxg-job-sub' }, `${fmtSize(job.received)}${job.total ? ` / ${fmtSize(job.total)}` : ''}`),
          )
        }
        if (job.state === 'done') {
          return h('div', { className: 'lxg-job lxg-job-done', title: job.path },
            h('span', { className: 'lxg-job-text' }, h(Icon, { name: 'check', size: 14 }), ' ', t('song.done')),
            h('span', { className: 'lxg-job-sub lxg-ellipsis' }, job.fileName || job.path),
          )
        }
        const message = job.error || t('song.failed')
        return h('div', { className: 'lxg-job lxg-job-error', title: message },
          h('span', { className: 'lxg-job-text' }, message.length > 46 ? `${message.slice(0, 46)}…` : message),
          h('button', { type: 'button', className: 'lxg-link', onClick: () => startDownload(song) }, t('song.retry')),
        )
      }

      const renderSong = (song) => h('div', { className: 'lxg-song', key: song.key },
        h('div', { className: 'lxg-cover' },
          song.img
            ? h('img', { src: song.img, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer', onError: (e) => { e.currentTarget.style.display = 'none' } })
            : h(Icon, { name: 'note', size: 20 }),
        ),
        h('div', { className: 'lxg-song-main' },
          h('div', { className: 'lxg-song-name', title: song.name }, song.name),
          h('div', { className: 'lxg-song-sub' },
            h('span', null, song.singer || '—'),
            song.albumName ? h('span', null, ' · ', song.albumName) : null,
            song.interval ? h('span', null, ' · ', song.interval) : null,
          ),
          h('div', { className: 'lxg-tags' },
            (song.types || []).slice(0, 5).map((type) => h('span', {
              key: type.type,
              className: `lxg-tag${quality === type.type ? ' lxg-tag-active' : ''}`,
              title: type.size ? fmtSize(type.size) : '',
            }, type.type)),
          ),
        ),
        h('div', { className: 'lxg-song-action' }, renderJob(song)),
      )

      const header = h('div', { className: 'lxg-head' },
        h('div', { className: 'lxg-brand' },
          h(Logo),
          h('div', null,
            h('div', { className: 'lxg-title-row' },
              h('h2', { className: 'lxg-title' }, t('app.title')),
              h('span', { className: 'lxg-version' }, t('app.version', { version: (snap && snap.version) || '0.4.0' })),
            ),
            h('p', { className: 'lxg-subtitle' }, active ? t('app.active', { name: active.name }) : t('app.noActive')),
          ),
        ),
        h('button', { type: 'button', className: 'lxg-btn', onClick: () => refresh(), disabled: loading || busy },
          h(Icon, { name: 'refresh', size: 15 }), h('span', null, t('app.reload'))),
      )

      const banner = error
        ? h('div', { className: 'lxg-banner lxg-banner-error', role: 'alert' },
          h('span', { className: 'lxg-grow' }, error),
          h('button', { type: 'button', className: 'lxg-link', onClick: () => setError('') }, t('common.close')))
        : null

      const runtimeBanner = snap && snap.runtime && snap.runtime.ready === false && snap.runtime.error
        ? h('div', { className: 'lxg-banner lxg-banner-warn' },
          h('span', { className: 'lxg-grow' }, t('runtime.failed', { error: snap.runtime.error })),
          h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm', onClick: reloadRuntime, disabled: busy }, t('runtime.retry')),
        )
        : null

      const tabs = h('div', { className: 'lxg-tabs', role: 'tablist' },
        h('button', {
          type: 'button', role: 'tab', 'aria-selected': tab === 'search',
          className: `lxg-tab${tab === 'search' ? ' lxg-tab-active' : ''}`,
          onClick: () => setTab('search'),
        }, h(Icon, { name: 'search', size: 15 }), t('tabs.search')),
        h('button', {
          type: 'button', role: 'tab', 'aria-selected': tab === 'sources',
          className: `lxg-tab${tab === 'sources' ? ' lxg-tab-active' : ''}`,
          onClick: () => setTab('sources'),
        }, h(Icon, { name: 'note', size: 15 }), t('tabs.sources')),
      )

      const searchTab = h('div', { className: 'lxg-pane' },
        !snap
          ? h('div', { className: 'lxg-empty' }, h(Icon, { name: 'note', size: 26 }), h('p', null, t('common.loading')))
          : !active
          ? h('div', { className: 'lxg-empty' },
            h(Icon, { name: 'plus', size: 26 }),
            h('p', null, t('search.needImport')),
            h('button', {
              type: 'button', className: 'lxg-btn lxg-btn-primary',
              onClick: () => { setTab('sources'); setShowImport(true) },
            }, t('source.importFirst')),
          )
          : providers.length === 0
          ? h('div', { className: 'lxg-empty' },
            h('p', null, snap.runtime && snap.runtime.error ? t('search.needSource') : t('search.noPlatforms')),
            h('button', { type: 'button', className: 'lxg-btn', onClick: reloadRuntime, disabled: busy }, t('runtime.retry')),
          )
          : h(React.Fragment, null,
            h('div', { className: 'lxg-searchbar' },
              h('div', { className: 'lxg-search-input' },
                h(Icon, { name: 'search', size: 16 }),
                h('input', {
                  value: query,
                  placeholder: t('search.placeholder'),
                  onChange: (e) => setQuery(e.target.value),
                  onKeyDown: (e) => { if (e.key === 'Enter') doSearch(1) },
                  'aria-label': t('search.placeholder'),
                }),
              ),
              h('select', {
                className: 'lxg-select', value: platform, 'aria-label': t('search.platform'),
                onChange: (e) => { setPlatform(e.target.value); setResults([]); setSearched(false) },
              }, providers.map((p) => h('option', { key: p.platform, value: p.platform }, platformLabel(p.platform)))),
              h('select', {
                className: 'lxg-select', value: quality, 'aria-label': t('search.quality'),
                onChange: (e) => setQuality(e.target.value),
              }, qualities.map((q) => h('option', { key: q, value: q }, q))),
              h('button', {
                type: 'button', className: 'lxg-btn lxg-btn-primary', onClick: () => doSearch(1),
                disabled: searching || !query.trim(),
              }, searching ? t('search.searching') : t('search.button')),
            ),
            h('p', { className: 'lxg-hint' }, t('search.hint')),
            searchError ? h('div', { className: 'lxg-banner lxg-banner-error' }, t('search.error', { error: searchError })) : null,
            !searched && !searching
              ? h('div', { className: 'lxg-empty lxg-empty-small' }, h(Icon, { name: 'search', size: 26 }), h('p', null, t('search.empty')))
              : null,
            searched && !searching && results.length === 0 && !searchError
              ? h('div', { className: 'lxg-empty lxg-empty-small' }, h(Icon, { name: 'note', size: 26 }), h('p', null, t('search.noResult')))
              : null,
            results.length > 0
              ? h('div', { className: 'lxg-results' },
                h('div', { className: 'lxg-results-meta' },
                  h('span', null, t('search.total', { total })),
                  h('span', null, t('search.page', { page, pages: allPage })),
                ),
                h('div', { className: 'lxg-song-list' }, results.map(renderSong)),
                h('div', { className: 'lxg-pager' },
                  h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm', disabled: page <= 1 || searching, onClick: () => doSearch(page - 1) }, t('search.prev')),
                  h('span', { className: 'lxg-pager-text' }, `${page} / ${allPage}`),
                  h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm', disabled: page >= allPage || searching, onClick: () => doSearch(page + 1) }, t('search.next')),
                ),
              )
              : null,
          ),
      )

      const activeSupport = (snap && snap.support) || []
      const activeSourceCard = h('div', { className: 'lxg-card' },
        h('div', { className: 'lxg-card-head' },
          h('div', null,
            h('div', { className: 'lxg-card-title' }, t('source.activeTitle')),
            h('div', { className: 'lxg-card-name' }, active ? active.name : t('source.noActive')),
            active ? h('div', { className: 'lxg-card-sub' },
              [active.version ? t('source.version', { version: active.version }) : '', active.author ? t('source.author', { author: active.author }) : ''].filter(Boolean).join(' · '),
            ) : null,
            active && active.description ? h('div', { className: 'lxg-card-desc' }, active.description) : null,
          ),
          h('div', { className: 'lxg-card-actions' },
            active
              ? h(React.Fragment, null,
                h('span', { className: `lxg-status${snap && snap.runtime && snap.runtime.ready ? ' lxg-status-ok' : ''}` },
                  snap && snap.runtime && snap.runtime.ready ? t('source.ready') : t('source.notReady')),
                h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm', onClick: reloadRuntime, disabled: busy }, t('source.reload')),
                h('button', { type: 'button', className: 'lxg-link', onClick: loadLogs }, logsOpen ? t('source.hideLogs') : t('source.logs')),
              )
              : h('button', { type: 'button', className: 'lxg-btn lxg-btn-primary lxg-btn-sm', onClick: () => setShowImport(true) }, t('source.importFirst')),
          ),
        ),
        active
          ? (activeSupport.length
            ? h('div', { className: 'lxg-platforms' },
              activeSupport.map((s) => h('span', { key: s.platform, className: 'lxg-chip lxg-chip-lg', title: (s.qualities || []).join(', ') },
                `${platformLabel(s.platform, s.name)} · ${t('source.qualityCount', { n: (s.qualities || []).length })}`)))
            : h('p', { className: 'lxg-hint' }, snap && snap.runtime && snap.runtime.error ? snap.runtime.error : t('common.loading')))
          : h('p', { className: 'lxg-hint' }, t('search.needImport')),
        logsOpen
          ? h('pre', { className: 'lxg-logs' }, ((snap && snap.runtime && snap.runtime.logs) || []).map((x) => x.line).join('\n') || '—')
          : null,
      )

      const importCard = h('div', { className: 'lxg-card' },
        h('div', { className: 'lxg-card-head' },
          h('div', { className: 'lxg-card-title' }, t('source.importTitle')),
          h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm', onClick: () => setShowImport((x) => !x) },
            h(Icon, { name: 'plus', size: 14 }), t('source.import')),
        ),
        showImport
          ? h('div', { className: 'lxg-import' },
            h('p', { className: 'lxg-hint' }, t('source.importHint')),
            h('div', { className: 'lxg-import-row' },
              h('label', { className: 'lxg-btn lxg-btn-sm lxg-file' },
                h(Icon, { name: 'plus', size: 14 }), t('source.chooseFile'),
                h('input', {
                  type: 'file', accept: '.js,text/javascript,application/javascript',
                  onChange: async (e) => {
                    const file = e.target.files && e.target.files[0]
                    if (!file) return
                    try {
                      const text = await file.text()
                      setImportText(text)
                      setImportName(file.name)
                    } catch (err) {
                      setError(err.message)
                    }
                    e.target.value = ''
                  },
                }),
              ),
              importName ? h('span', { className: 'lxg-file-name' }, importName) : null,
            ),
            h('textarea', {
              className: 'lxg-textarea',
              value: importText,
              placeholder: t('source.paste'),
              onChange: (e) => setImportText(e.target.value),
              spellCheck: false,
            }),
            h('div', { className: 'lxg-row-end' },
              h('button', { type: 'button', className: 'lxg-btn lxg-btn-primary', onClick: doImport, disabled: importing || !importText.trim() },
                importing ? t('source.importing') : t('source.importButton')),
            ),
          )
          : null,
      )

      const playlistItems = (snap && snap.playlists) || []
      const playlistCard = h('div', { className: 'lxg-card' },
        h('div', { className: 'lxg-card-head' },
          h('div', { className: 'lxg-card-title' }, t('playlist.title')),
          h('label', { className: 'lxg-btn lxg-btn-sm lxg-file' },
            h(Icon, { name: 'plus', size: 14 }),
            importingPlaylist ? t('playlist.importing') : t('playlist.import'),
            h('input', {
              type: 'file',
              accept: '.lxmc,application/octet-stream,application/gzip',
              disabled: importingPlaylist,
              onChange: async (event) => {
                const file = event.target.files && event.target.files[0]
                if (file) await importPlaylistFile(file)
                event.target.value = ''
              },
            }),
          ),
        ),
        h('p', { className: 'lxg-hint' }, t('playlist.hint')),
        playlistItems.length === 0
          ? h('div', { className: 'lxg-empty lxg-empty-small' }, h(Icon, { name: 'note', size: 24 }), h('p', null, t('playlist.empty')))
          : h('div', { className: 'lxg-playlist-list' }, playlistItems.map((playlist) => h('div', {
            key: playlist.id,
            className: 'lxg-playlist',
          },
            h('div', { className: 'lxg-playlist-main' },
              h('div', { className: 'lxg-playlist-title' },
                h('span', { className: 'lxg-playlist-name' }, playlist.name),
                h('span', { className: 'lxg-chip' }, platformLabel(playlist.source)),
              ),
              h('div', { className: 'lxg-playlist-sub' },
                t('playlist.count', { count: playlist.count }),
                playlist.sourceListId ? ` · ${playlist.sourceListId}` : '',
              ),
            ),
            h('div', { className: 'lxg-playlist-actions' },
              h('button', {
                type: 'button', className: 'lxg-btn lxg-btn-sm lxg-btn-primary',
                onClick: () => playPlaylist(playlist), disabled: playlistBusy,
              }, t('playlist.play')),
              pendingPlaylistDelete === playlist.id
                ? h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm lxg-btn-danger', onClick: () => deletePlaylist(playlist, true), disabled: playlistBusy }, t('playlist.confirmDelete'))
                : h('button', { type: 'button', className: 'lxg-icon-btn', title: t('playlist.delete'), 'aria-label': t('playlist.delete'), onClick: () => deletePlaylist(playlist, false), disabled: playlistBusy }, h(Icon, { name: 'trash', size: 15 })),
            ),
          ))),
      )

      const settingsCard = h('div', { className: 'lxg-card' },
        h('div', { className: 'lxg-card-title' }, t('settings.title')),
        h('div', { className: 'lxg-form' },
          h('label', { className: 'lxg-field' },
            h('span', null, t('settings.downloadDir')),
            h('input', {
              className: 'lxg-input', value: (settingsDraft && settingsDraft.downloadDir) || '',
              onChange: (e) => setSettingsDraft((prev) => ({ ...prev, downloadDir: e.target.value })),
            }),
            h('small', null, t('settings.downloadDirHint')),
          ),
          h('div', { className: 'lxg-form-row' },
            h('label', { className: 'lxg-field' },
              h('span', null, t('settings.defaultQuality')),
              h('select', {
                className: 'lxg-select', value: (settingsDraft && settingsDraft.quality) || '320k',
                onChange: (e) => setSettingsDraft((prev) => ({ ...prev, quality: e.target.value })),
              }, [...new Set([...KNOWN_QUALITIES, (settingsDraft && settingsDraft.quality) || '320k'])].map((q) => h('option', { key: q, value: q }, q))),
            ),
            h('label', { className: 'lxg-field' },
              h('span', null, t('settings.pageSize')),
              h('select', {
                className: 'lxg-select', value: String((settingsDraft && settingsDraft.pageSize) || 30),
                onChange: (e) => setSettingsDraft((prev) => ({ ...prev, pageSize: Number(e.target.value) })),
              }, [10, 20, 30, 50].map((n) => h('option', { key: n, value: String(n) }, String(n)))),
            ),
            h('label', { className: 'lxg-field' },
              h('span', null, t('settings.timeout')),
              h('input', {
                className: 'lxg-input', type: 'number', min: 10, max: 120,
                value: (settingsDraft && settingsDraft.requestTimeout) || 45,
                onChange: (e) => setSettingsDraft((prev) => ({ ...prev, requestTimeout: Number(e.target.value) })),
              }),
            ),
          ),
          h('div', { className: 'lxg-row-between' },
            h('small', { className: 'lxg-dim' }, snap && snap.storage ? t('settings.dataDir', { dir: snap.storage.dataDir }) : ''),
            h('button', { type: 'button', className: 'lxg-btn lxg-btn-primary', onClick: saveSettings, disabled: savingSettings },
              savingSettings ? t('common.loading') : t('settings.save')),
          ),
        ),
      )

      const sourceList = h('div', { className: 'lxg-card' },
        h('div', { className: 'lxg-card-head' },
          h('div', { className: 'lxg-card-title' }, t('source.count', { count: visibleSources.length })),
          h('div', { className: 'lxg-filters' },
            h('input', {
              className: 'lxg-input lxg-input-filter', value: sourceFilter, placeholder: t('source.filter'),
              onChange: (e) => setSourceFilter(e.target.value),
            }),
          ),
        ),
        visibleSources.length === 0
          ? h('div', { className: 'lxg-empty lxg-empty-small' },
            h(Icon, { name: 'note', size: 24 }),
            h('p', null, snap && snap.sources && snap.sources.length === 0 ? t('source.emptyLibrary') : t('source.empty')))
          : h('div', { className: 'lxg-source-list' }, visibleSources.map((source) => h('div', {
            key: source.id,
            className: `lxg-source${source.active ? ' lxg-source-active' : ''}`,
          },
            h('div', { className: 'lxg-source-main' },
              h('div', { className: 'lxg-source-title' },
                h('span', { className: 'lxg-source-name' }, source.name),
                source.active ? h('span', { className: 'lxg-badge' }, t('source.active')) : null,
                h('span', { className: 'lxg-dim' }, t('source.custom')),
              ),
              h('div', { className: 'lxg-source-sub' },
                [source.version ? t('source.version', { version: source.version }) : '', source.author ? t('source.author', { author: source.author }) : '', fmtSize(source.size)].filter(Boolean).join(' · '),
              ),
              source.description ? h('div', { className: 'lxg-source-desc' }, source.description) : null,
            ),
            h('div', { className: 'lxg-source-actions' },
              source.active
                ? h('span', { className: 'lxg-status lxg-status-ok' }, t('source.active'))
                : h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm', onClick: () => activate(source), disabled: busy }, t('source.activate')),
              pendingDelete === source.id
                ? h('button', { type: 'button', className: 'lxg-btn lxg-btn-sm lxg-btn-danger', onClick: () => deleteSource(source, true), disabled: busy }, t('common.confirm'))
                : h('button', { type: 'button', className: 'lxg-icon-btn', title: t('source.delete'), 'aria-label': t('source.delete'), onClick: () => deleteSource(source, false), disabled: busy }, h(Icon, { name: 'trash', size: 15 })),
            ),
          ))),
        h('p', { className: 'lxg-hint' }, t('common.note')),
      )

      const sourcesTab = h('div', { className: 'lxg-pane' },
        activeSourceCard,
        importCard,
        sourceList,
        playlistCard,
        settingsCard,
      )

      return h('div', { className: 'lxg' },
        h('style', null, `
          .lxg { display:flex; flex-direction:column; gap:14px; width:100%; max-width:900px; color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; padding:4px 0 36px; box-sizing:border-box; }
          .lxg * { box-sizing:border-box; }
          .lxg-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
          .lxg-brand { display:flex; gap:11px; align-items:flex-start; min-width:0; }
          .lxg-title-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .lxg-title { margin:0; font-size:17px; font-weight:650; letter-spacing:.01em; }
          .lxg-version { font-size:11px; padding:1px 6px; border-radius:99px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
          .lxg-subtitle { margin:2px 0 0; color:var(--dsw-alias-label-secondary); font-size:12px; }
          .lxg-tabs { display:flex; gap:4px; border-bottom:1px solid var(--dsw-alias-border-l1); padding-bottom:0; }
          .lxg-tab { appearance:none; border:0; background:transparent; color:var(--dsw-alias-label-secondary); font:inherit; display:flex; align-items:center; gap:6px; padding:8px 11px 9px; border-bottom:2px solid transparent; cursor:pointer; margin-bottom:-1px; }
          .lxg-tab:hover { color:var(--dsw-alias-label-primary); }
          .lxg-tab-active { color:var(--dsw-alias-brand-primary); border-bottom-color:var(--dsw-alias-brand-primary); }
          .lxg-pane { display:flex; flex-direction:column; gap:14px; }
          .lxg-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:11px; padding:13px 14px; display:flex; flex-direction:column; gap:10px; }
          .lxg-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
          .lxg-card-title { font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary); letter-spacing:.03em; }
          .lxg-card-name { font-size:15px; font-weight:650; margin-top:2px; }
          .lxg-card-sub { font-size:12px; color:var(--dsw-alias-label-secondary); margin-top:1px; }
          .lxg-card-desc { font-size:12px; color:var(--dsw-alias-label-secondary); margin-top:5px; }
          .lxg-card-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
          .lxg-status { font-size:11px; padding:2px 7px; border-radius:99px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); white-space:nowrap; }
          .lxg-status-ok { color:var(--dsw-alias-state-success-primary); }
          .lxg-badge { font-size:10px; padding:1px 6px; border-radius:99px; background:var(--dsw-alias-brand-primary); color:#fff; }
          .lxg-chip { font-size:11px; padding:2px 7px; border-radius:6px; border:1px solid var(--dsw-alias-border-l1); color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); white-space:nowrap; }
          .lxg-chip-lg { font-size:11px; padding:3px 8px; }
          .lxg-platforms { display:flex; flex-wrap:wrap; gap:6px; }
          .lxg-btn { appearance:none; display:inline-flex; align-items:center; justify-content:center; gap:6px; height:30px; padding:0 11px; border-radius:7px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
          .lxg-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2); }
          .lxg-btn:disabled { opacity:.45; cursor:not-allowed; }
          .lxg-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:#fff; }
          .lxg-btn-primary:hover:not(:disabled) { filter:brightness(1.06); background:var(--dsw-alias-brand-primary); }
          .lxg-btn-sm { height:26px; padding:0 9px; font-size:11.5px; }
          .lxg-btn-danger { color:var(--dsw-alias-state-error-primary); border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }
          .lxg-icon-btn { appearance:none; border:0; background:transparent; color:var(--dsw-alias-label-secondary); padding:5px; border-radius:6px; cursor:pointer; display:inline-flex; }
          .lxg-icon-btn:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-error-primary); }
          .lxg-link { appearance:none; border:0; background:transparent; color:var(--dsw-alias-brand-primary); font:inherit; font-size:11.5px; padding:2px 0; cursor:pointer; }
          .lxg-searchbar { display:flex; gap:8px; align-items:center; }
          .lxg-search-input { flex:1; min-width:150px; display:flex; align-items:center; gap:7px; height:34px; padding:0 10px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-secondary); }
          .lxg-search-input input { flex:1; min-width:0; border:0; outline:0; background:transparent; color:var(--dsw-alias-label-primary); font:inherit; font-size:13px; }
          .lxg-search-input:focus-within { border-color:var(--dsw-alias-brand-primary); }
          .lxg-select, .lxg-input { height:34px; padding:0 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; outline:none; }
          .lxg-select:focus, .lxg-input:focus { border-color:var(--dsw-alias-brand-primary); }
          .lxg-input-filter { width:150px; height:28px; }
          .lxg-hint { margin:0; font-size:11.5px; color:var(--dsw-alias-label-secondary); }
          .lxg-dim { color:var(--dsw-alias-label-secondary); font-size:11px; }
          .lxg-banner { display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:8px; font-size:12px; border:1px solid var(--dsw-alias-border-l1); }
          .lxg-banner-error { background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); color:var(--dsw-alias-state-error-primary); }
          .lxg-banner-warn { background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent); color:var(--dsw-alias-state-warn-primary); }
          .lxg-grow { flex:1; min-width:0; }
          .lxg-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; text-align:center; padding:34px 16px; border:1px dashed var(--dsw-alias-border-l1); border-radius:10px; color:var(--dsw-alias-label-secondary); }
          .lxg-empty p { margin:0; max-width:420px; }
          .lxg-empty-small { padding:22px 14px; }
          .lxg-results { display:flex; flex-direction:column; gap:8px; }
          .lxg-results-meta { display:flex; justify-content:space-between; font-size:11.5px; color:var(--dsw-alias-label-secondary); padding:0 2px; }
          .lxg-song-list { display:flex; flex-direction:column; border:1px solid var(--dsw-alias-border-l1); border-radius:10px; overflow:hidden; background:var(--dsw-alias-bg-layer-1); }
          .lxg-song { display:flex; gap:10px; align-items:center; padding:9px 11px; border-bottom:1px solid var(--dsw-alias-border-l1); min-width:0; }
          .lxg-song:last-child { border-bottom:0; }
          .lxg-song:hover { background:var(--dsw-alias-bg-layer-2); }
          .lxg-cover { width:38px; height:38px; border-radius:7px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); display:flex; align-items:center; justify-content:center; flex:0 0 auto; overflow:hidden; }
          .lxg-cover img { width:100%; height:100%; object-fit:cover; display:block; }
          .lxg-song-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
          .lxg-song-name { font-size:13px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .lxg-song-sub { font-size:11.5px; color:var(--dsw-alias-label-secondary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .lxg-tags { display:flex; gap:4px; flex-wrap:wrap; margin-top:1px; }
          .lxg-tag { font-size:10px; line-height:15px; padding:0 5px; border-radius:4px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
          .lxg-tag-active { color:var(--dsw-alias-brand-primary); outline:1px solid var(--dsw-alias-brand-primary); }
          .lxg-song-action { flex:0 0 auto; display:flex; align-items:center; justify-content:flex-end; min-width:86px; }
          .lxg-job { display:flex; flex-direction:column; gap:3px; width:110px; align-items:flex-end; }
          .lxg-job-line { display:flex; gap:7px; align-items:center; }
          .lxg-job-text { font-size:11px; display:flex; align-items:center; gap:3px; }
          .lxg-job-sub { font-size:10px; color:var(--dsw-alias-label-secondary); max-width:150px; }
          .lxg-job-done { color:var(--dsw-alias-state-success-primary); align-items:flex-end; }
          .lxg-job-error { color:var(--dsw-alias-state-error-primary); align-items:flex-end; }
          .lxg-progress { width:100%; height:3px; border-radius:99px; background:var(--dsw-alias-bg-layer-2); overflow:hidden; }
          .lxg-progress span { display:block; height:100%; background:var(--dsw-alias-brand-primary); transition:width .25s ease; }
          .lxg-pager { display:flex; align-items:center; justify-content:center; gap:10px; }
          .lxg-pager-text { font-size:11.5px; color:var(--dsw-alias-label-secondary); }
          .lxg-filters { display:flex; gap:6px; align-items:center; }
          .lxg-source-list { display:flex; flex-direction:column; max-height:420px; overflow:auto; border:1px solid var(--dsw-alias-border-l1); border-radius:9px; }
          .lxg-source { display:flex; gap:10px; align-items:flex-start; padding:9px 11px; border-bottom:1px solid var(--dsw-alias-border-l1); }
          .lxg-source:last-child { border-bottom:0; }
          .lxg-source:hover { background:var(--dsw-alias-bg-layer-2); }
          .lxg-source-active { background:color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, transparent); }
          .lxg-source-main { flex:1; min-width:0; }
          .lxg-source-title { display:flex; align-items:center; gap:7px; min-width:0; }
          .lxg-source-name { font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .lxg-source-sub { font-size:10.5px; color:var(--dsw-alias-label-secondary); margin-top:1px; }
          .lxg-source-desc { font-size:11px; color:var(--dsw-alias-label-secondary); margin-top:3px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
          .lxg-source-actions { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
          .lxg-playlist-list { display:flex; flex-direction:column; border:1px solid var(--dsw-alias-border-l1); border-radius:9px; overflow:hidden; }
          .lxg-playlist { display:flex; gap:10px; align-items:center; padding:9px 11px; border-bottom:1px solid var(--dsw-alias-border-l1); }
          .lxg-playlist:last-child { border-bottom:0; }
          .lxg-playlist:hover { background:var(--dsw-alias-bg-layer-2); }
          .lxg-playlist-main { flex:1; min-width:0; }
          .lxg-playlist-title { display:flex; align-items:center; gap:7px; min-width:0; }
          .lxg-playlist-name { font-size:12.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .lxg-playlist-sub { font-size:10.5px; color:var(--dsw-alias-label-secondary); margin-top:1px; }
          .lxg-playlist-actions { display:flex; align-items:center; gap:4px; flex:0 0 auto; }
          .lxg-import { display:flex; flex-direction:column; gap:8px; border-top:1px dashed var(--dsw-alias-border-l1); padding-top:10px; }
          .lxg-import-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
          .lxg-file { position:relative; overflow:hidden; }
          .lxg-file input { position:absolute; inset:0; opacity:0; cursor:pointer; }
          .lxg-file-name { font-size:11px; color:var(--dsw-alias-label-secondary); }
          .lxg-textarea { width:100%; min-height:110px; resize:vertical; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; padding:8px 9px; outline:none; }
          .lxg-textarea:focus { border-color:var(--dsw-alias-brand-primary); }
          .lxg-row-end { display:flex; justify-content:flex-end; }
          .lxg-row-between { display:flex; align-items:center; justify-content:space-between; gap:10px; }
          .lxg-form { display:flex; flex-direction:column; gap:10px; }
          .lxg-form-row { display:flex; gap:10px; flex-wrap:wrap; }
          .lxg-field { display:flex; flex-direction:column; gap:4px; flex:1; min-width:130px; font-size:11.5px; color:var(--dsw-alias-label-secondary); }
          .lxg-field small { font-size:10.5px; color:var(--dsw-alias-label-secondary); }
          .lxg-logs { margin:0; padding:9px; max-height:190px; overflow:auto; border-radius:8px; background:var(--dsw-alias-bg-base); border:1px solid var(--dsw-alias-border-l1); font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; white-space:pre-wrap; }
          .lxg-ellipsis { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
          .lxg-toast { align-self:flex-start; font-size:11.5px; color:var(--dsw-alias-state-success-primary); }
          @media (max-width: 620px) { .lxg-searchbar { flex-wrap:wrap; } .lxg-search-input { flex-basis:100%; } .lxg-song-action { min-width:70px; } .lxg-job { width:92px; } }
        `),
        header,
        banner,
        runtimeBanner,
        tabs,
        tab === 'search' ? searchTab : sourcesTab,
        toast ? h('div', { className: 'lxg-toast', role: 'status' }, toast) : null,
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        const locale = ctx.get('locale')
        if (!slots) return
        if (locale && typeof locale.register === 'function') {
          ctx.effect(() => locale.register('lx-geteer', { zh: ZH, en: EN }), 'dsh-lx-geteer: locale')
        }

        // One right-sidebar tab type, reused for every song. keepMounted keeps
        // the <audio> element alive while the user switches sidebar tabs.
        const tabTypes = ctx.get('sidebarRightTabs')
        if (tabTypes && typeof tabTypes.register === 'function') {
          ctx.effect(() => tabTypes.register({
            id: PLAYER_KIND,
            kind: PLAYER_KIND,
            priority: 'extension',
            title: () => translate(locale, 'player.tabTitle'),
            keepMounted: true,
          }), 'dsh-lx-geteer: player tab type')
        }

        // A second tab type: the music hub (search + playlists), reachable from
        // the right dock's guide as well as from the left rail entry below.
        if (tabTypes && typeof tabTypes.register === 'function') {
          ctx.effect(() => tabTypes.register({
            id: MUSIC_KIND,
            kind: MUSIC_KIND,
            priority: 'extension',
            title: () => translate(locale, 'music.tabTitle'),
            keepMounted: true,
            guide: [{
              id: 'music',
              order: 40,
              title: () => translate(locale, 'music.title'),
              description: () => translate(locale, 'music.guide'),
              icon: MusicRailIcon,
            }],
          }), 'dsh-lx-geteer: music tab type')
        }

        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'lx-geteer', order: 32, label: () => translate(locale, 'nav.label') },
          () => h(Panel, { ctx }),
        ))

        slots.inject('sidebar.right.pane.tab', () => slots.register(
          { name: 'sidebar.right.pane.tab', key: PLAYER_KIND },
          () => h(PlayerTab, { ctx }),
        ))

        slots.inject('sidebar.right.pane.tab.title', () => slots.register(
          { name: 'sidebar.right.pane.tab.title', key: PLAYER_KIND },
          () => h(PlayerTitle, { ctx }),
        ))

        slots.inject('sidebar.right.pane.tab', () => slots.register(
          { name: 'sidebar.right.pane.tab', key: MUSIC_KIND },
          () => h(MusicPage, { ctx, embedded: true }),
        ))

        slots.inject('sidebar.right.pane.tab.title', () => slots.register(
          { name: 'sidebar.right.pane.tab.title', key: MUSIC_KIND },
          () => h('span', { className: 'lxgp-tab-title' }, translate(locale, 'music.tabTitle')),
        ))

        slots.inject('conversation.input.left', () => slots.register(
          { name: 'conversation.input.left', id: 'lx-geteer-quality', order: 6, label: () => translate(locale, 'quality.title') },
          () => h(QualityButton, { ctx }),
        ))

        slots.inject('conversation.input.left', () => slots.register(
          { name: 'conversation.input.left', id: 'lx-geteer-platform', order: 7, label: () => translate(locale, 'platform.title') },
          () => h(PlatformButton, { ctx }),
        ))

        // Left rail entry: a panellist row plus the `main` panel it selects.
        // Both registrations live in the page context that owns `layout`.
        if (typeof ctx.inject === 'function') {
          ctx.inject(['layout'], (pageCtx) => {
            const pageSlots = pageCtx.slots
            if (!pageSlots || typeof pageSlots.register !== 'function') return undefined
            const stopMain = pageSlots.inject('main', () => pageSlots.register(
              { name: 'main', key: MUSIC_PANEL_ID },
              () => h(MusicPage, { ctx }),
            ))
            const stopRail = pageSlots.inject('sidebar.panellist', () => pageSlots.register(
              {
                name: 'sidebar.panellist',
                id: MUSIC_PANEL_ID,
                order: 6,
                label: () => translate(locale, 'music.title'),
              },
              MusicRailIcon,
            ))
            return () => {
              stopRail()
              stopMain()
            }
          })
        }

        // Poll the Host player state; a new ready revision opens/focuses the
        // player tab and the tab's own effect starts playback.
        let lastOpenedRevision = -1
        let lastPlayerRevision = -1
        let warnedNoSidebar = false
        let warnedOpenFailure = false
        const pollPlayer = async () => {
          let data
          try {
            data = await api('player')
          } catch {
            return
          }
          const player = data && data.player
          if (!player) return
          if (player.revision !== lastPlayerRevision) {
            lastPlayerRevision = player.revision
            playerStore.set(player)
          }
          if (player.status !== 'ready' || !(player.revision > lastOpenedRevision)) return
          const sidebar = resolveSidebarRight(ctx)
          if (!sidebar) {
            if (!warnedNoSidebar) {
              warnedNoSidebar = true
              console.warn('[lx-geteer] sidebarRight is unavailable; the player tab cannot be opened automatically')
            }
            return
          }
          try {
            await sidebar.openTab(PLAYER_KIND, { revealIfOpened: true })
            lastOpenedRevision = player.revision
          } catch (error) {
            // No on-screen Session yet; the next poll retries. Report once so a
            // permanent wiring problem is visible instead of silent.
            if (!warnedOpenFailure) {
              warnedOpenFailure = true
              console.warn('[lx-geteer] could not open the player tab:', error && error.message ? error.message : error)
            }
          }
        }
        ctx.effect(() => {
          let stopped = false
          pollPlayer()
          const timer = setInterval(() => {
            if (!stopped) pollPlayer()
          }, 1500)
          return () => {
            stopped = true
            clearInterval(timer)
          }
        }, 'dsh-lx-geteer: player watcher')
      },
    }
  },
})
