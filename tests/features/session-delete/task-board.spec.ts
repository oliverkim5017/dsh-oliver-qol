import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  planTaskBoardPrune, pruneTaskBoardReferences, TASK_BOARD_SCHEMA_VERSION,
} from '../../../src/features/session-delete/task-board.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function ledgerFile(body: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-board-'))
  roots.push(root)
  const path = join(root, 'ledger-v2.json')
  await writeFile(path, typeof body === 'string' ? body : JSON.stringify(body, null, 2), 'utf8')
  return path
}

const ledger = (tasks: readonly unknown[]): Record<string, unknown> => ({
  schemaVersion: TASK_BOARD_SCHEMA_VERSION,
  revision: 7,
  tasks,
  scheduler: { timeZone: 'Asia/Shanghai', ledgerId: 'l1', lastTickAt: 1 },
  recentRequests: [],
})

const card = (executions: readonly unknown[]): Record<string, unknown> => ({
  id: 'card-1', title: 't', status: 'done', executions, workspaceId: 'w1',
})

describe('planTaskBoardPrune', () => {
  it('drops the execution records that pin a deleted session', () => {
    const plan = planTaskBoardPrune(ledger([
      card([
        { id: 'e1', sessionId: 'root', startedAt: 1, endedAt: 2 },
        { id: 'e2', sessionId: 'child', startedAt: 1, endedAt: 2 },
        { id: 'e3', sessionId: 'kept', startedAt: 1, endedAt: 2 },
      ]),
    ]), new Set(['root', 'child']))

    expect(plan?.droppedExecutions).toBe(2)
    expect(plan?.tasksTouched).toBe(1)
    const tasks = plan?.ledger.tasks as { executions: { id: string }[] }[]
    expect(tasks[0]?.executions.map(entry => entry.id)).toEqual(['e3'])
  })

  it('keeps an execution that is still open, whatever its session', () => {
    const plan = planTaskBoardPrune(ledger([
      card([{ id: 'e1', sessionId: 'root', startedAt: 1 }]),
    ]), new Set(['root']))
    expect(plan?.droppedExecutions).toBe(0)
  })

  it('keeps the card itself, its columns and its schedule', () => {
    const body = {
      ...ledger([{ ...card([]), schedule: { enabled: true, cron: '0 9 * * *' }, teamRun: true }]),
    }
    const plan = planTaskBoardPrune(body, new Set(['root']))
    const tasks = plan?.ledger.tasks as Record<string, unknown>[]
    expect(tasks[0]?.schedule).toEqual({ enabled: true, cron: '0 9 * * *' })
    expect(tasks[0]?.teamRun).toBe(true)
  })

  it('leaves the ledger revision alone', () => {
    const plan = planTaskBoardPrune(ledger([]), new Set(['root']))
    expect(plan?.ledger.revision).toBe(7)
  })

  it('refuses a ledger whose schema version it does not know', () => {
    expect(planTaskBoardPrune({ schemaVersion: 5, tasks: [] }, new Set(['root']))).toBeUndefined()
    expect(planTaskBoardPrune({ schemaVersion: 99, tasks: [] }, new Set(['root']))).toBeUndefined()
  })

  it('refuses a body that is not a ledger', () => {
    expect(planTaskBoardPrune(null, new Set(['root']))).toBeUndefined()
    expect(planTaskBoardPrune({ schemaVersion: TASK_BOARD_SCHEMA_VERSION }, new Set(['root'])))
      .toBeUndefined()
    expect(planTaskBoardPrune(
      { schemaVersion: TASK_BOARD_SCHEMA_VERSION, tasks: 'nope' }, new Set(['root']),
    )).toBeUndefined()
  })

  it('tolerates cards without an executions array', () => {
    const plan = planTaskBoardPrune(ledger([{ id: 'card-9', title: 'no runs' }]), new Set(['root']))
    expect(plan?.droppedExecutions).toBe(0)
  })
})

describe('pruneTaskBoardReferences', () => {
  const warn = (): void => undefined

  it('rewrites the ledger and reports what it dropped', async () => {
    const path = await ledgerFile(ledger([
      card([{ id: 'e1', sessionId: 'root', startedAt: 1, endedAt: 2 }]),
    ]))
    const result = await pruneTaskBoardReferences({ ledgerPath: path, warn }, new Set(['root']))
    expect(result).toEqual({ dropped: 1, touched: 1 })
    const written = JSON.parse(await readFile(path, 'utf8')) as { tasks: { executions: unknown[] }[] }
    expect(written.tasks[0]?.executions).toEqual([])
  })

  it('leaves a clean ledger byte-identical', async () => {
    const body = ledger([card([{ id: 'e1', sessionId: 'kept', startedAt: 1, endedAt: 2 }])])
    const path = await ledgerFile(body)
    const before = await readFile(path, 'utf8')
    const result = await pruneTaskBoardReferences({ ledgerPath: path, warn }, new Set(['root']))
    expect(result).toEqual({ dropped: 0, touched: 0, skipped: 'clean' })
    expect(await readFile(path, 'utf8')).toBe(before)
  })

  it('reports a missing ledger instead of creating one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'oliver-qol-board-missing-'))
    roots.push(root)
    const path = join(root, 'ledger-v2.json')
    await expect(pruneTaskBoardReferences({ ledgerPath: path, warn }, new Set(['root'])))
      .resolves.toEqual({ dropped: 0, touched: 0, skipped: 'missing' })
  })

  it('reports an unreadable ledger instead of throwing', async () => {
    const path = await ledgerFile('{not json')
    await expect(pruneTaskBoardReferences({ ledgerPath: path, warn }, new Set(['root'])))
      .resolves.toEqual({ dropped: 0, touched: 0, skipped: 'unreadable' })
  })

  it('reports an unknown schema instead of guessing', async () => {
    const path = await ledgerFile({ schemaVersion: 5, tasks: [] })
    await expect(pruneTaskBoardReferences({ ledgerPath: path, warn }, new Set(['root'])))
      .resolves.toEqual({ dropped: 0, touched: 0, skipped: 'schema' })
  })

  it('does nothing when the delete removed no sessions', async () => {
    const path = await ledgerFile(ledger([card([])]))
    await expect(pruneTaskBoardReferences({ ledgerPath: path, warn }, new Set()))
      .resolves.toEqual({ dropped: 0, touched: 0, skipped: 'clean' })
  })
})
