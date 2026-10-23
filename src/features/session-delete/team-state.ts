import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * AgentTeams state cleanup: a team's owner is a session, so deleting that
 * session strands the team directory under the workspace it ran in.
 *
 * The plugin keeps one directory per team under `<workspace>/.agent-teams/<teamId>/`
 * holding `team.json` plus the members' inboxes. Nothing in that layout is
 * derived from the session store, so the session delete path cannot leave it
 * to any later reconciliation: nobody would ever look at it again.
 *
 * Two different strands need different treatment, and only one of them is safe
 * to remove automatically:
 *
 * - **captain deleted** — the team has no owner left. The plugin refuses to
 *   attach a second team to one captain and treats `captainSessionId` as the
 *   owner key, so a team whose captain is gone can never be resumed; the state
 *   is dead weight. Removed.
 * - **member deleted, captain alive** — the team may still be running or
 *   resumable. Rewriting `team.json` from here would race the plugin's own
 *   writer for a team it still owns, so this path only *reports* the dead
 *   member ids and leaves the directory alone.
 */

/** Directory the AgentTeams plugin stores its state under, per workspace. */
export const TEAM_STATE_DIR = '.agent-teams'

/** File inside one team directory describing the team. */
export const TEAM_STATE_FILE = 'team.json'

/** The subset of one stored team this cleanup reads. */
export interface TeamStateCandidate {
  /** The team directory's name, which the plugin also uses as the team id. */
  readonly teamId: string
  /** Absolute directory holding this team's state. */
  readonly dir: string
  /** Session id of the captain that owns the team, when `team.json` records one. */
  readonly captainSessionId?: string
  /** Session ids of the team's members, when `team.json` records them. */
  readonly memberSessionIds: readonly string[]
}

/** One team whose owning session is being deleted. */
export interface OrphanedTeamState {
  readonly teamId: string
  readonly dir: string
  /** Why this state is dead: the captain that owns it is gone. */
  readonly reason: 'captain'
}

/** One team that lost members but kept its captain. Reported, never removed. */
export interface PartialTeamState {
  readonly teamId: string
  readonly dir: string
  readonly deadMemberSessionIds: readonly string[]
}

/** The two kinds of residue one delete leaves in `.agent-teams`. */
export interface TeamStatePlan {
  readonly orphaned: readonly OrphanedTeamState[]
  readonly partial: readonly PartialTeamState[]
}

/**
 * Read the team state a `team.json` body describes.
 *
 * Only the fields this cleanup needs are read, and every one of them is
 * optional in practice: an AgentTeams version that renames or drops them must
 * not make the session delete fail, so an unreadable body yields `undefined`
 * and the caller skips that directory instead of guessing.
 * @param body - parsed `team.json`, or any other value found at that path.
 * @param dir - absolute directory the body was read from.
 * @param teamId - directory name, used when the body carries no id.
 * @returns the candidate, or `undefined` when the body is not a team record.
 */
export function readTeamStateCandidate(
  body: unknown,
  dir: string,
  teamId: string,
): TeamStateCandidate | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const captain = Reflect.get(body, 'captainSessionId')
  const members = Reflect.get(body, 'members')
  const memberSessionIds: string[] = []
  if (Array.isArray(members)) {
    for (const member of members) {
      if (typeof member !== 'object' || member === null) continue
      // A member's `id` is the id of the session it runs in: the plugin names
      // the member session directory after it.
      const id = Reflect.get(member, 'id')
      if (typeof id === 'string' && id.length > 0) memberSessionIds.push(id)
    }
  }
  return {
    teamId,
    dir,
    ...(typeof captain === 'string' && captain.length > 0
      ? { captainSessionId: captain }
      : {}),
    memberSessionIds,
  }
}

/**
 * Classify every stored team against one delete.
 *
 * A team with no recorded captain is left alone: without the owner key there
 * is no way to tell whether this delete stranded it, and removing a live team
 * is worse than leaving a directory behind.
 * @param candidates - every team directory found under the deleted workspaces.
 * @param deleted - string ids of the sessions this delete actually removed.
 * @returns the teams to remove, and the teams that only lost members.
 */
export function planTeamStateRemoval(
  candidates: readonly TeamStateCandidate[],
  deleted: ReadonlySet<string>,
): TeamStatePlan {
  const orphaned: OrphanedTeamState[] = []
  const partial: PartialTeamState[] = []
  for (const candidate of candidates) {
    if (candidate.captainSessionId !== undefined && deleted.has(candidate.captainSessionId)) {
      orphaned.push({ teamId: candidate.teamId, dir: candidate.dir, reason: 'captain' })
      continue
    }
    const deadMembers = candidate.memberSessionIds.filter(member => deleted.has(member))
    if (deadMembers.length > 0) {
      partial.push({
        teamId: candidate.teamId, dir: candidate.dir, deadMemberSessionIds: deadMembers,
      })
    }
  }
  return { orphaned, partial }
}

/**
 * List the team directories stored under one workspace.
 *
 * A missing or unreadable `.agent-teams` directory means "this workspace never
 * ran a team", which is the common case and not an error.
 * @param cwd - absolute workspace directory the deleted session ran in.
 * @returns one candidate per readable team directory; unreadable ones are skipped.
 */
export async function readTeamStateCandidates(cwd: string): Promise<TeamStateCandidate[]> {
  const root = join(cwd, TEAM_STATE_DIR)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const candidates: TeamStateCandidate[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = join(root, entry.name)
    let body: unknown
    try {
      body = JSON.parse(await readFile(join(dir, TEAM_STATE_FILE), 'utf8')) as unknown
    } catch {
      // No team.json, or an unreadable one: not a team this cleanup can judge.
      continue
    }
    const candidate = readTeamStateCandidate(body, dir, entry.name)
    if (candidate !== undefined) candidates.push(candidate)
  }
  return candidates
}

/**
 * Read every candidate reachable from the deleted sessions' workspaces.
 * @param cwds - workspace directories of the deleted sessions, in any order.
 * @returns the deduplicated candidates across all of them.
 */
export async function collectTeamStateCandidates(
  cwds: readonly string[],
): Promise<TeamStateCandidate[]> {
  const seen = new Set<string>()
  const candidates: TeamStateCandidate[] = []
  for (const cwd of cwds) {
    const key = cwd.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(...await readTeamStateCandidates(cwd))
  }
  return candidates
}

/**
 * Remove the orphaned team directories.
 * @param state - the plan produced by {@link planTeamStateRemoval}.
 * @returns the team ids whose directory was removed.
 * @throws the underlying filesystem failure; the caller reports and continues.
 */
export async function removeTeamStateDirs(
  state: readonly OrphanedTeamState[],
): Promise<readonly string[]> {
  const removed: string[] = []
  for (const entry of state) {
    await rm(entry.dir, { recursive: true, force: true })
    removed.push(entry.teamId)
  }
  return removed
}
