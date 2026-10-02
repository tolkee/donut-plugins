import type {
  Board,
  CanvasItem,
  Card,
  Command,
  FetchRequest,
  FetchResponse,
  FullState,
  JsonValue,
  OAuthClientAuth,
  OAuthProviderInfo,
  OAuthStatus,
  PluginManifest,
  SessionEntry,
  StateScope,
  ToolEffect,
  ToolInfo,
  SettingInfo,
  Size,
  UiTarget,
} from "@donut/protocol";
import { type ComponentType, createContext, createElement, type ReactNode, useCallback, useContext, useRef, useSyncExternalStore } from "react";
import { z } from "zod";

export { z };
export * from "./automation";
export type * from "@donut/protocol";

export interface ClientState extends FullState {
  connected: boolean;
  sessionEntries: Record<string, SessionEntry[]>;
  usageVersion: number;
}

export interface DonutRuntime {
  getState(): ClientState;
  subscribe(listener: () => void): () => void;
  command(command: Command): Promise<JsonValue>;
  widgetCommand(itemId: string, command: Command): Promise<JsonValue>;
  fetch(request: FetchRequest): Promise<FetchResponse>;
  callTool(name: string, input: unknown): Promise<unknown>;
  loadSessionEntries(sessionId: string): Promise<void>;
  subscribeTerminal(sessionId: string, listener: (offset: number, bytes: Uint8Array) => void): () => void;
}

export interface PluginContext {
  pluginId: string;
  runtime: DonutRuntime;
  command(command: Command): Promise<JsonValue>;
  fetch(request: FetchRequest): Promise<FetchResponse>;
  canvas: {
    open(kind: string, props?: Record<string, unknown>, title?: string): Promise<string | undefined>;
    update(id: string, props: Record<string, unknown>, title?: string): Promise<void>;
    close(id: string): Promise<void>;
    focus(id: string): Promise<void>;
  };
  data: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): Promise<void>;
  };
  agent: {
    send(text: string): Promise<void>;
  };
  openExternal(url: string): Promise<void>;
}

export interface ViewProps<P = Record<string, unknown>> {
  item: CanvasItem;
  props: P;
  setProps(patch: Partial<P> | Record<string, unknown>): void;
  setTitle(title: string): void;
  ctx: PluginContext;
  active: boolean;
}

export interface AutomationHelpers {
  pointAt(clientX: number, clientY: number): Promise<void>;
  runtime: DonutRuntime;
  item: CanvasItem;
}

export interface ScreenshotOptions {
  width?: number;
  fullHeight: boolean;
  maxHeight: number;
}

export interface ScreenshotResult {
  data: string;
  mime: string;
  note?: string;
}

export interface ItemAutomation {
  inspect?(root: HTMLElement, helpers: AutomationHelpers): Promise<string> | string;
  read?(root: HTMLElement, helpers: AutomationHelpers): Promise<string> | string;
  click?(root: HTMLElement, target: UiTarget, helpers: AutomationHelpers): Promise<string>;
  type?(root: HTMLElement, target: UiTarget, text: string, submit: boolean, helpers: AutomationHelpers): Promise<string>;
  scroll?(root: HTMLElement, dy: number): Promise<string>;
  screenshot?(root: HTMLElement, options?: ScreenshotOptions): Promise<string | ScreenshotResult>;
  navigate?(root: HTMLElement, url: string): Promise<string>;
}

export interface ReadArgs<P = Record<string, unknown>> {
  item: CanvasItem;
  props: P;
  ctx: PluginContext;
}

export interface KindDef<P = Record<string, unknown>> {
  description: string;
  component: ComponentType<ViewProps<P>>;
  props?: z.ZodType<P>;
  defaultSize?: Size;
  automation?: ItemAutomation;
  chromeless?: boolean;
  read?(args: ReadArgs<P>): Promise<string> | string;
  captureReady?(args: { root: HTMLElement; item: CanvasItem }): Promise<void> | void;
  captureRefusal?: string;
}

export interface ToolDef<I = unknown> {
  description: string;
  input: z.ZodType<I>;
  run(input: I, ctx: PluginContext): Promise<unknown> | unknown;
  mainOnly?: boolean;
  sessionScope?: { provider: string; inputField: string };
  confirm?: { title: string; detailField?: string; detailFields?: string[] };
  alwaysLoad?: boolean;
  effect?: ToolEffect;
}

