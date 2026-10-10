import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  derivePermissionMode, PERMISSION_SETTINGS_NS,
  type PermissionCatalog, type PermissionCatalogState, type PermissionMirrorSnapshot,
  type PermissionModeState, type PermissionNamespaceRow,
} from './permission-mode.js'

/** Read the process permission catalog. */
export interface PermissionCatalogReader {
  read(): Promise<PermissionCatalog>
}

/** The shared settings mirror surface this feature reads and folds into. */
export interface SettingsMirrorFace {
  getSnapshot(): PermissionMirrorSnapshot
  subscribe(listener: () => void): () => void
  ensure(): Promise<void>
  /** Fold one accepted namespace view back into the mirror. */
  acceptView(view: unknown): void
}

/** One namespace write outcome. */
export type SettingsWriteOutcome =
  | { readonly ok: true, readonly view: unknown }
  | { readonly ok: false, readonly message: string }

/** Write the new-session permission default. */
export interface PermissionSettingsWriter {
  setDefaultPreset(value: string, revision: number): Promise<SettingsWriteOutcome>
}

/** Everything the controller reads and writes. */
export interface PermissionModeControllerDeps {
  readonly mirror: SettingsMirrorFace
  readonly catalog: PermissionCatalogReader
  readonly writer: PermissionSettingsWriter
}

/** Row state before the first read settles. */
const INITIAL_STATE: PermissionModeState = {
  status: 'loading',
  writable: false,
  current: '',
  options: [],
  error: null,
}

/**
 * Row controller of the default-permission setting: it follows the shared
 * settings mirror, loads the process catalog once, and writes one
 * `defaultPreset` mutation per selection through the shared write path.
 */
export class PermissionModeController {
  /** Snapshot the tab consumes through the slot's selector hook. */
  readonly store: SnapshotStore<PermissionModeState>
  private unsubscribe: (() => void) | undefined
  private catalogState: PermissionCatalogState = { catalog: null, error: null }
  private catalogRead: Promise<void> | undefined
  private saving = false
  private disposed = false

  /**
   * @param deps - mirror, catalog, and write path.
   */
  constructor(private readonly deps: PermissionModeControllerDeps) {
    this.store = createSnapshotStore<PermissionModeState>(INITIAL_STATE)
  }

  /**
   * Start following the mirror and settle the catalog. Idempotent: repeated
   * calls re-derive without re-subscribing or re-reading a settled catalog.
   * @returns settlement once the current mirror view and catalog are reflected.
   */
  async load(): Promise<void> {
    if (this.disposed) return
    this.unsubscribe ??= this.deps.mirror.subscribe(() => { this.derive() })
    if (this.catalogState.catalog === null && this.catalogRead === undefined) {
      this.catalogRead = this.readCatalog()
    }
    await Promise.all([this.deps.mirror.ensure(), this.catalogRead ?? Promise.resolve()])
    if (!this.disposed) this.derive()
  }

  /**
   * Persist one preset as the default for subsequently created sessions.
   * A selection made while one is already saving is ignored — the control is
   * disabled during the save, so this only drops programmatic double-submits.
   * @param value - advertised preset key.
   * @returns settlement once the write answered and the row reflects it.
   */
  async select(value: string): Promise<void> {
    if (this.disposed || this.saving) return
    const state = this.store.getSnapshot()
    if (!state.writable || state.status !== 'ready' || value === state.current) return
    const row = this.permissionRow()
    if (row === undefined) return
    this.saving = true
    this.store.set({ ...state, status: 'saving', error: null })
    let outcome: SettingsWriteOutcome
    try {
      outcome = await this.deps.writer.setDefaultPreset(value, row.revision)
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

  /** Stop following the mirror; later publishes leave the snapshot alone. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  private async readCatalog(): Promise<void> {
    try {
      this.catalogState = { catalog: await this.deps.catalog.read(), error: null }
    } catch (error) {
      this.catalogState = { catalog: null, error: error instanceof Error ? error.message : String(error) }
    } finally {
      this.catalogRead = undefined
    }
  }

  private permissionRow(): PermissionNamespaceRow | undefined {
    return this.deps.mirror.getSnapshot().view?.namespaces.find(entry => entry.ns === PERMISSION_SETTINGS_NS)
  }

  private derive(): void {
    if (this.disposed || this.saving) return
    this.store.set(derivePermissionMode(this.deps.mirror.getSnapshot(), this.catalogState))
  }
}
