// Ask the ledger, universe path (0.3.0): answers about any company in the universe and the figures added in 0.3.0.
// Called by ask-engine.js after its refusal checks, with the parsed question and the loaded shards. Fixed rules only;
// the program states every number with its source line. No model, no network, no storage.
import {FIGURES, INDICATORS, TEMPLATE_LABEL, isFigure, label, show, exact, indicator, periodIndex, latestIndex, entryOf, primary, sourceOf, filingUrl, filingIndexUrl, lc} from './universe-data.js';

export const UNIVERSE_ONLY = new Set([...Object.keys(FIGURES), ...Object.keys(INDICATORS)].filter(k => !['revenue', 'net_income', 'operating_income', 'operating_cash_flow', 'assets', 'liabilities', 'current_assets', 'current_liabilities', 'cash', 'capex',
  'operating_margin', 'net_margin', 'cash_margin', 'current_ratio', 'liabilities_assets', 'cash_coverage', 'accruals', 'revenue_growth', 'cash_conversion', 'free_cash_flow', 'profit_cash_gap'].includes(k)));
export const SUPPORTED = new Set([...Object.keys(FIGURES), ...Object.keys(INDICATORS)]);

export const UCUE = {
  lineage: /哪个标签|什么标签|用的.{0,6}标签|标签是|xbrl|\btags?\b|哪个科目|取自|口径|lineage|fallback|备用标签|which (filing|concept|element|line)|what (tag|concept|element)|where (does|did|do) .{0,40}(come from|from)|从哪(个|份|里)?(来|取)|来自哪|数据出处|出处|来源/,
  quality: /数据质量|质量问题|数据.{0,8}(问题|缺失|异常|毛病|坑|注意|质量)|有没有.{0,4}(问题|缺失|重述)|缺失|缺了|没报|重述|追溯调整|restat|amend|data[- ](quality|issues?|problems?|gaps?|caveats?)|(any|known) (data )?(issues?|problems?|caveats?|quirks?|gaps?)|missing (data|figures|values|items)|quirks?|caveats?|what('s| is) (missing|odd|wrong) with/,
  sector: /行业|同行|同业|板块|同类|peer|peers|sector|industry|in (its|their) (group|space)/,
  percentile: /百分位|分位|排第几|排名|排在|位置|处于|水平|percentile|rank|ranks|ranking|where (does|do|is|are)|how .{0,20}compare|stack up|standing/,
  universeRank: /哪家|哪个公司|哪一家|which (company|bank|insurer|reit|one|firm|stock)|who has|highest|lowest|largest|biggest|top \d+|\btop\b|最高|最低|最大|最多|最少|排名|排行/,
  overview: /介绍|概况|基本情况|情况怎么样|怎么样|财务状况|overview|summary|snapshot|tell me about|how is .{0,30} doing|financials?\b|财务数据|财报数据|主要数据|关键数据/
};

const L = (lang, en, zh) => lang === 'zh' ? zh : en;
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const finish = (r, fields) => Object.assign(r, fields);

function definitionText(k, lang) {
  const D = {
    cost_of_revenue: ['What it cost to deliver the goods and services sold (CostOfRevenue or a listed alternative).', '交付所售商品和服务的成本（CostOfRevenue 或列出的替代标签）。'],
    gross_profit: ['Revenue minus cost of revenue, only where the company reports a gross profit line (GrossProfit). FinScope does not compute one for companies that do not present it.', '营收减营业成本，只有公司报告了毛利这一行（GrossProfit）时才给出；公司没有列示时 FinScope 不自行计算。'],
    rnd: ['Research and development expense as reported.', '报告的研发费用。'],
    sga: ['Selling, general and administrative expense; where it is reported in two lines, their sum from the same filing.', '销售、一般及管理费用；分两行报告时，取同一份文件中两行之和。'],
    interest_expense: ['Interest expense as reported. For banks this is mainly interest paid on deposits and borrowings.', '报告的利息支出。银行的利息支出主要是存款和借款的利息。'],
    pretax_income: ['Income before income taxes.', '扣除所得税之前的利润。'],
    income_tax: ['Income tax expense (benefit) for the year.', '当年的所得税费用（或收益）。'],
    eps_diluted: ['Diluted earnings per share exactly as the company reported it (EarningsPerShareDiluted). FinScope does not recompute it.', '公司报告的稀释每股收益（EarningsPerShareDiluted），FinScope 不重新计算。'],
    shares_diluted: ['Weighted-average diluted shares used for diluted EPS, not the share count at year end.', '计算稀释每股收益所用的加权平均稀释股数，不是年末股本。'],
    dividends: ['Cash dividends paid in the year, from the cash-flow statement.', '现金流量表中当年支付的现金股息。'],
    buybacks: ['Cash paid to repurchase the company’s own shares, from the cash-flow statement.', '现金流量表中回购本公司股票支付的现金。'],
    cash_sti: ['Cash and cash equivalents plus short-term investments (marketable securities in current assets).', '现金及现金等价物加短期投资（流动资产中的有价证券）。'],
    equity: ["Shareholders' equity attributable to the company (StockholdersEquity).", '归属于公司股东的权益（StockholdersEquity）。'],
    total_debt: ['Borrowings: long-term debt including its current portion, plus short-term borrowings or commercial paper. Operating leases are not included; the source line shows each part.', '借款：长期债务（含一年内到期部分）加短期借款或商业票据，不含经营租赁；来源行列出每个组成部分。'],
    net_interest_income: ['Interest earned minus interest paid: the core income line of a bank.', '利息收入减利息支出，银行的核心收入。'],
    noninterest_income: ['Bank income from fees, trading and other sources besides interest.', '银行利息以外的收入：手续费、交易等。'],
    provision: ['The expense a lender records for expected credit losses in the year.', '贷款机构当年为预期信用损失计提的费用。'],
    deposits: ['Customer deposits held at the fiscal year end.', '财年末的客户存款。'],
    loans: ['Loans and leases receivable, net of the allowance for credit losses.', '扣除信用损失准备后的贷款与租赁应收款。'],
    premiums: ['Insurance premiums earned in the year, net of reinsurance.', '当年已赚保费（扣除再保险）。'],
    net_investment_income: ['Income an insurer earns on its investment portfolio.', '保险公司投资组合产生的收益。'],
    real_estate: ['Real estate held for investment, net of accumulated depreciation.', '扣除累计折旧后的投资性房地产。'],
    gross_margin: ['Gross profit per dollar of revenue.', '每一美元营收带来的毛利。'],
    rnd_intensity: ['R&D spending per dollar of revenue.', '每一美元营收对应的研发费用。'],
    fcf_margin: ['Free cash flow per dollar of revenue.', '每一美元营收带来的自由现金流。'],
    debt_to_equity: ["Total debt per dollar of shareholders' equity. Not meaningful when equity is zero or negative.", '每一美元股东权益对应的总债务；股东权益为零或负时没有意义。'],
    interest_coverage: ['How many times operating income covers interest expense. Not meaningful when interest expense is zero.', '营业利润是利息支出的多少倍；利息支出为零时没有意义。'],
    roe: ["Net income relative to average shareholders' equity of this and the prior year.", '净利润相对本年与上年平均股东权益的比率。'],
    roa: ['Net income relative to average total assets of this and the prior year.', '净利润相对本年与上年平均总资产的比率。'],
    payout: ['Cash returned to shareholders: dividends paid plus share repurchases.', '回报给股东的现金：支付的股息加股票回购。']
  };
  return D[k] ? D[k][lang === 'zh' ? 1 : 0] : null;
}

export function universeDefinition(r, p, keys) {
  const lang = p.lang;
  const lines = keys.map(k => {
    const text = definitionText(k, lang);
    const formula = INDICATORS[k] ? L(lang, ` Formula: ${INDICATORS[k][3]}.`, ` 公式：${INDICATORS[k][4]}。`) : '';
    return text ? `${label(k, lang)}: ${text}${formula}` : null;
  }).filter(Boolean);
  if (!lines.length) return null;
  return finish(r, {topic: 'definition', plan: {...r.plan, metric: keys[0]}, summary: lines.join(' '),
    notes: [L(lang, 'Each figure is read from a documented chain of XBRL tags; ask “which tag” for a company to see the one used.', '每个数字按记录在案的 XBRL 标签顺序读取；对某家公司问“用的哪个标签”可以看到实际所用的标签。')]});
}

// ------------------------------------------------------------------ helpers over shards
function fact(shard, s, lang, extra = {}) {
  const t = shard.__t || shard.tickers[0] || `CIK${shard.cik}`;
  const tag = s.parts ? `${s.parts.map(x => `${x.sign < 0 ? '−' : '+'} ${x.tag}`).join(' ').replace(/^\+ /, '')}` : s.tag;
  return {ticker: t, key: s.metric, label: `${label(s.metric, lang)}${s.role === 'prior_year' ? L(lang, ' (prior year)', '（上年）') : ''}`, value: s.value, display: show(s.metric, s.value, lang),
    exact_usd: exact(s.value), unit: s.unit, period_start: s.period_start, period_end: s.period_end, fiscal_year: s.fy, form: s.form, tag, filed: s.filed,
    accession: s.accession, url: s.url, filing_index_url: s.filing_index_url, link_kind: s.link_kind, via: s.via, role: s.role, ...extra};
}
const fyText = (shard, i, lang) => { const p = shard.periods[i]; return lang === 'zh' ? `${p.fy} 财年（${p.start} 至 ${p.end}）` : `FY${p.fy} (${p.start} → ${p.end})`; };

export function universeContext(ctx) {
  const {prepared, shards} = ctx;
  return {
    shardOf: t => { const e = entryOf(prepared, t); const sh = e ? shards[e.c] || null : null; if (sh && !sh.__t) Object.defineProperty(sh, '__t', {value: primary(e), enumerable: false}); return sh; },
    entryOf: t => entryOf(prepared, t)
  };
}

function nameOf(ctx, t, lang) {
  const e = entryOf(ctx.prepared, t);
  if (!e) return t;
  return lang === 'zh' ? `${e.z?.[0] || e.n}（${primary(e)}）` : `${e.n} (${primary(e)})`;
}

function resolveIndex(p, shard, t, ci = 0) {
  if (p.exactEnd) { const i = shard.periods.findIndex(x => x.end === p.exactEnd); return i >= 0 ? {i} : {bad: 'date'}; }
  const years = p.companies.length >= 2 && p.yearOrder.length === p.companies.length ? [p.yearOrder[ci]] : p.years;
  if (years.length && p.relYears?.has(years.at(-1))) {
    const y = years.at(-1), a = Date.parse(`${y}-01-01`), b = Date.parse(`${y}-12-31`);
    const overlap = q => Math.max(0, Math.min(b, Date.parse(q.end)) - Math.max(a, Date.parse(q.start)));
    const best = shard.periods.map((q, i) => [overlap(q), i]).sort((x, z) => z[0] - x[0])[0];
    if (best && best[0] > 0) return {i: best[1], asked: shard.periods[best[1]].fy, relative: y};
  }
  if (years.length) {
    const y = years.at(-1), i = periodIndex(shard, y);
    if (i >= 0) return {i, asked: y};
    const fys = shard.periods.map(x => x.fy);
    if (y > Math.max(...fys)) return {bad: 'future', y};
    if (y < Math.min(...fys)) return {bad: 'early', y};
    return {bad: 'gap', y};
  }
  return {i: latestIndex(shard)};
}

function periodProblem(r, p, ctx, t, shard, res, metric) {
  const lang = p.lang, last = shard.periods.at(-1), first = shard.periods[0];
  if (res.bad === 'future') return finish(r, {status: 'refused', topic: 'forecast', plan: {...r.plan, tickers: [t], metric, period: `FY${res.y}`}, summary: L(lang,
    `${nameOf(ctx, t, 'en')} has not filed FY${res.y}, so it is not in the data, and FinScope does not forecast it. The latest filed year is ${fyText(shard, shard.periods.length - 1, 'en')}.`,
    `${nameOf(ctx, t, 'zh')}还没有提交 ${res.y} 财年的年报，数据里没有，FinScope 也不做预测。最新已提交的是${fyText(shard, shard.periods.length - 1, 'zh')}。`),
    offers: [L(lang, `${t} latest ${lc(label(metric || 'revenue', 'en'))}`, `${t} 最新的${label(metric || 'revenue', 'zh')}`)]});
  if (res.bad === 'early') return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', plan: {...r.plan, tickers: [t], metric, period: `FY${res.y}`}, summary: L(lang,
    `FY${res.y} is before the first of the latest ten fiscal years FinScope keeps for ${t} (FY${first.fy}, ended ${first.end}).`,
    `${res.y} 财年早于 FinScope 为 ${t} 保存的最近十个财年中的第一个（${first.fy} 财年，截至 ${first.end}）。`)});
  if (res.bad === 'gap') return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', plan: {...r.plan, tickers: [t], metric, period: `FY${res.y}`}, summary: L(lang,
    `${t} has no annual 10-K period labelled FY${res.y} (for example after a change of fiscal year end). Its periods: ${shard.periods.map(x => `FY${x.fy}`).join(', ')}.`,
    `${t} 没有标为 ${res.y} 财年的 10-K 年度期间（例如财年末变更）。现有期间：${shard.periods.map(x => `${x.fy} 财年`).join('、')}。`)});
  return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [t], metric}, summary: L(lang,
    `${p.exactEnd} is not a fiscal year end for ${t}; its latest fiscal year ended ${last.end}. Ask by fiscal year.`,
    `${p.exactEnd} 不是 ${t} 的财年末；它最新的财年截至 ${last.end}。请按财年提问。`)});
}

