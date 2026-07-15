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

// ── Research depth presets ────────────────────────────────────────────────
// Controls how wide/thorough a run is: how many districts each query is
// repeated against and how many results per search we're willing to pull.
// "short" is fast/cheap (quick pulse-check); "deep" casts the widest net to
// surface more long-tail leads. Explicit env vars (EXPAND_DISTRICTS,
// MAX_RESULTS_PER_QUERY, VARNA_DISTRICTS) always override the preset.
export const RESEARCH_DEPTHS = ['short', 'medium', 'deep'];
const DEFAULT_DEPTH = 'medium';

// Extra neighborhoods layered on for "deep" runs, on top of DEFAULT_DISTRICTS.
const EXTRA_DEEP_DISTRICTS = ['Галата', 'Победа', 'Възраждане', 'Изгрев'];

function depthPresets(defaultDistricts) {
  return {
    short: {
      expandDistricts: false,
      maxResultsPerQuery: 20,
      districts: [],
      description: 'city-wide only, 1 page/query — fast pulse-check',
    },
    medium: {
      expandDistricts: true,
      maxResultsPerQuery: 60,
      districts: defaultDistricts,
      description: `city-wide + ${defaultDistricts.length} districts — balanced default`,
    },
    deep: {
      expandDistricts: true,
      maxResultsPerQuery: 60,
      districts: [...defaultDistricts, ...EXTRA_DEEP_DISTRICTS],
      description: `city-wide + ${defaultDistricts.length + EXTRA_DEEP_DISTRICTS.length} districts — widest net`,
    },
  };
}

/** Read a requested depth from `--depth=X` / `--depth X` / a bare "short|medium|deep" arg. */
function parseDepthFromArgv(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const eq = /^--depth=(.+)$/.exec(arg);
    if (eq) return eq[1].trim().toLowerCase();
    if (arg === '--depth' && argv[i + 1]) return argv[i + 1].trim().toLowerCase();
    if (RESEARCH_DEPTHS.includes(arg.toLowerCase())) return arg.toLowerCase();
  }
  return null;
}

function resolveDepth(argv, envDepth) {
  const requested = (parseDepthFromArgv(argv) || envDepth || '').trim().toLowerCase();
  if (!requested) return DEFAULT_DEPTH;
  if (RESEARCH_DEPTHS.includes(requested)) return requested;
  console.warn(`  ! Unknown research depth "${requested}"; falling back to "${DEFAULT_DEPTH}". ` +
    `Valid values: ${RESEARCH_DEPTHS.join(', ')}.`);
  return DEFAULT_DEPTH;
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

  const depth = resolveDepth(process.argv.slice(2), process.env.RESEARCH_DEPTH);
  const preset = depthPresets(DEFAULT_DISTRICTS)[depth];

  // Geographic expansion: to find MORE than the ~60/query Google cap, each
  // query is also run per-district (e.g. "стоматолог Варна Чайка"). Districts
  // are appended to the query text; results are deduped across everything.
  // Explicit env vars win over the depth preset.
  const expandDistricts =
    process.env.EXPAND_DISTRICTS !== undefined
      ? process.env.EXPAND_DISTRICTS !== '0'
      : preset.expandDistricts;
  const districts = parseList(process.env.VARNA_DISTRICTS) ?? preset.districts;

  return {
    apiKey: apiKey.trim(),
    queries,
    depth,
    depthDescription: preset.description,
    maxResultsPerQuery:
      process.env.MAX_RESULTS_PER_QUERY !== undefined
        ? parsePositiveInt(process.env.MAX_RESULTS_PER_QUERY, preset.maxResultsPerQuery)
        : preset.maxResultsPerQuery,
    requestDelayMs: parsePositiveInt(process.env.REQUEST_DELAY_MS, 1200),
    languageCode: (process.env.LANGUAGE_CODE || 'bg').trim(),
    regionCode: (process.env.REGION_CODE || 'BG').trim(),
    expandDistricts,
    districts,
    // Bias results toward the Varna area (circle around city centre).
    locationBias: {
      circle: {
        center: {
          latitude: parseFloat(process.env.VARNA_LAT) || 43.2141,
          longitude: parseFloat(process.env.VARNA_LNG) || 27.9147,
        },
        radius: parsePositiveInt(process.env.VARNA_RADIUS_M, 15000),
      },
    },
    projectRoot,
    outputDir: resolve(projectRoot, 'output'),
  };
}

// Well-known Varna districts / landmarks used to widen coverage.
const DEFAULT_DISTRICTS = [
  'Гръцка махала',
  'Чайка',
  'Левски',
  'Владислав Варненчик',
  'Аспарухово',
  'Виница',
  'Младост',
  'Морска градина',
];

function parseList(value) {
  if (!value || !value.trim()) return null;
  const items = value.split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean);
  return items.length ? items : null;
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
