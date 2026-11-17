import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import {
  dataDir, ensureDir, fileSize, parseScriptMeta, readJson, sha1, writeJson,
} from './util.js'

const DATA_VERSION = 2
const DEFAULT_SETTINGS = Object.freeze({
  downloadDir: '/sdcard/Music/lx-geteer',
  quality: '320k',
  platform: 'wy',
  playMode: 'list',
  pageSize: 30,
  requestTimeout: 45,
})

/**
 * Owns the user-imported source library and the preferences document.
 * This build intentionally ships **no** source scripts: every source in the
 * library was added by the user, so the list is exactly the import directory.
 */
export class SourceStore {
  constructor(packageDir) {
    this.packageDir = packageDir
    this.root = dataDir()
    this.dataFile = join(this.root, 'data.json')
    this.customDir = join(this.root, 'sources')
    this.data = null
  }

  load() {
    ensureDir(this.root)
    ensureDir(this.customDir)
    const previous = readJson(this.dataFile, {}) || {}
    this.data = {
      version: DATA_VERSION,
      activeSourceId: typeof previous.activeSourceId === 'string' ? previous.activeSourceId : '',
      settings: { ...DEFAULT_SETTINGS, ...(previous.settings || {}) },
      customSources: Array.isArray(previous.customSources) ? previous.customSources.filter((x) => x && typeof x.file === 'string') : [],
    }
    this.normalizeSettings()
    this.pruneMissingFiles()
    this.repairActive()
    this.save()
    return this
  }

  normalizeSettings() {
    const s = this.data.settings
    s.downloadDir = typeof s.downloadDir === 'string' && s.downloadDir.trim() ? s.downloadDir.trim() : DEFAULT_SETTINGS.downloadDir
    s.quality = typeof s.quality === 'string' && s.quality ? s.quality : DEFAULT_SETTINGS.quality
    s.platform = ['kw', 'tx', 'wy', 'kg', 'mg'].includes(s.platform) ? s.platform : DEFAULT_SETTINGS.platform
    s.playMode = ['single', 'list', 'shuffle', 'sequential'].includes(s.playMode) ? s.playMode : DEFAULT_SETTINGS.playMode
    s.pageSize = Math.min(50, Math.max(10, Number(s.pageSize) || DEFAULT_SETTINGS.pageSize))
    s.requestTimeout = Math.min(120, Math.max(10, Number(s.requestTimeout) || DEFAULT_SETTINGS.requestTimeout))
  }

  /** Drop metadata for scripts the user deleted from disk. */
  pruneMissingFiles() {
    this.data.customSources = this.data.customSources.filter((entry) => existsSync(join(this.customDir, entry.file)))
  }

  save() {
    writeJson(this.dataFile, this.data)
  }

  /** A source is selectable only while its imported script still exists. */
  repairActive() {
    const active = this.data.activeSourceId
    if (active && !this.data.customSources.some((s) => s.id === active)) this.data.activeSourceId = ''
  }

  getSettings() {
    return { ...this.data.settings }
  }

  updateSettings(patch = {}) {
    const next = { ...this.data.settings }
    if (typeof patch.downloadDir === 'string' && patch.downloadDir.trim()) next.downloadDir = patch.downloadDir.trim()
    if (typeof patch.quality === 'string' && patch.quality) next.quality = patch.quality
    if (typeof patch.platform === 'string' && ['kw', 'tx', 'wy', 'kg', 'mg'].includes(patch.platform)) next.platform = patch.platform
    if (typeof patch.playMode === 'string' && ['single', 'list', 'shuffle', 'sequential'].includes(patch.playMode)) next.playMode = patch.playMode
    if (patch.pageSize !== undefined) next.pageSize = Math.min(50, Math.max(10, Number(patch.pageSize) || 30))
    if (patch.requestTimeout !== undefined) next.requestTimeout = Math.min(120, Math.max(10, Number(patch.requestTimeout) || 45))
    this.data.settings = next
    this.normalizeSettings()
    this.save()
    return this.getSettings()
  }

  listSources() {
    return this.data.customSources.map((s) => ({
      id: s.id,
      builtin: false,
      category: '导入',
      name: s.name,
      description: s.description || '',
      version: s.version || '',
      author: s.author || '',
      homepage: s.homepage || '',
      size: s.size || fileSize(join(this.customDir, s.file)),
      active: s.id === this.data.activeSourceId,
      createdAt: s.createdAt || 0,
    }))
  }

  getSource(id) {
    const entry = this.data.customSources.find((s) => s.id === id)
    return entry ? { ...entry, builtin: false, category: '导入' } : null
  }

  getActiveId() {
    return this.data.activeSourceId
  }

  getActive() {
    return this.getSource(this.data.activeSourceId)
  }

  readScript(source) {
    const file = source.builtin ? null : join(this.customDir, source.file)
    if (!file) throw new Error('音源脚本不存在')
    return readFileSync(file, 'utf8')
  }

  setActive(id) {
    const source = this.getSource(id)
    if (!source) throw new Error('音源不存在')
    this.data.activeSourceId = id
    this.save()
    return source
  }

  addCustom(script, filename = '') {
    const text = String(script || '')
    if (text.length < 80) throw new Error('脚本内容太短，不像是 LX Music 自定义源')
    const meta = parseScriptMeta(text, filename ? basename(filename, extname(filename)) : '')
    if (!meta.name) throw new Error('脚本头部缺少 @name')
    const id = `custom-${sha1(text).slice(0, 12)}`
    const existing = this.data.customSources.find((s) => s.id === id)
    if (existing) throw new Error(`该音源已导入：${existing.name}`)
    const file = `${id}.js`
    writeFileSync(join(this.customDir, file), text, 'utf8')
    const entry = {
      id,
      file,
      category: '导入',
      name: meta.name,
      description: meta.description,
      version: meta.version,
      author: meta.author,
      homepage: meta.homepage,
      size: Buffer.byteLength(text),
      createdAt: Date.now(),
    }
    this.data.customSources.unshift(entry)
    this.save()
    return entry
  }

  removeCustom(id) {
    const index = this.data.customSources.findIndex((s) => s.id === id)
    if (index < 0) throw new Error('音源不存在')
    const [entry] = this.data.customSources.splice(index, 1)
    try {
      unlinkSync(join(this.customDir, entry.file))
    } catch {
      /* file already gone */
    }
    if (this.data.activeSourceId === id) this.data.activeSourceId = ''
    this.save()
    return entry
  }

  stat() {
    return { root: this.root, dataFile: this.dataFile, customDir: this.customDir, customCount: this.data.customSources.length }
  }
}

export { DEFAULT_SETTINGS }