function unavailable(r, p, ctx, t, shard, metric, i, res) {
  const lang = p.lang, catalog = ctx.prepared.index.catalog || {};
  const tl = TEMPLATE_LABEL[shard.template][lang === 'zh' ? 1 : 0];
  const plan = {...r.plan, tickers: [t], metric, period: i == null ? null : p.years.length ? `FY${shard.periods[i].fy}` : 'latest'};
  if (res.reason === 'unsupported') return finish(r, {status: 'not_in_bundle', topic: 'template_unsupported', plan, summary: L(lang,
    `${label(metric, 'en')} is not supported for ${nameOf(ctx, t, 'en')}, which uses the ${tl.toLowerCase()} template (SIC ${shard.sic || 'n/a'}): its statements are not built that way. FinScope will not substitute another figure.`,
    `${nameOf(ctx, t, 'zh')}使用“${tl}”模板（SIC ${shard.sic || '无'}），这类报表没有${label(metric, 'zh')}，所以不支持；FinScope 不会用别的数字代替。`),
    offers: templateOffers(shard, t, lang)});
  const missing = res.missing?.filter(m => !m.endsWith('_prior')) || [];
  const chain = missing.map(m => catalog[m]?.rule || (catalog[m]?.chain || []).join(' → ')).filter(Boolean);
  const why = res.reason === 'conflict' ? L(lang, 'the filing reports conflicting values for it', '该文件对它报告了相互矛盾的数值')
    : res.reason === 'nonpositive' ? L(lang, 'the denominator is zero or negative, so the ratio is not meaningful', '分母为零或负数，比率没有意义')
    : res.reason === 'no_prior' ? L(lang, 'it needs the prior fiscal year, which is not available', '需要上一财年的数据，但没有')
    : L(lang, `${missing.map(m => lc(label(m, 'en'))).join(' and ')} is not reported under the tags FinScope reads${chain.length ? ` (${chain.join('; ')})` : ''}`,
      `${missing.map(m => label(m, 'zh')).join('和')}没有用 FinScope 读取的标签报告${chain.length ? `（${chain.join('；')}）` : ''}`);
  const period = i == null ? '' : ` ${L(lang, `FY${shard.periods[i].fy}`, `${shard.periods[i].fy} 财年`)}`;
  return finish(r, {status: 'not_in_bundle', topic: res.reason === 'nonpositive' ? 'not_meaningful' : 'missing_fact', plan, summary: L(lang,
    `${label(metric, 'en')} for ${t}${period} is not stated: ${why}. FinScope does not substitute another figure or treat a missing value as zero.`,
    `${t}${period}的${label(metric, 'zh')}无法给出：${why}。FinScope 不会用别的数字代替，也不把缺失当作零。`),
    offers: [L(lang, `${t} data quality notes`, `${t} 的数据质量说明`), L(lang, `${t} revenue and net income`, `${t} 的营收和净利润`)]});
}

