import vm from 'node:vm'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'

const DEFAULT_TIMEOUT_MS = 60_000
const INIT_TIMEOUT_MS = 15_000
const MAX_LOGS = 300
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return Buffer.from(String(value))
}

function normalizeError(error) {
  if (error instanceof Error) return error
  return new Error(String(error))
}

/**
 * One live LX Music custom source. The script receives the same
 * `globalThis.lx` surface LX Music exposes, backed by Node networking and
 * crypto, inside a `node:vm` realm with no `require`, `process`, or filesystem.
 */
export class LxRuntime {
  constructor({ source, script, timeoutMs = DEFAULT_TIMEOUT_MS, onLog = null }) {
    this.source = source
    this.script = script
    this.timeoutMs = Math.max(5_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
    this.onLog = onLog
    this.logs = []
    this.handlers = new Map()
    this.inited = null
    this.updateNotice = null
    this.context = null
    this.disposed = false
    this.timers = new Set()
    this.intervals = new Set()
    this.controllers = new Set()
    this.queue = Promise.resolve()
    this.startedAt = 0
  }

  log(level, args) {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${args.map((x) => {
      if (typeof x === 'string') return x
      try {
        return JSON.stringify(x)
      } catch {
        return String(x)
      }
    }).join(' ')}`
    this.logs.push({ level, line })
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS)
    if (this.onLog) {
      try {
        this.onLog(level, line)
      } catch {
        /* host logger must never break a source */
      }
    }
  }

  makeConsole() {
    const make = (level) => (...args) => {
      this.log(level, args)
      if (level === 'error') console.error(`[lx-geteer:${this.source.name}]`, ...args)
    }
    const c = {
      log: make('log'),
      info: make('info'),
      warn: make('warn'),
      error: make('error'),
      debug: make('debug'),
      trace: make('debug'),
      dir: make('log'),
      table: make('log'),
      group: make('log'),
      groupCollapsed: make('log'),
      groupEnd: () => {},
      time: () => {},
      timeEnd: () => {},
      assert: () => {},
    }
    return c
  }

  trackTimeout(fn, delay, ...args) {
    const id = setTimeout(() => {
      this.timers.delete(id)
      if (this.disposed) return
      try {
        fn(...args)
      } catch (error) {
        this.log('error', ['setTimeout callback failed:', String(error && error.message || error)])
      }
    }, delay)
    this.timers.add(id)
    return id
  }

  trackInterval(fn, delay, ...args) {
    const id = setInterval(() => {
      if (this.disposed) return
      try {
        fn(...args)
      } catch (error) {
        this.log('error', ['setInterval callback failed:', String(error && error.message || error)])
      }
    }, delay)
    this.intervals.add(id)
    return id
  }

  clearTrackedTimeout(id) {
    clearTimeout(id)
    this.timers.delete(id)
  }

  clearTrackedInterval(id) {
    clearInterval(id)
    this.intervals.delete(id)
  }

  makeRequest() {
    return (url, options = {}, callback = () => {}) => {
      // A disposed runtime must not start (or finish) work: the source is
      // already torn down, and its late continuations are exactly what used to
      // take the host down with an unhandled rejection.
      if (this.disposed) return () => {}
      const controller = new AbortController()
      this.controllers.add(controller)
      const timeout = Math.max(2_000, Number(options.timeout) || this.timeoutMs)
      const timer = setTimeout(() => {
        controller.abort(new Error(`请求超时（${timeout} ms）`))
      }, timeout)
      const headers = { 'User-Agent': DEFAULT_UA, ...(options.headers || {}) }
      const init = {
        method: String(options.method || 'GET').toUpperCase(),
        headers,
        signal: controller.signal,
        redirect: 'follow',
      }
      // A source callback that throws (or a late abort after the host disposed
      // the runtime) must never surface as an unhandled rejection: the host
      // treats those as fatal.
      let settled = false
      const settle = (error, result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.controllers.delete(controller)
        // Teardown aborts every in-flight request. Handing that abort error to
        // the source makes its own promise wrappers reject with nobody left to
        // catch them -- the "音源已停止" fatal crash on import timeout. Once the
        // runtime is disposed the callback is noise: drop it.
        if (this.disposed) {
          if (error) this.log('debug', ['停止后收到的请求结果已忽略：', String((error && error.message) || error)])
          return
        }
        try {
          callback(error, result)
        } catch (callbackError) {
          this.log('error', ['回调执行失败：', String((callbackError && callbackError.message) || callbackError)])
        }
      }
      try {
        if (options.form) {
          init.body = new URLSearchParams(options.form).toString()
          if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
          }
        } else if (options.formData) {
          const form = new FormData()
          for (const [key, value] of Object.entries(options.formData)) {
            if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
              form.append(key, new Blob([value]), 'blob')
            } else if (Array.isArray(value)) {
              for (const item of value) form.append(key, String(item))
            } else {
              form.append(key, String(value))
            }
          }
          init.body = form
        } else if (options.body !== undefined && options.body !== null) {
          if (typeof options.body === 'string' || Buffer.isBuffer(options.body) || options.body instanceof Uint8Array) {
            init.body = options.body
          } else {
            init.body = JSON.stringify(options.body)
            if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
              headers['Content-Type'] = 'application/json'
            }
          }
        }
      } catch (error) {
        queueMicrotask(() => settle(normalizeError(error)))
        return () => {}
      }

      fetch(url, init)
        .then(async (response) => {
          const text = await response.text()
          let body = text
          try {
            body = JSON.parse(text)
          } catch {
            /* LX Music leaves non-JSON bodies as text */
          }
          const responseHeaders = {}
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value
          })
          if (typeof response.headers.getSetCookie === 'function') {
            const cookies = response.headers.getSetCookie()
            if (cookies.length) responseHeaders['set-cookie'] = cookies
          }
          settle(null, {
            statusCode: response.status,
            status: response.status,
            headers: responseHeaders,
            body,
          })
        })
        .catch((error) => {
          const message = error && error.name === 'AbortError'
            ? new Error(`请求超时（${timeout} ms）`)
            : normalizeError(error)
          settle(message)
        })
        .finally(() => {
          clearTimeout(timer)
          this.controllers.delete(controller)
        })

      return () => {
        clearTimeout(timer)
        this.controllers.delete(controller)
        controller.abort(new Error('请求已取消'))
      }
    }
  }

  makeUtils() {
    return {
      buffer: {
        from: (...args) => Buffer.from(...args),
        bufToString: (buffer, format) => asBuffer(buffer).toString(format),
      },
      crypto: {
        aesEncrypt: (buffer, mode, key, iv) => {
          const cipher = crypto.createCipheriv(mode, key, iv)
          return Buffer.concat([cipher.update(asBuffer(buffer)), cipher.final()])
        },
        md5: (value) => crypto.createHash('md5').update(String(value)).digest('hex'),
        randomBytes: (size) => crypto.randomBytes(Number(size) || 16).toString('hex'),
        rsaEncrypt: (buffer, key) => crypto.publicEncrypt(
          { key, padding: crypto.constants.RSA_NO_PADDING },
          asBuffer(buffer),
        ),
      },
      zlib: {
        inflate: (buffer) => new Promise((resolve, reject) => {
          zlib.inflate(asBuffer(buffer), (error, result) => (error ? reject(error) : resolve(result)))
        }),
        deflate: (buffer) => new Promise((resolve, reject) => {
          zlib.deflate(asBuffer(buffer), (error, result) => (error ? reject(error) : resolve(result)))
        }),
      },
    }
  }

  async start() {
    this.startedAt = Date.now()
    this.log('info', [`初始化音源：${this.source.name}`])
    let settleInit
    const initPromise = new Promise((resolve) => {
      settleInit = resolve
    })
    const lx = {
      version: '2.0.0',
      env: 'desktop',
      currentScriptInfo: {
        name: this.source.name,
        description: this.source.description || '',
        version: this.source.version || '',
        author: this.source.author || '',
        homepage: this.source.homepage || '',
        rawScript: this.script,
      },
      EVENT_NAMES: { inited: 'inited', request: 'request', updateAlert: 'updateAlert' },
      on: (name, fn) => {
        if (typeof fn !== 'function') throw new Error(`lx.on(${name}) 需要一个函数`)
        this.handlers.set(name, fn)
        return () => this.handlers.delete(name)
      },
      send: (name, data) => {
        if (name === 'inited') {
          if (this.inited) return
          this.inited = data && typeof data === 'object' ? data : { sources: {} }
          settleInit(true)
          return
        }
        if (name === 'updateAlert') {
          this.updateNotice = data || null
          return
        }
        this.log('debug', [`未处理的事件：${String(name)}`])
      },
      request: this.makeRequest(),
      utils: this.makeUtils(),
    }

    const sandbox = {
      console: this.makeConsole(),
      setTimeout: (fn, delay, ...args) => this.trackTimeout(fn, delay, ...args),
      clearTimeout: (id) => this.clearTrackedTimeout(id),
      setInterval: (fn, delay, ...args) => this.trackInterval(fn, delay, ...args),
      clearInterval: (id) => this.clearTrackedInterval(id),
      queueMicrotask: (fn) => queueMicrotask(() => {
        // A throwing microtask would surface as an uncaughtException, which the
        // host escalates to a fatal exit; keep third-party callbacks contained.
        if (this.disposed) return
        try {
          fn()
        } catch (error) {
          this.log('error', ['queueMicrotask 回调执行失败：', String((error && error.message) || error)])
        }
      }),
      Buffer,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      AbortController,
      Blob,
      FormData,
      btoa: (value) => Buffer.from(String(value), 'binary').toString('base64'),
      atob: (value) => Buffer.from(String(value), 'base64').toString('binary'),
      document: { currentScript: { textContent: this.script, src: '' } },
      lx,
    }
    sandbox.globalThis = sandbox
    sandbox.window = sandbox
    sandbox.self = sandbox

    this.context = vm.createContext(sandbox)
    try {
      vm.runInContext(this.script, this.context, {
        filename: `lx-source-${this.source.id}.js`,
        timeout: 20_000,
      })
    } catch (error) {
      this.dispose()
      throw new Error(`脚本执行失败：${error && error.message ? error.message : String(error)}`)
    }

    let initTimer = null
    const timeout = new Promise((resolve) => {
      initTimer = setTimeout(() => resolve(false), INIT_TIMEOUT_MS)
      initTimer.unref?.()
    })
    await Promise.race([initPromise, timeout])
    if (initTimer) clearTimeout(initTimer)
    if (!this.inited) {
      const lastError = this.logs.filter((x) => x.level === 'error').slice(-1)[0]
      this.dispose()
      throw new Error(`音源 ${INIT_TIMEOUT_MS / 1000} 秒内没有发送 inited 事件${lastError ? `（${lastError.line}）` : ''}`)
    }
    const sources = this.inited.sources
    if (!sources || typeof sources !== 'object' || Array.isArray(sources)) {
      this.dispose()
      throw new Error('inited 事件缺少 sources 对象')
    }
    this.sources = sources
    this.log('info', [`已就绪，平台：${Object.keys(sources).join(', ') || '无'}`])
    return this
  }

  support() {
    if (!this.sources) return []
    return Object.entries(this.sources)
      .filter(([, value]) => value && typeof value === 'object')
      .map(([key, value]) => ({
        platform: key,
        name: value.name || key,
        type: value.type || 'music',
        actions: Array.isArray(value.actions) ? value.actions : ['musicUrl'],
        qualities: Array.isArray(value.qualitys) ? value.qualitys.filter((q) => typeof q === 'string' && q) : [],
      }))
  }

  async musicUrl(sourceKey, quality, musicInfo) {
    if (this.disposed) throw new Error('音源已停止')
    const handler = this.handlers.get('request')
    if (typeof handler !== 'function') throw new Error('音源没有注册 request 处理器')
    if (!this.sources[sourceKey]) throw new Error(`当前音源不支持平台：${sourceKey}`)
    const task = () => new Promise((resolve, reject) => {
      let done = false
      const timer = setTimeout(() => {
        if (done) return
        done = true
        reject(new Error(`获取播放链接超时（${Math.round(this.timeoutMs / 1000)} 秒）`))
      }, this.timeoutMs)
      timer.unref?.()
      Promise.resolve()
        .then(() => handler({
          source: sourceKey,
          action: 'musicUrl',
          info: { type: quality, musicInfo },
        }))
        .then((url) => {
          if (done) return
          done = true
          clearTimeout(timer)
          if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
            reject(new Error('音源没有返回有效的 HTTP 播放链接'))
            return
          }
          resolve(url)
        })
        .catch((error) => {
          if (done) return
          done = true
          clearTimeout(timer)
          reject(normalizeError(error))
        })
    })
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const id of this.timers) clearTimeout(id)
    for (const id of this.intervals) clearInterval(id)
    for (const controller of this.controllers) {
      try {
        controller.abort(new Error('音源已停止'))
      } catch {
        /* ignore */
      }
    }
    this.timers.clear()
    this.intervals.clear()
    this.controllers.clear()
    this.handlers.clear()
    this.context = null
    this.log('info', ['音源已停止'])
  }
}

export { INIT_TIMEOUT_MS }
