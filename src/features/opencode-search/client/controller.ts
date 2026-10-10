import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  OPENCODE_SEARCH_CLIENT_DEFAULTS, OPENCODE_SEARCH_SETTINGS_NS, deriveOpencodeSearchRow,
  type OpencodeSearchMirrorSnapshot, type OpencodeSearchNamespaceRow, type OpencodeSearchRowState,
} from './opencode-search.js'

/** The shared settings mirror surface this feature reads and folds into. */
export interface SettingsMirrorFace {
  getSnapshot(): OpencodeSearchMirrorSnapshot
  subscribe(listener: () => void): () => void
  ensure(): Promise<void>
  /** Fold one accepted namespace view back into the mirror. */
  acceptView(view: unknown): void
}

/** One namespace write outcome. */
export type SettingsWriteOutcome =
  | { readonly ok: true, readonly view: unknown }
  | { readonly ok: false, readonly message: string }

/** One editable field of the OpenCode search section. */
export type OpencodeSearchField = 'enabled' | 'model' | 'useOpencodeProxy'

/** Write one field of the OpenCode search section into the profile entry. */
export interface OpencodeSearchWriter {
  setField(field: OpencodeSearchField, value: unknown, revision: number): Promise<SettingsWriteOutcome>
}

/** Everything the controller reads and writes. */
export interface OpencodeSearchControllerDeps {
  readonly mirror: SettingsMirrorFace
  readonly writer: OpencodeSearchWriter
}

/** Row state before the first read settles. */
const INITIAL_STATE: OpencodeSearchRowState = {
  status: 'loading',
  writable: false,
  enabled: OPENCODE_SEARCH_CLIENT_DEFAULTS.enabled,
  model: OPENCODE_SEARCH_CLIENT_DEFAULTS.model,
  useOpencodeProxy: OPENCODE_SEARCH_CLIENT_DEFAULTS.useOpencodeProxy,
  error: null,
}

/**
 * Row controller of the OpenCode web search setting: it follows the shared
 * settings mirror and writes one path-addressed mutation per edit through the
 * shared settings write path.
 */
export class OpencodeSearchController {
  /** Snapshot the tab consumes through the slot's selector hook. */
  readonly store: SnapshotStore<OpencodeSearchRowState>
  private unsubscribe: (() => void) | undefined
  private saving = false
  private disposed = false

  /**
   * @param deps - mirror and write path.
   */
  constructor(private readonly deps: OpencodeSearchControllerDeps) {
    this.store = createSnapshotStore<OpencodeSearchRowState>(INITIAL_STATE)
  }

  /**
   * Start following the mirror. Idempotent: repeated calls re-derive without
   * re-subscribing.
   * @returns settlement once the current mirror view is reflected.
   */
  async load(): Promise<void> {
    if (this.disposed) return
    this.unsubscribe ??= this.deps.mirror.subscribe(() => { this.derive() })
    await this.deps.mirror.ensure()
    if (!this.disposed) this.derive()
  }

  /**
   * Persist the enable toggle.
   * @param value - the wished state.
   * @returns settlement once the write answered and the row reflects it.
   */
  async setEnabled(value: boolean): Promise<void> {
    await this.write('enabled', value)
  }

  /**
   * Persist the auxiliary search model; empty or unchanged input is ignored.
   * @param value - the model id typed or picked.
   * @returns settlement once the write answered and the row reflects it.
   */
  async setModel(value: string): Promise<void> {
    const model = value.trim()
    if (model.length === 0) return
    await this.write('model', model)
  }

  /**
   * Persist the proxy toggle.
   * @param value - the wished state.
   * @returns settlement once the write answered and the row reflects it.
   */
  async setUseOpencodeProxy(value: boolean): Promise<void> {
    await this.write('useOpencodeProxy', value)
  }

  /** Stop following the mirror; later publishes leave the snapshot alone. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  private async write(field: OpencodeSearchField, value: unknown): Promise<void> {
    if (this.disposed || this.saving) return
    const state = this.store.getSnapshot()
    if (!state.writable || state.status !== 'ready') return
    if (state[field] === value) return
    const row = this.entryRow()
    if (row === undefined) return
    this.saving = true
    this.store.set({ ...state, status: 'saving', error: null })
    let outcome: SettingsWriteOutcome
    try {
      outcome = await this.deps.writer.setField(field, value, row.revision)
    } catch (error) {
      outcome = { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    this.saving = false
    if (this.disposed) return
    if (!outcome.ok) {
      this.store.set({ ...this.store.getSnapshot(), status: 'error', error: outcome.message })
      return
    }
    this.deps.mirror.acceptView(outcome.view)
    this.derive()
  }

  private entryRow(): OpencodeSearchNamespaceRow | undefined {
    return this.deps.mirror.getSnapshot().view?.namespaces
      .find(entry => entry.ns === OPENCODE_SEARCH_SETTINGS_NS)
  }

  private derive(): void {
    if (this.disposed || this.saving) return
    this.store.set(deriveOpencodeSearchRow(this.deps.mirror.getSnapshot()))
  }
}
