import { describe, expect, it } from "vitest";

import { linkedCards } from "./cards";

describe("linked cards", () => {
  it("finds kanban cards linked to an issue by identifier or id", () => {
    const card = (id: string, links: { provider: string; id: string }[]) => ({ id, column_id: "todo", title: id, description: "", labels: [], links, status: "idle" as const, created_at: 0, updated_at: 0 });
    const boards = [
      {
        id: "b",
        name: "Donut",
        columns: [{ id: "todo", name: "Todo" }],
        cards: [card("card-1", [{ provider: "linear", id: "GLA-1" }]), card("card-2", [{ provider: "github", id: "GLA-1" }]), card("card-3", [{ provider: "linear", id: "uuid-1" }])],
        updated_at: 0,
      },
    ];
    expect(linkedCards(boards, "gla-1", "uuid-1").map((x) => [x.card.id, x.column])).toEqual([
      ["card-1", "Todo"],
      ["card-3", "Todo"],
    ]);
  });
});
