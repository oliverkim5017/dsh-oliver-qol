import Schema from '@deepseek-ai/schemastery'

/** Defaults shared by the validated schema and the explicit resolve step. */
export const OPENCODE_SEARCH_DEFAULTS = Object.freeze({
  enabled: false,
  model: 'deepseek-v4.1-flash',
  useOpencodeProxy: true,
} as const)

/** OpenCode web search config as written in the entry config: every field optional. */
export interface OpencodeSearchConfig {
  /** Whether the OpenCode Go provider serves the built-in web_search tool. */
  readonly enabled?: boolean
  /** Model that runs the auxiliary Messages search turn. */
  readonly model?: string
  /** Follow the proxy address configured for the OpenCode Go provider. */
  readonly useOpencodeProxy?: boolean
}

/** OpenCode web search config with every default resolved. */
export interface ResolvedOpencodeSearchConfig {
  readonly enabled: boolean
  readonly model: string
  readonly useOpencodeProxy: boolean
}

/** Validated OpenCode web search config. */
export const opencodeSearchConfigSchema: Schema<OpencodeSearchConfig> = Schema.object({
  enabled: Schema.boolean().default(OPENCODE_SEARCH_DEFAULTS.enabled),
  model: Schema.string().default(OPENCODE_SEARCH_DEFAULTS.model),
  useOpencodeProxy: Schema.boolean().default(OPENCODE_SEARCH_DEFAULTS.useOpencodeProxy),
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
    useOpencodeProxy: config?.useOpencodeProxy ?? OPENCODE_SEARCH_DEFAULTS.useOpencodeProxy,
  }
}
