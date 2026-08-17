// config.js — shared settings + a throttled Discogs API client.
//
// Edit the arrays below to change scope. Style/genre names must match
// Discogs' exact facet strings (case + hyphenation matter). You can
// verify a name by browsing https://www.discogs.com/search/?style=Disco
// and checking the URL Discogs builds, or by inspecting facet values
// in a search results page.

export const TOKEN = process.env.DISCOGS_TOKEN;

if (!TOKEN) {
  console.error(
    "Missing DISCOGS_TOKEN. Get one at https://www.discogs.com/settings/developers\n" +
    "then run e.g.  DISCOGS_TOKEN=xxxx node collect_timeseries.js"
  );
  process.exit(1);
}

// --- Scope ---------------------------------------------------------

// Core disco / post-disco family (hypotheses 1, 2, 4)
export const DISCO_FAMILY_STYLES = [
  "Disco",
  "Italo-Disco",
  "Hi NRG",
  "Euro-Disco",
  "Boogie",
  "Dance-Pop",
  "House",
  "Techno",
];

// "Disco killed by rock/new wave/hip-hop" family (hypothesis 5)
export const CHALLENGER_STYLES = [
  "New Wave",
  "Punk",
  "Heavy Metal",
  "Hip Hop", // NB: on Discogs this is actually GENRE=Hip Hop, handled specially below
];

export const ALL_STYLES = [...DISCO_FAMILY_STYLES, ...CHALLENGER_STYLES];

// Years to sweep. Disco's rise/fall is usually placed ~1973-1982;
// extend to 1990 to capture the post-disco / house / hi-NRG tail.
export const YEARS = range(1970, 1990);

// "" = worldwide (no country filter). Add/remove as needed.
// US/UK = the "death" narrative markets. Italy/Germany/Spain = the
// "it never died in Europe" comparison markets.
export const COUNTRIES = ["", "US", "UK", "Italy", "Germany", "Spain"];

function range(a, b) {
  const out = [];
  for (let y = a; y <= b; y++) out.push(y);
  return out;
}

// --- Throttled Discogs client ---------------------------------------

const BASE = "https://api.discogs.com";
const USER_AGENT = "DiscoDeathStudy/1.0 +https://github.com/your-username"; // Discogs requires a UA

let lastRequestAt = 0;
const MIN_GAP_MS = 1100; // ~54 req/min, safely under the 60/min authenticated limit

async function throttle() {
  const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * GET a Discogs API path with query params. Retries on 429/5xx.
 * Returns parsed JSON.
 */
export async function discogsGet(path, params = {}, { retries = 5 } = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle();
    let res;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Authorization: `Discogs token=${TOKEN}`,
        },
      });
    } catch (err) {
      // network hiccup — back off and retry
      await sleep(2000 * (attempt + 1));
      continue;
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 5;
      console.warn(`  rate limited, waiting ${retryAfter}s...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (res.status >= 500) {
      await sleep(2000 * (attempt + 1));
      continue;
    }

    if (!res.ok) {
      throw new Error(`Discogs API ${res.status} ${res.statusText} for ${url}`);
    }

    return res.json();
  }
  throw new Error(`Gave up after ${retries} retries: ${url}`);
}

// --- Small resumable cache (JSON file keyed by request signature) ---

import { readFileSync, writeFileSync, existsSync } from "fs";

export function loadCache(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

export function saveCache(path, cache) {
  writeFileSync(path, JSON.stringify(cache));
}
