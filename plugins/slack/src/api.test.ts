import type { FetchRequest, FetchResponse } from "@donut/sdk";
import { describe, expect, it } from "vitest";

import { API, call, MISSING_TOKEN, paginate } from "./api";

function fake(respond: (request: FetchRequest) => FetchResponse | Promise<FetchResponse>) {
  const requests: FetchRequest[] = [];
  return {
    requests,
    fetch: async (request: FetchRequest) => {
      requests.push(request);
      return respond(request);
    },
  };
}

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}): FetchResponse => ({ status, headers, body: JSON.stringify(body) });

describe("call", () => {
  it("reads with GET, the secret only in the header", async () => {
    const ctx = fake(() => reply({ ok: true, channel: { id: "C1" } }));
    await expect(call(ctx, "conversations.info", { channel: "C1", oldest: undefined, limit: 5 })).resolves.toMatchObject({ channel: { id: "C1" } });
    const [request] = ctx.requests;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(`${API}conversations.info?channel=C1&limit=5`);
    expect(request?.url).not.toContain("secret");
    expect(request?.headers.Authorization).toBe("Bearer {{secret:slack.token}}");
    expect(request?.body).toBeUndefined();
  });

  it("writes with a JSON POST", async () => {
    const ctx = fake(() => reply({ ok: true, ts: "1.2" }));
    await call(ctx, "chat.postMessage", { channel: "C1", text: 'a "quote" & <b>', thread_ts: undefined }, { write: true });
    const [request] = ctx.requests;
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe(`${API}chat.postMessage`);
    expect(request?.headers["Content-Type"]).toBe("application/json; charset=utf-8");
    expect(JSON.parse(request?.body ?? "{}")).toEqual({ channel: "C1", text: 'a "quote" & <b>' });
  });

  it("maps Slack errors to readable messages", async () => {
    const run = (response: FetchResponse) => call(fake(() => response), "auth.test");
    await expect(run(reply({ ok: false, error: "invalid_auth" }))).rejects.toThrow("Slack rejected the token");
    await expect(run(reply({ ok: false, error: "token_revoked" }))).rejects.toThrow("Slack rejected the token");
    await expect(run(reply({ ok: false, error: "missing_scope", needed: "search:read" }))).rejects.toThrow("lacks the search:read scope");
    await expect(run(reply({ ok: false, error: "channel_not_found" }))).rejects.toThrow(/not found/);
    await expect(run(reply({ ok: false, error: "not_in_channel" }))).rejects.toThrow(/not a member/);
    await expect(run(reply({ ok: false, error: "weird" }))).rejects.toThrow("Slack error: weird");
    await expect(run({ status: 502, headers: {}, body: "<html>" })).rejects.toThrow("Slack returned HTTP 502");
  });

  it("reports rate limits with Retry-After instead of retrying", async () => {
    const ctx = fake(() => reply({ ok: false, error: "ratelimited" }, 429, { "retry-after": "12" }));
    await expect(call(ctx, "search.messages")).rejects.toThrow("Slack rate limit reached, try again in 12 s");
    expect(ctx.requests).toHaveLength(1);
    await expect(call(fake(() => reply({ ok: false, error: "ratelimited" })), "x")).rejects.toThrow("try again in 30 s");
  });

  it("explains a missing token", async () => {
    const ctx = fake(() => {
      throw new Error("secret `slack.token` is not set (open Settings)");
    });
    await expect(call(ctx, "auth.test")).rejects.toThrow(MISSING_TOKEN);
  });
});

describe("paginate", () => {
  it("follows cursors up to the cap", async () => {
    const ctx = fake((request) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      const page = Number(cursor ?? 0);
      return reply({ ok: true, members: [page * 2, page * 2 + 1], response_metadata: { next_cursor: page < 10 ? String(page + 1) : "" } });
    });
    await expect(paginate<{ members: number[] }, number>(ctx, "users.list", { limit: 2 }, (p) => p.members, 5)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(ctx.requests).toHaveLength(3);
  });

  it("stops on an empty cursor", async () => {
    const ctx = fake(() => reply({ ok: true, members: [1], response_metadata: { next_cursor: "" } }));
    await expect(paginate<{ members: number[] }, number>(ctx, "users.list", {}, (p) => p.members, 100)).resolves.toEqual([1]);
  });
});
