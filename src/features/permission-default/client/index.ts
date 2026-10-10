import type { ClientServices } from '../../../client/context.js'
import { EXTEND_SETTINGS_ITEM_SLOT } from '../../../shared/extend-settings.js'
import { permissionAdaptersOf } from './adapters.js'
import { PermissionModeController } from './controller.js'
import { PermissionModeRow, type PermissionModeRowInjected } from './PermissionModeRow.js'
import { en, PERMISSION_DEFAULT_NS, zh } from './locales.js'

/** Settings services the row binds; the deferred mount waits for all three. */
const REQUIRED_SERVICES = ['configForms', 'remote.settings', 'remote.permissionPresets'] as const
/** Item id inside the extend-settings tab. */
const ROW_ID = 'default-permission'
/** First row of the tab. */
const ROW_ORDER = 0

/**
 * Register the default-permission row: once the settings services are active,
 * the row follows the shared settings mirror and writes
 * `permission.defaultPreset` — the mode every session created later pins.
 * @param services - guarded client services.
 */
export function registerPermissionDefaultClient(services: ClientServices): void {
  const { slots, locale, effect, when } = services
  effect(() => locale.register(PERMISSION_DEFAULT_NS, { zh, en }), 'oliver-qol: permission-default locale')
  when(REQUIRED_SERVICES, scope => {
    const adapters = permissionAdaptersOf(scope)
    if (adapters === undefined) return
    const controller = new PermissionModeController(adapters)
    effect(() => () => controller.dispose(), 'oliver-qol: permission-default controller')
    slots.inject(EXTEND_SETTINGS_ITEM_SLOT, function* () {
      yield slots.register({
        name: EXTEND_SETTINGS_ITEM_SLOT,
        id: ROW_ID,
        order: ROW_ORDER,
        locale: PERMISSION_DEFAULT_NS,
        inject: (): PermissionModeRowInjected => ({
          hooks: { mode: controller.store },
          load: () => { void controller.load() },
          select: (value: string) => { void controller.select(value) },
        }),
      }, PermissionModeRow)
    })
  })
}
