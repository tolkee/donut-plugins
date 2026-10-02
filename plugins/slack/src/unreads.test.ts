import { describe, expect, it } from "vitest";

import { match, ME } from "./fixtures";
import { channelsToCheck, computeUnreads, MAX_CHANNELS, searchQuery } from "./unreads";

const dm = { id: "D0000JEAN1", is_im: true };
const group = { id: "G0000MPIM1", is_mpim: true };
const infra = { id: "C0000INFRA", name: "infra" };

describe("computeUnreads", () => {
  const matches = [
    match(dm, "1727712300.000200", "U0000JEAN", "are you there?"),
    match(dm, "1727712200.000100", "U0000JEAN", "hi"),
    match(dm, "1727712100.000100", "U0000JEAN", "old one"),
    match(dm, "1727712250.000100", ME, "my own message"),
    match(group, "1727712400.000100", "U0000MARI", "lunch?"),
    match(infra, "1727712500.000100", "U0000JEAN", "<@U0000ME01> outage!"),
    match(infra, "1727712600.000100", "U0000JEAN", "<@U0000ME01|guillaume> again"),
    match(infra, "1727712700.000100", "U0000JEAN", "no mention here"),
    match(infra, "1727712000.000100", "U0000JEAN", "<@U0000ME01> already read"),
  ];

  it("keeps DMs and mentions after last_read, newest first", () => {
    const unreads = computeUnreads(matches, { D0000JEAN1: "1727712100.000100", G0000MPIM1: "1727712000.000000", C0000INFRA: "1727712100.000000" }, ME);
    expect(unreads.dms.map((d) => [d.channel, d.messages.map((m) => m.text)])).toEqual([
      ["G0000MPIM1", ["lunch?"]],
      ["D0000JEAN1", ["are you there?", "hi"]],
    ]);
    expect(unreads.mentions.map((m) => m.text)).toEqual(["<@U0000ME01|guillaume> again", "<@U0000ME01> outage!"]);
  });

  it("treats a conversation without last_read as unread", () => {
    const unreads = computeUnreads([match(dm, "1727712300.000200", "U0000JEAN", "hey")], {}, ME);
    expect(unreads.dms).toHaveLength(1);
  });

  it("caps how many conversations it checks", () => {
    const many = Array.from({ length: 30 }, (_, i) => match({ id: `D00000000${String(i).padStart(2, "0")}`, is_im: true }, `17277123${String(i).padStart(2, "0")}.000100`, "U0000JEAN", "x"));
    const checked = channelsToCheck(many, ME);
    expect(checked).toHaveLength(MAX_CHANNELS);
    expect(checked[0]).toBe("D0000000029");
    expect(computeUnreads(many, {}, ME).dms).toHaveLength(MAX_CHANNELS);
  });

  it("searches the last two days without my own messages", () => {
    expect(searchQuery(ME, Date.parse("2026-10-02T12:00:00Z"))).toBe("-from:<@U0000ME01> after:2026-09-30");
  });
});
