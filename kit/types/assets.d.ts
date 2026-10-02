declare module "*.css";
declare module "@fontsource-variable/*";

interface ImportMeta {
  glob<T>(pattern: string | string[], options?: { eager?: false }): Record<string, () => Promise<T>>;
}

declare module "*.md?raw" {
  const text: string;
  export default text;
}

declare module "*.woff2" {
  const url: string;
  export default url;
}

declare module "virtual:donut-widget-runtime" {
  const runtime: { script: string; style: string };
  export default runtime;
}

declare module "*?url" {
  const url: string;
  export default url;
}

declare module "virtual:donut-plugin-runtime" {
  const runtime: { script: string; style: string };
  export default runtime;
}
