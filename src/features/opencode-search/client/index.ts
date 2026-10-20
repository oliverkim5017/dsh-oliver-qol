import type { ClientServices } from '../../../client/context.js'
import { EXTEND_SETTINGS_ITEM_SLOT } from '../../../shared/extend-settings.js'
import { opencodeSearchAdaptersOf } from './adapters.js'
import { OpencodeSearchController } from './controller.js'
import { en, OPENCODE_SEARCH_NS, zh } from './locales.js'
import { OpencodeSearchRow, type OpencodeSearchRowInjected } from './OpenCodeSearchRow.js'

/** Settings services the row binds; the deferred mount waits for both. */
const REQUIRED_SERVICES = ['configForms', 'remote.settings'] as const
/** Item id inside the extend-settings tab. */
const ROW_ID = 'opencode-search'
/** The tab's only setting row. */
const ROW_ORDER = 0

/**
 * Register the OpenCode web search row: once the settings services are
 * active, the row follows the shared settings mirror and writes this plugin's
 * `opencodeSearch` section.
 * @param services - guarded client services.
 */
export function registerOpencodeSearchClient(services: ClientServices): void {
  const { slots, locale, effect, when } = services
  effect(() => locale.register(OPENCODE_SEARCH_NS, { zh, en }), 'oliver-qol: opencode-search locale')
  when(REQUIRED_SERVICES, scope => {
    const adapters = opencodeSearchAdaptersOf(scope)
    if (adapters === undefined) return
    const controller = new OpencodeSearchController(adapters)
    effect(() => () => controller.dispose(), 'oliver-qol: opencode-search controller')
    slots.inject(EXTEND_SETTINGS_ITEM_SLOT, function* () {
      yield slots.register({
        name: EXTEND_SETTINGS_ITEM_SLOT,
        id: ROW_ID,
        order: ROW_ORDER,
        locale: OPENCODE_SEARCH_NS,
        inject: (): OpencodeSearchRowInjected => ({
          hooks: { row: controller.store },
          load: () => { void controller.load() },
          setEnabled: (value: boolean) => { void controller.setEnabled(value) },
          setModel: (value: string) => { void controller.setModel(value) },
          setProxyUrl: (value: string) => { void controller.setProxyUrl(value) },
          setProxyPort: (value: string) => { void controller.setProxyPort(value) },
        }),
      }, OpencodeSearchRow)
    })
  })
}
