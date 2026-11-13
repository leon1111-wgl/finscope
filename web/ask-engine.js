// Ask the ledger: tier-1 answers to a visitor's own question.
// Fixed rules over the saved evidence bundle, run wherever this module runs (the page or
// scripts/ask.mjs). No language model, no network request and no storage. The program states
// every number and names the SEC fact (form, XBRL tag, period, filing date, link) behind it.
import {selectSnapshot} from './research-math.js';
import {prepareIndex, matchCompanies, matchOutside, entryOf, primary} from './universe-data.js';
import {answerUniverse, UNIVERSE_ONLY, UCUE, universeDefinition} from './universe-ask.js';

export const ENGINE = {
  id: 'finscope-rules',
  version: '1.1.0',
  tier: 1,
  label: {
    en: 'FinScope rules v1.1 · tier 1 · fixed rules over the saved SEC evidence, run in your browser · no language model',
    zh: 'FinScope 规则引擎 v1.1 · 第一层 · 在浏览器里按固定规则读取已保存的 SEC 证据 · 没有使用语言模型'
  }
};
export const MAX_QUESTION = 300;
export const TICKERS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META'];
const ZH_NAME = {AAPL: '苹果', MSFT: '微软', NVDA: '英伟达', AMZN: '亚马逊', GOOGL: '谷歌', META: 'Meta'};
const EN_NAME = {AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMZN: 'Amazon', GOOGL: 'Alphabet', META: 'Meta'};

// ---------------------------------------------------------------- normalisation
// Traditional characters that occur in the closed vocabulary below, mapped to simplified.
const T2S = Object.fromEntries([...'賺蘋軟偉輝達亞馬遜臉書營淨負債資產應帳賬潤經動歷圖嗎買賣價漲長變獲對這個們麼來為會計準據與間異標報庫貨開總稅費錢銷額幣樣還轉換覆蓋虧損誰數時說從於幾進處現實際預測將給讓問題網頁鏈結財務詐騙紅員發構業級純毛關係區別差較點並讀載檔類評於腦嗎國趨勢舊攤權勵義億萬寫碼氣詩譯餘屬選優覽'].map((c, i) => [c, '赚苹软伟辉达亚马逊脸书营净负债资产应账账润经动历图吗买卖价涨长变获对这个们么来为会计准据与间异标报库货开总税费钱销额币样还转换覆盖亏损谁数时说从于几进处现实际预测将给让问题网页链结财务诈骗红员发构业级纯毛关系区别差较点并读载档类评于脑吗国趋势旧摊权励义亿万写码气诗译余属选优览'[i]]));

