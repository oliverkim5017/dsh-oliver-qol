import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectTeamStateCandidates, planTeamStateRemoval, readTeamStateCandidate,
  readTeamStateCandidates, removeTeamStateDirs, TEAM_STATE_DIR, TEAM_STATE_FILE,
} from '../../../src/features/session-delete/team-state.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'oliver-qol-team-'))
  roots.push(root)
  return root
}

async function team(
  cwd: string,
  teamId: string,
  body: unknown,
): Promise<string> {
  const dir = join(cwd, TEAM_STATE_DIR, teamId)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, TEAM_STATE_FILE), JSON.stringify(body), 'utf8')
  return dir
}

describe('readTeamStateCandidate', () => {
  it('reads the captain and the member session ids', () => {
    expect(readTeamStateCandidate({
      captainSessionId: 'captain-1',
      members: [{ id: 'member-a' }, { id: 'member-b' }, { name: 'no-id' }],
    }, '/w/.agent-teams/t1', 't1')).toEqual({
      teamId: 't1',
      dir: '/w/.agent-teams/t1',
      captainSessionId: 'captain-1',
      memberSessionIds: ['member-a', 'member-b'],
    })
  })

  it('keeps a team whose record names no captain', () => {
    expect(readTeamStateCandidate({ members: [] }, '/w/t', 't')).toEqual({
      teamId: 't', dir: '/w/t', memberSessionIds: [],
    })
  })

  it('rejects a body that is not a team record', () => {
    expect(readTeamStateCandidate(null, '/w/t', 't')).toBeUndefined()
    expect(readTeamStateCandidate('nope', '/w/t', 't')).toBeUndefined()
  })
})

describe('planTeamStateRemoval', () => {
  const captain = {
    teamId: 't1', dir: '/w/t1', captainSessionId: 'root', memberSessionIds: ['c1', 'c2'],
  }
  const orphanMember = {
    teamId: 't2', dir: '/w/t2', captainSessionId: 'other', memberSessionIds: ['c9'],
  }

  it('removes a team whose captain was deleted and ignores its members', () => {
    const plan = planTeamStateRemoval([captain, orphanMember], new Set(['root', 'c1']))
    expect(plan.orphaned).toEqual([{ teamId: 't1', dir: '/w/t1', reason: 'captain' }])
    expect(plan.partial).toEqual([])
  })

  it('reports a team that lost only members and leaves it in place', () => {
    const plan = planTeamStateRemoval([captain], new Set(['c2']))
    expect(plan.orphaned).toEqual([])
    expect(plan.partial).toEqual([
      { teamId: 't1', dir: '/w/t1', deadMemberSessionIds: ['c2'] },
    ])
  })

  it('leaves every team alone when the delete touched none of them', () => {
    const plan = planTeamStateRemoval([captain, orphanMember], new Set(['something-else']))
    expect(plan).toEqual({ orphaned: [], partial: [] })
  })

  it('never guesses on a team with no recorded captain', () => {
    const plan = planTeamStateRemoval(
      [{ teamId: 't3', dir: '/w/t3', memberSessionIds: ['c5'] }],
      new Set(['c5']),
    )
    expect(plan.orphaned).toEqual([])
  })
})

describe('readTeamStateCandidates', () => {
  it('finds every readable team under a workspace', async () => {
    const cwd = await workspace()
    await team(cwd, 'alpha', { captainSessionId: 's1', members: [{ id: 'm1' }] })
    await team(cwd, 'beta', { captainSessionId: 's2', members: [] })
    // A directory without team.json is not a team this cleanup can judge.
    await mkdir(join(cwd, TEAM_STATE_DIR, 'noise'), { recursive: true })

    const candidates = await readTeamStateCandidates(cwd)
    expect(candidates.map(entry => entry.teamId).sort()).toEqual(['alpha', 'beta'])
    expect(candidates[0]?.captainSessionId).toBe('s1')
  })

  it('treats a workspace with no team state as empty', async () => {
    const cwd = await workspace()
    expect(await readTeamStateCandidates(cwd)).toEqual([])
  })

  it('skips a team whose team.json is not JSON', async () => {
    const cwd = await workspace()
    const dir = join(cwd, TEAM_STATE_DIR, 'broken')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, TEAM_STATE_FILE), '{not json', 'utf8')
    expect(await readTeamStateCandidates(cwd)).toEqual([])
  })
})

describe('collectTeamStateCandidates', () => {
  it('deduplicates repeated workspaces', async () => {
    const cwd = await workspace()
    await team(cwd, 'alpha', { captainSessionId: 's1', members: [] })
    const candidates = await collectTeamStateCandidates([cwd, cwd, cwd])
    expect(candidates).toHaveLength(1)
  })
})

describe('removeTeamStateDirs', () => {
  it('removes the planned directories and reports their ids', async () => {
    const cwd = await workspace()
    const dir = await team(cwd, 'alpha', { captainSessionId: 's1', members: [] })
    await expect(removeTeamStateDirs([
      { teamId: 'alpha', dir, reason: 'captain' },
    ])).resolves.toEqual(['alpha'])
    await expect(readFile(join(dir, TEAM_STATE_FILE), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
