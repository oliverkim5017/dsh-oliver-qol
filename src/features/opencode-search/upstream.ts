import { WebError } from '@deepseek-ai/dsh-web'
import { ProxyAgent, Socks5ProxyAgent, type Dispatcher } from 'undici'

/** Defaults used when the OpenCode Go plugin is absent or undescribed. */
export const OPENCODE_SEARCH_UPSTREAM_DEFAULTS = Object.freeze({
  baseURL: 'https://opencode.ai/zen/go/v1',
  apiKeyEnv: 'OPENCODE_API_KEY',
} as const)

/**
 * Endpoint and credential reference the search request follows. The transport
 * is deliberately absent: the search sets its own proxy, so nothing the
 * OpenCode Go plugin configures for chat traffic reaches this request.
 */
export interface OpencodeSearchUpstream {
  readonly baseURL: string
  readonly apiKeyEnv: string
}

/** The conventional profile row id of the OpenCode Go provider plugin. */
export const OPENCODE_GO_ENTRY_ID = 'opencode-go'

/** A proxy port is a decimal the transport can dial. */
const PROXY_PORT_PATTERN = /^\d{1,5}$/u

/**
 * Resolve the endpoint facts from the live OpenCode Go settings entry.
 * The dsh settings service describes every configurable plugin entry; the
 * OpenCode Go one is recognized by its conventional row id first and by the
 * shape of its projected fields second, so a renamed row still works. Any
 * missing layer falls back to the documented defaults.
 * @param settings - the host settings service (`describe()`), when mounted.
 * @returns the endpoint facts for the next search.
 */
export function resolveUpstream(settings: unknown): OpencodeSearchUpstream {
  const defaults = (): OpencodeSearchUpstream => ({ ...OPENCODE_SEARCH_UPSTREAM_DEFAULTS })
  const face = asRecord(settings)
  const describe = face === undefined ? undefined : Reflect.get(face, 'describe')
  if (typeof describe !== 'function') return defaults()
  let described: unknown
  try {
    described = Reflect.apply(describe, settings as object, [])
  } catch {
    return defaults()
  }
  if (!Array.isArray(described)) return defaults()
  const rows = described.map(asRecord).filter((row): row is Record<string, unknown> => row !== undefined)
  const matching = rows.filter(row => isOpencodeGoValue(asRecord(Reflect.get(row, 'value'))))
  const match = matching.find(row => Reflect.get(row, 'ns') === OPENCODE_GO_ENTRY_ID) ?? matching[0]
  const value = match === undefined ? undefined : asRecord(Reflect.get(match, 'value'))
  if (value === undefined) return defaults()
  return {
    baseURL: trimBaseURL(stringField(value, 'baseURL')) ?? OPENCODE_SEARCH_UPSTREAM_DEFAULTS.baseURL,
    apiKeyEnv: stringField(value, 'apiKeyEnv') ?? OPENCODE_SEARCH_UPSTREAM_DEFAULTS.apiKeyEnv,
  }
}

/**
 * Join the Extend-settings proxy halves into the one address `undici` accepts.
 * The URL half carries the host and may carry its own scheme, port,
 * credentials, or path; the port half replaces whatever port it carries. A
 * scheme-less host is read as HTTP, because an address without one is not a
 * URL at all. Both halves empty means a direct connection.
 * @param proxyUrl - the configured host, or `scheme://host`, or empty.
 * @param proxyPort - the configured port, or empty to keep the URL's own.
 * @returns the proxy address, or `''` for a direct connection.
 * @throws {WebError} `WEB_PROVIDER_ERROR` when the port is not a decimal 1–65535.
 */
export function buildProxyURL(proxyUrl: string, proxyPort: string): string {
  const host = proxyUrl.trim()
  if (host.length === 0) return ''
  const port = proxyPort.trim()
  if (port.length > 0 && !PROXY_PORT_PATTERN.test(port)) {
    throw new WebError(`invalid web search proxy port: ${JSON.stringify(port)}`, 'WEB_PROVIDER_ERROR')
  }
  if (port.length > 0 && (Number(port) < 1 || Number(port) > 65535)) {
    throw new WebError(`web search proxy port is out of range: ${JSON.stringify(port)}`, 'WEB_PROVIDER_ERROR')
  }
  // An address with no scheme is a bare host, and undici needs a URL there.
  const address = host.includes('://') ? host : `http://${host}`
  const url = URL.canParse(address) ? new URL(address) : undefined
  if (url === undefined) {
    throw new WebError(`invalid web search proxy address: ${JSON.stringify(host)}`, 'WEB_PROVIDER_ERROR')
  }
  if (port.length > 0) url.port = port
  return url.toString()
}

/**
 * Build the undici dispatcher for one proxy address, as `buildProxyURL`
 * returns it. Empty input means a direct connection; unsupported or
 * unparseable input fails the search loudly rather than silently connecting
 * directly.
 * @param proxyURL - the web search proxy address.
 * @returns the dispatcher, or undefined for a direct connection.
 * @throws {WebError} `WEB_PROVIDER_ERROR` on an unparseable URL or unsupported scheme.
 */
export function proxyDispatcherOf(proxyURL: string): Dispatcher | undefined {
  const raw = proxyURL.trim()
  if (raw.length === 0) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new WebError(`invalid web search proxy URL: ${JSON.stringify(raw)}`, 'WEB_PROVIDER_ERROR')
  }
  if (url.protocol === 'socks5:') return new Socks5ProxyAgent(raw)
  if (url.protocol === 'http:' || url.protocol === 'https:') return new ProxyAgent(raw)
  throw new WebError(`unsupported web search proxy scheme: ${url.protocol}`, 'WEB_PROVIDER_ERROR')
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const raw = Reflect.get(value, key)
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

function trimBaseURL(base: string | undefined): string | undefined {
  const trimmed = base?.trim().replace(/\/+$/u, '')
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : undefined
}

/** The projected OpenCode Go entry carries these fields; no other entry does. */
function isOpencodeGoValue(value: Record<string, unknown> | undefined): boolean {
  if (value === undefined) return false
  if (typeof Reflect.get(value, 'baseURL') !== 'string') return false
  if (typeof Reflect.get(value, 'apiKeyEnv') !== 'string') return false
  return ['protocolOverrides', 'accounts', 'refreshMinutes'].some(key => Reflect.has(value, key))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
