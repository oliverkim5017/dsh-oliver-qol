import { readFile, rename, rm, writeFile } from 'node:fs/promises'

/**
 * Task-board reference cleanup.
 *
 * The task board keeps a Host-global ledger at `$DSH_HOME/task-board/ledger-v2.json`.
 * Each card records the executions it ran, and every execution pins the session
 * that performed it. Deleting a session leaves those records pointing at an id
 * that no longer resolves: the card still shows a run whose transcript cannot
 * be opened.
 *
 * What this module does **not** do, on purpose:
 *
 * - It never deletes a card, never moves a column, never edits a prompt or a
 *   schedule. Only the dangling execution records go.
 * - It never rewrites an execution that is still open (`endedAt` absent): that
 *   run may still be appending, and its session id is a live reference.
 * - It refuses an unknown `schemaVersion` instead of pattern-matching whatever
 *   fields happen to be there. The ledger is another plugin's primary store,
 *   not a cache this plugin owns.
 *
 * The write is optimistic: the ledger file is re-read immediately before the
 * replace, and any change since the planning read aborts the pass. Losing one
 * cleanup pass is recoverable on the next delete; clobbering the board's newest
 * state is not.
 */

/** File name of the task board ledger inside `$DSH_HOME/task-board`. */
export const TASK_BOARD_LEDGER_FILE = 'ledger-v2.json'

/** The ledger layout this module understands. */
export const TASK_BOARD_SCHEMA_VERSION = 6

/** What one prune pass would change. */
export interface TaskBoardPrunePlan {
  /** The ledger with the dangling execution records removed. */
  readonly ledger: Record<string, unknown>
  /** Execution records dropped across every card. */
  readonly droppedExecutions: number
  /** Cards that lost at least one execution record. */
  readonly tasksTouched: number
}

/** Why a pass wrote nothing. */
export type TaskBoardSkipReason =
  | 'missing' | 'unreadable' | 'schema' | 'clean' | 'changed' | 'write-failed'

/** Outcome of one prune pass. */
export interface TaskBoardPruneResult {
  /** Execution records removed; `0` when the ledger was skipped or already clean. */
  readonly dropped: number
  /** Cards the dropped records belonged to. */
  readonly touched: number
  /** Present when nothing was written. */
  readonly skipped?: TaskBoardSkipReason
}

/** Where the ledger lives and how to report a failed pass. */
export interface TaskBoardPruneDeps {
  /** Absolute path of `ledger-v2.json`. */
  readonly ledgerPath: string
  /** Diagnostics sink; a failed pass is reported, never thrown at the user. */
  readonly warn: (message: string) => void
}

/**
 * Plan one ledger rewrite.
 * @param ledger - parsed ledger, or any other value read from the path.
 * @param deleted - string ids of the sessions this delete actually removed.
 * @returns the plan, or `undefined` when the ledger is not a layout this module
 *   understands (wrong schema version, or no `tasks` array).
 */
export function planTaskBoardPrune(
  ledger: unknown,
  deleted: ReadonlySet<string>,
): TaskBoardPrunePlan | undefined {
  if (typeof ledger !== 'object' || ledger === null) return undefined
  if (Reflect.get(ledger, 'schemaVersion') !== TASK_BOARD_SCHEMA_VERSION) return undefined
  const tasks = Reflect.get(ledger, 'tasks')
  if (!Array.isArray(tasks)) return undefined

  let droppedExecutions = 0
  let tasksTouched = 0
  const nextTasks = tasks.map((task: unknown) => {
    if (typeof task !== 'object' || task === null) return task
    const executions = Reflect.get(task, 'executions')
    if (!Array.isArray(executions)) return task
    const kept = executions.filter((entry: unknown) => !isDangling(entry, deleted))
    const dropped = executions.length - kept.length
    if (dropped === 0) return task
    droppedExecutions += dropped
    tasksTouched += 1
    return { ...task, executions: kept }
  })

  return {
    ledger: { ...ledger, tasks: nextTasks },
    droppedExecutions,
    tasksTouched,
  }
}

/**
 * Decide whether one recorded execution points at a session this delete removed.
 *
 * A record without `endedAt` is still open and is kept unconditionally: its
 * session may already be gone from the session store while the runner still
 * holds it.
 * @param entry - one element of a card's `executions` array.
 * @param deleted - string ids of the sessions this delete actually removed.
 * @returns whether the record should be dropped.
 */
function isDangling(entry: unknown, deleted: ReadonlySet<string>): boolean {
  if (typeof entry !== 'object' || entry === null) return false
  if (Reflect.get(entry, 'endedAt') === undefined) return false
  const sessionId = Reflect.get(entry, 'sessionId')
  return typeof sessionId === 'string' && deleted.has(sessionId)
}

/**
 * Drop the ledger's execution records for deleted sessions.
 *
 * Every failure path returns a result instead of throwing: the sessions are
 * already gone by the time this runs, so a stale reference is a tidiness
 * problem, not a reason to fail the delete the user asked for.
 * @param deps - ledger path and diagnostics sink.
 * @param deleted - string ids of the sessions this delete actually removed.
 * @returns what was removed, or why the pass was skipped.
 */
export async function pruneTaskBoardReferences(
  deps: TaskBoardPruneDeps,
  deleted: ReadonlySet<string>,
): Promise<TaskBoardPruneResult> {
  if (deleted.size === 0) return { dropped: 0, touched: 0, skipped: 'clean' }

  const first = await readLedger(deps)
  if (first.kind === 'skip') return { dropped: 0, touched: 0, skipped: first.reason }
  const plan = planTaskBoardPrune(first.body, deleted)
  if (plan === undefined) return { dropped: 0, touched: 0, skipped: 'schema' }
  if (plan.droppedExecutions === 0) return { dropped: 0, touched: 0, skipped: 'clean' }

  // Optimistic guard: the board itself may have committed between the planning
  // read and this replace. Any byte change aborts rather than writing a stale
  // snapshot over newer state.
  const again = await readLedger(deps)
  if (again.kind === 'skip') return { dropped: 0, touched: 0, skipped: again.reason }
  if (again.raw !== first.raw) return { dropped: 0, touched: 0, skipped: 'changed' }

  const temporary = `${deps.ledgerPath}.session-delete-${String(process.pid)}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(plan.ledger, null, 2)}\n`, 'utf8')
    await rename(temporary, deps.ledgerPath)
  } catch (error: unknown) {
    await rm(temporary, { force: true }).catch(() => undefined)
    deps.warn(`task board ledger write failed: ${describeError(error)}`)
    return { dropped: 0, touched: 0, skipped: 'write-failed' }
  }
  return { dropped: plan.droppedExecutions, touched: plan.tasksTouched }
}

type LedgerRead =
  | { readonly kind: 'ok', readonly raw: string, readonly body: unknown }
  | { readonly kind: 'skip', readonly reason: TaskBoardSkipReason }

/**
 * Read and parse the ledger once.
 * @param deps - ledger path and diagnostics sink.
 * @returns the raw text with its parsed body, or why the read was skipped.
 */
async function readLedger(deps: TaskBoardPruneDeps): Promise<LedgerRead> {
  let raw: string
  try {
    raw = await readFile(deps.ledgerPath, 'utf8')
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'ENOENT') return { kind: 'skip', reason: 'missing' }
    deps.warn(`task board ledger read failed: ${describeError(error)}`)
    return { kind: 'skip', reason: 'unreadable' }
  }
  try {
    return { kind: 'ok', raw, body: JSON.parse(raw) as unknown }
  } catch {
    return { kind: 'skip', reason: 'unreadable' }
  }
}

function errorCodeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code: unknown = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
