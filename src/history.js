// Persists every run to output/runs/ so past results are never overwritten,
// and reloads recent runs so the dashboard can offer a "saved runs" switcher.
// Each run is one JSON file: { id, generatedAt, depth, summary, rows }.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Sortable, filesystem-safe id, e.g. "20260715-142033". */
function makeRunId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Save one run to output/runs/<id>.json.
 * @returns {Promise<{id:string, generatedAt:string, depth:string}>}
 */
export async function saveRun({ rows, summary, outputDir }) {
  const runsDir = resolve(outputDir, 'runs');
  await mkdir(runsDir, { recursive: true });

  const id = makeRunId();
  const entry = {
    id,
    generatedAt: summary.generatedAt,
    depth: summary.depth || 'medium',
    summary,
    rows,
  };

  await writeFile(resolve(runsDir, `${id}.json`), `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  return entry;
}

/**
 * Load the most recent saved runs (newest first), including the one just
 * saved by saveRun(). Corrupt/unreadable files are skipped rather than
 * failing the whole run.
 *
 * @param {string} outputDir
 * @param {number} limit max runs to load (bounds dashboard HTML size)
 * @returns {Promise<Array>} [{ id, generatedAt, depth, summary, rows }, ...]
 */
export async function loadRecentRuns(outputDir, limit = 12) {
  const runsDir = resolve(outputDir, 'runs');
  let files;
  try {
    files = await readdir(runsDir);
  } catch {
    return [];
  }

  const ids = files
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort()
    .reverse()
    .slice(0, limit);

  const runs = [];
  for (const id of ids) {
    try {
      const raw = await readFile(resolve(runsDir, `${id}.json`), 'utf8');
      runs.push(JSON.parse(raw));
    } catch (err) {
      console.warn(`  ! Skipping unreadable run history file ${id}.json: ${err.message}`);
    }
  }
  return runs;
}
