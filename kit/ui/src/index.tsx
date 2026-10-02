import "./tokens.css";

import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ageLabel } from "./age";

export { ageLabel };

type Space = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8;

const space = (n: Space | undefined) => (n === undefined ? undefined : n === 0 ? 0 : `var(--dn-space-${n})`);

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: Space;
  align?: CSSProperties["alignItems"];
  justify?: CSSProperties["justifyContent"];
  padding?: Space;
  grow?: boolean;
  wrap?: boolean;
}

export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  { direction = "column", gap = 2, align, justify, padding, grow, wrap, style, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("dn-stack", className)}
      style={{
        flexDirection: direction,
        gap: space(gap),
        alignItems: align,
        justifyContent: justify,
        padding: space(padding),
        flex: grow ? 1 : undefined,
        flexWrap: wrap ? "wrap" : undefined,
        minHeight: grow ? 0 : undefined,
        ...style,
      }}
      {...rest}
    />
  );
});

export const Row = forwardRef<HTMLDivElement, Omit<StackProps, "direction">>(function Row(props, ref) {
  return <Stack ref={ref} direction="row" align="center" {...props} />;
});

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div" | "label";
  size?: "xs" | "sm" | "md" | "base" | "lg";
  tone?: "default" | "muted" | "faint";
  weight?: 400 | 500 | 600;
  mono?: boolean;
  truncate?: boolean;
}

export function Text({ as: Tag = "p", size = "base", tone = "default", weight, mono, truncate, className, style, ...rest }: TextProps) {
  return (
    <Tag
      className={cx("dn-text", className)}
      data-size={size}
      data-tone={tone}
      data-mono={mono || undefined}
      data-truncate={truncate || undefined}
      style={{ fontWeight: weight, ...style }}
      {...rest}
    />
  );
}

export function Heading({ level = 3, className, ...rest }: HTMLAttributes<HTMLHeadingElement> & { level?: 1 | 2 | 3 | 4 }) {
  const Tag = `h${level}` as const;
  return <Tag className={cx("dn-heading", className)} data-level={level} {...rest} />;
}

export function Label({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("dn-label", className)} {...rest} />;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "primary" | "ghost";
  size?: "sm" | "md";
  icon?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("dn-button", className)}
      data-variant={variant}
      data-size={size}
      data-icon={icon || undefined}
      {...rest}
    />
  );
});

export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "icon"> & { label: string }>(function IconButton(
  { label, variant = "ghost", ...rest },
  ref,
) {
  return <Button ref={ref} icon variant={variant} aria-label={label} title={label} {...rest} />;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }>(function Input(
  { className, mono, ...rest },
  ref,
) {
  return <input ref={ref} className={cx("dn-input", className)} data-mono={mono || undefined} spellCheck={false} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }>(
  function Textarea({ className, mono, ...rest }, ref) {
    return <textarea ref={ref} className={cx("dn-textarea", className)} data-mono={mono || undefined} {...rest} />;
  },
);

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("dn-select", className)} {...rest} />;
}

export const Switch = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }>(function Switch(
  { label, className, ...rest },
  ref,
) {
  return <input ref={ref} type="checkbox" role="switch" className={cx("dn-switch", className)} aria-label={label} title={label} {...rest} />;
});

export const Slider = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string }>(function Slider(
  { label, className, style, value, max, ...rest },
  ref,
) {
  const fill = typeof value === "number" && typeof max === "number" && max > 0 ? `${(value / max) * 100}%` : "0%";
  return (
    <input
      ref={ref}
      type="range"
      className={cx("dn-slider", className)}
      aria-label={label}
      title={label}
      value={value}
      max={max}
      style={{ "--dn-slider-fill": fill, ...style } as CSSProperties}
      {...rest}
    />
  );
});

const ZOOM_STEP = 1.25;
const MAX_ZOOM = 16;

export interface ImageViewProps {
  src: string;
  alt?: string;
  fit?: "contain" | "cover";
  controls?: boolean;
  onError?(): void;
  className?: string;
}

