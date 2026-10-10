import { randomUUID } from 'node:crypto'
import {
  WebError, type WebSearchProvider, type WebSearchRequest, type WebSearchResult, type WebSearchSource,
} from '@deepseek-ai/dsh-web'

/** Stable id this provider registers under; also the `web.searchProvider` selection value. */
export const OPENCODE_SEARCH_PROVIDER_ID = 'opencode-go'
/** The built-in fallback provider this one delegates to while disabled. */
export const DELEGATE_SEARCH_PROVIDER_ID = 'deepseek-official'
/** `anthropic-version` header value sent with every search. */
export const OPENCODE_SEARCH_API_VERSION = '2023-06-01'
/** Upper bound on generated tokens for the auxiliary Messages turn. */
export const OPENCODE_SEARCH_MAX_TOKENS = 4096
/** Upper bound on native `web_search` server-tool uses per request. */
export const OPENCODE_SEARCH_MAX_USES = 5
/** Attribution header sent on every request. */
export const OPENCODE_SEARCH_USER_AGENT = 'dsh-oliver-qol/0.1.0'
/** Prefix of the fallback `x-opencode-session` id, required by the OpenCode Go gateway. */
export const OPENCODE_SEARCH_SESSION_PREFIX = 'dsh-oliver-qol-'

/**
 * Mint the fallback `x-opencode-session` id one plugin instance sends when a
 * search has no initiating conversation. OpenCode Go rejects requests without
 * the header, so the feature wires this as the last resort.
 * @returns a stable-per-instance session id.
 */
export function createSearchSessionId(): string {
  return `${OPENCODE_SEARCH_SESSION_PREFIX}${randomUUID()}`
}

/** One search operation's snapshot; resolved fresh so a settings write reaches the next search. */
export interface OpencodeSearchOptions {
  readonly enabled: boolean
  readonly model: string
  readonly baseURL: string
  readonly apiKeyEnv: string
  /** Empty means a direct connection. */
  readonly proxyURL: string
}

/** One transport request; `proxyURL` is applied by the transport. */
export interface SearchRequestInit {
  readonly method: 'POST'
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
  readonly redirect: 'error'
  readonly proxyURL: string
  readonly signal?: AbortSignal
}

/** The response surface this provider consumes; DOM and undici responses both satisfy it. */
export interface SearchResponseFace {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

/** The HTTP carrier; injectable so the provider is testable without a network. */
export type SearchTransport = (endpoint: string, init: SearchRequestInit) => Promise<SearchResponseFace>

/** Everything the provider reads, resolved per operation. */
export interface OpencodeSearchProviderDeps {
  readonly resolveOptions: () => OpencodeSearchOptions
  readonly resolveApiKey: (reference: string) => Promise<string | undefined>
  readonly request: SearchTransport
  /** The registered fallback provider, or undefined when none is mounted. */
  readonly delegate: () => WebSearchProvider | undefined
  /** The initiating conversation's id, when one exists. */
  readonly sessionId?: () => string | undefined
}

/**
 * The OpenCode Go search provider: an Anthropic-compatible Messages call with
 * the native `web_search_20250305` server tool against the endpoint the
 * OpenCode Go provider plugin uses. While its own setting is off it delegates
 * to the built-in provider, so the seam selection stays boot-stable.
 */
export class OpencodeSearchProvider implements WebSearchProvider {
  readonly id = OPENCODE_SEARCH_PROVIDER_ID

  /**
   * @param deps - live options, credential resolution, transport, and fallback.
   */
  constructor(private readonly deps: OpencodeSearchProviderDeps) {}

  /** @returns whether the configured selection can serve a search right now. */
  available(): boolean {
    const options = this.deps.resolveOptions()
    if (!options.enabled) return this.deps.delegate() !== undefined
    return URL.canParse(options.baseURL)
  }