function templateOffers(shard, t, lang) {
  const k = {bank: 'net_interest_income', insurance: 'premiums', reit: 'real_estate', industrial: 'gross_margin'}[shard.template];
  return [L(lang, `${t} ${lc(label(k, 'en'))}`, `${t} 的${label(k, 'zh')}`), L(lang, `${t} net income trend`, `${t} 近几年的净利润`)];
}

function calcOf(shard, t, key, i, value, lang) {
  if (isFigure(key)) return null;
  return {label: `${label(key, lang)} · ${t} FY${shard.periods[i].fy}`, formula: INDICATORS[key][lang === 'zh' ? 4 : 3], result: show(key, value, lang)};
}

function noteFor(shard, key, sources, lang) {
  const notes = [];
  for (const s of sources) {
    if (s.via === 'fallback') notes.push(L(lang, `${label(s.metric, 'en')} FY${s.fy} uses the fallback tag ${s.tag}.`, `${label(s.metric, 'zh')} ${s.fy} 财年使用了备用标签 ${s.tag}。`));
    if (s.note) notes.push(`${label(s.metric, lang)} FY${s.fy}: ${s.note}.`);
    if (s.first) notes.push(L(lang, `${label(s.metric, 'en')} FY${s.fy} was first reported as ${show(s.metric, s.first.v, 'en')} (${s.first.accn}); the later filing's figure is shown.`,
      `${label(s.metric, 'zh')} ${s.fy} 财年最初报告为 ${show(s.metric, s.first.v, 'zh')}（${s.first.accn}），这里显示后来文件中的数字。`));
  }
  if (key === 'eps_diluted') notes.push(L(lang, 'EPS is the reported figure; FinScope does not recompute it.', '每股收益为报告值，FinScope 不重新计算。'));
  if (key === 'total_debt' || sources.some(s => s.metric === 'total_debt')) notes.push(L(lang, 'Total debt is borrowings only; operating leases are excluded. The source line names each part.', '总债务只含借款，不含经营租赁；来源行列出每个组成部分。'));
  if (['cash_conversion', 'accruals'].includes(key)) notes.push(L(lang, 'A transparent indicator, not a verdict: read working capital and non-cash items in the filing for the reason.', '这是透明指标，不是结论：原因请读财报中的营运资本和非现金项目。'));
  return [...new Set(notes)];
}

// ------------------------------------------------------------------ topics
function metricAnswer(r, p, ctx, t, key) {
  const lang = p.lang, shard = ctx.shardOf(t);
  const res0 = resolveIndex(p, shard, t);
  if (res0.bad) return periodProblem(r, p, ctx, t, shard, res0, key);
  const i = res0.i, res = indicator(shard, key, i);
  if (res.value === null) return unavailable(r, p, ctx, t, shard, key, i, res);
  const facts = res.sources.map(s => fact(shard, s, lang));
  const calc = calcOf(shard, t, key, i, res.value, lang);
  const notes = noteFor(shard, key, res.sources, lang);
  if (res.note) notes.push(res.note + '.');
  if (p.relative === 'this_year' && !p.years.length) notes.push(L(lang, `“This year” is read as the latest filed fiscal year, FY${shard.periods[i].fy}.`, `“今年”按最新已提交的 ${shard.periods[i].fy} 财年理解。`));
  return finish(r, {topic: isFigure(key) ? 'metric' : 'ratio', plan: {tickers: [t], metric: key, period: p.years.length || p.exactEnd ? `FY${shard.periods[i].fy}` : 'latest'}, facts, calculations: calc ? [calc] : [], notes,
    summary: L(lang, `${nameOf(ctx, t, 'en')}, ${lc(label(key, 'en'))} for ${fyText(shard, i, 'en')}: ${show(key, res.value, 'en')}.`,
      `${nameOf(ctx, t, 'zh')}${fyText(shard, i, 'zh')}的${label(key, 'zh')}：${show(key, res.value, 'zh')}。`),
    offers: [L(lang, `${t} ${lc(label(key, 'en'))} over the last five years`, `${t} 近五年的${label(key, 'zh')}`), L(lang, `Which tag is ${t}'s ${lc(label(key, 'en'))} from?`, `${t} 的${label(key, 'zh')}用的哪个标签`)]});
}

function figuresAnswer(r, p, ctx, t, keys) {
  const lang = p.lang, shard = ctx.shardOf(t);
  const res0 = resolveIndex(p, shard, t);
  if (res0.bad) return periodProblem(r, p, ctx, t, shard, res0, keys[0]);
  const i = res0.i, rows = [], facts = [], calcs = [], missing = [];
  for (const k of keys) {
    const res = indicator(shard, k, i);
    rows.push([label(k, lang), res.value === null ? (res.reason === 'unsupported' ? L(lang, 'not supported for this template', '此模板不支持') : L(lang, 'not reported', '未报告')) : show(k, res.value, lang)]);
    if (res.value === null) missing.push(label(k, lang));
    for (const s of res.sources) if (!facts.some(f => f.key === s.metric && f.period_end === s.period_end && f.role === s.role)) facts.push(fact(shard, s, lang));
    const c = res.value === null ? null : calcOf(shard, t, k, i, res.value, lang);
    if (c) calcs.push(c);
  }
  if (missing.length === keys.length) return unavailable(r, p, ctx, t, shard, keys[0], i, indicator(shard, keys[0], i));
  return finish(r, {topic: 'figures', plan: {tickers: [t], metric: keys[0], metrics: keys, period: p.years.length ? `FY${shard.periods[i].fy}` : 'latest'}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Figure', '项目'), L(lang, `FY${shard.periods[i].fy} · ${shard.periods[i].start} → ${shard.periods[i].end}`, `${shard.periods[i].fy} 财年 · ${shard.periods[i].start} 至 ${shard.periods[i].end}`)], rows},
    summary: L(lang, `${nameOf(ctx, t, 'en')}, ${fyText(shard, i, 'en')}: ${rows.map(x => `${x[0]} ${x[1]}`).join('; ')}.`, `${nameOf(ctx, t, 'zh')}，${fyText(shard, i, 'zh')}：${rows.map(x => `${x[0]} ${x[1]}`).join('；')}。`),
    notes: noteFor(shard, keys[0], facts.map(f => ({...f, metric: f.key, fy: f.fiscal_year})), lang)});
}