export interface PhoneMessage {
  title: string;
  body: string;
  priority: "default" | "high";
}

export interface NotifierDef {
  description: string;
  send(message: PhoneMessage, ctx: PluginContext): Promise<unknown> | unknown;
}

export const NOTIFIER_PREFIX = "notify_";

export const phoneMessage = z.object({ title: z.string(), body: z.string(), priority: z.enum(["default", "high"]) }).strict();

export interface StatusItemProps {
  ctx: PluginContext;
}

export type StatusTone = "neutral" | "ok" | "warn" | "err" | "busy";

export interface StatusBadge {
  text: string;
  dot?: StatusTone;
}

interface StatusItemBase {
  label: string;
  description: string;
  popover?: ComponentType<StatusItemProps>;
  onClick?(ctx: PluginContext): void | Promise<void>;
  defaultEnabled?: boolean;
  order?: number;
}

export type StatusItemDef = StatusItemBase &
  ({ component: ComponentType<StatusItemProps>; compute?: never } | { compute(ctx: PluginContext): StatusBadge | null; component?: never });

export interface SkillDef {
  description: string;
  markdown: string;
  requires?: string[];
}

export interface OAuthFeatureDef {
  label: string;
  scopes: string[];
  hosts: string[];
  enabledSetting?: string;
}

export interface OAuthProviderDef {
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  userinfoUrl?: string;
  accountField?: string;
  clientIdSetting: string;
  clientSecretSetting?: string;
  clientAuth?: OAuthClientAuth;
  pkce?: boolean;
  baseScopes?: string[];
  scopeSeparator?: string;
  authParams?: Record<string, string>;
  features?: Record<string, OAuthFeatureDef>;
}

export interface PluginPermissions {
  hosts?: string[];
  state?: StateScope[];
  agentSend?: boolean;
  links?: string[];
}

export interface PluginDef {
  id: string;
  name: string;
  version?: string;
  permissions?: PluginPermissions;
  description?: string;
  settings?: SettingInfo[];
  kinds?: Record<string, KindDef<any>>;
  tools?: Record<string, ToolDef<any>>;
  statusItems?: Record<string, StatusItemDef>;
  notifiers?: Record<string, NotifierDef>;
  skill?: SkillDef;
  oauth?: Record<string, OAuthProviderDef>;
}

const SKILL_DESCRIPTION_CHARS = 300;

export const MAX_NOTIFIERS = 2;

export function definePlugin<const T extends PluginDef>(plugin: T): T {
  for (const name of Object.keys(plugin.kinds ?? {})) {
    if (name.includes(".")) throw new Error(`kind name "${name}" must not contain a dot`);
  }
  for (const name of Object.keys(plugin.statusItems ?? {})) {
    if (name.includes(".")) throw new Error(`status item name "${name}" must not contain a dot`);
  }
  for (const name of Object.keys(plugin.tools ?? {})) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`tool name "${name}" must be snake_case`);
    if (name.startsWith(NOTIFIER_PREFIX)) throw new Error(`tool name "${name}" must not start with ${NOTIFIER_PREFIX}: declare a notifier instead`);
  }
  const notifiers = Object.keys(plugin.notifiers ?? {});
  if (notifiers.length > MAX_NOTIFIERS) throw new Error(`a plugin declares at most ${MAX_NOTIFIERS} notifiers`);
  for (const name of notifiers) {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`notifier name "${name}" must be snake_case`);
  }
  if (plugin.skill) {
    const { description, markdown } = plugin.skill;
    if (!description.trim() || /\n/.test(description.trim()) || description.length > SKILL_DESCRIPTION_CHARS) {
      throw new Error(`skill description must be one line of at most ${SKILL_DESCRIPTION_CHARS} characters`);
    }
    if (!markdown.trim()) throw new Error("skill markdown must not be empty");
  }
  return plugin;
}

export function defineKind<P>(kind: KindDef<P>): KindDef<P> {
  return kind;
}

export function defineTool<I>(tool: ToolDef<I>): ToolDef<I> {
  return tool;
}

export function defineStatusItem(item: StatusItemDef): StatusItemDef {
  return item;
}

export function defineNotifier(notifier: NotifierDef): NotifierDef {
  return notifier;
}

