#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fetchPublicJobs } from "../web/src/lib/core/public-job-feed.mjs";

const csv = (value, fallback) => String(value || fallback).split(",").map((item) => item.trim()).filter(Boolean);
const output = path.resolve(process.argv[2] || "cloud-scan-results.json");
const filters = {
  positive: csv(process.env.CAREER_OPS_SCAN_TITLES, "AI Engineer,Artificial Intelligence,Machine Learning,ML Engineer,Data Engineer,Data Scientist,Data Science,GenAI,Generative AI,LLM,RAG,Intern,Stage,Alternance"),
  negative: csv(process.env.CAREER_OPS_SCAN_EXCLUDE, "Senior,Staff,Principal,Director,Head of"),
  allow: csv(process.env.CAREER_OPS_SCAN_LOCATIONS, "France,Tours,Lille,Paris,Rabat,Salé,Morocco,Remote"),
  block: [],
  blockHard: [],
  alwaysAllow: ["Remote"],
  limitPerAts: Math.max(1, Math.min(Number(process.env.CAREER_OPS_SCAN_LIMIT) || 100, 100)),
};

try {
  const offers = await fetchPublicJobs(filters);
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Arbeitnow public feed",
    privacy: "No CV, profile, API key, or application state was uploaded.",
    filters,
    count: offers.length,
    offers,
  };
  fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Saved ${offers.length} public offers to ${output}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