function trendAnswer(r, p, ctx, t, key) {
  const lang = p.lang, shard = ctx.shardOf(t);
  let idx = shard.periods.map((_, i) => i);
  const allYears = /哪年|哪一年|which year|what year|best year|worst year|\bpeak\b|record year|历史最高|历史最低|最高的一年|最低的一年/.test(p.low);
  if (p.range) idx = idx.filter(i => shard.periods[i].fy >= p.range[0] && (p.range[1] === null || shard.periods[i].fy <= p.range[1]));
  else if (p.years.length >= 3) idx = idx.filter(i => p.years.includes(shard.periods[i].fy));
  else if (!allYears) idx = idx.slice(-(p.lastN || 5));
  if (!idx.length) return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', plan: {...r.plan, tickers: [t], metric: key}, summary: L(lang, `${t} has no fiscal years in that range in FinScope (it keeps the latest ten).`, `FinScope 没有 ${t} 在这个范围内的财年（只保留最近十个）。`)});
  const basisNotes = [];
  if (['eps_diluted', 'shares_diluted'].includes(key)) {
    const cut = (shard.splits || []).filter(y => y > shard.periods[idx[0]].fy && y <= shard.periods[idx.at(-1)].fy).at(-1);
    if (cut) { idx = idx.filter(i => shard.periods[i].fy >= cut); basisNotes.push(L(lang, `The share count changed basis in FY${cut} (a split or a large issuance), so per-share figures are shown from FY${cut} only.`, `股数在 ${cut} 财年改变了口径（拆股或大规模发行），所以每股数据只显示 ${cut} 财年起。`)); }
  }
  const rows = [], facts = [], calcs = [];
  let stated = 0;
  for (const i of idx) {
    const res = indicator(shard, key, i);
    if (res.reason === 'unsupported') return withSpan(unavailable(r, p, ctx, t, shard, key, i, res), p);
    rows.push([`FY${shard.periods[i].fy}`, shard.periods[i].end, res.value === null ? L(lang, 'not stated', '无') : show(key, res.value, lang)]);
    if (res.value !== null) { stated++; facts.push(...res.sources.map(s => fact(shard, s, lang))); const c = calcOf(shard, t, key, i, res.value, lang); if (c) calcs.push(c); }
  }
  if (!stated) return withSpan(unavailable(r, p, ctx, t, shard, key, idx.at(-1), indicator(shard, key, idx.at(-1))), p);
  const span = `FY${shard.periods[idx[0]].fy}–FY${shard.periods[idx.at(-1)].fy}`;
  const notes = [...basisNotes, ...noteFor(shard, key, facts.map(f => ({...f, metric: f.key, fy: f.fiscal_year})), lang)];
  if (p.lastN && idx.length < p.lastN) notes.push(L(lang, `Only ${idx.length} fiscal years are available.`, `只有 ${idx.length} 个财年的数据。`));
  let headline = '';
  if (allYears) {
    const lowest = /worst|最低|lowest/.test(p.low);
    const pick = idx.map(i => [shard.periods[i].fy, indicator(shard, key, i).value]).filter(x => Number.isFinite(x[1])).sort((a, b) => lowest ? a[1] - b[1] : b[1] - a[1])[0];
    if (pick) headline = L(lang, `${lowest ? 'Lowest' : 'Highest'} of these years: FY${pick[0]} (${show(key, pick[1], 'en')}). `, `这些年中${lowest ? '最低' : '最高'}的是 ${pick[0]} 财年（${show(key, pick[1], 'zh')}）。`);
  }
  return finish(r, {topic: 'trend', plan: {tickers: [t], metric: key, period: p.lastN ? `last${p.lastN}` : span, years: idx.map(i => shard.periods[i].fy)}, facts, calculations: calcs.slice(-3),
    table: {columns: [L(lang, 'Fiscal year', '财年'), L(lang, 'Period end', '期末'), label(key, lang)], rows},
    summary: headline + L(lang, `${nameOf(ctx, t, 'en')}, ${lc(label(key, 'en'))} ${span}: ${rows.map(x => `${x[0]} ${x[2]}`).join(', ')}.`,
      `${nameOf(ctx, t, 'zh')} ${span} 的${label(key, 'zh')}：${rows.map(x => `${x[0]} ${x[2]}`).join('，')}。`), notes});
}

const withSpan = (r, p) => { if (p.lastN) r.plan.period = `last${p.lastN}`; return r; };

function changeAnswer(r, p, ctx, t, key) {
  const lang = p.lang, shard = ctx.shardOf(t);
  let i, j;
  if (p.years.length >= 2) { i = periodIndex(shard, p.years.at(-1)); j = periodIndex(shard, p.years[0]); }
  else { const res0 = resolveIndex(p, shard, t); if (res0.bad) return periodProblem(r, p, ctx, t, shard, res0, key); i = res0.i; j = i - 1; }
  if (i < 0 || j < 0) return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', plan: {...r.plan, tickers: [t], metric: key}, summary: L(lang, `${t} does not have both fiscal years in FinScope.`, `FinScope 没有 ${t} 这两个财年的数据。`)});
  const lo = Math.min(shard.periods[i].fy, shard.periods[j].fy), hi = Math.max(shard.periods[i].fy, shard.periods[j].fy);
  if (['eps_diluted', 'shares_diluted'].includes(key) && (shard.splits || []).some(y => y > lo && y <= hi)) return finish(r, {status: 'not_in_bundle', topic: 'split_basis', plan: {tickers: [t], metric: key, period: `FY${shard.periods[i].fy}`}, summary: L(lang,
    `${t}'s share count changed basis between these years (a split or a large issuance), so the two ${lc(label(key, 'en'))} figures are not comparable and no change is stated.`,
    `${t} 的股数在这两年之间改变了口径（拆股或大规模发行），两个${label(key, 'zh')}不可比，因此不给出变化。`)});
  const a = indicator(shard, key, i), b = indicator(shard, key, j);
  if (a.value === null) return unavailable(r, p, ctx, t, shard, key, i, a);
  if (b.value === null) return unavailable(r, p, ctx, t, shard, key, j, b);
  const diff = a.value - b.value, growth = isFigure(key) || INDICATORS[key]?.[2] === 'money' ? (b.value > 0 ? a.value / b.value - 1 : null) : null;
  const pctPts = INDICATORS[key]?.[2] === 'pct';
  const dir = diff > 0 ? L(lang, 'up', '增长') : diff < 0 ? L(lang, 'down', '下降') : L(lang, 'unchanged', '持平');
  const changeText = pctPts ? `${diff >= 0 ? '+' : '−'}${Math.abs(diff * 100).toFixed(1)} pp` : `${show(key, Math.abs(diff), lang)}${growth !== null ? ` (${growth >= 0 ? '+' : '−'}${Math.abs(growth * 100).toFixed(1)}%)` : ''}`;
  const facts = [...a.sources, ...b.sources].map(s => fact(shard, s, lang));
  const calcs = [calcOf(shard, t, key, i, a.value, lang), calcOf(shard, t, key, j, b.value, lang)].filter(Boolean);
  calcs.push({label: L(lang, `Change · ${t}`, `变化 · ${t}`), formula: pctPts ? L(lang, 'later − earlier, in percentage points', '后一年 − 前一年（百分点）') : L(lang, 'later − earlier; growth = later ÷ earlier − 1', '后一年 − 前一年；增长率 = 后一年 ÷ 前一年 − 1'), result: changeText});
  return finish(r, {topic: 'change', plan: {tickers: [t], metric: key, period: `FY${shard.periods[i].fy}`, from: `FY${shard.periods[j].fy}`}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Fiscal year', '财年'), L(lang, 'Period end', '期末'), label(key, lang)], rows: [[`FY${shard.periods[j].fy}`, shard.periods[j].end, show(key, b.value, lang)], [`FY${shard.periods[i].fy}`, shard.periods[i].end, show(key, a.value, lang)]]},
    summary: L(lang, `${nameOf(ctx, t, 'en')}, ${lc(label(key, 'en'))}: ${show(key, b.value, 'en')} in FY${shard.periods[j].fy} → ${show(key, a.value, 'en')} in FY${shard.periods[i].fy}, ${dir} ${changeText}.`,
      `${nameOf(ctx, t, 'zh')}的${label(key, 'zh')}：${shard.periods[j].fy} 财年 ${show(key, b.value, 'zh')} → ${shard.periods[i].fy} 财年 ${show(key, a.value, 'zh')}，${dir} ${changeText}。`),
    notes: noteFor(shard, key, [...a.sources, ...b.sources], lang)});
}

