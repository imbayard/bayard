// Pre-bundles netlify/functions-src/*.ts into fully self-contained files in
// netlify/functions/, with every dependency inlined (workspace packages AND plain
// npm packages like hono). Run as part of the root `build` script, before Netlify's
// own function-packaging step.
//
// Why: Netlify's built-in function bundler externalizes node_modules imports instead
// of inlining them, and in this pnpm workspace it doesn't reliably include those
// externals in the deployed zip — every dependency (workspace packages, then plain
// npm packages like `hono`) threw MODULE_NOT_FOUND at runtime despite a green build.
// Bundling ourselves, with esbuild pointed at the real on-disk pnpm node_modules,
// removes Netlify's resolution step from the critical path entirely: the output file
// has nothing left to resolve at deploy time.
import { build } from 'esbuild';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(root, 'netlify/functions-src');
const outDir = path.join(root, 'netlify/functions');

const entryPoints = readdirSync(srcDir)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => path.join(srcDir, f));

for (const entry of entryPoints) {
  const name = path.basename(entry, '.ts');
  const outfile = path.join(outDir, `${name}.mjs`);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // Node built-ins (node:*) stay external automatically under platform: 'node' —
    // those are provided by the runtime and are not part of this bug. Everything
    // else (workspace packages, hono, lru-cache, ...) gets inlined.
  });
  console.log(`bundled ${path.relative(root, entry)} -> ${path.relative(root, outfile)}`);
}
