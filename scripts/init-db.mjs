#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getCareerOpsRoot } from "../path-resolver.mjs";

const codeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = getCareerOpsRoot();
const dataDir = path.join(dataRoot, "data");
const tracker = path.join(dataDir, "applications.md");

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(tracker)) {
  fs.writeFileSync(
    tracker,
    "# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n",
    { encoding: "utf8", flag: "wx" },
  );
  console.log(`Created ${tracker}`);
}

const result = spawnSync(process.execPath, [path.join(codeRoot, "tracker.mjs"), "sync"], {
  cwd: codeRoot,
  env: { ...process.env, CAREER_OPS_ROOT: dataRoot, CAREER_OPS_DATA_DIR: dataRoot },
  stdio: "inherit",
});
process.exitCode = result.status ?? 1;
