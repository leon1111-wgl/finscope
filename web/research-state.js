// Only restore selection inputs. Saved financial values and model outputs are never imported.
export const CALCULATION_VERSION = '1';
export const MAX_BRIEF_BYTES = 2_000_000;
const views = ['review', 'compare', 'stress', 'brief', 'method'];
const ranges = {
  revenuePercent: [-100, 100], marginPoints: [-50, 50],
  refinanceBillions: [0, 1000], rateBps: [-500, 1000], collectionDays: [0, 180]
};
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export function validDate(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const time = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}

export function validateAssumptions(input) {
  if (!object(input)) throw new Error('The brief must include all five numeric scenario assumptions.');
  const result = {};
  for (const [key, [lo, hi]] of Object.entries(ranges)) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < lo || value > hi)
      throw new Error(`${key} must be a number from ${lo} to ${hi}. Blank values are not zero.`);
    result[key] = value;
  }
  return result;
}

function validateSelection(input, bundle) {
  if (!bundle.companies.some(c => c.ticker === input.ticker)) throw new Error('The saved company is not supported by this dataset.');
  if (!validDate(input.date) || input.date < bundle.snapshots[0].as_of || input.date > bundle.as_of)
    throw new Error(`Choose a real calendar date from ${bundle.snapshots[0].as_of} through ${bundle.as_of}.`);
  if (!views.includes(input.view)) throw new Error('The saved research view is not recognized.');
  if (input.dataset !== null && !hash(input.dataset)) throw new Error('The saved dataset identifier must be a SHA-256 hash.');
  const calculation = input.calculation ?? null;
  if (calculation !== null && (typeof calculation !== 'string' || !/^\d{1,8}$/.test(calculation))) throw new Error('The saved calculation version is invalid.');
  return {ticker: input.ticker, date: input.date, view: input.view,
    assumptions: validateAssumptions(input.assumptions), dataset: input.dataset, calculation,
    versionStatus: input.dataset === null || calculation === null ? 'unversioned' : input.dataset === bundle.dataset_sha256 && calculation === CALCULATION_VERSION ? 'match' : 'changed'};
}

export function selectionFromBrief(text, bundle) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > MAX_BRIEF_BYTES)
    throw new Error('Choose a FinScope JSON brief smaller than 2 MB.');
  let b;
  try { b = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Choose a downloaded FinScope evidence brief.'); }
  if (!object(b) || b.author !== 'FinScope by Leon Wang') throw new Error('This is not a recognized FinScope company brief.');
  if (('brief_format' in b || 'brief_version' in b) && (b.brief_format !== 'finscope-company-review' || b.brief_version !== 1))
    throw new Error('This brief format is not supported by this version of FinScope.');
  if (!hash(b.dataset_sha256)) throw new Error('The brief is missing a valid dataset identifier.');
  if (!validDate(b.snapshot_date) || !validDate(b.requested_date) || b.snapshot_date > b.requested_date)
    throw new Error('The brief has an invalid financial snapshot or information date.');
  return validateSelection({ticker: b.company?.ticker, date: b.requested_date, view: 'brief',
    assumptions: b.assumptions, dataset: b.dataset_sha256, calculation: b.calculation_version ?? null}, bundle);
}

export function selectionFromURL(params, bundle) {
  const keys = ['company', 'date', 'view', 'dataset', 'calculation', ...Object.keys(ranges)];
  if (!keys.some(k => params.has(k))) return null;
  for (const k of keys) if (params.getAll(k).length > 1) throw new Error(`The saved link repeats ${k}. Use one value per field.`);
  const assumptions = {};
  for (const k of Object.keys(ranges)) {
    const value = params.get(k);
    if (value !== null && !/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))
      throw new Error(`The shared link has an invalid ${k}. Correct the link or start a new review.`);
    assumptions[k] = value === null ? 0 : Number(value);
  }
  return validateSelection({ticker: params.get('company') ?? 'MSFT', date: params.get('date') ?? bundle.as_of,
    view: params.get('view') ?? 'review', assumptions, dataset: params.has('dataset') ? params.get('dataset') : null, calculation: params.get('calculation')}, bundle);
}

export function approveSelection(selection, bundle, {allowCurrentData = false} = {}) {
  const checked = validateSelection(selection, bundle);
  if (checked.versionStatus !== 'match' && !allowCurrentData)
    throw new Error('The saved data version does not match. Explicitly choose current data before recalculating.');
  return {...checked, dataset: bundle.dataset_sha256, calculation: CALCULATION_VERSION, versionStatus: 'match'};
}

export function researchQuery(selection, dataset) {
  const params = new URLSearchParams({company: selection.ticker, date: selection.date, view: selection.view, dataset, calculation: CALCULATION_VERSION});
  for (const [key, value] of Object.entries(validateAssumptions(selection.assumptions))) if (value !== 0) params.set(key, value);
  return params.toString();
}
