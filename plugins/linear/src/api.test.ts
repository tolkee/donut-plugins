import type { FetchRequest, FetchResponse } from "@donut/sdk";
import { describe, expect, it } from "vitest";

import { ENDPOINT, gql, LinearError, MISSING_TOKEN } from "./api";

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

const reply = (status: number, body: unknown): FetchResponse => ({ status, headers: {}, body: JSON.stringify(body) });

describe("gql", () => {
  it("sends the secret marker in the header and variables separately", async () => {
    const ctx = fake(() => reply(200, { data: { viewer: { id: "u" } } }));
    await expect(gql(ctx, "query Q($id: String!) { issue(id: $id) { id } }", { id: 'GLA-1"}' })).resolves.toEqual({ viewer: { id: "u" } });
    const [request] = ctx.requests;
    expect(request?.url).toBe(ENDPOINT);
    expect(request?.method).toBe("POST");
    expect(request?.headers.Authorization).toBe("{{secret:linear.token}}");
    const body = JSON.parse(request?.body ?? "{}") as { query: string; variables: Record<string, string> };
    expect(body.query).not.toContain("GLA-1");
    expect(body.variables).toEqual({ id: 'GLA-1"}' });
  });

  it("maps errors to readable messages", async () => {
    const run = (response: FetchResponse) => gql(fake(() => response), "{ viewer { id } }");
    await expect(run(reply(400, { errors: [{ message: "Entity not found", extensions: { code: "INVALID_INPUT" } }] }))).rejects.toThrow("Entity not found");
    await expect(run(reply(401, { errors: [{ message: "x" }] }))).rejects.toThrow("Linear rejected the API key");
    await expect(run(reply(400, { errors: [{ message: "x", extensions: { code: "AUTHENTICATION_ERROR" } }] }))).rejects.toThrow("Linear rejected the API key");
    await expect(run(reply(400, { errors: [{ message: "x", extensions: { code: "RATELIMITED" } }] }))).rejects.toThrow(/rate limit/);
    await expect(run({ status: 502, headers: {}, body: "<html>" })).rejects.toThrow("Linear returned HTTP 502");
    await expect(run(reply(200, { errors: [{ message: "boom" }] }))).rejects.toBeInstanceOf(LinearError);
  });

  it("explains a missing API key", async () => {
    const ctx = fake(() => {
      throw new Error("secret `linear.token` is not set (open Settings)");
    });
    await expect(gql(ctx, "{ viewer { id } }")).rejects.toThrow(MISSING_TOKEN);
  });
});
