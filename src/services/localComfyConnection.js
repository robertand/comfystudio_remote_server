export const COMFY_CONNECTION_SETTING_KEY = 'comfyConnection'
export const COMFY_CONNECTION_LOCAL_KEY = 'comfystudio-comfy-connection'
export const COMFY_CONNECTION_CHANGED_EVENT = 'comfystudio-comfy-connection-changed'

export const LOCAL_COMFY_HOST = '127.0.0.1'
export const DEFAULT_COMFY_PORT = 8188

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

let cachedConnection = {
  protocol: 'http:',
  host: LOCAL_COMFY_HOST,
  port: DEFAULT_COMFY_PORT,
}
let hydrated = false
let hydrationPromise = null
let connectionVersion = 0

function normalizePort(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return null
  if (parsed < 1 || parsed > 65535) return null
  return parsed
}

function isLoopbackHost(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized) return false
  if (LOOPBACK_HOSTS.has(normalized)) return true
  if (!/^127(?:\.\d{1,3}){3}$/.test(normalized)) return false
  return normalized
    .split('.')
    .map((part) => Number(part))
    .every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
}

function buildConnection(connection) {
  const protocol = connection?.protocol || 'http:'
  const host = connection?.host || LOCAL_COMFY_HOST
  const port = normalizePort(connection?.port) || DEFAULT_COMFY_PORT

  const httpProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`
  const wsProtocol = httpProtocol === 'https:' ? 'wss:' : 'ws:'

  const isStandardPort = (httpProtocol === 'http:' && port === 80) || (httpProtocol === 'https:' && port === 443)
  const hostPort = isStandardPort ? host : `${host}:${port}`

  const isElectron = typeof window !== 'undefined' && !!window?.electronAPI?.isElectron

  if (!isElectron && typeof window !== 'undefined') {
    // In web browser, use the dynamic Vite proxy to bypass CORS and iframe restrictions.
    // Format: /comfy-proxy/{protocol-no-colon}/{host}/{port}
    const protoNoColon = httpProtocol.replace(':', '')
    const proxyPath = `/comfy-proxy/${protoNoColon}/${host}/${port}`

    // WebSocket requires an absolute URL.
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}${proxyPath}`

    return {
      protocol: httpProtocol,
      host,
      port,
      httpBase: proxyPath,
      wsBase: wsBase,
    }
  }

  return {
    protocol: httpProtocol,
    host,
    port,
    httpBase: `${httpProtocol}//${hostPort}`,
    wsBase: `${wsProtocol}//${hostPort}`,
  }
}

function readLocalStorageConnection() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(COMFY_CONNECTION_LOCAL_KEY)
    if (!raw) return null
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = raw
    }
    const fromStored = parseStoredConnectionValue(parsed)
    return fromStored.success ? fromStored.config : null
  } catch {
    return null
  }
}

function writeLocalStorageConnection(config) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(COMFY_CONNECTION_LOCAL_KEY, JSON.stringify(config))
  } catch {
    // Ignore storage write failures.
  }
}

function dispatchConnectionChanged(config) {
  try {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
    window.dispatchEvent(new CustomEvent(COMFY_CONNECTION_CHANGED_EVENT, { detail: config }))
  } catch {
    // Ignore event dispatch failures.
  }
}

function parseStoredConnectionValue(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.host && raw.port !== undefined) {
      const normalizedPort = normalizePort(raw.port)
      if (normalizedPort) {
        return {
          success: true,
          config: {
            protocol: raw.protocol || 'http:',
            host: raw.host,
            port: normalizedPort,
          },
        }
      }
    }
    if (raw.httpBase) {
      return parseLocalComfyPortInput(raw.httpBase)
    }
    if (raw.url) {
      return parseLocalComfyPortInput(raw.url)
    }
  }
  if (typeof raw === 'number') {
    const normalized = normalizePort(raw)
    if (normalized) {
      return {
        success: true,
        config: { protocol: 'http:', host: LOCAL_COMFY_HOST, port: normalized },
      }
    }
  }
  if (typeof raw === 'string') {
    return parseLocalComfyPortInput(raw)
  }
  return { success: false, error: 'No local ComfyUI setting found' }
}

function hydrateFromLocalStorage() {
  const fromLocalStorage = readLocalStorageConnection()
  if (fromLocalStorage) {
    cachedConnection = fromLocalStorage
  }
}

hydrateFromLocalStorage()

