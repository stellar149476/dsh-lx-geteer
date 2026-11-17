/**
 * Host safety net for transient network failures.
 *
 * The DSH launcher arms a "fail loud" guard before booting the plugin tree:
 * every unhandled rejection and every uncaught exception exits the host with
 * code 1 (`installFailLoud` in @deepseek-ai/dsh-app-boot). The Electron shell
 * then relaunches the host, and the window the user was working in is gone.
 *
 * Audio streaming makes that guard fire on ordinary events: an upstream CDN
 * dropping a half-downloaded response, a listener seeking away and tearing the
 * old connection down, a proxy timing out mid-body. None of them leave the host
 * corrupt.
 *
 * This module downgrades exactly those failures to a log line, and forwards
 * everything else to the guards the launcher installed, so a real defect still
 * fails loudly instead of running on in a broken state.
 */

const INSTALLED = Symbol.for('dsh-lx-geteer.host-safety')

const TRANSIENT_CODES = new Set([
  'ABORT_ERR',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EAI_AGAIN',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ERR_HTTP_HEADERS_SENT',
  'ERR_SOCKET_CLOSED',
  'ERR_STREAM_ALREADY_FINISHED',
  'ERR_STREAM_DESTROYED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ERR_STREAM_WRITE_AFTER_END',
  'ESOCKETTIMEDOUT',
  'ETIMEDOUT',
  'UND_ERR_ABORTED',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CLOSED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

const TRANSIENT_TEXT = [
  'client network socket disconnected',
  'fetch failed',
  'headers sent',
  'other side closed',
  'premature close',
  'request to ',
  'socket hang up',
  'stream closed',
  'terminated',
  'write after end',
]

function describe(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

function isTransient(error, depth = 0) {
  if (error === null || error === undefined || depth > 4) return false
  if (typeof error !== 'object') return false
  const code = typeof error.code === 'string' ? error.code : ''
  if (code && TRANSIENT_CODES.has(code)) return true
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return true
  const message = typeof error.message === 'string' ? error.message.toLowerCase() : ''
  if (message && TRANSIENT_TEXT.some((needle) => message.includes(needle))) return true
  return isTransient(error.cause, depth + 1)
}

/**
 * Take over the process-level failure handlers once per host process.
 *
 * Only transient network/stream failures are swallowed; every other failure is
 * handed to the launcher's guard unchanged, keeping its diagnostic and exit.
 */
export function installHostSafety(log = (...args) => console.log('[lx-geteer]', ...args)) {
  if (globalThis[INSTALLED]) return
  globalThis[INSTALLED] = true

  const rejectionGuards = process.listeners('unhandledRejection')
  const exceptionGuards = process.listeners('uncaughtException')
  process.removeAllListeners('unhandledRejection')
  process.removeAllListeners('uncaughtException')

  const forward = (guards, error, label) => {
    if (isTransient(error)) {
      log(`忽略一次瞬时${label}：${describe(error)}`)
      return
    }
    if (guards.length > 0) {
      for (const guard of guards) {
        try {
          guard(error)
        } catch (guardError) {
          log(`致命错误处理失败：${describe(guardError)}`)
        }
      }
      return
    }
    // No launcher guard to forward to: keep the documented fail-loud contract.
    log(`致命${label}：${describe(error)}`)
    process.exitCode = 1
    setImmediate(() => process.exit(1))
  }

  process.on('unhandledRejection', (error) => {
    try {
      forward(rejectionGuards, error, '异步拒绝')
    } catch (handlerError) {
      log(`异步拒绝处理失败：${describe(handlerError)}`)
    }
  })

  process.on('uncaughtException', (error) => {
    try {
      forward(exceptionGuards, error, '未捕获异常')
    } catch (handlerError) {
      log(`未捕获异常处理失败：${describe(handlerError)}`)
    }
  })
}
