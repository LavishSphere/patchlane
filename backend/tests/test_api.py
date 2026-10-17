import time

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.orchestration import incident_runner

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(operator_token=TOKEN), runs_dir=tmp_path)) as client:
        yield client


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_mutations_require_the_operator_token(client):
    assert client.post("/api/demo/trigger").status_code == 401
    assert client.post("/api/demo/trigger", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.post("/api/demo/reset").status_code == 401


def test_unconfigured_token_refuses_mutations(tmp_path):
    with TestClient(create_app(Settings(operator_token=""), runs_dir=tmp_path)) as client:
        assert client.post("/api/demo/trigger", headers=AUTH).status_code == 503


def test_trigger_creates_a_detected_incident_with_impact(client):
    response = client.post("/api/demo/trigger", headers=AUTH)
    assert response.status_code == 200
    incident = response.json()
    assert incident["status"] == "detected"
    assert incident["impact"]["unauthorizedTransfers"] == 14
    assert client.get("/api/incidents/current").json()["id"] == incident["id"]


def test_unknown_case_is_404(client):
    assert client.post("/api/demo/trigger", headers=AUTH, json={"caseId": "nope"}).status_code == 404


def test_investigate_starts_the_runner(client, monkeypatch):
    started = []

    async def fake_investigate(state):
        started.append(state.incident.id)

    monkeypatch.setattr(incident_runner, "investigate", fake_investigate)
    incident = client.post("/api/demo/trigger", headers=AUTH).json()
    assert client.post(f"/api/incidents/{incident['id']}/investigate").status_code == 401
    assert client.post(f"/api/incidents/{incident['id']}/investigate", headers=AUTH).status_code == 202
    deadline = time.monotonic() + 2
    while not started and time.monotonic() < deadline:  # the runner is a background task
        time.sleep(0.01)
    assert started == [incident["id"]]


def test_approve_requires_awaiting_approval(client):
    incident = client.post("/api/demo/trigger", headers=AUTH).json()
    assert client.post(f"/api/incidents/{incident['id']}/approve", headers=AUTH).status_code == 409


def test_reset_clears_the_incident(client):
    client.post("/api/demo/trigger", headers=AUTH)
    assert client.post("/api/demo/reset", headers=AUTH).status_code == 204
    assert client.get("/api/incidents/current").json() is None


def test_recordings_are_served_and_names_validated(client, tmp_path):
    incident = client.post("/api/demo/trigger", headers=AUTH).json()
    name = next(tmp_path.glob(f"{incident['id']}-*.jsonl")).stem
    response = client.get(f"/api/recordings/{name}")
    assert response.status_code == 200
    assert '"incident.detected"' in response.text
    assert client.get("/api/recordings/..%2Fsecrets").status_code in (400, 404)
    assert client.get("/api/recordings/missing").status_code == 404


def test_cases_lists_the_headline_case(client):
    assert any(c["id"] == "ownership-check" for c in client.get("/api/cases").json())