export function parseLocalComfyPortInput(input) {
  const raw = String(input ?? '').trim()
  if (!raw) {
    return {
      success: true,
      config: { protocol: 'http:', host: LOCAL_COMFY_HOST, port: DEFAULT_COMFY_PORT },
    }
  }

  if (/^\d+$/.test(raw)) {
    const port = normalizePort(raw)
    if (!port) {
      return { success: false, error: 'Port must be between 1 and 65535.' }
    }
    return {
      success: true,
      config: { protocol: 'http:', host: LOCAL_COMFY_HOST, port },
    }
  }

  let candidate = raw
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `http://${candidate}`
  }

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: 'Use an http or https URL.' }
    }
    const port = normalizePort(parsed.port || (parsed.protocol === 'https:' ? 443 : DEFAULT_COMFY_PORT))
    if (!port) {
      return { success: false, error: 'Port must be between 1 and 65535.' }
    }
    return {
      success: true,
      config: {
        protocol: parsed.protocol,
        host: parsed.hostname,
        port,
      },
    }
  } catch {
    return { success: false, error: 'Invalid value. Use a port like 8188 or a URL.' }
  }
}

export function isLoopbackHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return isLoopbackHost(parsed.hostname)
  } catch {
    return false
  }
}

export function getLocalComfyConnectionSync() {
  return buildConnection(cachedConnection)
}

export function getLocalComfyHttpBaseSync() {
  return getLocalComfyConnectionSync().httpBase
}

export function getLocalComfyWsBaseSync() {
  return getLocalComfyConnectionSync().wsBase
}

export async function hydrateLocalComfyConnection() {
  if (hydrated) {
    return getLocalComfyConnectionSync()
  }
  if (hydrationPromise) {
    return hydrationPromise
  }

  hydrationPromise = (async () => {
    const startVersion = connectionVersion
    hydrateFromLocalStorage()

    if (typeof window !== 'undefined' && window?.electronAPI?.getSetting) {
      try {
        const stored = await window.electronAPI.getSetting(COMFY_CONNECTION_SETTING_KEY)
        let parsed = parseStoredConnectionValue(stored)

        // Legacy migration path if previous versions ever stored a free-form URL key.
        if (!parsed.success) {
          const legacyUrl = await window.electronAPI.getSetting('comfyUrl')
          parsed = parseStoredConnectionValue(legacyUrl)
        }

        if (parsed.success && startVersion === connectionVersion) {
          cachedConnection = parsed.config
          writeLocalStorageConnection(cachedConnection)
        }
      } catch {
        // Ignore settings read failures and keep local/default values.
      }
    }

    hydrated = true
    const config = getLocalComfyConnectionSync()
    hydrationPromise = null
    return config
  })()

  return hydrationPromise
}

export async function saveLocalComfyConnectionPort(input) {
  const parsed = parseLocalComfyPortInput(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }

  connectionVersion += 1
  cachedConnection = parsed.config
  const config = getLocalComfyConnectionSync()
  writeLocalStorageConnection(cachedConnection)

  try {
    if (typeof window !== 'undefined' && window?.electronAPI?.setSetting) {
      await window.electronAPI.setSetting(COMFY_CONNECTION_SETTING_KEY, {
        protocol: config.protocol,
        host: config.host,
        port: config.port,
      })
    }
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'Failed to persist local ComfyUI setting.',
    }
  }

  dispatchConnectionChanged(config)
  return { success: true, config }
}

export const saveComfyConnection = saveLocalComfyConnectionPort

export async function checkLocalComfyConnection(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 4500
  let config
  if (options.config) {
    config = buildConnection(options.config)
  } else if (options.port) {
    const normalizedPort = normalizePort(options.port)
    if (!normalizedPort) {
      return { ok: false, error: 'Invalid local ComfyUI port.' }
    }
    config = buildConnection({ ...cachedConnection, port: normalizedPort })
  } else {
    config = getLocalComfyConnectionSync()
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => {
    if (controller) controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(`${config.httpBase}/system_stats`, {
      signal: controller?.signal,
    })
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        httpBase: config.httpBase,
        port: config.port,
      }
    }
    return {
      ok: false,
      status: response.status,
      httpBase: config.httpBase,
      port: config.port,
      error: `ComfyUI returned HTTP ${response.status}.`,
    }
  } catch (err) {
    const isTimeout = err?.name === 'AbortError'
    return {
      ok: false,
      httpBase: config.httpBase,
      port: config.port,
      error: isTimeout
        ? `Timed out connecting to ${config.httpBase}.`
        : `Could not connect to ${config.httpBase}: ${err?.message || 'Unknown error'}`,
    }
  } finally {
    clearTimeout(timer)
  }
}
