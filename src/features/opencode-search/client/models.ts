/**
 * Model ids the search model field suggests. The list tracks the OpenCode Go
 * catalog; any other id can be typed, but only server-side search-capable
 * models answer the native `web_search` tool. `deepseek-v4.1-flash` is the
 * verified default; on OpenCode Go the Messages endpoint routes DeepSeek
 * models to DeepSeek's own API, which implements the tool natively.
 */
export const OPENCODE_SEARCH_MODEL_SUGGESTIONS: readonly string[] = Object.freeze([
  'deepseek-v4.1-flash',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-v4-flash-vision-exp',
  'claude-haiku-5-5',
  'qwen3.8-flash',
  'qwen3.7-plus',
  'minimax-m3',
  'minimax-m2.7',
  'glm-5.3',
  'glm-5.3-flash',
  'kimi-k3',
  'kimi-k2.7-code',
  'grok-4.7',
  'grok-4.6',
  'gpt-6-luna',
  'gpt-5.6-luna',
  'mimo-v2.6-flash',
  'mimo-v2.6-pro',
  'longcat-2.0',
  'longcat-2.5-preview-free',
  'space-bunny',
  'hy3',
  'hy4-preview',
  'muse-spark-1.3-contributor',
  'muse-spark-1.2-contributor',
  'qwen3.8-max',
  'step-5-preview-free',
])

/**
 * The dropdown options for one current value: the catalog suggestions in
 * order, with an unlisted current model (typed into the config by hand)
 * prepended so it stays selectable and marked as selected.
 * @param current - the model id currently configured.
 * @returns the ordered option ids.
 */
export function opencodeSearchModelOptions(current: string): readonly string[] {
  if (current.length === 0 || OPENCODE_SEARCH_MODEL_SUGGESTIONS.includes(current)) {
    return OPENCODE_SEARCH_MODEL_SUGGESTIONS
  }
  return [current, ...OPENCODE_SEARCH_MODEL_SUGGESTIONS]
}
