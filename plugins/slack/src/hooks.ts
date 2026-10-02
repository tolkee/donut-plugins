import type { PluginContext } from "@donut/sdk";
import { useDonut } from "@donut/sdk";
import { useCallback, useEffect, useRef, useState } from "react";

import { errorMessage, MISSING_TOKEN, TOKEN_KEY } from "./api";
import { loadDirectory } from "./directory";
import { onInvalidate } from "./events";
import type { Directory } from "./resolve";

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh(): void;
}

export function useTokenSet(): boolean {
  return useDonut((s) => s.settings.find((x) => x.key === TOKEN_KEY)?.is_set ?? false);
}

export function useQuery<T>(key: string, load: () => Promise<T>, matches: (channel: string) => boolean, active = true): Query<T> {
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

  useEffect(() => onInvalidate((channel) => (channel === "all" || matchesRef.current(channel)) && refresh()), [refresh]);

  return { ...state, refresh };
}

export function useDirectory(ctx: PluginContext): Directory | null {
  const tokenSet = useTokenSet();
  const [dir, setDir] = useState<Directory | null>(null);
  useEffect(() => {
    if (!tokenSet) return;
    let alive = true;
    loadDirectory(ctx)
      .then((d) => alive && setDir(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [ctx, tokenSet]);
  return dir;
}
