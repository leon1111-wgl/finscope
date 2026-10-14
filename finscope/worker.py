"""Isolated experiment process; the parent enforces wall-clock and input limits."""
import json
import sys
from pathlib import Path

from .cli import write_json
from .experiment import run_experiment


def main():
    directory = Path(sys.argv[1])
    try:
        config = json.loads((directory / 'config.json').read_text())
        report = run_experiment(str(directory / 'prices.csv'), str(directory / 'events.json'), **config)
        write_json(directory / 'report.json', report)
    except (ValueError, TypeError, KeyError) as exc:
        write_json(directory / 'error.json', {'detail': str(exc)[:300]})
        return 1
    except Exception:
        write_json(directory / 'error.json', {'detail': 'Experiment failed unexpectedly. Check input schema and numeric ranges.'})
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