function compareAnswer(r, p, ctx, tickers, key, {rank = false, low = false} = {}) {
  const lang = p.lang, rows = [], facts = [], calcs = [], skipped = [];
  const values = [];
  tickers.forEach((t, ci) => {
    const shard = ctx.shardOf(t);
    const res0 = resolveIndex(p, shard, t, ci);
    if (res0.bad) { rows.push([t, '—', '—', L(lang, `no FY${res0.y ?? ''}`, `没有 ${res0.y ?? ''} 财年`)]); skipped.push(t); return; }
    const i = res0.i, res = indicator(shard, key, i);
    const why = res.reason === 'unsupported' ? L(lang, 'not supported for its template', '其模板不支持') : res.reason === 'nonpositive' ? L(lang, 'not meaningful', '无意义') : L(lang, 'not reported', '未报告');
    rows.push([nameOf(ctx, t, lang), `FY${shard.periods[i].fy}`, shard.periods[i].end, res.value === null ? why : show(key, res.value, lang)]);
    if (res.value === null) { skipped.push(t); return; }
    values.push([t, res.value, shard.periods[i].fy]);
    facts.push(...res.sources.map(s => fact(shard, s, lang)));
    const c = calcOf(shard, t, key, i, res.value, lang);
    if (c) calcs.push(c);
  });
  if (values.length === 1 && tickers.length > 1) {
    const [t1, v1, y1] = values[0];
    return finish(r, {topic: 'compare', plan: {tickers, metric: key, period: p.years.length ? `FY${p.years.at(-1)}` : 'latest'}, facts, calculations: calcs,
      table: {columns: [L(lang, 'Company', '公司'), L(lang, 'Fiscal year', '财年'), L(lang, 'Period end', '期末'), label(key, lang)], rows},
      summary: L(lang, `Only ${t1} has a stated ${lc(label(key, 'en'))}: ${show(key, v1, 'en')} (FY${y1}). Not stated for ${skipped.join(', ')} (see the table), so there is no comparison.`,
        `只有 ${t1} 有${label(key, 'zh')}：${show(key, v1, 'zh')}（${y1} 财年）。${skipped.join('、')} 没有给出（见表格），因此无法比较。`)});
  }
  if (!values.length) return finish(r, {status: 'not_in_bundle', topic: 'missing_fact', plan: {tickers, metric: key, period: p.years.length ? `FY${p.years.at(-1)}` : 'latest'},
    table: {columns: [L(lang, 'Company', '公司'), L(lang, 'Fiscal year', '财年'), L(lang, 'Period end', '期末'), label(key, lang)], rows: rows.map(x => x.length === 4 ? x : [...x])},
    summary: L(lang, `${label(key, 'en')} is not available for any of these companies.`, `这些公司都没有可用的${label(key, 'zh')}。`)});
  const sorted = [...values].sort((a, b) => low ? a[1] - b[1] : b[1] - a[1]);
  const fys = new Set(values.map(v => v[2]));
  const notes = [];
  if (fys.size > 1 || tickers.some(t => ctx.shardOf(t)?.periods.at(-1).end.slice(5) !== ctx.shardOf(tickers[0])?.periods.at(-1).end.slice(5))) notes.push(L(lang, 'Fiscal years end on different dates; each company is shown with its own fiscal year and period end.', '各公司的财年截止日不同；每家公司都标明了各自的财年和期末。'));
  if (skipped.length) notes.push(L(lang, `Not stated for ${skipped.join(', ')} (see the table).`, `${skipped.join('、')} 没有给出（见表格）。`));
  if (rank) {
    rows.sort((a, b) => { const i = tickers.findIndex(t => a[0].includes(`(${t})`) || a[0].includes(`（${t}）`)), j = tickers.findIndex(t => b[0].includes(`(${t})`) || b[0].includes(`（${t}）`)); return sorted.findIndex(v => v[0] === tickers[i]) - sorted.findIndex(v => v[0] === tickers[j]); });
    notes.push(L(lang, 'A ranking of the companies named, each on its own latest fiscal year; not a judgement of quality or value.', '只对点名的公司排序，各用自己的最新财年；不评价质量或投资价值。'));
  }
  return finish(r, {topic: rank ? 'rank' : 'compare', plan: {tickers, metric: key, period: p.years.length ? `FY${p.years.at(-1)}` : 'latest'}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Company', '公司'), L(lang, 'Fiscal year', '财年'), L(lang, 'Period end', '期末'), label(key, lang)], rows},
    summary: L(lang, `${label(key, 'en')}: ${sorted.map(([t, v, y]) => `${t} ${show(key, v, 'en')} (FY${y})`).join(', ')}. ${low ? 'Lowest' : 'Highest'}: ${sorted[0][0]}.`,
      `${label(key, 'zh')}：${sorted.map(([t, v, y]) => `${t} ${show(key, v, 'zh')}（${y} 财年）`).join('，')}。${low ? '最低' : '最高'}：${sorted[0][0]}。`), notes});
}

function cashSupportAnswer(r, p, ctx, t) {
  const lang = p.lang, shard = ctx.shardOf(t);
  if (!['industrial', 'reit'].includes(shard.template)) return unavailable(r, p, ctx, t, shard, 'cash_conversion', null, {reason: 'unsupported'});
  const res0 = resolveIndex(p, shard, t);
  if (res0.bad) return periodProblem(r, p, ctx, t, shard, res0, 'cash_conversion');
  const i = res0.i;
  const ni = indicator(shard, 'net_income', i), ocf = indicator(shard, 'operating_cash_flow', i);
  if (ni.value === null || ocf.value === null) return unavailable(r, p, ctx, t, shard, 'cash_conversion', i, indicator(shard, 'cash_conversion', i));
  const conv = indicator(shard, 'cash_conversion', i), acc = indicator(shard, 'accruals', i);
  const facts = [...ni.sources, ...ocf.sources, ...acc.sources.filter(s => s.role === 'prior_year' || s.metric === 'assets')].map(s => fact(shard, s, lang));
  const calcs = [conv.value !== null && calcOf(shard, t, 'cash_conversion', i, conv.value, lang), acc.value !== null && calcOf(shard, t, 'accruals', i, acc.value, lang)].filter(Boolean);
  const history = shard.periods.map((_, k) => k).slice(-5).map(k => {
    const a = indicator(shard, 'net_income', k).value, b = indicator(shard, 'operating_cash_flow', k).value;
    return [`FY${shard.periods[k].fy}`, show('net_income', a, lang), show('operating_cash_flow', b, lang), Number.isFinite(a) && Number.isFinite(b) && a > 0 ? `${(b / a).toFixed(2)}×` : '—'];
  });
  const verdict = ni.value <= 0 ? L(lang, 'Net income was zero or negative, so cash conversion is not meaningful; operating cash flow is shown beside it.', '净利润为零或负数，现金转化率没有意义；旁边列出了经营现金流。')
    : ocf.value >= ni.value ? L(lang, `Operating cash flow was at or above net income (${conv.value.toFixed(2)}×): the reported profit was backed by operating cash in that year.`, `经营现金流不低于净利润（${conv.value.toFixed(2)}×）：当年报告的利润有经营现金支撑。`)
    : L(lang, `Operating cash flow was below net income (${conv.value.toFixed(2)}×): profit ran ahead of cash in that year. That is a reason to read working capital and non-cash items in the filing, not a verdict.`, `经营现金流低于净利润（${conv.value.toFixed(2)}×）：当年利润跑在现金前面。这是去读财报中营运资本和非现金项目的理由，不是结论。`);
  return finish(r, {topic: 'cash_support', plan: {tickers: [t], metric: 'cash_conversion', period: p.years.length ? `FY${shard.periods[i].fy}` : 'latest'}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Fiscal year', '财年'), label('net_income', lang), label('operating_cash_flow', lang), label('cash_conversion', lang)], rows: history},
    summary: L(lang, `${nameOf(ctx, t, 'en')}, ${fyText(shard, i, 'en')}: net income ${show('net_income', ni.value, 'en')}, operating cash flow ${show('operating_cash_flow', ocf.value, 'en')}. ${verdict}${acc.value !== null ? ` Accrual ratio ${show('accruals', acc.value, 'en')}.` : ''}`,
      `${nameOf(ctx, t, 'zh')}，${fyText(shard, i, 'zh')}：净利润 ${show('net_income', ni.value, 'zh')}，经营活动现金流 ${show('operating_cash_flow', ocf.value, 'zh')}。${verdict}${acc.value !== null ? `应计比率 ${show('accruals', acc.value, 'zh')}。` : ''}`),
    notes: noteFor(shard, 'cash_conversion', [...ni.sources, ...ocf.sources], lang),
    offers: [L(lang, `Where does ${t} rank in its sector on cash conversion?`, `${t} 的现金转化率在行业里排第几`), L(lang, `${t} free cash flow over the last five years`, `${t} 近五年的自由现金流`)]});
}