const CN_DIGIT = {零: 0, '〇': 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};
export function normalize(text) {
  let s = String(text ?? '').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, ' ');
  // Years written in Chinese numerals (二零二四年) become digits; nothing else is converted.
  s = s.replace(/[零〇一二三四五六七八九]{4}(?=\s*(年|财年))/g, m => [...m].map(c => CN_DIGIT[c]).join(''));
  s = Array.from(s, c => T2S[c] || c).join('');
  return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const latin = alias => /^[a-z0-9 .&/'+-]+$/.test(alias);
const aliasPattern = alias => latin(alias)
  ? new RegExp(`(?<![a-z0-9])${esc(alias).replace(/ /g, '[\\s_-]*')}(?![a-z0-9])`, 'g')
  : new RegExp(esc(alias), 'g');

// Longest match first; a shorter alias inside an accepted span is ignored.
function findSpans(low, table) {
  const hits = [];
  for (const [alias, kind, id] of table) for (const m of low.matchAll(aliasPattern(alias))) hits.push({start: m.index, end: m.index + m[0].length, kind, id, alias});
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken = [];
  for (const h of hits) if (!taken.some(t => h.start < t.end && t.start < h.end)) taken.push(h);
  return taken.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- vocabulary
const COMPANY_ALIASES = {
  AAPL: ['aapl', 'apple', 'apple inc', 'aple', 'appel', '苹果公司', '苹果'],
  MSFT: ['msft', 'microsoft', 'microsft', 'mircosoft', 'microsfot', '微软'],
  NVDA: ['nvda', 'nvidia', 'nvida', 'nvdia', 'nivdia', '英伟达', '辉达', '英伟'],
  AMZN: ['amzn', 'amazon', 'amazon.com', 'amazn', 'amzon', 'amazom', '亚马逊'],
  GOOGL: ['googl', 'goog', 'google', 'alphabet', 'gogle', 'googel', '谷歌'],
  META: ['meta platforms', 'meta', 'facebook', 'fb', '脸书', '脸谱']
};
const COMPANY_TABLE = Object.entries(COMPANY_ALIASES).flatMap(([t, list]) => list.map(a => [a, 'company', t]));

// Companies outside the bundle, by name or ticker. Capitalised tickers are also caught below.
const OTHER_COMPANIES = ['tesla', '特斯拉', 'tsla', 'netflix', '奈飞', '网飞', 'nflx', 'berkshire', '伯克希尔', 'brk', '贵州茅台', '茅台', 'moutai', '腾讯', 'tencent', '阿里巴巴', '阿里', 'alibaba', 'baba', '百度', 'baidu', 'bidu', '京东', 'jd.com', '拼多多', 'pdd', '台积电', 'tsmc', 'tsm', '三星', 'samsung', '小米', 'xiaomi', '华为', 'huawei', '比亚迪', 'byd', 'intel', '英特尔', 'intc', 'amd', '超威', 'ibm', 'oracle', '甲骨文', 'orcl', 'salesforce', 'adobe', 'adbe', 'qualcomm', '高通', 'qcom', 'broadcom', '博通', 'avgo', 'cisco', '思科', 'csco', 'uber', '优步', 'disney', '迪士尼', 'coca-cola', 'coca cola', '可口可乐', 'walmart', '沃尔玛', 'wmt', 'boeing', '波音', 'jpmorgan', 'jp morgan', '摩根大通', 'jpm', 'goldman sachs', '高盛', 'twitter', '推特', 'openai', 'palantir', 'pltr', '美团', 'meituan', '字节跳动', 'bytedance', 'tiktok', '蔚来', '小鹏', '理想汽车', '宁德时代', '中国石油', '工商银行', '中国平安', 'costco', '好市多', 'nike', '耐克', 'starbucks', '星巴克', "mcdonald's", 'mcdonalds', '麦当劳', 'pfizer', '辉瑞', 'paypal', 'shopify', 'spotify', 'micron', '美光', 'dell', '戴尔', 'arm holdings', 'sony', '索尼', 'toyota', '丰田', 'berkshire hathaway', 'exxon', '埃克森', 'johnson & johnson', '强生', 'visa inc', 'mastercard', '万事达', 'snowflake', 'zoom', 'airbnb', 'nio', 'xpeng', 'li auto', 'pinduoduo', 'asml', 'sap', 'lvmh', 'nestle', '雀巢', '贵州茅台酒'];
const OTHER_TABLE = OTHER_COMPANIES.map(a => [a, 'other', a]);
export const NOT_TICKERS = new Set(['EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'CAD', 'AUD', 'CHF', 'TTM', 'LTM', 'CET', 'NIM', 'SEC', 'XBRL', 'GAAP', 'US', 'USA', 'USD', 'EPS', 'PE', 'ROE', 'ROA', 'ROIC', 'FCF', 'OCF', 'CFO', 'YOY', 'QOQ', 'YTD', 'TTM', 'FY', 'CEO', 'CFO', 'AI', 'IPO', 'ETF', 'API', 'JSON', 'CSV', 'PDF', 'EBIT', 'EBITDA', 'DCF', 'CAPEX', 'AR', 'AP', 'NI', 'OK', 'LOL', 'PS', 'IT', 'ID', 'UK', 'EU', 'CN', 'HK', 'NYSE', 'NASDAQ', 'SP', 'GDP', 'CPI', 'FED', 'IRS', 'DQC', 'URL', 'HTML', 'AWS', 'SBC', 'DA', 'PP', 'PPE', 'SGA', 'COGS', 'BTW', 'FYI', 'ASAP', 'IS', 'THE', 'AND', 'OR', 'OF', 'TO', 'IN', 'FOR', 'VS', 'AN', 'ON', 'AT', 'BY', 'MY', 'ME', 'WE', 'DO', 'BE', 'NO', 'HI', 'SO', 'UP', 'IF', 'HOW', 'WHAT', 'WHY', 'WHO', 'TTL', 'Q', 'QA', 'FAQ', 'MD', 'AM', 'PM', 'GPU', 'CPU', 'PC', 'TV', 'CTO', 'COO', 'HR', 'PR', 'ESG', 'EV', 'VR', 'ML', 'LLM', 'SAAS', 'ARR', 'MAU', 'DAU', 'ADS', 'APP', 'APPS', 'IOS', 'OS', 'NYC', 'SF', 'LA', 'UAE', 'IP', 'R', 'RMB', 'UTC', 'EST', 'CN', 'RMB', 'OTC', 'ADR', 'GMT', 'LTM', 'NTM', 'MRQ', 'KPI', 'OKR', 'CAGR', 'WACC', 'ROI', 'NPV', 'IRR', 'BS', 'IS', 'CF', 'PL', 'PNL', 'OPEX', 'RND', 'RD', 'IR', 'CIK', 'EDGAR', 'TL', 'DR', 'TLDR', 'ELI', 'PLS', 'THX', 'TY', 'IMO', 'IMHO', 'WTF', 'OMG', 'FB']);

// Figures, indicators, look-alikes the bundle does not hold, and bridge lines.
const METRIC_ALIASES = {
  revenue: ['营收', '营业收入', '营业总收入', '总营收', '收入', '销售额', '销售收入', '营业额', '总收入', '主营收入', 'revenue', 'revenues', 'net sales', 'sales', 'total revenue', 'top line', 'topline', 'rev', 'revs', 'revnue', 'revenu', 'reveune'],
  net_income: ['净利润', '净利', '纯利', '净收益', '净收入', '税后利润', '归母净利润', '利润', '盈利', '赚了多少钱', '赚多少钱', '赚了多少', '赚多少', '赚钱', '赚了', 'net income', 'net profit', 'net earnings', 'profit', 'profits', 'earnings', 'bottom line', 'net incom', 'net imcome', 'net icome', 'ni'],
  operating_income: ['营业利润', '经营利润', '营运利润', '经营性利润', '营业利益', 'operating income', 'operating profit', 'income from operations', 'operating earnings', 'op income', 'op inc'],
  operating_cash_flow: ['经营活动现金流量净额', '经营活动产生的现金流量净额', '经营活动产生的现金流', '经营活动现金流量', '经营活动现金流', '经营活动的现金流', '经营现金流量', '经营现金流', '经营性现金流', '营运现金流', '经营现金', '现金流量', '现金流', 'operating cash flow', 'operating cash flows', 'cash flow from operations', 'cash flows from operations', 'cash from operations', 'cash from operating activities', 'net cash provided by operating activities', 'operating cash', 'ocf', 'cash flow', 'cash flows', 'cashflow'],
  assets: ['总资产', '资产总额', '资产总计', '资产规模', '资产', 'total assets', 'assets'],
  liabilities: ['总负债', '负债总额', '负债合计', '负债', 'total liabilities', 'liabilities', 'total liabs', 'liabs', 'liabilites', 'liabilties'],
  current_assets: ['流动资产', 'current assets'],
  current_liabilities: ['流动负债', 'current liabilities'],
  cash: ['现金及现金等价物', '现金和现金等价物', '现金及等价物', '现金等价物', '现金储备', '账上现金', '账面现金', '手上现金', '手头现金', '持有现金', '现金余额', '现金', 'cash and cash equivalents', 'cash & cash equivalents', 'cash and equivalents', 'cash & equivalents', 'cash on hand', 'cash balance', 'cash pile', 'cash reserves', 'cash position', 'cash'],
  capex: ['资本开支', '资本支出', '资本性支出', '购建固定资产', '资本投入', 'capex', 'cap ex', 'capital expenditure', 'capital expenditures', 'capital spending', 'purchases of property and equipment'],
  operating_margin: ['营业利润率', '经营利润率', '营运利润率', '营业利益率', 'operating margin', 'operating profit margin', 'operating income margin', 'op income margin', 'op margin', 'operating margins'],
  net_margin: ['净利率', '净利润率', '销售净利率', '纯利率', '利润率', 'net margin', 'net profit margin', 'profit margin', 'net income margin', 'profit margins'],
  cash_margin: ['经营现金流利润率', '经营现金利润率', '现金流利润率', '现金利润率', '经营现金流率', '经营现金率', '现金流率', 'cash margin', 'operating cash margin', 'cash flow margin', 'ocf margin', 'operating cash flow margin'],
  current_ratio: ['流动比率', '流动比', 'current ratio', 'curr ratio', 'cur ratio'],
  liabilities_assets: ['资产负债率', '负债率', '负债比率', '负债资产比', '负债占资产', 'liabilities to assets', 'liabilities/assets', 'liabilities-to-assets', 'liabilities / assets', 'debt ratio', 'debt to assets', 'debt-to-assets', 'debt-to-asset', 'liabilities ratio', 'liability ratio'],
  cash_coverage: ['现金覆盖率', '现金比率', '现金覆盖', 'cash coverage', 'cash ratio', 'cash to current liabilities'],
  accruals: ['应计比率', '应计利润率', '应计项目', '应计利润', '应计', 'accrual ratio', 'accruals ratio', 'sloan accruals', 'accruals', 'accrual'],
  revenue_growth: ['营收增长率', '营收增速', '收入增长率', '收入增速', '营业收入增长率', '营业收入增速', '销售增长率', 'revenue growth rate', 'revenue growth', 'sales growth', 'top-line growth', 'topline growth'],
  cash_conversion: ['现金转化率', '现金转化', '现金转换', '利润转化为现金', '利润转化成现金', '现金转换率', '利润现金含量', '盈利现金含量', '净利润现金含量', '净现比', '现金含量', '利润含金量', 'cash conversion ratio', 'cash conversion rate', 'cash conversion', 'ocf to net income', 'ocf/net income', 'ocf / net income', 'ocf/ni', 'operating cash flow to net income', 'cash-to-profit', 'cash to profit', 'cash conv'],
  free_cash_flow: ['自由现金流量', '自由现金流', 'free cash flow', 'free cash flows', 'fcf'],
  profit_cash_gap: ['利润与现金差距', '利润和现金差距', '利润和现金流差距', '利润与现金流差距', '利润现金差距', '利润现金差', 'profit-to-cash gap', 'profit to cash gap', 'profit cash gap'],
  // 0.3.0 universe figures (answered from web/data/universe shards; see universe-ask.js).
  cost_of_revenue: ['营业成本', '销售成本', '主营业务成本', 'cost of revenue', 'cost of revenues', 'cost of sales', 'cost of goods sold', 'cogs'],
  gross_profit: ['毛利润', '毛利', 'gross profit', 'gp'],
  gross_margin: ['毛利率', 'gross margin', 'gross margins', 'gross profit margin'],
  rnd: ['研发费用', '研发支出', '研发投入', '研发开支', '研发', 'r&d expense', 'r&d expenses', 'r&d spending', 'r&d', 'r & d', 'rnd', 'research and development', 'research & development'],
  rnd_intensity: ['研发费用率', '研发强度', '研发投入占比', '研发占营收', '研发率', 'rnd率', 'rnd 率', 'r&d率', 'r&d 率', 'rnd intensity', 'rnd ratio', 'r&d intensity', 'r&d as a percentage of revenue', 'r&d as % of revenue', 'r&d to revenue', 'r&d ratio'],
  sga: ['销售及管理费用', '销售和管理费用', '销售、一般及管理费用', '销售管理费用', 'sg&a', 'sga', 'selling, general and administrative', 'selling general and administrative', 'selling, general & administrative'],
  interest_expense: ['利息支出', '利息费用', '利息开支', '利息', 'interest expense', 'interest expenses', 'interest cost', 'interest costs'],
  pretax_income: ['利润总额', '税前利润', '税前收入', 'pretax income', 'pre-tax income', 'income before tax', 'income before taxes', 'income before income taxes', 'pretax profit', 'pre-tax profit'],
  income_tax: ['所得税费用', '所得税', '税费', '缴税', '交了多少税', 'income tax', 'income taxes', 'income tax expense', 'tax expense', 'taxes', 'tax'],
  eps_diluted: ['稀释每股收益', '每股收益', '每股盈利', '每股净利', '每股利润', 'eps', 'diluted eps', 'earnings per share', 'diluted earnings per share'],
  shares_diluted: ['稀释股数', '稀释加权平均股数', '加权平均股数', 'diluted shares', 'weighted average shares', 'weighted-average shares', 'diluted share count', 'diluted shares outstanding'],
  dividends: ['现金分红', '分红', '股息', '派息', 'dividends paid', 'cash dividends', 'dividends', 'dividend', 'divs', 'div', 'divvies'],
  buybacks: ['股票回购', '股份回购', '回购', 'share buybacks', 'buybacks', 'buyback', 'share repurchases', 'share repurchase', 'stock repurchases', 'stock buybacks', 'repurchases', 'repurchase'],
  cash_sti: ['现金及短期投资', '现金和短期投资', '现金及有价证券', '现金和有价证券', '现金及投资', 'cash and short-term investments', 'cash and short term investments', 'cash & short-term investments', 'cash and marketable securities', 'cash, cash equivalents and marketable securities', 'cash, cash equivalents and short-term investments', 'cash and investments'],
  equity: ['股东权益合计', '股东权益', '所有者权益', '净资产', 'shareholders equity', "shareholders' equity", 'stockholders equity', "stockholders' equity", 'total equity', 'book value', 'equity'],
  total_debt: ['有息负债', '总债务', '债务总额', '总借款', '债务', '借款', '负债里的借款', 'total debt', 'debt', 'borrowings', 'total borrowings'],
  debt_to_equity: ['债务权益比', '债务股本比', '有息负债权益比', 'debt to equity', 'debt-to-equity', 'debt/equity', 'd/e ratio', 'd/e'],
  interest_coverage: ['利息保障倍数', '利息覆盖率', '利息覆盖倍数', '已获利息倍数', 'interest coverage', 'interest coverage ratio', 'times interest earned', 'int coverage', 'int cov', 'interest cov'],
  roe: ['净资产收益率', '股东权益回报率', '权益回报率', '权益收益率', 'roe', 'return on equity'],
  roa: ['总资产收益率', '资产回报率', '总资产回报率', '资产收益率', 'roa', 'return on assets'],
  fcf_margin: ['自由现金流利润率', '自由现金流率', '自由现金流占营收', 'free cash flow margin', 'fcf margin'],
  payout: ['股东回报', '股东回馈', '分红加回购', '分红和回购', '分红与回购', 'shareholder payout', 'shareholder returns', 'capital returned to shareholders', 'total payout', 'dividends and buybacks', 'dividends plus buybacks'],
  net_interest_income: ['净利息收入', '利息净收入', 'net interest income', 'net int income', 'nii'],
  noninterest_income: ['非利息收入', 'noninterest income', 'non-interest income', 'non interest income', 'non int income', 'non-int income', 'nonint income', 'fee income'],
  provision: ['信贷损失准备', '贷款损失准备', '信用损失准备', '拨备', '信用减值损失', 'provision for credit losses', 'provision for loan losses', 'credit loss provision', 'loan loss provision', 'loan loss provisions', 'provisions', 'provision'],
  deposits: ['客户存款', '存款', 'total deposits', 'deposits'],
  loans: ['贷款净额', '贷款总额', '贷款', 'net loans', 'total loans', 'loan book', 'loans'],
  premiums: ['已赚保费', '保费收入', '保费', 'premiums earned', 'net premiums earned', 'premium revenue', 'premiums'],
  net_investment_income: ['净投资收益', 'net investment income', 'investment income'],
  real_estate: ['投资性房地产', '房地产净值', '房地产投资', 'real estate investments', 'real estate assets', 'net real estate', 'real estate, net', 'real estate', 'investment property', 'investment properties', 'rental properties']
};
const UNSUPPORTED = {
  basic_eps: [['基本每股收益', 'basic eps', 'basic earnings per share'], 'Basic earnings per share (FinScope holds diluted EPS as reported)', '基本每股收益（FinScope 只有报告的稀释每股收益）'],
  segment: [['分部收入', '分业务', '各业务', '业务收入', '美国市场', '在美国', '美国收入', 'in the us', 'in the u.s.', 'in china', 'in europe', 'by segment', 'segment revenue', '分部', '业务板块', '板块收入', '云业务', '云计算收入', '云收入', '广告收入', '数据中心收入', '游戏收入', '服务收入', 'aws', 'azure', 'google cloud', 'iphone', 'ipad', 'xbox', 'segment', 'segments', 'data center revenue', 'advertising revenue', 'ad revenue', 'cloud revenue', 'services revenue', '大中华区', '中国区', '中国市场', '美国以外', '海外', '国际业务', '地区', '区域', '按地区', '按产品', '分产品', '分地区', 'greater china', 'china', '中国', 'americas', 'europe', '欧洲', 'japan', '日本', 'by region', 'by geography', 'geographic', 'geography', 'region', 'regional', 'outside the united states', 'outside the us', 'outside the u.s.', 'international', 'by product', 'product line', 'product lines', '收入来源', '营收来源', '收入构成', '营收构成', '利润来源', '收入结构', 'revenue sources', 'sources of revenue', 'revenue breakdown', 'revenue mix', 'gpu', 'gpus', 'gaming', 'data center', '数据中心', '游戏', '显卡', '芯片', 'chips'], 'Segment, product or geographic figures', '分部、产品或地区数据'],
  debt: [['长期债务', '短期债务', '净债务', '净现金', '债券', 'long-term debt', 'short-term debt', 'notes payable', 'net debt', 'net cash'], 'Long-term or short-term debt alone, or net debt (FinScope holds total debt, with its parts in the source line)', '单独的长期或短期债务、净债务（FinScope 有总债务，来源行列出组成部分）'],
  payout_ratio: [['分红率', '派息率', '股息支付率', 'payout ratio', 'dividend payout ratio'], 'The dividend payout ratio', '分红率'],
  employees: [['员工人数', '员工', '雇员', '人数', 'headcount', 'employees', 'employee count', 'staff'], 'Employee counts', '员工人数'],
  ebitda: [['息税折旧摊销前利润', '息税前利润', 'ebitda', 'ebit'], 'EBIT and EBITDA', 'EBIT 与 EBITDA'],
  investing_cf: [['投资活动现金流量', '投资活动现金流', '投资活动产生的现金流', '投资现金流', '投资活动', 'investing cash flow', 'cash flow from investing', 'cash flows from investing', 'investing activities', 'investing cash'], 'Investing cash flow', '投资活动现金流'],
  financing_cf: [['筹资活动现金流量', '筹资活动现金流', '融资活动现金流', '筹资现金流', '融资现金流', '筹资活动', '融资活动', 'financing cash flow', 'cash flow from financing', 'cash flows from financing', 'financing activities', 'financing cash'], 'Financing cash flow', '筹资活动现金流'],
  returns: [['资本回报率', '投入资本回报率', '投资回报率', 'roic', 'return on invested capital', 'return on capital'], 'Return on invested capital', '投入资本回报率'],
  interest: [['利息收入', 'interest income'], 'Gross interest income (FinScope holds interest expense, and net interest income for banks)', '利息收入（FinScope 有利息支出，银行另有净利息收入）'],
  tax: [['有效税率', '实际税率', '税率', 'tax rate', 'effective tax rate'], 'The effective tax rate', '有效税率'],
  costs: [['营业费用', '销售费用', '管理费用', '运营费用', '营业开支', '销售和营销', '营销费用', '成本', 'opex', 'operating expenses', 'total expenses', 'expenses', 'sales and marketing', 'selling and marketing', 'marketing and sales', 'marketing expense', 'marketing expenses'], 'Total operating expenses, or selling or administrative expense alone (FinScope holds cost of revenue and SG&A)', '营业费用总额，或单独的销售费用、管理费用（FinScope 有营业成本和销售及管理费用）'],
  shares: [['股本', '流通股', '股份数', '总股本', 'shares outstanding', 'share count'], 'Shares outstanding at year end (FinScope holds weighted-average diluted shares)', '年末股本（FinScope 只有加权平均稀释股数）'],
  goodwill: [['商誉', '无形资产', 'goodwill', 'intangible assets', 'intangibles'], 'Goodwill and intangibles', '商誉与无形资产'],
  ppe: [['固定资产', 'property and equipment', 'pp&e', 'ppe'], 'Property and equipment balance', '固定资产余额'],
  deferred_revenue: [['递延收入', '合同负债', 'deferred revenue', 'unearned revenue'], 'Deferred revenue', '递延收入'],
  investments: [['短期投资', '有价证券', '可交易证券', 'marketable securities', 'short-term investments'], 'Short-term investments on their own (FinScope holds cash and cash equivalents, and cash plus short-term investments)', '单独的短期投资（FinScope 有现金及现金等价物，以及现金加短期投资）'],
  currency: [['人民币', '换算成人民币', '折合人民币', '欧元', '日元', '港币', '港元', 'rmb', 'cny', 'yuan', 'euros', 'in euro', 'in eur', 'eur', 'yen', 'jpy', 'in gbp', 'gbp', 'hkd'], 'Currency conversion (all figures are reported in USD)', '货币换算（所有数字均为财报中的美元）'],
  other_ratios: [['速动比率', '速动比', '存货周转率', '存货周转', '应收账款周转率', '应收账款周转', '总资产周转率', '资产周转率', '产权比率', '负债权益比', '权益乘数', 'quick ratio', 'acid test', 'acid-test ratio', 'inventory turnover', 'receivables turnover', 'asset turnover', 'days sales outstanding', 'dso', 'equity multiplier', 'liabilities to equity'], 'That ratio (FinScope computes only its defined indicators)', '这个比率（FinScope 只计算已定义的指标）'],
  non_gaap: [['非公认会计准则', '非gaap', '经调整', '调整后', 'ffo', 'affo', 'funds from operations', 'adjusted funds from operations', 'non-gaap', 'non gaap', 'adjusted eps', 'adjusted ebitda', 'adjusted earnings', 'adjusted net income', 'core earnings'], 'Non-GAAP figures (FFO, adjusted EPS, adjusted EBITDA and similar)', '非公认会计准则数字（FFO、调整后每股收益、调整后 EBITDA 等）'],
  per_share: [['每股净资产', '每股', 'per share', 'per-share', 'book value per share'], 'Per-share figures other than reported diluted EPS', '除报告的稀释每股收益以外的每股数据'],
  cagr: [['年复合增长率', '复合年增长率', '复合增长率', 'cagr', 'compound annual growth'], 'Compound annual growth rates', '复合增长率'],
  quarter_history: [], // filled by period rules
  receivables_balance: [[], 'Accounts receivable balance (only the year-to-date change is in the bundle)', '应收账款余额（证据包里只有年初至今的变动）'],
  inventory_balance: [[], 'Inventory balance (only the year-to-date change is in the bundle)', '存货余额（证据包里只有年初至今的变动）'],
  payables_balance: [[], 'Accounts payable balance (only the year-to-date change is in the bundle)', '应付账款余额（证据包里只有年初至今的变动）']
};
const BRIDGE_ALIASES = {
  depreciation: ['折旧和摊销', '折旧及摊销', '折旧摊销', '折旧', '摊销', 'depreciation and amortization', 'depreciation & amortization', 'depreciation', 'amortization', 'd&a'],
  share_based_compensation: ['股权激励费用', '股权激励', '股份支付', '股票薪酬', '股权薪酬', '股份薪酬', 'stock-based compensation', 'stock based compensation', 'share-based compensation', 'share based compensation', 'stock comp', 'sbc'],
  receivables: ['应收账款', '应收款项', '应收款', '应收', 'accounts receivable', 'receivables', 'receivable'],
  inventory: ['存货', '库存', 'inventory', 'inventories'],
  payables: ['应付账款', '应付款', '应付', 'accounts payable', 'payables', 'payable']
};
const PRICE_ALIASES = ['股价', '股票价格', '价格', '市值', '市盈率', '市净率', '市销率', '估值', '股息率', '收盘价', '波动率', 'p/e', 'pe ratio', 'pe', 'price to earnings', 'p/b', 'share price', 'stock price', 'price', 'market cap', 'market capitalization', 'market value', 'valuation', 'dividend yield', 'beta', 'volatility', 'ev/ebitda', 'enterprise value', 'trading at', 'stock return', 'returns on the stock'];

const METRIC_TABLE = [
  ...Object.entries(METRIC_ALIASES).flatMap(([id, list]) => list.map(a => [a, 'metric', id])),
  ...Object.entries(UNSUPPORTED).flatMap(([id, [list]]) => (list || []).map(a => [a, 'unsupported', id])),
  ...Object.entries(BRIDGE_ALIASES).flatMap(([id, list]) => list.map(a => [a, 'bridge', id])),
  ...PRICE_ALIASES.map(a => [a, 'price', 'price'])
];

const REPORTED = ['revenue', 'net_income', 'operating_income', 'operating_cash_flow', 'assets', 'liabilities', 'current_assets', 'current_liabilities', 'cash', 'capex'];
const RATIOS = ['operating_margin', 'net_margin', 'cash_margin', 'current_ratio', 'liabilities_assets', 'cash_coverage', 'accruals', 'revenue_growth'];
const DERIVED = ['cash_conversion', 'free_cash_flow', 'profit_cash_gap'];
const YTD_METRICS = ['revenue', 'net_income', 'operating_income', 'operating_cash_flow'];
const TIMES = new Set(['current_ratio', 'cash_coverage', 'cash_conversion']);
const MONEY_INDICATORS = new Set(['free_cash_flow', 'profit_cash_gap']);

const LABEL = {
  revenue: ['Revenue', '营收'], net_income: ['Net income', '净利润'], operating_income: ['Operating income', '营业利润'],
  operating_cash_flow: ['Operating cash flow', '经营活动现金流'], assets: ['Total assets', '总资产'], liabilities: ['Total liabilities', '总负债'],
  current_assets: ['Current assets', '流动资产'], current_liabilities: ['Current liabilities', '流动负债'], cash: ['Cash and cash equivalents', '现金及现金等价物'],
  capex: ['Cash capital expenditure', '资本开支'], operating_margin: ['Operating margin', '营业利润率'], net_margin: ['Net margin', '净利率'],
  cash_margin: ['Operating cash margin', '经营现金流利润率'], current_ratio: ['Current ratio', '流动比率'], liabilities_assets: ['Liabilities / assets', '资产负债率'],
  cash_coverage: ['Cash coverage', '现金覆盖率'], accruals: ['Accrual ratio', '应计比率'], revenue_growth: ['Revenue growth', '营收增长率'],
  cash_conversion: ['Cash conversion', '现金转化率'], free_cash_flow: ['Free cash flow', '自由现金流'], profit_cash_gap: ['Profit-to-cash gap', '利润与现金差距'],
  depreciation: ['Depreciation and amortization', '折旧与摊销'], share_based_compensation: ['Share-based compensation', '股权激励（股份支付）'],
  receivables: ['Accounts receivable change', '应收账款变动'], inventory: ['Inventory change', '存货变动'], payables: ['Accounts payable change', '应付账款变动'],
  anomaly_score: ['AI triage percentile', 'AI 分诊百分位'],
  cost_of_revenue: ['Cost of revenue', '营业成本'], gross_profit: ['Gross profit', '毛利'], gross_margin: ['Gross margin', '毛利率'], rnd: ['Research and development', '研发费用'],
  rnd_intensity: ['R&D intensity', '研发费用率'], sga: ['Selling, general and administrative', '销售及管理费用'], interest_expense: ['Interest expense', '利息支出'],
  pretax_income: ['Income before income taxes', '税前利润'], income_tax: ['Income tax expense', '所得税'], eps_diluted: ['Diluted EPS (reported)', '稀释每股收益'],
  shares_diluted: ['Diluted weighted-average shares', '稀释加权平均股数'], dividends: ['Dividends paid', '支付的股息'], buybacks: ['Share repurchases', '股票回购'],
  cash_sti: ['Cash and short-term investments', '现金及短期投资'], equity: ["Shareholders' equity", '股东权益'], total_debt: ['Total debt', '总债务'],
  debt_to_equity: ['Debt to equity', '债务权益比'], interest_coverage: ['Interest coverage', '利息保障倍数'], roe: ['Return on equity', '净资产收益率'], roa: ['Return on assets', '总资产收益率'],
  fcf_margin: ['FCF margin', '自由现金流利润率'], payout: ['Shareholder payout', '股东回报'], net_interest_income: ['Net interest income', '净利息收入'],
  noninterest_income: ['Noninterest income', '非利息收入'], provision: ['Provision for credit losses', '信贷损失准备'], deposits: ['Deposits', '存款'], loans: ['Loans, net', '贷款净额'],
  premiums: ['Premiums earned', '已赚保费'], net_investment_income: ['Net investment income', '净投资收益'], real_estate: ['Real estate investment property, net', '投资性房地产净值']
};
const FORMULA = {
  operating_margin: ['operating income ÷ revenue', '营业利润 ÷ 营收'], net_margin: ['net income ÷ revenue', '净利润 ÷ 营收'],
  cash_margin: ['operating cash flow ÷ revenue', '经营活动现金流 ÷ 营收'], current_ratio: ['current assets ÷ current liabilities', '流动资产 ÷ 流动负债'],
  liabilities_assets: ['total liabilities ÷ total assets', '总负债 ÷ 总资产'], cash_coverage: ['cash and cash equivalents ÷ current liabilities', '现金及现金等价物 ÷ 流动负债'],
  accruals: ['(net income − operating cash flow) ÷ average total assets of this and the prior fiscal year', '（净利润 − 经营活动现金流）÷ 本年与上年总资产的平均值'],
  revenue_growth: ['revenue ÷ prior-year revenue − 1', '营收 ÷ 上年营收 − 1'], cash_conversion: ['operating cash flow ÷ net income', '经营活动现金流 ÷ 净利润'],
  free_cash_flow: ['operating cash flow − cash capital expenditure', '经营活动现金流 − 资本开支'], profit_cash_gap: ['net income − operating cash flow', '净利润 − 经营活动现金流']
};
const INPUTS = {
  operating_margin: ['operating_income', 'revenue'], net_margin: ['net_income', 'revenue'], cash_margin: ['operating_cash_flow', 'revenue'],
  current_ratio: ['current_assets', 'current_liabilities'], liabilities_assets: ['liabilities', 'assets'], cash_coverage: ['cash', 'current_liabilities'],
  accruals: ['net_income', 'operating_cash_flow', 'assets'], revenue_growth: ['revenue'], cash_conversion: ['operating_cash_flow', 'net_income'],
  free_cash_flow: ['operating_cash_flow', 'capex'], profit_cash_gap: ['net_income', 'operating_cash_flow']
};
const DEFINITION = {
  revenue: ['Revenue is what the company reports as earned from customers in the fiscal year (standard US-GAAP revenue tags, chosen by a fixed priority).', '营收是公司在该财年从客户处确认的收入（按固定优先级选取标准 US-GAAP 营收标签）。'],
  net_income: ['Net income is profit after all reported expenses, interest and tax (XBRL NetIncomeLoss).', '净利润是扣除全部已报告费用、利息和税之后的利润（XBRL 标签 NetIncomeLoss）。'],
  operating_income: ['Operating income is profit from operations before interest and tax (OperatingIncomeLoss).', '营业利润是扣除利息和税之前、来自经营的利润（OperatingIncomeLoss）。'],
  operating_cash_flow: ['Operating cash flow is the net cash the business generated from operations in the cash-flow statement (NetCashProvidedByUsedInOperatingActivities). It differs from net income by non-cash charges and working-capital movements.', '经营活动现金流是现金流量表里经营活动产生的现金净额（NetCashProvidedByUsedInOperatingActivities）。它与净利润的差别来自非现金费用和营运资本变动。'],
  assets: ['Total assets at the fiscal year end (Assets).', '财年末的总资产（Assets）。'],
  liabilities: ['Total liabilities at the fiscal year end (Liabilities). It includes payables, deferred revenue and other obligations, not only debt.', '财年末的总负债（Liabilities），包括应付款、递延收入等全部负债，不只是借款。'],
  current_assets: ['Assets expected to turn into cash within a year (AssetsCurrent).', '预计一年内变现的资产（AssetsCurrent）。'],
  current_liabilities: ['Obligations due within a year (LiabilitiesCurrent).', '一年内到期的负债（LiabilitiesCurrent）。'],
  cash: ['Cash and cash equivalents at the fiscal year end; marketable securities are not included.', '财年末的现金及现金等价物，不含有价证券。'],
  capex: ['Cash paid for property and equipment in the cash-flow statement (PaymentsToAcquirePropertyPlantAndEquipment).', '现金流量表中购建固定资产支付的现金（PaymentsToAcquirePropertyPlantAndEquipment）。'],
  operating_margin: ['How much operating profit each dollar of revenue earns.', '每一美元营收带来的营业利润。'],
  net_margin: ['How much net income each dollar of revenue earns.', '每一美元营收带来的净利润。'],
  cash_margin: ['How much operating cash each dollar of revenue brings in.', '每一美元营收带来的经营现金。'],
  current_ratio: ['The balance of short-term assets against short-term obligations. Below 1× means current liabilities exceed current assets; it is not a verdict on liquidity by itself.', '短期资产与短期负债的对比。低于 1× 表示流动负债大于流动资产，本身不构成流动性结论。'],
  liabilities_assets: ['The share of the asset base funded by liabilities of any kind.', '资产中由各类负债提供资金的比例。'],
  cash_coverage: ['How much of current liabilities is matched by cash and cash equivalents.', '现金及现金等价物能覆盖多少流动负债。'],
  accruals: ['The Sloan-style accrual ratio: how far accounting profit ran ahead of (positive) or behind (negative) operating cash, scaled by average assets. A high positive value is a reason to read working capital and non-cash items, not a verdict.', 'Sloan 式应计比率：会计利润高于（正值）或低于（负值）经营现金的程度，按平均总资产缩放。正值偏高只说明值得去读营运资本和非现金项目，不是结论。'],
  revenue_growth: ['Revenue against the prior fiscal year.', '营收相对上一财年的变化。'],
  cash_conversion: ['Operating cash flow per dollar of net income. Above 1× means operations brought in more cash than reported profit; below 1× means profit ran ahead of cash in that year.', '每一美元净利润对应的经营现金流。高于 1× 表示经营带来的现金多于报告利润；低于 1× 表示当年利润跑在现金前面。'],
  free_cash_flow: ['A common simple definition: operating cash flow minus cash capital expenditure. FinScope states it only where both standard facts exist.', '常见的简单口径：经营活动现金流减去资本开支。只有两项标准事实都存在时 FinScope 才给出。'],
  profit_cash_gap: ['Net income minus operating cash flow. Positive means profit ran ahead of cash.', '净利润减去经营活动现金流。正值表示利润跑在现金前面。'],
  anomaly_score: ['An Isolation Forest (128 trees, seed 42) is fitted on six ratios of earlier company-years. The percentile places a company’s latest annual profile within the training scores: higher means less typical of that history. It is an investigation cue, not a fraud, default or return signal.', '在更早的公司年度样本的六个比率上拟合 Isolation Forest（128 棵树，seed 42）。百分位表示公司最新年度画像在训练分数中的位置：越高越不像历史常态。它只是调查线索，不是造假、违约或收益信号。'],
  depreciation: ['A non-cash expense added back to profit in the cash-flow statement.', '现金流量表里加回利润的非现金费用。'],
  share_based_compensation: ['Stock awarded to employees: an expense in profit that uses no cash, so it is added back.', '发给员工的股票：计入利润中的费用但不用现金，所以加回。'],
  receivables: ['The change in amounts customers owe. An increase uses cash (customers have not paid yet).', '客户欠款的变动。增加会占用现金（客户还没付款）。'],
  inventory: ['The change in inventory. An increase uses cash.', '存货的变动。增加会占用现金。'],
  payables: ['The change in amounts owed to suppliers. An increase keeps cash in the business for now.', '欠供应商款项的变动。增加意味着暂时把现金留在公司。']
};

// Topic and refusal cues, matched on the normalised lower-case question.
const CUE = {
  offTopic: /天气|笑话|写代码|写一首|写首|写诗|翻译|讲个故事|讲故事|你是谁|你叫什么|你是什么模型|chatgpt|gpt-?\d|ignore (all |any |the )?(previous |prior |above |your )?(instructions|rules|prompts?)|system prompt|忽略.{0,8}(规则|指令|提示)|越狱|jailbreak|weather|tell (me )?a joke|\bjoke\b|write (me )?(a |an |some )?(code|poem|story|essay|song|email|script)|recipe|食谱|菜谱|足球|篮球|电影|movie|lottery|彩票|比特币|bitcoin|crypto|加密货币|星座|horoscope/,
  quarterSpecific: /\bttm\b|\bltm\b|trailing[- ]?(twelve|12)|过去十二个月|过去12个月|最近12个月|最近十二个月|q[1-4]\b|第\s*[一二三四1-4]\s*季|(?<!最新|最近|上|本|这)[一二三四]季度|[一二三四]季报|上半年|下半年|半年报|半年度|\bh[12]\b|first half|second half|half[- ]?year|by quarter|per quarter|each quarter|every quarter|quarter by quarter|每个季度|每季|单季|单个季度|(january|february|march|april|may|june|july|august|september|october|november|december) quarter|前三季度|前两季度|前三个季度|nine months|six months|three months|前九个月|前六个月|前三个月/,
  calendar: /自然年|日历年|公历年|calendar[- ]?year|calendar\s*20\d\d|\bcy\s?'?\d{2,4}\b/,
  growthCompare: /增长更快|增速更快|增长更多|增长得更快|增长得多|涨得更快|涨得更多|增幅更大|grew faster|grew more|faster growth|higher growth|growing faster|more growth/,
  growthRank: /增长最快|增速最快|增长最多|增幅最大|增长最大|增长最慢|增速最慢|grew (the )?(fastest|most|slowest)|fastest[- ]growing|fastest growth|slowest growth|highest growth|lowest growth|most growth|biggest growth/,
  writeRequest: /把.{0,24}(改成|改为|设为|设成|设置为|调成|调整为|换成|删掉|删除|去掉)|(改成|改为|设为|设成|设置为|调成)\s*[$\d一二三四五六七八九十]|修改.{0,8}(数据|数字|财报|利润|营收|收入|数值)|(删掉|删除|清空).{0,12}(数据|数字|营收|收入|利润|财报|记录)|篡改|\b(change|set|update|edit|modify|overwrite|replace)\b.{0,40}\bto\s+[$\d]|\b(delete|remove|erase|wipe)\b.{0,30}\b(data|figures?|numbers?|filings?|records?|rows?|values?|revenue|income)\b|^(please )?(change|set|edit|modify|overwrite|delete|remove)\b/,
  provenance: /从哪来|从哪里来|哪里来的|来源是|数据来源|数据出处|出处|数据源|where (do|does|did) (the |these |your )?(data|numbers|figures|facts) come from|where (is|are) (the |these |your )?(data|numbers|figures) from|source of (the |these |your )?(data|numbers|figures)|data sources?|what sources/,
  pastMove: /涨跌幅|涨了多少|跌了多少|涨了多|跌了多/,
  stockMove: /会涨|会跌|能涨|涨吗|跌吗|还能涨|涨不涨|跌不跌|going (to go )?(up|down)\b|will .{0,30}\bgo (up|down)\b|moon/,
  advice: /买入|买进|卖出|卖掉|抛售|抛了|抛掉|继续持有|该持有|要不要持有|值得持有|持有还是|还能持有|持有吗|加仓|减仓|建仓|清仓|抄底|仓位|值得买|值不值得|值得投资|能买吗|能买么|可以买|能不能买|该不该买|要不要买|买吗|买么|买不买|卖吗|卖么|卖不卖|推荐.{0,6}股|荐股|目标价|上车|梭哈|all in|投资建议|该买|该卖|入手|低估|高估|便宜吗|贵吗|划算|投资价值|长期持有|买哪|投哪|选哪只|哪只股票|哪个股票|哪支股票|牛股|跑赢|赚钱机会|能投吗|可以投吗|投不投|要不要投|值得入|能不能投|\bbuy\b(?! ?backs?)|\bbuying\b(?! ?backs?)|(should|time to|when to|do|would|can|must) (i |we |you )?(still )?sell\b|\bsell (it|them|my|the stock|the shares|shares|stock|now|before|after|or|nvda|aapl|msft|amzn|googl|meta|apple|microsoft|nvidia|amazon|google|alphabet)\b|buy or sell|\bsell signal|\bselling (it|now|my)\b|(should|do|would|can) (i|you|we) (keep )?hold|hold (the |this |my |its )?(stock|shares|position)|buy,? (or )?hold|hold or sell|keep holding|\bhold (nvda|aapl|msft|amzn|googl|meta|apple|microsoft|nvidia|amazon|google|alphabet|it|them)\b|\bholding it\b|should i (invest|buy|sell|hold|get|own|add|trim|short|long)|worth (investing|buying|it)|(good|best|better|safest|top) (investment|buy|stock|pick)s?|最值得投资|最值得买|哪个最值得|invest in|investment advice|price target|target price|undervalued|overvalued|bullish|bearish|to the moon|recommend(ation)? (a |any )?stock|which stock|stock pick|long or short|go long|go short|portfolio|allocat|outperform|is it a buy|cheap stock|expensive stock/,
  fraud: /造假|做假账|假账|财务造假|财务舞弊|舞弊|欺诈|粉饰|操纵利润|利润操纵|操纵财报|调节利润|做账|虚增|暴雷|爆雷|骗局|fraud|cook(ing|ed|s)? (the|its|their)? ?books|manipulat|accounting scandal|beneish|m-score|cheat|lying about|fake (numbers|earnings|profit)|ponzi/,
  forecast: /gonna|going to be|next yr|下一年度|预测|预计|预期|明年|后年|下一年|下个财年|下一个财年|下一财年|未来|将来|以后会|接下来|会不会|会增长|会下降|会怎样|会怎么样|会如何|能达到|能不能达到|前景|展望|业绩指引|指引|guidance|forecast|predict|projection|projected|outlook|next year|next fiscal|next quarter|下个季度|下季度|in the future|going forward|will (it|they|its|their|the|nvda|aapl|msft|amzn|googl|meta|apple|microsoft|nvidia|amazon|google|alphabet|revenue|profit|earnings|cash)?.{0,30}\b(grow|increase|decrease|rise|fall|be|reach|beat|miss|keep|continue|stay|go)\b|expected to|estimates? for|consensus|分析师预期/,
  scope: /会啥|都会|会什么|会些什么|能做什么|wat can|wut can|what can u\b|能干嘛|干嘛的|干嘛用|是干什么的|干什么用|有什么用|能做啥|what (can|does) (this|it) do|what('s| is) this (tool |box |thing )?for|what is this (tool|box|thing)|what can (you|u) do|what do (you|u) do|哪几家|几家公司|哪些家|能问啥|问啥|能干啥|能做啥|能回答啥|可以问啥|你能回答什么|你能做什么|你会什么|能问什么|可以问什么|可以回答什么|能回答什么|能回答哪些|支持哪些|支持什么|怎么用|如何使用|使用说明|有什么功能|帮助|help\b|what can (you|i) (ask|do|answer)|what (questions|kinds? of questions|can this)|how (do|does|can) (i use|this work|it work)|哪些公司|有哪些公司|包括哪些公司|覆盖(哪些|什么)|which companies|what companies|companies (are )?(covered|included|available)|list (of )?(the )?companies|^(你好|您好|hello|hi|hey)[!！.。 ]*$/,
  freshness: /数据.{0,4}(什么时候|哪天|哪一天|多久|几号|新吗|旧吗|过时|最新吗)|什么时候的数据|哪天的数据|几号的数据|how old is the data|is the data (current|recent|up to date|stale|old)|数据(的)?(更新|截至|截止|最新|日期|时间|多新|多久|有多新|是哪天|什么时候)|更新到|截至什么时候|截止到什么时候|截止什么时候|最新数据是|数据是最新的吗|多久更新|什么时候更新|data (as of|date|freshness|updated|current|from when)|how (recent|fresh|current|up to date|old) is|last updated|up to date|when (was|is|were) (the )?(data|bundle|snapshot|evidence)|as of when|data cutoff|cut-?off date/,
  definition: /\bmeaning\b|啥\s*[?？]?$|是个啥|啥是|什么是|是什么意思|什么意思|啥意思|是啥|是什么|的含义|含义|定义|怎么算|如何计算|怎么计算|计算公式|公式|怎么理解|解释一下|^what (is|are|does) |what does .* mean|\bmeans?\b\??$|\bdefine\b|definition|meaning of|how (is|are|do you|does finscope) .{0,40}(calculated|computed|measured|defined|work)|\bformula\b|explain (what|the term)/,
  rates: /国债|美债|treasury|treasuries|t-bill|t-note|yield curve|收益率曲线|无风险利率|risk-free|bond yield|利率环境|美国利率/,
  rateWords: /收益率|利率|yield|yields|\brates?\b/,
  tenor: /(个月|月期|年期|-?month|-?year|\b\d{1,2}\s*[ym]\b)/,
  anomaly: /异常|离群|孤立森林|isolation forest|anomal|outlier|unusual|percentile|百分位|分位数|ai\s*(评分|打分|分数|score|triage|分诊|分)|模型(评分|打分|分数|怎么看)|triage|分诊|red flags?|风险评分|风险分|警示分/,
  filingLink: /链接|link|url|在哪(里)?(看|读|找|下载|查)|哪里(看|读|找|下载|查)|where (can|do|could) i (read|find|get|see|download)|下载|download|原文|primary document|source document|open the (10-?k|10-?q|filing)|read the (10-?k|10-?q|filing|report)|edgar/,
  filingDoc: /10-?k|10-?q|年报|季报|财报|filing|annual report|quarterly report|sec 文件|sec filing|报告/,
  ytd: /\bso far\b|到目前为止|迄今为止|季度|季报|本季|上季|一季|最新季|q[1-4]\b|第[一二三四1-4]季|今年以来|年初至今|年初到现在|截至目前|截止目前|迄今|year[- ]to[- ]date|\bytd\b|so far this year|this year so far|latest quarter|last quarter|recent quarter|most recent quarter|quarterly|interim|10-?q|nine months|six months|前三季度|上半年|前九个月|前六个月|三个季度|六个月|九个月/,
  bridge: /为什么|为何|为啥|咋回事|咋会|咋就|怎么会|差在哪|主要差在|差异来自|差距来自|来自哪|从哪来|原因|什么导致|导致|怎么回事|拆解|分解|调节|现金流桥|桥|bridge|reconcil|\bwhy\b|what explains|explain the gap|what drives|drivers?|breakdown|working capital|营运资本|营运资金|运营资本|营运资金变动/,
  cashSupport: /(利润|盈利|净利润?|赚的钱|profits?|earnings|net income).{0,10}(虚|水分|注水|掺水|含水|靠谱|靠不靠谱|真实|真不真|是真的|假的|质量|可信|fake|inflated|\breal\b|legit|trustworthy|reliable|quality)|(profits?|earnings) (is |are )?(actually )?real\b|利润是真的|利润真实|cash[- ]?wise|legit.{0,12}cash|cash.{0,12}legit|纸面|账面富贵|(profits?|earnings|net income)\b.{0,25}\b(backed|supported|covered|matched|converted|turns?|turned|turning|translat\w*)\b.{0,20}\bcash|\bcash\b.{0,20}\b(backs?|supports?|covers?|keeps? up with|matches)\b.{0,15}\b(profits?|earnings|net income)|(利润|盈利|净利|赚的钱|赚的|profit|earnings).{0,10}(现金|cash).{0,8}(撑|支撑|支持|覆盖|跟上|跟得上|对得上|匹配|兑现)|(现金|现金流).{0,6}(撑得住|撑住|跟得上|对得上|覆盖得了).{0,6}(利润|盈利|净利)|现金撑|现金流支撑|现金支撑|现金流支持|现金支持|有现金流|现金流覆盖|现金流撑|利润质量|盈利质量|收益质量|含金量|真金白银|真的赚钱|真赚钱|真金|真钱|纸面利润|账面利润|利润能变成现金|利润转化为现金|利润变现|变成现金|转成现金|变现能力|兑现|hold water|backed by (real )?cash|cash[- ]backed|cash support|supported by (operating )?cash|earnings quality|quality of (its |their )?earnings|profit quality|real cash|turn(ing|s|ed)? (its |their )?(profits?|earnings|income) into cash|convert(ing|s|ed)? (its |their )?(profits?|earnings|income) (in)?to cash|paper profits?|actually (making|earning|generating) cash|backing (its |their )?(profits?|earnings)|back(ed)? up by cash/,
  trend: /over (the )?(yrs|years)|这些年|历年来|多年来|走势|趋势|历年|近几年|最近几年|过去几年|这几年|历史|每年|多年|逐年|变化趋势|一路|\btrend|over time|history|historical|past (few|several) years|last (few|several) years|each year|every year|over the years|year by year|annual history/,
  change: /go up|go down|went up|went down|gone up|gone down|比前一年|较前一年|比上一年|变化|变动|增长|增加|减少|下降|上升|提高|降低|同比|比去年|较去年|相比去年|和去年比|跟去年比|较上年|比上年|增速|涨了|跌了|多了|少了|\byoy\b|y\/y|year over year|year-over-year|\bchange[sd]?\b|\bgrow(th|n|s)?\b|\bgrew\b|increase[sd]?|decrease[sd]?|declin(e|ed|ing)|\brise\b|\brose\b|\bfell\b|\bfall\b|vs\.? (last|prior|previous) year|versus (last|prior|previous) year|compared (to|with) (the )?(prior|previous|last) year|up or down|went up|went down/,
  compare: /对比|比较|相比|比一比|pk|\bvs\.?\b|v\.s\.|versus|compare|comparison|side by side|against|谁更|哪个更|哪家更|和.{1,12}比|跟.{1,12}比|与.{1,12}相比/,
  rank: /哪家|哪个公司|哪一家|哪间|谁的|谁最|谁家|最高|最低|最大|最小|最多|最少|最强|最弱|最好|最差|排名|排行|排序|which (company|one|firm|of (the|these|them|those))|who has|highest|lowest|largest|biggest|smallest|\bmost\b|\bleast\b|\brank|\btop\b|best|worst|六家|all six|the six|these six|six companies/,
  low: /最低|最小|最少|最弱|最差|lowest|smallest|\bleast\b|worst|weakest/,
  gap: /差得|差很多|差了|差太多|差不差|差几|差多|哪个多|谁多|(利润|盈利|净利).{0,6}比.{0,4}现金.{0,4}(多|高|少|低)|现金.{0,4}比.{0,4}(利润|盈利|净利).{0,4}(多|高|少|低)|差距|差额|缺口|差别|差多少|相差|差值|背离|\bgap\b|difference|diverge|mismatch/,
  latest: /最新|最近|目前|当前|现在|如今|latest|most recent|current(ly)?|\bnow\b|recent|today/,
  why: /为什么|为何|为啥|咋回事|咋会|咋就|怎么会|差在哪|主要差在|差异来自|差距来自|来自哪|从哪来|什么原因|原因|why\b|what explains|what drives/
};
const CN_NUM = {一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10};
const EN_NUM = {two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10};

// ---------------------------------------------------------------- formatting
const L = (lang, en, zh) => lang === 'zh' ? zh : en;
const label = (key, lang) => (LABEL[key] || [key, key])[lang === 'zh' ? 1 : 0];
const company = (t, lang) => lang === 'zh' ? `${zhName(t)}（${t}）` : `${EN_NAME[t] || t} (${t})`;
const zhName = t => ZH_NAME[t] || t;
export function money(v, lang = 'en') {
  if (!Number.isFinite(v)) return L(lang, 'unavailable', '无');
  const sign = v < 0 ? '−' : '';
  return lang === 'zh' ? `${sign}${(Math.abs(v) / 1e8).toFixed(2)} 亿美元` : `${sign}$${(Math.abs(v) / 1e9).toFixed(2)}B`;
}
const exact = v => Number.isFinite(v) ? `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')}` : '—';
const pct = v => Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—';
const times = v => Number.isFinite(v) ? `${v.toFixed(2)}×` : '—';
const pp = v => Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} pp` : '—';
export function display(key, v, lang = 'en') {
  if (!Number.isFinite(v)) return L(lang, 'unavailable', '无');
  if (TIMES.has(key)) return times(v);
  if (RATIOS.includes(key)) return pct(v);
  return money(v, lang);
}
const fy = row => `FY${row.period_end.slice(0, 4)}`;
const periodText = (row, lang) => lang === 'zh' ? `${row.period_end.slice(0, 4)} 财年（${row.period_start} 至 ${row.period_end}）` : `FY${row.period_end.slice(0, 4)} (${row.period_start} → ${row.period_end})`;
const span = (p, lang) => lang === 'zh' ? `${p.period_start} 至 ${p.period_end}` : `${p.period_start} → ${p.period_end}`;

// ---------------------------------------------------------------- evidence access
const cache = new WeakMap();
function annualIndex(bundle, asOf) {
  let byDate = cache.get(bundle);
  if (!byDate) cache.set(bundle, byDate = new Map());
  if (byDate.has(asOf)) return byDate.get(asOf);
  const index = {};
  for (const t of bundle.companies.map(c => c.ticker)) index[t] = new Map();
  for (const snap of bundle.snapshots) {
    if (snap.as_of > asOf) break;
    for (const [t, rows] of Object.entries(snap.companies)) for (const row of rows) index[t]?.set(row.period_end, {row, snapshot: snap.as_of});
  }
  const sorted = Object.fromEntries(Object.entries(index).map(([t, m]) => [t, [...m.values()].sort((a, b) => a.row.period_end.localeCompare(b.row.period_end))]));
  byDate.set(asOf, sorted);
  return sorted;
}
const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 86400000;
function priorRow(bundle, ticker, entry, asOf) {
  const snap = bundle.snapshots.find(s => s.as_of === entry.snapshot);
  const sameSnapshot = snap?.companies[ticker]?.filter(r => r.period_end < entry.row.period_end).at(-1);
  const candidate = sameSnapshot || annualIndex(bundle, asOf)[ticker].filter(e => e.row.period_end < entry.row.period_end).at(-1)?.row;
  if (!candidate) return null;
  const gap = days(candidate.period_end, entry.row.period_end);
  return gap >= 300 && gap <= 430 ? candidate : null;
}
function fact(ticker, key, f, lang, extra = {}) {
  return {ticker, key, label: label(key, lang), value: f.value, display: money(f.value, lang), exact_usd: exact(f.value), unit: f.unit || 'USD',
    period_start: f.start ?? null, period_end: f.end, form: f.form, tag: f.tag, filed: f.filed, accession: f.accession,
    url: f.url, document_url: f.document_url ?? null, archive_url: f.archive_url ?? null, filing_index_url: f.filing_index_url ?? null, link_kind: f.link_kind ?? null, ...extra};
}

// Indicator value and its inputs for one annual row. Ratios come from the pipeline (finscope/fundamentals.py).
function indicator(bundle, ticker, entry, key, asOf, lang) {
  const row = entry.row, m = row.metrics, facts = [], missing = [];
  const need = (k, r = row, prior = false) => {
    const f = r.metrics[k];
    if (!f || !Number.isFinite(f.value)) { missing.push(prior ? `${k}_prior` : k); return null; }
    facts.push(fact(ticker, k, f, lang, prior ? {label: `${label(k, lang)} ${L(lang, '(prior year)', '（上年）')}`, role: 'prior_year'} : {}));
    return f.value;
  };
  if (REPORTED.includes(key)) {
    const v = need(key);
    return {value: v, facts, missing, calc: null};
  }
  let value = null;
  for (const k of INPUTS[key]) need(k);
  const prior = ['accruals', 'revenue_growth'].includes(key) ? priorRow(bundle, ticker, entry, asOf) : null;
  if (key === 'accruals') prior ? need('assets', prior, true) : missing.push('assets_prior');
  if (key === 'revenue_growth') prior ? need('revenue', prior, true) : missing.push('revenue_prior');
  if (RATIOS.includes(key)) value = Number.isFinite(row.ratios?.[key]) ? row.ratios[key] : null;
  else if (key === 'cash_conversion') value = m.net_income?.value > 0 && Number.isFinite(m.operating_cash_flow?.value) ? m.operating_cash_flow.value / m.net_income.value : null;
  else if (key === 'free_cash_flow') value = Number.isFinite(m.operating_cash_flow?.value) && Number.isFinite(m.capex?.value) ? m.operating_cash_flow.value - m.capex.value : null;
  else if (key === 'profit_cash_gap') value = Number.isFinite(m.net_income?.value) && Number.isFinite(m.operating_cash_flow?.value) ? m.net_income.value - m.operating_cash_flow.value : null;
  if (key === 'cash_conversion' && Number.isFinite(m.net_income?.value) && m.net_income.value <= 0) missing.push('positive_net_income');
  if (value === null && !missing.length) missing.push('denominator');
  const calc = value === null ? null : {label: `${label(key, lang)} · ${ticker} ${fy(row)}`, formula: FORMULA[key][lang === 'zh' ? 1 : 0], result: display(key, value, lang)};
  return {value, facts: value === null ? facts : facts, missing, calc};
}

// ---------------------------------------------------------------- reading the question
const FIRST_WORD_STOP = new Set(['what', 'how', 'which', 'who', 'why', 'when', 'where', 'is', 'are', 'was', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'the', 'a', 'an', 'show', 'give', 'list', 'compare', 'tell', 'find', 'get', 'any', 'all', 'and', 'or', 'but', 'if', 'on', 'in', 'at', 'by', 'for', 'to', 'of', 'it', 'i', 'me', 'my', 'we', 'us', 'you', 'so', 'be', 'go', 'no', 'yes', 'hi', 'hey', 'pls', 'please', 'low', 'high', 'now', 'top', 'best', 'new', 'big', 'key', 'one', 'two', 'net', 'cost', 'cash', 'real', 'well', 'open', 'plus', 'sum', 'avg', 'max', 'min']);
const SIX_CIK = {320193: 'AAPL', 789019: 'MSFT', 1045810: 'NVDA', 1018724: 'AMZN', 1652044: 'GOOGL', 1326801: 'META'};
const FIGURE_WORDS = new Set(Object.values(METRIC_ALIASES).flat().concat(Object.values(UNSUPPORTED).flatMap(([list]) => list || [])));

export function parseQuestion(question, bundle, asOf = bundle?.as_of, universe = null) {
  const text = normalize(question).slice(0, MAX_QUESTION);
  const low = text.toLowerCase();
  let lang = /[㐀-鿿]/.test(text) ? 'zh' : 'en';
  if (/用英文|英文回答|英语回答|in english/.test(low)) lang = 'en';
  else if (/用中文|中文回答|in chinese/.test(low)) lang = 'zh';
  // Figure words win over look-alike tickers and names (eps, nii, roe), so they are found first; a ticker written in
  // capitals (AD revenue) wins over a figure phrase it would otherwise start, and the figures are then read without it.
  let figureSpans = findSpans(low, METRIC_TABLE);
  const inFigure = (a, b) => figureSpans.some(f => a < f.end && f.start < b);
  const sixHits = findSpans(low, COMPANY_TABLE).filter(h => !inFigure(h.start, h.end) || h.alias.length > 4);
  const hits = sixHits.map(h => ({start: h.start, end: h.end, ticker: h.id}));
  const ucompanies = [];
  let others = [], otherReasons = [];
  if (universe) {
    const allCapsText = text === text.toUpperCase();
    // A capital ticker beats a figure phrase only when the rest of that phrase is still a figure (AD revenue, not NET INCOME).
    const capital = h => !allCapsText && h.kind === 'ticker' && h.alias === h.alias.toUpperCase() && /[A-Z]/.test(h.alias) &&
      figureSpans.some(f => h.start < f.end && f.start < h.end && findSpans(low.slice(h.end, f.end), METRIC_TABLE).some(g => g.end === f.end - h.end));
    const found = matchCompanies(universe, text, low, NOT_TICKERS);
    const blanks = found.filter(h => capital(h) && inFigure(h.start, h.end) && !hits.some(x => h.start < x.end && x.start < h.end));
    if (blanks.length) {
      let masked = low;
      for (const h of blanks) masked = masked.slice(0, h.start) + ' '.repeat(h.end - h.start) + masked.slice(h.end);
      figureSpans = findSpans(masked, METRIC_TABLE);
    }
    for (const h of found) {
      if (hits.some(x => h.start < x.end && x.start < h.end) || (inFigure(h.start, h.end) && h.kind !== 'zh' && !capital(h))) continue;
      const entry = universe.byCik.get(h.cik), ticker = SIX_CIK[h.cik] || primary(entry);
      hits.push({start: h.start, end: h.end, ticker});
      if (!SIX_CIK[h.cik]) ucompanies.push(ticker);
    }
    // A lower-case ticker as the first word, directly before a figure or Chinese text (de roe 24, all 负债率), names a company.
    const first = !hits.length && text.match(/^\s*\$?([a-z]{1,5})(?=\s|[㐀-鿿]|$)/);
    if (first) {
      const tok = first[1], start = first[0].length - tok.length, entry = universe.byTicker.get(tok.toUpperCase());
      const rest = text.slice(first[0].length);
      const figureNext = figureSpans.some(f => f.start > start + tok.length && /^\s*$/.test(low.slice(start + tok.length, f.start)));
      if (entry && !inFigure(start, start + tok.length) && (/^\s*[㐀-鿿]/.test(rest) || (figureNext && !FIRST_WORD_STOP.has(tok)))) {
        hits.push({start, end: start + tok.length, ticker: SIX_CIK[entry.c] || primary(entry)});
        if (!SIX_CIK[entry.c]) ucompanies.push(primary(entry));
      }
    }
    // An outside name that contains a company match wins (Coca-Cola Europacific Partners is not Coca-Cola).
    for (const o of matchOutside(universe, low)) {
      for (const x of hits.filter(x => o.start <= x.start && x.end <= o.end && (o.end - o.start) > (x.end - x.start))) { hits.splice(hits.indexOf(x), 1); const k = ucompanies.indexOf(x.ticker); if (k >= 0) ucompanies.splice(k, 1); }
      if (!hits.some(x => o.start < x.end && x.start < o.end)) { others.push(text.slice(o.start, o.end)); otherReasons.push(o.reason); }
    }
  } else others = findSpans(low, OTHER_TABLE).map(h => text.slice(h.start, h.end));
  const companies = [];
  for (const h of hits.sort((a, b) => a.start - b.start)) if (!companies.includes(h.ticker)) companies.push(h.ticker);
  const allCaps = text === text.toUpperCase();
  if (!allCaps) for (const m of text.matchAll(/(?<![A-Za-z0-9&\/$])([A-Z]{2,5}(?:\.[A-Z])?)(?![A-Za-z0-9&\/])/g)) {
    const tok = m[1];
    if (hits.some(x => m.index < x.end && x.start < m.index + tok.length) || FIGURE_WORDS.has(tok.toLowerCase())) continue;
    if (!TICKERS.includes(tok) && !NOT_TICKERS.has(tok) && !COMPANY_TABLE.some(([a]) => a === tok.toLowerCase()) && !others.some(o => o.toLowerCase() === tok.toLowerCase())) { others.push(tok); otherReasons.push('unknown'); }
  }
  const spans = figureSpans;
  const metrics = [], unsupported = [], bridge = [];
  let price = false;
  for (const s of spans) {
    if (s.kind === 'metric' && !metrics.includes(s.id)) metrics.push(s.id);
    if (s.kind === 'unsupported' && !unsupported.includes(s.id)) unsupported.push(s.id);
    if (s.kind === 'bridge' && !bridge.includes(s.id)) bridge.push(s.id);
    if (s.kind === 'price') price = true;
  }
  // Dates and years, with where each was written (for "Meta in 2025 vs Google in 2024").
  // Amounts such as "2000亿" are not years. Blanking keeps positions aligned with the question.
  const blank = (str, m) => str.slice(0, m.index) + ' '.repeat(m[0].length) + str.slice(m.index + m[0].length);
  let rest = low;
  const dates = [], badDates = [];
  for (const m of low.matchAll(/(?<!\d)(20\d\d|19\d\d)\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/g)) {
    const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (!Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d) dates.push(d);
    else badDates.push(m[0].trim());
    rest = blank(rest, m);
  }
  const yearPos = new Map();
  const addYear = (y, pos) => { if (!yearPos.has(y)) yearPos.set(y, pos); };
  let range = null;
  const rangeMatch = rest.match(/(?<!\d)(20\d\d|19\d\d)\s*(?:财年|年)?\s*(?:-|–|—|~|到|至|to|through|until|thru)\s*(?:fy\s*)?(20\d\d|\d{2})(?!\d)/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]), b0 = Number(rangeMatch[2]), b = b0 < 100 ? 2000 + b0 : b0;
    if (b > a) { range = [a, b]; rest = blank(rest, rangeMatch); }
  }
  const shortRange = !range && rest.match(/(?<![\d.])(1[2-9]|2\d)\s*(?:年|财年)?\s*(?:-|–|~|到|至)\s*(1[2-9]|2\d)\s*(?:年|财年)(?!期)/);
  if (shortRange && Number(shortRange[2]) > Number(shortRange[1])) { range = [2000 + Number(shortRange[1]), 2000 + Number(shortRange[2])]; rest = blank(rest, shortRange); }
  const since = rest.match(/(?:since|从|自)\s*(?:fy\s*)?(20\d\d)(?!\d)\s*(?:年|财年)?\s*(?:以来|起|开始)?/);
  const since2 = !since && !range && rest.match(/(?<!\d)(20\d\d)\s*(?:年|财年)?\s*(?:以来|至今|起)/);
  if (since && !range) { range = [Number(since[1]), null]; rest = blank(rest, since); }
  else if (since2) { range = [Number(since2[1]), null]; rest = blank(rest, since2); }
  const before = !range && (rest.match(/(?:before|prior to|until)\s+(?:fy\s*)?(20\d\d)(?!\d)/) || rest.match(/(?<!\d)(20\d\d)\s*(?:年|财年)?\s*(?:之前|以前)/));
  if (before) { range = [1990, Number(before[1]) - 1]; rest = blank(rest, before); }
  for (const m of rest.matchAll(/(?:fy|财年|fiscal\s*(?:year)?)\s*'?(\d{2})(?!\d)|(?<!\d)(\d{2})\s*财年/g)) { addYear(2000 + Number(m[1] || m[2]), m.index); rest = blank(rest, m); }
  for (const m of rest.matchAll(/(?<![\d.近去前几这最])(1[2-9]|2\d)\s*年(?!期|内|来|以来|后|前|间|的时间)/g)) addYear(2000 + Number(m[1]), m.index);
  for (const m of rest.matchAll(/(?<!\d)(20\d\d|19\d\d)(?!\d)(?!\s*(?:亿|万|千|百|b\b|bn|billion|million|m\b|%|美元|元|usd|dollars|个|家|人|股))/g)) addYear(Number(m[1]), m.index);
  if (!yearPos.size && !range && companies.length && metrics.length) for (const m of rest.matchAll(/(?<=^|[\s,，。?？!！(（'])(1[2-9]|2\d)(?=$|[\s,，。?？!！)）])/g)) addYear(2000 + Number(m[1]), m.index);
  // Relative years follow the information date, not the build date.
  const year = Number((asOf || bundle?.as_of || '2026').slice(0, 4));
  let relative = null, m;
  const relYears = new Set();
  if ((m = low.match(/前年|year before last/))) { addYear(year - 2, m.index); relYears.add(year - 2); }
  else if ((m = low.match(/去年|上一年|上年度|last year|previous year|prior year/)) && !/比去年|较去年|相比去年|和去年比|跟去年比|than last year|vs\.? last year|versus last year|compared (to|with) (the )?(last|prior|previous) year|from last year|over last year/.test(low)) { addYear(year - 1, m.index); relYears.add(year - 1); }
  const ago = low.match(/(\d{1,2}|[一两二三四五六七八九十])\s*(?:个)?(?:财年|年)前/) || low.match(/(\d{1,2}|a|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:fiscal\s+)?years?\s+ago/);
  if (ago) addYear(year - (/\d/.test(ago[1]) ? Number(ago[1]) : ago[1] === 'a' || ago[1] === 'one' ? 1 : CN_NUM[ago[1]] || EN_NUM[ago[1]]), ago.index);
  if (/今年(?!以来)|本年度|this year(?! so far)|this fiscal year|本财年/.test(low)) relative = 'this_year';
  if (/上一财年|上个财年|上财年|最近一个财年|最新财年|最近财年|last fiscal year|most recent fiscal year|latest fiscal year|latest annual/.test(low)) relative = 'latest';
  let lastN = null;
  const n1 = low.match(/(?<![比较和跟与对])(?:近|最近|过去|前)\s*(\d{1,2}|[一两二三四五六七八九十])\s*(?:个)?(?:财年|年)(?!前)/);
  const n2 = low.match(/(?:past|last|previous)\s+(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:fiscal\s+)?years/);
  // Bare spans count too: 5y, 5 yrs, 这5年, 3年 (one to ten years; 24年 is a year, 两年前 is a date).
  const n3 = !n1 && !n2 && low.match(/(?<![\d.])(\d{1,2})\s*(?:y|yr|yrs|year|years)\b(?!\s*ago)/);
  const n4 = !n1 && !n2 && !n3 && low.match(/(?<![\d.])(\d{1,2}|[两二三四五六七八九十])\s*(?:个)?(?:财年|年)(?!前|度|期|内|后|报|初|底|末|以来|来|的)/);
  if (n1) lastN = /\d/.test(n1[1]) ? Number(n1[1]) : CN_NUM[n1[1]];
  else if (n2) lastN = /\d/.test(n2[1]) ? Number(n2[1]) : EN_NUM[n2[1]];
  else for (const n of [n3, n4]) if (n) { const v = /\d/.test(n[1]) ? Number(n[1]) : CN_NUM[n[1]]; if (v >= 2 && v <= 10) lastN = v; }
  if (lastN !== null && lastN < 2) lastN = null;
  const has = re => re.test(low);
  let masked = low;
  for (const s of spans) masked = masked.slice(0, s.start) + ' '.repeat(s.end - s.start) + masked.slice(s.end);
  const maskedCue = new Set(['change', 'trend']);
  const yearOrder = [...yearPos.entries()].sort((a, b) => a[1] - b[1]).map(([y]) => y);
  return {
    universe: Boolean(universe), text, low, masked, lang, companies, ucompanies, companySpans: hits, others, otherReasons, metrics, unsupported, bridge, price, spans, dates, badDates,
    years: [...yearPos.keys()].sort(), yearOrder, range, relative, relYears, lastN,
    cues: Object.fromEntries(Object.entries(CUE).map(([k, re]) => [k, maskedCue.has(k) ? re.test(masked) : has(re)]))
  };
}

// ---------------------------------------------------------------- answering
function base(p, bundle, asOf, snapshot) {
  return {
    engine: {...ENGINE, label: ENGINE.label[p.lang]}, lang: p.lang, question: p.text,
    info_date: asOf, snapshot_date: snapshot?.as_of ?? null, dataset_sha256: bundle.dataset_sha256 ?? null,
    status: 'answered', topic: null, plan: {tickers: [], metric: null, period: null},
    summary: '', table: null, calculations: [], facts: [], notes: [], offers: []
  };
}
const finish = (r, fields, extra = {}) => { Object.assign(r, fields); if (extra.notes) r.notes = [...(r.notes || []), ...extra.notes.filter(n => !(r.notes || []).includes(n))]; return r; };
const ask = (lang, en, zh) => L(lang, en, zh);
function defaultOffers(lang, t = 'NVDA') {
  return lang === 'zh'
    ? [`${zhName(t)}的利润有现金流支撑吗`, '六家公司里哪家利润和现金差距最大', `${zhName(t)}最新的经营现金流是多少`, '你能回答什么问题']
    : [`Is ${t}'s profit backed by operating cash?`, 'Which of the six has the largest profit-to-cash gap?', `What was ${t}'s latest operating cash flow?`, 'What can you answer?'];
}
const IN_BUNDLE = {
  en: 'revenue, net income, operating income, operating cash flow, total assets, total liabilities, current assets, current liabilities, cash, capex, eight ratios, cash conversion, free cash flow, the latest fiscal year-to-date checkpoint, its profit-to-cash bridge, the AI triage percentile, Treasury yields and filing links',
  zh: '营收、净利润、营业利润、经营活动现金流、总资产、总负债、流动资产、流动负债、现金、资本开支、八个比率、现金转化率、自由现金流、最新的年初至今对比、利润到现金的调节、AI 分诊百分位、美国国债收益率和财报链接'
};

// Which companies a question names, so the caller can load their universe shards (and the screen) first.
export function planQuestion(question, bundle, {universe} = {}) {
  const prepared = universe?.index ? prepareIndex(universe.index) : null;
  const p = parseQuestion(question, bundle, bundle?.as_of, prepared);
  const ciks = prepared ? p.companies.map(t => entryOf(prepared, t)?.c).filter(Boolean) : [];
  const screen = Boolean(prepared && UCUE.sector.test(p.low) && (UCUE.percentile.test(p.low) || p.cues.rank || p.cues.compare));
  return {tickers: p.companies, ciks, screen};
}

const UNIVERSE_SCOPE = /银行|保险公司|保险|房地产信托|reits?\b|\bbanks?\b|insurers?|行业|板块|sector|industry|美股|全市场|所有公司里|全部公司里|universe|all (us|u\.s\.|american) (companies|stocks)|large accelerated/;
const SIX_SCOPE = /六家|六个公司|all six|the six|these six|six companies|深度账本|deep[- ]ledger/;
const RANK_ASK = /哪家|哪个公司|哪一家|哪间|谁|which|who\b/;
const RANK_NOUN = /\bwhich (\w+ ){0,2}(compan(y|ies)|firms?|stocks?|retailers?|banks?|insurers?|reits?|chipmakers?|airlines?|utilit(y|ies)|automakers?|names)\b.{0,40}\b(highest|lowest|largest|biggest|smallest|most|least|best|worst|top|bottom|strongest|weakest)\b/;
function universeRoute(p, bundle, snapshot, prepared) {
  if (!prepared) return false;
  if (p.ucompanies.length || p.metrics.some(m => UNIVERSE_ONLY.has(m))) return true;
  if (p.companies.length && (UCUE.lineage.test(p.low) || UCUE.quality.test(p.low)) && !p.cues.provenance) return true;
  if (p.companies.length && UCUE.sector.test(p.low) && (UCUE.percentile.test(p.low) || p.cues.rank)) return true;
  // A ranking that names no company covers the universe (a pointer to Screen), unless it asks for the six deep-ledger companies.
  if (!p.companies.length && !SIX_SCOPE.test(p.low) && ((p.cues.rank && (p.metrics.length || UNIVERSE_SCOPE.test(p.low) || RANK_ASK.test(p.low))) || RANK_NOUN.test(p.low))) return true;
  // A six-company figure the deep ledger lacks (no standard tag) may exist in the universe under a fallback tag.
  const latest = snapshot && bundle.snapshots.at(-1).as_of === snapshot.as_of;
  if (latest && p.companies.length && p.metrics.length) {
    const need = new Set(p.metrics.flatMap(m => REPORTED.includes(m) ? [m] : INPUTS[m] || []));
    if (p.companies.some(t => { const row = snapshot.companies[t]?.at(-1); return row && [...need].some(k => k in row.metrics && !row.metrics[k]); })) return true;
  }
  return false;
}

function universeHelpers(bundle) {
  return {
    six: TICKERS, selectFigures, profitEvaluative,
    definition: (r, p) => definitionAnswer(r, p),
    unsupported: (r, p) => {
      const lang = p.lang, what = p.unsupported.map(id => UNSUPPORTED[id][lang === 'zh' ? 2 : 1]).join(L(lang, '; ', '；'));
      return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', plan: {...r.plan, tickers: [...p.companies], metric: p.unsupported[0]}, summary: ask(lang,
        `Not in the FinScope data: ${what}. FinScope will not substitute a different figure. For each company it holds annual 10-K figures: revenue, costs, margins, R&D, SG&A, interest, tax, net income, diluted EPS, cash flows, capex, dividends, buybacks, cash, assets, liabilities, equity and debt, plus bank, insurance and REIT lines.`,
        `FinScope 的数据里没有：${what}。FinScope 不会用别的数字代替。每家公司有 10-K 年度数字：营收、成本、利润率、研发、销售及管理费用、利息、所得税、净利润、稀释每股收益、现金流、资本开支、分红、回购、现金、资产、负债、股东权益和债务，以及银行、保险和房地产信托的专门科目。`)});
    },
    oneAtATime: (r, p, topic) => finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, tickers: [...p.companies]}, summary: ask(p.lang,
      `This is answered one company at a time. Pick one:`, `这个问题一次回答一家公司，请选一家：`), offers: p.companies.slice(0, 4).map(t => `${t}: ${p.text}`)}),
    declineCombination: (r, p, kind) => finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', plan: {...r.plan, tickers: [...p.companies]}, summary: kind === 'narrower'
      ? ask(p.lang, 'A narrower version of this figure (with part of it excluded) is not in the data. FinScope states reported totals and its defined indicators only.', '数据里没有扣除某部分之后的口径。FinScope 只陈述报告的总数和已定义的指标。')
      : ask(p.lang, 'FinScope does not compute that combination. Ask for each figure, or for one of its defined indicators (margins, cash conversion, free cash flow, debt to equity, interest coverage, ROE, ROA and others).', 'FinScope 不计算这个组合。可以分别问每个数字，或问已定义的指标（各类利润率、现金转化率、自由现金流、债务权益比、利息保障倍数、净资产收益率、总资产收益率等）。')})
  };
}

const OUTSIDE_REASON = {
  files_20f: ['it files annual reports on Form 20-F or 40-F as a foreign private issuer, not on Form 10-K', '它作为外国私人发行人提交 20-F 或 40-F 年报，而不是 10-K'],
  not_us_listed: ['it is not listed in the US and does not file annual reports with the SEC', '它不在美国上市，也不向 SEC 提交年报'],
  private: ['it is a private company with no public SEC annual reports', '它是私人公司，没有公开的 SEC 年报'],
  unknown: ['no company with that ticker or name is in the universe: US companies that are SEC large accelerated filers and file 10-Ks with XBRL', '公司全集里没有这个代码或名字：全集是提交 10-K（XBRL）的美国大型加速申报公司']
};

export function answerQuestion(question, bundle, options = {}) {
  const a = answerCore(question, bundle, options);
  // A covered company named beside one outside the universe is answered; the outside one is named in the answer.
  if (a.outside) {
    if (a.status === 'answered') a.summary = `${a.summary}${a.lang === 'zh' ? '' : ' '}${a.outside}`;
    else a.notes = [a.outside, ...(a.notes || [])];
  }
  delete a.outside;
  return a;
}

function answerCore(question, bundle, {date, universe} = {}) {
  if (!bundle?.snapshots?.length || !bundle.companies?.length) throw new Error('An evidence bundle is required.');
  const asOf = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : bundle.as_of;
  const snapshot = selectSnapshot(bundle.snapshots, asOf);
  const prepared = universe?.index ? prepareIndex(universe.index) : null;
  const p = parseQuestion(question, bundle, asOf, prepared);
  const r = base(p, bundle, asOf, snapshot);
  const lang = p.lang, c = p.cues;
  r.plan.tickers = [...p.companies];
  if (!snapshot) return finish(r, {status: 'clarify', topic: 'out_of_range', summary: ask(lang, `The information date ${asOf} is before the first saved snapshot (${bundle.snapshots[0].as_of}).`, `信息日期 ${asOf} 早于第一个已保存快照（${bundle.snapshots[0].as_of}）。`)});
  const meaningful = (c.rateWords && c.tenor) || p.companies.length || p.others.length || p.metrics.length || p.unsupported.length || p.bridge.length || p.price || p.dates.length || p.years.length || Object.entries(c).some(([k, v]) => v && !['latest', 'low', 'gap', 'why', 'rateWords', 'tenor', 'filingDoc', 'change', 'compare', 'rank', 'trend', 'definition'].includes(k));
  const letters = p.text.replace(/[\s\p{P}\p{S}\d]/gu, '');
  if (!letters.length || !meaningful) {
    return finish(r, {status: 'clarify', topic: 'gibberish', summary: ask(lang,
      'I could not read a question about the six companies in that. Try one of these, or ask what this box can answer.',
      '我没能从这句话里读出关于这六家公司的问题。可以试试下面这些，或者问“你能回答什么问题”。'), offers: defaultOffers(lang)});
  }
  if (c.offTopic) return finish(r, {status: 'refused', topic: 'off_topic', summary: prepared ? ask(lang,
    `This box only answers questions about the saved SEC filings: annual figures for ${prepared.index.count} US companies and the six-company deep ledger. It does not follow other instructions or chat about other topics.`,
    `这个问答框只回答关于已保存 SEC 财报的问题：${prepared.index.count} 家美国公司的年度数字，以及六家公司的深度账本。它不执行其他指令，也不聊其他话题。`) : ask(lang,
    'This box only answers questions about the saved SEC evidence for AAPL, MSFT, NVDA, AMZN, GOOGL and META. It does not follow other instructions or chat about other topics.',
    '这个问答框只回答关于 AAPL、MSFT、NVDA、AMZN、GOOGL、META 已保存 SEC 证据的问题，不执行其他指令，也不聊其他话题。'), offers: defaultOffers(lang)});
  if (c.writeRequest) return finish(r, {status: 'refused', topic: 'write_request', summary: ask(lang,
    'This box cannot change saved filings: the figures are what the companies reported to the SEC. To try a different number, set your own assumption on the Scenarios page, where every result is labelled as yours.',
    '这个问答框不能修改已保存的财报数字：这些数字是公司向 SEC 报告的。想试一个不同的数，请在“情景”页设定你自己的假设，结果都会标明是你的假设。'),
    offers: p.companies.length && p.metrics.length ? [lang === 'zh' ? `${zhName(p.companies[0])}的${label(p.metrics[0], 'zh')}是多少` : `${p.companies[0]} ${label(p.metrics[0], 'en').toLowerCase()}`] : defaultOffers(lang, p.companies[0] || 'NVDA')});
  if (c.advice || (c.stockMove && !p.metrics.length && !p.unsupported.length)) {
    const t = p.companies[0] || 'NVDA';
    return finish(r, {status: 'refused', topic: 'advice', summary: ask(lang,
      'FinScope does not give investment advice: no buy, sell or hold calls, price targets or stock picks. It can show what the filings report, so you can form your own view.',
      'FinScope 不提供投资建议：不做买入、卖出或持有判断，不给目标价，也不荐股。它可以告诉你财报里报告了什么，方便你自己判断。'),
      offers: lang === 'zh' ? [`${zhName(t)}的利润有现金流支撑吗`, `${zhName(t)}近几年的营收走势`, `${zhName(t)}的异常分数是多少`] : [`Is ${t}'s profit backed by operating cash?`, `${t} revenue trend`, `${t} anomaly percentile`]});
  }
  if (c.fraud && c.anomaly && c.definition && !p.companies.length) return definitionAnswer(r, p);
  if (c.fraud) {
    const t = p.companies[0] || 'NVDA';
    return finish(r, {status: 'refused', topic: 'fraud_verdict', summary: ask(lang,
      'FinScope cannot judge whether a company misstates its accounts, and it will not give a fraud verdict. It can show transparent indicators — the accrual ratio, cash conversion and the AI triage percentile — each with its source and limits.',
      'FinScope 无法判断一家公司是否财务造假，也不会给出这类结论。它可以展示透明的指标——应计比率、现金转化率和 AI 分诊百分位——每个都附来源和局限。'),
      offers: lang === 'zh' ? [`${zhName(t)}的应计比率`, `${zhName(t)}的现金转化率`, `${zhName(t)}的异常分数是多少`] : [`${t} accrual ratio`, `${t} cash conversion`, `${t} anomaly percentile`]});
  }
  if (p.others.length && prepared && p.companies.length) {
    const reason = OUTSIDE_REASON[p.otherReasons[0]] || OUTSIDE_REASON.unknown;
    r.outside = ask(lang, `${p.others.slice(0, 3).join(', ')} is not in the FinScope universe (${reason[0]}), so this covers ${p.companies.join(', ')} only.`,
      `${p.others.slice(0, 3).join('、')} 不在 FinScope 公司全集里（${reason[1]}），所以这里只回答 ${p.companies.join('、')}。`);
    p.others = [];
  }
  if (p.others.length && prepared) {
    const reason = OUTSIDE_REASON[p.otherReasons[0]] || OUTSIDE_REASON.unknown;
    return finish(r, {status: 'not_in_bundle', topic: 'out_of_universe', plan: {...r.plan, tickers: [...p.companies]}, summary: ask(lang,
      `${p.others.slice(0, 3).join(', ')} is not in the FinScope universe: ${reason[0]}. The universe holds ${prepared.index.count} companies; search by ticker or name on the Financials page, or look the company up in SEC EDGAR.`,
      `${p.others.slice(0, 3).join('、')} 不在 FinScope 公司全集里：${reason[1]}。全集共有 ${prepared.index.count} 家公司；可以在“财务”页按代码或名字搜索，或到 SEC EDGAR 查找这家公司。`),
      notes: ['https://www.sec.gov/edgar/search/'], offers: p.companies.length ? defaultOffers(lang, p.companies[0]) : defaultOffers(lang)});
  }
  if (p.others.length) {
    const names = p.others.slice(0, 3).join(', ');
    return finish(r, {status: 'not_in_bundle', topic: 'out_of_universe', summary: ask(lang,
      `${names} is not in this bundle. FinScope holds six companies: AAPL, MSFT, NVDA, AMZN, GOOGL and META. For another US-listed company, look it up in SEC EDGAR (company search) and read its 10-K; FinScope's own pipeline can be run on it locally (see the README).`,
      `${names} 不在这个证据包里。FinScope 只有六家公司：AAPL、MSFT、NVDA、AMZN、GOOGL 和 META。其他美股公司可以在 SEC EDGAR 的公司检索里找到并阅读其 10-K；也可以按 README 在本地对它运行 FinScope 的流程。`),
      notes: ['https://www.sec.gov/edgar/search/'], offers: p.companies.length ? defaultOffers(lang, p.companies[0]) : defaultOffers(lang)});
  }
  if (c.provenance && !p.companies.length && !p.metrics.length && !p.unsupported.length) return sourcesAnswer(r, lang, bundle, asOf, snapshot);
  if (c.scope && !p.companies.length && !p.metrics.length) return scopeAnswer(r, lang, bundle);
  if (c.freshness && !p.metrics.length) return freshnessAnswer(r, lang, bundle, asOf, snapshot);
  if (p.price || (c.pastMove && !p.metrics.length && !p.unsupported.length) || (c.rateWords && p.companies.length && !c.rates && !p.metrics.length && !p.unsupported.length && !p.bridge.length)) {
    return finish(r, {status: 'not_in_bundle', topic: 'price', summary: ask(lang,
      'Share prices, market value and valuation multiples (P/E and similar) are not in this bundle. FinScope holds reported financial statements and Treasury yields only; it is not a live-price terminal.',
      '股价、市值和估值倍数（市盈率等）不在这个证据包里。FinScope 只有财报数据和美国国债收益率，不是实时行情终端。'), offers: defaultOffers(lang, p.companies[0] || 'NVDA')});
  }
  if (prepared && p.unsupported.length && !p.bridge.length) return universeHelpers(bundle).unsupported(r, p);
  if (universeRoute(p, bundle, snapshot, prepared)) {
    return answerUniverse(r, p, {prepared, shards: universe.shards || {}, screen: universe.screen || null, asOf, latestDate: bundle.as_of}, universeHelpers(bundle));
  }
  if (!prepared && p.metrics.some(m => UNIVERSE_ONLY.has(m))) return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', plan: {...r.plan, metric: p.metrics.find(m => UNIVERSE_ONLY.has(m))}, summary: ask(lang,
    `${label(p.metrics.find(m => UNIVERSE_ONLY.has(m)), 'en')} comes from FinScope's company universe, which is not loaded here. FinScope will not substitute a different figure.`,
    `${label(p.metrics.find(m => UNIVERSE_ONLY.has(m)), 'zh')}来自 FinScope 的公司全集数据，这里没有加载。FinScope 不会用别的数字代替。`), offers: defaultOffers(lang, p.companies[0] || 'NVDA')});
  // Balance lines that exist only as YTD changes in the bridge.
  const changeWord = c.change || c.bridge;
  const bridgeOnly = p.bridge.filter(b => ['receivables', 'inventory', 'payables'].includes(b));
  if (bridgeOnly.length && !changeWord) {
    const id = `${bridgeOnly[0] === 'receivables' ? 'receivables' : bridgeOnly[0] === 'inventory' ? 'inventory' : 'payables'}_balance`;
    p.unsupported.push(id);
  }
  if (p.unsupported.length) {
    const what = p.unsupported.map(id => UNSUPPORTED[id][lang === 'zh' ? 2 : 1]).join(L(lang, '; ', '；'));
    const t = p.companies[0];
    const bal = p.unsupported.find(u => u.endsWith('_balance'));
    return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', plan: {...r.plan, metric: p.unsupported[0]}, summary: ask(lang,
      `Not in this bundle: ${what}. FinScope will not substitute a different figure. It holds ${IN_BUNDLE.en}.`,
      `证据包里没有：${what}。FinScope 不会用别的数字代替。它包含${IN_BUNDLE.zh}。`),
      notes: t ? [ask(lang, `Read ${t}'s latest 10-K for this line; ask "link to ${t}'s 10-K" for the document.`, `这个数字请到 ${t} 最新 10-K 里查；可以问“${zhName(t)}的 10-K 链接”。`)] : [],
      offers: bal && t ? [lang === 'zh' ? `${zhName(t)}的${label(bal.replace('_balance', ''), 'zh')}（年初至今）` : `${t} ${bal.replace('_balance', '')} change this year`] : defaultOffers(lang, t || 'NVDA')});
  }
  const ratesTopic = (c.rates || (c.rateWords && c.tenor)) && !p.companies.length;
  if (p.badDates.length) return finish(r, {status: 'clarify', topic: 'clarify', summary: ask(lang,
    `${p.badDates[0]} is not a valid calendar date.`, `${p.badDates[0]} 不是有效的日期。`), offers: defaultOffers(lang, p.companies[0] || 'NVDA')});
  if (c.forecast || c.stockMove) return finish(r, {status: 'refused', topic: 'forecast', summary: ask(lang,
    'FinScope does not forecast. It reports what companies have already filed. To explore a weaker year, use the Scenarios section, where you set the assumptions yourself and every result is labelled as yours.',
    'FinScope 不做预测，只报告公司已经提交的财报。想看看“更差的一年”会怎样，请用“情景”页：假设由你自己设定，结果都标明是你的假设。'), offers: defaultOffers(lang, p.companies[0] || 'NVDA')});
  // Standalone quarters and half-years: the bundle keeps only the latest fiscal year-to-date checkpoint.
  if (c.quarterSpecific && !ratesTopic) return finish(r, {status: 'not_in_bundle', topic: 'quarter_history', summary: ask(lang,
    'Standalone quarters and half-years are not in this bundle. It keeps one interim figure per company: the latest fiscal year-to-date checkpoint from the most recent 10-Q, compared with the same period a year earlier.',
    '证据包里没有单季度或半年度数据。每家公司只有一个中期数字：最新 10-Q 的财年初至今累计数，并与上年同期对比。'),
    offers: (p.companies.length ? p.companies : ['NVDA']).slice(0, 2).map(t => lang === 'zh' ? `${zhName(t)}年初至今的营收` : `${t} year-to-date revenue`)});
  const index = annualIndex(bundle, asOf);
  // Calendar years match fiscal years only for December year ends.
  if (c.calendar && !ratesTopic) {
    const off = (p.companies.length ? p.companies : TICKERS).filter(t => index[t].at(-1)?.row.period_end.slice(5, 7) !== '12');
    if (off.length) return finish(r, {status: 'not_in_bundle', topic: 'calendar_year', summary: ask(lang,
      `Calendar-year figures are not in this bundle for ${off.join(', ')}: their fiscal years do not end in December (${off.map(t => `${t} latest: ${periodText(index[t].at(-1).row, 'en')}`).join('; ')}). Ask by fiscal year instead.`,
      `证据包里没有 ${off.join('、')} 的自然年数据：它们的财年不在十二月结束（${off.map(t => `${t} 最新：${periodText(index[t].at(-1).row, 'zh')}`).join('；')}）。请按财年提问。`),
      offers: off.slice(0, 2).map(t => lang === 'zh' ? `${zhName(t)}最新财年的营收` : `${t} latest fiscal year revenue`)});
  }
  // A date in a figure question must be one of the company's fiscal year ends.
  if (p.dates.length && !ratesTopic) {
    const ts = p.companies;
    if (!ts.length || ts.some(t => !index[t].some(e => e.row.period_end === p.dates[0]))) return finish(r, {status: 'clarify', topic: 'clarify', summary: ask(lang,
      `${p.dates[0]} is not a fiscal year end${ts.length ? ` for ${ts.join(', ')}` : ''}. FinScope holds annual periods and one year-to-date checkpoint, so name a fiscal year${ts.length ? ` (${ts.map(t => `${t}'s latest ended ${index[t].at(-1).row.period_end}`).join('; ')})` : ''}.`,
      `${p.dates[0]} 不是${ts.length ? ` ${ts.join('、')} 的` : ''}财年末。FinScope 只有年度数据和一个年初至今对比，请按财年提问${ts.length ? `（${ts.map(t => `${t} 最新财年截至 ${index[t].at(-1).row.period_end}`).join('；')}）` : ''}。`),
      offers: defaultOffers(lang, ts[0] || 'NVDA')});
    p.exactEnd = p.dates[0];
    p.years = [Number(p.dates[0].slice(0, 4))];
    p.yearOrder = [...p.years];
  }

  // Period checks: future or unfiled fiscal years and years before the bundle (rankings list them instead).
  // Named companies with 谁/哪个…更 are a comparison of those companies; a six-company ranking needs none named, or 'all six'.
  const rankLike = c.rank && (p.companies.length === 0 || /六家|六个公司|所有公司|全部公司|all six|the six|these six|six companies|all companies/.test(p.low));
  const wanted = p.range ? null : p.years;
  const perCompanyYears = p.companies.length >= 2 && p.yearOrder.length === p.companies.length;
  const pairs = perCompanyYears ? p.companies.map((t, i) => [t, [p.yearOrder[i]]]) : (p.companies.length ? p.companies : TICKERS).map(t => [t, wanted || []]);
  if (wanted?.length && !ratesTopic && !rankLike && !p.exactEnd) {
    for (const [t, ys] of pairs) {
      const ends = index[t].map(e => Number(e.row.period_end.slice(0, 4)));
      const late = ys.find(y => y > Math.max(...ends));
      if (late) return finish(r, {status: 'refused', topic: 'forecast', plan: {...r.plan, period: `FY${late}`}, summary: ask(lang,
        `${t}'s FY${late} has not been filed by ${asOf}, so it is not in this bundle, and FinScope does not forecast it. The latest filed annual period is ${periodText(index[t].at(-1).row, lang)}.`,
        `截至 ${asOf}，${t} 的 ${late} 财年还没有提交年报，不在证据包里，FinScope 也不做预测。最新已提交的年度是 ${periodText(index[t].at(-1).row, lang)}。`),
        offers: lang === 'zh' ? [`${zhName(t)}最新的营收是多少`, `${zhName(t)}今年以来的经营现金流`] : [`${t} latest revenue`, `${t} year-to-date operating cash flow`]});
      const early = ys.find(y => y < Math.min(...ends));
      if (early) return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', plan: {...r.plan, period: `FY${early}`}, summary: ask(lang,
        `FY${early} is before the first ${t} annual period in this bundle (${periodText(index[t][0].row, lang)}).`,
        `${early} 财年早于证据包里 ${t} 的第一个年度（${periodText(index[t][0].row, lang)}）。`), offers: defaultOffers(lang, t)});
    }
  }

  // Topics.
  if (ratesTopic) return ratesAnswer(r, p, bundle, asOf);
  if (c.definition && !p.companies.length && (p.metrics.length || p.bridge.length || c.anomaly)) return definitionAnswer(r, p);
  if (c.anomaly) return withCompanies(r, p, 'anomaly', ts => anomalyAnswer(r, p, bundle, snapshot, ts, asOf), true);
  if (c.filingLink && !p.metrics.length || (c.filingDoc && !p.metrics.length && !c.ytd && !c.bridge && !c.cashSupport && !c.change && p.companies.length && !c.trend)) return withCompanies(r, p, 'filing', ts => filingAnswer(r, p, bundle, index, ts, asOf));
  const bridgeTopic = p.bridge.length || (c.bridge && (c.why || /working capital|营运资本|营运资金|运营资本|调节|桥|bridge|reconcil|拆解|分解|breakdown/.test(p.low)) && (p.metrics.some(m => ['operating_cash_flow', 'net_income', 'profit_cash_gap', 'cash'].includes(m)) || c.gap || /working capital|营运资本|营运资金|运营资本|bridge|桥|reconcil|调节/.test(p.low)));
  if (bridgeTopic) return p.companies.length >= 2 ? oneAtATime(r, p, 'bridge') : withCompanies(r, p, 'bridge', ts => bridgeAnswer(r, p, bundle, index, ts, asOf));
  if (c.cashSupport && (p.companies.length === 1 || (p.companies.length === 0 && !c.rank))) return withCompanies(r, p, 'cash_support', ts => cashSupportAnswer(r, p, bundle, index, ts[0], asOf));
  const annualThisYear = p.companies.length && index[p.companies[0]].at(-1)?.row.period_end.slice(0, 4) === asOf.slice(0, 4);
  if (c.ytd || (p.relative === 'this_year' && !wanted?.length && !annualThisYear)) {
    if (p.years.length && p.years.some(y => y < Number(asOf.slice(0, 4)) - 1)) return finish(r, {status: 'not_in_bundle', topic: 'quarter_history', summary: ask(lang,
      'Standalone or older quarters are not in this bundle. It keeps one fiscal year-to-date checkpoint per company: the latest 10-Q, compared with the same period a year earlier.',
      '证据包里没有单季度或更早的季度数据。每家公司只保留一个年初至今对比：最新 10-Q 与上年同期。'), offers: defaultOffers(lang, p.companies[0] || 'NVDA')});
    if (p.companies.length >= 2) return oneAtATime(r, p, 'ytd');
    return withCompanies(r, p, 'ytd', ts => ytdAnswer(r, p, bundle, index, ts, asOf));
  }
  // Metric questions: one figure, a defined combination, several figures for one company, or decline.
  const sel = selectFigures(p);
  if (sel.route === 'cash_support') return withCompanies(r, p, 'cash_support', ts => cashSupportAnswer(r, p, bundle, index, ts[0], asOf));
  if (sel.decline) return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', summary: sel.decline === 'narrower'
    ? ask(lang, 'A narrower version of this figure (with part of it excluded) is not in this bundle. FinScope states reported totals and its defined indicators only, and will not present the total as the narrower figure.', '证据包里没有扣除某部分之后的口径。FinScope 只陈述报告的总数和已定义的指标，不会把总数当作较窄的口径给出。')
    : ask(lang, `FinScope does not compute that combination. It states each figure on its own, or one of its defined indicators: ${RATIOS.concat(DERIVED).map(k => label(k, 'en').toLowerCase()).join(', ')}.`, `FinScope 不计算这个组合。它可以分别给出每个数字，或给出已定义的指标：${RATIOS.concat(DERIVED).map(k => label(k, 'zh')).join('、')}。`),
    offers: defaultOffers(lang, p.companies[0] || 'NVDA')});
  if (sel.figures) {
    if (p.companies.length === 1 && !c.trend && !c.change && !c.compare && !rankLike && p.yearOrder.length < 2 && !p.range && !p.lastN) return figuresAnswer(r, p, bundle, index, p.companies[0], sel.figures, asOf);
    return finish(r, {status: 'clarify', topic: 'clarify', plan: {...r.plan, metrics: sel.figures}, summary: ask(lang,
      'Ask about one figure at a time for comparisons, trends, changes and rankings, so that each number answers what was asked. For one company, several figures for the same year can be listed together.',
      '对比、走势、变化和排名请一次只问一个数字，这样每个数字都对应你的问题。同一家公司同一年的几个数字可以一起列出。'),
      offers: sel.figures.slice(0, 2).map(k => lang === 'zh' ? `${p.companies.map(t => zhName(t)).join('和') || '英伟达'}的${label(k, 'zh')}` : `${p.companies.join(' and ') || 'NVDA'} ${label(k, 'en').toLowerCase()}`)});
  }
  let metric = sel.metric;
  if (!metric && c.cashSupport) metric = 'cash_conversion';
  if (!metric && c.change) metric = 'revenue';
  if (!metric && c.gap && /现金|cash/.test(p.low)) metric = 'profit_cash_gap';
  if (c.definition && !p.companies.length && metric) return definitionAnswer(r, {...p, metrics: [metric]});
  if (metric === 'net_income' && profitEvaluative(p)) {
    if (p.companies.length === 1 || (!p.companies.length && !rankLike)) return withCompanies(r, p, 'cash_support', ts => cashSupportAnswer(r, p, bundle, index, ts[0], asOf));
    metric = 'cash_conversion';
  }
  if (!metric) {
    if (p.companies.length && /\bratio\b|turnover|coverage|multiple|\bmargin|周转|倍数|比率|利润率/.test(p.masked)) return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', summary: ask(lang,
      `That ratio is not in this bundle. FinScope computes only its defined indicators: ${RATIOS.concat(DERIVED).map(k => label(k, 'en').toLowerCase()).join(', ')}.`,
      `证据包里没有这个比率。FinScope 只计算已定义的指标：${RATIOS.concat(DERIVED).map(k => label(k, 'zh')).join('、')}。`), offers: defaultOffers(lang, p.companies[0])});
    if (p.companies.length) return finish(r, {status: 'clarify', topic: 'clarify', summary: ask(lang,
      `What would you like to know about ${p.companies.map(t => company(t, lang)).join(', ')}? Name a figure (for example operating cash flow), a ratio, a fiscal year, or ask whether its profit is backed by cash.`,
      `想了解 ${p.companies.map(t => company(t, lang)).join('、')} 的哪方面？可以说一个数字（如经营现金流）、一个比率、一个财年，或者问它的利润有没有现金流支撑。`), offers: defaultOffers(lang, p.companies[0])});
    return finish(r, {status: 'clarify', topic: 'gibberish', summary: ask(lang, 'Which company and which figure? This box answers about AAPL, MSFT, NVDA, AMZN, GOOGL and META.', '请说明哪家公司、哪个数字。这个问答框回答 AAPL、MSFT、NVDA、AMZN、GOOGL、META 的问题。'), offers: defaultOffers(lang)});
  }
  if (rankLike) {
    if (c.growthRank || c.change) {
      if (!['revenue', 'revenue_growth'].includes(metric)) return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', plan: {...r.plan, metric}, summary: ask(lang,
        `Rankings by growth are available for revenue only (revenue growth). For ${label(metric, 'en').toLowerCase()}, ask one company's change, for example "NVDA ${label(metric, 'en').toLowerCase()} change".`,
        `按增长排名只支持营收（营收增长率）。${label(metric, 'zh')}请问单家公司的变化，例如“英伟达${label(metric, 'zh')}比上年变化多少”。`), offers: lang === 'zh' ? ['哪家公司营收增长最快'] : ['Which company grew revenue fastest?']});
      metric = 'revenue_growth';
    }
    r.plan.metric = metric;
    return rankAnswer(r, p, bundle, index, metric, asOf);
  }
  r.plan.metric = metric;
  if (p.companies.length >= 2) {
    if (c.trend || p.range || p.lastN) return finish(r, {status: 'clarify', topic: 'clarify', summary: ask(lang,
      'Trends are shown one company at a time, each over its own fiscal years. Pick one:', '走势一次只显示一家公司，各按自己的财年。请选一家：'),
      offers: p.companies.map(t => lang === 'zh' ? `${zhName(t)}近几年的${label(metric, 'zh')}` : `${t} ${label(metric, 'en').toLowerCase()} trend`)});
    if (c.growthCompare || c.growthRank || (c.change && p.yearOrder.length < 2)) {
      if (!['revenue', 'revenue_growth'].includes(metric)) return finish(r, {status: 'not_in_bundle', topic: 'unsupported_metric', plan: {...r.plan, metric}, summary: ask(lang,
        `Growth is compared across companies for revenue only (revenue growth). For ${label(metric, 'en').toLowerCase()}, ask one company's change at a time.`,
        `跨公司只比较营收的增长（营收增长率）。${label(metric, 'zh')}的变化请一次问一家公司。`),
        offers: p.companies.map(t => lang === 'zh' ? `${zhName(t)}的${label(metric, 'zh')}比上年变化多少` : `${t} ${label(metric, 'en').toLowerCase()} change`)});
      metric = 'revenue_growth';
      r.plan.metric = metric;
    }
    return compareAnswer(r, p, bundle, index, metric, p.companies, asOf);
  }
  if (!p.companies.length && p.universe) return finish(r, {status: 'clarify', topic: 'ambiguous', plan: {...r.plan, metric}, summary: ask(lang,
    `Which company? Name a ticker or company name for ${label(metric, 'en').toLowerCase()}, up to eight to compare; rankings across a sector are on the Screen page.`,
    `哪家公司？请写出代码或公司名（比较最多八家）；跨行业排名请用“筛选”页。`), offers: lang === 'zh' ? [`英伟达的${label(metric, 'zh')}`] : [`NVDA ${label(metric, 'en').toLowerCase()}`]});
  if (!p.companies.length) return finish(r, {status: 'clarify', topic: 'ambiguous', summary: ask(lang,
    `Which company? ${label(metric, 'en')} is available for AAPL, MSFT, NVDA, AMZN, GOOGL and META, or ask which of the six is highest.`,
    `哪家公司？${label(metric, 'zh')} 对 AAPL、MSFT、NVDA、AMZN、GOOGL、META 都可以查，也可以问六家里谁最高。`),
    offers: lang === 'zh' ? [`英伟达的${label(metric, 'zh')}`, `哪家公司${label(metric, 'zh')}最高`] : [`NVDA ${label(metric, 'en').toLowerCase()}`, `Which company has the highest ${label(metric, 'en').toLowerCase()}?`]});
  const t = p.companies[0];
  if (metric === 'revenue_growth' && p.years.length === 2 && !c.trend) p.years = [p.years[1]];
  if (c.trend || p.range || p.lastN || p.years.length >= 3) return trendAnswer(r, p, bundle, index, t, metric, asOf);
  if (c.change && !c.definition || p.years.length === 2) return changeAnswer(r, p, bundle, index, t, metric, asOf);
  return metricAnswer(r, p, bundle, index, t, metric, asOf);
}

