import type { ReactNode } from 'react'
import type { Translate } from '../../../client/context.js'
import { EXTEND_SETTINGS_ITEM_SLOT } from '../../../shared/extend-settings.js'

/** Content column layout of one settings section. */
const SECTION_STYLE = { display: 'flex', flexDirection: 'column', width: '100%' } as const

/** Owner share and locale seat of the section body. */
export interface ExtendSettingsSectionProps {
  /** Render one declared child slot; unused keys fall back to the given node. */
  readonly renderSlot: (
    key: string,
    owner: object,
    options?: { readonly fallback?: ReactNode },
  ) => ReactNode
  readonly t: Translate
}

/**
 * `settings.section` entry: the Extend settings tab body. It renders whatever
 * setting rows features registered into the item slot — the hub knows no row.
 * @param props - child renderer and locale seat.
 * @returns the section content column.
 */
export function ExtendSettingsSection({ renderSlot, t }: ExtendSettingsSectionProps) {
  return (
    <div style={SECTION_STYLE}>
      {renderSlot(EXTEND_SETTINGS_ITEM_SLOT, {}, { fallback: <p>{t('empty')}</p> })}
    </div>
  )
}
