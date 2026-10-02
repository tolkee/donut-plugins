export type Node =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "strike"; children: Node[] }
  | { type: "code"; text: string }
  | { type: "pre"; text: string }
  | { type: "quote"; children: Node[] }
  | { type: "link"; url: string; label?: string }
  | { type: "user"; id: string; label?: string }
  | { type: "channel"; id: string; label?: string }
  | { type: "broadcast"; name: string }
  | { type: "usergroup"; id: string; label?: string }
  | { type: "emoji"; name: string; skin?: string }
  | { type: "br" };

const STYLES = { "*": "bold", _: "italic", "~": "strike" } as const;
type Marker = keyof typeof STYLES;

export function decodeEntities(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);

function angle(body: string): Node {
  const bar = body.indexOf("|");
  const target = bar === -1 ? body : body.slice(0, bar);
  const label = bar === -1 ? undefined : decodeEntities(body.slice(bar + 1));
  const withLabel = <T extends object>(node: T): T => (label ? { ...node, label } : node);
  if (target.startsWith("@")) return withLabel({ type: "user", id: target.slice(1) });
  if (target.startsWith("#")) return withLabel({ type: "channel", id: target.slice(1) });
  if (target.startsWith("!subteam^")) return withLabel({ type: "usergroup", id: target.slice("!subteam^".length) });
  if (target.startsWith("!date^")) return { type: "text", text: label ?? "" };
  if (target.startsWith("!")) return { type: "broadcast", name: target.slice(1) };
  return withLabel({ type: "link", url: decodeEntities(target) });
}

function closing(s: string, from: number, marker: Marker): number {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === "\n") return -1;
    if (c === "<" || c === "`") {
      const end = s.indexOf(c === "<" ? ">" : "`", j + 1);
      if (end === -1) continue;
      j = end;
      continue;
    }
    if (c === marker && !isSpace(s[j - 1]) && !isWordChar(s[j + 1])) return j;
  }
  return -1;
}

function inline(s: string): Node[] {
  const out: Node[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text: decodeEntities(text) });
    text = "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (c === "\n") {
      flush();
      out.push({ type: "br" });
      continue;
    }
    if (c === "<") {
      const end = s.indexOf(">", i + 1);
      if (end > i + 1) {
        flush();
        out.push(angle(s.slice(i + 1, end)));
        i = end;
        continue;
      }
    }
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1 && !s.slice(i + 1, end).includes("\n")) {
        flush();
        out.push({ type: "code", text: decodeEntities(s.slice(i + 1, end)) });
        i = end;
        continue;
      }
    }
    if (c === ":") {
      const match = /^:([a-z0-9_+'-]+):(?::(skin-tone-[2-6]):)?/.exec(s.slice(i));
      if (match?.[1]) {
        flush();
        out.push(match[2] ? { type: "emoji", name: match[1], skin: match[2] } : { type: "emoji", name: match[1] });
        i += match[0].length - 1;
        continue;
      }
    }
    if (c in STYLES && !isWordChar(s[i - 1]) && !isSpace(s[i + 1]) && s[i + 1] !== c) {
      const marker = c as Marker;
      const end = closing(s, i + 1, marker);
      if (end > i + 1) {
        flush();
        out.push({ type: STYLES[marker], children: inline(s.slice(i + 1, end)) });
        i = end;
        continue;
      }
    }
    text += c;
  }
  flush();
  return out;
}

const QUOTE = /^(?:&gt;|>) ?/;

function blocks(s: string): Node[] {
  const out: Node[] = [];
  const lines = s.split("\n");
  let i = 0;
  while (i < lines.length) {
    const quoted = QUOTE.test(lines[i] ?? "");
    const run: string[] = [];
    while (i < lines.length && QUOTE.test(lines[i] ?? "") === quoted) {
      run.push(quoted ? (lines[i] ?? "").replace(QUOTE, "") : (lines[i] ?? ""));
      i++;
    }
    if (out.length) out.push({ type: "br" });
    const children = inline(run.join("\n"));
    if (quoted) out.push({ type: "quote", children });
    else out.push(...children);
  }
  return out;
}

export function parseMrkdwn(text: string): Node[] {
  const out: Node[] = [];
  const prose = (chunk: string) => {
    const trimmed = chunk.replace(/^\n/, "").replace(/\n$/, "");
    if (trimmed) out.push(...blocks(trimmed));
  };
  let last = 0;
  for (const match of text.matchAll(/```([\s\S]*?)```/g)) {
    prose(text.slice(last, match.index));
    out.push({ type: "pre", text: decodeEntities((match[1] ?? "").replace(/^\n/, "").replace(/\n$/, "")) });
    last = match.index + match[0].length;
  }
  prose(text.slice(last));
  return out;
}

export interface Names {
  user(id: string): string | undefined;
  channel(id: string): string | undefined;
  emoji(name: string, skin?: string): string | undefined;
}

function hostOf(url: string): string {
  if (url.startsWith("mailto:")) return url.slice("mailto:".length);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function plain(nodes: Node[], names: Names): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "bold":
        case "italic":
        case "strike":
        case "quote":
          return plain(node.children, names);
        case "pre":
          return " [code block] ";
        case "link":
          return node.label ?? hostOf(node.url);
        case "user":
          return `@${names.user(node.id) ?? node.label ?? node.id}`;
        case "channel":
          return `#${names.channel(node.id) ?? node.label ?? node.id}`;
        case "broadcast":
          return `@${node.name}`;
        case "usergroup":
          return node.label ?? "@group";
        case "emoji":
          return names.emoji(node.name, node.skin) ?? `:${node.name}:`;
        case "br":
          return "\n";
      }
    })
    .join("");
}

export const MAX_TEXT = 600;

export function plainText(nodes: Node[], names: Names, max = MAX_TEXT): { text: string; truncated: boolean } {
  const text = plain(nodes, names).replace(/\s+/g, " ").trim();
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max - 1).trimEnd()}…`, truncated: true };
}