const RATIO_PAIRS = {'net_income>revenue': 'net_margin', 'operating_income>revenue': 'operating_margin', 'operating_cash_flow>revenue': 'cash_margin', 'operating_cash_flow>net_income': 'cash_conversion', 'current_assets>current_liabilities': 'current_ratio', 'liabilities>assets': 'liabilities_assets', 'cash>current_liabilities': 'cash_coverage',
  'gross_profit>revenue': 'gross_margin', 'rnd>revenue': 'rnd_intensity', 'free_cash_flow>revenue': 'fcf_margin', 'total_debt>equity': 'debt_to_equity', 'operating_income>interest_expense': 'interest_coverage', 'net_income>equity': 'roe', 'net_income>assets': 'roa'};
// One figure "as a share of" revenue, written with the figure first (研发占营收多少, R&D as a share of revenue).
const SHARE_OF = /占.{0,6}(营收|收入|销售额)|as an? (%|percent|percentage|share|proportion) of (revenue|sales)|% of (revenue|sales)|of (revenue|sales)\b|to (revenue|sales)\b/;
const EXCLUDE = /excluding|excl\.?|net of|without|不包括|不含|扣除|扣掉|剔除|除去/;
// Which figure the question asks for. Two named figures are either a defined combination (by the words
// between them), a list for one company, or declined — never the first one silently.
function selectFigures(p) {
  const c = p.cues, figSpans = [];
  for (const s of p.spans) if (s.kind === 'metric' && !figSpans.some(f => f.id === s.id)) figSpans.push(s);
  const ids = figSpans.map(s => s.id);
  if (c.gap && ids.includes('net_income') && (ids.includes('operating_cash_flow') || ids.includes('cash'))) return {metric: 'profit_cash_gap'};
  if (c.cashSupport && (p.companies.length >= 2 || (c.rank && !p.companies.length))) return {metric: 'cash_conversion'};
  // The bare word 现金 / cash next to profit, conversion or support wording means operating cash against
  // profit, never the cash balance: cash support for one company, cash conversion across companies.
  const bareCash = figSpans.some(f => f.id === 'cash' && ['现金', 'cash'].includes(f.alias));
  const profitish = ids.some(k => ['net_income', 'operating_income'].includes(k)) || /利润|盈利|净利|赚|profit|earnings|net income/.test(p.low);
  const convish = /转化|转换|含金量|支撑|撑|兑现|对得上|跟得上|into cash|convert|conversion|back(ed|ing)?\b|support/.test(p.low);
  if (bareCash && (profitish || convish)) {
    if (c.gap) return {metric: 'profit_cash_gap'};
    return p.companies.length >= 2 || (c.rank && !p.companies.length) ? {metric: 'cash_conversion'} : {route: 'cash_support'};
  }
  if (ids.length >= 2) {
    const [a, b] = figSpans;
    const between = p.low.slice(a.end, b.start), window = p.low.slice(Math.max(0, a.start - 8), b.end);
    const key = `${a.id}>${b.id}`, set = [a.id, b.id].sort().join('|');
    if (set === 'buybacks|dividends' && /\+|plus|加上|合计|总共|一共|combined|together|total/.test(window)) return {metric: 'payout'};
    if (/minus|减去|减掉|after (deducting|subtracting)/.test(between)) { const m = {'net_income>operating_cash_flow': 'profit_cash_gap', 'operating_cash_flow>capex': 'free_cash_flow'}[key]; return m ? {metric: m} : {decline: 'combination'}; }
    if (EXCLUDE.test(window)) return set === 'capex|operating_cash_flow' ? {metric: 'free_cash_flow'} : {decline: 'combination'};
    if (/divided by|÷|\/|as an? (%|percent|percentage|share|proportion) of|% of|percent of|percentage of|share of|占|除以|之比|比率|ratio of|relative to/.test(between) || /占.{0,4}比|比例/.test(window)) return RATIO_PAIRS[key] ? {metric: RATIO_PAIRS[key]} : {decline: 'combination'};
    if (ids.length === 2 && set === 'net_income|operating_cash_flow') return p.companies.length >= 2 || (c.rank && !p.companies.length) ? {metric: 'cash_conversion'} : {route: 'cash_support'};
    return {figures: ids};
  }
  if (ids.length === 2 && ids[1] === 'revenue' && RATIO_PAIRS[`${ids[0]}>revenue`] && SHARE_OF.test(p.low)) return {metric: RATIO_PAIRS[`${ids[0]}>revenue`]};
  if (ids.length === 1 && REPORTED.includes(ids[0])) {
    if (EXCLUDE.test(p.low)) return {decline: 'narrower'};
    if (/\bmargins?\b|\bratio\b|% of|percent(age)? of|as a share of|\bper (share|employee|user|unit|head)\b|占比|比例|比率|人均/.test(p.masked)) return {decline: 'combination'};
  }
  return {metric: ids[0] || null};
}

