// Each exported function is self-contained (no outer references) so it can be
// stringified and injected into a <webview> page with executeJavaScript.

export interface SnapshotOptions {
  maxChars?: number;
  refPrefix?: string;
  textMax?: number;
  keepLines?: boolean;
}

export function snapshotDom(root: Element, options: SnapshotOptions = {}): string {
  const maxChars = options.maxChars ?? 12000;
  const prefix = options.refPrefix ?? "e";
  const textMax = options.textMax ?? 2000;
  const keepLines = options.keepLines ?? false;
  const doc = root.ownerDocument;
  const win = doc.defaultView ?? window;
  const lines: string[] = [];
  let next = 0;
  for (const el of Array.from(root.querySelectorAll("[data-donut-ref]"))) {
    const n = Number(el.getAttribute("data-donut-ref")?.slice(prefix.length));
    if (Number.isFinite(n)) next = Math.max(next, n);
  }

  const interactiveTags = new Set(["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "SUMMARY", "OPTION"]);
  const roles = new Set(["button", "link", "checkbox", "tab", "menuitem", "option", "switch", "textbox", "combobox", "radio"]);
  const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "TEMPLATE", "HEAD"]);

  const visible = (el: Element): boolean => {
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  };

  const isInteractive = (el: Element): boolean => {
    if (interactiveTags.has(el.tagName)) return !(el as HTMLInputElement).disabled;
    const role = el.getAttribute("role");
    if (role && roles.has(role)) return true;
    if ((el as HTMLElement).isContentEditable && !(el.parentElement as HTMLElement | null)?.isContentEditable) return true;
    if (el.hasAttribute("data-donut-action") || el.hasAttribute("onclick")) return true;
    if (el.getAttribute("draggable") === "true") return true;
    return win.getComputedStyle(el).cursor === "pointer" && !(el.parentElement && win.getComputedStyle(el.parentElement).cursor === "pointer");
  };

  const clean = (text: string | null | undefined, max = 120): string => {
    const t = (text ?? "").replace(/\s+/g, " ").trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
  };

  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    const html = el as HTMLInputElement;
    const label = clean(el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "");
    const parts: string[] = [];
    if (tag === "select") {
      const select = el as HTMLSelectElement;
      parts.push("select");
      if (label) parts.push(`"${label}"`);
      const chosen = select.selectedOptions[0];
      if (chosen) parts.push(`value="${clean(chosen.value, 80)}"`);
      const options = Array.from(select.options).map((o) => (o.value === o.text ? o.value : `${o.value}: ${clean(o.text, 50)}`));
      const shown = options.slice(0, 40).join(" | ");
      parts.push(`options=[${shown}${options.length > 40 ? ` | … ${options.length - 40} more` : ""}]`);
    } else if (tag === "input" || tag === "textarea") {
      const type = tag === "input" ? html.type || "text" : tag;
      parts.push(type === "checkbox" || type === "radio" ? `${type}${html.checked ? " checked" : ""}` : type);
      const name = label || clean(html.placeholder) || clean(html.name);
      if (name) parts.push(`"${name}"`);
      if (type !== "checkbox" && type !== "radio" && type !== "password" && html.value) parts.push(`value="${clean(html.value, tag === "textarea" ? 2000 : 200)}"`);
      if (type === "range" || type === "number") {
        if (html.min || html.max) parts.push(`range=${html.min || "?"}..${html.max || "?"}`);
        const spoken = el.getAttribute("aria-valuetext");
        if (spoken) parts.push(`(${clean(spoken, 80)})`);
      }
    } else if ((el as HTMLElement).isContentEditable) {
      parts.push(`editable "${clean(el.textContent, 200)}"`);
    } else {
      parts.push(role ?? (tag === "a" ? "link" : tag === "button" ? "button" : "clickable"));
      const text = label || clean((el as HTMLElement).innerText ?? el.textContent);
      if (text) parts.push(`"${text}"`);
      if (tag === "a" && (el as HTMLAnchorElement).href) parts.push(`→ ${clean((el as HTMLAnchorElement).getAttribute("href"), 80)}`);
    }
    return parts.join(" ");
  };

  const interactive = new Set<Element>();
  const containsInteractive = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (skip.has(el.tagName.toUpperCase()) || el.closest("[data-donut-ignore]") || !isInteractive(el)) continue;
    interactive.add(el);
    for (let p = el.parentElement; p && p !== root.parentElement; p = p.parentElement) {
      if (containsInteractive.has(p)) break;
      containsInteractive.add(p);
    }
  }

  const walk = (el: Element, depth: number): void => {
    if (skip.has(el.tagName.toUpperCase()) || el.hasAttribute("data-donut-ignore") || !visible(el)) return;
    const indent = "  ".repeat(Math.min(depth, 6));
    if (interactive.has(el)) {
      let ref = el.getAttribute("data-donut-ref");
      if (!ref) {
        ref = `${prefix}${++next}`;
        el.setAttribute("data-donut-ref", ref);
      }
      lines.push(`${indent}[${ref}] ${describe(el)}`);
      return;
    }
    const heading = /^H[1-6]$/.test(el.tagName) ? `${"#".repeat(Number(el.tagName[1]))} ` : "";
    if (el.tagName === "IMG") {
      const alt = clean(el.getAttribute("alt"));
      lines.push(`${indent}image${alt ? ` "${alt}"` : ""}`);
      return;
    }
    if (!containsInteractive.has(el)) {
      const raw = (el as HTMLElement).innerText ?? el.textContent ?? "";
      if (keepLines) {
        const kept = raw
          .split("\n")
          .map((line) => line.replace(/\s+$/, ""))
          .filter((line) => line.trim())
          .map((line) => (line.length > textMax ? `${line.slice(0, textMax)}…` : line));
        kept.forEach((line, i) => lines.push(`${indent}${i === 0 ? heading : ""}${line}`));
        return;
      }
      const text = clean(raw, textMax);
      if (text) lines.push(`${indent}${heading}${text}`);
      return;
    }
    let ownText = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) ownText += node.textContent ?? "";
    }
    ownText = clean(ownText, options.textMax ?? 300);
    if (ownText) lines.push(`${indent}${heading}${ownText}`);
    for (const child of Array.from(el.children)) walk(child, ownText ? depth + 1 : depth);
  };

  walk(root, 0);
  const out = lines.join("\n");
  if (out.length > maxChars) return `${out.slice(0, maxChars)}\n… (truncated)`;
  return out || "(empty)";
}

