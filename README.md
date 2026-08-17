# Did disco die in 1979? — a Discogs data study

Tools to test the "disco died" myth against Discogs' release metadata,
organized around the five sub-hypotheses in the brief:

1. Commercial overreach/exhaustion — peak-then-crash in release counts
2. Culture-war backlash/rebranding — US tag shift away from "Disco"
3. Geographic divergence — Europe holding on while the US drops
4. Post-disco evolution — Hi-NRG/Boogie/Italo-Disco/House rising, and
   co-occurring with Disco (hybrid, not clean break)
5. Rock/new wave/metal/hip-hop "takeover" — do challenger styles rise
   as disco falls, worldwide

## Setup

1. Get a Discogs personal access token: discogs.com/settings/developers
   → "Generate new token." Free, instant.
2. Install Node.js 18 or newer (scripts use the built-in `fetch`, no
   npm packages required).
3. `cd discogs-disco-study`

## 1. Run the time-series collector (do this first)

```
DISCOGS_TOKEN=your_token_here node collect_timeseries.js
```

For every combination of style × year × country it makes one request
to `/database/search` with `per_page=1` and reads `pagination.items`
— the total match count — rather than downloading actual releases.
That keeps this cheap: ~1,400 requests for the default scope
(8 disco-family styles + 4 "challenger" styles × 21 years × 6
country options), roughly 25–30 minutes at Discogs' rate limit.

- Safe to `Ctrl+C` and rerun — it caches finished combos in
  `out/timeseries_cache.json` and only fetches what's missing.
- Writes `out/timeseries.csv` (`style,country,year,count`), append-only.
- Edit `DISCO_FAMILY_STYLES`, `CHALLENGER_STYLES`, `YEARS`, `COUNTRIES`
  in `config.js` to narrow or widen scope before running.

## 2. Run the co-occurrence sampler (hypothesis 4)

```
DISCOGS_TOKEN=your_token_here node collect_cooccurrence.js
```

For each (style, year), pulls one page of 50 real search results —
which already include each release's `genre`/`style` arrays, no extra
per-release calls needed — and tallies which other tags show up
alongside it. Writes `out/cooccurrence.csv`
(`style,year,co_style,co_count,sample_size`).

## 3. (Optional, slower) Run the ratings sampler

```
DISCOGS_TOKEN=your_token_here node collect_ratings.js
```

Community ratings live on the release detail endpoint, not in search
results, so this costs one extra request per sampled release (default
8 releases per style/year — edit `SAMPLE_PER_COMBO` in the script to
change that). Writes `out/ratings.csv`. Use this to check whether
peak years show more low-rated/low-engagement releases (market
saturation) versus leaner, more durable post-disco output.

## 4. Explore the results

Open `dashboard.html` directly in a browser (no server needed) and
load `out/timeseries.csv` and `out/cooccurrence.csv` via the file
pickers at the top. It renders:

- Worldwide release counts per style, toggle which styles to show
- A chosen style's release counts by country (US/UK vs. Italy/Germany/Spain)
- Disco vs. New Wave/Punk/Heavy Metal/Hip Hop, worldwide
- What styles/genres were actually co-tagged with "Disco" in a given
  year, from the sampled data

It's a static file — reopen it any time as you collect more data, or
send me the CSVs and I can help interpret patterns, adjust the style
list, or extend the analysis (e.g. per-label/format breakdowns).

## Notes on data quality

- Discogs is community-contributed. Coverage and tagging consistency
  vary a lot by era, genre, and region — treat counts as a relative
  trend signal, not a census of everything actually released.
- Style/genre tag names must match Discogs' exact facet strings.
  The defaults in `config.js` are the commonly used ones, but it's
  worth spot-checking a few (e.g. browse
  `discogs.com/search/?style=Hi+NRG`) if a series looks suspiciously
  flat at zero.
- "Hip Hop" is a top-level Discogs *genre*, not a *style* — the
  scripts already special-case this so the query uses `genre=Hip Hop`
  instead of `style=Hip Hop`.