// A closed rule for 利润 / profit (net income). The words below are the only ones that keep the level
// figure: size and amount predicates, plus the filler of an ordinary lookup or comparison. Any other word
// beside it (扎实, 健康, 稳, 干净, 成色 …) or an evaluative frame (怎么样, 是不是, how is …) asks about the
// quality of the profit, which FinScope answers with cash support or cash conversion — never the bare level.
const PROFIT_LEVEL = ['多少钱', '有多少', '是多少', '多少', '多不多', '高不高', '大不大', '少不少', '低不低', '几倍', '几', '金额', '数额', '规模', '总额', '总量', '数值', '数字', '数据', '增长', '增加', '减少', '下降', '上升', '提高', '降低', '变化', '变动', '涨', '跌', '翻倍', '倍', '同比', '环比', '走势', '趋势', '历年', '历史', '逐年', '多年', '几年', '以来', '最快', '更快', '最慢', '更慢', '增速', '速度', '快', '慢', '创新高', '新高', '新低', '创纪录', '暴增', '大增', '激增', '猛增', '暴跌', '大跌', '下滑', '亏损', '盈亏', '亏', '正', '负', '排第几', '第几', '排名', '排行', '排序', '名次', '排', '亿美元', '亿', '万', '美元', '元', '高', '多', '大', '少', '低',
  'how much', 'how many', 'amount', 'total', 'size', 'level', 'value', 'number', 'numbers', 'figure', 'figures', 'higher', 'highest', 'high', 'more', 'most', 'much', 'larger', 'largest', 'large', 'bigger', 'biggest', 'big', 'lower', 'lowest', 'low', 'less', 'least', 'smaller', 'smallest', 'small', 'grow', 'grew', 'growth', 'growing', 'grown', 'change', 'changed', 'changes', 'increase', 'increased', 'decrease', 'decreased', 'rise', 'rose', 'fall', 'fell', 'up', 'down', 'trend', 'history', 'over time', 'over the years', 'fastest', 'faster', 'slowest', 'slower', 'fast', 'slow', 'pace', 'rate', 'record', 'loss', 'losses', 'negative', 'positive', 'surge', 'surged', 'jump', 'jumped', 'plunge', 'plunged', 'drop', 'dropped', 'soar', 'soared', 'rank', 'ranking', 'ranked', 'position', 'billion', 'million', 'dollars', 'usd', 'times'];
