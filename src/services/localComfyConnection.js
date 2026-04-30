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
  const port = normalizePort(connection?.port) || (protocol === 'https:' ? 443 : DEFAULT_COMFY_PORT)

  const httpProtocol = protocol.endsWith(':') ? protocol : `${protocol}:`
  const isStandardPort = (httpProtocol === 'http:' && port === 80) || (httpProtocol === 'https:' && port === 443)
  const hostPort = isStandardPort ? host : `${host}:${port}`

  const isElectron = typeof window !== 'undefined' && (
    !!window?.electronAPI?.isElectron ||
    /electron/i.test(navigator.userAgent)
  )

  if (!isElectron && typeof window !== 'undefined') {
    const protoNoColon = httpProtocol.replace(':', '')
    // The proxy expects /protocol/host/port. If port is omitted in the URL, it should be passed explicitly.
    const proxyPath = `/api/v1/comfy-proxy/${protoNoColon}/${host}/${port}/`
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${wsProtocol}//${window.location.host}${proxyPath}ws`

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
    httpBase: `${httpProtocol}//${hostPort}/`,
    wsBase: `${httpProtocol === 'https:' ? 'wss:' : 'ws:'}//${hostPort}/`,
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
    if (!port) return { success: false, error: 'Port must be between 1 and 65535.' }
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
    if (!port) return { success: false, error: 'Invalid port.' }
    return {
      success: true,
      config: {
        protocol: parsed.protocol,
        host: parsed.hostname,
        port,
      },
    }
  } catch {
    return { success: false, error: 'Invalid address. Use a port or a URL.' }
  }
}

export function isLoopbackHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''))
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
  if (hydrated) return getLocalComfyConnectionSync()
  if (hydrationPromise) return hydrationPromise

  hydrationPromise = (async () => {
    const startVersion = connectionVersion
    hydrateFromLocalStorage()

    if (typeof window !== 'undefined' && window?.electronAPI?.getSetting) {
      try {
        const stored = await window.electronAPI.getSetting(COMFY_CONNECTION_SETTING_KEY)
        let parsed = parseStoredConnectionValue(stored)
        if (parsed.success && startVersion === connectionVersion) {
          cachedConnection = parsed.config
          writeLocalStorageConnection(cachedConnection)
        }
      } catch {}
    }

    hydrated = true
    const config = getLocalComfyConnectionSync()
    hydrationPromise = null
    return config
  })()

  return hydrationPromise
}

export async function saveComfyConnection(input) {
  const parsed = parseLocalComfyPortInput(input)
  if (!parsed.success) return { success: false, error: parsed.error }

  connectionVersion += 1
  cachedConnection = parsed.config
  const config = getLocalComfyConnectionSync()
  writeLocalStorageConnection(cachedConnection)

  try {
    if (typeof window !== 'undefined' && window?.electronAPI?.setSetting) {
      await window.electronAPI.setSetting(COMFY_CONNECTION_SETTING_KEY, cachedConnection)
    }
  } catch (err) {
    return { success: false, error: err?.message || 'Failed to persist setting.' }
  }

  dispatchConnectionChanged(config)
  return { success: true, config }
}

export const saveLocalComfyConnectionPort = saveComfyConnection

export async function checkLocalComfyConnection(options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 4500
  let config = options.config ? buildConnection(options.config) : getLocalComfyConnectionSync()

  // Folosește proxy-ul intern pentru conexiuni remote
  const isRemote = config.host !== '127.0.0.1' && config.host !== 'localhost'

  const isElectron = typeof window !== 'undefined' && (
    !!window?.electronAPI?.isElectron ||
    /electron/i.test(navigator.userAgent)
  )

  let testUrl
  if (isRemote && !isElectron && typeof window !== 'undefined' && window.location.origin) {
    // Folosește proxy-ul intern pentru a ocoli CORS în browser
    const protocolNoColon = config.protocol.replace(':', '')
    testUrl = `${window.location.origin}/api/v1/comfy-proxy/${protocolNoColon}/${config.host}/${config.port}/system_stats`
  } else {
    testUrl = `${config.httpBase.replace(/\/+$/, '')}/system_stats`
  }

  // În Electron, forțăm cererea prin protocolul custom 'comfy-test' sau folosim fetchWithHeaders
  // Ambele trec prin procesul Main care ocolește CORS-ul rendererului.
  if (isElectron && window.electronAPI?.fetchWithHeaders) {
    try {
      const finalTestUrl = isRemote ? `comfy-test://test?url=${encodeURIComponent(testUrl)}` : testUrl
      const result = await window.electronAPI.fetchWithHeaders(finalTestUrl, {
        method: 'GET',
        timeout: timeoutMs
      })
      if (result.ok) {
        return { ok: true, status: result.status, httpBase: config.httpBase }
      }

      let errorDetail = ''
      if (result.data) {
        if (result.data.includes('<html') || result.data.includes('<!DOCTYPE')) {
          errorDetail = 'Server returned an HTML page instead of JSON. This often means the request was blocked by a firewall (like Cloudflare) or a proxy.'
        } else {
          errorDetail = result.data.slice(0, 200)
        }
      }

      return {
        ok: false,
        status: result.status,
        error: `ComfyUI returned HTTP ${result.status}${errorDetail ? `: ${errorDetail}` : ''}`
      }
    } catch (err) {
      return { ok: false, error: `Could not connect to ${config.httpBase}: ${err.message}` }
    }
  }

  // Fallback pentru browser sau dacă fetchWithHeaders lipsește
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => controller?.abort(), timeoutMs)

  try {
    const headers = {
      'Accept': 'application/json'
    }

    // Doar pentru cereri directe adăugăm antetele speciale (proxy-ul le adaugă oricum)
    if (!testUrl.includes('/api/v1/comfy-proxy/')) {
      headers['Origin'] = new URL(config.httpBase).origin
      headers['Host'] = new URL(config.httpBase).host
      headers['Referer'] = config.httpBase
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    const response = await fetch(testUrl, {
      signal: controller?.signal,
      headers,
      mode: testUrl.includes(window.location.origin) ? 'same-origin' : 'cors',
      credentials: 'omit'
    })

    if (response.ok) {
      return { ok: true, status: response.status, httpBase: config.httpBase }
    }

    let errorDetail = ''
    try {
      const text = await response.text()
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        errorDetail = 'Server returned an HTML page instead of JSON. This often means the request was blocked by a firewall (like Cloudflare) or a proxy.'
      } else {
        errorDetail = text.slice(0, 200)
      }
    } catch {}

    return {
      ok: false,
      status: response.status,
      error: `ComfyUI returned HTTP ${response.status}${errorDetail ? `: ${errorDetail}` : ''}`
    }
  } catch (err) {
    return { ok: false, error: `Could not connect to ${config.httpBase}: ${err.message}` }
  } finally {
    clearTimeout(timer)
  }
}
