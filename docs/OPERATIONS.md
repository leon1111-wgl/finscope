# Local operation and deployment

## Reproducible environment

Python 3.12 is the tested target. `requirements.lock` pins the full application/test/SEC environment; it is a version lock, not a cryptographic supply-chain attestation. Install it, then install the cloned repository in editable mode with `--no-deps`. Static assets live beside the Python package, so a bare wheel installation is not the supported UI distribution.

Run one process:

```bash
python -m uvicorn finscope.api:app --host 127.0.0.1 --port 8772 --workers 1
```

This is a local research service. There is no account system or remote multi-user isolation. Do not expose it through a tunnel, public reverse proxy or multiple workers. Host and Origin checks reject foreign browser origins; they do not authenticate other programs already running on your computer.

## API

| Method / path | Body / result |
| --- | --- |
| `GET /api/health` | Status, local mode, busy flag, limits |
| `POST /api/experiments` | `{ "prices_csv": "...", "events_json": "[]", "horizon": 5, "seed": 42 }` → full report plus `run_id` |
| `GET /api/runs` | Newest-first summaries and `unreadable_runs` count |
| `GET /api/runs/{run_id}` | Saved full report; IDs are 32 lowercase hexadecimal characters |

Inputs are inline UTF-8 CSV and JSON strings. The HTTP API accepts no caller-selected file paths, URLs or output destinations. Unknown request fields fail. The only supported horizons are integer 5 and 20; seed is an integer in 0..2147483647. The deterministic Ridge estimator does not itself use random initialization; the seed is retained in the provenance record.

The actual HTTP body is capped at **8 MiB**, including JSON encoding overhead. Reading a body takes at most 10 seconds. Input limits are 10,000 price rows, 16 tickers and 2,000 events; event text is at most 4,000 characters. These are intentionally stricter than the direct Python/CLI contract.

One experiment runs at a time in a child process with BLAS threads capped at one. A 60-second wall-clock timeout kills and reaps that process before releasing capacity. `429` means busy, `422` invalid input/history, `413` body too large, `504` run timeout and `507` storage/output limit. Health/history remain responsive during fitting. Input bounds and timeout limit work, but do not constitute an OS memory quota.

## Storage and privacy

Run artifacts are written atomically to ignored `runs/`, with generated filenames and owner-only file permissions. Set `FINSCOPE_RUN_DIR` before startup to choose another local directory. The API stores at most 20 runs / 100 MiB, with a 16 MiB limit per artifact. It refuses a new run when full; it does not delete existing research.

Export or archive files manually while the service is stopped. Do not place extra files into this directory while it runs. Raw upload files exist in an owner-only temporary job directory during fitting and are removed afterwards. Reports retain evidence text and derived series, so they can still contain private information. JSON operation logs contain only run ID, outcome and duration. Uvicorn access logs contain paths/statuses, not request bodies.

`runs/`, `local-data/`, `.env*`, `.venv/` and private work files are ignored. Neither GitHub Actions nor Pages should receive local uploads. Public artifacts are authored synthetic fixtures and separately selected SEC financial facts. A successful timestamp check does not verify a supplier log, post, corrected price or historical data entitlement.

## Refresh the demo and SEC facts

`python scripts/build_demo.py` rebuilds both synthetic horizons and synchronizes the downloadable CSV/JSON. Fixed dependencies and seed reproduce numeric content; `generated_at` changes. This build is offline and needs no API key.

SEC refresh is an explicit network operation:

```bash
python -m finscope.cli sec --output web/data/sec.json \
  --user-agent 'Your Name your-contact@example.org'
```

Use your own identifying contact. HTTPS verification remains enabled. Fetching uses bounded attempts, timeouts and a local raw cache. The artifact records whether EdgarTools parsing actually ran. Inspect fact periods and filing links before publishing. A new download does not establish historical archive availability. CI does not refresh SEC data.

## Docker

```bash
docker build -t finscope .
docker run --rm -p 127.0.0.1:8772:8772 -v finscope-runs:/app/runs finscope
```

The container listens on all container interfaces, while the host mapping stays loopback-only. It runs as an unprivileged user. Use a named volume for run persistence. Docker instructions are provided for portability; local Python execution is the primary verified path unless the release notes explicitly report a container smoke test.

## CI and Pages

CI runs Python tests, Node's built-in numeric UI tests and the offline synthetic build on Python 3.12 / Node 22. Pages deploys only `web/`. The workflow's `github-pages` environment and minimal deployment permissions are explicit. Enable GitHub Pages with the **GitHub Actions** source.

Before publishing, verify the committed tree, CI result, deployed SHA and live page/assets. A green deployment alone does not verify calculations; the test suite and focused browser checks cover those separately.
