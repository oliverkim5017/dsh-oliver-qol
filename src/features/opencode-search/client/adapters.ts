import type { ClientScope } from '../../../client/context.js'
import {
  type OpencodeSearchField, type OpencodeSearchWriter, type SettingsMirrorFace, type SettingsWriteOutcome,
} from './controller.js'
import { OPENCODE_SEARCH_SECTION, OPENCODE_SEARCH_SETTINGS_NS } from './opencode-search.js'

/** Everything the OpenCode search row binds from the deferred scope. */
export interface OpencodeSearchAdapters {
  readonly mirror: SettingsMirrorFace
  readonly writer: OpencodeSearchWriter
}

/** One async remote method before strict narrowing. */
type RemoteMethod = (...args: unknown[]) => Promise<unknown>

/**
 * Bind the settings surfaces of the deferred mount scope.
 * @param scope - service scope of the deferred mount.
 * @returns the adapters, or undefined while any required service is missing or malformed.
 */
export function opencodeSearchAdaptersOf(scope: ClientScope): OpencodeSearchAdapters | undefined {
  const configForms = asRecord(scope.get('configForms'))
  const describe = configForms === undefined ? undefined : Reflect.get(configForms, 'describe')
  if (typeof describe !== 'function') return undefined
  const face: unknown = Reflect.apply(describe, configForms as object, [])
  if (!isMirrorFace(face)) return undefined
  const settings = asRecord(scope.get('remote.settings'))
  const mutate = settings === undefined ? undefined : Reflect.get(settings, 'mutate')
  if (typeof mutate !== 'function') return undefined
  return {
    mirror: face,
    writer: {
      setField: (field, value, revision) => writeField(settings as object, mutate as RemoteMethod, field, value, revision),
    },
  }
}

async function writeField(
  settings: object,
  mutate: RemoteMethod,
  field: OpencodeSearchField,
  value: unknown,
  revision: number,
): Promise<SettingsWriteOutcome> {
  const result: unknown = await Reflect.apply(mutate, settings, [
    OPENCODE_SEARCH_SETTINGS_NS,
    [{ op: 'set', path: [OPENCODE_SEARCH_SECTION, field], value }],
    revision,
  ])
  const record = asRecord(result)
  if (record === undefined) return { ok: false, message: 'the settings write returned no outcome' }
  if (Reflect.get(record, 'ok') === true) return { ok: true, view: Reflect.get(record, 'view') }
  return { ok: false, message: remoteFailureText(result, 'the settings write was refused') }
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
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}
