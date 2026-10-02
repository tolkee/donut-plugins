import { type Board, type LinkedCard, linkedCards as linked } from "@donut/sdk";

export function sameIssue(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function linkedCards(boards: Board[], ...issueIds: string[]): LinkedCard[] {
  return linked(boards, "linear", ...issueIds);
}
