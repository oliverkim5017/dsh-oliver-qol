import { describe, expect, it } from 'vitest'
import {
  resolveSessionDeleteConfig, SESSION_DELETE_DEFAULTS, sessionDeleteConfigSchema,
} from '../../../src/features/session-delete/config.js'

describe('session delete config', () => {
  it('applies the documented defaults to an empty section', () => {
    expect(sessionDeleteConfigSchema({})).toEqual({ ...SESSION_DELETE_DEFAULTS })
  })

  it('keeps explicit values and defaults the rest', () => {
    const resolved = sessionDeleteConfigSchema({
      sessionsRoot: 'C:/sessions', quiescenceTimeoutMs: 5, quiescencePollMs: 2,
    })
    expect(resolved).toMatchObject({
      sessionsRoot: 'C:/sessions', quiescenceTimeoutMs: 5, quiescencePollMs: 2,
    })
    expect(resolved.removeOrphanedTeamState).toBe(SESSION_DELETE_DEFAULTS.removeOrphanedTeamState)
    expect(resolved.taskBoardLedgerPath).toBe(SESSION_DELETE_DEFAULTS.taskBoardLedgerPath)
  })

  it('lets a deployment opt out of both reference cleanups', () => {
    const resolved = sessionDeleteConfigSchema({
      removeOrphanedTeamState: false,
      pruneTaskBoardReferences: false,
      taskBoardLedgerPath: 'D:/board/ledger-v2.json',
    })
    expect(resolved).toMatchObject({
      removeOrphanedTeamState: false,
      pruneTaskBoardReferences: false,
      taskBoardLedgerPath: 'D:/board/ledger-v2.json',
    })
  })

  it('resolves an absent section to the defaults', () => {
    expect(resolveSessionDeleteConfig(undefined)).toEqual({ ...SESSION_DELETE_DEFAULTS })
  })

  it('resolves a partial section against the defaults', () => {
    expect(resolveSessionDeleteConfig({ quiescencePollMs: 7 })).toEqual({
      ...SESSION_DELETE_DEFAULTS,
      quiescencePollMs: 7,
    })
  })
})
