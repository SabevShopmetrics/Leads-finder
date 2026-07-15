#!/usr/bin/env node
// SilexBrand Lead Scout — CLI entry point.
//
// Pipeline:
//   1. load config (.env key + queries.json + district expansion)
//   2. build the search plan (each query × districts) to find MORE
//   3. Text Search every plan item (paginated, rate-limited, retried)
//   4. normalize + dedupe by place id (merging matched niches)
//   5. score each business 1–100 per criterion → weighted overall + tier + category
//   6. sort by overall desc, write CSV + JSON + HTML dashboard to /output
//   7. print a summary (by tier and by category)
//
// Uses the official Google Places API (New) only — no HTML scraping.

import { loadConfig } from './config.js';
import { textSearch } from './apiClient.js';
import { normalizePlace, dedupe } from './collector.js';
import { CRITERIA, scoreBusiness, formatCriteria } from './scorer.js';
import { writeOutputs } from './writer.js';
import { writeDashboard } from './dashboard.js';
import { saveRun, loadRecentRuns } from './history.js';

/** Expand each {niche, query} into base + per-district variants to find more. */
function buildSearchPlan(config) {
  const plan = [];
  for (const { niche, query } of config.queries) {
    plan.push({ niche, query, area: 'city-wide' });
    if (config.expandDistricts) {
      for (const d of config.districts) {
        plan.push({ niche, query: `${query} ${d}`, area: d });
      }
    }
  }
  return plan;
}

async function main() {
  console.log('SilexBrand Lead Scout — Google Places (New) v1\n');

  const config = await loadConfig();
  const plan = buildSearchPlan(config);

  console.log(
    `Depth: ${config.depth} (${config.depthDescription})`
  );
  console.log(
    `${config.queries.length} queries` +
      (config.expandDistricts ? ` × ${config.districts.length} districts (+city-wide)` : '') +
      ` = ${plan.length} searches. Cap ${config.maxResultsPerQuery}/search, ` +
      `delay ${config.requestDelayMs}ms, lang=${config.languageCode}, region=${config.regionCode}.`
  );
  console.log('  (switch depth with --depth=short|medium|deep, e.g. npm run scout:deep)\n');

  // 1–3. Collect raw places for every plan item. `normalized` lives in this
  // closure so both a normal finish AND an early stop (quota exhausted,
  // Ctrl+C) can write out whatever was collected — a run is never fully lost.
  const normalized = [];
  let rawCount = 0;
  let stopReason = null; // set when we stop before the plan finishes

  let finishing = false;
  const finishRun = async () => {
    if (finishing) return; // guard against double-write (SIGINT racing normal completion)
    finishing = true;
    await writeResults({ normalized, rawCount, plan, config, stopReason });
  };

  // Ctrl+C mid-run would otherwise throw away everything collected so far —
  // save it instead.
  process.once('SIGINT', () => {
    console.log('\n\n⚠ Interrupted — saving the results collected so far…');
    stopReason = stopReason || 'stopped early: interrupted by user (Ctrl+C)';
    finishRun()
      .catch((err) => console.error(`✗ Failed to save partial results: ${err.message}`))
      .finally(() => process.exit(0));
  });

  for (const [i, { niche, query }] of plan.entries()) {
    console.log(`[${i + 1}/${plan.length}] "${query}" (${niche})`);
    try {
      const places = await textSearch(query, config);
      rawCount += places.length;
      if (places.length === 0) console.log('    · no results.');
      for (const place of places) normalized.push(normalizePlace(place, niche));
    } catch (err) {
      if (err.quotaExhausted) {
        // Every remaining query would fail identically until the quota
        // resets — stop now and save what we already have instead of
        // grinding through the rest of the plan for nothing.
        console.warn(`    ✗ ${err.message}`);
        console.warn(
          `    ⚠ Daily Places API quota exhausted — stopping early and saving the ` +
            `${normalized.length} businesses collected so far (${i + 1}/${plan.length} searches run).`
        );
        stopReason = 'stopped early: Google Places daily quota exhausted';
        break;
      }
      // One bad query shouldn't sink the whole run.
      console.warn(`    ✗ search failed: ${err.message}`);
    }

    if (i < plan.length - 1) {
      await new Promise((r) => setTimeout(r, config.requestDelayMs));
    }
  }

  await finishRun();
}

