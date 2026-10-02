import { defineKind, definePlugin, defineStatusItem, defineTool, usePluginData, z } from "@donut/sdk";
import { Button, Row, Stack, Text } from "@donut/ui";
import { useEffect, useState } from "react";

import skill from "./SKILL.md?raw";
import "./hello.css";

const QUOTE_URL = "https://api.github.com/zen";

const card = defineKind({
  description: "A greeting card for someone, with a random quote. props: { name }",
  props: z.object({ name: z.string().describe("Who to greet") }),
  defaultSize: { w: 360, h: 220 },
  component: function HelloCard({ props, ctx, setTitle }) {
    const [count, setCount] = usePluginData(ctx, "count", 0);
    const [quote, setQuote] = useState<string | null>(null);
    useEffect(() => setTitle(`Hello ${props.name}`), [props.name, setTitle]);
    useEffect(() => {
      ctx.fetch({ url: QUOTE_URL, headers: { Accept: "application/vnd.github+json", "User-Agent": "donut-plugin-hello" } }).then(
        (res) => setQuote(res.status === 200 ? res.body : null),
        () => setQuote(null),
      );
    }, [ctx]);
    return (
      <Stack gap={3} padding={4} className="hello-card">
        <Text size="lg" weight={500}>
          Hello, {props.name}!
        </Text>
        {quote ? <Text tone="muted">“{quote}”</Text> : null}
        <Row gap={2} align="center">
          <Button size="sm" onClick={() => setCount(count + 1)}>
            Greet again
          </Button>
          <Text size="sm" tone="faint">
            {count} greetings so far
          </Text>
        </Row>
      </Stack>
    );
  },
});

export default definePlugin({
  id: "hello",
  name: "Hello",
  description: "Greets people. A template for writing Donut plugins.",
  permissions: { hosts: ["api.github.com"] },
  settings: [
    {
      key: "hello.style",
      label: "Greeting style",
      description: "How Hello greets people.",
      kind: "select",
      options: [
        { value: "warm", label: "Warm" },
        { value: "formal", label: "Formal" },
      ],
      default: "warm",
      secret: false,
    },
  ],
  skill: { description: "Use for Hello: greeting someone by name, or the greeting count.", markdown: skill },
  kinds: { card },
  statusItems: {
    count: defineStatusItem({
      label: "Greetings",
      description: "How many greetings Hello has sent.",
      compute: (ctx) => ({ text: `${ctx.data.get<number>("count") ?? 0} hi` }),
      onClick: async (ctx) => void (await ctx.canvas.open("hello.card", { name: "you" })),
    }),
  },
  tools: {
    greet: defineTool({
      description: "Greet someone by name. Returns the greeting; pass open=true to show it in a hello.card window.",
      input: z.object({ name: z.string().min(1), open: z.boolean().optional() }),
      run: async ({ name, open }, ctx) => {
        const style = ctx.runtime.getState().settings.find((s) => s.key === "hello.style")?.value ?? "warm";
        const greeting = style === "formal" ? `Good day, ${name}.` : `Hi ${name}!`;
        await ctx.data.set("count", (ctx.data.get<number>("count") ?? 0) + 1);
        if (open) await ctx.canvas.open("hello.card", { name });
        return greeting;
      },
    }),
    remember: defineTool({
      description: "Save a greeting for someone in Hello's notes. Changes the user's data, so Donut holds it for their yes.",
      input: z.object({ name: z.string().min(1), note: z.string().max(200).optional() }),
      effect: "write",
      confirm: { title: "Save a greeting for {name}", detailField: "note" },
      run: async ({ name, note }, ctx) => {
        const notes = ctx.data.get<Record<string, string>>("notes") ?? {};
        await ctx.data.set("notes", { ...notes, [name]: note ?? "" });
        return `saved a greeting for ${name}`;
      },
    }),
  },
});
