// collect_cooccurrence.js
//
// For each (style, year), pulls one page of real search results
// (Discogs search results already include each release's `genre`
// and `style` arrays — no extra per-release fetch needed) and counts
// which OTHER styles/genres show up alongside the target style.
// This is the "transitional hybrid vs clean break" evidence for
// hypothesis 4 (post-disco genre family).
//
// Usage:
//   DISCOGS_TOKEN=xxxx node collect_cooccurrence.js
//
// Output:
//   out/cooccurrence.csv — style,year,co_style,co_count,sample_size

import { discogsGet, DISCO_FAMILY_STYLES, YEARS, loadCache, saveCache } from "./config.js";
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "fs";

const OUT_DIR = "out";
const CACHE_PATH = `${OUT_DIR}/cooccurrence_cache.json`;
const CSV_PATH = `${OUT_DIR}/cooccurrence.csv`;
const PER_PAGE = 50; // sample size per (style, year)

mkdirSync(OUT_DIR, { recursive: true });
const cache = loadCache(CACHE_PATH);
if (!existsSync(CSV_PATH)) {
  writeFileSync(CSV_PATH, "style,year,co_style,co_count,sample_size\n");
}

function keyFor(style, year) {
  return `${style}||${year}`;
}

async function fetchSample(style, year) {
  const data = await discogsGet("/database/search", {
    type: "release",
    style,
    year,
    per_page: PER_PAGE,
    page: 1,
  });
  return data?.results ?? [];
}

async function main() {
  const combos = [];
  for (const style of DISCO_FAMILY_STYLES) {
    for (const year of YEARS) combos.push({ style, year });
  }

  const todo = combos.filter((c) => !(keyFor(c.style, c.year) in cache));
  console.log(`${combos.length} combos, ${todo.length} remaining.\n`);

  let done = 0;
  for (const { style, year } of todo) {
    const k = keyFor(style, year);
    try {
      const results = await fetchSample(style, year);
      const tally = new Map();
      for (const r of results) {
        const styles = new Set([...(r.style || []), ...(r.genre || [])]);
        styles.delete(style);
        for (const s of styles) tally.set(s, (tally.get(s) || 0) + 1);
      }
      cache[k] = { sample_size: results.length, tally: Object.fromEntries(tally) };

      for (const [coStyle, count] of tally.entries()) {
        appendFileSync(
          CSV_PATH,
          `${csvSafe(style)},${year},${csvSafe(coStyle)},${count},${results.length}\n`
        );
      }
    } catch (err) {
      console.error(`  FAILED ${k}: ${err.message}`);
      cache[k] = null;
    }

    done++;
    if (done % 5 === 0 || done === todo.length) {
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
