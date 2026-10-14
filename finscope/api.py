"""Single-worker, loopback-only research service. No remote input fetching."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import re
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator

MAX_BODY = 8 * 1024 * 1024
MAX_REPORT = 16 * 1024 * 1024
MAX_STORE = 100 * 1024 * 1024
RUN_ID = re.compile(r'^[a-f0-9]{32}$')
log = logging.getLogger('uvicorn.error')


class LocalBoundary:
    """Bound the actual streamed body before JSON parsing; reject foreign hosts/origins."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = {k.decode('latin1'): v.decode('latin1') for k, v in scope['headers']}
        host = headers.get('host', '')

        async def reject(status, message):
            await JSONResponse({'detail': message}, status_code=status)(scope, receive, send)

        try:
            parsed = urlsplit('http://' + host)
            if parsed.hostname not in {'localhost', '127.0.0.1', '::1'} or parsed.username or parsed.path:
                return await reject(400, 'This service accepts loopback hosts only.')
            _ = parsed.port
        except ValueError:
            return await reject(400, 'Invalid Host header.')
        origin = headers.get('origin')
        if origin and origin != f"{scope['scheme']}://{host}":
            return await reject(403, 'Only same-origin requests are accepted.')
        if scope['method'] in {'POST', 'PUT', 'PATCH'}:
            if headers.get('content-type', '').split(';')[0].strip().lower() != 'application/json':
                return await reject(415, 'Use application/json.')
            try:
                size = int(headers.get('content-length', '0'))
                if size < 0 or size > MAX_BODY:
                    return await reject(413, 'Request exceeds the 8 MiB body limit.')
            except ValueError:
                return await reject(400, 'Invalid Content-Length.')
            body = bytearray()
            try:
                async with asyncio.timeout(10):
                    while True:
                        message = await receive()
                        if message['type'] == 'http.disconnect':
                            return
                        chunk = message.get('body', b'')
                        if len(body) + len(chunk) > MAX_BODY:
                            return await reject(413, 'Request exceeds the 8 MiB body limit.')
                        body.extend(chunk)
                        if not message.get('more_body', False):
                            break
            except TimeoutError:
                return await reject(408, 'Request body timeout.')
            delivered = False

            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await receive()

            return await self.app(scope, bounded_receive, send)
        await self.app(scope, receive, send)


class ExperimentInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    prices_csv: StrictStr = Field(min_length=1, max_length=MAX_BODY)
    events_json: StrictStr = Field(default='[]', max_length=MAX_BODY)
    horizon: StrictInt = 5
    seed: StrictInt = Field(default=42, ge=0, le=2147483647)

    @field_validator('horizon')
    @classmethod
    def supported_horizon(cls, value):
        if value not in (5, 20):
            raise ValueError('horizon must be 5 or 20')
        return value


def strict_json(text):
    def reject_constant(value):
        raise ValueError('JSON must contain finite numbers')
    try:
        return json.loads(text, parse_constant=reject_constant)
    except RecursionError:
        raise ValueError('JSON nesting exceeds the supported limit.') from None


def check_inputs(data: ExperimentInput):
    try:
        reader = csv.DictReader(io.StringIO(data.prices_csv))
        fields = reader.fieldnames or []
        if len(fields) != len(set(fields)) or not {'date', 'ticker', 'close', 'volume'}.issubset(fields):
            raise ValueError('Prices require unique date, ticker, close and volume columns.')
        count, tickers = 0, set()
        for row in reader:
            count += 1
            tickers.add(row.get('ticker'))
            if count > 10000 or len(tickers) > 16:
                raise ValueError('Local API limit: 10000 price rows and 16 tickers.')
        if not count:
            raise ValueError('Prices must contain observations.')
        events = strict_json(data.events_json)
        if not isinstance(events, list) or len(events) > 2000:
            raise ValueError('Local API limit: a JSON array of at most 2000 events.')
    except (ValueError, csv.Error, TypeError) as exc:
        raise HTTPException(422, str(exc)[:300]) from None


