import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence'
import {
  clearWorkspaceAccounting, type WorkspaceAccounting,
} from './accounting.js'
import type { ResolvedSessionDeleteConfig } from './config.js'
import { SESSION_DELETE_CODES, SessionDeleteError } from './errors.js'
import { planSessionDeletion, type SessionDeletionCandidate } from './plan.js'
import { deleteProjectionCacheRecord } from './removal.js'
import {
  stopSessionsForDeletion, type SessionStopWorkspace,
} from './stop.js'

/** One completed delete. */
export interface SessionDeletionReport {
  /** Every id removed from storage, deepest first. */
  readonly deleted: readonly SessionId[]
  /** `.agent-teams` team directories removed because their captain went with them. */
  readonly removedTeams: readonly string[]
  /** Task-board execution records dropped because they pinned a deleted session. */
  readonly droppedTaskExecutions: number
}

/**
 * Cleanup of state that only *references* a session, performed after the stored
 * logs are gone. Both hooks are best-effort: a failure is logged and skipped,
 * because the session the user asked to delete is already deleted.
 */
export interface ReferencedStateDeps {
  /**
   * Remove `.agent-teams` team state owned by the deleted sessions.
   * @param deleted - every id this delete removed, deepest first.
   * @param cwds - workspace directories those sessions ran in, deduplicated.
   * @returns the team ids whose directory was removed.
   */
  readonly removeOrphanedTeamState?: (
    deleted: readonly SessionId[],
    cwds: readonly string[],
  ) => Promise<readonly string[]>
  /**
   * Drop task-board execution records that pin a deleted session.
   * @param deleted - string ids of every session this delete removed.
   * @returns how many records were dropped and how many cards they belonged to.
   */
  readonly pruneTaskBoardReferences?: (
    deleted: ReadonlySet<string>,
  ) => Promise<{ readonly dropped: number, readonly touched: number }>
}

/** Everything the delete pipeline reads from the host. */
export interface SessionDeleteDeps {
  /** Session persistence, read once per request. */
  readonly sessionPersistence: { list(): Promise<readonly SessionPersistenceSnapshot[]> }
  /**
   * Workspace registry, when the composition has one. Read at call time:
   * service fibers activate asynchronously, so an earlier read can miss a
   * provider that is still loading.
   */
  readonly workspaceRegistry: () => (SessionStopWorkspace & WorkspaceAccounting) | undefined
  /** Storage hub's domain facility at call time, when present (projection-cache cleanup). */
  readonly storageDomain: () => unknown
  /** Activity count reported by the composed providers for one session. */
  readonly activityOf: (sessionId: SessionId) => Promise<number>
  /**
   * Related-state cleanup, when the composition provides it. Absent leaves the
   * delete behaving exactly as before this seam existed.
   */
  readonly referencedState?: ReferencedStateDeps
  /** Diagnostics sink. */
  readonly logger: {
    warn(message: string): void
    /** Optional progress line; absent compositions lose only the success trace. */
    info?(message: string): void
  }
  /** Wait one poll interval. */
  readonly sleep: (milliseconds: number) => Promise<void>
  /** Clock in milliseconds. */
  readonly now: () => number
  /** Resolve one session's storage directories. */
  readonly findSessionDirs: (root: string, sessionId: SessionId) => Promise<readonly string[]>
  /** Remove resolved storage directories. */
  readonly removeSessionDirs: (dirs: readonly string[]) => Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The session-delete capability, present while the feature is active. */
    sessionDelete: SessionDeleteService
  }
}

/**
 * Permanent session deletion: resolve the target set, stop what runs, remove
 * the stored logs, then clean derived and accounting state. Derived-state
 * cleanup failures are logged and skipped; the stored logs are the source of truth.
 */
export class SessionDeleteService {
  /**
   * @param deps - host facts.
   * @param config - resolved feature config.
   */
  constructor(
    private readonly deps: SessionDeleteDeps,
    private readonly config: ResolvedSessionDeleteConfig,
  ) {}

