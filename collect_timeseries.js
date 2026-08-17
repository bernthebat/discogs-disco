// collect_timeseries.js
//
// Builds a style x year x country release-count time series using
// Discogs' `pagination.items` total (one cheap request per combo,
// per_page=1, we never actually read the release list).
//
// Usage:
//   DISCOGS_TOKEN=xxxx node collect_timeseries.js
//
// Output:
//   out/timeseries.csv   — style,country,year,count
//   out/timeseries_cache.json — resumable cache (safe to Ctrl+C and rerun)

import { discogsGet, ALL_STYLES, CHALLENGER_STYLES, YEARS, COUNTRIES, loadCache, saveCache } from "./config.js";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "fs";

const OUT_DIR = "out";
const CACHE_PATH = `${OUT_DIR}/timeseries_cache.json`;
const CSV_PATH = `${OUT_DIR}/timeseries.csv`;

mkdirSync(OUT_DIR, { recursive: true });

const cache = loadCache(CACHE_PATH);

if (!existsSync(CSV_PATH)) {
  writeFileSync(CSV_PATH, "style,country,year,count\n");
}

function keyFor(style, country, year) {
  return `${style}||${country}||${year}`;
}

async function fetchCount(style, country, year) {
  // "Hip Hop" is a top-level Discogs GENRE, not a style — query accordingly.
  const params = { type: "release", year, per_page: 1 };
  if (style === "Hip Hop") {
    params.genre = "Hip Hop";
  } else {
    params.style = style;
  }
  if (country) params.country = country;

  const data = await discogsGet("/database/search", params);
  return data?.pagination?.items ?? 0;
}

async function main() {
  const combos = [];
  for (const style of ALL_STYLES) {
    for (const country of COUNTRIES) {
      for (const year of YEARS) {
        combos.push({ style, country, year });
      }
    }
  }

  const todo = combos.filter((c) => !(keyFor(c.style, c.country, c.year) in cache));
  console.log(`${combos.length} total combos, ${todo.length} remaining (${combos.length - todo.length} cached).`);
  console.log(`Estimated time: ~${Math.ceil((todo.length * 1.1) / 60)} min at current rate limit.\n`);

  let done = 0;
  for (const { style, country, year } of todo) {
    const k = keyFor(style, country, year);
    try {
      const count = await fetchCount(style, country, year);
      cache[k] = count;
      appendFileSync(CSV_PATH, `${csvSafe(style)},${csvSafe(country || "ALL")},${year},${count}\n`);
    } catch (err) {
      console.error(`  FAILED ${k}: ${err.message}`);
      cache[k] = null; // mark attempted, won't retry automatically — rerun to retry nulls if you want
    }

    done++;
    if (done % 10 === 0 || done === todo.length) {
      console.log(`[${done}/${todo.length}] ${style} / ${country || "ALL"} / ${year} -> ${cache[k]}`);
      saveCache(CACHE_PATH, cache); // periodic checkpoint
    }
  }

  saveCache(CACHE_PATH, cache);
  console.log(`\nDone. Wrote ${CSV_PATH}`);
}

function csvSafe(s) {
  return String(s).includes(",") ? `"${s}"` : s;
}

main();