def create_app(run_dir: Path | str | None = None, timeout: float = 60, max_runs: int = 20):
    app = FastAPI(title='FinScope local research API', docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(LocalBoundary)
    store = Path(run_dir or os.environ.get('FINSCOPE_RUN_DIR', 'runs')).resolve()
    store.mkdir(mode=0o700, parents=True, exist_ok=True)
    lock = asyncio.Lock()

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_, exc):
        # Pydantic's default error includes the rejected input, which can be private text.
        fields = sorted({str(error['loc'][-1]) for error in exc.errors()})
        return JSONResponse({'detail': 'Invalid JSON or request fields: ' + ', '.join(fields)}, status_code=422)

    def artifacts():
        return [p for p in store.glob('*.json') if RUN_ID.fullmatch(p.stem) and not p.is_symlink()]

    def read_run(path):
        if path.is_symlink() or not path.is_file():
            raise HTTPException(404, 'Run not found.')
        try:
            if path.stat().st_size > MAX_REPORT:
                raise ValueError('oversize')
            result = strict_json(path.read_text())
            if result['run_id'] != path.stem or result['schema_version'] != '1.0.0':
                raise ValueError('invalid artifact')
            return result
        except (ValueError, KeyError, TypeError, OSError):
            raise HTTPException(500, 'Saved run is unreadable; inspect the local run directory.') from None

    @app.get('/api/health')
    async def health():
        return {'status': 'ok', 'mode': 'local', 'busy': lock.locked(),
                'limits': {'body_bytes': MAX_BODY, 'price_rows': 10000, 'events': 2000,
                           'tickers': 16, 'timeout_seconds': timeout, 'saved_runs': max_runs}}

    @app.get('/api/runs')
    async def runs():
        summaries, unreadable = [], 0
        for path in artifacts():
            try:
                result = read_run(path)
                summaries.append({'run_id': result['run_id'],
                    'generated_at': result['provenance']['generated_at'],
                    'data_kind': result['provenance']['data_kind'],
                    'dataset_sha256': result['provenance']['dataset_sha256'],
                    'horizon': int(next(iter(result['experiments']))),
                    'price_rows': result['audit']['price_rows']})
            except (HTTPException, KeyError, ValueError, TypeError, StopIteration):
                unreadable += 1
        return {'runs': sorted(summaries, key=lambda r: r['generated_at'], reverse=True), 'unreadable_runs': unreadable}

    @app.get('/api/runs/{run_id:path}')
    async def get_run(run_id: str):
        if not RUN_ID.fullmatch(run_id):
            raise HTTPException(404, 'Run not found.')
        return read_run(store / f'{run_id}.json')

    @app.post('/api/experiments')
    async def experiment(data: ExperimentInput):
        if lock.locked():
            raise HTTPException(429, 'An experiment is already running. Try again after it finishes.')
        async with lock:
            check_inputs(data)
            files = artifacts()
            used = sum(p.stat().st_size for p in files)
            if len(files) >= max_runs or used >= MAX_STORE:
                raise HTTPException(507, 'Local run storage is full. Export and archive runs before retrying.')
            run_id = uuid.uuid4().hex
            started, status = time.monotonic(), 'failed'
            try:
                with tempfile.TemporaryDirectory(prefix='.job-', dir=store) as work:
                    path = Path(work)
                    (path / 'prices.csv').write_text(data.prices_csv)
                    (path / 'events.json').write_text(data.events_json)
                    (path / 'config.json').write_text(json.dumps({'horizon': data.horizon, 'seed': data.seed}))
                    env = {**os.environ, 'OMP_NUM_THREADS': '1', 'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'}
                    process = await asyncio.create_subprocess_exec(sys.executable, '-m', 'finscope.worker', str(path),
                        env=env, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
                    try:
                        await asyncio.wait_for(process.wait(), timeout=timeout)
                    except (TimeoutError, asyncio.CancelledError) as exc:
                        if process.returncode is None:
                            process.kill()
                        await process.wait()
                        if isinstance(exc, asyncio.CancelledError):
                            raise
                        status = 'timeout'
                        raise HTTPException(504, 'Experiment exceeded the local time limit; no run was saved.') from None
                    if process.returncode:
                        error_file = path / 'error.json'
                        detail = json.loads(error_file.read_text()).get('detail') if error_file.is_file() else None
                        raise HTTPException(422, detail or 'Experiment failed; check input history and schema.')
                    output = path / 'report.json'
                    if not output.is_file() or output.stat().st_size > MAX_REPORT:
                        raise HTTPException(507, 'Experiment output exceeds the 16 MiB artifact limit.')
                    result = strict_json(output.read_text())
                    result['run_id'] = run_id
                    serialized = json.dumps(result, allow_nan=False, separators=(',', ':')).encode()
                    if len(serialized) > MAX_REPORT or used + len(serialized) > MAX_STORE:
                        raise HTTPException(507, 'Local artifact storage limit reached; no run was saved.')
                    output.write_bytes(serialized)
                    output.chmod(0o600)
                    os.replace(output, store / f'{run_id}.json')
                    status = 'completed'
                    return result
            finally:
                log.info(json.dumps({'event': 'experiment', 'run_id': run_id, 'status': status,
                                     'duration_seconds': round(time.monotonic() - started, 3)}))

    web = Path(__file__).resolve().parent.parent / 'web'
    if web.is_dir():
        app.mount('/', StaticFiles(directory=web, html=True), name='web')
    return app


app = create_app()