function sectorRankAnswer(r, p, ctx, t, key) {
  const lang = p.lang, built = ctx.screen;
  if (!built) return finish(r, {status: 'not_in_bundle', topic: 'sector_rank', plan: {tickers: [t], metric: key, period: 'latest'}, summary: L(lang, 'The sector screen data is not loaded. Open the Screen page, or try again.', '行业筛选数据还没有加载。请打开“筛选”页，或稍后再试。')});
  const entry = ctx.entryOf(t), row = built.rows.find(x => x.c === entry.c);
  if (!row) return unavailable(r, p, ctx, t, ctx.shardOf(t), key, null, {reason: 'unsupported'});
  if (!row.values[key] && row.values[key] !== 0) return unavailable(r, p, ctx, t, ctx.shardOf(t), key, latestIndex(ctx.shardOf(t)), indicator(ctx.shardOf(t), key, latestIndex(ctx.shardOf(t))));
  const peerKey = row.peerFor?.[key] || row.peer;
  const peers = (built.members?.get(peerKey) || built.rows.filter(x => x.peer === peerKey)).filter(x => Number.isFinite(x.values[key]));
  const shard = ctx.shardOf(t), i = latestIndex(shard), res = indicator(shard, key, i);
  const meaning = {cash_conversion: L(lang, 'higher means more operating cash per dollar of profit', '越高表示每一美元利润对应的经营现金越多'), accruals: L(lang, 'higher means profit ran further ahead of operating cash', '越高表示利润越跑在经营现金前面'), fcf_margin: L(lang, 'higher means more free cash flow per dollar of revenue', '越高表示每一美元营收带来的自由现金流越多')}[key];
  const [tp, level, code] = peerKey.split(':');
  const group = (level === 'div' ? L(lang, `SIC division ${code}`, `SIC 门类 ${code}`) : `SIC ${code}${level === 'sic4' ? '' : level === 'sic3' ? 'x' : 'xx'}`) + (tp === 'reit' ? L(lang, ', REITs', '，房地产信托') : '');
  return finish(r, {topic: 'sector_rank', plan: {tickers: [t], metric: key, period: 'latest', peer_group: peerKey, peers: peers.length}, facts: res.sources.map(s => fact(shard, s, lang)),
    calculations: [calcOf(shard, t, key, i, row.values[key], lang), {label: L(lang, 'Peer percentile', '同业百分位'), formula: L(lang, '(peers below + half of ties) ÷ peers with a value × 100, latest fiscal year of each', '（低于它的同业数 + 并列数的一半）÷ 有数值的同业数 × 100，各取最新财年'), result: `${row.pct[key]} / 100`}].filter(Boolean),
    summary: L(lang, `${nameOf(ctx, t, 'en')}'s ${lc(label(key, 'en'))} (FY${row.fy}) is ${show(key, row.values[key], 'en')}, at the ${ordinal(row.pct[key])} percentile of ${peers.length} companies in its peer group (${group}); ${meaning}. A position, not a rating.`,
      `${nameOf(ctx, t, 'zh')}的${label(key, 'zh')}（${row.fy} 财年）为 ${show(key, row.values[key], 'zh')}，在同业组（${group}）${peers.length} 家公司中处于第 ${row.pct[key]} 百分位；${meaning}。这只是位置，不是评级。`),
    notes: [L(lang, 'Peer group: the most specific SIC level (4-digit, 3-digit, 2-digit, then division) where at least 10 screened companies have this indicator. Each peer uses its own latest fiscal year. Banks and insurers are not in the screen.', '同业组取至少有 10 家筛选公司具备该指标的最细 SIC 层级（四位、三位、两位，再到门类）。每家同业用自己最新的财年。银行和保险公司不在筛选范围内。')],
    offers: [L(lang, `${t} cash conversion over the last five years`, `${t} 近五年的现金转化率`)]});
}

function lineageAnswer(r, p, ctx, t, key) {
  const lang = p.lang, shard = ctx.shardOf(t), catalog = ctx.prepared.index.catalog || {};
  const k = key && isFigure(key) ? key : key && INDICATORS[key] ? INDICATORS[key][5][0] : 'revenue';
  const res0 = resolveIndex(p, shard, t);
  if (res0.bad) return periodProblem(r, p, ctx, t, shard, res0, k);
  const i = res0.i;
  if (!(k in shard.values)) return unavailable(r, p, ctx, t, shard, k, i, {reason: 'unsupported'});
  const s = sourceOf(shard, k, i);
  const chain = catalog[k]?.rule || (catalog[k]?.chain || []).join(' → ');
  if (!s) return unavailable(r, p, ctx, t, shard, k, i, indicator(shard, k, i));
  const how = {primary: L(lang, 'the first tag in its chain', '标签链中的第一个标签'), fallback: L(lang, 'a fallback tag (the first choice was not reported)', '备用标签（首选标签未报告）'), derived: L(lang, 'a composition of reported parts from one filing', '同一文件中报告的几个部分之和'), total: L(lang, 'the total Revenues tag, larger than contract revenue alone', '总营收标签 Revenues（大于仅含合同收入的标签）')}[s.via] || s.via;
  const what = s.parts ? s.parts.map(x => `${x.sign < 0 ? '−' : '+'}${x.tag} ${exact(x.v)}`).join(' ') : s.tag;
  return finish(r, {topic: 'lineage', plan: {tickers: [t], metric: k, period: p.years.length ? `FY${shard.periods[i].fy}` : 'latest'}, facts: [fact(shard, s, lang)],
    summary: L(lang, `${nameOf(ctx, t, 'en')}, ${lc(label(k, 'en'))} for ${fyText(shard, i, 'en')}: ${what}, from ${s.form} ${s.accession} filed ${s.filed}, chosen as ${how}. The chain FinScope reads for this figure: ${chain}.`,
      `${nameOf(ctx, t, 'zh')}${fyText(shard, i, 'zh')}的${label(k, 'zh')}：${what}，来自 ${s.filed} 提交的 ${s.form}（${s.accession}），选取方式为${how}。FinScope 对这个数字读取的标签顺序：${chain}。`),
    notes: [L(lang, 'The best tag in the chain that any 10-K reports for the period wins, then the latest filing with that tag. A later restatement under the same tag replaces the first-reported figure, and the data-quality notes say so.', '任何 10-K 为该期间报告过的、链中最靠前的标签优先，再取报告该标签的最新文件。同一标签后来的重述会替换最初报告的数字，数据质量说明会写明。'), ...noteFor(shard, k, [s], lang)]});
}

