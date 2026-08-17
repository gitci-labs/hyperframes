/**
 * Bake chosen variable values into an installed item's declared defaults.
 *
 * A block is mounted by a `<div data-composition-src>`, so `add --vars` can put
 * the values on that mount as `data-variable-values` and two mounts of the same
 * block can differ. A component has no mount element: it is markup you paste
 * into a host composition, and it reads its values through
 * `__hyperframes.getVariables()`, which merges the declared defaults of every
 * `[data-composition-variables]` element in the document with render-time
 * overrides.
 *
 * So for a component the only place a chosen value can live and survive being
 * pasted is the component's own declaration. Rewriting the defaults there is
 * what makes "customise it on the catalog page, copy the command, run it" end
 * with the look you picked. Before this, `--vars` was accepted, documented, and
 * silently discarded for every component in the catalog.
 */

interface VariableDeclaration {
  id?: unknown;
  type?: unknown;
  default?: unknown;
  options?: unknown;
  min?: unknown;
  max?: unknown;
}

export interface ApplyResult {
  /** The source with defaults rewritten. Unchanged when nothing applied. */
  html: string;
  /** Variable ids whose default was replaced. */
  applied: string[];
  /** Ids the item does not declare. */
  unknown: string[];
  /** Ids declared but given a value the declaration does not allow. */
  invalid: { id: string; reason: string }[];
}

const ATTR = "data-composition-variables";

/** Locate the attribute's quoted value, tolerating either delimiter. */
function findDeclaration(source: string): { start: number; end: number; raw: string } | null {
  const at = source.indexOf(`${ATTR}=`);
  if (at === -1) return null;
  const quote = source[at + ATTR.length + 1];
  if (quote !== "'" && quote !== '"') return null;
  const start = at + ATTR.length + 2;
  const end = source.indexOf(quote, start);
  if (end === -1) return null;
  return { start, end, raw: source.slice(start, end) };
}

function decode(raw: string): string {
  return raw.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** Mirrors the escaping the block-mount path uses, so either delimiter is safe. */
function encode(json: string, quote: string): string {
  return quote === "'" ? json.replace(/'/g, "&#39;") : json.replace(/"/g, "&quot;");
}

function optionValues(decl: VariableDeclaration): string[] | null {
  if (!Array.isArray(decl.options)) return null;
  return decl.options.map((o) =>
    o && typeof o === "object" && "value" in o
      ? String((o as { value: unknown }).value)
      : String(o),
  );
}

/**
 * Reject a value the declaration cannot represent, rather than writing it.
 *
 * A bad enum falls back to the default at runtime and warns, so writing one
 * here would produce a file that renders as if the value had been ignored --
 * which is the exact failure this function exists to remove.
 */
function rejectEnum(decl: VariableDeclaration, value: unknown): string | null {
  const opts = optionValues(decl);
  if (!opts) return null;
  return opts.includes(String(value)) ? null : `not one of ${opts.join(", ")}`;
}

function rejectNumber(decl: VariableDeclaration, value: unknown): string | null {
  if (decl.type !== "number") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "not a number";
  if (typeof decl.min === "number" && n < decl.min) return `below min ${decl.min}`;
  if (typeof decl.max === "number" && n > decl.max) return `above max ${decl.max}`;
  return null;
}

function reject(decl: VariableDeclaration, value: unknown): string | null {
  return rejectEnum(decl, value) ?? rejectNumber(decl, value);
}

export function applyVariableDefaults(
  source: string,
  values: Record<string, unknown>,
): ApplyResult {
  const ids = Object.keys(values);
  if (ids.length === 0) return { html: source, applied: [], unknown: [], invalid: [] };

  const found = findDeclaration(source);
  if (!found) return { html: source, applied: [], unknown: ids, invalid: [] };

  let declared: VariableDeclaration[];
  try {
    const parsed: unknown = JSON.parse(decode(found.raw));
    if (!Array.isArray(parsed)) return { html: source, applied: [], unknown: ids, invalid: [] };
    declared = parsed as VariableDeclaration[];
  } catch {
    // A declaration we cannot parse is one we must not rewrite.
    return { html: source, applied: [], unknown: ids, invalid: [] };
  }

  const applied: string[] = [];
  const invalid: { id: string; reason: string }[] = [];
  const byId = new Map(declared.map((d) => [String(d.id), d]));

  for (const [id, value] of Object.entries(values)) {
    const decl = byId.get(id);
    if (!decl) continue;
    const reason = reject(decl, value);
    if (reason) {
      invalid.push({ id, reason });
      continue;
    }
    decl.default = decl.type === "number" ? Number(value) : value;
    applied.push(id);
  }

  const unknown = ids.filter((id) => !byId.has(id));
  if (applied.length === 0) return { html: source, applied, unknown, invalid };

  // One declaration per line, matching how the registry authors these files, so
  // a re-install produces a readable diff rather than one enormous line.
  const quote = source[found.start - 1]!;
  const body = declared.map((d) => `    ${JSON.stringify(d)}`).join(",\n");
  const rewritten = encode(`[\n${body}\n  ]`, quote);
  const html = source.slice(0, found.start) + rewritten + source.slice(found.end);
  return { html, applied, unknown, invalid };
}
