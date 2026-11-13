"""Index rules of scripts/build_universe.py on synthetic inputs and on the committed index (no network)."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build_universe', ROOT / 'scripts' / 'build_universe.py')
bu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bu)


def test_the_common_stock_ticker_is_shown_first():
    # Probe of 0.3.0: a preferred, note or warrant symbol was shown for four companies.
    assert bu.common_tickers(['SPGJ', 'SPG', 'SPG-PJ'], [None, 'NYSE', 'NYSE'])[0] == 'SPG'
    assert bu.common_tickers(['RLJ-A', 'RLJ-PA', 'RLJ'], [None, 'NYSE', 'NYSE'])[0] == 'RLJ'
    assert bu.common_tickers(['ELMES', 'ELME'], ['OTC', 'NYSE'])[0] == 'ELME'
    assert bu.common_tickers(['HTZWW', 'HTZ'], ['Nasdaq', 'Nasdaq'])[0] == 'HTZ'
    assert bu.common_tickers(['NE', 'NE-WT', 'NE-WTA'], ['NYSE', 'NYSE', 'NYSE']) == ['NE']
    # Share classes keep the order the SEC lists them in.
    for tickers in (['GOOGL', 'GOOG', 'GOOGM', 'GOOGN'], ['BRK-B', 'BRK-A'], ['BF-B', 'BF-A'], ['UAA', 'UA'], ['FOXA', 'FOX'], ['ZG', 'Z'], ['MOG-A', 'MOG-B'], ['LEN', 'LEN-B']):
        assert bu.common_tickers(tickers, ['NYSE'] * len(tickers))[0] == tickers[0], tickers
    # With no listed ticker at all, nothing is reordered.
    assert bu.common_tickers(['FNMA', 'FNMAS'], ['OTC', 'OTC']) == ['FNMA', 'FNMAS']


def test_committed_index_shows_common_tickers_and_finds_short_names():
    index = json.loads((ROOT / 'web' / 'data' / 'universe' / 'index.json').read_text())
    by = {t: e for e in index['companies'] for t in e['t']}
    for common, other in (('SPG', 'SPGJ'), ('ELME', 'ELMES'), ('RLJ', 'RLJ-A'), ('HTZ', 'HTZWW')):
        assert by[common]['t'][0] == common and other in by[common]['t'], by[common]['t']
    for keep in ('GOOGL', 'BRK-B', 'BF-B', 'UAA', 'FOXA', 'NWSA'):
        assert by[keep]['t'][0] == keep
    assert 'federal realty' in by['FRT']['a']
    assert 'roivant' in by['ROIV']['a'] and 'roivant' in by['ROIV'].get('lw', [])
