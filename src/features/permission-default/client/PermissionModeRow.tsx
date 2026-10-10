import { useEffect } from 'react'
import { SegmentedControl, type SegmentedControlOption } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Translate } from '../../../client/context.js'
import { permissionPresetLabel, type PermissionModeState } from './permission-mode.js'

/** Machine value whose selection raises the static risk note. */
const FULL_ACCESS_VALUE = 'danger-full-access'
/** Id base of the segmented control (each tab is `<id>-<value>`). */
const CONTROL_ID = 'oliver-qol-permission-default'

/** Row column layout. */
const ROW_STYLE = { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0' } as const
/** Row title. */
const TITLE_STYLE = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '22px',
} as const
/** Description, hint, and transient-state text. */
const NOTE_STYLE = {
  color: 'var(--dsw-alias-label-tertiary)',
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '18px',
} as const
/** Full-access risk note. */
const WARNING_STYLE = {
  color: 'var(--dsw-alias-state-error-primary)',
  fontSize: '12px',
  lineHeight: '18px',
} as const

/** Behavior the row injects (the `hooks` compartment binds as the `useMode` hook). */
export interface PermissionModeRowInjected {
  readonly hooks: { readonly mode: SnapshotStore<PermissionModeState> }
  readonly load: () => void
  readonly select: (value: string) => void
}

/** Composed props of the default-permission row. */
export interface PermissionModeRowProps extends Omit<PermissionModeRowInjected, 'hooks'> {
  readonly useMode: <T>(selector: (state: PermissionModeState) => T) => T
  readonly t: Translate
}

/**
 * Extend-settings item: the default permission mode of newly created
 * sessions. Selecting writes immediately; no risk dialog stands in the way.
 * @param props - injected load/select behavior, row hook, and locale seat.
 * @returns the row.
 */
export function PermissionModeRow({ load, select, useMode, t }: PermissionModeRowProps) {
  const state = useMode(snapshot => snapshot)
  useEffect(() => { load() }, [load])
  const optionLabel = (option: PermissionModeState['options'][number]): string =>
    permissionPresetLabel(option.value, option.name, t)
  const options: readonly SegmentedControlOption<string>[] = state.options.map(option => ({
    value: option.value,
    label: optionLabel(option),
  }))
  const selectable = state.status === 'ready' || state.status === 'saving'
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{t('title')}</div>
      <div style={NOTE_STYLE} role={state.error === null ? undefined : 'alert'}>
        {state.error ?? t('description')}
      </div>
      {selectable && options.length >= 2
        ? (
            <SegmentedControl
              id={CONTROL_ID}
              value={state.current}
              options={options}
              onChange={select}
              label={t('title')}
              disabled={!state.writable || state.status === 'saving'}
            />
          )
        : <div style={NOTE_STYLE}>{transientText(state, t)}</div>}
      <div style={NOTE_STYLE}>{t('hint')}</div>
      {state.current === FULL_ACCESS_VALUE && <div style={WARNING_STYLE}>{t('fullAccessWarning')}</div>}
    </div>
  )
}

function transientText(state: PermissionModeState, t: Translate): string | null {
  if (state.status === 'loading') return t('loading')
  if (state.status === 'unavailable') return t('unavailable')
  if (state.options.length === 1 && state.options[0] !== undefined) {
    return permissionPresetLabel(state.options[0].value, state.options[0].name, t)
  }
  if (state.options.length === 0) return t('unavailable')
  return null
}