export interface TargetSpec {
  ref?: string | null;
  text?: string | null;
  x?: number | null;
  y?: number | null;
}

export function findTarget(root: Element, target: TargetSpec): Element | null {
  if (target.ref) return root.querySelector(`[data-donut-ref="${target.ref}"]`);
  if (target.text) {
    const wanted = target.text.toLowerCase().trim();
    const candidates = Array.from(
      root.querySelectorAll("button, a, [role], input, textarea, select, summary, [data-donut-action], [contenteditable], label"),
    );
    const labelOf = (el: Element) =>
      (el.getAttribute("aria-label") ?? (el as HTMLInputElement).placeholder ?? (el as HTMLElement).innerText ?? el.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    return (
      candidates.find((el) => labelOf(el) === wanted) ??
      candidates.find((el) => labelOf(el).includes(wanted)) ??
      Array.from(root.querySelectorAll("*")).find((el) => el.children.length === 0 && labelOf(el).includes(wanted)) ??
      null
    );
  }
  if (typeof target.x === "number" && typeof target.y === "number") {
    const rect = root.getBoundingClientRect();
    return root.ownerDocument.elementFromPoint(rect.left + target.x, rect.top + target.y);
  }
  return null;
}

export function clickElement(el: Element): void {
  const html = el as HTMLElement;
  html.scrollIntoView({ block: "nearest", inline: "nearest" });
  const rect = html.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0 };
  html.dispatchEvent(new PointerEvent("pointerdown", { ...init, pointerId: 1, isPrimary: true }));
  html.dispatchEvent(new MouseEvent("mousedown", init));
  if (typeof html.focus === "function") html.focus();
  html.dispatchEvent(new PointerEvent("pointerup", { ...init, pointerId: 1, isPrimary: true }));
  html.dispatchEvent(new MouseEvent("mouseup", init));
  html.click();
}

export function typeIntoElement(el: Element, text: string, submit: boolean): void {
  const html = el as HTMLElement;
  html.focus();
  if (el instanceof HTMLSelectElement) {
    const wanted = text.trim().toLowerCase();
    const option =
      Array.from(el.options).find((o) => o.value.toLowerCase() === wanted) ??
      Array.from(el.options).find((o) => o.text.trim().toLowerCase() === wanted) ??
      Array.from(el.options).find((o) => o.text.toLowerCase().includes(wanted));
    if (!option) throw new Error(`no option matching "${text}"`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(el, option.value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (html.isContentEditable) {
    html.ownerDocument.execCommand("insertText", false, text);
  } else if (el instanceof HTMLInputElement && (el.type === "range" || el.type === "number")) {
    if (text.trim() === "" || !Number.isFinite(Number(text))) throw new Error(`"${text}" is not a number`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, text.trim());
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(el, el.value + text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    throw new Error("target is not editable");
  }
  if (submit) {
    const key = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    html.dispatchEvent(new KeyboardEvent("keydown", key));
    html.dispatchEvent(new KeyboardEvent("keypress", key));
    html.dispatchEvent(new KeyboardEvent("keyup", key));
    const form = (el as HTMLInputElement).form;
    if (form && el instanceof HTMLInputElement) form.requestSubmit();
  }
}

export function scrollWithin(root: Element, dy: number): string {
  const all = [root, ...Array.from(root.querySelectorAll("*"))] as HTMLElement[];
  const win = root.ownerDocument.defaultView ?? window;
  const scrollable = all
    .filter((el) => {
      const style = win.getComputedStyle(el);
      return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    })
    .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
  if (!scrollable) {
    win.scrollBy({ top: dy });
    return `scrolled page to ${Math.round(win.scrollY)}`;
  }
  scrollable.scrollBy({ top: dy });
  return `scrolled to ${Math.round(scrollable.scrollTop)} of ${scrollable.scrollHeight - scrollable.clientHeight}`;
}

export function describeElement(el: Element): string {
  const text = (el.getAttribute("aria-label") ?? (el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  return `${el.tagName.toLowerCase()}${text ? ` "${text.slice(0, 60)}"` : ""}`;
}

export function editableIn(root: HTMLElement): Element | null {
  const active = root.ownerDocument.activeElement;
  if (active && root.contains(active) && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active as HTMLElement).isContentEditable)) {
    return active;
  }
  return root.querySelector("input:not([type=hidden]), textarea, [contenteditable=true]");
}
