import { describe, expect, it } from "vitest";

import { dir } from "./fixtures";
import { ago, isConversational, messageRow } from "./format";

const NOW = Date.parse("2026-10-02T12:00:00Z");
const ts = (iso: string, micro = "000100") => `${Date.parse(iso) / 1000}.${micro}`;

describe("messageRow", () => {
  it("is a compact, voice-friendly row with untrusted text", () => {
    const at = ts("2026-10-02T09:00:00Z");
    const row = messageRow(
      dir,
      "C0000INFRA",
      {
        ts: at,
        user: "U0000JEAN",
        text: "<@U0000ME01> can you look? :thumbsup:",
        thread_ts: at,
        reply_count: 4,
        reactions: [{ name: "thumbsup", count: 3 }, { name: "partyparrot", count: 1 }],
        files: [{ id: "F1", name: "design-v2.png", pretty_type: "PNG" }],
      },
      NOW,
    );
    expect(row).toEqual({
      ref: `C0000INFRA/${at}`,
      from: "Jean Dupont",
      at: "2026-10-02T09:00:00.000Z",
      ago: "3h",
      text: `<untrusted source="slack:C0000INFRA/${at}">@Guillaume L can you look? 👍</untrusted>`,
      replies: 4,
      thread: `C0000INFRA/${at}`,
      reactions: "👍 3, :partyparrot: 1",
      files: `<untrusted source="slack:C0000INFRA/${at}">design-v2.png (PNG)</untrusted>`,
    });
  });

  it("points replies at their thread and names bots", () => {
    const root = ts("2026-10-01T09:00:00Z");
    const reply = ts("2026-10-01T10:00:00Z");
    const row = messageRow(dir, "C0000INFRA", { ts: reply, thread_ts: root, bot_id: "B1", bot_profile: { name: "PagerDuty" }, text: "x" }, NOW);
    expect(row).toMatchObject({ from: "PagerDuty", in_thread: `C0000INFRA/${root}`, ago: "1d" });
    expect(row).not.toHaveProperty("replies");
  });

  it("drops joins and topic changes but keeps shares and broadcasts", () => {
    expect(isConversational({ ts: "1.1" })).toBe(true);
    expect(isConversational({ ts: "1.1", subtype: "thread_broadcast" })).toBe(true);
    expect(isConversational({ ts: "1.1", subtype: "file_share" })).toBe(true);
    expect(isConversational({ ts: "1.1", subtype: "channel_join" })).toBe(false);
    expect(isConversational({ ts: "1.1", subtype: "channel_topic" })).toBe(false);
  });
});

describe("ago", () => {
  it("speaks in short relative units", () => {
    expect(ago(ts("2026-10-02T11:59:40Z"), NOW)).toBe("now");
    expect(ago(ts("2026-10-02T11:15:00Z"), NOW)).toBe("45m");
    expect(ago(ts("2026-09-25T12:00:00Z"), NOW)).toBe("7d");
    expect(ago(ts("2026-01-01T12:00:00Z"), NOW)).toBe("2026-01-01");
  });
});
