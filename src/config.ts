import type { Volatile } from '@deepseek-ai/cosmokit'
import Schema from '@deepseek-ai/schemastery'
import {
  sessionDeleteConfigSchema, type SessionDeleteConfig,
} from './features/session-delete/config.js'
import {
  opencodeSearchConfigSchema, type OpencodeSearchConfig,
} from './features/opencode-search/config.js'

/** Root config of the oliver-qol plugin: one optional section per feature. */
export interface QolConfig {
  /** Session deletion feature; absent means documented defaults. */
  readonly sessionDelete?: SessionDeleteConfig
  /**
   * OpenCode web search settings. Live: it is a volatile reference because the
   * Extend settings row edits the running entry without a reload.
   */
  readonly opencodeSearch?: Volatile<OpencodeSearchConfig | undefined>
}

/** Validated root config. The volatile section resolution is schema-inferred. */
export const QolConfigSchema = Schema.object({
  sessionDelete: sessionDeleteConfigSchema,
  opencodeSearch: opencodeSearchConfigSchema.volatile(),
})
