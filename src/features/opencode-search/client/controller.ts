import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  OPENCODE_SEARCH_CLIENT_DEFAULTS, OPENCODE_SEARCH_SETTINGS_NS, deriveOpencodeSearchRow, isValidProxyPort,
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
export type OpencodeSearchField = 'enabled' | 'model' | 'proxyUrl' | 'proxyPort'

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
  proxyUrl: OPENCODE_SEARCH_CLIENT_DEFAULTS.proxyUrl,
  proxyPort: OPENCODE_SEARCH_CLIENT_DEFAULTS.proxyPort,
  error: null,
}

/**
 * Row controller of the OpenCode web search setting: it follows the shared
 * settings mirror and writes one path-addressed mutation per edit through the
 * shared settings write path.
 *
 * Edits are serialized rather than dropped. Each write is revision-fenced
 * against the row it read, so two overlapping writes would make the older one
 * refuse as stale; queueing them keeps the order the user typed and still lets
 * the last edit, not the first, decide what lands.
 */
export class OpencodeSearchController {
  /** Snapshot the tab consumes through the slot's selector hook. */
  readonly store: SnapshotStore<OpencodeSearchRowState>
  private unsubscribe: (() => void) | undefined
  /** Edits waiting for the write in flight, in the order they were made. */
  private readonly pending: { readonly field: OpencodeSearchField, readonly value: unknown }[] = []
  private writing = false
  /** Message of the refusal the drain has not resolved yet, if any. */
  private failure: string | null = null
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
   * Persist the proxy host the search request goes through; empty input means
   * a direct connection.
   * @param value - the host or URL typed into the URL field.
   * @returns settlement once the write answered and the row reflects it.
   */
  async setProxyUrl(value: string): Promise<void> {
    await this.write('proxyUrl', value.trim())
  }

  /**
   * Persist the proxy port, checked against the values the host accepts — a
   * port the host would refuse is never written, so the row and the next
   * search cannot disagree.
   * @param value - the port typed into the port field; empty follows the URL.
   * @returns settlement once the write answered and the row reflects it.
   */
  async setProxyPort(value: string): Promise<void> {
    const port = value.trim()
    if (!isValidProxyPort(port)) return
    await this.write('proxyPort', port)
  }

  /** Stop following the mirror; later publishes leave the snapshot alone. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  private async write(field: OpencodeSearchField, value: unknown): Promise<void> {
    if (this.disposed) return
    this.pending.push({ field, value })
    if (this.writing) return
    this.writing = true
    try {
      await this.drain()
    } finally {
      this.writing = false
      // Whatever the drain left behind, the row reports the mirror's value and
      // its status again — including the edits the drain dropped.
      if (this.pending.length === 0) this.derive()
    }
  }

  /**
   * Drain the edit queue, one mutation at a time. An edit is dropped only when
   * the row cannot accept any write at all, or when it repeats the value the
   * row already holds; a refusal surfaces in the row and leaves the rest of the
   * queue intact, because each edit is fenced against the revision this loop
   * just read.
   */
  private async drain(): Promise<void> {
    while (!this.disposed) {
      const edit = this.pending.shift()
      if (edit === undefined) return
      const state = this.store.getSnapshot()
      if (!state.writable || state.status === 'unavailable' || state.status === 'loading') continue
      if (state[edit.field] === edit.value) continue
      const row = this.entryRow()
      if (row === undefined) continue
      this.store.set({ ...state, status: 'saving', error: null })
      let outcome: SettingsWriteOutcome
      try {
        outcome = await this.deps.writer.setField(edit.field, edit.value, row.revision)
      } catch (error) {
        outcome = { ok: false, message: error instanceof Error ? error.message : String(error) }
      }
      if (this.disposed) return
      if (!outcome.ok) {
        this.failure = outcome.message
        this.store.set({ ...this.store.getSnapshot(), status: 'error', error: outcome.message })
        continue
      }
      // Read after the fold, always: the mirror may publish the accepted view
      // through its subscribers while this write still counted as in flight,
      // and a row left on the value the write replaced makes the next edit read
      // that stale value and refuse itself as unchanged.
      this.failure = null
      this.deps.mirror.acceptView(outcome.view)
      this.derive()
    }
  }

  private entryRow(): OpencodeSearchNamespaceRow | undefined {
    return this.deps.mirror.getSnapshot().view?.namespaces
      .find(entry => entry.ns === OPENCODE_SEARCH_SETTINGS_NS)
  }

  private derive(): void {
    if (this.disposed) return
    // The mirror may publish mid-drain; its answer must not erase a refusal the
    // user has not resolved, nor report a write as finished while the queue
    // still holds edits.
    if (this.failure !== null) return
    const row = deriveOpencodeSearchRow(this.deps.mirror.getSnapshot())
    this.store.set(this.writing ? { ...row, status: 'saving' } : row)
  }
}
