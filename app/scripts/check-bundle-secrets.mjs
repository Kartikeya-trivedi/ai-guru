/**
 * Fails the build if a secret reached the shipped bundle.
 *
 * This is not hypothetical. `vite build` inlines env vars matching
 * `envPrefix`, and that config listed the key prefixes unconditionally — so a
 * real release build embedded the developer's own GEMINI_API_KEY in
 * dist/assets/*.js, and Tauri compressed it straight into the installer.
 * Every customer would have received a working key billed to us, and the
 * compression means a casual scan of the .exe shows nothing.
 *
 * The vite config is fixed, but a config comment is not a guarantee: one
 * careless edit reintroduces it silently. This makes it loud.
 *
 * Runs as part of `npm run build`, so it gates `tauri build` too.
 *
 * Usage: node scripts/check-bundle-secrets.mjs [distDir]
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, "..");
const dist = process.argv[2] ?? join(APP, "dist");

/** Every value from .env — whatever the developer actually holds locally. */
function envSecrets() {
  const path = join(APP, ".env");
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "").trim();
    // Short values would false-positive on ordinary code.
    if (value.length >= 12) out.push({ name: m[1], value });
  }
  return out;
}

/**
 * Shapes that are secrets regardless of what's in .env — catches a key
 * hardcoded by hand, or a teammate's key this machine has never seen.
 */
const PATTERNS = [
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "xAI key", re: /\bxai-[0-9A-Za-z]{20,}\b/g },
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "ElevenLabs key", re: /\bsk_[0-9a-f]{40,}\b/g },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(js|mjs|cjs|css|html|json|map)$/i.test(entry)) out.push(p);
  }
  return out;
}

if (!existsSync(dist)) {
  console.error(`check-bundle-secrets: no bundle at ${dist} — run the build first.`);
  process.exit(1);
}

const secrets = envSecrets();
const files = walk(dist);
const hits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");

  for (const s of secrets) {
    if (text.includes(s.value)) {
      hits.push({ file, what: `${s.name} (exact value from .env)` });
    }
  }
  for (const p of PATTERNS) {
    const found = text.match(p.re);
    if (found) {
      for (const f of new Set(found)) {
        hits.push({ file, what: `${p.name}: ${f.slice(0, 8)}…${f.slice(-4)}` });
      }
    }
  }
}

const rel = (f) => f.replace(APP, "app");

if (hits.length > 0) {
  console.error("\n  SECRET FOUND IN THE SHIPPABLE BUNDLE — build refused\n");
  for (const h of hits) console.error(`   ${rel(h.file)}\n     ${h.what}`);
  console.error(
    [
      "",
      "  This would ship a working credential to every customer.",
      "  Most likely cause: vite.config.ts exposing a key prefix to `vite build`.",
      "  envPrefix must include key prefixes for the dev server only (command === 'serve').",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  `check-bundle-secrets: clean (${files.length} files, ${secrets.length} local secret${secrets.length === 1 ? "" : "s"} checked + ${PATTERNS.length} patterns)`,
);
