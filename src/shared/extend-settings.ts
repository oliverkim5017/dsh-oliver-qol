/**
 * Slot contract shared by the extend-settings hub (which declares and renders
 * it) and every setting-row feature (which registers into it). The literal is
 * pinned by both features' tests; this constant only keeps the two sides in
 * sync.
 */
export const EXTEND_SETTINGS_ITEM_SLOT = 'settings.extend-settings.item'
