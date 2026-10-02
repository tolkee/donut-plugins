import type { PluginContext } from "@donut/sdk";
import { runTool, toManifest } from "@donut/sdk";
import { describe, expect, it } from "vitest";

import plugin from "./index";

function fakeContext(data: Record<string, unknown> = {}): PluginContext & { opened: string[] } {
  const opened: string[] = [];
  return {
    pluginId: "hello",
    opened,
    runtime: { getState: () => ({ settings: [] }) } as unknown as PluginContext["runtime"],
    command: async () => null,
    fetch: async () => ({ status: 200, headers: {}, body: "ok" }),
    canvas: {
      open: async (kind) => {
        opened.push(kind);
        return "hello-1";
      },
      update: async () => undefined,
      close: async () => undefined,
      focus: async () => undefined,
    },
    data: {
      get: <T,>(key: string) => data[key] as T | undefined,
      set: async (key, value) => {
        data[key] = value;
      },
    },
    agent: { send: async () => undefined },
    openExternal: async () => undefined,
  };
}

describe("hello plugin", () => {
  it("declares what it reaches and confirms its write", () => {
    const manifest = toManifest(plugin);
    expect(manifest.permissions.hosts).toEqual(["api.github.com"]);
    const remember = manifest.tools.find((t) => t.name === "remember");
    expect(remember?.effect).toBe("write");
    expect(remember?.confirm?.title).toBe("Save a greeting for {name}");
    expect(manifest.status_items.map((s) => s.id)).toEqual(["hello.count"]);
  });

  it("greets and counts", async () => {
    const ctx = fakeContext();
    expect(await runTool(plugin, "greet", { name: "Ada", open: true }, ctx)).toBe("Hi Ada!");
    expect(ctx.opened).toEqual(["hello.card"]);
    expect(ctx.data.get("count")).toBe(1);
  });
});
