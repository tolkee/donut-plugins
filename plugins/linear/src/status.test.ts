import type { FetchRequest, PluginContext, SettingView } from "@donut/sdk";
import { afterEach, describe, expect, it } from "vitest";

import { mineIssues } from "./hooks";
import { computeMine } from "./status";

function fakeContext(settings: Partial<SettingView>[], respond: (request: FetchRequest) => string) {
  const requests: FetchRequest[] = [];
  const ctx = {
    runtime: { getState: () => ({ settings }) },
    fetch: async (request: FetchRequest) => {
      requests.push(request);
      return { status: 200, headers: {}, body: respond(request) };
    },
  } as unknown as PluginContext;
  return { ctx, requests };
}

const issues = (n: number) => JSON.stringify({ data: { viewer: { assignedIssues: { nodes: Array.from({ length: n }, (_, i) => ({ id: `i${i}` })) } } } });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("linear.mine status item", () => {
  afterEach(() => {
    mineIssues.halt();
    mineIssues.snapshot = { issues: null, error: null, scope: "open" };
  });

  it("hides without an API key and doesn't fetch", () => {
    const { ctx, requests } = fakeContext([{ key: "linear.token", is_set: false }], () => issues(1));
    expect(computeMine(ctx)).toBeNull();
    expect(requests).toEqual([]);
  });

  it("starts polling on the first compute and shows the count", async () => {
    const { ctx, requests } = fakeContext([{ key: "linear.token", is_set: true }], () => issues(3));
    expect(computeMine(ctx)).toEqual({ text: "Linear …", dot: undefined });
    await flush();
    expect(computeMine(ctx)).toEqual({ text: "Linear 3", dot: undefined });
    expect(requests).toHaveLength(1);
  });

  it("refetches when the scope changes", async () => {
    const { ctx, requests } = fakeContext([{ key: "linear.token", is_set: true }, { key: "linear.mine_scope", value: "cycle" }], () => issues(2));
    computeMine(ctx);
    await flush();
    expect(computeMine(ctx)?.text).toBe("Linear 2");
    expect(JSON.parse(requests.at(-1)!.body!).variables.filter.cycle).toEqual({ isActive: { eq: true } });
  });

  it("flags an error with a red dot", async () => {
    const { ctx } = fakeContext([{ key: "linear.token", is_set: true }], () => JSON.stringify({ errors: [{ message: "rate limited" }] }));
    computeMine(ctx);
    await flush();
    expect(computeMine(ctx)).toEqual({ text: "Linear …", dot: "err" });
  });
});
