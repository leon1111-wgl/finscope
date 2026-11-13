"""The accuracy checker's own rules on synthetic Financial Statement Data Set rows (no network)."""
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('accuracy_check', Path(__file__).resolve().parents[1] / 'scripts' / 'accuracy_check.py')
ac = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ac)


def row(tag, ddate, qtrs, value, uom='USD', coreg='', segments=''):
    return {'adsh': 'A', 'tag': tag, 'ddate': ddate, 'qtrs': qtrs, 'uom': uom, 'coreg': coreg, 'segments': segments, 'value': str(value)}


def cell(figure='revenue', value=100.0, end='2025-09-27', parts=None, via='primary', filed='2025-11-01'):
    return {'figure': figure, 'value': value, 'period_end': end, 'accession': 'A', 'filed': filed, 'via': via,
            'parts': parts or [{'tag': 'Revenues', 'v': value, 'sign': 1}]}


def test_month_end_rounding_and_quarters():
    assert ac.month_end('2025-09-27') == '20250930'
    assert ac.month_end('2025-01-03') == '20241231'
    assert ac.month_end('2024-02-14') == '20240131'
    assert ac.quarter_of('2026-02-27') == '2026q1'


def test_outcomes():
    num = {'A': [row('Revenues', '20250930', '4', 100), row('Revenues', '20250930', '4', 999, segments='Geo=US'), row('Revenues', '20240930', '4', 90)]}
    pre = {'A': [{'stmt': 'IS', 'tag': 'Revenues'}]}
    out = ac.judge(cell(), num, pre, '2026-09-30')
    assert out['outcome'] == 'match' and out['on_expected_statement']
    assert ac.judge(cell(value=-100.0, parts=[{'tag': 'Revenues', 'v': -100.0, 'sign': 1}]), num, pre, '2026-09-30')['outcome'] == 'sign'
    assert ac.judge(cell(value=0.1, parts=[{'tag': 'Revenues', 'v': 0.1, 'sign': 1}]), num, pre, '2026-09-30')['outcome'] == 'scale'
    assert ac.judge(cell(value=101.0, parts=[{'tag': 'Revenues', 'v': 101.0, 'sign': 1}]), num, pre, '2026-09-30')['outcome'] == 'wrong value'
    assert ac.judge(cell(end='2023-09-30'), num, pre, '2026-09-30')['outcome'] == 'period mismatch'
    assert ac.judge(cell(parts=[{'tag': 'Other', 'v': 100.0, 'sign': 1}]), num, pre, '2026-09-30')['reason'] == 'tag absent'
    dup = {'A': num['A'] + [row('Revenues', '20250930', '4', 101)]}
    assert ac.judge(cell(), dup, pre, '2026-09-30')['outcome'] == 'duplicate context'
    assert ac.judge(cell(filed='2026-10-20'), {}, pre, '2026-09-30')['reason'] == 'publication lag'
    assert ac.judge(cell(filed='2026-05-20'), {}, pre, '2026-09-30')['reason'] == 'accession absent'
    off = ac.judge(cell(), num, {'A': [{'stmt': 'BS', 'tag': 'Revenues'}]}, '2026-09-30')
    assert off['on_expected_statement'] is False


def test_composed_cells_check_every_part():
    num = {'A': [row('LongTermDebt', '20250930', '0', 800), row('ShortTermBorrowings', '20250930', '0', 50)]}
    parts = [{'tag': 'LongTermDebt', 'v': 800.0, 'sign': 1}, {'tag': 'ShortTermBorrowings', 'v': 50.0, 'sign': 1}]
    assert ac.judge(cell('total_debt', 850.0, parts=parts, via='derived'), num, {}, '2026-09-30')['outcome'] == 'match'
    parts[1]['v'] = 60.0
    assert ac.judge(cell('total_debt', 860.0, parts=parts, via='derived'), num, {}, '2026-09-30')['outcome'] == 'wrong value'


def test_eps_uses_its_own_unit_and_tolerance():
    num = {'A': [row('EarningsPerShareDiluted', '20250930', '4', 7.46, uom='USD/shares')]}
    c = cell('eps_diluted', 7.46, parts=[{'tag': 'EarningsPerShareDiluted', 'v': 7.46, 'sign': 1}])
    assert ac.judge(c, num, {'A': [{'stmt': 'IS', 'tag': 'EarningsPerShareDiluted'}]}, '2026-09-30')['outcome'] == 'match'
