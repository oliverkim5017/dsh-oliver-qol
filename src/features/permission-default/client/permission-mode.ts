import type { Translate } from '../../../client/context.js'

/** Settings namespace holding the new-session permission default. */
export const PERMISSION_SETTINGS_NS = 'permission'

/** One selectable permission preset advertised by the host catalog. */
export interface PermissionOption {
  readonly value: string
  readonly name: string
}

/** The permission presets newly created sessions may start with. */
export interface PermissionCatalog {
  readonly defaultOptions: readonly PermissionOption[]
  readonly defaultPreset: string
}

/** Catalog read state held by the controller. */
export interface PermissionCatalogState {
  readonly catalog: PermissionCatalog | null
  readonly error: string | null
}

/** One namespace row of the shared settings mirror. */
export interface PermissionNamespaceRow {
  readonly ns: string
  readonly revision: number
  readonly value: unknown
}

/** The shared settings mirror snapshot this feature reads. */
export interface PermissionMirrorSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'unavailable'
  readonly view?: {
    readonly writable: boolean
    readonly namespaces: readonly PermissionNamespaceRow[]
  } | undefined
  readonly error: string | null
}

/** Row snapshot the settings tab renders. */
export interface PermissionModeState {
  readonly status: 'loading' | 'ready' | 'saving' | 'unavailable' | 'error'
  readonly writable: boolean
  readonly current: string
  readonly options: readonly PermissionOption[]
  readonly error: string | null
}

/** Built-in preset values and the locale key of their product label. */
const PRESET_LABEL_KEYS: ReadonlyMap<string, string> = new Map([
  ['read-only', 'preset.readOnly'],
  ['workspace-write', 'preset.workspaceWrite'],
  ['danger-full-access', 'preset.fullAccess'],
])

/** Shipped English product labels; a host name equal to one still localizes. */
const DEFAULT_PRESET_LABELS: Record<string, string> = {
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
}

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Render one advertised preset under its product label.
 * @param value - preset machine value.
 * @param hostName - host-supplied preset name.
 * @param t - translator of the row's locale namespace.
 * @returns the localized built-in label, the host label, or the title-cased value.
 */
export function permissionPresetLabel(value: string, hostName: string | undefined, t: Translate): string {
  const key = PRESET_LABEL_KEYS.get(value)
  if (key !== undefined && (hostName === undefined || hostName === value || hostName === DEFAULT_PRESET_LABELS[key])) {
    return t(key)
  }
  return displayPresetName(hostName ?? value)
}

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
function displayPresetName(name: string): string {
  if (!KEBAB_CASE.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Derive the row snapshot from the shared settings mirror and the catalog.
 * @param mirror - current snapshot of the shared settings mirror.
 * @param catalog - the catalog read state.
 * @returns the row snapshot; `error` carries a diagnostic when the inputs cannot produce a choice.
 */
export function derivePermissionMode(
  mirror: PermissionMirrorSnapshot,
  catalog: PermissionCatalogState,
): PermissionModeState {
  if (mirror.status === 'unavailable') return emptyState('unavailable')
  const view = mirror.view
  if (view === undefined) {
    return mirror.error !== null
      ? { ...emptyState('error'), error: mirror.error }
      : emptyState('loading')
  }
  const row = view.namespaces.find(entry => entry.ns === PERMISSION_SETTINGS_NS)
  if (row === undefined) return emptyState('unavailable')
  if (catalog.catalog === null) {
    return catalog.error !== null
      ? { ...emptyState('error'), error: catalog.error }
      : emptyState('loading')
  }
  const options = catalog.catalog.defaultOptions
  const current = permissionDefaultPreset(row.value, catalog.catalog.defaultPreset)
  if (!options.some(option => option.value === current)) {
    return {
      status: 'error',
      writable: view.writable,
      current,
      options,
      error: `the permission catalog does not advertise ${JSON.stringify(current)}`,
    }
  }
  return { status: 'ready', writable: view.writable, current, options, error: null }
}

function permissionDefaultPreset(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null) {
    const candidate = Reflect.get(value, 'defaultPreset')
    if (typeof candidate === 'string' && candidate.length > 0) return candidate
  }
  return fallback
}

function emptyState(status: PermissionModeState['status']): PermissionModeState {
  return { status, writable: false, current: '', options: [], error: null }
}