export function ImageView({ src, alt = "", fit = "contain", controls = true, onError, className }: ImageViewProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const zoomTo = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }, []);
  useEffect(() => zoomTo(1), [src, zoomTo]);
  return (
    <div
      className={cx("dn-image-view", className)}
      data-zoomed={zoom > 1 || undefined}
      onWheel={(e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        zoomTo(zoom * Math.exp(-e.deltaY / 200));
      }}
      onPointerDown={(e) => {
        if (zoom === 1) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (start) setPan({ x: start.panX + e.clientX - start.x, y: start.panY + e.clientY - start.y });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onDoubleClick={() => zoomTo(zoom === 1 ? 2 : 1)}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onError={onError}
        style={{ objectFit: fit, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      />
      {controls ? (
        <div className="dn-image-controls">
          <IconButton label="Zoom out" size="sm" disabled={zoom === 1} onClick={() => zoomTo(zoom / ZOOM_STEP)}>
            −
          </IconButton>
          <span className="dn-image-zoom">{Math.round(zoom * 100)}%</span>
          <IconButton label="Zoom in" size="sm" disabled={zoom === MAX_ZOOM} onClick={() => zoomTo(zoom * ZOOM_STEP)}>
            +
          </IconButton>
          <Button variant="ghost" size="sm" disabled={zoom === 1} onClick={() => zoomTo(1)}>
            Fit
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function useAnchoredPosition(
  anchor: RefObject<HTMLElement | null>,
  card: RefObject<HTMLElement | null>,
  open: boolean,
  align: "start" | "end",
): { top: number; left: number } | null {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    if (!open || !a || !card.current) return setPosition(null);
    const width = card.current.offsetWidth;
    const margin = 8;
    const preferred = align === "end" ? a.right - width : a.left;
    const next = { top: Math.round(a.bottom + 6), left: Math.round(Math.min(Math.max(margin, preferred), window.innerWidth - width - margin)) };
    setPosition((prev) => (prev && prev.top === next.top && prev.left === next.left ? prev : next));
  });
  return position;
}

function useDismiss(open: boolean, close: () => void, anchor?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointer = (e: PointerEvent) => anchor?.current && !anchor.current.contains(e.target as Node | null) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    if (anchor) window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, close, anchor]);
}

export interface HoverCardProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

export function HoverCard({ trigger, children, align = "start", openDelay = 180, closeDelay = 140, className }: HoverCardProps) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const position = useAnchoredPosition(anchor, card, open, align);
  const close = useCallback(() => setOpen(false), []);

  const schedule = (next: boolean, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useDismiss(open, close);

  return (
    <span
      ref={anchor}
      className={cx("dn-hovercard", className)}
      onPointerEnter={() => schedule(true, openDelay)}
      onPointerLeave={() => schedule(false, closeDelay)}
      onFocus={() => schedule(true, openDelay)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && schedule(false, 0)}
    >
      {trigger}
      {open ? (
        <div
          ref={card}
          className="dn-hovercard-content"
          style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownProps {
  label: string;
  value: string | null;
  options: DropdownOption[];
  onChange(value: string): void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function Dropdown({ label, value, options, onChange, children, align = "start", className }: DropdownProps) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const position = useAnchoredPosition(anchor, card, open, align);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, anchor);

  useEffect(() => {
    if (!open || !position) return;
    card.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open, position]);

  const pick = (next: string) => {
    setOpen(false);
    trigger.current?.focus();
    if (next !== value) onChange(next);
  };

  const current = options.find((o) => o.value === value)?.label ?? value ?? "";
  return (
    <span ref={anchor} className={cx("dn-dropdown", className)}>
      <button
        ref={trigger}
        type="button"
        className="dn-dropdown-trigger"
        aria-label={current ? `${label}: ${current}` : label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
      </button>
      {open ? (
        <div
          ref={card}
          role="listbox"
          aria-label={label}
          className="dn-dropdown-menu"
          style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="dn-dropdown-option"
              onClick={() => pick(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

export interface MultiSelectProps {
  label: string;
  values: string[];
  options: DropdownOption[];
  onChange(values: string[]): void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function MultiSelect({ label, values, options, onChange, children, align = "start", className }: MultiSelectProps) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const card = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const position = useAnchoredPosition(anchor, card, open, align);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, anchor);

  const toggle = (value: string, checked: boolean) =>
    onChange(options.map((o) => o.value).filter((v) => (v === value ? checked : values.includes(v))));

  return (
    <span ref={anchor} className={cx("dn-dropdown", className)}>
      <Button aria-label={label} title={label} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {children}
      </Button>
      {open ? (
        <div
          ref={card}
          role="group"
          aria-label={label}
          className="dn-dropdown-menu"
          style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
        >
          {options.map((option) => (
            <label key={option.value} className="dn-dropdown-option">
              <input
                type="checkbox"
                className="dn-checkbox"
                aria-label={option.label}
                checked={values.includes(option.value)}
                onChange={(e) => toggle(option.value, e.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </span>
  );
}

function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function Age({ since, ...rest }: { since: number } & HTMLAttributes<HTMLElement>) {
  const now = useNow(15_000);
  return (
    <time dateTime={new Date(since).toISOString()} title={`Started ${new Date(since).toLocaleString()}`} {...rest}>
      {ageLabel(now - since)}
    </time>
  );
}

export function Badge({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("dn-badge", className)} {...rest} />;
}

export type Tone = "neutral" | "ok" | "warn" | "err" | "busy";

export function Dot({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cx("dn-dot", className)} data-tone={tone} {...rest} />;
}

export interface PermissionLineView {
  tone: "warn" | "reach" | "act" | "read" | "teach" | "adds";
  text: string;
}

export function PermissionList({ lines, label = "Permissions", className }: { lines: PermissionLineView[]; label?: string; className?: string }) {
  return (
    <ul className={cx("dn-permissions", className)} aria-label={label}>
      {lines.map((line, index) => (
        <li key={index} data-tone={line.tone}>
          {line.tone === "warn" ? <Dot tone="warn" aria-hidden /> : <span className="dn-permissions-mark" aria-hidden />}
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function Card({ interactive, className, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cx("dn-card", className)} data-interactive={interactive || undefined} {...rest} />;
}

export function Divider() {
  return <hr className="dn-divider" />;
}

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <kbd className={cx("dn-kbd", className)} {...rest} />;
}

export function List({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("dn-list", className)} {...rest} />;
}

export function ListItem({ interactive, className, ...rest }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cx("dn-list-item", className)} data-interactive={interactive || undefined} {...rest} />;
}

export function Empty({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="dn-empty">
      <Text size="md" weight={500} tone="muted">
        {title}
      </Text>
      {children}
    </div>
  );
}

export function Overlay({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("dn-overlay", className)} {...rest}>
      <div className="dn-overlay-panel">{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="dn-spinner" role="status" aria-label="Loading" />;
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
  orientation = "horizontal",
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  orientation?: "horizontal" | "vertical";
  label?: string;
}) {
  return (
    <div className="dn-tabs" role="tablist" aria-label={label} aria-orientation={orientation} data-orientation={orientation}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          className="dn-tab"
          aria-selected={o.value === value}
          data-active={o.value === value || undefined}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const highlightCache = new Map<string, string>();

async function highlight(code: string, language: string): Promise<string> {
  const key = `${language}\u0000${code}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;
  const { codeToHtml } = await import("shiki");
  const html = await codeToHtml(code, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  }).catch(() => codeToHtml(code, { lang: "text", themes: { light: "github-light", dark: "github-dark" }, defaultColor: false }));
  if (highlightCache.size > 200) highlightCache.clear();
  highlightCache.set(key, html);
  return html;
}

export function Code({ code, language = "text", style, className }: { code: string; language?: string; style?: CSSProperties; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    highlight(code, language).then((h) => alive && setHtml(h));
    return () => {
      alive = false;
    };
  }, [code, language]);
  if (html === null) {
    return (
      <pre className={cx("dn-code", className)} style={style}>
        <code>{code}</code>
      </pre>
    );
  }
  return <div className={cx("dn-code", className)} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

function diffChange(line: string, unified: boolean): "added" | "removed" | "hunk" | undefined {
  if (unified) {
    if (line.startsWith("@@")) return "hunk";
    if (line.startsWith("+") && !line.startsWith("+++")) return "added";
    if (line.startsWith("-") && !line.startsWith("---")) return "removed";
    return undefined;
  }
  if (line.startsWith("+ ")) return "added";
  if (line.startsWith("- ")) return "removed";
  return undefined;
}

export function Diff({ diff, className, label = "Changes", unified = false }: { diff: string; className?: string; label?: string; unified?: boolean }) {
  return (
    <pre className={cx("dn-code dn-diff", className)} aria-label={label}>
      {diff.split("\n").map((line, i) => (
        <span key={i} className="dn-diff-line" data-change={diffChange(line, unified)}>
          {line}
        </span>
      ))}
    </pre>
  );
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cx("dn-markdown", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: cls, children: content }) {
            const match = /language-(\w+)/.exec(cls ?? "");
            const text = String(content ?? "");
            if (match || text.includes("\n")) {
              return <Code code={text.replace(/\n$/, "")} language={match?.[1] ?? "text"} />;
            }
            return <code>{content}</code>;
          },
          pre({ children: content }) {
            return <>{content}</>;
          },
          a({ href, children: content }) {
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {content}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
