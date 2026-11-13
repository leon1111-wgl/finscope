#!/usr/bin/env python3
"""Rebuild web/data/universe/index.json from the committed shards, without contacting the SEC.

The search index (tickers shown, search names, Chinese names) is derived from each shard's SEC name and ticker list by
build_universe.index_entries, the same function the weekly build uses; ranks, the build date and data date are kept.
Run it after a change to how the index is derived (0.3.1: the common-stock ticker first, short names). Idempotent.

    python3 scripts/reindex_universe.py            # from the repository root
"""
from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('build_universe', ROOT / 'scripts' / 'build_universe.py')
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)


def main():
    out = build.OUT
    old = json.loads((out / 'index.json').read_text())
    shards = [json.loads((out / 'c' / f"{e['c']}.json").read_text()) for e in old['companies']]
    rank = {e['c']: e['r'] for e in old['companies']}
    entries = build.index_entries(shards, rank)
    before = {e['c']: e for e in old['companies']}
    shown = [(before[e['c']]['t'][0], e['t'][0]) for e in entries if before[e['c']]['t'][0] != e['t'][0]]
    names_added = sum(len(set(e['a']) - set(before[e['c']]['a'])) for e in entries)
    names_removed = sum(len(set(before[e['c']]['a']) - set(e['a'])) for e in entries)
    index = {**old, 'outside': build.names.OUTSIDE, 'catalog': build.catalog(), 'count': len(entries), 'companies': entries}
    changed = build.write_if_changed(out / 'index.json', build.stable(index) + '\n')
    if changed:
        manifest = json.loads((out / 'manifest.json').read_text())
        manifest['bytes']['index'] = (out / 'index.json').stat().st_size
        manifest['reindexed'] = {'at': datetime.now(timezone.utc).date().isoformat(), 'script': 'scripts/reindex_universe.py',
                                 'shown_ticker_changed': len(shown), 'search_names_added': names_added, 'search_names_removed': names_removed}
        (out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(json.dumps({'changed': changed, 'shown_ticker_changed': shown, 'search_names_added': names_added, 'search_names_removed': names_removed}, indent=1))


if __name__ == '__main__':
    main()
