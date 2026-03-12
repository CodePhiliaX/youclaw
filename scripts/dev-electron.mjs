#!/usr/bin/env node
/**
 * Electron dev mode launcher
 * 1. Check native module ABI, rebuild only if mismatched
 * 2. Build renderer (Vite)
 * 3. Compile backend & Electron TypeScript
 * 4. Start Electron
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function run(cmd, label) {
  console.log(`\n── ${label} ──`);
  execSync(cmd, { stdio: "inherit" });
}

// 1. Check better-sqlite3 ABI
// Read Electron's Node ABI from its version file instead of spawning electron -e
const electronPkg = require("electron/package.json");
const electronMajor = parseInt(electronPkg.version.split(".")[0], 10);
// Electron major -> Node ABI mapping (Electron 28+=NODE_MODULE_VERSION 127, 30+=131, 32+=134, 33+=137, 34+=139, 35+=141, 36+=143)
const abiMap = { 28: 127, 29: 127, 30: 131, 31: 131, 32: 134, 33: 137, 34: 139, 35: 141, 36: 143, 37: 143, 38: 143, 39: 143, 40: 143 };
const electronABI = String(abiMap[electronMajor] ?? "unknown");

let currentABI;
try {
  // If better-sqlite3 loads fine, it matches the current Node ABI.
  // If it fails, parse the compiled ABI from the error message.
  currentABI = execSync(
    'node -e "try{require(\'better-sqlite3\');process.stdout.write(process.versions.modules)}catch(e){const m=e.message.match(/NODE_MODULE_VERSION (\\d+)/);process.stdout.write(m?m[1]:\'unknown\')}"',
    { encoding: "utf-8", timeout: 10000 }
  ).trim();
} catch {
  currentABI = "unknown";
}

if (currentABI === electronABI) {
  console.log(`\n── Native modules ── ABI ${electronABI} ✓`);
} else {
  run(
    "npx electron-rebuild --force -o better-sqlite3",
    `Rebuild native modules (${currentABI} → ${electronABI})`
  );
}

// 2. Build renderer (Vite)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDist = path.join(root, "web", "dist");
const rendererDist = path.join(root, "dist", "renderer");

execSync("npx vite build", { cwd: path.join(root, "web"), stdio: "inherit" });
if (fs.existsSync(rendererDist)) {
  fs.rmSync(rendererDist, { recursive: true });
}
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.renameSync(webDist, rendererDist);

// 3. Compile TypeScript
run("npx tsc -p tsconfig.build.json", "Compile backend");
run("npx tsc -p electron/tsconfig.json", "Compile electron main");
run("npx tsc -p electron/preload/tsconfig.json", "Compile electron preload (CJS)");

// 4. Start Electron
run("npx electron .", "Start Electron");
