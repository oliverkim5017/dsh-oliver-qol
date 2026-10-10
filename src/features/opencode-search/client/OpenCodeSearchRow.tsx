import { useEffect, useState } from 'react'
import { Button, Menu, Switch, type MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Translate } from '../../../client/context.js'
import { opencodeSearchModelOptions } from './models.js'
import type { OpencodeSearchRowState } from './opencode-search.js'

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
/** One labeled control line. */
const CONTROL_STYLE = { display: 'flex', alignItems: 'center', gap: '8px' } as const
/** Field label. */
const LABEL_STYLE = {
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  lineHeight: '20px',
} as const

/** Behavior the row injects (the `hooks` compartment binds as the `useRow` hook). */
export interface OpencodeSearchRowInjected {
  readonly hooks: { readonly row: SnapshotStore<OpencodeSearchRowState> }
  readonly load: () => void
  readonly setEnabled: (value: boolean) => void
  readonly setModel: (value: string) => void
  readonly setUseOpencodeProxy: (value: boolean) => void
}

/** Composed props of the OpenCode web search row. */
export interface OpencodeSearchRowProps extends Omit<OpencodeSearchRowInjected, 'hooks'> {
  readonly useRow: <T>(selector: (state: OpencodeSearchRowState) => T) => T
  readonly t: Translate
}

/**
 * Extend-settings item: routes the built-in `web_search` tool through OpenCode
 * Go while enabled, and picks the model and proxy behavior of the auxiliary
 * search turn.
 * @param props - injected behavior, row hook, and locale seat.
 * @returns the row.
 */
export function OpencodeSearchRow(props: OpencodeSearchRowProps) {
  const { load, setEnabled, setModel, setUseOpencodeProxy, useRow, t } = props
  const state = useRow(snapshot => snapshot)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { load() }, [load])
  const saving = state.status === 'saving'
  const selectable = state.status === 'ready' || saving
  const locked = !state.writable || saving
  const modelItems: readonly MenuItem[] = opencodeSearchModelOptions(state.model)
    .map(model => ({ id: model, label: model }))
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{t('title')}</div>
      <div style={NOTE_STYLE} role={state.error === null ? undefined : 'alert'}>
        {state.error ?? t('description')}
      </div>
      {selectable
        ? (
            <>
              <div style={CONTROL_STYLE}>
                <Switch
                  checked={state.enabled}
                  onChange={setEnabled}
                  label={t('enabledLabel')}
                  disabled={locked}
                />
                <span style={LABEL_STYLE}>{t('enabledLabel')}</span>
              </div>
              <div style={CONTROL_STYLE}>
                <span style={LABEL_STYLE}>{t('modelLabel')}</span>
                <Menu
                  open={menuOpen}
                  anchor={(
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={locked}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      aria-label={t('modelLabel')}
                      onClick={() => { setMenuOpen(open => !open) }}
                    >
                      {state.model}
                    </Button>
                  )}
                  items={modelItems}
                  selectedId={state.model}
                  onSelect={(id: string) => {
                    setMenuOpen(false)
                    setModel(id)
                  }}
                  onClose={() => { setMenuOpen(false) }}
                />
              </div>
              <div style={CONTROL_STYLE}>
                <Switch
                  checked={state.useOpencodeProxy}
                  onChange={setUseOpencodeProxy}
                  label={t('proxyLabel')}
                  disabled={locked}
                />
                <span style={LABEL_STYLE}>{t('proxyLabel')}</span>
              </div>
            </>
          )
        : <div style={NOTE_STYLE}>{transientText(state, t)}</div>}
      <div style={NOTE_STYLE}>{t('modelHint')}</div>
      <div style={NOTE_STYLE}>{t('proxyHint')}</div>
      <div style={NOTE_STYLE}>{state.enabled ? t('hint') : t('disabledHint')}</div>
    </div>
  )
}

function transientText(state: OpencodeSearchRowState, t: Translate): string | null {
  if (state.status === 'loading') return t('loading')
  if (state.status === 'saving') return t('saving')
  if (state.status === 'unavailable') return t('unavailable')
  return null
}
