import type { PluginContext } from "@donut/sdk";
import { useDonut } from "@donut/sdk";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { errorMessage, type Fetcher, MISSING_TOKEN, TOKEN_KEY } from "./api";
import { onInvalidate } from "./events";
import { type MineScope, mineScopeOf, myIssues } from "./linear";
import type { IssueRow } from "./queries";

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh(): void;
}

export function useTokenSet(): boolean {
  return useDonut((s) => s.settings.find((x) => x.key === TOKEN_KEY)?.is_set ?? false);
}

export function useMineScope(): MineScope {
  return useDonut((s) => mineScopeOf(s.settings));
}

export function useQuery<T>(key: string, load: () => Promise<T>, matches: (issueId: string) => boolean, active = true): Query<T> {
  const tokenSet = useTokenSet();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  const matchesRef = useRef(matches);
  loadRef.current = load;
  matchesRef.current = matches;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!tokenSet) {
      setState({ data: null, error: MISSING_TOKEN, loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    loadRef.current().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (e: unknown) => alive && setState((s) => ({ data: s.data, error: errorMessage(e), loading: false })),
    );
    return () => {
      alive = false;
    };
  }, [key, nonce, tokenSet]);

  const wasActive = useRef(active);
  useEffect(() => {
    if (active && !wasActive.current) refresh();
    wasActive.current = active;
  }, [active, refresh]);

  useEffect(() => onInvalidate((id) => (id === "all" || matchesRef.current(id)) && refresh()), [refresh]);

  return { ...state, refresh };
}

const POLL_MS = 5 * 60_000;

export interface MineSnapshot {
  issues: IssueRow[] | null;
  error: string | null;
  scope: MineScope;
}

class MineStore {
  snapshot: MineSnapshot = { issues: null, error: null, scope: "open" };
  private listeners = new Set<() => void>();
  private ctx: Fetcher | null = null;
  private stop: (() => void) | null = null;
  private generation = 0;

  ensure(ctx: Fetcher, scope: MineScope): void {
    this.ctx = ctx;
    if (this.stop && scope === this.snapshot.scope) return;
    if (scope !== this.snapshot.scope) this.set({ issues: null, error: null, scope });
    if (!this.stop) {
      const timer = setInterval(this.load, POLL_MS);
      const unlisten = onInvalidate(this.load);
      this.stop = () => {
        clearInterval(timer);
        unlisten();
      };
    }
    this.load();
  }

  halt(): void {
    this.stop?.();
    this.stop = null;
    this.generation++;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  load = (): void => {
    const { ctx } = this;
    if (!ctx) return;
    const { scope } = this.snapshot;
    const generation = ++this.generation;
    myIssues(ctx, scope).then(
      (issues) => generation === this.generation && this.set({ issues, error: null, scope }),
      (e: unknown) => generation === this.generation && this.set({ ...this.snapshot, error: errorMessage(e) }),
    );
  };

  private set(snapshot: MineSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

export const mineIssues = new MineStore();

export function useMine(ctx: PluginContext): MineSnapshot {
  const scope = useMineScope();
  const tokenSet = useTokenSet();
  useEffect(() => {
    if (tokenSet) mineIssues.ensure(ctx, scope);
  }, [ctx, scope, tokenSet]);
  return useSyncExternalStore(mineIssues.subscribe, () => mineIssues.snapshot);
}
