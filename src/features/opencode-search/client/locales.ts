/** Locale namespace of the OpenCode web search row. */
export const OPENCODE_SEARCH_NS = 'oliver-qol.opencode-search'

/** Simplified Chinese copy. */
export const zh: Record<string, string> = {
  'title': 'OpenCode 网页搜索',
  'description': '让内置的 web_search 工具通过 OpenCode Go 的密钥和端点执行搜索；密钥与端点跟随 OpenCode Go 插件设置。',
  'enabledLabel': '启用 OpenCode Go 网页搜索',
  'modelLabel': '搜索模型',
  'modelHint': '执行搜索这一轮模型调用的模型，从 OpenCode Go 目录中选择；其他 ID 可直接改插件配置。',
  'proxyLabel': '搜索代理',
  'proxyUrlLabel': '搜索代理地址',
  'proxyUrlPlaceholder': '127.0.0.1',
  'proxyPortLabel': '搜索代理端口',
  'proxyPortPlaceholder': '端口',
  'proxyHint': '只作用于这里开启的网页搜索请求，不影响聊天等其它请求；地址留空即直连，端口留空则使用地址里自带的端口。',
  'hint': '一次搜索就是一次额外的模型调用，会消耗 OpenCode Go 的用量额度。',
  'disabledHint': '未启用时，搜索回退到内置的 DeepSeek 搜索提供者。',
  'loading': '加载中…',
  'saving': '保存中…',
  'unavailable': '宿主未提供设置服务，或插件入口不叫 oliver-qol。',
  'errorPrefix': '设置写入失败：',
}

/** English copy. */
export const en: Record<string, string> = {
  'title': 'OpenCode web search',
  'description': 'Run the built-in web_search tool through the OpenCode Go key and endpoint; key and endpoint follow the OpenCode Go plugin settings.',
  'enabledLabel': 'Enable OpenCode Go web search',
  'modelLabel': 'Search model',
  'modelHint': 'Model that runs the auxiliary search turn; pick one from the OpenCode Go catalog, or edit the plugin config for another id.',
  'proxyLabel': 'Search proxy',
  'proxyUrlLabel': 'Search proxy address',
  'proxyUrlPlaceholder': '127.0.0.1',
  'proxyPortLabel': 'Search proxy port',
  'proxyPortPlaceholder': 'Port',
  'proxyHint': 'Applies to this web search request only, never to chat or any other request; leave the address empty to connect directly, or the port empty to use the one inside the address.',
  'hint': 'One search is one extra model turn and spends OpenCode Go usage.',
  'disabledHint': 'While disabled, searches fall back to the built-in DeepSeek search provider.',
  'loading': 'Loading…',
  'saving': 'Saving…',
  'unavailable': 'The host does not expose settings for the oliver-qol entry.',
  'errorPrefix': 'The settings write failed: ',
}
