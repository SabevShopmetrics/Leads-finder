// Loads runtime configuration: the API key from the environment and the search
// queries from queries.json. No secrets are ever hardcoded here.

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

/**
 * Load key=value pairs from a .env file into process.env (without overwriting
 * anything already set in the real environment). Uses Node's built-in loader
 * when available (Node >= 20.12), otherwise falls back to a tiny parser so the
 * project stays dependency-free.
 */
export function loadDotEnv() {
  const envPath = resolve(projectRoot, '.env');
  if (!existsSync(envPath)) return;

  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      return;
    } catch {
      // Fall through to the manual parser below.
    }
  }

  // Minimal fallback parser (KEY=VALUE per line, supports # comments + quotes).
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Non-fatal: if the file can't be read we just rely on the real env.
  }
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Build the full configuration object used by the rest of the app.
 * Throws a clear, actionable error when the API key is missing.
 */
export async function loadConfig() {
  loadDotEnv();

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !apiKey.trim() || apiKey === 'your-api-key-here') {
    throw new Error(
      'Missing GOOGLE_PLACES_API_KEY. Copy .env.example to .env and paste your ' +
        'Google Places API (New) key, or export the variable in your shell.'
    );
  }

  const queries = await loadQueries();

  return {
    apiKey: apiKey.trim(),
    queries,
    maxResultsPerQuery: parsePositiveInt(process.env.MAX_RESULTS_PER_QUERY, 60),
    requestDelayMs: parsePositiveInt(process.env.REQUEST_DELAY_MS, 1200),
    languageCode: (process.env.LANGUAGE_CODE || 'bg').trim(),
    regionCode: (process.env.REGION_CODE || 'BG').trim(),
    projectRoot,
    outputDir: resolve(projectRoot, 'output'),
  };
}

/** Load and validate queries.json. */
export async function loadQueries() {
  const queriesPath = resolve(projectRoot, 'queries.json');
  let raw;
  try {
    raw = await readFile(queriesPath, 'utf8');
  } catch {
    throw new Error(
      `Could not read queries.json at ${queriesPath}. Create it as an array of ` +
        '{ "niche": "...", "query": "..." } objects.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`queries.json is not valid JSON: ${err.message}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('queries.json must be a non-empty array of { niche, query } objects.');
  }

  const clean = [];
  for (const [i, entry] of parsed.entries()) {
    if (!entry || typeof entry !== 'object') {
      console.warn(`  ! Skipping queries.json[${i}]: not an object.`);
      continue;
    }
    const niche = String(entry.niche ?? '').trim();
    const query = String(entry.query ?? '').trim();
    if (!query) {
      console.warn(`  ! Skipping queries.json[${i}]: missing "query".`);
      continue;
    }
    clean.push({ niche: niche || 'uncategorized', query });
  }

  if (clean.length === 0) {
    throw new Error('queries.json contained no usable { niche, query } entries.');
  }
  return clean;
}
