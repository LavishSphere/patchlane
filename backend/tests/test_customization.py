"""What a judge can customize, and what must never go wrong while they do.

Judges pick a case (the safeguard to break) and a variant (how it breaks) from
fixed lists. These tests pin down that only those ids are accepted, that every
combination builds the tree it claims, that nothing about the chosen bug leaks
to Droid, and that double clicks and resets during a run are harmless.
"""

import asyncio
import dataclasses
import json
import re
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.benchmark import run as bench
from app.config import Settings
from app.integrations.factory import build_prompt
from app.main import create_app
from app.models.incident import IncidentStatus as S
from app.orchestration import incident_runner
from app.services.demo_state import DemoState

from casekit import (  # noqa: E402  (demo/ is on sys.path via app.config)
    DEMO_DIR,
    SERVICE_DIR,
    Variant,
    agent_tree,
    apply_variant,
    case_ids,
    list_cases,
    load_case,
    verification_tree,
)

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}
REPO = DEMO_DIR.parent
COMBINATIONS = [(case.id, option["id"]) for case in list_cases() for option in case.options()]
DASHES = ("—", "–")


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(Settings(operator_token=TOKEN), runs_dir=tmp_path)) as client:
        yield client


def trigger(client, **body):
    return client.post("/api/demo/trigger", headers=AUTH, json=body)


# --- The catalog the judge chooses from ---------------------------------------


def test_catalog_lists_every_case_with_a_safeguard_and_its_variants(client):
    cases = client.get("/api/cases").json()
    assert [c["id"] for c in cases] == case_ids()
    assert len(cases) == 12
    for c in cases:
        assert c["safeguard"].strip(), c["id"]
        ids = [v["id"] for v in c["variants"]]
        assert ids[0] == "default"
        assert len(ids) == len(set(ids)) and 1 <= len(ids) <= 3
        for v in c["variants"]:
            assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", v["id"])
            assert v["label"].strip() and len(v["label"]) <= 80
            assert not any(d in v["label"] for d in DASHES)
        assert not any(d in c["safeguard"] for d in DASHES)


def test_catalog_offers_at_least_twenty_combinations():
    assert len(COMBINATIONS) >= 20


# --- Only ids from the catalog are accepted -----------------------------------


@pytest.mark.parametrize("case_id, variant_id", COMBINATIONS)
def test_every_combination_can_be_triggered(client, case_id, variant_id):
    response = trigger(client, caseId=case_id, variantId=variant_id)
    assert response.status_code == 200, response.text
    incident = response.json()
    case = load_case(case_id)
    assert incident["caseId"] == case_id
    assert incident["variantId"] == variant_id
    assert incident["variantLabel"] == case.label(variant_id)
    assert incident["safeguard"] == case.safeguard
    assert incident["status"] == "detected"


def test_variant_defaults_when_omitted_or_null(client):
    assert trigger(client, caseId="double-debit").json()["variantId"] == "default"
    assert trigger(client, caseId="double-debit", variantId=None).json()["variantId"] == "default"
    assert trigger(client, caseId="double-debit", variantId="default").json()["variantId"] == "default"