  /**
   * Run one search: delegate while disabled, otherwise one Messages turn.
   * @param request - the query and the caller's result bound.
   * @param signal - cancellation forwarded to the request and the fallback.
   * @returns normalized sources.
   */
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.deps.resolveOptions()
    if (!options.enabled) return this.delegateSearch(request, signal)
    const endpoint = `${options.baseURL}/messages`
    const apiKey = await this.apiKey(options, signal)
    throwIfSearchAborted(signal)
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'authorization': `Bearer ${apiKey}`,
      'anthropic-version': OPENCODE_SEARCH_API_VERSION,
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': OPENCODE_SEARCH_USER_AGENT,
    }
    const sessionId = this.deps.sessionId?.()
    if (sessionId !== undefined && sessionId.length > 0) headers['x-opencode-session'] = sessionId
    const body = {
      model: options.model,
      max_tokens: OPENCODE_SEARCH_MAX_TOKENS,
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Perform a web search for the query: ${request.query}` }],
      }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: OPENCODE_SEARCH_MAX_USES }],
    }
    let response: SearchResponseFace
    try {
      response = await this.deps.request(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        redirect: 'error',
        proxyURL: options.proxyURL,
        ...(signal === undefined ? {} : { signal }),
      })
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`OpenCode search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (!response.ok) {
      let message = `OpenCode Go API error (HTTP ${response.status})`
      try {
        const detail = errorDetailOf(await response.json() as unknown)
        if (detail !== undefined) message += `: ${detail}`
      } catch (error) {
        if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }
    try {
      return mapAnthropicResponse(await response.json() as unknown)
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      if (error instanceof WebError) throw error
      throw new WebError(`OpenCode Go returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }

  private async delegateSearch(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const delegate = this.deps.delegate()
    if (delegate === undefined) {
      throw new WebError(
        'OpenCode web search is disabled and no fallback search provider is registered; enable it under Settings > Extend settings, or restore the built-in DeepSeek search provider',
        'WEB_PROVIDER_ERROR',
      )
    }
    return delegate.search(request, signal)
  }

  private async apiKey(options: OpencodeSearchOptions, signal?: AbortSignal): Promise<string> {
    throwIfSearchAborted(signal)
    let resolved: string | undefined
    try {
      resolved = await abortable(this.deps.resolveApiKey(options.apiKeyEnv), signal)
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error)
      throw new WebError(`OpenCode search credential resolution failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
    if (resolved !== undefined && resolved.length > 0) return resolved
    throw new WebError(
      `OpenCode web search has no API key for "${options.apiKeyEnv}"; store it through the credentials service (the OpenCode Go settings card writes it) or export it in the launching environment`,
      'WEB_PROVIDER_CREDENTIAL_MISSING',
    )
  }
}

/**
 * Map one Anthropic Messages response to a normalized search result. Walks
 * `web_search_tool_result` blocks for citeable items, joins each to its
 * citation excerpt as `snippet`, and dedupes by URL.
 * @param response - the parsed Messages response body.
 * @returns the normalized result.
 * @throws {WebError} when native search produced no result block.
 */
function mapAnthropicResponse(response: unknown): WebSearchResult {
  const blocks = contentBlocks(response)
  const resultBlocks = blocks.filter(block => asRecord(block)?.['type'] === 'web_search_tool_result')
  if (resultBlocks.length === 0) {
    throw new WebError(
      'OpenCode Go returned no web_search_tool_result blocks; the request may not have triggered native web search',
      'WEB_PROVIDER_ERROR',
    )
  }
  const snippets = citationSnippets(blocks)
  const seen = new Set<string>()
  const sources: WebSearchSource[] = []
  for (const block of resultBlocks) {
    const items = asRecord(block)?.['content']
    if (!Array.isArray(items)) continue
    for (const item of items) {
      const entry = asRecord(item)
      if (entry?.['type'] !== 'web_search_result') continue
      const url = entry['url']
      if (typeof url !== 'string' || url.length === 0 || seen.has(url)) continue
      seen.add(url)
      const title = entry['title']
      const pageAge = entry['page_age']
      const snippet = snippets.get(url)
      sources.push({
        url,
        ...(typeof title === 'string' && title.length > 0 ? { title } : {}),
        ...(snippet !== undefined && snippet.length > 0 ? { snippet } : {}),
        ...(typeof pageAge === 'string' && pageAge.length > 0 ? { publishedAt: pageAge } : {}),
      })
    }
  }
  return { sources, truncated: false }
}

/** Build a `url → cited_text` map from every text block's citations (first occurrence wins). */
function citationSnippets(blocks: readonly unknown[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>()
  for (const block of blocks) {
    const record = asRecord(block)
    if (record?.['type'] !== 'text') continue
    const citations = record['citations']
    if (!Array.isArray(citations)) continue
    for (const citation of citations) {
      const entry = asRecord(citation)
      const url = entry?.['url']
      const text = entry?.['cited_text']
      if (typeof url === 'string' && url.length > 0 && typeof text === 'string' && text.length > 0 && !map.has(url)) {
        map.set(url, text)
      }
    }
  }
  return map
}

function contentBlocks(response: unknown): readonly unknown[] {
  const content = asRecord(response)?.['content']
  return Array.isArray(content) ? content : []
}

/** Extract the provider's own error detail from one error body. */
function errorDetailOf(parsed: unknown): string | undefined {
  const record = asRecord(parsed)
  if (record === undefined) return undefined
  const error = record['error']
  const direct = typeof error === 'string' ? error : asRecord(error)?.['message']
  const message = typeof direct === 'string' && direct.length > 0 ? direct : record['message']
  return typeof message === 'string' && message.length > 0 ? message : undefined
}

/** Race a same-process asynchronous preflight against caller cancellation. */
function abortable<T>(operation: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation
  if (signal.aborted) return Promise.reject(searchAborted(signal))
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => { reject(searchAborted(signal)) }
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then((value) => {
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }, (error: unknown) => {
      signal.removeEventListener('abort', onAbort)
      reject(new Error(String(error).replace(/^Error: /u, ''), { cause: error }))
    })
  })
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw searchAborted(signal)
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal: AbortSignal | undefined, fallback?: unknown): WebError {
  return new WebError('OpenCode search aborted', 'WEB_ABORTED', {
    cause: signal?.aborted === true ? signal.reason : fallback,
  })
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
