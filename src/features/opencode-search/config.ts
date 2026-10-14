import Schema from '@deepseek-ai/schemastery'

/** Defaults shared by the validated schema and the explicit resolve step. */
export const OPENCODE_SEARCH_DEFAULTS = Object.freeze({
  enabled: false,
  model: 'deepseek-v4.1-flash',
} as const)

/** Proxy defaults: both halves empty means the search connects directly. */
export const OPENCODE_SEARCH_PROXY_DEFAULTS = Object.freeze({
  proxyUrl: '',
  proxyPort: '',
} as const)

/** OpenCode web search config as written in the entry config: every field optional. */
export interface OpencodeSearchConfig {
  /** Whether the OpenCode Go provider serves the built-in web_search tool. */
  readonly enabled?: boolean
  /** Model that runs the auxiliary Messages search turn. */
  readonly model?: string
  /**
   * Proxy address the search request goes through, as `host` or a full
   * `scheme://host` URL; empty means a direct connection. Search-only: the
   * chat route and every other feature keep their own transport.
   */
  readonly proxyUrl?: string
  /** Proxy port, a decimal 1–65535; empty follows the port inside `proxyUrl`. */
  readonly proxyPort?: string
}

/** OpenCode web search config with every default resolved. */
export interface ResolvedOpencodeSearchConfig {
  readonly enabled: boolean
  readonly model: string
}

/** The search proxy address with both halves resolved. */
export interface ResolvedOpencodeSearchProxy {
  readonly proxyUrl: string
  readonly proxyPort: string
}

/** Validated OpenCode web search config. */
export const opencodeSearchConfigSchema: Schema<OpencodeSearchConfig> = Schema.object({
  enabled: Schema.boolean().default(OPENCODE_SEARCH_DEFAULTS.enabled),
  model: Schema.string().default(OPENCODE_SEARCH_DEFAULTS.model),
  proxyUrl: Schema.string().default(OPENCODE_SEARCH_PROXY_DEFAULTS.proxyUrl),
  proxyPort: Schema.string().default(OPENCODE_SEARCH_PROXY_DEFAULTS.proxyPort),
})

/**
 * Apply the documented defaults to one config section. The explicit resolve
 * step keeps defaulting out of the provider path.
 * @param config - the feature's config section, when the deployment wrote one.
 * @returns the fully populated config.
 */
export function resolveOpencodeSearchConfig(
  config: OpencodeSearchConfig | undefined,
): ResolvedOpencodeSearchConfig {
  return {
    enabled: config?.enabled ?? OPENCODE_SEARCH_DEFAULTS.enabled,
    model: config?.model ?? OPENCODE_SEARCH_DEFAULTS.model,
  }
}

/**
 * Apply the documented defaults to the search proxy half of one config
 * section. The two halves stay separate here: `buildProxyURL` is the only
 * place that joins them.
 * @param config - the feature's config section, when the deployment wrote one.
 * @returns the search proxy address.
 */
export function resolveOpencodeSearchProxy(
  config: OpencodeSearchConfig | undefined,
): ResolvedOpencodeSearchProxy {
  return {
    proxyUrl: config?.proxyUrl ?? OPENCODE_SEARCH_PROXY_DEFAULTS.proxyUrl,
    proxyPort: config?.proxyPort ?? OPENCODE_SEARCH_PROXY_DEFAULTS.proxyPort,
  }
}