def test_variant_without_a_case_applies_to_the_default_case(client):
    assert trigger(client, variantId="own-owner").json()["caseId"] == "ownership-check"
    assert trigger(client, variantId="floor-div").status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"caseId": "ownership-check", "variantId": "floor-div"},  # belongs to another case
        {"caseId": "ownership-check", "variantId": "removed"},
        {"caseId": "fee-rounding", "variantId": "own-owner"},
        {"caseId": "nope"},
        {"caseId": "bank-service"},
    ],
)
def test_unknown_ids_are_404(client, body):
    assert client.post("/api/demo/trigger", headers=AUTH, json=body).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"caseId": "ownership-check", "code": "import os"},  # no extra fields, ever
        {"caseId": "ownership-check", "variantId": "default", "symptom": "anything"},
        {"caseId": "ownership-check", "case_id": "double-debit", "extra": 1},
        {"caseId": "../bank-service"},
        {"caseId": "ownership-check/../double-debit"},
        {"caseId": "ownership-check; rm -rf /"},
        {"caseId": "OWNERSHIP-CHECK"},
        {"caseId": "ownership_check"},
        {"caseId": " ownership-check"},
        {"caseId": "ownership‑check"},  # non-ASCII hyphen
        {"caseId": ""},
        {"caseId": "a" * 65},
        {"caseId": 123},
        {"caseId": ["ownership-check"]},
        {"caseId": {"id": "ownership-check"}},
        {"caseId": True},
        {"caseId": "ownership-check", "variantId": 7},
        {"caseId": "ownership-check", "variantId": "../default"},
        {"caseId": "ownership-check", "variantId": "own owner"},
    ],
)
def test_malformed_requests_are_422_and_change_nothing(client, body):
    before = client.get("/api/incidents/current").json()
    assert client.post("/api/demo/trigger", headers=AUTH, json=body).status_code == 422
    assert client.get("/api/incidents/current").json() == before


def test_bad_request_leaves_the_current_incident_alone(client):
    first = trigger(client, caseId="double-debit").json()
    assert trigger(client, caseId="double-debit", variantId="nope").status_code == 404
    assert trigger(client, caseId="nope").status_code == 404
    assert client.get("/api/incidents/current").json()["id"] == first["id"]


def test_non_json_body_is_rejected(client):
    response = client.post("/api/demo/trigger", headers={**AUTH, "Content-Type": "application/json"}, content=b"caseId=x")
    assert response.status_code == 422


def test_customization_still_needs_the_token(client):
    assert client.post("/api/demo/trigger", json={"caseId": "double-debit", "variantId": "not-stored"}).status_code == 401


# --- Every combination builds exactly the tree it claims ----------------------


def changed_files(tree: Path) -> set[str]:
    changed = set()
    for path in (tree / "bank_service").rglob("*.py"):
        rel = path.relative_to(tree).as_posix()
        if path.read_text() != (SERVICE_DIR / rel).read_text():
            changed.add(rel)
    return changed


@pytest.mark.parametrize("case_id, variant_id", COMBINATIONS)
def test_agent_tree_has_the_bug_and_nothing_else(tmp_path, case_id, variant_id):
    case = load_case(case_id)
    tree = agent_tree(case, tmp_path / "agent", variant_id)

    expected = (
        {p.relative_to(case.dir / "buggy_files").as_posix() for p in (case.dir / "buggy_files").rglob("*.py")}
        if variant_id == "default"
        else {case.variant(variant_id).file}
    )
    assert changed_files(tree) == expected
    assert case.truth(variant_id)["file"] in expected

    names = {p.name for p in tree.rglob("*") if p.is_file()}
    assert "ground_truth.json" not in names and "variants.json" not in names and "case.json" not in names
    assert not names & {t.name for t in case.hidden_tests}
    assert (tree / "tests" / "test_incident.py").read_text() == (case.dir / "repro_test.py").read_text()

    secrets = [case.default_label, case.safeguard] + [t for v in case.variants for t in (v.label, v.root_cause)]
    for path in tree.rglob("*"):
        if path.is_file() and path.suffix in {".py", ".md", ".json", ".txt", ".ini"}:
            text = path.read_text()
            assert not any(s in text for s in secrets), path


@pytest.mark.parametrize("case_id, variant_id", COMBINATIONS)
def test_verification_tree_tests_the_same_bug_with_hidden_tests(tmp_path, case_id, variant_id):
    case = load_case(case_id)
    agent = agent_tree(case, tmp_path / "agent", variant_id)
    verify = verification_tree(case, tmp_path / "verify", variant_id)
    for path in (agent / "bank_service").rglob("*.py"):
        rel = path.relative_to(agent)
        assert (verify / rel).read_text() == path.read_text()
    for hidden in case.hidden_tests:
        assert (verify / "tests" / hidden.name).is_file()


