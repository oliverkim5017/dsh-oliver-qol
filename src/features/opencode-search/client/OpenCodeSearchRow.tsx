import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Button, Input, Menu, Switch, type MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { Translate } from '../../../client/context.js'
import { opencodeSearchModelOptions } from './models.js'
import type { OpencodeSearchRowState } from './opencode-search.js'

/** Class the injected stylesheet caps; `listClassName` is the only style hook reaching the list. */
const MODEL_MENU_CLASS = 'oliver-qol-opencode-search-model-menu'
/** Id guard so repeated mounts inject the stylesheet once. */
const MODEL_MENU_STYLE_ID = 'oliver-qol-opencode-search-model-menu-style'
/** Cap the catalog dropdown; the Menu default only limits it to the viewport height. */
const MODEL_MENU_CSS = `.${MODEL_MENU_CLASS}{max-height:300px;overflow-y:auto;overscroll-behavior:contain;}`

/** Inject the dropdown cap once per document. */
function useModelMenuStyle(): void {
  useEffect(() => {
    if (document.getElementById(MODEL_MENU_STYLE_ID) !== null) return
    const style = document.createElement('style')
    style.id = MODEL_MENU_STYLE_ID
    style.textContent = MODEL_MENU_CSS
    document.head.append(style)
  }, [])
}

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
/** Address line: label, proxy host, then its port. */
const PROXY_ROW_STYLE = { display: 'flex', alignItems: 'center', gap: '8px' } as const
/** Host field; the Input wrapper is a flex item here, so it carries the growth. */
const PROXY_URL_STYLE = { flex: '1 1 240px', minWidth: '180px' } as const
/** Port field: wide enough for five digits without stretching the row. */
const PROXY_PORT_INPUT_STYLE = { width: '52px' } as const

/** Behavior the row injects (the `hooks` compartment binds as the `useRow` hook). */
export interface OpencodeSearchRowInjected {
  readonly hooks: { readonly row: SnapshotStore<OpencodeSearchRowState> }
  readonly load: () => void
  readonly setEnabled: (value: boolean) => void
  readonly setModel: (value: string) => void
  readonly setProxyUrl: (value: string) => void
  readonly setProxyPort: (value: string) => void
}

/** Composed props of the OpenCode web search row. */
export interface OpencodeSearchRowProps extends Omit<OpencodeSearchRowInjected, 'hooks'> {
  readonly useRow: <T>(selector: (state: OpencodeSearchRowState) => T) => T
  readonly t: Translate
}

/**
 * Extend-settings item: routes the built-in `web_search` tool through OpenCode
 * Go while enabled, and picks the auxiliary search model plus the proxy
 * address of that search request alone.
 * @param props - injected behavior, row hook, and locale seat.
 * @returns the row.
 */
export function OpencodeSearchRow(props: OpencodeSearchRowProps) {
  const { load, setEnabled, setModel, setProxyUrl, setProxyPort, useRow, t } = props
  const state = useRow(snapshot => snapshot)
  const [menuOpen, setMenuOpen] = useState(false)
  // The proxy halves are text fields: they commit on blur or Enter, so one
  // typed address is one settings write rather than one per keystroke.
  const url = useDraft(state.proxyUrl, setProxyUrl)
  const port = useDraft(state.proxyPort, setProxyPort)
  useEffect(() => { load() }, [load])
  useModelMenuStyle()
  const saving = state.status === 'saving'
  const selectable = state.status === 'ready' || saving
  const locked = !state.writable || saving
  const modelItems: readonly MenuItem[] = opencodeSearchModelOptions(state.model)
    .map(model => ({ id: model, label: model }))
  return (
    <div style={ROW_STYLE}>
      <div style={TITLE_STYLE}>{t('title')}</div>
      <div style={NOTE_STYLE}>{t('description')}</div>
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
                  dense
                  listClassName={MODEL_MENU_CLASS}
                  onSelect={(id: string) => {
                    setMenuOpen(false)
                    setModel(id)
                  }}
                  onClose={() => { setMenuOpen(false) }}
                />
              </div>
              <div style={PROXY_ROW_STYLE}>
                <span style={LABEL_STYLE}>{t('proxyLabel')}</span>
                <Input
                  type="text"
                  style={PROXY_URL_STYLE}
                  value={url.text}
                  placeholder={t('proxyUrlPlaceholder')}
                  aria-label={t('proxyUrlLabel')}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={locked}
                  onChange={event => { url.edit(event.currentTarget.value) }}
                  onBlur={url.commit}
                  onKeyDown={event => { commitOnEnter(event, url.commit) }}
                />
                <Input
                  type="text"
                  inputMode="numeric"
                  // `Input` forwards `style` to the native field, so the port
                  // field is sized here and its wrapper stays at that width.
                  style={PROXY_PORT_INPUT_STYLE}
                  value={port.text}
                  placeholder={t('proxyPortPlaceholder')}
                  aria-label={t('proxyPortLabel')}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={5}
                  disabled={locked}
                  onChange={event => { port.edit(event.currentTarget.value) }}
                  onBlur={port.commit}
                  onKeyDown={event => { commitOnEnter(event, port.commit) }}
                />
              </div>
            </>
          )
        : <div style={NOTE_STYLE}>{transientText(state, t)}</div>}
      {state.error === null
        ? null
        : <div style={NOTE_STYLE} role="alert">{t('errorPrefix')}{state.error}</div>}
      <div style={NOTE_STYLE}>{t('modelHint')}</div>
      <div style={NOTE_STYLE}>{t('proxyHint')}</div>
      <div style={NOTE_STYLE}>{state.enabled ? t('hint') : t('disabledHint')}</div>
    </div>
  )
}

/** The address editor: the draft text plus the two gestures that commit it. */
interface DraftField {
  readonly text: string
  readonly edit: (value: string) => void
  readonly commit: () => void
}

/**
 * Follow one configured string as editable text.
 *
 * The draft is written when the field is left (blur, Enter) rather than per
 * keystroke, so a half-typed address never reaches the config and one typed
 * address is one settings write. A value the store reports that this field did
 * not itself edit — a fresh read, another window's write — reseeds the draft;
 * the value this field just wrote does not, so a slow round-trip cannot
 * overwrite what is being typed. A refused write leaves the draft alone, so
 * committing the same text again retries it.
 * @param value - the configured value.
 * @param commit - writes one trimmed, changed value.
 * @returns the draft text and its gestures.
 */
function useDraft(value: string, commit: (next: string) => void): DraftField {
  const [text, setText] = useState(value)
  const seen = useRef(value)
  useEffect(() => {
    if (value === seen.current) return
    seen.current = value
    setText(value)
  }, [value])
  return {
    text,
    edit: setText,
    commit: () => {
      // Reflect the trimmed value immediately: the store catches up when the
      // write answers, and a refused write keeps its text visible to correct.
      const next = text.trim()
      setText(next)
      if (next === seen.current) return
      commit(next)
    },
  }
}

/** Commit one field when Enter leaves it, so the write happens once. */
function commitOnEnter(event: KeyboardEvent<HTMLInputElement>, commit: () => void): void {
  if (event.key !== 'Enter') return
  event.currentTarget.blur()
  commit()
}

function transientText(state: OpencodeSearchRowState, t: Translate): string | null {
  if (state.status === 'loading') return t('loading')
  if (state.status === 'saving') return t('saving')
  if (state.status === 'unavailable') return t('unavailable')
  return null
}
