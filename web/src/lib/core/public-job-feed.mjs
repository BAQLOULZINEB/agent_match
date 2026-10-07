const FEED_URL = "https://www.arbeitnow.com/api/job-board-api";

const fold = (value) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();

function contains(haystack, needle) {
  const n = fold(needle);
  if (!n) return false;
  return (` ${fold(haystack)} `).includes(` ${n} `) || fold(haystack).includes(n.length > 3 ? n : ` ${n} `);
}

function dateOnly(value) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function passesLocation(location, filters) {
  const hard = filters.blockHard ?? [];
  if (hard.some((term) => contains(location, term))) return false;
  const always = filters.alwaysAllow ?? [];
  if (always.some((term) => contains(location, term))) return true;
  const blocked = filters.block ?? [];
  if (blocked.some((term) => contains(location, term))) return false;
  const allowed = filters.allow ?? [];
  // Match career-ops' non-strict location behavior: an absent location remains
  // reviewable, while an explicit out-of-scope location is rejected.
  return !allowed.length || !fold(location) || allowed.some((term) => contains(location, term));
}

export function filterPublicJobs(jobs, filters) {
  const positive = filters.positive ?? [];
  const negative = filters.negative ?? [];
  const limit = Math.max(1, Math.min(Number(filters.limitPerAts) || 50, 100));
  const seen = new Set();
  const offers = [];

  for (const job of Array.isArray(jobs) ? jobs : []) {
    const title = String(job?.title ?? "").trim();
    const url = String(job?.url ?? "").trim();
    const company = String(job?.company_name ?? job?.company ?? "").trim();
    const location = String(job?.location ?? "").trim();
    if (!title || !url || !company || seen.has(url)) continue;
    if (positive.length && !positive.some((term) => contains(title, term))) continue;
    if (negative.some((term) => contains(title, term))) continue;
    if (!passesLocation(location, filters)) continue;

    seen.add(url);
    offers.push({
      company,
      title,
      location,
      postedAt: dateOnly(job?.created_at ?? job?.published_at),
      ats: "public-feed",
      source: "Arbeitnow public feed",
      url,
      matchedKeyword: positive.find((term) => contains(title, term)),
      note: "Public feed result; verify eligibility and posting details before applying.",
    });
    if (offers.length >= limit) break;
  }
  return offers;
}

export async function fetchPublicJobs(filters, fetchImpl = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImpl(FEED_URL, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Public feed returned ${response.status}.`);
    const payload = await response.json();
    return filterPublicJobs(payload?.data, filters);
  } finally {
    clearTimeout(timer);
  }
}