@pytest.mark.parametrize("case_id, variant_id", COMBINATIONS)
def test_droid_prompt_never_names_the_chosen_bug(case_id, variant_id):
    case = load_case(case_id)
    prompt = build_prompt(case.meta, "alert text", "1 failed")
    for text in [case.label(variant_id), case.safeguard, case.truth(variant_id)["root_cause"]]:
        assert text not in prompt


def test_unknown_variant_raises_before_any_files_are_written(tmp_path):
    case = load_case("ownership-check")
    with pytest.raises(KeyError):
        agent_tree(case, tmp_path / "agent", "nope")
    assert not (tmp_path / "agent").exists()


@pytest.mark.parametrize("bad", ["../bank-service", "bank-service", "", ".", "cases", "Ownership-Check", None, 3])
def test_load_case_only_accepts_case_folders(bad):
    with pytest.raises(FileNotFoundError):
        load_case(bad)


def test_apply_variant_refuses_a_missing_or_repeated_target():
    source = "a = 1\nb = 1\n"
    missing = Variant("x", "x", "bank_service/x.py", "f", "r", (("c = 1\n", "c = 2\n"),))
    repeated = Variant("x", "x", "bank_service/x.py", "f", "r", (("= 1\n", "= 2\n"),))
    with pytest.raises(ValueError):
        apply_variant(missing, source)
    with pytest.raises(ValueError):
        apply_variant(repeated, source)


def test_validator_rejects_broken_variant_specs():
    sys.path.insert(0, str(DEMO_DIR))
    from validate_cases import check_variant_spec

    case = load_case("limit-units")
    good = case.variants[0]
    bad_cases = {
        "id": dataclasses.replace(good, id="Bad_ID"),
        "default id": dataclasses.replace(good, id="default"),
        "outside": dataclasses.replace(good, file="../backend/app/main.py"),
        "missing file": dataclasses.replace(good, file="bank_service/nope.py"),
        "no-op": dataclasses.replace(good, edits=((good.edits[0][0], good.edits[0][0]),)),
        "syntax": dataclasses.replace(good, edits=((good.edits[0][0], "    if amount_cents >\n"),)),
        "label": dataclasses.replace(good, label=""),
        "dash": dataclasses.replace(good, label="Off by one — again"),
    }
    for name, variant in bad_cases.items():
        broken = dataclasses.replace(case, variants=(variant,))
        assert check_variant_spec(broken), f"validator accepted a variant with a bad {name}"
    duplicate = dataclasses.replace(case, variants=(good, good))
    assert check_variant_spec(duplicate)
    assert check_variant_spec(case) == []


# --- Benchmark selection -------------------------------------------------------


def test_benchmark_selection_covers_every_combination():
    selection = bench.select("all-variants")
    assert [(c.id, v) for c, v in selection] == COMBINATIONS
    assert [(c.id, v) for c, v in bench.select("all")] == [(c, None) for c in case_ids()]
    assert [(c.id, v) for c, v in bench.select("limit-units@not-called, double-debit")] == [
        ("limit-units", "not-called"),
        ("double-debit", None),
    ]
    with pytest.raises(KeyError):
        bench.select("limit-units@nope")
    with pytest.raises(FileNotFoundError):
        bench.select("../demo")
    assert bench.row_id(load_case("limit-units"), "not-called") == "limit-units@not-called"
    assert bench.row_id(load_case("limit-units"), "default") == "limit-units"


# --- Double clicks and resets during a run ------------------------------------


async def _async_client(app):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def test_double_clicked_trigger_creates_one_incident(tmp_path, monkeypatch):
    app = create_app(Settings(operator_token=TOKEN), runs_dir=tmp_path)
    real_destroy = incident_runner.destroy_sandboxes

    async def slow_destroy(state):
        await asyncio.sleep(0.2)  # the first trigger is still inside the lock
        await real_destroy(state)

    monkeypatch.setattr(incident_runner, "destroy_sandboxes", slow_destroy)

    async def scenario():
        async with await _async_client(app) as c:
            first, second = await asyncio.gather(
                c.post("/api/demo/trigger", headers=AUTH, json={"caseId": "double-debit"}),
                c.post("/api/demo/trigger", headers=AUTH, json={"caseId": "fee-quote"}),
            )
            return sorted([first.status_code, second.status_code]), (await c.get("/api/incidents/current")).json()

    codes, current = asyncio.run(scenario())
    assert codes == [200, 409]
    assert current["id"] == "INC-1042"


