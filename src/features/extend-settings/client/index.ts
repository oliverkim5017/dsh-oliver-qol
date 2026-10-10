import type { ClientServices } from '../../../client/context.js'
import { EXTEND_SETTINGS_ITEM_SLOT } from '../../../shared/extend-settings.js'
import { ExtendSettingsSection } from './ExtendSettingsSection.js'
import { en, EXTEND_SETTINGS_NS, zh } from './locales.js'

/** Section id of the extend-settings tab in the settings navigation. */
const SECTION_ID = 'oliver-qol-extend-settings'
/** Navigation position; last after the shipped sections (general 0, models 10, plugins 15). */
const SECTION_ORDER = 100

/**
 * Register the extend-settings hub: the settings tab and the item slot every
 * setting-row feature contributes into. The hub carries no preference itself.
 * @param services - guarded client services.
 */
export function registerExtendSettingsClient(services: ClientServices): void {
  const { slots, locale, effect } = services
  const t = locale.bind(EXTEND_SETTINGS_NS)
  effect(() => locale.register(EXTEND_SETTINGS_NS, { zh, en }), 'oliver-qol: extend-settings locale')
  slots.inject('settings.section', function* () {
    yield slots.register({
      name: 'settings.section',
      id: SECTION_ID,
      order: SECTION_ORDER,
      label: () => t('nav'),
      locale: EXTEND_SETTINGS_NS,
      children: { [EXTEND_SETTINGS_ITEM_SLOT]: { kind: 'list', scope: 'root' } },
    }, ExtendSettingsSection)
  })
}
