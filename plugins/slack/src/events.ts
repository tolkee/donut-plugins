type Listener = (channel: string | "all") => void;

const listeners = new Set<Listener>();

export function invalidate(channel: string | "all"): void {
  for (const listener of listeners) listener(channel);
}

export function onInvalidate(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
