/** Locale namespace of the default-permission row. */
export const PERMISSION_DEFAULT_NS = 'oliver-qol.permission-default'

/** Simplified Chinese copy. */
export const zh: Record<string, string> = {
  'title': '默认权限模式',
  'description': '选择新建会话默认使用的权限模式，对所有工作区生效。',
  'hint': '更改后仅对新建会话生效；已有会话保持原模式，可在会话中用 /permission 切换。',
  'fullAccessWarning': '完全权限会让新会话不再受沙箱限制，也不再弹出审批确认。',
  'loading': '加载中…',
  'unavailable': '宿主未提供权限设置。',
  'preset.readOnly': '仅可查看',
  'preset.workspaceWrite': '工作区内修改',
  'preset.fullAccess': '完全权限',
}

/** English copy. */
export const en: Record<string, string> = {
  'title': 'Default permission mode',
  'description': 'Choose the permission mode newly created sessions start with. It applies to every workspace.',
  'hint': 'Applies to sessions created after the change; existing sessions keep their mode — switch one with /permission.',
  'fullAccessWarning': 'Full access removes sandbox confinement and approval prompts for new sessions.',
  'loading': 'Loading…',
  'unavailable': 'The host does not expose permission settings.',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
}