const PROFIT_FILLER = ['请问', '请', '帮我', '告诉我', '给我', '看看', '看下', '看一下', '查一下', '查询', '查', '一下', '列出', '显示', '的', '了', '吗', '呢', '啊', '吧', '呀', '么', '嘛', '是', '有', '在', '里', '中', '个', '和', '与', '跟', '及', '以及', '还是', '或者', '或', '对比', '比较', '相比', '比一比', '比', '谁的', '谁', '哪家公司', '哪家', '哪个公司', '哪个', '哪一家', '公司', '六家', '所有', '全部', '更', '最', '很', '非常', '特别', '太', '挺', '相当', '财报', '报告的', '报告', '最新', '最近', '目前', '当前', '现在', '去年同期', '同期', '去年', '今年', '前年', '上一年', '前一年', '上年', '这一年', '一年', '赚得', '赚', '得', '财年', '年度', '年', '这几年', '近几年', '过去', '近', '这些年', '每年', '截至', '到', '从', '之间', 'pk',
  "what's", 'whats', 'what', 'is', 'are', 'was', 'were', 'be', 'been', 'does', 'do', 'did', 'go', 'went', 'gone', 'has', 'have', 'had', 'the', 'a', 'an', 'of', 'in', 'for', 'on', 'at', 'to', 'its', 'their', 's', 'me', 'please', 'show', 'tell', 'give', 'list', 'reported', 'report', 'fiscal', 'year', 'years', 'fy', 'latest', 'recent', 'current', 'now', 'last', 'this', 'previous', 'prior', 'compare', 'compared', 'comparison', 'and', 'or', 'vs', 'versus', 'against', 'between', 'which', 'who', 'whose', 'how', 'over', 'yrs', 'yr', 'each', 'every', 'per', 'since', 'until', 'through', 'ago', 'two', 'three', 'four', 'five', 'six', 'company', 'companies', 'one', 'than', 'with', 'by', 'from', 'so', 'far', 'many', 'very'];
