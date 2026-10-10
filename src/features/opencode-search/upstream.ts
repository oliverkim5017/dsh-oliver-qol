import { WebError } from '@deepseek-ai/dsh-web'
import { ProxyAgent, Socks5ProxyAgent, type Dispatcher } from 'undici'

/** Defaults used when the OpenCode Go plugin is absent or undescribed. */
export const OPENCODE_SEARCH_UPSTREAM_DEFAULTS = Object.freeze({
  baseURL: 'https://opencode.ai/zen/go/v1',
  apiKeyEnv: 'OPENCODE_API_KEY',
  proxyURL: '',
} as const)

/** Endpoint, credential reference, and proxy the search request follows. */
export interface OpencodeSearchUpstream {
  readonly baseURL: string
  readonly apiKeyEnv: string
  readonly proxyURL: string
}

/** The conventional profile row id of the OpenCode Go provider plugin. */
export const OPENCODE_GO_ENTRY_ID = 'opencode-go'

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
    proxyURL: stringField(value, 'proxyURL') ?? '',
  }
}

/**
 * Build the undici dispatcher for one proxy address. Empty input means a
 * direct connection; unsupported or unparseable input fails the search
 * loudly rather than silently connecting directly.
 * @param proxyURL - the proxy address configured for OpenCode Go.
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
    throw new WebError(`invalid OpenCode Go proxy URL: ${JSON.stringify(raw)}`, 'WEB_PROVIDER_ERROR')
  }
  if (url.protocol === 'socks5:') return new Socks5ProxyAgent(raw)
  if (url.protocol === 'http:' || url.protocol === 'https:') return new ProxyAgent(raw)
  throw new WebError(`unsupported OpenCode Go proxy scheme: ${url.protocol}`, 'WEB_PROVIDER_ERROR')
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
