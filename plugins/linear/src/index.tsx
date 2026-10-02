import { definePlugin } from "@donut/sdk";

import { TOKEN_KEY } from "./api";
import { issue } from "./issue";
import { MINE_SCOPE_KEY } from "./linear";
import { list } from "./list";
import { mine } from "./status";
import { tools } from "./tools";
import skill from "./SKILL.md?raw";
import "./linear.css";

export default definePlugin({
  id: "linear",
  name: "Linear",
  description: "Linear issues and projects: search, read, create, update and comment.",
  permissions: { hosts: ["api.linear.app"], state: ["kanban_read"], links: ["linear.app"] },
  skill: { description: "Use for Linear: the user's issues, searching issues and projects, creating or changing issues, commenting, linking issues to cards.", markdown: skill, requires: [TOKEN_KEY] },
  settings: [
    {
      key: TOKEN_KEY,
      label: "Linear API key",
      secret: true,
      allowed_hosts: ["api.linear.app"],
      description: "Personal API key from Linear → Settings → Security & access.",
    },
    {
      key: MINE_SCOPE_KEY,
      label: "My issues",
      description: "Which of my issues the title bar count and the 'mine' list show.",
      secret: false,
      kind: "select",
      options: [
        { value: "open", label: "All my open issues" },
        { value: "cycle", label: "My open issues in the active cycle" },
      ],
      default: "open",
    },
  ],
  kinds: { issue, list },
  tools,
  statusItems: { mine },
});
