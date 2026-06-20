// Helpers that pull the real data structures out of index.html so the tests
// exercise what actually ships, not a hand-copied fixture. eval() is used only
// on our own source file, in-process, never on external input.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const HTML = readFileSync(join(ROOT, "index.html"), "utf8");

/** Extract `const <name>=<literal>;` and eval the literal. */
function extractAssignment(name) {
  const start = HTML.indexOf(`const ${name}=`);
  if (start < 0) throw new Error(`Could not find const ${name}= in index.html`);
  // Find the matching end by scanning balanced brackets from the first [ or {.
  const from = start + `const ${name}=`.length;
  const open = HTML[from];
  const close = open === "[" ? "]" : "}";
  let depth = 0,
    i = from,
    inStr = null;
  for (; i < HTML.length; i++) {
    const c = HTML[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const src = HTML.slice(from, i);
  // eslint-disable-next-line no-eval
  return eval("(" + src + ")");
}

export const M = extractAssignment("M");
export const I = extractAssignment("I");
export const GROUPS = extractAssignment("GROUPS");
export const TEAM_INFO = extractAssignment("TEAM_INFO");
export const VENUES = extractAssignment("VENUES");
export const COORDS = extractAssignment("COORDS");

/** Pull the alias map (`const al={...}`) out of the in-page normTeam. */
export function extractInPageAliases() {
  const idx = HTML.indexOf("const al={");
  if (idx < 0) throw new Error("Could not find const al={ in index.html");
  const from = idx + "const al=".length;
  let depth = 0,
    i = from,
    inStr = null;
  for (; i < HTML.length; i++) {
    const c = HTML[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") inStr = c;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  // eslint-disable-next-line no-eval
  return eval("(" + HTML.slice(from, i) + ")");
}

export const FIXTURES = JSON.parse(readFileSync(join(ROOT, "fixtures.json"), "utf8"));
