export const COMFY_CONNECTION_SETTING_KEY = 'comfyConnection'
export const COMFY_CONNECTION_LOCAL_KEY = 'comfystudio-comfy-connection'
export const COMFY_CONNECTION_CHANGED_EVENT = 'comfystudio-comfy-connection-changed'

export const LOCAL_COMFY_HOST = '127.0.0.1'
export const DEFAULT_COMFY_PORT = 8188

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

let cachedPort = DEFAULT_COMFY_PORT
let cachedHost = LOCAL_COMFY_HOST
let cachedProtocol = 'http'
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

function buildConnection(port, host = null, protocol = null) {
  const safePort = normalizePort(port) || DEFAULT_COMFY_PORT
  const isElectron = typeof window !== 'undefined' && (window.electronAPI || navigator.userAgent.includes('Electron'))

  // Resolution order:
  // 1. Explicit argument
  // 2. Cached value from settings
  // 3. Fallback to current window location (for web deployment)
  // 4. Ultimate fallback to localhost

  let targetHost = host || cachedHost
  let targetProto = (protocol || cachedProtocol || 'http').replace(':', '')

  if (!host && !isElectron && typeof window !== 'undefined' && window.location.hostname) {
    // If not in Electron and no host is explicitly provided,
    // we default to the current host if we haven't hydrated a specific remote host yet.
    if (cachedHost === LOCAL_COMFY_HOST) {
       targetHost = window.location.hostname
       targetProto = window.location.protocol.replace(':', '')
    }
  }

  const wsProto = targetProto === 'https' ? 'wss' : 'ws'
  const portSuffix = (targetProto === 'https' && safePort === 443) || (targetProto === 'http' && safePort === 80)
    ? ''
    : `:${safePort}`

  return {
    host: targetHost,
    port: safePort,
    httpBase: `${targetProto}://${targetHost}${portSuffix}`,
    wsBase: `${wsProto}://${targetHost}${portSuffix}`,
  }
}

function readLocalStoragePort() {
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
    const fromStored = parseStoredPortValue(parsed)
    return fromStored.success ? fromStored.port : null
  } catch {
    return null
  }
}

function writeLocalStoragePort(port) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(COMFY_CONNECTION_LOCAL_KEY, JSON.stringify({ port }))
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

function parseStoredPortValue(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.host && raw.port) {
      const normalized = normalizePort(raw.port)
      if (normalized) return { success: true, port: normalized, host: raw.host, protocol: raw.protocol || 'http' }
    }
    if (raw.port !== undefined) {
      const normalized = normalizePort(raw.port)
      if (normalized) return { success: true, port: normalized }
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
    if (normalized) return { success: true, port: normalized }
  }
  if (typeof raw === 'string') {
    return parseLocalComfyPortInput(raw)
  }
  return { success: false, error: 'No local ComfyUI setting found' }
}

function hydrateFromLocalStorage() {
  const fromLocalStorage = readLocalStoragePort()
  if (fromLocalStorage) {
    cachedPort = fromLocalStorage
  }
}

hydrateFromLocalStorage()

export function parseLocalComfyPortInput(input) {
  const raw = String(input ?? '').trim()
  if (!raw) {
    return { success: true, port: DEFAULT_COMFY_PORT }
  }

  if (/^\d+$/.test(raw)) {
    const port = normalizePort(raw)
    if (!port) {
      return { success: false, error: 'Port must be between 1 and 65535.' }
    }
    return { success: true, port }
  }

  let candidate = raw
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `http://${candidate}`
  }

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { success: false, error: 'Use an http or https URL (or just the port number).' }
    }

    const port = normalizePort(parsed.port || (parsed.protocol === 'https:' ? 443 : DEFAULT_COMFY_PORT))
    if (!port) {
      return { success: false, error: 'Port must be between 1 and 65535.' }
    }
    return {
      success: true,
      port,
      host: parsed.hostname,
      protocol: parsed.protocol.replace(':', '')
    }
  } catch {
    return { success: false, error: 'Invalid value. Use a port like 8188 or a full URL.' }
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
  return buildConnection(cachedPort, cachedHost, cachedProtocol)
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
        let parsed = parseStoredPortValue(stored)

        // Legacy migration path if previous versions ever stored a free-form URL key.
        if (!parsed.success) {
          const legacyUrl = await window.electronAPI.getSetting('comfyUrl')
          parsed = parseStoredPortValue(legacyUrl)
        }

        if (parsed.success && startVersion === connectionVersion) {
          cachedPort = parsed.port
          if (parsed.host) cachedHost = parsed.host
          if (parsed.protocol) cachedProtocol = parsed.protocol
          writeLocalStoragePort(cachedPort)
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
  cachedPort = parsed.port
  if (parsed.host) cachedHost = parsed.host
  if (parsed.protocol) cachedProtocol = parsed.protocol

  const config = getLocalComfyConnectionSync()
  writeLocalStoragePort(config.port)

  try {
    if (typeof window !== 'undefined' && window?.electronAPI?.setSetting) {
      await window.electronAPI.setSetting(COMFY_CONNECTION_SETTING_KEY, {
        host: config.host,
        port: config.port,
        protocol: cachedProtocol
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

export async function checkLocalComfyConnection(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 4500
  const maybePort = options.port ?? cachedPort
  const normalizedPort = normalizePort(maybePort)
  if (!normalizedPort) {
    return { ok: false, error: 'Invalid local ComfyUI port.' }
  }

  const config = buildConnection(normalizedPort)
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

