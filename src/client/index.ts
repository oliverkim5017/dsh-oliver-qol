import type { Context } from '@deepseek-ai/cordis'
import { registerExtendSettingsClient } from '../features/extend-settings/client/index.js'
import { registerPermissionDefaultClient } from '../features/permission-default/client/index.js'
import { registerSessionDeleteClient } from '../features/session-delete/client/index.js'
import { clientServicesOf } from './context.js'

/** Services the browser half needs; the loader waits for them before applying. */
export const inject = ['slots', 'locale']

const CLIENT_FEATURES = [
  registerSessionDeleteClient,
  registerExtendSettingsClient,
  registerPermissionDefaultClient,
] as const

/**
 * Mount every browser feature.
 * @param ctx - client context.
 */
export function apply(ctx: Context): void {
  const services = clientServicesOf(ctx)
  for (const register of CLIENT_FEATURES) register(services)
}