def test_double_clicked_approve_approves_once(tmp_path, monkeypatch):
    app = create_app(Settings(operator_token=TOKEN), runs_dir=tmp_path)
    real_destroy = incident_runner.destroy_sandboxes

    async def slow_destroy(state):
        await asyncio.sleep(0.2)
        await real_destroy(state)

    monkeypatch.setattr(incident_runner, "destroy_sandboxes", slow_destroy)

    async def scenario():
        async with await _async_client(app) as c:
            incident = (await c.post("/api/demo/trigger", headers=AUTH, json={"caseId": "double-debit"})).json()
            app.state.demo.incident.status = S.AWAITING_APPROVAL  # as if verification just finished
            url = f"/api/incidents/{incident['id']}"
            first, second = await asyncio.gather(c.post(f"{url}/approve", headers=AUTH), c.post(f"{url}/approve", headers=AUTH))
            reject = await c.post(f"{url}/reject", headers=AUTH)
            return sorted([first.status_code, second.status_code]), reject.status_code, app.state.demo

    codes, reject_code, state = asyncio.run(scenario())
    assert codes == [200, 409]
    assert reject_code == 409
    assert state.incident.status == S.RESOLVED
    assert [e.type for e in state.bus.history()].count("approval.received") == 1


def test_double_clicked_investigate_starts_one_run(tmp_path, monkeypatch):
    app = create_app(Settings(operator_token=TOKEN), runs_dir=tmp_path)
    started = []

    async def slow_investigate(state):
        started.append(state.incident.id)
        await asyncio.sleep(1)

    monkeypatch.setattr(incident_runner, "investigate", slow_investigate)

    async def scenario():
        async with await _async_client(app) as c:
            incident = (await c.post("/api/demo/trigger", headers=AUTH, json={"caseId": "history-leak"})).json()
            url = f"/api/incidents/{incident['id']}/investigate"
            responses = await asyncio.gather(*(c.post(url, headers=AUTH) for _ in range(3)))
            await asyncio.sleep(0.05)
            app.state.demo.task.cancel()
            return sorted(r.status_code for r in responses)

    assert asyncio.run(scenario()) == [202, 409, 409]
    assert len(started) == 1


def test_reset_during_a_run_cancels_it_and_deletes_every_sandbox(tmp_path, monkeypatch):
    from fakes import BUGGY, FakeSandbox

    sandboxes = {"agent": FakeSandbox("agent", BUGGY), "verification": FakeSandbox("verification", BUGGY)}

    async def fake_create(role, on_change=lambda: None):
        return sandboxes[role]

    async def stuck_droid(**kwargs):
        await asyncio.sleep(60)

    monkeypatch.setattr(incident_runner, "create_sandbox", fake_create)
    monkeypatch.setattr(incident_runner, "run_droid", stuck_droid)

    async def scenario():
        state = DemoState(tmp_path)
        await incident_runner.trigger(state, "declined-credit", "finally-block")
        state.task = asyncio.create_task(incident_runner.investigate(state))
        for _ in range(200):
            if state.incident.status == S.DIAGNOSING:
                break
            await asyncio.sleep(0.01)
        assert state.incident.status == S.DIAGNOSING
        await incident_runner.reset(state)
        return state

    state = asyncio.run(scenario())
    assert state.incident is None and state.task is None
    assert all(s.deleted for s in sandboxes.values())


def test_trigger_while_running_is_refused(client):
    trigger(client, caseId="double-debit")
    client.app.state.demo.incident.status = S.DIAGNOSING
    response = trigger(client, caseId="fee-quote", variantId="truncates")
    assert response.status_code == 409
    assert client.get("/api/incidents/current").json()["caseId"] == "double-debit"


