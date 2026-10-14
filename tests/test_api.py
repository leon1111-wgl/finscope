import json
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from finscope.api import create_app
from finscope.fixtures import demo_data


@pytest.fixture
def payload():
    prices, _ = demo_data(sessions=200)
    prices = prices[prices.ticker == 'ALTO']
    return {'prices_csv': prices.to_csv(index=False), 'events_json': '[]', 'horizon': 5, 'seed': 17}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(run_dir=tmp_path), base_url='http://127.0.0.1') as c:
        yield c


def test_health_and_static_ui(client):
    assert client.get('/api/health').json()['mode'] == 'local'
    assert 'FinScope' in client.get('/').text


@pytest.mark.parametrize('update', [{'horizon': 7}, {'horizon': '5'}, {'seed': True}, {'seed': -1}, {'path': '/tmp/x'}])
def test_strict_config(client, payload, update):
    response = client.post('/api/experiments', json={**payload, **update})
    assert response.status_code == 422
    assert payload['prices_csv'] not in response.text


def test_body_and_content_type_limits(client):
    assert client.post('/api/experiments', content=b'x' * (8 * 1024 * 1024 + 1),
                       headers={'Content-Type': 'application/json'}).status_code == 413
    assert client.post('/api/experiments', content='{}').status_code == 415
    assert client.post('/api/experiments', content='{', headers={'Content-Type': 'application/json'}).status_code == 422
    chunks = (b'x' * (1024 * 1024) for _ in range(9))
    assert client.post('/api/experiments', content=chunks, headers={'Content-Type': 'application/json'}).status_code == 413


def test_local_origin_and_host_only(client, payload):
    assert client.get('/api/health', headers={'Host': 'evil.example'}).status_code == 400
    assert client.post('/api/experiments', json=payload, headers={'Origin': 'https://evil.example'}).status_code == 403
    assert client.get('/api/runs', headers={'Origin': 'null'}).status_code == 403


@pytest.mark.parametrize('update', [
    {'prices_csv': 'date,ticker,close,volume\n2024-01-01,A,-1,1'},
    {'events_json': '{}'}, {'events_json': '[NaN]'},
    {'prices_csv': 'date,ticker,close,volume\n' + '2024-01-01,A,1,1\n' * 10001},
    {'events_json': json.dumps([{}] * 2001)},
    {'events_json': '[' * 10000 + ']' * 10000},
])
def test_bad_and_bounded_inputs(client, payload, update):
    assert client.post('/api/experiments', json={**payload, **update}).status_code == 422
    assert client.get('/api/runs').json()['runs'] == []


def test_real_worker_persists_user_import(client, payload, tmp_path):
    response = client.post('/api/experiments', json=payload, headers={'Origin': 'http://127.0.0.1'})
    assert response.status_code == 200, response.text
    run = response.json()
    assert run['provenance']['data_kind'] == 'user_import'
    assert run['provenance']['seed'] == 17
    assert 'unverified' in run['provenance']['availability_claim'].lower()
    assert list(run['experiments']) == ['5']
    assert len(run['run_id']) == 32
    assert client.get('/api/runs/' + run['run_id']).json() == run
    saved = client.get('/api/runs').json()['runs']
    assert saved[0]['run_id'] == run['run_id']
    assert saved[0]['price_rows'] == 200
    assert len(list(tmp_path.glob('*.json'))) == 1
    assert not list(tmp_path.glob('.job-*'))


@pytest.mark.parametrize('run_id', ['not-an-id', 'a' * 32, '..%2Fsecret'])
def test_safe_run_lookup(client, run_id):
    assert client.get('/api/runs/' + run_id).status_code == 404


def test_timeout_releases_capacity_and_leaves_no_run(tmp_path, payload):
    with TestClient(create_app(run_dir=tmp_path, timeout=0.001), base_url='http://127.0.0.1') as c:
        assert c.post('/api/experiments', json=payload).status_code == 504
        assert c.get('/api/health').json()['busy'] is False
        assert c.get('/api/runs').json()['runs'] == []
    assert not list(tmp_path.glob('.job-*'))


def test_store_capacity_preserves_existing_files(tmp_path, payload):
    (tmp_path / ('a' * 32 + '.json')).write_text('{}')
    with TestClient(create_app(run_dir=tmp_path, max_runs=1), base_url='http://127.0.0.1') as c:
        assert c.post('/api/experiments', json=payload).status_code == 507
    assert (tmp_path / ('a' * 32 + '.json')).read_text() == '{}'


def test_corrupt_history_has_explicit_count(client, tmp_path):
    (tmp_path / ('b' * 32 + '.json')).write_text('corrupt')
    assert client.get('/api/runs').json() == {'runs': [], 'unreadable_runs': 1}


def test_busy_service_stays_responsive_and_rejects_parallel_work(client, payload):
    with ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(client.post, '/api/experiments', json=payload)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if client.get('/api/health').json()['busy']:
                break
            time.sleep(0.01)
        else:
            pytest.fail('Worker never entered busy state')
        assert client.get('/api/runs').status_code == 200
        assert client.post('/api/experiments', json=payload).status_code == 429
        assert pending.result(timeout=30).status_code == 200
