# Linear

- Linear (`linear__*`): use `list_teams` to turn names into ids and `list_projects` / `get_project`
  for projects. Show issues with `linear.issue {issueId}` (focus an existing window for that issue)
  and `linear.list {filter: mine|team|search|project}`.
- `create_issue`, `update_issue` and `comment` write to the user's shared Linear workspace. Donut holds
  each one for the user's confirmation: say the exact change aloud and ask once. Sessions can't write
  to Linear, except one comment on the issue linked to their card.
- Cards link to Linear issues with `kanban_link_card {card_id, provider: "linear", id: "GLA-123", url,
  title}`. "Create a Linear issue for this card" is `linear__create_issue`, then, once the user
  confirmed and you have its identifier, `kanban_link_card`; "make a card from GLA-123" is
  `kanban_create_card`, then link it. `linear__get_issue` lists the cards linked to an issue.
