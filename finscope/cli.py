"""Command-line artifact builder."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from .experiment import run_experiment
from .fixtures import demo_data
from .sec import build_sec_snapshot


def write_json(path: str | Path, data: dict) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(data, separators=(",", ":"), allow_nan=False, ensure_ascii=False) + "\n")
    os.replace(temporary, destination)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="finscope")
    subs = parser.add_subparsers(dest="command", required=True)
    demo = subs.add_parser("demo", help="build deterministic fictional two-horizon report")
    demo.add_argument("--output", default="web/data/report.json")
    demo.add_argument("--seed", type=int, default=42)
    run = subs.add_parser("run", help="evaluate validated local CSV and event JSON")
    run.add_argument("--prices", required=True)
    run.add_argument("--events", required=True)
    run.add_argument("--output", required=True)
    run.add_argument("--horizon", type=int, choices=[5, 20], default=5)
    sec = subs.add_parser("sec", help="fetch separate official SEC CompanyFacts snapshot")
    sec.add_argument("--output", default="web/data/sec.json")
    sec.add_argument("--as-of")
    sec.add_argument("--user-agent", default=os.environ.get("FINSCOPE_SEC_USER_AGENT"))
    sec.add_argument("--no-edgartools", action="store_true")
    args = parser.parse_args(argv)
    if args.command == "demo":
        prices, events = demo_data(seed=args.seed)
        fixture_dir = Path("data/demo")
        fixture_dir.mkdir(parents=True, exist_ok=True)
        prices.to_csv(fixture_dir / "prices.csv", index=False, date_format="%Y-%m-%d", float_format="%.17g")
        (fixture_dir / "events.json").write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n")
        report = run_experiment(prices, events, horizon=5, seed=args.seed)
        twenty = run_experiment(prices, events, horizon=20, seed=args.seed)
        report["experiments"].update(twenty["experiments"])
        report["config"]["horizons"] = [5, 20]
        report["config"].pop("horizon")
        report["audit"]["splits_by_horizon"] = {"5": report["audit"].pop("splits"), "20": twenty["audit"]["splits"]}
        write_json(args.output, report)
    elif args.command == "run":
        write_json(args.output, run_experiment(args.prices, args.events, horizon=args.horizon))
    else:
        write_json(args.output, build_sec_snapshot(args.user_agent, args.as_of, not args.no_edgartools))
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
