#!/usr/bin/env python3
"""Relabel fiscal years in the committed universe without contacting the SEC (0.3.0, probe fix of 2026-11-14).

Shards built before the majority rule (finscope/universe.py: label_periods) hold each period's own 10-K label only
implicitly: a period whose label came from its own filing has fy_source 'dei', and every other period names its own
label in the 'label' data-quality note ("its own filing says FYn"). This script recovers those labels, applies
label_periods, renames every FY reference in the shard's notes and split list, regenerates the label notes, stores
fy_reported, and updates the latest label in index.json and screen.json. It is idempotent; the next weekly build
gives the same labels straight from CompanyFacts.

    python3 scripts/relabel_universe.py            # from the repository root
"""
from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('build_universe', ROOT / 'scripts' / 'build_universe.py')
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)
universe = build.universe
SAID = re.compile(r'the year ended (\d{4}-\d{2}-\d{2}) is FY\d{4} here \(its own filing says FY(\d{4})\)')
FY = re.compile(r'FY(\d{4})')
KEYS = ('fy', 'fy_source', 'fy_reported', 'start', 'end', 'accession', 'filed')


def own_labels(shard):
    """Each period's own 10-K label, as the shard records it (None when the filing gave none)."""
    said = {}
    for q in shard['quality']:
        if q['kind'] == 'label':
            for end, own in SAID.findall(q['text']):
                said[end] = int(own)
    return [p['fy_reported'] if 'fy_reported' in p else p['fy'] if p['fy_source'] == 'dei' else said.get(p['end']) for p in shard['periods']]


def relabel(shard):
    """Apply the majority rule to one shard in place; returns the number of periods whose label changed."""
    periods = [{'start': p['start'], 'end': p['end'], 'fy_reported': own} for p, own in zip(shard['periods'], own_labels(shard))]
    universe.label_periods(periods)
    rename = {old['fy']: new['fy'] for old, new in zip(shard['periods'], periods)}
    moved = sum(1 for a, b in rename.items() if a != b)
    shard['periods'] = [{k: (new[k] if k in ('fy', 'fy_source', 'fy_reported') else old[k]) for k in KEYS} for old, new in zip(shard['periods'], periods)]

    def sub(text):
        return FY.sub(lambda m: f"FY{rename.get(int(m.group(1)), int(m.group(1)))}", text)

    kept = []
    for q in shard['quality']:
        if q['kind'] == 'label':
            continue
        q = dict(q)
        if 'fy' in q:
            q['fy'] = [rename.get(y, y) for y in q['fy']]
        q['text'] = sub(q['text'])
        kept.append(q)
    at = next((i for i, q in enumerate(kept) if q['kind'] == 'template'), len(kept))
    shard['quality'] = kept[:at] + universe.label_notes(shard['periods']) + kept[at:]
    shard['splits'] = [rename.get(y, y) for y in shard.get('splits', [])]
    return moved


def main():
    out = build.OUT
    index = json.loads((out / 'index.json').read_text())
    screen = json.loads((out / 'screen.json').read_text())
    latest, changed, periods_moved = {}, [], 0
    for entry in index['companies']:
        path = out / 'c' / f"{entry['c']}.json"
        shard = json.loads(path.read_text())
        moved = relabel(shard)
        build.validate_shard(shard)
        if build.write_if_changed(path, build.stable(shard) + '\n') and moved:
            changed.append(entry['t'][0] if entry['t'] else f"CIK{entry['c']}")
        periods_moved += moved
        last = shard['periods'][-1] if shard['periods'] else None
        entry['fy'] = last['fy'] if last else None
        latest[entry['c']] = entry['fy']
    for row in screen['rows']:
        row['fy'] = latest[row['c']]
    build.write_if_changed(out / 'index.json', build.stable(index) + '\n')
    build.write_if_changed(out / 'screen.json', build.stable(screen) + '\n')
    manifest = json.loads((out / 'manifest.json').read_text())
    sizes = sorted(p.stat().st_size for p in (out / 'c').glob('*.json'))
    manifest['bytes'].update({'index': (out / 'index.json').stat().st_size, 'screen': (out / 'screen.json').stat().st_size,
                              'shards_total': sum(sizes), 'shard_median': sizes[len(sizes) // 2], 'shard_max': sizes[-1]})
    manifest['relabelled'] = {'at': datetime.now(timezone.utc).date().isoformat(), 'script': 'scripts/relabel_universe.py',
                              'rule': 'finscope/universe.py label_periods (majority of the company\'s own 10-K labels)',
                              'companies_with_moved_labels': len(changed), 'periods_moved': periods_moved}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
    print(json.dumps({'companies_with_moved_labels': len(changed), 'periods_moved': periods_moved, 'companies': changed}, indent=1))


if __name__ == '__main__':
    main()