def test_runner_uploads_the_chosen_variant(tmp_path, monkeypatch):
    from fakes import BUGGY, FakeSandbox

    uploaded = {}

    class RecordingSandbox(FakeSandbox):
        async def upload_tree(self, tree):
            uploaded[self.summary.role] = (tree / "bank_service" / "ledger.py").read_text()
            return await super().upload_tree(tree)

    sandboxes = {"agent": RecordingSandbox("agent", BUGGY), "verification": RecordingSandbox("verification", BUGGY)}

    async def fake_create(role, on_change=lambda: None):
        return sandboxes[role]

    async def no_droid(**kwargs):
        raise incident_runner.DroidRunFailed("stop here")

    monkeypatch.setattr(incident_runner, "create_sandbox", fake_create)
    monkeypatch.setattr(incident_runner, "run_droid", no_droid)

    async def scenario():
        state = DemoState(tmp_path)
        await incident_runner.trigger(state, "double-debit", "swapped-key")
        await incident_runner.investigate(state)

    asyncio.run(scenario())
    assert "get((idempotency_key, requester_id))" in uploaded["agent"]


# --- Published recordings and copy rules --------------------------------------

RECORDINGS = REPO / "frontend" / "public" / "recordings"
SECRET_PATTERNS = [r"Bearer\s+\S", r"dtn_[A-Za-z0-9]{8,}", r"\bfk-[A-Za-z0-9_-]{8,}", r"\bsk-[A-Za-z0-9_-]{8,}", r"api[_-]?key\s*[=:]\s*\S"]


def recording_files() -> list[Path]:
    return sorted(RECORDINGS.glob("*.jsonl")) if RECORDINGS.is_dir() else []


@pytest.mark.skipif(not RECORDINGS.is_dir(), reason="frontend is not in this image")
def test_recordings_index_points_at_real_files():
    index_path = RECORDINGS / "index.json"
    if not index_path.exists():
        pytest.skip("no recordings index yet")
    index = json.loads(index_path.read_text())
    names = [entry["name"] for entry in index]
    assert len(names) == len(set(names)) and "golden" in names
    for entry in index:
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", entry["name"])
        assert (RECORDINGS / f"{entry['name']}.jsonl").is_file()
        assert entry["caseId"] in case_ids()


@pytest.mark.skipif(not RECORDINGS.is_dir(), reason="frontend is not in this image")
@pytest.mark.parametrize("path", recording_files(), ids=lambda p: p.name)
def test_every_recording_is_a_complete_resolved_run_with_no_secrets(path):
    text = path.read_text()
    for pattern in SECRET_PATTERNS:
        assert not re.search(pattern, text, re.IGNORECASE), pattern
    lines = [json.loads(line) for line in text.splitlines() if line.strip()]
    events = [l["data"] for l in lines if l["kind"] == "event"]
    incidents = [l["data"] for l in lines if l["kind"] == "incident"]
    assert events[0]["type"] == "incident.detected"
    assert incidents[-1]["status"] == "resolved"
    assert incidents[-1]["verification"]["verdict"] == "safe_to_review"
    stamps = [l["at"] for l in lines]
    assert stamps == sorted(stamps)
    for sandbox in ("agentSandbox", "verificationSandbox"):
        assert incidents[-1][sandbox]["destroyedAt"]


@pytest.mark.skipif(not (REPO / "frontend" / "src").is_dir(), reason="frontend is not in this image")
def test_frontend_copy_has_no_em_or_en_dashes():
    offenders = []
    for path in (REPO / "frontend" / "src").rglob("*"):
        if path.is_file() and path.suffix in {".js", ".jsx", ".css", ".html"}:
            for n, line in enumerate(path.read_text().splitlines(), 1):
                if any(d in line for d in DASHES):
                    offenders.append(f"{path.relative_to(REPO)}:{n}")
    assert offenders == []


def test_case_text_has_no_em_or_en_dashes():
    for case in list_cases():
        for text in [case.meta["title"], case.meta["symptom"], case.meta.get("alert", ""), *case.meta.get("evidence", [])]:
            assert not any(d in text for d in DASHES), (case.id, text)
