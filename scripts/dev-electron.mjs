#!/usr/bin/env node
/**
 * Electron dev mode launcher
 * 1. Build renderer (Vite)
 * 2. Compile backend & Electron TypeScript
 * 3. Start Electron
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function run(cmd, label) {
  console.log(`\n── ${label} ──`);
  execSync(cmd, { stdio: "inherit" });
}

// 1. Build renderer (Vite)
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

// 2. Compile TypeScript
run("npx tsc -p tsconfig.build.json", "Compile backend");
run("npx tsc -p electron/tsconfig.json", "Compile electron main");
run("npx tsc -p electron/preload/tsconfig.json", "Compile electron preload (CJS)");

// 3. Start Electron
run("npx electron .", "Start Electron");
