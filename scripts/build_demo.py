"""Offline public build: one source for report and downloadable fixtures."""
from pathlib import Path
import shutil

from finscope.cli import main

ROOT = Path(__file__).resolve().parents[1]

if __name__ == '__main__':
    import os
    os.chdir(ROOT)
    main(['demo', '--output', 'web/data/report.json'])
    for source, target in [('prices.csv', 'demo-prices.csv'), ('events.json', 'demo-events.json')]:
        shutil.copyfile(ROOT / 'data/demo' / source, ROOT / 'web/data' / target)
