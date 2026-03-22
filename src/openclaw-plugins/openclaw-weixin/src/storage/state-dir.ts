// @ts-nocheck
import path from "node:path";
import { getPaths } from "../../../../config/paths.ts";

/** Resolve the compatibility state directory under YouClaw's writable data root. */
export function resolveStateDir(): string {
  try {
    return path.join(getPaths().data, "openclaw-compat");
  } catch {
    const dataDir = process.env.DATA_DIR?.trim();
    return dataDir
      ? path.resolve(dataDir, "openclaw-compat")
      : path.resolve("/tmp", "youclaw-openclaw-compat");
  }
}
