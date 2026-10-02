import { describe, expect, it } from "vitest";

import { dir } from "./fixtures";
import { conversationById, parseRef, permalinkOf, ResolveError, resolveConversation, resolveUser, tsAfter } from "./resolve";

describe("resolveConversation", () => {
  it("finds channels by #name, bare name or id", () => {
    expect(resolveConversation(dir, "#infra")).toEqual({ id: "C0000INFRA", kind: "channel", name: "#infra" });
    expect(resolveConversation(dir, "General")).toMatchObject({ id: "C0000GENRL" });
    expect(resolveConversation(dir, "C0000INFRB")).toMatchObject({ name: "#infra-alerts" });
    expect(resolveConversation(dir, "https://gladia.slack.com/archives/C0000INFRA/p1727712345123456")).toMatchObject({ id: "C0000INFRA" });
  });

  it("finds DMs by person", () => {
    expect(resolveConversation(dir, "@jean")).toEqual({ id: "D0000JEAN1", kind: "dm", name: "Jean Dupont" });
    expect(resolveConversation(dir, "jean@gladia.io")).toMatchObject({ id: "D0000JEAN1" });
    expect(resolveConversation(dir, "Jean Dupont")).toMatchObject({ id: "D0000JEAN1" });
    expect(resolveConversation(dir, "U0000JEAN")).toMatchObject({ id: "D0000JEAN1" });
    expect(resolveConversation(dir, "D0000JEAN1")).toMatchObject({ kind: "dm", name: "Jean Dupont" });
  });

  it("asks to open a DM with someone you haven't talked to", () => {
    expect(resolveConversation(dir, "@marie")).toEqual({ needsOpen: "U0000MARI", name: "Marie Curie" });
  });

  it("names group DMs after the other people", () => {
    expect(conversationById(dir, "G0000MPIM1")).toEqual({ id: "G0000MPIM1", kind: "mpim", name: "Jean Dupont, Marie Curie" });
  });

  it("refuses ambiguous or unknown names with candidates", () => {
    expect(() => resolveConversation(dir, "jea")).toThrow(/ambiguous.*Jean Dupont.*Jeanne Martin/);
    expect(() => resolveConversation(dir, "#nope")).toThrow(ResolveError);
    expect(() => resolveConversation(dir, "#nope")).toThrow(/#infra/);
    expect(() => resolveConversation(dir, "zzz")).toThrow("no Slack channel or person `zzz`");
  });
});

describe("resolveUser", () => {
  it("matches me, handles, emails, full and first names, and skips deleted accounts", () => {
    expect(resolveUser(dir, "me").id).toBe("U0000ME01");
    expect(resolveUser(dir, "@marie").id).toBe("U0000MARI");
    expect(resolveUser(dir, "Marie").id).toBe("U0000MARI");
    expect(resolveUser(dir, "dupont").id).toBe("U0000JEAN");
    expect(resolveUser(dir, "jean").id).toBe("U0000JEAN");
    expect(() => resolveUser(dir, "old")).toThrow(/no Slack user/);
  });
});

describe("message refs", () => {
  it("parses channel/ts refs and permalinks", () => {
    expect(parseRef("C0123ABCD/1727712345.123456")).toEqual({ channel: "C0123ABCD", ts: "1727712345.123456" });
    expect(parseRef("https://gladia.slack.com/archives/C0123ABCD/p1727712345123456")).toEqual({ channel: "C0123ABCD", ts: "1727712345.123456" });
    expect(parseRef("https://gladia.slack.com/archives/C0123ABCD/p1727712399000100?thread_ts=1727712345.123456&cid=C0123ABCD")).toEqual({
      channel: "C0123ABCD",
      ts: "1727712399.000100",
      thread_ts: "1727712345.123456",
    });
  });

  it("refuses anything else", () => {
    for (const bad of ["C0123ABCD", "C0123ABCD/abc", "https://evil.example/archives/C0123ABCD/p1727712345123456", "#infra/1.2", "C0123ABCD/1727712345.1/x"]) {
      expect(() => parseRef(bad), bad).toThrow(ResolveError);
    }
  });

  it("builds permalinks from the workspace url", () => {
    expect(permalinkOf(dir, "C0000INFRA", "1727712345.123456")).toBe("https://gladia.slack.com/archives/C0000INFRA/p1727712345123456");
    expect(permalinkOf(dir, "C0000INFRA", "1727712399.000100", "1727712345.123456")).toBe(
      "https://gladia.slack.com/archives/C0000INFRA/p1727712399000100?thread_ts=1727712345.123456&cid=C0000INFRA",
    );
  });

  it("compares timestamps without float rounding", () => {
    expect(tsAfter("1727712345.123457", "1727712345.123456")).toBe(true);
    expect(tsAfter("1727712345.123456", "1727712345.123456")).toBe(false);
    expect(tsAfter("1727712346.000001", "1727712345.999999")).toBe(true);
    expect(tsAfter("1727712345.1", "1727712345.099999")).toBe(true);
  });
});
