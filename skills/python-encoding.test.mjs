// Skill Python scripts run on the user's own machine, Windows included. There, Python
// sizes stdio and text-mode file IO to the ANSI code page (cp1252) rather than UTF-8:
//
//   * printing a glyph cp1252 has no slot for (Δ, →) raises UnicodeEncodeError, which
//     is how `analyze-beatgrid.py --print` died on every Windows run;
//   * reading a UTF-8 source raises UnicodeDecodeError, or worse, decodes each byte to
//     the wrong character and the script silently keys off it.
//
// So every skill Python script pins UTF-8 explicitly. This test is the guard: the class
// of bug returns the moment one file IO call drops `encoding=` or a new script ships
// without the stdio block. Repo-internal dev scripts (packages/**) are out of scope —
// they only ever run on CI and maintainer machines.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const SKILLS_DIR = resolve(fileURLToPath(new URL("./", import.meta.url)));

function pythonScripts(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) found.push(...pythonScripts(abs));
    else if (entry.endsWith(".py")) found.push(abs);
  }
  return found;
}

const scripts = pythonScripts(SKILLS_DIR).map((abs) => ({
  rel: relative(SKILLS_DIR, abs),
  source: readFileSync(abs, "utf8"),
}));

describe("skill Python scripts pin UTF-8", () => {
  it("finds the scripts (guards against a layout change silently emptying this suite)", () => {
    assert.ok(scripts.length >= 5, `expected >=5 skill Python scripts, found ${scripts.length}`);
  });

  for (const { rel, source } of scripts) {
    it(`${rel} reconfigures stdio to UTF-8`, () => {
      assert.match(
        source,
        /reconfigure\(encoding="utf-8"\)/,
        'add the `for _stream in (sys.stdout, sys.stderr): ... reconfigure(encoding="utf-8")` block',
      );
    });

    it(`${rel} passes encoding= to every text-mode file IO call`, () => {
      // `open(x, "rb")` / `open(x, "wb")` are binary — no encoding applies. Everything
      // else that reads or writes text must name its encoding.
      const calls = [
        ...source.matchAll(/\b(?:open|read_text|write_text)\(((?:[^()]|\([^()]*\))*)\)/g),
      ];
      const offenders = calls
        .map((m) => m[0])
        .filter((call) => !/["']\w*b\w*["']/.test(call) && !/encoding\s*=/.test(call));
      assert.deepEqual(offenders, [], `text IO without encoding= in ${rel}`);
    });
  }
});
