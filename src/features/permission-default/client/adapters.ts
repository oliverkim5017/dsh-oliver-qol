import type { ClientScope } from '../../../client/context.js'
import {
  PERMISSION_SETTINGS_NS,
  type PermissionCatalog, type PermissionOption,
} from './permission-mode.js'
import type {
  PermissionCatalogReader, PermissionSettingsWriter, SettingsMirrorFace, SettingsWriteOutcome,
} from './controller.js'

/** Everything the default-permission row binds from the deferred scope. */
export interface PermissionAdapters {
  readonly mirror: SettingsMirrorFace
  readonly catalog: PermissionCatalogReader
  readonly writer: PermissionSettingsWriter
}

/** One async remote method before strict narrowing. */
type RemoteMethod = (...args: unknown[]) => Promise<unknown>

/**
 * Bind the settings surfaces of the deferred mount scope.
 * @param scope - service scope of the deferred mount.
 * @returns the adapters, or undefined while any required service is missing or malformed.
 */
export function permissionAdaptersOf(scope: ClientScope): PermissionAdapters | undefined {
  const configForms = asRecord(scope.get('configForms'))
  const describe = configForms === undefined ? undefined : Reflect.get(configForms, 'describe')
  if (typeof describe !== 'function') return undefined
  const face: unknown = Reflect.apply(describe, configForms as object, [])
  if (!isMirrorFace(face)) return undefined
  const settings = asRecord(scope.get('remote.settings'))
  const mutate = settings === undefined ? undefined : Reflect.get(settings, 'mutate')
  if (typeof mutate !== 'function') return undefined
  const presets = asRecord(scope.get('remote.permissionPresets'))
  const catalog = presets === undefined ? undefined : Reflect.get(presets, 'catalog')
  if (typeof catalog !== 'function') return undefined
  return {
    mirror: face,
    catalog: { read: () => readCatalog(presets as object, catalog as RemoteMethod) },
    writer: {
      setDefaultPreset: (value, revision) => writeDefaultPreset(settings as object, mutate as RemoteMethod, value, revision),
    },
  }
}

async function readCatalog(presets: object, catalog: RemoteMethod): Promise<PermissionCatalog> {
  const result: unknown = await Reflect.apply(catalog, presets, [])
  if (Reflect.get(asRecord(result) ?? {}, 'ok') !== true) {
    throw new Error(remoteFailureText(result, 'the permission catalog is unavailable'))
  }
  const value = asRecord(Reflect.get(asRecord(result) as object, 'value'))
  const defaultOptions = value === undefined ? undefined : defaultOptionsOf(value)
  const defaultPreset = value === undefined ? undefined : Reflect.get(value, 'defaultPreset')
  if (defaultOptions === undefined || typeof defaultPreset !== 'string') {
    throw new Error('the permission catalog is malformed')
  }
  return { defaultOptions, defaultPreset }
}

async function writeDefaultPreset(
  settings: object,
  mutate: RemoteMethod,
  value: string,
  revision: number,
): Promise<SettingsWriteOutcome> {
  const result: unknown = await Reflect.apply(mutate, settings, [
    PERMISSION_SETTINGS_NS,
    [{ op: 'set', path: ['defaultPreset'], value }],
    revision,
  ])
  const record = asRecord(result)
  if (record === undefined) return { ok: false, message: 'the settings write returned no outcome' }
  if (Reflect.get(record, 'ok') === true) return { ok: true, view: Reflect.get(record, 'view') }
  return { ok: false, message: remoteFailureText(result, 'the settings write was refused') }
}

function defaultOptionsOf(value: object): readonly PermissionOption[] | undefined {
  const raw = Reflect.get(value, 'defaultOptions')
  if (!Array.isArray(raw)) return undefined
  const options: PermissionOption[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    const optionValue = record === undefined ? undefined : Reflect.get(record, 'value')
    const name = record === undefined ? undefined : Reflect.get(record, 'name')
    if (typeof optionValue !== 'string' || typeof name !== 'string') return undefined
    options.push({ value: optionValue, name })
  }
  return options
}

function remoteFailureText(result: unknown, fallback: string): string {
  const error = asRecord(Reflect.get(asRecord(result) ?? {}, 'error'))
  const message = error === undefined ? undefined : Reflect.get(error, 'message')
  return typeof message === 'string' && message.length > 0 ? message : fallback
}

function isMirrorFace(value: unknown): value is SettingsMirrorFace {
  const record = asRecord(value)
  if (record === undefined) return false
  return ['getSnapshot', 'subscribe', 'ensure', 'acceptView']
    .every(key => typeof Reflect.get(record, key) === 'function')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}
