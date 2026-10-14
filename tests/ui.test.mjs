import test from 'node:test';
import assert from 'node:assert/strict';
import {
  netReturn,
  escapeHTML,
  safeURL,
  selectRows,
  forecastMetrics,
  strategyView,
  eligibleEvidence,
  selectedExport,
  toCSV
} from '../web/workbench.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const report = {
  schema_version: '1.0.0',
  provenance: {
    data_kind: 'synthetic'
  },
  config: {
    event_information_cutoff_utc: '16:00:00'
  },
  companies: [{
    ticker: 'A'
  }, {
    ticker: 'B'
  }],
  experiments: {
    '5': {
      observations: [{
        date: '2024-01-01',
        ticker: 'A',
        close: 100,
        actual: .2,
        label_end: '2024-01-06'
      }, {
        date: '2024-01-02',
        ticker: 'A',
        close: 110,
        actual: .4,
        label_end: '2024-01-07'
      }, {
        date: '2024-01-01',
        ticker: 'B',
        close: 200,
        actual: .9,
        label_end: '2024-01-06'
      }],
      models: {
        price: {
          series: [{
            date: '2024-01-01',
            ticker: 'A',
            prediction: .1,
            lower: .1,
            upper: .3,
            gross_return: 0,
            turnover: 0,
            position: 0
          }, {
            date: '2024-01-02',
            ticker: 'A',
            prediction: .3,
            lower: .2,
            upper: .3,
            gross_return: .05,
            turnover: .5,
            position: .5
          }, {
            date: '2024-01-01',
            ticker: 'B',
            prediction: .8,
            lower: .7,
            upper: 1,
            gross_return: 0,
            turnover: 0,
            position: 0
          }]
        }
      }
    }
  },
  evidence: []
};
const state = {
  company: 'A',
  horizon: '5',
  model: 'price',
  asOf: '2024-01-06',
  costBps: 10
};
test('entry cost deducts 5bps on a half position', () => assert.equal(netReturn(.01, .5, .5, 10),
  .0045));
test('HTML source text cannot create markup or attributes', () => assert.equal(escapeHTML(
    `<img src=x onerror="alert('x')">&`),
  '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;'));
test('external links reject executable schemes', () => {
  assert.equal(safeURL('javascript:alert(1)'), null);
  assert.equal(safeURL('data:text/html,x'), null);
  assert.equal(safeURL('https://www.sec.gov/a'), 'https://www.sec.gov/a');
});
test('as-of rows hide labels which mature tomorrow and exclude other companies', () => {
  const rows = selectRows(report, state);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].actual, .2);
  assert.equal(rows[1].actual, null);
  assert.equal(rows[1].label_end, '2024-01-07');
});
test('forecast metrics use only matured labels', () => {
  const m = forecastMetrics(selectRows(report, state));
  assert.equal(m.count, 1);
  near(m.mae, .1);
  near(m.rmse, .1);
  assert.equal(m.coverage, 1);
  assert.equal(forecastMetrics([]).mae, null);
});
test('strategy compounds adjusted gross returns and costs buy-and-hold entry', () => {
  const v = strategyView(selectRows(report, state), 10);
  near(v.rows[1].net_return, .0495);
  near(v.metrics.total_return, .0495);
  near(v.buyHold[0].net_return, -.001);
  near(v.buyHold[1].cumulative_return, .0989);
});
test('equal sleeves average daily returns before compounding', () => {
  const v = strategyView([{
    date: 'a',
    ticker: 'A',
    close: 100,
    gross_return: .1,
    turnover: 1
  }, {
    date: 'a',
    ticker: 'B',
    close: 100,
    gross_return: 0,
    turnover: 0
  }, {
    date: 'b',
    ticker: 'A',
    close: 110,
    gross_return: 0,
    turnover: 0
  }, {
    date: 'b',
    ticker: 'B',
    close: 110,
    gross_return: .2,
    turnover: 0
  }], 10);
  near(v.daily[0].net_return, .0495);
  near(v.metrics.total_return, 1.0495 * 1.1 - 1);
});
test('incomplete ticker sleeves fail rather than silently reweight', () => assert.throws(() =>
  strategyView([{
    date: 'a',
    ticker: 'A',
    close: 1,
    gross_return: 0,
    turnover: 0
  }, {
    date: 'a',
    ticker: 'B',
    close: 1,
    gross_return: 0,
    turnover: 0
  }, {
    date: 'b',
    ticker: 'A',
    close: 1,
    gross_return: 0,
    turnover: 0
  }], 10), /complete/));
test('event usability uses both release and ingestion and the early UTC cutoff', () => {
  const events = [{
    id: 'late',
    ticker: 'A',
    kind: 'supply',
    available_at: '2024-01-06T10:00:00Z',
    ingested_at: '2024-01-06T17:00:00Z'
  }, {
    id: 'ok',
    ticker: 'A',
    kind: 'social',
    available_at: '2024-01-06T15:00:00Z',
    ingested_at: '2024-01-06T16:00:00Z'
  }, {
    id: 'other',
    ticker: 'B',
    kind: 'social',
    available_at: '2024-01-01T00:00:00Z',
    ingested_at: '2024-01-01T00:00:00Z'
  }];
  assert.deepEqual(eligibleEvidence(events, state, '16:00:00').map(e => e.id), ['ok']);
});
test('selected export carries matching cost adjusted rows and removes unmatured truth', () => {
  const out = selectedExport(report, state);
  assert.deepEqual(out.selection, state);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[1].actual, null);
  near(out.rows[1].net_return, .0495);
  assert.equal(out.forecast_metrics.count, 1);
});
test('CSV quotes embedded delimiters and prevents spreadsheet formula execution', () => {
  assert.equal(toCSV([{
    source: '=1+1',
    text: 'a,"b"'
  }], ['source', 'text']), `source,text\r\n"'=1+1","a,""b"""`);
});
test('selected evidence respects kind while graph scope stays explicit', () => {
  const ev = kind => ({id: kind, ticker: 'A', kind, relationship: 'B',
    available_at: '2024-01-01T00:00:00Z', ingested_at: '2024-01-01T00:00:00Z'});
  const out = selectedExport({...report, evidence: [ev('social'), ev('supply')]}, {...state, kind: 'social'});
  assert.deepEqual(out.evidence.map(x => x.kind), ['social']);
  assert.equal(out.network.edges.length, 2);
  assert.match(out.network.scope, /All evidence kinds/);
});
