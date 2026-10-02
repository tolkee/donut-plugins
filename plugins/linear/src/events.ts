type Listener = (issueId: string | "all") => void;

const listeners = new Set<Listener>();

export function invalidate(issueId: string | "all"): void {
  for (const listener of listeners) listener(issueId);
}

export function onInvalidate(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
