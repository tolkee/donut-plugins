import { describe, expect, it } from "vitest";

import { type Names, parseMrkdwn, plainText } from "./mrkdwn";

const names: Names = {
  user: (id) => ({ U1: "Jean Dupont" })[id],
  channel: (id) => ({ C1: "infra" })[id],
  emoji: (name, skin) => ({ thumbsup: "👍" })[name]?.concat(skin ? "🏽" : ""),
};

describe("parseMrkdwn", () => {
  it("parses bold, italic, strike and nesting", () => {
    expect(parseMrkdwn("*bold* _it_ ~gone~")).toEqual([
      { type: "bold", children: [{ type: "text", text: "bold" }] },
      { type: "text", text: " " },
      { type: "italic", children: [{ type: "text", text: "it" }] },
      { type: "text", text: " " },
      { type: "strike", children: [{ type: "text", text: "gone" }] },
    ]);
    expect(parseMrkdwn("*very _nested_*")).toEqual([
      { type: "bold", children: [{ type: "text", text: "very " }, { type: "italic", children: [{ type: "text", text: "nested" }] }] },
    ]);
  });

  it("leaves markers inside words and unclosed markers alone", () => {
    expect(parseMrkdwn("snake_case_name and 2*3*4 and *open")).toEqual([{ type: "text", text: "snake_case_name and 2*3*4 and *open" }]);
    expect(parseMrkdwn("* not bold *")).toEqual([{ type: "text", text: "* not bold *" }]);
  });

  it("parses mentions, channels, broadcasts, groups, links and dates", () => {
    expect(parseMrkdwn("<@U1> <@U2|bob> <#C1|infra> <!here> <!subteam^S1|@devs> <https://x.io/a_b|the doc> <https://y.io> <!date^1727712345^{date}|Oct 1>")).toEqual([
      { type: "user", id: "U1" },
      { type: "text", text: " " },
      { type: "user", id: "U2", label: "bob" },
      { type: "text", text: " " },
      { type: "channel", id: "C1", label: "infra" },
      { type: "text", text: " " },
      { type: "broadcast", name: "here" },
      { type: "text", text: " " },
      { type: "usergroup", id: "S1", label: "@devs" },
      { type: "text", text: " " },
      { type: "link", url: "https://x.io/a_b", label: "the doc" },
      { type: "text", text: " " },
      { type: "link", url: "https://y.io" },
      { type: "text", text: " " },
      { type: "text", text: "Oct 1" },
    ]);
  });

  it("parses inline code, code blocks and quotes", () => {
    expect(parseMrkdwn("run `make *all*` now")).toEqual([
      { type: "text", text: "run " },
      { type: "code", text: "make *all*" },
      { type: "text", text: " now" },
    ]);
    expect(parseMrkdwn("look:\n```\nif a &lt; b {}\n```\ndone")).toEqual([
      { type: "text", text: "look:" },
      { type: "pre", text: "if a < b {}" },
      { type: "text", text: "done" },
    ]);
    expect(parseMrkdwn("&gt; quoted *line*\n&gt; second\nreply")).toEqual([
      { type: "quote", children: [{ type: "text", text: "quoted " }, { type: "bold", children: [{ type: "text", text: "line" }] }, { type: "br" }, { type: "text", text: "second" }] },
      { type: "br" },
      { type: "text", text: "reply" },
    ]);
  });

  it("parses emoji with skin tones and decodes entities", () => {
    expect(parseMrkdwn(":thumbsup::skin-tone-4: :+1: a &amp; b &lt;c&gt; 10:30")).toEqual([
      { type: "emoji", name: "thumbsup", skin: "skin-tone-4" },
      { type: "text", text: " " },
      { type: "emoji", name: "+1" },
      { type: "text", text: " a & b <c> 10:30" },
    ]);
  });

  it("never treats escaped markup as tags", () => {
    expect(parseMrkdwn("&lt;script&gt;alert(1)&lt;/script&gt;")).toEqual([{ type: "text", text: "<script>alert(1)</script>" }]);
  });
});

describe("plainText", () => {
  it("reads names, labels and emoji instead of ids and urls", () => {
    const text = "Hey <@U1>, see <#C1> and <https://docs.google.com/x|the doc> or <https://www.github.com/a/b> :thumbsup::skin-tone-3: :partyparrot: <!channel>\n\n```code```";
    expect(plainText(parseMrkdwn(text), names)).toEqual({
      text: "Hey @Jean Dupont, see #infra and the doc or github.com 👍🏽 :partyparrot: @channel [code block]",
      truncated: false,
    });
  });

  it("collapses whitespace and truncates long messages", () => {
    expect(plainText(parseMrkdwn("a\n\n  b"), names).text).toBe("a b");
    const long = plainText(parseMrkdwn("word ".repeat(200)), names);
    expect(long.truncated).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(600);
    expect(long.text.endsWith("…")).toBe(true);
  });
});