function qualityAnswer(r, p, ctx, t) {
  const lang = p.lang, shard = ctx.shardOf(t);
  const order = ['template', 'conflict', 'restated', 'amended', 'fiscal_shift', 'fiscal_gap', 'label', 'derived', 'fallback', 'note', 'missing'];
  const notes = [...shard.quality].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const counts = notes.reduce((m, q) => (m[q.kind] = (m[q.kind] || 0) + 1, m), {});
  const kinds = {template: ['template', '模板'], conflict: ['conflicting values', '数值冲突'], restated: ['changed in a later filing', '后续文件改变'], amended: ['from a 10-K/A', '来自 10-K/A'], fiscal_shift: ['fiscal year end moved', '财年末变更'], fiscal_gap: ['uncovered gap', '未覆盖的间隔'], label: ['fiscal-year label', '财年标注'], derived: ['composed from parts', '由组成部分合成'], fallback: ['fallback tag', '备用标签'], note: ['note', '说明'], missing: ['not reported', '未报告']};
  const summaryCounts = Object.entries(counts).map(([k, n]) => `${kinds[k]?.[lang === 'zh' ? 1 : 0] || k}: ${n}`).join(L(lang, '; ', '；'));
  return finish(r, {topic: 'data_quality', plan: {tickers: [t], metric: null, period: 'latest'},
    table: {columns: [L(lang, 'Kind', '类型'), L(lang, 'Note', '说明')], rows: notes.slice(0, 40).map(q => [kinds[q.kind]?.[lang === 'zh' ? 1 : 0] || q.kind, q.text])},
    summary: notes.length ? L(lang, `${nameOf(ctx, t, 'en')}: ${notes.length} data-quality notes over FY${shard.periods[0].fy}–FY${shard.periods.at(-1).fy} (${summaryCounts}). The table lists them; each stated figure's source line shows its tag and filing.`,
      `${nameOf(ctx, t, 'zh')}：${shard.periods[0].fy}–${shard.periods.at(-1).fy} 财年共有 ${notes.length} 条数据质量说明（${summaryCounts}）。表格逐条列出；每个陈述的数字的来源行都写明了标签和文件。`)
      : L(lang, `${nameOf(ctx, t, 'en')}: no data-quality notes: every supported figure was found under its first-choice tag, with no restatement, conflict or fiscal-year change.`, `${nameOf(ctx, t, 'zh')}：没有数据质量说明：所有支持的数字都用首选标签找到，没有重述、冲突或财年变更。`),
    notes: [L(lang, 'Notes are written by the build from the filings; the full shard is downloadable from the Financials page.', '这些说明由构建程序根据财报生成；完整数据可在“财务”页下载。')]});
}

function filingAnswer(r, p, ctx, t) {
  const lang = p.lang, shard = ctx.shardOf(t), last = shard.periods.at(-1), filing = shard.filings[last.accession] || {};
  const url = filingUrl(shard.cik, last.accession, filing.doc);
  return finish(r, {topic: 'filing', plan: {tickers: [t], metric: null, period: `FY${last.fy}`},
    facts: [{ticker: t, key: 'filing', label: L(lang, 'Latest 10-K', '最新 10-K'), value: null, display: last.accession, exact_usd: '—', unit: '', period_start: last.start, period_end: last.end, fiscal_year: last.fy, form: '10-K', tag: '—', filed: last.filed, accession: last.accession, url, filing_index_url: filingIndexUrl(shard.cik, last.accession), link_kind: filing.doc ? 'primary_document' : 'filing_directory'}],
    summary: L(lang, `${nameOf(ctx, t, 'en')}'s latest 10-K covers ${fyText(shard, shard.periods.length - 1, 'en')}, filed ${last.filed} (${last.accession}): ${url}`,
      `${nameOf(ctx, t, 'zh')}最新的 10-K 覆盖${fyText(shard, shard.periods.length - 1, 'zh')}，提交于 ${last.filed}（${last.accession}）：${url}`),
    notes: [L(lang, 'Newer 10-Q and 8-K filings are listed live on the Watch page.', '更新的 10-Q 和 8-K 可在“关注”页实时查看。')]});
}

function overviewAnswer(r, p, ctx, t) {
  const shard = ctx.shardOf(t);
  const keys = {bank: ['net_interest_income', 'noninterest_income', 'net_income', 'assets', 'deposits', 'equity'], insurance: ['revenue', 'premiums', 'net_income', 'assets', 'equity'], reit: ['revenue', 'net_income', 'operating_cash_flow', 'total_debt', 'real_estate'], industrial: ['revenue', 'gross_margin', 'operating_margin', 'net_income', 'operating_cash_flow', 'free_cash_flow', 'total_debt']}[shard.template];
  const res = figuresAnswer(r, p, ctx, t, keys);
  if (res.status === 'answered') res.topic = 'overview';
  res.offers = [L(p.lang, `Is ${t}'s profit backed by operating cash?`, `${t} 的利润有现金流支撑吗`), L(p.lang, `${t} data quality notes`, `${t} 的数据质量说明`), L(p.lang, `${t} revenue over the last five years`, `${t} 近五年的营收`)];
  return res;
}

const FILLER = /\b(the|of|for|in|a|an|about|please|pls|show|me|give|tell|latest|fy|data|numbers|figures|financials?|company|inc|corp|co)\b|的|是|吗|呢|啊|吧|最新|数据|看看|一下|查一下|查|请|给我|公司|情况|财务/g;
function onlyCompany(p) {
  let rest = p.low;
  for (const h of p.companySpans || []) rest = rest.slice(0, h.start) + ' '.repeat(h.end - h.start) + rest.slice(h.end);
  rest = rest.replace(FILLER, ' ').replace(/[\d\s\p{P}\p{S}]+/gu, '');
  return rest.length === 0;
}

