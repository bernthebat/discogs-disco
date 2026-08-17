// collect_ratings.js  (OPTIONAL — slower, more requests)
//
// Community ratings aren't included in search results, so this needs
// one extra request per sampled release (GET /releases/{id}). Kept to
// a small sample per (style, year) to stay reasonable on rate limits.
// Tests the "market saturation -> lower ratings in peak years" idea
// in hypothesis 1.
//
// Usage:
//   DISCOGS_TOKEN=xxxx node collect_ratings.js
//
// Output:
//   out/ratings.csv — style,year,release_id,rating_avg,rating_count

import { discogsGet, DISCO_FAMILY_STYLES, YEARS, loadCache, saveCache } from "./config.js";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "fs";

const OUT_DIR = "out";
const CACHE_PATH = `${OUT_DIR}/ratings_cache.json`;
const CSV_PATH = `${OUT_DIR}/ratings.csv`;
const SAMPLE_PER_COMBO = 8; // releases sampled per (style, year) — raise if you have time/patience

mkdirSync(OUT_DIR, { recursive: true });
const cache = loadCache(CACHE_PATH);
if (!existsSync(CSV_PATH)) {
  writeFileSync(CSV_PATH, "style,year,release_id,rating_avg,rating_count\n");
}

function keyFor(style, year) {
  return `${style}||${year}`;
}

async function main() {
  const combos = [];
  for (const style of DISCO_FAMILY_STYLES) {
    for (const year of YEARS) combos.push({ style, year });
  }

  const todo = combos.filter((c) => !(keyFor(c.style, c.year) in cache));
  console.log(`${combos.length} combos, ${todo.length} remaining.`);
  console.log(
    `Each combo costs 1 search + up to ${SAMPLE_PER_COMBO} release lookups ` +
      `= ~${todo.length * (SAMPLE_PER_COMBO + 1)} requests, ` +
      `~${Math.ceil((todo.length * (SAMPLE_PER_COMBO + 1) * 1.1) / 60)} min.\n`
  );

  let done = 0;
  for (const { style, year } of todo) {
    const k = keyFor(style, year);
    try {
      const search = await discogsGet("/database/search", {
        type: "release",
        style,
        year,
        per_page: SAMPLE_PER_COMBO,
        page: 1,
      });
      const ids = (search?.results ?? []).map((r) => r.id).filter(Boolean);

      const rows = [];
      for (const id of ids) {
        const rel = await discogsGet(`/releases/${id}`, {});
        const avg = rel?.community?.rating?.average ?? "";
        const count = rel?.community?.rating?.count ?? "";
        rows.push({ id, avg, count });
        appendFileSync(CSV_PATH, `${csvSafe(style)},${year},${id},${avg},${count}\n`);
      }
      cache[k] = rows;
    } catch (err) {
      console.error(`  FAILED ${k}: ${err.message}`);
      cache[k] = null;
    }

    done++;
    if (done % 3 === 0 || done === todo.length) {
      console.log(`[${done}/${todo.length}] ${style} / ${year}`);
      saveCache(CACHE_PATH, cache);
    }
  }

  saveCache(CACHE_PATH, cache);
  console.log(`\nDone. Wrote ${CSV_PATH}`);
}

function csvSafe(s) {
  return String(s).includes(",") ? `"${s}"` : s;
}

main();
