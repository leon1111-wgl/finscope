// Loads the universe files from this site (never from SEC): the small index first, then one shard per company on
// demand, and the screen only when it is opened. Each download has a deadline; failures are reported, not hidden.
const cache = new Map();

async function getJSON(url, {fetch: fetcher = globalThis.fetch, timeoutMs = 30000, check} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {signal: controller.signal, cache: 'no-cache'});
    if (!response.ok) throw new Error(`Request for ${url.split('/').pop()} failed (${response.status}).`);
    const data = await response.json();
    if (check && !check(data)) throw new Error(`${url.split('/').pop()} is not a FinScope universe file.`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Downloading ${url.split('/').pop()} timed out. Check your connection and retry.`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function once(key, load) {
  if (!cache.has(key)) cache.set(key, load().catch(error => { cache.delete(key); throw error; }));
  return cache.get(key);
}

export const loadIndex = (opts = {}) => once('index', () => getJSON('./data/universe/index.json', {...opts, check: d => d?.schema === 'finscope.universe.index/1' && Array.isArray(d.companies)}));
export const loadScreen = (opts = {}) => once('screen', () => getJSON('./data/universe/screen.json', {...opts, check: d => d?.schema === 'finscope.universe.screen/1' && Array.isArray(d.rows)}));
export const loadShard = (cik, opts = {}) => {
  if (!Number.isInteger(Number(cik)) || Number(cik) <= 0) return Promise.reject(new Error('Unknown company.'));
  return once(`c${Number(cik)}`, () => getJSON(`./data/universe/c/${Number(cik)}.json`, {...opts, check: d => d?.schema === 'finscope.universe.company/1' && d.cik === Number(cik)}));
};
export async function loadShards(ciks, opts = {}) {
  const out = {};
  await Promise.all([...new Set(ciks)].map(async c => { out[c] = await loadShard(c, opts); }));
  return out;
}
export const cachedShard = cik => cache.get(`c${Number(cik)}`);
export const resetUniverseCache = () => cache.clear();
