import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { WebSearchProvider } from '@deepseek-ai/dsh-web'
import { fetch as undiciFetch } from 'undici'
import type { HostFeature } from '../types.js'
import { resolveOpencodeSearchConfig } from './config.js'
import {
  DELEGATE_SEARCH_PROVIDER_ID, OPENCODE_SEARCH_PROVIDER_ID, OpencodeSearchProvider,
  createSearchSessionId,
  type SearchRequestInit, type SearchResponseFace,
} from './provider.js'
import { proxyDispatcherOf, resolveUpstream } from './upstream.js'

/**
 * OpenCode web search: serves the built-in `web_search` tool through the
 * OpenCode Go endpoint and key, with the auxiliary model chosen in the
 * Extend settings tab. Disabled, it delegates to the built-in provider.
 */
export const opencodeSearchFeature: HostFeature = {
  name: 'opencodeSearch',
  register(ctx: Context, root): void {
    ctx.inject(['web'], (featureCtx) => {
      // OpenCode Go rejects searches without this header; the initiating
      // conversation id wins, one stable per-instance id backs it up.
      const fallbackSessionId = createSearchSessionId()
      const provider = new OpencodeSearchProvider({
        resolveOptions: () => {
          const config = resolveOpencodeSearchConfig(root.opencodeSearch?.get())
          const upstream = resolveUpstream(featureCtx.get('settings'))
          return {
            enabled: config.enabled,
            model: config.model,
            baseURL: upstream.baseURL,
            apiKeyEnv: upstream.apiKeyEnv,
            proxyURL: config.useOpencodeProxy ? upstream.proxyURL : '',
          }
        },
        resolveApiKey: reference => resolveApiKey(featureCtx, reference),
        request: requestSearch,
        delegate: () => delegateOf(featureCtx.get('web')),
        sessionId: () => sessionIdOf(featureCtx) ?? fallbackSessionId,
      })
      featureCtx.web.registerSearchProvider(provider)
    })
  },
}

/** Resolve one credential reference through the credentials service, else the process environment. */
async function resolveApiKey(ctx: Context, reference: string): Promise<string | undefined> {
  const ref = credentialRef(reference)
  const credentials = ctx.get('credentials')
  const resolve = isRecord(credentials) ? Reflect.get(credentials, 'resolve') : undefined
  if (typeof resolve === 'function') {
    const resolved: unknown = await Reflect.apply(resolve, credentials as object, [ref])
    const value = isRecord(resolved) ? Reflect.get(resolved, 'value') : undefined
    if (typeof value === 'string' && value.length > 0) return value
  }
  const ambient = process.env[reference]
  return ambient !== undefined && ambient.length > 0 ? ambient : undefined
}

/** Dispatch one search request, applying the resolved proxy dispatcher when configured. */
async function requestSearch(endpoint: string, init: SearchRequestInit): Promise<SearchResponseFace> {
  const dispatcher = proxyDispatcherOf(init.proxyURL)
  return await undiciFetch(endpoint, {
    method: init.method,
    headers: { ...init.headers },
    body: init.body,
    redirect: init.redirect,
    ...(init.signal === undefined ? {} : { signal: init.signal }),
    ...(dispatcher === undefined ? {} : { dispatcher }),
  })
}

/**
 * Look up the built-in fallback provider in the web service registry. The
 * seam exposes no public provider lookup, so this reads the same registry the
 * service itself selects from; a missing registry simply means no fallback.
 */
function delegateOf(web: unknown): WebSearchProvider | undefined {
  const registry: unknown = isRecord(web) || typeof web === 'object' && web !== null
    ? Reflect.get(web as object, 'searchProviders')
    : undefined
  if (!(registry instanceof Map)) return undefined
  const candidate: unknown = registry.get(DELEGATE_SEARCH_PROVIDER_ID)
  if (candidate === undefined || !isSearchProvider(candidate)) return undefined
  return candidate.id === OPENCODE_SEARCH_PROVIDER_ID ? undefined : candidate
}

/** Read the initiating conversation's id for the `x-opencode-session` header. */
function sessionIdOf(ctx: Context): string | undefined {
  const agents = ctx.get('agents')
  const currentInitiator = isRecord(agents) ? Reflect.get(agents, 'currentInitiator') : undefined
  if (typeof currentInitiator !== 'function') return undefined
  let initiator: unknown
  try {
    initiator = Reflect.apply(currentInitiator, agents as object, [])
  } catch {
    return undefined
  }
  const session = isRecord(initiator) ? Reflect.get(initiator, 'session') : undefined
  const id = isRecord(session) ? Reflect.get(session, 'id') : undefined
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

function isSearchProvider(value: unknown): value is WebSearchProvider {
  if (!isRecord(value)) return false
  return typeof Reflect.get(value, 'id') === 'string'
    && typeof Reflect.get(value, 'available') === 'function'
    && typeof Reflect.get(value, 'search') === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