// ------------------------------------------------------------------ entry point
// r: the base answer, p: the parsed question (companies as primary tickers), ctx: {prepared, shards, screen, asOf, latestDate}.
export function answerUniverse(r, p, ctx, helpers) {
  const lang = p.lang, c = p.cues, u = {...ctx, ...universeContext(ctx)};
  r.engine = {...r.engine, data: 'universe'};
  r.snapshot_date = ctx.prepared.index.built;
  r.universe_built = ctx.prepared.index.built;
  r.dataset_sha256 = null;
  const low = p.low;
  const has = re => re.test(low);
  if (ctx.asOf && ctx.latestDate && ctx.asOf < ctx.latestDate) return finish(r, {status: 'not_in_bundle', topic: 'info_date', summary: L(lang,
    `Universe figures are the latest filings (built ${ctx.prepared.index.built}); earlier information dates cover only the six deep-ledger companies' original figures. Choose “Use latest snapshot” above to ask this.`,
    `公司全集的数字是最新的文件（构建于 ${ctx.prepared.index.built}）；更早的信息日期只覆盖六家深度账本公司的原始数字。请点上方“使用最新快照”后再问。`)});
  for (const t of p.companies) if (!u.shardOf(t)) return finish(r, {status: 'not_in_bundle', topic: 'data_unavailable', plan: {...r.plan, tickers: [t]}, summary: L(lang,
    `The data for ${t} could not be loaded. Check your connection and ask again.`, `${t} 的数据没有加载成功。请检查网络后再问一次。`)});
  if (p.unsupported.length) return helpers.unsupported(r, p);
  if (p.badDates.length) return finish(r, {status: 'clarify', topic: 'clarify', summary: L(lang, `${p.badDates[0]} is not a valid calendar date.`, `${p.badDates[0]} 不是有效的日期。`)});
  if (c.forecast || c.stockMove) return finish(r, {status: 'refused', topic: 'forecast', plan: {...r.plan, tickers: [...p.companies]}, summary: L(lang,
    'FinScope does not forecast. It reports what companies have already filed with the SEC.', 'FinScope 不做预测，只报告公司已经向 SEC 提交的数字。')});
  const ucos = p.companies.filter(t => !helpers.six.includes(t));
  if ((c.quarterSpecific || c.ytd) && (ucos.length || p.metrics.some(m => UNIVERSE_ONLY.has(m)))) return finish(r, {status: 'not_in_bundle', topic: 'quarter_history', plan: {...r.plan, tickers: [...p.companies]}, summary: L(lang,
    `Quarterly and year-to-date figures are not in the universe data, which holds annual 10-K figures for the latest ten fiscal years. Only the six deep-ledger companies (AAPL, MSFT, NVDA, AMZN, GOOGL, META) have a year-to-date checkpoint, for revenue, net income, operating income and operating cash flow.`,
    `公司全集只有最近十个财年的 10-K 年度数字，没有季度或年初至今数据。只有六家深度账本公司（AAPL、MSFT、NVDA、AMZN、GOOGL、META）有年初至今对比，且只含营收、净利润、营业利润和经营现金流。`),
    offers: p.companies.slice(0, 1).map(t => L(lang, `${t} latest fiscal year revenue`, `${t} 最新财年的营收`))});
  if (c.calendar) {
    const off = p.companies.filter(t => u.shardOf(t).periods.at(-1).end.slice(5, 7) !== '12');
    if (off.length) return finish(r, {status: 'not_in_bundle', topic: 'calendar_year', plan: {...r.plan, tickers: [...p.companies]}, summary: L(lang,
      `Calendar-year figures are not held for ${off.join(', ')}: their fiscal years do not end in December. Ask by fiscal year.`, `${off.join('、')} 的财年不在十二月结束，没有自然年数据，请按财年提问。`)});
  }
  const metricKeys = p.metrics.filter(m => SUPPORTED.has(m));
  // Definitions without a company.
  if (c.definition && !p.companies.length && metricKeys.length) return universeDefinition(r, p, metricKeys) || helpers.definition(r, p);
  if (!p.companies.length) {
    if (has(UCUE.universeRank) || c.rank) return finish(r, {status: 'not_in_bundle', topic: 'universe_rank', plan: {...r.plan, metric: metricKeys[0] || null}, summary: L(lang,
      'Rankings across a sector or the whole universe are on the Screen page (sort and filter, with sector percentiles and a CSV with sources). In this box, name the companies to compare, up to eight.',
      '跨行业或全体公司的排名请用“筛选”页（可排序、筛选，有行业百分位，CSV 附来源）。在这里请点名要比较的公司，最多八家。'),
      offers: [L(lang, 'Compare KO, PEP and MDLZ gross margin', '比较 KO、PEP 和 MDLZ 的毛利率')]});
    return finish(r, {status: 'clarify', topic: 'ambiguous', plan: {...r.plan, metric: metricKeys[0] || null}, summary: L(lang,
      `Which company? Name a ticker or company name; the universe holds ${ctx.prepared.index.count} US large accelerated filers.`, `哪家公司？请写出代码或公司名；公司全集包括 ${ctx.prepared.index.count} 家美国大型加速申报公司。`)});
  }
  if (p.companies.length > 8) return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [...p.companies]}, summary: L(lang, 'Compare at most eight companies at a time.', '一次最多比较八家公司。')});
  const t = p.companies[0];
  const sel = helpers.selectFigures(p);
  const key = sel.metric || metricKeys[0] || null;
  if (has(UCUE.quality) && !has(UCUE.lineage)) return p.companies.length === 1 ? qualityAnswer(r, p, u, t) : helpers.oneAtATime(r, p, 'quality');
  if (has(UCUE.lineage) && !c.provenance) return p.companies.length === 1 ? lineageAnswer(r, p, u, t, key) : helpers.oneAtATime(r, p, 'lineage');
  if (c.filingLink || (c.filingDoc && !metricKeys.length && !c.cashSupport)) return p.companies.length === 1 ? filingAnswer(r, p, u, t) : helpers.oneAtATime(r, p, 'filing');
  const screenKey = ['cash_conversion', 'accruals', 'fcf_margin'].includes(key) ? key : (c.cashSupport || !key ? 'cash_conversion' : null);
  if (has(UCUE.sector) && (has(UCUE.percentile) || c.rank || c.compare)) {
    if (p.companies.length !== 1) return helpers.oneAtATime(r, p, 'sector');
    if (!screenKey) return finish(r, {status: 'not_in_bundle', topic: 'sector_rank', plan: {tickers: [t], metric: key, period: 'latest'}, summary: L(lang,
      `Sector percentiles are computed for cash conversion, the accrual ratio and FCF margin. For ${lc(label(key, 'en'))}, compare named companies instead.`, `行业百分位只计算现金转化率、应计比率和自由现金流利润率。${label(key, 'zh')}请点名几家公司比较。`),
      offers: [L(lang, `Where does ${t} rank in its sector on cash conversion?`, `${t} 的现金转化率在行业里排第几`)]});
    return sectorRankAnswer(r, p, u, t, screenKey);
  }
  if (sel.decline) return helpers.declineCombination(r, p, sel.decline);
  // Profit (net income) with any word beyond size, amount or direction asks about its quality: cash support.
  if (key === 'net_income' && !sel.figures && !c.trend && !c.change && !p.range && !p.lastN && p.yearOrder.length < 2 && helpers.profitEvaluative(p)) {
    if (p.companies.length === 1) return cashSupportAnswer(r, p, u, t);
    return compareAnswer(r, p, u, p.companies, 'cash_conversion');
  }
  if (sel.route === 'cash_support' || (c.cashSupport && p.companies.length === 1 && !key)) return cashSupportAnswer(r, p, u, t);
  if (c.cashSupport && p.companies.length === 1 && ['cash_conversion', 'net_income', 'operating_cash_flow'].includes(key) && !c.trend && !c.change) return cashSupportAnswer(r, p, u, t);
  if (sel.figures) {
    if (p.companies.length === 1 && !c.trend && !c.change && !p.range && !p.lastN && p.yearOrder.length < 2) return figuresAnswer(r, p, u, t, sel.figures.filter(k => SUPPORTED.has(k)));
    return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [...p.companies], metrics: sel.figures}, summary: L(lang,
      'Ask about one figure at a time for comparisons, trends and changes. For one company, several figures for the same year can be listed together.', '比较、走势和变化请一次问一个数字。同一家公司同一年的几个数字可以一起列出。')});
  }
  if (!key) {
    if (p.companies.length === 1 && (has(UCUE.overview) || onlyCompany(p))) return overviewAnswer(r, p, u, t);
    if (p.companies.length === 1) return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [t]}, summary: L(lang,
      `Which figure for ${nameOf(u, t, 'en')}? FinScope did not recognise one in the question, so it states none rather than guess. For example: revenue, gross margin, net income, free cash flow, total debt, ROE, or "tell me about ${t}".`,
      `要 ${nameOf(u, t, 'zh')} 的哪个数字？问题里没有读出可识别的指标，所以不猜测、不给数字。例如：营收、毛利率、净利润、自由现金流、有息负债、净资产收益率，或“介绍一下 ${t}”。`),
      offers: [L(lang, `Tell me about ${t}`, `介绍一下 ${t}`), L(lang, `${t} revenue over the last five years`, `${t} 近五年的营收`)]});
    return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [...p.companies]}, summary: L(lang, 'Which figure should be compared? For example revenue, gross margin or free cash flow.', '要比较哪个数字？例如营收、毛利率或自由现金流。'),
      offers: [L(lang, `Compare ${p.companies.join(', ')} revenue`, `比较 ${p.companies.join('、')} 的营收`)]});
  }
  if (p.companies.length >= 2) {
    if (c.trend || p.range || p.lastN) return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [...p.companies], metric: key}, summary: L(lang, 'Trends are shown one company at a time. Pick one:', '走势一次只显示一家公司，请选一家：'),
      offers: p.companies.map(x => L(lang, `${x} ${lc(label(key, 'en'))} trend`, `${x} 近几年的${label(key, 'zh')}`))});
    let k = key;
    if ((c.growthCompare || c.growthRank || (c.change && p.yearOrder.length < 2)) && isFigure(k)) k = k === 'revenue' ? 'revenue_growth' : k;
    const superlative = p.companies.length >= 3 && /最(?!新|近|后)|highest|lowest|best|worst|\bmost\b|\bleast\b|\btop\b|\brank|排名|排序|排行/.test(low);
    return compareAnswer(r, p, u, p.companies, k, {rank: superlative, low: superlative && c.low});
  }
  if (c.trend || p.range || p.lastN || p.years.length >= 3 || /哪年|哪一年|which year|what year|best year|worst year|\bpeak\b|record year|历史最高|历史最低|最高的一年|最低的一年/.test(low)) return trendAnswer(r, p, u, t, key);
  if ((c.change && !c.definition) || p.years.length === 2) return changeAnswer(r, p, u, t, key);
  // With a company named, "what is X's Y" is a lookup, and "why is X negative" states the figure with a note on causes.
  const answer = metricAnswer(r, p, u, t, key);
  if (c.why && answer.status === 'answered') answer.notes.push(L(lang, 'The figures do not state causes; read management’s discussion and the notes in the filing for the reasons.', '数字本身不说明原因；原因请读财报中的管理层讨论和附注。'));
  return answer;
}
