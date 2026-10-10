/** Locale namespace of the OpenCode web search row. */
export const OPENCODE_SEARCH_NS = 'oliver-qol.opencode-search'

/** Simplified Chinese copy. */
export const zh: Record<string, string> = {
  'title': 'OpenCode 网页搜索',
  'description': '让内置的 web_search 工具通过 OpenCode Go 的密钥和端点执行搜索，密钥与代理跟随 OpenCode Go 插件设置。',
  'enabledLabel': '启用 OpenCode Go 网页搜索',
  'modelLabel': '搜索模型',
  'modelHint': '执行搜索这一轮模型调用的模型，从 OpenCode Go 目录中选择；其他 ID 可直接改插件配置。',
  'proxyLabel': '使用 OpenCode Go 代理',
  'proxyHint': '跟随 OpenCode Go 插件里配置的代理地址（含 socks5）。',
  'hint': '一次搜索就是一次额外的模型调用，会消耗 OpenCode Go 的用量额度。',
  'disabledHint': '未启用时，搜索回退到内置的 DeepSeek 搜索提供者。',
  'loading': '加载中…',
  'saving': '保存中…',
  'unavailable': '宿主未提供设置服务，或插件入口不叫 oliver-qol。',
  'error': '设置写入失败。',
}

/** English copy. */
export const en: Record<string, string> = {
  'title': 'OpenCode web search',
  'description': 'Run the built-in web_search tool through the OpenCode Go key and endpoint; key and proxy follow the OpenCode Go plugin settings.',
  'enabledLabel': 'Enable OpenCode Go web search',
  'modelLabel': 'Search model',
  'modelHint': 'Model that runs the auxiliary search turn; pick one from the OpenCode Go catalog, or edit the plugin config for another id.',
  'proxyLabel': 'Use the OpenCode Go proxy',
  'proxyHint': 'Follow the proxy address configured for the OpenCode Go plugin (socks5 included).',
  'hint': 'One search is one extra model turn and spends OpenCode Go usage.',
  'disabledHint': 'While disabled, searches fall back to the built-in DeepSeek search provider.',
  'loading': 'Loading…',
  'saving': 'Saving…',
  'unavailable': 'The host does not expose settings for the oliver-qol entry.',
  'error': 'The settings write failed.',
}