export function kindId(plugin: PluginDef, kind: string): string {
  return `${plugin.id}.${kind}`;
}

export function statusItemId(plugin: PluginDef, name: string): string {
  return `${plugin.id}.${name}`;
}

function jsonSchema(schema: z.ZodType): JsonValue {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, JsonValue>;
  return rest;
}

function oauthProvider(id: string, def: OAuthProviderDef): OAuthProviderInfo {
  return {
    id,
    label: def.label,
    authorize_url: def.authorizeUrl,
    token_url: def.tokenUrl,
    ...(def.revokeUrl ? { revoke_url: def.revokeUrl } : {}),
    ...(def.userinfoUrl ? { userinfo_url: def.userinfoUrl } : {}),
    ...(def.accountField ? { account_field: def.accountField } : {}),
    client_id_setting: def.clientIdSetting,
    ...(def.clientSecretSetting ? { client_secret_setting: def.clientSecretSetting } : {}),
    client_auth: def.clientAuth ?? "post",
    pkce: def.pkce ?? true,
    redirect: "loopback",
    base_scopes: def.baseScopes ?? [],
    ...(def.scopeSeparator ? { scope_separator: def.scopeSeparator } : {}),
    auth_params: def.authParams ?? {},
    features: Object.entries(def.features ?? {}).map(([featureId, f]) => ({
      id: featureId,
      label: f.label,
      scopes: f.scopes,
      hosts: f.hosts,
      ...(f.enabledSetting ? { enabled_setting: f.enabledSetting } : {}),
    })),
  };
}

function tools(plugin: PluginDef): ToolInfo[] {
  return Object.entries(plugin.tools ?? {}).map(([name, tool]) => ({
    name,
    description: tool.description,
    input_schema: jsonSchema(tool.input),
    main_only: tool.mainOnly ?? false,
    always_load: tool.alwaysLoad ?? false,
    effect: tool.effect ?? "read",
    notifier: false,
    ...(tool.sessionScope ? { session_scope: { provider: tool.sessionScope.provider, input_field: tool.sessionScope.inputField } } : {}),
    ...(tool.confirm
      ? {
          confirm: {
            title: tool.confirm.title,
            ...(tool.confirm.detailField ? { detail_field: tool.confirm.detailField } : {}),
            detail_fields: tool.confirm.detailFields ?? [],
          },
        }
      : {}),
  }));
}

function notifierTools(plugin: PluginDef): ToolInfo[] {
  return Object.entries(plugin.notifiers ?? {}).map(([name, notifier]) => ({
    name: `${NOTIFIER_PREFIX}${name}`,
    description: notifier.description,
    input_schema: jsonSchema(phoneMessage),
    main_only: true,
    always_load: false,
    effect: "write",
    notifier: true,
  }));
}

export function toManifest(plugin: PluginDef): PluginManifest {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version ?? "",
    permissions: {
      hosts: plugin.permissions?.hosts ?? [],
      state: plugin.permissions?.state ?? [],
      agent_send: plugin.permissions?.agentSend ?? false,
      links: plugin.permissions?.links ?? [],
    },
    description: plugin.description ?? "",
    settings: plugin.settings ?? [],
    kinds: Object.entries(plugin.kinds ?? {}).map(([name, kind]) => ({
      kind: kindId(plugin, name),
      description: kind.description,
      ...(kind.props ? { props_schema: jsonSchema(kind.props) } : {}),
      ...(kind.defaultSize ? { default_size: kind.defaultSize } : {}),
    })),
    tools: [...tools(plugin), ...notifierTools(plugin)],
    status_items: Object.entries(plugin.statusItems ?? {}).map(([name, item]) => ({
      id: statusItemId(plugin, name),
      label: item.label,
      description: item.description,
      default_enabled: item.defaultEnabled ?? false,
      order: item.order ?? 0,
    })),
    ...(plugin.skill ? { skill: { description: plugin.skill.description.trim(), markdown: plugin.skill.markdown, requires: plugin.skill.requires ?? [] } } : {}),
    oauth: Object.entries(plugin.oauth ?? {}).map(([id, def]) => oauthProvider(id, def)),
  };
}

