import { definePlugin } from "@donut/sdk";

import { TOKEN_KEY } from "./api";
import { conversation } from "./conversation";
import { list } from "./list";
import { tools } from "./tools";
import skill from "./SKILL.md?raw";
import "./slack.css";

export default definePlugin({
  id: "slack",
  name: "Slack",
  description: "Read Slack channels, DMs and threads, search, unreads; post and react as the user after their yes.",
  permissions: { hosts: ["slack.com"], links: ["slack.com", "*.slack.com"] },
  skill: { description: "Use for Slack: unread DMs and mentions, reading or searching channels and threads, posting or reacting as the user, making a card from a thread.", markdown: skill, requires: [TOKEN_KEY] },
  settings: [
    {
      key: TOKEN_KEY,
      label: "Slack user token",
      secret: true,
      allowed_hosts: ["slack.com"],
      description:
        "User OAuth Token (xoxp-…) of your personal Donut app: api.slack.com/apps → Create New App → From a manifest → Install → OAuth & Permissions. It reads all your DMs: keep it private.",
    },
  ],
  kinds: { conversation, list },
  tools,
});
