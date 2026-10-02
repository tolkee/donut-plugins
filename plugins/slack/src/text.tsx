import type { PluginContext } from "@donut/sdk";
import { type ReactNode, useMemo, useState } from "react";

import { lookupEmoji } from "./emoji";
import { names } from "./format";
import { type Node, parseMrkdwn } from "./mrkdwn";
import type { Directory } from "./resolve";
import { showConversation } from "./view";

function Emoji({ name, skin, dir }: { name: string; skin?: string | undefined; dir: Directory }) {
  const found = lookupEmoji(name, dir.emoji, skin);
  const [broken, setBroken] = useState(false);
  if (!found || ("image" in found && broken)) return <>{`:${name}:`}</>;
  if ("image" in found) return <img className="sl-emoji" src={found.image} alt={`:${name}:`} title={`:${name}:`} onError={() => setBroken(true)} />;
  return <span title={`:${name}:`}>{found.unicode}</span>;
}

function render(nodes: Node[], dir: Directory, ctx: PluginContext): ReactNode[] {
  const label = names(dir);
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "bold":
        return <strong key={i}>{render(node.children, dir, ctx)}</strong>;
      case "italic":
        return <em key={i}>{render(node.children, dir, ctx)}</em>;
      case "strike":
        return <s key={i}>{render(node.children, dir, ctx)}</s>;
      case "code":
        return (
          <code key={i} className="sl-code">
            {node.text}
          </code>
        );
      case "pre":
        return (
          <pre key={i} className="sl-pre">
            {node.text}
          </pre>
        );
      case "quote":
        return (
          <blockquote key={i} className="sl-quote">
            {render(node.children, dir, ctx)}
          </blockquote>
        );
      case "link":
        return (
          <a
            key={i}
            href={node.url}
            title={node.url}
            className="sl-link"
            onClick={(e) => {
              e.preventDefault();
              void ctx.openExternal(node.url);
            }}
          >
            {node.label ?? node.url}
          </a>
        );
      case "user":
        return (
          <span key={i} className="sl-mention">
            @{label.user(node.id) ?? node.label ?? node.id}
          </span>
        );
      case "channel": {
        const name = label.channel(node.id) ?? node.label ?? node.id;
        return (
          <button key={i} type="button" className="sl-mention" aria-label={`Open #${name}`} onClick={() => void showConversation(ctx, { channel: node.id }, `#${name}`)}>
            #{name}
          </button>
        );
      }
      case "broadcast":
        return (
          <span key={i} className="sl-mention">
            @{node.name}
          </span>
        );
      case "usergroup":
        return (
          <span key={i} className="sl-mention">
            {node.label ?? "@group"}
          </span>
        );
      case "emoji":
        return <Emoji key={i} name={node.name} skin={node.skin} dir={dir} />;
      case "br":
        return <br key={i} />;
    }
  });
}

export function SlackText({ text, dir, ctx }: { text: string; dir: Directory; ctx: PluginContext }) {
  const nodes = useMemo(() => parseMrkdwn(text), [text]);
  return <div className="sl-text">{render(nodes, dir, ctx)}</div>;
}