  /**
   * Delete one session and its subagent descendants.
   * @param sessionId - the requested session.
   * @returns the ids removed from storage.
   * @throws {SessionDeleteError} with the ids removed before a failure.
   */
  async delete(sessionId: SessionId): Promise<SessionDeletionReport> {
    const workspaceRegistry = this.deps.workspaceRegistry()
    const snapshots = await this.deps.sessionPersistence.list()
    const candidates: readonly SessionDeletionCandidate[] = snapshots.map(snapshot => ({
      id: snapshot.header.id,
      ...(snapshot.header.parentSession === undefined
        ? {}
        : { parentSession: snapshot.header.parentSession }),
      ...(snapshot.header.origin === undefined ? {} : { origin: snapshot.header.origin }),
    }))
    const plan = planSessionDeletion(candidates, sessionId)
    await stopSessionsForDeletion(
      {
        workspaceRegistry,
        activityOf: this.deps.activityOf,
        sleep: this.deps.sleep,
        now: this.deps.now,
      },
      plan.ids,
      { timeoutMs: this.config.quiescenceTimeoutMs, pollMs: this.config.quiescencePollMs },
    )

    const deleted: SessionId[] = []
    let failure: SessionDeleteError | undefined
    for (const id of plan.ids) {
      try {
        const dirs = await this.deps.findSessionDirs(this.config.sessionsRoot, id)
        await this.deps.removeSessionDirs(dirs)
      } catch (error: unknown) {
        failure = new SessionDeleteError(
          SESSION_DELETE_CODES.ioFailed,
          'failed to remove the stored session files',
          deleted,
          error,
        )
        this.deps.logger.warn(
          `session ${String(id)}: storage removal failed: ${describeError(error)}`,
        )
        break
      }
      deleted.push(id)
    }

    for (const id of deleted) {
      await deleteProjectionCacheRecord(this.deps.storageDomain(), id, this.deps.logger.warn)
    }
    await clearWorkspaceAccounting(workspaceRegistry, deleted, this.deps.logger.warn)
    const { removedTeams, droppedTaskExecutions } =
      await this.cleanReferencedState(deleted, snapshots)

    if (failure !== undefined) throw failure
    return { deleted, removedTeams, droppedTaskExecutions }
  }

  /**
   * Drop the state that merely *references* the removed sessions.
   *
   * Runs after the stored logs are gone, on the ids actually removed — a partial
   * delete must not strand references to sessions it left in place. Each hook is
   * isolated: one failing cleanup never stops the other, and neither can fail the
   * delete itself.
   * @param deleted - every id removed from storage, deepest first.
   * @param snapshots - the persistence snapshot the plan was built from.
   * @returns what the hooks removed.
   */
  private async cleanReferencedState(
    deleted: readonly SessionId[],
    snapshots: readonly SessionPersistenceSnapshot[],
  ): Promise<{ removedTeams: readonly string[], droppedTaskExecutions: number }> {
    const state = this.deps.referencedState
    if (state === undefined || deleted.length === 0) {
      return { removedTeams: [], droppedTaskExecutions: 0 }
    }
    const gone = new Set(deleted.map(String))
    const cwds: string[] = []
    for (const snapshot of snapshots) {
      if (!gone.has(String(snapshot.header.id))) continue
      const cwd = snapshot.header.cwd
      if (cwd !== undefined && cwd.length > 0) cwds.push(cwd)
    }

    let removedTeams: readonly string[] = []
    if (state.removeOrphanedTeamState !== undefined) {
      try {
        removedTeams = await state.removeOrphanedTeamState(deleted, cwds)
        if (removedTeams.length > 0) {
          this.deps.logger.info?.(
            `session delete: removed ${String(removedTeams.length)} orphaned team director`
            + `${removedTeams.length === 1 ? 'y' : 'ies'}: ${removedTeams.join(', ')}`,
          )
        }
      } catch (error: unknown) {
        this.deps.logger.warn(`team state cleanup failed: ${describeError(error)}`)
      }
    }

    let droppedTaskExecutions = 0
    if (state.pruneTaskBoardReferences !== undefined) {
      try {
        const result = await state.pruneTaskBoardReferences(gone)
        droppedTaskExecutions = result.dropped
        if (result.dropped > 0) {
          this.deps.logger.info?.(
            `session delete: dropped ${String(result.dropped)} task-board execution record`
            + `${result.dropped === 1 ? '' : 's'} across ${String(result.touched)} card`
            + `${result.touched === 1 ? '' : 's'}`,
          )
        }
      } catch (error: unknown) {
        this.deps.logger.warn(`task board reference cleanup failed: ${describeError(error)}`)
      }
    }

    return { removedTeams, droppedTaskExecutions }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