/** Dedupe, score, sort, write CSV/JSON/dashboard/history, and print the summary. */
async function writeResults({ normalized, rawCount, plan, config, stopReason }) {
  // 4. Dedupe by place id.
  const deduped = dedupe(normalized);
  console.log(`\nCollected ${rawCount} raw rows → ${deduped.length} unique businesses.`);

  // 5. Score (1–100 per criterion → overall + tier + category).
  const scored = deduped.map((biz) => ({ biz, ...scoreBusiness(biz) }));

  // 6. Sort by overall desc (tie-break: web opportunity, reviews, name).
  scored.sort((a, b) => {
    if (b.overall !== a.overall) return b.overall - a.overall;
    if (b.criteria.web_opportunity !== a.criteria.web_opportunity) {
      return b.criteria.web_opportunity - a.criteria.web_opportunity;
    }
    const ra = a.biz.reviewCount ?? 0;
    const rb = b.biz.reviewCount ?? 0;
    if (rb !== ra) return rb - ra;
    return a.biz.business.localeCompare(b.biz.business);
  });

  const rows = scored.map(buildRow);

  // Aggregates for the summary + dashboard.
  const byTier = tally(rows, (r) => r.tier);
  const byCategory = tally(rows, (r) => r.category);
  const noWebsite = rows.filter((r) => r.hasWebsite === 'no').length;
  const hot = rows.filter((r) => r.tier === 'A').length;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;

  const summary = {
    rawCount,
    unique: rows.length,
    noWebsite,
    hot,
    avg,
    byTier,
    byCategory,
    criteria: CRITERIA,
    searches: plan.length,
    depth: config.depth,
    depthDescription: config.depthDescription,
    partial: Boolean(stopReason),
    stopReason,
    generatedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  };

  const { csvPath, jsonPath } = await writeOutputs(rows, config.outputDir);

  // Save this run permanently (never overwritten) and reload recent runs so
  // the dashboard can offer a "saved runs" switcher over past results.
  await saveRun({ rows, summary, outputDir: config.outputDir });
  const history = await loadRecentRuns(config.outputDir);

  const dashboardPath = await writeDashboard(rows, summary, config.outputDir, history);

  // 7. Summary.
  console.log('\n──────── Summary ────────');
  if (stopReason) console.log(`⚠ Partial run          : ${stopReason}`);
  console.log(`Depth                 : ${config.depth}`);
  console.log(`Searches run          : ${plan.length}`);
  console.log(`Raw results fetched   : ${rawCount}`);
  console.log(`Unique businesses     : ${rows.length}`);
  console.log(`Without a website     : ${noWebsite}`);
  console.log(`Average lead score    : ${avg}/100`);
  console.log(
    `Tiers                 : ` +
      `A/Hot ${byTier.A || 0} · B/Warm ${byTier.B || 0} · C/Nurture ${byTier.C || 0} · D/Cold ${byTier.D || 0}`
  );
  console.log(
    `Categories            : ` +
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(([c, n]) => `${c} ${n}`)
        .join(' · ')
  );
  console.log('─────────────────────────');
  console.log(`CSV      : ${csvPath}`);
  console.log(`JSON     : ${jsonPath}`);
  console.log(`Dashboard: ${dashboardPath}  ← open this in a browser`);

  if (rows.length > 0) {
    console.log('\nTop leads:');
    for (const r of rows.slice(0, Math.min(10, rows.length))) {
      console.log(
        `  ${String(r.score).padStart(3)}  [${r.tier}] ${r.category.padEnd(12)} ` +
          `${r.business}${r.hasWebsite === 'no' ? '  · no site' : ''}`
      );
    }
  }
}

function tally(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** Flatten a scored record into the output row shape (matches CSV columns). */
function buildRow({ biz, overall, tier, tierLabel, category, criteria }) {
  const row = {
    business: biz.business,
    category,
    niches: [...biz.niches].join('; '),
    score: overall,
    tier,
    tierLabel,
  };
  // One column per criterion (e.g. score_web_opportunity: 100).
  for (const { key } of CRITERIA) row[`score_${key}`] = criteria[key];
  return {
    ...row,
    criteriaSummary: formatCriteria(criteria),
    hasWebsite: biz.website ? 'yes' : 'no',
    website: biz.website,
    phone: biz.phone,
    rating: biz.rating ?? '',
    reviewCount: biz.reviewCount ?? '',
    mapsUri: biz.mapsUri,
    address: biz.address,
    businessStatus: biz.businessStatus,
    primaryType: biz.primaryType,
    // Machine-readable per-criterion scores for the JSON output.
    criteria,
    placeId: biz.id,
  };
}

main().catch((err) => {
  console.error(`\n✗ Fatal: ${err.message}`);
  process.exitCode = 1;
});
