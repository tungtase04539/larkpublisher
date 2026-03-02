/**
 * Build script for standalone Windows EXE
 * 
 * Steps:
 * 1. Build frontend with Vite → dist/public/
 * 2. Bundle server with esbuild (ALL deps included) → dist/server.cjs
 * 3. Package with pkg → dist/LarkPublisher.exe
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

function run(cmd, label) {
  console.log(`\n🔨 ${label}...`);
  console.log(`   $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
  console.log(`   ✅ Done`);
}

// 1. Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 2. Build frontend
run("npx vite build", "Building frontend (Vite)");

// 3. Bundle server to CJS with runtime dependencies included
// Externalize dev/build-time native modules that aren't needed at runtime
const externalPkgs = [
  "vite", "lightningcss", "@tailwindcss/*", "tailwindcss",
  "esbuild", "@babel/*", "postcss", "autoprefixer",
  "@vitejs/*", "rollup", "@builder.io/*", "vite-plugin-manus-runtime",
  "drizzle-kit", "prettier", "tsx", "typescript",
].map(p => `--external:${p}`).join(" ");

run(
  `npx esbuild server/_core/index.ts --platform=node --bundle --format=cjs --outfile=dist/server.cjs --define:import.meta.dirname=__dirname --define:import.meta.url=__filename ${externalPkgs}`,
  "Bundling server with runtime deps (esbuild → CJS)"
);

// 4. Package with pkg
run(
  `npx pkg dist/server.cjs --targets node20-win-x64 --output dist/LarkPublisher.exe --options max-old-space-size=4096`,
  "Packaging executable (pkg)"
);

console.log(`\n🎉 Build complete!`);
console.log(`   Output: dist/LarkPublisher.exe`);
console.log(`   Copy dist/public/ folder alongside the exe`);
console.log(`   Create .env file with LARK_APP_ID and LARK_APP_SECRET next to the exe`);
