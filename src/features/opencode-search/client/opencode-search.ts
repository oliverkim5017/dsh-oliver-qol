/** Plugin entry namespace the Extend settings row reads and writes. */
export const OPENCODE_SEARCH_SETTINGS_NS = 'oliver-qol'
/** Section key inside the plugin entry config. */
export const OPENCODE_SEARCH_SECTION = 'opencodeSearch'

/**
 * Defaults mirrored from the host schema. The browser bundle cannot import
 * host modules, so the two sides pin the same values in their own tests.
 */
export const OPENCODE_SEARCH_CLIENT_DEFAULTS = Object.freeze({
  enabled: false,
  model: 'deepseek-v4.1-flash',
  useOpencodeProxy: true,
} as const)

/** One namespace row of the shared settings mirror. */
export interface OpencodeSearchNamespaceRow {
  readonly ns: string
  readonly revision: number
  readonly value: unknown
}

/** The shared settings mirror snapshot this feature reads. */
export interface OpencodeSearchMirrorSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable'
  readonly view?: {
    readonly writable: boolean
    readonly namespaces: readonly OpencodeSearchNamespaceRow[]
  } | undefined
  readonly error: string | null
}

/** Row snapshot the settings tab renders. */
export interface OpencodeSearchRowState {
  readonly status: 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  readonly writable: boolean
  readonly enabled: boolean
  readonly model: string
  readonly useOpencodeProxy: boolean
  readonly error: string | null
}

/**
 * Derive the row snapshot from the shared settings mirror.
 * @param mirror - current snapshot of the shared settings mirror.
 * @returns the row snapshot; `error` carries a diagnostic when the inputs cannot produce a row.
 */
export function deriveOpencodeSearchRow(mirror: OpencodeSearchMirrorSnapshot): OpencodeSearchRowState {
  if (mirror.status === 'unavailable') return emptyState('unavailable')
  const view = mirror.view
  if (view === undefined) {
    return mirror.error !== null
      ? { ...emptyState('error'), error: mirror.error }
      : emptyState('loading')
  }
  const row = view.namespaces.find(entry => entry.ns === OPENCODE_SEARCH_SETTINGS_NS)
  if (row === undefined) return emptyState('unavailable')
  const section = asRecord(asRecord(row.value)?.[OPENCODE_SEARCH_SECTION])
  return {
    status: 'ready',
    writable: view.writable,
    enabled: booleanOf(section, 'enabled', OPENCODE_SEARCH_CLIENT_DEFAULTS.enabled),
    model: stringOf(section, 'model', OPENCODE_SEARCH_CLIENT_DEFAULTS.model),
    useOpencodeProxy: booleanOf(section, 'useOpencodeProxy', OPENCODE_SEARCH_CLIENT_DEFAULTS.useOpencodeProxy),
    error: null,
  }
}

function booleanOf(
  section: Record<string, unknown> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  const value = section === undefined ? undefined : Reflect.get(section, key)
  return typeof value === 'boolean' ? value : fallback
}

function stringOf(
  section: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = section === undefined ? undefined : Reflect.get(section, key)
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function emptyState(status: OpencodeSearchRowState['status']): OpencodeSearchRowState {
  return {
    status,
    writable: false,
    enabled: OPENCODE_SEARCH_CLIENT_DEFAULTS.enabled,
    model: OPENCODE_SEARCH_CLIENT_DEFAULTS.model,
    useOpencodeProxy: OPENCODE_SEARCH_CLIENT_DEFAULTS.useOpencodeProxy,
    error: null,
  }
}
