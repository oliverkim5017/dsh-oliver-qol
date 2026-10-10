import type { ComponentType } from 'react'
import type { ClientSessionSummary } from '../features/session-delete/client/descendant-count.js'

/** Translate one dictionary key of a locale namespace. */
export type Translate = (key: string, parameters?: Record<string, unknown>) => string

/** One slot registration accepted by the client slot registry. */
export interface ClientSlotRegistration {
  readonly name: string
  readonly id?: string
  readonly order?: number
  /** List-entry display label; a thunk re-evaluates per read to follow the active locale. */
  readonly label?: string | (() => string)
  readonly locale?: string
  /** Child slots this entry declares and renders (list slots, root scope). */
  readonly children?: Record<string, { readonly kind: 'list', readonly scope: 'root' }>
  readonly inject?: () => object
}

/** The client slot registry surface this plugin uses. */
export interface ClientSlotRegistry {
  inject(name: string, callback: () => Iterable<() => void>): void
  register<Props>(registration: ClientSlotRegistration, component: ComponentType<Props>): () => void
}

/** The client locale registry surface this plugin uses. */
export interface ClientLocale {
  register(
    namespace: string,
    dictionaries: { readonly zh: Record<string, string>, readonly en: Record<string, string> },
  ): () => void
  /** Bind a translator to one namespace; the tab label thunk resolves through it. */
  bind(namespace: string): Translate
}

/** What a deferred feature reads once every listed service is active. */
export interface ClientScope {
  /** Read one service from the mounted scope. */
  get(name: string): unknown
}

/** The client session list facts this plugin reads. */
export interface ClientSessions {
  refresh(): Promise<void>
  readonly list: { getSnapshot(): { readonly byId: Record<string, ClientSessionSummary | undefined> } }
}

/** Everything a client feature needs from the browser host. */
export interface ClientServices {
  readonly slots: ClientSlotRegistry
  readonly locale: ClientLocale
  /**
   * Client session list at call time. Read through a getter: provider fibers
   * activate asynchronously, so a read during plugin activation can miss a
   * service that appears later.
   */
  readonly sessions: () => ClientSessions | undefined
  /**
   * Run one mount once every listed service is active. The mount and whatever
   * it registers live and die with the plugin's client fiber.
   */
  when(services: readonly string[], mount: (scope: ClientScope) => void): void
  /** Bind one registration to the plugin's client lifetime. */
  effect(callback: () => () => void, label: string): void
}

/**
 * Resolve the client services from the Cordis client context.
 * @param ctx - the client context (only `get`, `effect`, and `inject` are read).
 * @returns the guarded services.
 * @throws {Error} when a required slot, locale, or lifetime service is missing.
 */
export function clientServicesOf(ctx: { get(name: string): unknown }): ClientServices {
  const slots = ctx.get('slots')
  if (!isSlotRegistry(slots)) throw new Error('oliver-qol: the client slots service is unavailable')
  const locale = ctx.get('locale')
  if (!isLocale(locale)) throw new Error('oliver-qol: the client locale service is unavailable')
  const effect: unknown = Reflect.get(ctx, 'effect')
  if (typeof effect !== 'function') throw new Error('oliver-qol: the client context has no effect()')
  const inject: unknown = Reflect.get(ctx, 'inject')
  return {
    slots,
    locale,
    sessions: () => {
      const value = ctx.get('sessions')
      return isSessions(value) ? value : undefined
    },
    when: (services, mount) => {
      if (typeof inject !== 'function') throw new Error('oliver-qol: the client context has no inject()')
      Reflect.apply(inject, ctx, [services, (child: unknown) => { mount(scopeOf(child)) }])
    },
    effect: (callback, label) => { Reflect.apply(effect, ctx, [callback, label]) },
  }
}

function scopeOf(child: unknown): ClientScope {
  const get: unknown = typeof child === 'object' && child !== null ? Reflect.get(child, 'get') : undefined
  if (typeof get !== 'function') throw new Error('oliver-qol: the deferred mount has no service scope')
  return { get: name => Reflect.apply(get, child as object, [name]) }
}

function isSlotRegistry(value: unknown): value is ClientSlotRegistry {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'inject') === 'function'
    && typeof Reflect.get(value, 'register') === 'function'
}

function isLocale(value: unknown): value is ClientLocale {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'register') === 'function'
    && typeof Reflect.get(value, 'bind') === 'function'
}

function isSessions(value: unknown): value is ClientSessions {
  if (typeof value !== 'object' || value === null) return false
  if (typeof Reflect.get(value, 'refresh') !== 'function') return false
  const list: unknown = Reflect.get(value, 'list')
  return typeof list === 'object' && list !== null
    && typeof Reflect.get(list, 'getSnapshot') === 'function'
}