const PROFIT_WORDS = [...PROFIT_LEVEL, ...PROFIT_FILLER].sort((a, b) => b.length - a.length).map(w => latin(w) ? new RegExp(`(?<![a-z])${esc(w)}(?![a-z])`, 'g') : new RegExp(esc(w), 'g'));
const PROFIT_EVALUATIVE = /怎么样|如何|咋样|怎样|好不好|行不行|好吗|是不是|是否|算不算|how('s| is| are| good| solid| healthy| strong| reliable| clean)|is it (good|bad|solid|healthy|ok)/;
function profitEvaluative(p) {
  if (PROFIT_EVALUATIVE.test(p.low)) return true;
  let rest = p.low;
  const blankSpan = (a, b) => { rest = rest.slice(0, a) + ' '.repeat(b - a) + rest.slice(b); };
  for (const h of p.companySpans || findSpans(p.low, COMPANY_TABLE)) blankSpan(h.start, h.end);
  for (const sp of p.spans) blankSpan(sp.start, sp.end);
  rest = rest.replace(/[\d.,，。、;；:：!！?？'"“”‘’()（）\[\]\-–—/%$·~\s]+/g, ' ');
  for (const re of PROFIT_WORDS) rest = rest.replace(re, ' ');
  rest = rest.replace(/[一二两三四五六七八九十百千]+/g, ' ');
  return /[a-z㐀-鿿]/.test(rest);
}

function oneAtATime(r, p, topic) {
  const lang = p.lang;
  return finish(r, {status: 'clarify', topic: 'clarify', summary: ask(lang,
    `The ${topic === 'ytd' ? 'year-to-date checkpoint' : 'profit-to-cash bridge'} is shown one company at a time, because each company's fiscal period differs. Pick one:`,
    `${topic === 'ytd' ? '年初至今对比' : '利润到现金的调节'}一次只显示一家公司，因为各家的财年期间不同。请选一家：`),
    offers: p.companies.map(t => lang === 'zh' ? `${zhName(t)}：${p.text}` : `${t}: ${p.text}`)});
}

function figuresAnswer(r, p, bundle, index, t, figs, asOf) {
  const lang = p.lang, entry = resolvePeriod(p, index, t);
  if (!entry) return missingAnswer(r, p, t, figs[0], null, [figs[0]]);
  const facts = [], calcs = [], rows = [], missing = [];
  for (const k of figs) {
    const res = indicator(bundle, t, entry, k, asOf, lang);
    for (const f of res.facts) if (!facts.some(x => x.key === f.key && x.period_end === f.period_end && x.role === f.role)) facts.push(f);
    if (res.calc) calcs.push(res.calc);
    rows.push([label(k, lang), display(k, res.value, lang)]);
    if (res.value === null) missing.push(label(k, lang));
  }
  if (missing.length === figs.length) return missingAnswer(r, p, t, figs[0], entry, figs);
  return finish(r, {topic: 'figures', plan: {tickers: [t], metric: figs[0], metrics: figs, period: periodPlan(p, entry)}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Figure', '项目'), `${fy(entry.row)} · ${span(entry.row, lang)}`], rows},
    summary: ask(lang, `${company(t, 'en')}, ${periodText(entry.row, 'en')}: ${rows.map(x => `${x[0]} ${x[1]}`).join('; ')}.`, `${company(t, 'zh')}，${periodText(entry.row, 'zh')}：${rows.map(x => `${x[0]} ${x[1]}`).join('；')}。`),
    notes: [...(missing.length ? [ask(lang, `No standard-tag fact for: ${missing.join(', ')}.`, `没有标准标签事实：${missing.join('、')}。`)] : []), ...periodNotes(p, t, entry, figs)],
    offers: defaultOffers(lang, t)});
}

function periodNotes(p, t, entry, keys) {
  const lang = p.lang, notes = [];
  const y = Number(entry.row.period_end.slice(0, 4));
  if (t === 'NVDA') notes.push(ask(lang, `NVIDIA’s fiscal year ends in late January, so FY${y} mostly covers calendar ${y - 1}.`, `英伟达的财年在一月下旬结束，所以 ${y} 财年大致对应 ${y - 1} 自然年。`));
  if (keys.includes('cash')) notes.push(ask(lang, 'Cash and cash equivalents only; marketable securities are not included.', '只含现金及现金等价物，不含有价证券。'));
  return notes;
}

function withCompanies(r, p, topic, fn, allowAll = false) {
  const lang = p.lang;
  if (!p.companies.length && !allowAll) return finish(r, {status: 'clarify', topic: 'ambiguous', plan: {...r.plan}, summary: ask(lang,
    'Which company? Name one of AAPL, MSFT, NVDA, AMZN, GOOGL or META.', '哪家公司？请在 AAPL、MSFT、NVDA、AMZN、GOOGL、META 中选一家。'),
    offers: ['NVDA', 'MSFT', 'AAPL'].map(t => lang === 'zh' ? `${zhName(t)}：${p.text}` : `${t}: ${p.text}`)});
  r.topic = topic;
  return fn(p.companies.length ? p.companies : TICKERS);
}

function resolvePeriod(p, index, t) {
  const rows = index[t];
  if (!rows.length) return null;
  if (p.exactEnd) return rows.find(e => e.row.period_end === p.exactEnd) || null;
  if (p.years.length) return rows.find(e => Number(e.row.period_end.slice(0, 4)) === p.years.at(-1)) || null;
  if (p.relative === 'this_year') return rows.find(e => e.row.period_end.slice(0, 4) === String(rows.at(-1).row.period_end.slice(0, 4))) || rows.at(-1);
  return rows.at(-1);
}
const periodPlan = (p, entry) => p.years.length ? `FY${entry.row.period_end.slice(0, 4)}` : 'latest';
function missingAnswer(r, p, t, metric, entry, missing) {
  const lang = p.lang;
  const what = missing.map(k => k.endsWith('_prior') ? `${label(k.replace('_prior', ''), lang)} ${L(lang, '(prior year)', '（上年）')}` : k === 'positive_net_income' ? L(lang, 'a positive net income', '为正的净利润') : k === 'denominator' ? L(lang, 'a positive denominator', '为正的分母') : label(k, lang)).join(L(lang, ', ', '、'));
  return finish(r, {status: 'not_in_bundle', topic: 'missing_fact', plan: {...r.plan, tickers: [t], metric, period: entry ? periodPlan(p, entry) : null}, summary: ask(lang,
    `${label(metric, 'en')} for ${t}${entry ? ` ${fy(entry.row)}` : ''} is not available: the bundle has no standard-tag fact for ${what}. FinScope does not substitute another figure or treat a missing value as zero.`,
    `${t}${entry ? ` ${entry.row.period_end.slice(0, 4)} 财年` : ''}的${label(metric, 'zh')}无法给出：证据包里没有${what}的标准标签事实。FinScope 不会用别的数字代替，也不把缺失当作零。`),
    offers: defaultOffers(lang, t)});
}

function metricAnswer(r, p, bundle, index, t, metric, asOf) {
  const lang = p.lang, entry = resolvePeriod(p, index, t);
  if (!entry) return missingAnswer(r, p, t, metric, null, [metric]);
  const res = indicator(bundle, t, entry, metric, asOf, lang);
  if (res.value === null) return missingAnswer(r, p, t, metric, entry, res.missing);
  const topic = REPORTED.includes(metric) ? 'metric' : 'ratio';
  const notes = [];
  notes.push(...periodNotes(p, t, entry, [metric]));
  if (p.relative === 'this_year' && entry === index[t].at(-1)) notes.push(ask(lang, `“This year” is read as the latest filed fiscal year, ${fy(entry.row)}.`, `“今年”按最新已提交的财年 ${entry.row.period_end.slice(0, 4)} 财年理解。`));
  if (p.cues.why) notes.push(ask(lang, 'The figures do not state causes; read management’s discussion in the filing for the reasons.', '数字本身不说明原因；原因请读财报里的管理层讨论。'));
  if (metric === 'liabilities_assets' && /debt|债务/.test(p.low)) notes.push(ask(lang, 'This uses total liabilities, not debt alone.', '这里用的是总负债，不只是借款。'));
  if (metric === 'accruals') notes.push(ask(lang, 'A positive accrual ratio means profit ran ahead of operating cash in that year; it is a reason to read working capital, not a verdict (Sloan 1996).', '应计比率为正表示当年利润跑在经营现金前面；这只是去读营运资本的理由，不是结论（Sloan 1996）。'));
  return finish(r, {topic, plan: {tickers: [t], metric, period: periodPlan(p, entry)}, facts: res.facts, calculations: res.calc ? [res.calc] : [], notes,
    summary: ask(lang,
      `${company(t, 'en')} ${label(metric, 'en').toLowerCase()} for ${periodText(entry.row, 'en')}: ${display(metric, res.value, 'en')}.`,
      `${company(t, 'zh')}${periodText(entry.row, 'zh')}的${label(metric, 'zh')}：${display(metric, res.value, 'zh')}。`),
    offers: lang === 'zh' ? [`${zhName(t)}近几年的${label(metric, 'zh')}`, `${zhName(t)}的利润有现金流支撑吗`] : [`${t} ${label(metric, 'en').toLowerCase()} trend`, `Is ${t}'s profit backed by operating cash?`]});
}

function trendAnswer(r, p, bundle, index, t, metric, asOf) {
  const lang = p.lang;
  let rows = index[t];
  if (p.range) rows = rows.filter(e => { const y = Number(e.row.period_end.slice(0, 4)); return y >= p.range[0] && (p.range[1] === null || y <= p.range[1]); });
  else if (p.years.length >= 3) rows = rows.filter(e => p.years.includes(Number(e.row.period_end.slice(0, 4))));
  else rows = rows.slice(-(p.lastN || 6));
  if (!rows.length) return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', summary: ask(lang, `No ${t} annual periods in that range.`, `证据包里没有 ${t} 在这个范围内的年度数据。`), offers: defaultOffers(lang, t)});
  const facts = [], calcs = [], tableRows = [];
  for (const e of rows) {
    const res = indicator(bundle, t, e, metric, asOf, lang);
    facts.push(...res.facts);
    if (res.calc) calcs.push(res.calc);
    tableRows.push([fy(e.row), span(e.row, lang), display(metric, res.value, lang)]);
  }
  const vals = rows.map(e => indicator(bundle, t, e, metric, asOf, lang).value);
  const firstI = vals.findIndex(Number.isFinite), lastI = vals.length - 1 - [...vals].reverse().findIndex(Number.isFinite);
  if (firstI < 0) return missingAnswer(r, p, t, metric, rows.at(-1), indicator(bundle, t, rows.at(-1), metric, asOf, lang).missing);
  const a = rows[firstI].row, b = rows[lastI].row;
  return finish(r, {topic: 'trend', plan: {tickers: [t], metric, period: `${fy(a)}-${fy(b)}`}, facts, calculations: RATIOS.includes(metric) || DERIVED.includes(metric) ? calcs : [],
    table: {columns: [L(lang, 'Fiscal year', '财年'), L(lang, 'Period', '期间'), label(metric, lang)], rows: tableRows},
    summary: ask(lang,
      `${company(t, 'en')} ${label(metric, 'en').toLowerCase()} went from ${display(metric, vals[firstI], 'en')} in ${fy(a)} to ${display(metric, vals[lastI], 'en')} in ${fy(b)} (${rows.length} fiscal years below).`,
      `${company(t, 'zh')}的${label(metric, 'zh')}从 ${a.period_end.slice(0, 4)} 财年的 ${display(metric, vals[firstI], 'zh')} 变为 ${b.period_end.slice(0, 4)} 财年的 ${display(metric, vals[lastI], 'zh')}（共 ${rows.length} 个财年，见下表）。`),
    notes: [ask(lang, 'Each year uses the latest filed version of that period available by the information date.', '每一年都使用信息日期前可得的该期最新提交版本。')],
    offers: lang === 'zh' ? [`${zhName(t)}的利润有现金流支撑吗`] : [`Is ${t}'s profit backed by operating cash?`]});
}

function changeAnswer(r, p, bundle, index, t, metric, asOf) {
  const lang = p.lang, rows = index[t];
  let cur, prev;
  if (p.years.length === 2) {
    prev = rows.find(e => Number(e.row.period_end.slice(0, 4)) === p.years[0]);
    cur = rows.find(e => Number(e.row.period_end.slice(0, 4)) === p.years[1]);
  } else {
    cur = resolvePeriod(p, index, t);
    prev = cur && rows[rows.indexOf(cur) - 1];
  }
  if (!cur || !prev) return finish(r, {status: 'not_in_bundle', topic: 'out_of_range', summary: ask(lang, `The bundle has no earlier ${t} period to compare with.`, `证据包里没有 ${t} 可供对比的更早年度。`), offers: defaultOffers(lang, t)});
  const a = indicator(bundle, t, prev, metric, asOf, lang), b = indicator(bundle, t, cur, metric, asOf, lang);
  if (a.value === null || b.value === null) return missingAnswer(r, p, t, metric, a.value === null ? prev : cur, a.value === null ? a.missing : b.missing);
  const diff = b.value - a.value;
  const ratioLike = RATIOS.includes(metric) || TIMES.has(metric);
  const changeText = TIMES.has(metric) ? `${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)}×` : RATIOS.includes(metric) ? pp(diff * 100) : `${diff >= 0 ? '+' : ''}${money(diff, lang)}`;
  const growth = !ratioLike && a.value > 0 ? b.value / a.value - 1 : null;
  const calcs = [...(a.calc ? [a.calc] : []), ...(b.calc ? [b.calc] : []), {label: L(lang, 'Change', '变化'), formula: ratioLike ? L(lang, `${fy(cur.row)} − ${fy(prev.row)}${RATIOS.includes(metric) ? ', in percentage points' : ''}`, `${fy(cur.row)} − ${fy(prev.row)}${RATIOS.includes(metric) ? '，单位为百分点' : ''}`) : L(lang, `${fy(cur.row)} − ${fy(prev.row)}; growth = current ÷ prior − 1`, `${fy(cur.row)} − ${fy(prev.row)}；增长率 = 本期 ÷ 上期 − 1`), result: `${changeText}${growth !== null ? ` (${pct(growth)})` : ''}`}];
  return finish(r, {topic: 'change', plan: {tickers: [t], metric, period: periodPlan(p, cur)}, facts: [...a.facts, ...b.facts], calculations: calcs,
    table: {columns: [L(lang, 'Fiscal year', '财年'), L(lang, 'Period', '期间'), label(metric, lang)], rows: [[fy(prev.row), span(prev.row, lang), display(metric, a.value, lang)], [fy(cur.row), span(cur.row, lang), display(metric, b.value, lang)]]},
    summary: ask(lang,
      `${company(t, 'en')} ${label(metric, 'en').toLowerCase()} changed by ${changeText}${growth !== null ? ` (${pct(growth)})` : ''}: ${display(metric, a.value, 'en')} in ${fy(prev.row)} → ${display(metric, b.value, 'en')} in ${fy(cur.row)}.`,
      `${company(t, 'zh')}的${label(metric, 'zh')}变化 ${changeText}${growth !== null ? `（${pct(growth)}）` : ''}：${prev.row.period_end.slice(0, 4)} 财年 ${display(metric, a.value, 'zh')} → ${cur.row.period_end.slice(0, 4)} 财年 ${display(metric, b.value, 'zh')}。`),
    notes: p.cues.why ? [ask(lang, 'The figures do not state causes; read management’s discussion in the filing for the reasons.', '数字本身不说明原因；原因请读财报里的管理层讨论。')] : [],
    offers: lang === 'zh' ? [`${zhName(t)}近几年的${label(metric, 'zh')}`] : [`${t} ${label(metric, 'en').toLowerCase()} trend`]});
}

function compareAnswer(r, p, bundle, index, metric, tickers, asOf) {
  const lang = p.lang, facts = [], calcs = [], rows = [];
  const perCompany = p.yearOrder.length >= 2 && p.yearOrder.length === tickers.length;
  if (p.yearOrder.length >= 2 && !perCompany) return finish(r, {status: 'clarify', topic: 'clarify', summary: ask(lang,
    'Name one fiscal year, or one year per company in the same order as the companies.', '请给一个财年，或按公司顺序给每家公司各一个财年。'), offers: defaultOffers(lang, tickers[0])});
  for (const [i, t] of tickers.entries()) {
    const entry = perCompany ? index[t].find(e => Number(e.row.period_end.slice(0, 4)) === p.yearOrder[i]) : resolvePeriod(p, index, t);
    if (!entry) { rows.push([t, '—', L(lang, 'not in bundle', '不在证据包里')]); continue; }
    const res = indicator(bundle, t, entry, metric, asOf, lang);
    facts.push(...res.facts);
    if (res.calc) calcs.push(res.calc);
    rows.push([t, `${fy(entry.row)} · ${span(entry.row, lang)}`, display(metric, res.value, lang), res.value, entry]);
  }
  const shown = rows.filter(x => Number.isFinite(x[3]));
  const ends = new Set(shown.map(x => x[4].row.period_end));
  const each = x => L(lang, `${x[0]} ${x[2]} (${fy(x[4].row)}, ended ${x[4].row.period_end})`, `${x[0]} ${x[2]}（${x[4].row.period_end.slice(0, 4)} 财年，截至 ${x[4].row.period_end}）`);
  if (!shown.length) return missingAnswer(r, p, tickers[0], metric, resolvePeriod(p, index, tickers[0]), [metric]);
  const missing = rows.filter(x => !Number.isFinite(x[3])).map(x => x[0]);
  return finish(r, {topic: 'compare', plan: {tickers: [...tickers], metric, period: perCompany ? p.yearOrder.map(y => `FY${y}`).join(',') : p.years.length ? `FY${p.years.at(-1)}` : 'latest'}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Company', '公司'), L(lang, 'Fiscal period', '财年期间'), label(metric, lang)], rows: rows.map(x => x.slice(0, 3))},
    summary: ask(lang,
      `${label(metric, 'en')}: ${shown.map(each).join(' · ')}.${ends.size > 1 ? ' These fiscal years end on different dates, so they are not the same twelve months.' : ''}${missing.length ? ` Not available for ${missing.join(', ')} (no standard-tag fact).` : ''}`,
      `${label(metric, 'zh')}：${shown.map(each).join(' · ')}。${ends.size > 1 ? '各公司财年截止日期不同，不是同一段十二个月。' : ''}${missing.length ? `${missing.join('、')} 没有标准标签事实，无法给出。` : ''}`),
    notes: [ask(lang, 'Fiscal calendars differ: each company’s own latest or named fiscal year is shown with its dates. Side by side only; this is not a ranking of investment merit.', '各公司财年不同：每家显示自己的最新或指定财年及其日期。仅并列展示，不是投资优劣排名。')],
    offers: lang === 'zh' ? ['六家公司里哪家利润和现金差距最大'] : ['Which of the six has the largest profit-to-cash gap?']});
}

function rankAnswer(r, p, bundle, index, metric, asOf) {
  const lang = p.lang, facts = [], calcs = [], rows = [];
  const notFiled = [];
  for (const t of TICKERS) {
    const entry = resolvePeriod(p, index, t);
    if (!entry) { notFiled.push(t); continue; }
    const res = indicator(bundle, t, entry, metric, asOf, lang);
    facts.push(...res.facts);
    if (res.calc) calcs.push(res.calc);
    rows.push({t, entry, value: res.value});
  }
  const ok = rows.filter(x => Number.isFinite(x.value)), low = p.cues.low;
  ok.sort((a, b) => low ? a.value - b.value : b.value - a.value);
  const missing = rows.filter(x => !Number.isFinite(x.value)).map(x => x.t);
  if (!ok.length) return notFiled.length === TICKERS.length
    ? finish(r, {status: 'not_in_bundle', topic: 'out_of_range', plan: {...r.plan, metric}, summary: ask(lang, `None of the six has an annual period for FY${p.years.at(-1)} in this bundle by ${asOf}.`, `截至 ${asOf}，六家公司在证据包里都没有 ${p.years.at(-1)} 财年的年度数据。`), offers: defaultOffers(lang)})
    : missingAnswer(r, p, TICKERS[0], metric, null, [metric]);
  const top = ok[0];
  let extra = '';
  if (metric === 'profit_cash_gap') {
    const absTop = [...ok].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
    extra = top.value > 0
      ? ask(lang, ` Only ${ok.filter(x => x.value > 0).map(x => x.t).join(', ')} reported net income above operating cash flow.`, `只有 ${ok.filter(x => x.value > 0).map(x => x.t).join('、')} 的净利润高于经营现金流。`)
      : ask(lang, ' None of the six reported net income above operating cash flow in its latest year.', '六家公司最新一年的净利润都没有高于经营现金流。');
    if (absTop.t !== top.t) extra += ask(lang, ` The largest absolute difference is ${absTop.t} (${money(absTop.value, 'en')}; operating cash above profit).`, `绝对差额最大的是 ${absTop.t}（${money(absTop.value, 'zh')}，经营现金高于利润）。`);
  }
  return finish(r, {topic: 'rank', plan: {tickers: [], metric, period: p.years.length ? `FY${p.years.at(-1)}` : 'latest'}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Rank', '排名'), L(lang, 'Company', '公司'), L(lang, 'Fiscal period', '财年期间'), label(metric, lang)], rows: [...ok.map((x, i) => [String(i + 1), x.t, `${fy(x.entry.row)} · ${span(x.entry.row, lang)}`, display(metric, x.value, lang)]), ...missing.map(t => ['—', t, '—', L(lang, 'unavailable', '无')])]},
    summary: ask(lang,
      `${low ? 'Lowest' : 'Highest'} ${label(metric, 'en').toLowerCase()} among the six: ${company(top.t, 'en')} at ${display(metric, top.value, 'en')} (${fy(top.entry.row)}).${extra}`,
      `六家公司中${label(metric, 'zh')}${metric === 'profit_cash_gap' ? (low ? '最小' : '最大') : (low ? '最低' : '最高')}的是${company(top.t, 'zh')}：${display(metric, top.value, 'zh')}（${top.entry.row.period_end.slice(0, 4)} 财年）。${extra}`),
    notes: [ask(lang, `Each company’s own ${p.years.length ? 'named' : 'latest'} fiscal year; calendars differ. ${metric === 'profit_cash_gap' ? 'Gap = net income − operating cash flow, in dollars; the accrual ratio scales it by assets. ' : ''}A descriptive ordering, not a judgement of quality or investment merit.${missing.length ? ` Unavailable: ${missing.join(', ')}.` : ''}${notFiled.length ? ` Not filed for FY${p.years.at(-1)} by ${asOf}: ${notFiled.join(', ')}.` : ''}`,
      `每家公司用自己的${p.years.length ? '指定' : '最新'}财年，财年日历不同。${metric === 'profit_cash_gap' ? '差距 = 净利润 − 经营现金流（美元）；应计比率按资产规模缩放。' : ''}这只是描述性排序，不评价质量或投资价值。${missing.length ? `无法给出：${missing.join('、')}。` : ''}${notFiled.length ? `截至 ${asOf} 尚未提交 ${p.years.at(-1)} 财年年报：${notFiled.join('、')}。` : ''}`)],
    offers: lang === 'zh' ? [`${zhName(top.t)}的利润有现金流支撑吗`] : [`Is ${top.t}'s profit backed by operating cash?`]}, p.universe ? {notes: [...r.notes, ask(lang, 'This ranks the six deep-ledger companies. To rank the whole universe or a sector, use the Screen page; to compare other companies here, name up to eight.', '这里只排名六家深度账本公司。要对全体公司或某个行业排名，请用“筛选”页；要在这里比较其他公司，请点名最多八家。')]} : {});
}

function cashSupportAnswer(r, p, bundle, index, t, asOf) {
  const lang = p.lang, rows = index[t], entry = resolvePeriod(p, index, t);
  if (!entry) return missingAnswer(r, p, t, 'operating_cash_flow', null, ['operating_cash_flow']);
  const m = entry.row.metrics, ni = m.net_income?.value, ocf = m.operating_cash_flow?.value;
  if (!Number.isFinite(ni) || !Number.isFinite(ocf)) return missingAnswer(r, p, t, 'cash_conversion', entry, [!Number.isFinite(ni) ? 'net_income' : 'operating_cash_flow']);
  const facts = [fact(t, 'net_income', m.net_income, lang), fact(t, 'operating_cash_flow', m.operating_cash_flow, lang)];
  const conv = ni > 0 ? ocf / ni : null;
  const acc = indicator(bundle, t, entry, 'accruals', asOf, lang);
  for (const f of acc.facts) if (!facts.some(x => x.key === f.key && x.period_end === f.period_end)) facts.push(f);
  const recent = rows.slice(rows.indexOf(entry) - 5 < 0 ? 0 : rows.indexOf(entry) - 5, rows.indexOf(entry) + 1);
  const above = recent.filter(e => e.row.metrics.net_income?.value > e.row.metrics.operating_cash_flow?.value);
  const calcs = [{label: L(lang, 'Cash conversion', '现金转化率'), formula: FORMULA.cash_conversion[lang === 'zh' ? 1 : 0], result: conv === null ? L(lang, 'unavailable (net income not positive)', '无（净利润不为正）') : times(conv)},
    {label: L(lang, 'Profit-to-cash gap', '利润与现金差距'), formula: FORMULA.profit_cash_gap[lang === 'zh' ? 1 : 0], result: money(ni - ocf, lang)}];
  if (acc.calc) calcs.push(acc.calc);
  const covered = ocf >= ni;
  const tableRows = recent.map(e => [fy(e.row), money(e.row.metrics.net_income?.value, lang), money(e.row.metrics.operating_cash_flow?.value, lang), e.row.metrics.net_income?.value > 0 ? times(e.row.metrics.operating_cash_flow?.value / e.row.metrics.net_income.value) : '—']);
  // Latest YTD checkpoint after this annual period, if any.
  const check = (bundle.interim?.[t] || []).filter(s => s.as_of <= asOf).at(-1);
  let ytd = '';
  if (check && check.current.period_end > entry.row.period_end && !p.years.length) {
    const cm = check.current.metrics, cni = cm.net_income?.value, cocf = cm.operating_cash_flow?.value;
    if (Number.isFinite(cni) && Number.isFinite(cocf)) {
      facts.push(fact(t, 'net_income', cm.net_income, lang, {label: `${label('net_income', lang)} · YTD`}), fact(t, 'operating_cash_flow', cm.operating_cash_flow, lang, {label: `${label('operating_cash_flow', lang)} · YTD`}));
      ytd = ask(lang, ` In the newer fiscal year-to-date (${span(check.current, 'en')}, 10-Q), operating cash flow was ${money(cocf, 'en')} against net income of ${money(cni, 'en')}${cni > 0 ? ` (${times(cocf / cni)})` : ''}.`,
        `在更新的年初至今期间（${span(check.current, 'zh')}，10-Q），经营现金流 ${money(cocf, 'zh')}，净利润 ${money(cni, 'zh')}${cni > 0 ? `（${times(cocf / cni)}）` : ''}。`);
    }
  }
  return finish(r, {topic: 'cash_support', plan: {tickers: [t], metric: null, period: periodPlan(p, entry)}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Fiscal year', '财年'), label('net_income', lang), label('operating_cash_flow', lang), L(lang, 'Cash conversion', '现金转化率')], rows: tableRows},
    summary: ask(lang,
      `In ${periodText(entry.row, 'en')}, ${company(t, 'en')} reported net income of ${money(ni, 'en')} and operating cash flow of ${money(ocf, 'en')}: ${covered ? `operating cash covered profit${conv !== null ? ` ${times(conv)}` : ''}` : `profit ran ahead of operating cash (cash conversion ${times(conv)})`}. ${above.length ? `Net income exceeded operating cash flow in ${above.length} of the ${recent.length} fiscal years shown.` : `Net income did not exceed operating cash flow in any of the ${recent.length} fiscal years shown.`}${ytd}`,
      `${company(t, 'zh')}在 ${periodText(entry.row, 'zh')}报告净利润 ${money(ni, 'zh')}、经营活动现金流 ${money(ocf, 'zh')}：${covered ? `经营现金覆盖了利润${conv !== null ? `（${times(conv)}）` : ''}` : `利润跑在经营现金前面（现金转化率 ${times(conv)}）`}。${above.length ? `下表 ${recent.length} 个财年中，有 ${above.length} 年净利润高于经营现金流。` : `下表 ${recent.length} 个财年中，没有一年净利润高于经营现金流。`}${ytd}`),
    notes: [covered
      ? ask(lang, 'Cash above profit usually comes from non-cash charges (depreciation, share-based pay) and working-capital timing; check how much is recurring before calling it strong.', '现金高于利润通常来自非现金费用（折旧、股权激励）和营运资本时间差；先看有多少是经常性的，再下判断。')
      : ask(lang, 'Profit above cash is a prompt to read receivables, inventory and other working-capital lines in the cash-flow statement, not a verdict.', '利润高于现金是去读现金流量表里应收、存货等营运资本项目的提示，不是结论。'),
    ask(lang, 'Descriptive figures from the filings; not investment advice.', '以上是财报中的描述性数字，不构成投资建议。')],
    offers: lang === 'zh' ? [`为什么${zhName(t)}的现金流和利润不一样`, `${zhName(t)}的应计比率`, '六家公司里哪家利润和现金差距最大'] : [`Why does ${t}'s cash flow differ from profit?`, `${t} accrual ratio`, 'Which of the six has the largest profit-to-cash gap?']});
}

function latestCheckpoint(bundle, t, asOf) {
  return (bundle.interim?.[t] || []).filter(s => s.as_of <= asOf).at(-1) || null;
}

function ytdAnswer(r, p, bundle, index, tickers, asOf) {
  const lang = p.lang, t = tickers[0];
  const check = latestCheckpoint(bundle, t, asOf);
  if (!check) return finish(r, {status: 'not_in_bundle', topic: 'ytd', plan: {...r.plan, tickers: [t], period: 'ytd'}, summary: ask(lang, `No fiscal year-to-date checkpoint for ${t} by ${asOf}.`, `截至 ${asOf}，${t} 没有年初至今对比。`), offers: defaultOffers(lang, t)});
  const metrics = p.metrics.filter(m => YTD_METRICS.includes(m));
  const asked = p.metrics.filter(m => !YTD_METRICS.includes(m) && !['cash'].includes(m));
  if (asked.length && !metrics.length) return finish(r, {status: 'not_in_bundle', topic: 'ytd', plan: {...r.plan, tickers: [t], metric: asked[0], period: 'ytd'}, summary: ask(lang,
    `The year-to-date checkpoint holds revenue, net income, operating income and operating cash flow only; ${label(asked[0], 'en').toLowerCase()} is annual-only here.`,
    `年初至今对比只有营收、净利润、营业利润和经营现金流；${label(asked[0], 'zh')}在这里只有年度数据。`), offers: lang === 'zh' ? [`${zhName(t)}最新的${label(asked[0], 'zh')}`] : [`${t} latest ${label(asked[0], 'en').toLowerCase()}`]});
  const keys = metrics.length ? metrics : YTD_METRICS;
  const facts = [], rows = [], calcs = [];
  for (const k of keys) {
    const cf = check.current.metrics[k], pf = check.prior?.metrics?.[k];
    if (cf) facts.push(fact(t, k, cf, lang, {label: `${label(k, lang)} · ${L(lang, 'current YTD', '本期年初至今')}`}));
    if (pf) facts.push(fact(t, k, pf, lang, {label: `${label(k, lang)} · ${L(lang, 'prior YTD', '上年同期')}`}));
    const ch = check.changes?.[k];
    rows.push([label(k, lang), money(cf?.value, lang), money(pf?.value, lang), Number.isFinite(ch?.absolute) ? `${ch.absolute >= 0 ? '+' : ''}${money(ch.absolute, lang)}` : '—', Number.isFinite(ch?.growth) ? pct(ch.growth) : '—']);
  }
  calcs.push({label: L(lang, 'Growth', '增长率'), formula: L(lang, 'current YTD ÷ prior YTD − 1', '本期年初至今 ÷ 上年同期 − 1'), result: rows.map(x => `${x[0]} ${x[4]}`).join(' · ')});
  const annualEnd = index[t].at(-1)?.row.period_end;
  const superseded = annualEnd && check.current.period_end <= annualEnd;
  const dir = g => L(lang, g >= 0 ? `up ${pct(g)}` : `down ${pct(-g)}`, g >= 0 ? `增长 ${pct(g)}` : `下降 ${pct(-g)}`);
  const head = keys.map(k => `${label(k, lang)} ${money(check.current.metrics[k]?.value, lang)}${Number.isFinite(check.changes?.[k]?.growth) ? L(lang, ` (${dir(check.changes[k].growth)} on the same period last year)`, `（较上年同期${dir(check.changes[k].growth)}）`) : ''}`).join(L(lang, '; ', '；'));
  const months = Math.round(days(check.current.period_start, check.current.period_end) / 30.44);
  const quarterAsked = /季度|季报|quarter|\bq[1-4]\b/.test(p.low);
  const lead = quarterAsked ? L(lang, `Single quarters are not in this bundle; this is the fiscal year-to-date total from the latest 10-Q (${months} months). `, `证据包里没有单季度数据；下面是最新 10-Q 的财年初至今累计数（${months} 个月）。`) : '';
  return finish(r, {topic: 'ytd', plan: {tickers: [t], metric: metrics[0] || null, period: 'ytd'}, facts, calculations: calcs,
    table: {columns: [L(lang, 'Metric', '指标'), `${L(lang, 'Current YTD', '本期')} ${span(check.current, lang)}`, `${L(lang, 'Prior YTD', '上年同期')}${check.prior ? ` ${span(check.prior, lang)}` : ''}`, L(lang, 'Change', '变化'), L(lang, 'Growth', '增长率')], rows},
    summary: ask(lang,
      `${lead}${company(t, 'en')} fiscal year-to-date ${span(check.current, 'en')} (${months} months, 10-Q filed ${check.current.known_at}): ${head}.`,
      `${lead}${company(t, 'zh')}年初至今 ${span(check.current, 'zh')}（${months} 个月，10-Q，${check.current.known_at} 提交）：${head}。`),
    notes: [ask(lang, 'Cumulative fiscal year-to-date flows, not a standalone quarter or trailing twelve months.', '这是财年初至今的累计数，不是单季度，也不是过去十二个月。'),
      ...(superseded ? [ask(lang, `The ${fy(index[t].at(-1).row)} 10-K (to ${annualEnd}) has since been filed and covers this period; ask for the latest annual figures.`, `此后 ${annualEnd.slice(0, 4)} 财年 10-K（截至 ${annualEnd}）已提交并覆盖这段期间；可以问最新年度数字。`)] : [])],
    offers: lang === 'zh' ? [`为什么${zhName(t)}的现金流和利润不一样`] : [`What explains ${t}'s profit-to-cash gap this year?`]});
}

function bridgeAnswer(r, p, bundle, index, tickers, asOf) {
  const lang = p.lang, t = tickers[0];
  const check = latestCheckpoint(bundle, t, asOf), b = check?.current?.cash_bridge;
  if (!b || b.status !== 'available') return finish(r, {status: 'not_in_bundle', topic: 'bridge', plan: {...r.plan, tickers: [t], period: 'ytd'}, summary: ask(lang, `No profit-to-cash bridge is available for ${t} by ${asOf}.`, `截至 ${asOf}，${t} 没有利润到现金的调节表。`), offers: defaultOffers(lang, t)});
  const only = p.bridge.length ? b.components.filter(x => p.bridge.includes(x.key)) : b.components;
  const facts = [fact(t, 'net_income', {...check.current.metrics.net_income}, lang, {label: `${label('net_income', lang)} · YTD`}), fact(t, 'operating_cash_flow', {...check.current.metrics.operating_cash_flow}, lang, {label: `${label('operating_cash_flow', lang)} · YTD`})];
  const rows = [];
  for (const x of only) {
    if (x.fact) facts.push(fact(t, x.key, x.fact, lang, {label: label(x.key, lang), effect: x.effect, sign: x.sign}));
    const prior = check.prior?.cash_bridge?.components?.find(y => y.key === x.key);
    rows.push([label(x.key, lang), x.fact ? money(x.fact.value, lang) : L(lang, 'unavailable', '无'), x.fact ? String(x.sign > 0 ? '+1' : '−1') : '—', Number.isFinite(x.effect) ? money(x.effect, lang) : '—', Number.isFinite(prior?.effect) ? money(prior.effect, lang) : '—']);
  }
  if (!p.bridge.length) rows.push([L(lang, 'Other and unmapped', '其他及未映射项'), '—', '—', money(b.residual, lang), Number.isFinite(check.prior?.cash_bridge?.residual) ? money(check.prior.cash_bridge.residual, lang) : '—']);
  const missingOnly = only.filter(x => !x.fact).map(x => x.key);
  if (p.bridge.length && missingOnly.length === only.length) return missingAnswer(r, p, t, only[0]?.key || 'receivables', null, missingOnly);
  const drains = b.components.filter(x => ['receivables', 'inventory', 'payables'].includes(x.key) && Number.isFinite(x.effect) && x.effect < 0).sort((x, y) => x.effect - y.effect);
  const focus = p.bridge.length
    ? only.filter(x => x.fact).map(x => ask(lang, `${label(x.key, 'en')}: reported ${money(x.fact.value, 'en')} (${x.fact.tag}); effect on operating cash ${money(x.effect, 'en')}.`, `${label(x.key, 'zh')}：报告值 ${money(x.fact.value, 'zh')}（${x.fact.tag}）；对经营现金的影响 ${money(x.effect, 'zh')}。`)).join(' ')
    : ask(lang, `Net income ${money(b.net_income, 'en')} → operating cash flow ${money(b.operating_cash_flow, 'en')}. ${drains.length ? `Largest cash use among the working-capital lines: ${label(drains[0].key, 'en').toLowerCase()} (${money(drains[0].effect, 'en')}).` : 'No mapped working-capital line used cash.'} Other and unmapped adjustments: ${money(b.residual, 'en')}.`,
      `净利润 ${money(b.net_income, 'zh')} → 经营活动现金流 ${money(b.operating_cash_flow, 'zh')}。${drains.length ? `营运资本项目里占用现金最多的是${label(drains[0].key, 'zh')}（${money(drains[0].effect, 'zh')}）。` : '已映射的营运资本项目都没有占用现金。'}其他及未映射调整：${money(b.residual, 'zh')}。`);
  return finish(r, {topic: p.bridge.length && p.cues.change && !p.cues.why ? 'change' : 'bridge', plan: {tickers: [t], metric: p.bridge[0] || null, period: 'ytd'}, facts,
    calculations: [{label: L(lang, 'Effect on operating cash', '对经营现金的影响'), formula: L(lang, 'reported value × sign (asset increases −1, payable increases +1, non-cash add-backs +1)', '报告值 × 符号（资产增加 −1，应付增加 +1，非现金费用加回 +1）'), result: L(lang, 'see table', '见表')},
      ...(!p.bridge.length ? [{label: L(lang, 'Other and unmapped', '其他及未映射项'), formula: L(lang, 'operating cash flow − net income − selected signed adjustments', '经营现金流 − 净利润 − 已选调整项'), result: money(b.residual, lang)}] : [])],
    table: {columns: [L(lang, 'Line', '项目'), L(lang, 'Reported', '报告值'), L(lang, 'Sign', '符号'), `${L(lang, 'Effect', '影响')} ${span(check.current, lang)}`, L(lang, 'Prior YTD effect', '上年同期影响')], rows},
    summary: ask(lang, `${company(t, 'en')}, fiscal year-to-date ${span(check.current, 'en')} (10-Q): ${focus}`, `${company(t, 'zh')}，年初至今 ${span(check.current, 'zh')}（10-Q）：${focus}`),
    notes: [ask(lang, 'This bridge maps five selected standard-tag lines from the same 10-Q; the remainder holds everything else (taxes, other balances, mapping gaps). It identifies reported adjustments, not their business cause. Receivables appear only as this year-to-date cash-flow change; the bundle has no receivables balance.', '这张调节表只映射同一份 10-Q 里五个标准标签项目；其余都在“其他及未映射项”里（税、其他余额、映射缺口）。它指出报告的调整项，不说明业务原因。应收账款只有这项年初至今的现金流变动，证据包里没有应收账款余额。')],
    offers: lang === 'zh' ? [`${zhName(t)}的利润有现金流支撑吗`] : [`Is ${t}'s profit backed by operating cash?`]});
}

function anomalyAnswer(r, p, bundle, latestSnapshot, tickers, asOf) {
  const lang = p.lang;
  let snapshot = latestSnapshot;
  // A named fiscal year: the saved snapshot whose score was for that year's profile.
  if (p.years.length) {
    const y = p.years.at(-1), t = p.companies[0];
    const hit = p.companies.length === 1 && [...bundle.snapshots].reverse().find(s => s.as_of <= asOf && s.ai?.status === 'available' && s.ai.scores[t]?.period_end.slice(0, 4) === String(y));
    if (!hit) return finish(r, {status: 'not_in_bundle', topic: 'anomaly', plan: {...r.plan, period: `FY${y}`}, summary: ask(lang,
      p.companies.length === 1 ? `No saved AI triage score for ${t}'s FY${y} profile in this bundle.` : 'Earlier AI triage scores are shown one company at a time; name one company and a fiscal year.',
      p.companies.length === 1 ? `证据包里没有 ${t} ${y} 财年画像的 AI 分诊分数。` : '较早的 AI 分诊分数一次只显示一家公司；请指定一家公司和一个财年。'), offers: defaultOffers(lang, t || 'NVDA')});
    snapshot = hit;
  }
  const ai = snapshot.ai;
  const featureLabel = k => label(k === 'cash_margin' ? 'cash_margin' : k, lang);
  if (!ai || ai.status !== 'available') return finish(r, {status: 'not_in_bundle', topic: 'anomaly', summary: ask(lang, `AI triage is unavailable for the snapshot of ${snapshot.as_of}.`, `${snapshot.as_of} 快照没有 AI 分诊结果。`), offers: defaultOffers(lang)});
  const list = tickers.length === TICKERS.length && !p.companies.length ? TICKERS : tickers;
  const rows = [], facts = [];
  for (const t of list) {
    const s = ai.scores[t];
    if (!s) { rows.push([t, '—', '—', L(lang, 'unavailable', '无')]); continue; }
    rows.push([t, s.period_end, `${s.percentile} / 100`, s.context_deviations.map(d => `${featureLabel(d.feature)} ${d.feature === 'current_ratio' || d.feature === 'cash_coverage' ? times(d.value) : pct(d.value)} (${L(lang, 'median', '中位数')} ${d.feature === 'current_ratio' || d.feature === 'cash_coverage' ? times(d.training_median) : pct(d.training_median)})`).join('; ')]);
    const row = snapshot.companies[t]?.find(x => x.period_end === s.period_end);
    if (row) for (const k of ['revenue', 'net_income', 'operating_cash_flow', 'assets']) if (row.metrics[k]) facts.push(fact(t, k, row.metrics[k], lang));
  }
  const tr = ai.training;
  const one = list.length === 1 ? ai.scores[list[0]] : null;
  const sorted = list.filter(t => ai.scores[t]).sort((a, b) => ai.scores[b].percentile - ai.scores[a].percentile);
  return finish(r, {topic: 'anomaly', plan: {tickers: [...p.companies], metric: null, period: p.years.length && snapshot !== latestSnapshot ? `FY${p.years.at(-1)}` : 'latest'},
    facts, calculations: [{label: L(lang, 'Percentile', '百分位'), formula: L(lang, '100 × share of training scores ≤ this score; score = −IsolationForest.score_samples', '100 × 训练分数中不高于该分数的比例；分数 = −IsolationForest.score_samples'), result: one ? `${one.percentile} / 100` : sorted.map(t => `${t} ${ai.scores[t].percentile}`).join(' · ')}],
    table: {columns: [L(lang, 'Company', '公司'), L(lang, 'Period end', '期末'), L(lang, 'Percentile', '百分位'), L(lang, 'Ratios furthest from training medians', '偏离训练中位数最多的比率')], rows},
    summary: one
      ? ask(lang, `AI triage (dashed ink, snapshot ${snapshot.as_of}): ${company(list[0], 'en')}'s ${snapshot === latestSnapshot ? 'latest ' : ''}annual profile (period ended ${one.period_end}) sits at the ${one.percentile}th percentile of ${tr.samples} earlier company-years — higher means less typical. Furthest from the training medians: ${one.context_deviations.map(d => featureLabel(d.feature).toLowerCase()).join(', ')}.`,
        `AI 分诊（虚线墨，快照 ${snapshot.as_of}）：${company(list[0], 'zh')}${snapshot === latestSnapshot ? '最新' : ''}年度画像（期末 ${one.period_end}）在 ${tr.samples} 个更早的公司年度样本中处于第 ${one.percentile} 百分位——越高越不像历史常态。偏离训练中位数最多的是：${one.context_deviations.map(d => featureLabel(d.feature)).join('、')}。`)
      : ask(lang, `AI triage percentiles (snapshot ${snapshot.as_of}): ${sorted.map(t => `${t} ${ai.scores[t].percentile}`).join(' · ')}. Higher means less typical of ${tr.samples} earlier company-years.`, `AI 分诊百分位（快照 ${snapshot.as_of}）：${sorted.map(t => `${t} ${ai.scores[t].percentile}`).join(' · ')}。越高越不像 ${tr.samples} 个更早公司年度样本的常态。`),
    notes: [ask(lang, `Isolation Forest, ${tr.trees} trees, seed ${tr.seed}, trained on periods ending before ${tr.period_end_before}. An investigation cue, not a fraud, default or return signal, and not advice. An unusual profile can also mean unusually strong results.`, `Isolation Forest，${tr.trees} 棵树，seed ${tr.seed}，训练样本为 ${tr.period_end_before} 之前结束的期间。这是调查线索，不是造假、违约或收益信号，也不是建议。不寻常也可能意味着业绩异常强。`)],
    offers: lang === 'zh' ? ['什么是异常分数', `${zhName(list[0]) || '英伟达'}的应计比率`] : ['What does the anomaly percentile mean?', `${list[0]} accrual ratio`]});
}

function filingAnswer(r, p, bundle, index, tickers, asOf) {
  const lang = p.lang, t = tickers[0], check = latestCheckpoint(bundle, t, asOf);
  if (p.years.length) {
    // The original annual report for that fiscal year: the first saved snapshot that holds the period.
    const y = String(p.years.at(-1));
    let row = null;
    for (const snap of bundle.snapshots) { if (snap.as_of > asOf || row) break; row = snap.companies[t]?.find(x => x.period_end.slice(0, 4) === y) || null; }
    if (!row) return finish(r, {status: 'not_in_bundle', topic: 'filing', plan: {...r.plan, tickers: [t], period: `FY${y}`}, summary: ask(lang, `No ${t} annual report for FY${y} in this bundle.`, `证据包里没有 ${t} ${y} 财年的年报。`), offers: defaultOffers(lang, t)});
    const original = row.metrics.revenue || Object.values(row.metrics).find(Boolean);
    return finish(r, {topic: 'filing', plan: {tickers: [t], metric: null, period: `FY${y}`}, facts: [fact(t, 'revenue', original, lang, {label: L(lang, `${original.form} · ${fy(row)}`, `${original.form} · ${y} 财年`)})],
      summary: ask(lang, `${company(t, 'en')}'s annual report for ${periodText(row, 'en')} is the ${original.form} filed ${original.filed} (accession ${original.accession}). The link below opens it on sec.gov.`,
        `${company(t, 'zh')} ${periodText(row, 'zh')}的年报是 ${original.filed} 提交的 ${original.form}（accession ${original.accession}）。下方链接直接打开 sec.gov 上的文件。`),
      notes: [ask(lang, 'This is the report first filed for that year; later reports may restate its figures.', '这是该年度首次提交的年报；之后的报告可能重述其中的数字。')], offers: defaultOffers(lang, t)});
  }
  const entry = index[t].at(-1);
  const annual = entry.row.metrics.revenue || Object.values(entry.row.metrics).find(Boolean);
  const facts = [fact(t, 'revenue', annual, lang, {label: L(lang, `Latest 10-K · ${fy(entry.row)}`, `最新 10-K · ${entry.row.period_end.slice(0, 4)} 财年`)})];
  const q = check?.current?.metrics?.revenue;
  if (q && q.form?.startsWith('10-Q') && q.filed > annual.filed) facts.push(fact(t, 'revenue', q, lang, {label: L(lang, `Latest 10-Q · YTD to ${check.current.period_end}`, `最新 10-Q · 截至 ${check.current.period_end}`)}));
  return finish(r, {topic: 'filing', plan: {tickers: [t], metric: null, period: 'latest'}, facts,
    summary: ask(lang, `${company(t, 'en')}'s latest annual report in this bundle is the ${annual.form} for ${periodText(entry.row, 'en')}, filed ${annual.filed} (accession ${annual.accession}).${facts[1] ? ` A newer 10-Q (period to ${check.current.period_end}) was filed ${q.filed}.` : ''} Links below open the documents on sec.gov.`,
      `${company(t, 'zh')}在证据包里的最新年报是 ${periodText(entry.row, 'zh')} 的 ${annual.form}，${annual.filed} 提交（accession ${annual.accession}）。${facts[1] ? `之后还有一份 10-Q（截至 ${check.current.period_end}），${q.filed} 提交。` : ''}下方链接直接打开 sec.gov 上的文件。`),
    notes: [ask(lang, 'Links open the matched primary document, not an exact paragraph.', '链接打开匹配的主文件，不定位到具体段落。')],
    offers: lang === 'zh' ? [`${zhName(t)}的利润有现金流支撑吗`] : [`Is ${t}'s profit backed by operating cash?`]});
}

const TENOR_NAMES = {'3m': ['3-month', '3 个月'], '2y': ['2-year', '2 年期'], '5y': ['5-year', '5 年期'], '10y': ['10-year', '10 年期'], '30y': ['30-year', '30 年期']};
const CN_TENOR = {一: 1, 二: 2, 两: 2, 三: 3, 五: 5, 六: 6, 七: 7, 十: 10, 二十: 20, 三十: 30};
// Tenors written in the question, e.g. "10-year", "10y", "十年期", "3个月". Unknown tenors are kept so they can be declined.
function askedTenors(low) {
  const found = [];
  for (const m of low.matchAll(/(?<![\d.])(\d{1,2}|二十|三十|十|一|二|两|三|五|六|七)\s*(?:个)?\s*(年期|-?years?\b|y\b|个月|月期|-?months?\b|m\b)/g)) {
    const n = /\d/.test(m[1]) ? Number(m[1]) : CN_TENOR[m[1]];
    const unit = /月|month|^m$/.test(m[2].replace(/^-/, '')) ? 'm' : 'y';
    found.push(`${n}${unit}`);
  }
  if (/t-bill/.test(low)) found.push('3m');
  return [...new Set(found)];
}
function rateFact(lang, bundle, k, obs, extra = {}) {
  const src = bundle.sources?.[`treasury-${obs.date.slice(0, 4)}`];
  return {ticker: null, key: `treasury_${k}`, label: `${L(lang, 'Treasury par yield', '美国国债收益率')} ${TENOR_NAMES[k][lang === 'zh' ? 1 : 0]}`, value: obs[k], display: Number.isFinite(obs[k]) ? `${obs[k].toFixed(2)}%` : L(lang, 'unavailable', '无'), unit: '%', period_start: null, period_end: obs.date, form: 'Treasury daily par yield curve', tag: k, filed: obs.date, accession: null, url: src?.url ?? 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve', filing_index_url: null, ...extra};
}
function ratesAnswer(r, p, bundle, asOf) {
  const lang = p.lang;
  const tenors = askedTenors(p.low.replace(/(20\d\d)[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g, ' '));
  const unknown = tenors.filter(k => !TENOR_NAMES[k]);
  if (unknown.length) return finish(r, {status: 'not_in_bundle', topic: 'rates', summary: ask(lang,
    `The bundle keeps five Treasury tenors: 3-month, 2-year, 5-year, 10-year and 30-year. ${unknown.join(', ')} is not among them.`,
    `证据包只保留五个期限的国债收益率：3 个月、2 年、5 年、10 年和 30 年，没有 ${unknown.join('、')}。`), offers: lang === 'zh' ? ['10 年期美债收益率现在多少'] : ['What is the 10-year Treasury yield?']});
  const keys = tenors.length ? tenors : Object.keys(TENOR_NAMES);
  const names = k => TENOR_NAMES[k][lang === 'zh' ? 1 : 0];
  const note = ask(lang, 'Daily official observations (CC0), not live quotes. Rate context only; not a forecast.', '每日官方观测值（CC0），不是实时报价，仅作利率背景，不是预测。');
  // A year without a date: summarise that year's observations rather than state today's.
  if (!p.dates.length && p.years.length) {
    const y = String(p.years.at(-1));
    const obs = (bundle.rates || []).filter(x => x.date.startsWith(y) && x.date <= asOf);
    if (!obs.length) return finish(r, {status: 'not_in_bundle', topic: 'rates', plan: {tickers: [], metric: null, period: y}, summary: ask(lang, `No Treasury observations for ${y} by ${asOf}; the bundle runs ${bundle.rates[0].date} to ${bundle.rates.at(-1).date}.`, `截至 ${asOf} 没有 ${y} 年的国债收益率观测；证据包覆盖 ${bundle.rates[0].date} 至 ${bundle.rates.at(-1).date}。`), offers: defaultOffers(lang)});
    const facts = [], rows = [];
    for (const k of keys) {
      const valid = obs.filter(x => Number.isFinite(x[k]));
      if (!valid.length) { rows.push([names(k), '—', '—', '—', '—']); continue; }
      const first = valid[0], last = valid.at(-1);
      const lowObs = valid.reduce((m, x) => x[k] < m[k] ? x : m), highObs = valid.reduce((m, x) => x[k] > m[k] ? x : m);
      for (const [o, role] of [[first, 'first'], [last, 'last'], [lowObs, 'low'], [highObs, 'high']]) facts.push(rateFact(lang, bundle, k, o, {role}));
      rows.push([names(k), `${first[k].toFixed(2)}% (${first.date})`, `${last[k].toFixed(2)}% (${last.date})`, `${lowObs[k].toFixed(2)}% (${lowObs.date})`, `${highObs[k].toFixed(2)}% (${highObs.date})`]);
    }
    return finish(r, {topic: 'rates', plan: {tickers: [], metric: null, period: y}, facts,
      table: {columns: [L(lang, 'Tenor', '期限'), L(lang, 'First', '年初'), L(lang, 'Last', '年末'), L(lang, 'Low', '最低'), L(lang, 'High', '最高')], rows},
      summary: ask(lang, `US Treasury par yields in ${y} (${obs.length} daily observations${obs.at(-1).date < `${y}-12-31` ? ` through ${obs.at(-1).date}` : ''}): ${rows.map(x => `${x[0]} from ${x[1]} to ${x[2]}`).join('; ')}.`,
        `${y} 年美国国债收益率（${obs.length} 个每日观测${obs.at(-1).date < `${y}-12-31` ? `，截至 ${obs.at(-1).date}` : ''}）：${rows.map(x => `${x[0]}从 ${x[1]} 到 ${x[2]}`).join('；')}。`),
      notes: [note, ask(lang, 'A year has many observations; the table shows the first, last, lowest and highest, each with its date.', '一年有很多个观测值；表中列出年初、年末、最低和最高，各附日期。')], offers: lang === 'zh' ? ['数据更新到什么时候'] : ['How recent is the data?']});
  }
  const target = p.dates[0] || asOf;
  const obs = (bundle.rates || []).filter(x => x.date <= target && x.date <= asOf).at(-1);
  if (!obs) return finish(r, {status: 'not_in_bundle', topic: 'rates', summary: ask(lang, `No Treasury observation on or before ${target}; the bundle starts ${bundle.rates?.[0]?.date}.`, `${target} 当天或之前没有国债收益率观测；证据包从 ${bundle.rates?.[0]?.date} 开始。`), offers: defaultOffers(lang)});
  const facts = keys.map(k => rateFact(lang, bundle, k, obs));
  const exactDay = obs.date === target;
  return finish(r, {topic: 'rates', plan: {tickers: [], metric: null, period: p.dates[0] || 'latest'}, facts,
    table: {columns: [L(lang, 'Tenor', '期限'), L(lang, 'Yield', '收益率')], rows: keys.map(k => [names(k), Number.isFinite(obs[k]) ? `${obs[k].toFixed(2)}%` : L(lang, 'unavailable', '无')])},
    summary: ask(lang, `US Treasury par yields on ${obs.date}${exactDay ? '' : ` (latest observation on or before ${target})`}: ${keys.map(k => `${TENOR_NAMES[k][0]} ${Number.isFinite(obs[k]) ? obs[k].toFixed(2) + '%' : 'unavailable'}`).join(', ')}.`,
      `${obs.date}${exactDay ? '' : `（${target} 当天或之前的最近观测）`}美国国债收益率：${keys.map(k => `${TENOR_NAMES[k][1]} ${Number.isFinite(obs[k]) ? obs[k].toFixed(2) + '%' : '无'}`).join('，')}。`),
    notes: [note], offers: lang === 'zh' ? ['数据更新到什么时候'] : ['How recent is the data?']});
}

function definitionAnswer(r, p) {
  const lang = p.lang;
  const key = p.cues.anomaly ? 'anomaly_score' : p.metrics[0] || p.bridge[0];
  const def = DEFINITION[key];
  return finish(r, {topic: 'definition', plan: {tickers: [], metric: key, period: null},
    summary: `${label(key, lang)}${L(lang, ': ', '：')}${def[lang === 'zh' ? 1 : 0]}${FORMULA[key] ? L(lang, ` Formula: ${FORMULA[key][0]}.`, ` 公式：${FORMULA[key][1]}。`) : ''}`,
    notes: [ask(lang, 'Definitions follow docs/RESEARCH_MODEL.md and the evidence contract; no numbers are stated without a company.', '定义依据 docs/RESEARCH_MODEL.md 和证据约定；不指定公司时不给数字。')],
    offers: lang === 'zh' ? [`英伟达的${label(key, 'zh')}`] : [`NVDA ${label(key, 'en').toLowerCase()}`]});
}

function scopeAnswer(r, lang, bundle) {
  return finish(r, {topic: 'scope',
    summary: ask(lang,
      `I answer questions about six companies — AAPL, MSFT, NVDA, AMZN, GOOGL and META — from saved official SEC filings and Treasury yields: one figure or ratio for a fiscal year, trends, year-over-year changes, side-by-side comparisons, which of the six is highest, whether profit is backed by operating cash, the latest year-to-date checkpoint and its profit-to-cash bridge, the AI triage percentile, Treasury yields, filing links and definitions. I don't give investment advice, forecasts, share prices or figures the bundle doesn't hold.`,
      `我回答六家公司——AAPL、MSFT、NVDA、AMZN、GOOGL、META——基于已保存的 SEC 官方财报和美国国债收益率的问题：某财年的一个数字或比率、多年走势、同比变化、并列对比、六家里谁最高、利润有没有经营现金支撑、最新年初至今对比和利润到现金的调节、AI 分诊百分位、国债收益率、财报链接和名词解释。我不提供投资建议、预测、股价，也不回答证据包里没有的数字。`),
    table: {columns: [L(lang, 'You can ask', '可以问'), L(lang, 'Example', '例子')], rows: lang === 'zh'
      ? [['利润有没有现金支撑', '英伟达的利润有现金流支撑吗'], ['某财年的数字', '微软 2024 年经营现金流是多少'], ['比率', '苹果 2025 财年的流动比率'], ['走势', '谷歌近五年的营收'], ['变化', '苹果的应收账款变化'], ['对比', '对比亚马逊和 Meta 的现金转化率'], ['排名', '六家公司里哪家利润和现金差距最大'], ['年初至今', '微软最新季度的经营现金流'], ['AI 分诊', 'Meta 的异常分数是多少'], ['国债收益率', '10 年期美债收益率现在多少'], ['财报链接', '亚马逊最新 10-K 的链接']]
      : [['Cash support for profit', "Is NVDA's profit backed by operating cash?"], ['A figure for a fiscal year', "MSFT operating cash flow in 2024"], ['A ratio', "Apple's current ratio in FY2025"], ['A trend', 'Alphabet revenue over the last five years'], ['A change', "Apple's receivables change"], ['A comparison', 'Compare AMZN and META cash conversion'], ['A ranking', 'Which of the six has the largest profit-to-cash gap?'], ['Year to date', "Microsoft's latest quarter operating cash flow"], ['AI triage', 'META anomaly percentile'], ['Treasury yields', 'What is the 10-year Treasury yield?'], ['Filing link', "Link to Amazon's latest 10-K"]]},
    notes: [ask(lang, `Evidence as of ${bundle.as_of}. Questions are read by fixed rules: unfamiliar wording may get “not understood” rather than a guess.`, `证据截至 ${bundle.as_of}。问题由固定规则读取：不熟悉的说法会得到“没有读懂”，而不是猜测。`)],
    offers: defaultOffers(lang)});
}

function sourcesAnswer(r, lang, bundle, asOf, snapshot) {
  return finish(r, {topic: 'scope',
    summary: ask(lang,
      `Every figure comes from official sources: company filings with the SEC (10-K and 10-Q), read as XBRL facts from the SEC CompanyFacts API and matched to their filing documents through the SEC Submissions API; and daily par yields from the US Treasury. Ratios are calculated from those facts. The evidence was retrieved and built ${bundle.generated_at.slice(0, 10)} UTC (as of ${bundle.as_of}); your information date is ${asOf} (snapshot ${snapshot.as_of}). Each answer lists its own source lines with links.`,
      `所有数字都来自官方来源：公司向 SEC 提交的财报（10-K 和 10-Q），通过 SEC CompanyFacts 接口读取 XBRL 事实，并通过 SEC Submissions 接口匹配到原始文件；美国国债收益率来自美国财政部的每日数据。比率由这些事实计算。证据包于 ${bundle.generated_at.slice(0, 10)} UTC 获取并构建（截至 ${bundle.as_of}）；你的信息日期是 ${asOf}（快照 ${snapshot.as_of}）。每个回答都会列出自己的来源行和链接。`),
    notes: ['https://www.sec.gov/search-filings/edgar-application-programming-interfaces'], offers: lang === 'zh' ? ['数据更新到什么时候', '英伟达最新10-K的链接'] : ['How recent is the data?', "Link to NVIDIA's latest 10-K"]});
}

function freshnessAnswer(r, lang, bundle, asOf, snapshot) {
  const latest = TICKERS.map(t => { const e = annualIndex(bundle, asOf)[t].at(-1); const c = latestCheckpoint(bundle, t, asOf); return [t, e ? `${fy(e.row)} · ${e.row.period_end}` : '—', c ? `${c.current.period_end} (${L(lang, 'filed', '提交')} ${c.current.known_at})` : '—']; });
  return finish(r, {topic: 'freshness',
    summary: ask(lang, `The evidence bundle was built ${bundle.generated_at.slice(0, 10)} UTC from SEC data retrieved then (as of ${bundle.as_of}); Treasury yields run through ${bundle.rates.at(-1).date}. Your information date is ${asOf} (snapshot ${snapshot.as_of}). A scheduled job refreshes it on weekday mornings UTC.`,
      `证据包于 ${bundle.generated_at.slice(0, 10)} UTC 用当时获取的 SEC 数据构建（截至 ${bundle.as_of}）；国债收益率到 ${bundle.rates.at(-1).date}。你的信息日期是 ${asOf}（快照 ${snapshot.as_of}）。定时任务在工作日早上（UTC）刷新。`),
    table: {columns: [L(lang, 'Company', '公司'), L(lang, 'Latest annual period', '最新年度'), L(lang, 'Latest year-to-date checkpoint', '最新年初至今')], rows: latest},
    notes: [ask(lang, 'The page banner marks a build older than four days as overdue.', '页面横幅会把超过四天的构建标为“刷新逾期”。')], offers: defaultOffers(lang)});
}

// Every source line in an answer, once, for display and export.
export function answerSources(answer) {
  const seen = new Map();
  for (const f of answer.facts || []) {
    const id = `${f.form}|${f.accession}|${f.url}`;
    if (!seen.has(id)) seen.set(id, {form: f.form, accession: f.accession, filed: f.filed, url: f.url, filing_index_url: f.filing_index_url, tags: new Set()});
    seen.get(id).tags.add(f.tag);
  }
  return [...seen.values()].map(s => ({...s, tags: [...s.tags]}));
}
