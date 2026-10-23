import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-workspace'
import type { HostFeature } from '../types.js'
import { resolveSessionDeleteConfig } from './config.js'
import { findSessionDirs } from './jsonl-layout.js'
import { registerSessionDeleteRoute } from './route.js'
import { removeSessionDirs } from './removal.js'
import { SessionDeleteService, type SessionDeleteDeps } from './service.js'
import {
  collectTeamStateCandidates, planTeamStateRemoval, removeTeamStateDirs,
} from './team-state.js'
import { pruneTaskBoardReferences as pruneTaskBoard } from './task-board.js'

/** Session deletion: permanent removal of stored sessions and their derived state. */
export const sessionDeleteFeature: HostFeature = {
  name: 'sessionDelete',
  register(ctx: Context, root): void {
    const config = resolveSessionDeleteConfig(root.sessionDelete)
    ctx.inject(['sessionPersistence'], (featureCtx) => {
      const logger = {
        warn: (message: string) => { featureCtx.logger.warn(message) },
        info: (message: string) => { featureCtx.logger.info(message) },
      }
      const deps: SessionDeleteDeps = {
        sessionPersistence: featureCtx.sessionPersistence,
        // Optional services are read per call: their fibers activate
        // asynchronously, so a read at feature activation can miss them.
        workspaceRegistry: () => featureCtx.get('workspaceRegistry'),
        storageDomain: () => featureCtx.get('storageDomain'),
        activityOf: async (sessionId) => {
          const activity = await featureCtx.waterfall(
            'workspace/session-activity',
            { sessionId },
            () => Promise.resolve([]),
          )
          return activity.length
        },
        referencedState: {
          removeOrphanedTeamState: async (deleted, cwds) => {
            if (!config.removeOrphanedTeamState) return []
            const candidates = await collectTeamStateCandidates(cwds)
            const plan = planTeamStateRemoval(candidates, new Set(deleted.map(String)))
            // A team that only lost a member still belongs to the running plugin:
            // report it and leave the directory for the plugin to reconcile.
            for (const partial of plan.partial) {
              logger.warn(
                `team ${partial.teamId}: member session(s) deleted but the captain lives; `
                + `left ${partial.dir} in place for the team plugin to reconcile`,
              )
            }
            return removeTeamStateDirs(plan.orphaned)
          },
          pruneTaskBoardReferences: async (deleted) => {
            if (!config.pruneTaskBoardReferences) return { dropped: 0, touched: 0 }
            const result = await pruneTaskBoard(
              { ledgerPath: config.taskBoardLedgerPath, warn: logger.warn },
              deleted,
            )
            return { dropped: result.dropped, touched: result.touched }
          },
        },
        logger,
        sleep: milliseconds => new Promise(resolve => { setTimeout(resolve, milliseconds) }),
        now: () => Date.now(),
        findSessionDirs,
        removeSessionDirs,
      }
      const service = new SessionDeleteService(deps, config)
      featureCtx.provide('sessionDelete', service)
      // The Web route waits for the connection service instead of sampling it:
      // a headless composition never provides one and simply stays without a route.
      featureCtx.inject(['connection'], (routeCtx) => {
        registerSessionDeleteRoute(routeCtx, service)
      })
    })
  },
}
