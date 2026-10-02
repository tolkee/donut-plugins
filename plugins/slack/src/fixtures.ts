import type { Directory } from "./resolve";
import type { SearchMatch, SlackUser } from "./types";

function user(id: string, name: string, realName: string, extra: Partial<SlackUser["profile"]> = {}): SlackUser {
  return { id, name, real_name: realName, tz: "Europe/Paris", profile: { real_name: realName, display_name: "", email: `${name}@gladia.io`, ...extra } };
}

export const ME = "U0000ME01";

export const dir: Directory = {
  me: { user_id: ME, user: "guillaume", team_id: "T0000TEAM", team: "Gladia", url: "https://gladia.slack.com/" },
  users: [
    user(ME, "guillaume", "Guillaume L"),
    user("U0000JEAN", "jean", "Jean Dupont", { title: "Infra" }),
    user("U0000JEA2", "jeanne", "Jeanne Martin"),
    user("U0000MARI", "marie", "Marie Curie", { display_name: "Marie" }),
    { ...user("U0000GONE", "gone", "Old Account"), deleted: true },
  ],
  conversations: [
    { id: "C0000INFRA", name: "infra", is_channel: true, is_member: true, topic: { value: "Prod and outages" } },
    { id: "C0000GENRL", name: "general", is_channel: true, is_member: true },
    { id: "C0000INFRB", name: "infra-alerts", is_channel: true, is_member: true },
    { id: "D0000JEAN1", is_im: true, user: "U0000JEAN" },
    { id: "G0000MPIM1", name: "mpdm-guillaume--jean--marie-1", is_mpim: true },
  ],
  emoji: { partyparrot: "https://emoji.slack-edge.com/T/partyparrot/1.gif", parrot: "alias:partyparrot" },
};

export function match(channel: SearchMatch["channel"], ts: string, user: string, text: string): SearchMatch {
  return { type: "message", channel, ts, user, text, permalink: `https://gladia.slack.com/archives/${channel.id}/p${ts.replace(".", "")}` };
}
