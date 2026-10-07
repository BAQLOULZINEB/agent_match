import test from "node:test";
import assert from "node:assert/strict";
import { filterPublicJobs } from "../../src/lib/core/public-job-feed.mjs";

const filters = {
  positive: ["AI Engineer", "Data Engineer"],
  negative: ["Senior", "Director"],
  allow: ["France", "Lille", "Rabat", "Morocco"],
  block: [],
  blockHard: [],
  alwaysAllow: [],
  limitPerAts: 50,
};

test("public feed keeps relevant junior roles in the target geography", () => {
  const offers = filterPublicJobs([
    { title: "AI Engineer Intern", company_name: "Acme", location: "Lille, France", url: "https://example.test/1", created_at: 1791320000 },
    { title: "Senior AI Engineer", company_name: "Acme", location: "Paris, France", url: "https://example.test/2" },
    { title: "Data Engineer", company_name: "Other", location: "Berlin, Germany", url: "https://example.test/3" },
  ], filters);

  assert.deepEqual(offers.map((offer) => offer.url), ["https://example.test/1"]);
  assert.equal(offers[0].ats, "public-feed");
  assert.equal(offers[0].matchedKeyword, "AI Engineer");
});

test("public feed preserves unknown locations for manual review", () => {
  const offers = filterPublicJobs([
    { title: "Data Engineer", company_name: "Acme", location: "", url: "https://example.test/4" },
  ], filters);
  assert.equal(offers.length, 1);
});