export async function runTool(plugin: PluginDef, name: string, input: unknown, ctx: PluginContext): Promise<unknown> {
  const notifier = name.startsWith(NOTIFIER_PREFIX) ? plugin.notifiers?.[name.slice(NOTIFIER_PREFIX.length)] : undefined;
  if (notifier) {
    const parsed = phoneMessage.safeParse(input ?? {});
    if (!parsed.success) throw new Error(`invalid phone message: ${z.prettifyError(parsed.error)}`);
    return notifier.send(parsed.data, ctx);
  }
  const tool = plugin.tools?.[name];
  if (!tool) throw new Error(`plugin ${plugin.id} has no tool ${name}`);
  const parsed = tool.input.safeParse(input ?? {});
  if (!parsed.success) throw new Error(`invalid input: ${z.prettifyError(parsed.error)}`);
  return tool.run(parsed.data, ctx);
}

const RuntimeContext = createContext<DonutRuntime | null>(null);

export function DonutProvider({ runtime, children }: { runtime: DonutRuntime; children: ReactNode }) {
  return createElement(RuntimeContext.Provider, { value: runtime }, children);
}

export function useRuntime(): DonutRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("useRuntime must be used inside <DonutProvider>");
  return runtime;
}

export function useDonut<T>(selector: (state: ClientState) => T, equal: (a: T, b: T) => boolean = Object.is): T {
  const runtime = useRuntime();
  const last = useRef<{ value: T } | null>(null);
  const getSnapshot = useCallback(() => {
    const next = selector(runtime.getState());
    if (last.current && equal(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  }, [runtime, selector, equal]);
  return useSyncExternalStore(runtime.subscribe, getSnapshot, getSnapshot);
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export interface LinkedCard {
  card: Card;
  board: Board;
  column: string;
}

export function linkedCards(boards: Board[], provider: string, ...ids: string[]): LinkedCard[] {
  const wanted = ids.map((id) => id.toLowerCase());
  return boards.flatMap((board) =>
    board.cards
      .filter((card) => card.links.some((l) => l.provider === provider && wanted.includes(l.id.toLowerCase())))
      .map((card) => ({ card, board, column: board.columns.find((c) => c.id === card.column_id)?.name ?? card.column_id })),
  );
}

export function createPluginContext(runtime: DonutRuntime, pluginId: string): PluginContext {
  const scoped = (key: string) => `${pluginId}/${key}`;
  return {
    pluginId,
    runtime,
    command: (command) => runtime.command(command),
    fetch: (request) => runtime.fetch({ ...request, plugin: pluginId }),
    canvas: {
      async open(kind, props, title) {
        const result = (await runtime.command({
          domain: "canvas",
          command: { op: "open", kind, props: (props ?? {}) as JsonValue, ...(title ? { title } : {}) },
        })) as { id?: string } | null;
        return result?.id;
      },
      async update(id, props, title) {
        await runtime.command({
          domain: "canvas",
          command: { op: "update", id, props: props as JsonValue, replace_props: false, ...(title ? { title } : {}) },
        });
      },
      async close(id) {
        await runtime.command({ domain: "canvas", command: { op: "close", id } });
      },
      async focus(id) {
        await runtime.command({ domain: "canvas", command: { op: "focus", id } });
      },
    },
    data: {
      get: <T,>(key: string) => runtime.getState().plugin_data[scoped(key)] as T | undefined,
      async set(key, value) {
        await runtime.command({ domain: "plugin", command: { op: "set_data", key: scoped(key), value: value as JsonValue } });
      },
    },
    agent: {
      async send(text) {
        await runtime.command({ domain: "agent", command: { op: "send", text } });
      },
    },
    async openExternal(url) {
      await runtime.command({ domain: "app", command: { op: "open_external", url } });
    },
  };
}

export function useOAuth(provider: string): OAuthStatus | undefined {
  return useDonut(useCallback((s: ClientState) => s.oauth.find((p) => p.provider === provider), [provider]));
}

export function oauthCommand(op: "sign_in" | "sign_out" | "cancel_sign_in", provider: string): Command {
  return { domain: "oauth", command: { op, provider } };
}

export function usePluginData<T>(ctx: PluginContext, key: string, initial: T): [T, (value: T) => void] {
  const full = `${ctx.pluginId}/${key}`;
  const value = useDonut((s) => s.plugin_data[full] as T | undefined);
  const set = useCallback((next: T) => void ctx.data.set(key, next), [ctx, key]);
  return [value ?? initial, set];
}
