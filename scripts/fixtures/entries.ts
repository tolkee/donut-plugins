import type { Grant, MarketplaceEntry } from "@donut/protocol";

import { newEntry } from "../lib/index.ts";

export function grant(patch: Partial<Grant> = {}): Grant {
  return {
    hosts: [],
    secrets: {},
    write_tools: [],
    act_tools: [],
    notifiers: [],
    kinds: [],
    status_items: [],
    state: [],
    agent_send: false,
    skill: null,
    skill_sha256: null,
    links: [],
    ...patch,
  };
}

export function entry(id: string, version: string, patch: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return { ...newEntry({ id, name: id, description: `${id} plugin`, version, sha256: `${id}-${version}`.padEnd(64, "0"), size: 100, grant: grant() }), ...patch };
}
