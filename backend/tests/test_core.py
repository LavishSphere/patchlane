import asyncio
from datetime import datetime, timezone

import pytest

from app.models.incident import Incident, IncidentImpact, IncidentStatus as S
from app.monitoring.detector import detect
from app.orchestration.measurements import parse_replay, pytest_counts
from app.orchestration.state_machine import InvalidTransition, transition
from app.orchestration.verification import classify
from app.services.event_bus import EventBus
from casekit import load_case


def make_incident(status: S = S.DETECTED) -> Incident:
    return Incident(
        id="INC-1",
        case_id="ownership-check",
        status=status,
        severity="SEV-1",
        service="bank-service",
        endpoint="POST /api/transfers",
        symptom="s",
        alert="a",
        created_at=datetime.now(timezone.utc),
        impact=IncidentImpact(),
    )


def test_source_changes_are_allowed():
    source, tampered, dropped = classify("M\tbank_service/transfers.py\nA\tbank_service/auth.py")
    assert source == ["bank_service/transfers.py", "bank_service/auth.py"]
    assert tampered == [] and dropped == []


def test_editing_existing_tests_or_data_is_tampering():
    _, tampered, _ = classify("M\ttests/test_transfers.py\nM\tdata/incident_log.jsonl\nD\tscripts/replay.py")
    assert tampered == ["tests/test_transfers.py", "data/incident_log.jsonl", "scripts/replay.py"]


def test_new_agent_tests_are_dropped_not_trusted():
    source, tampered, dropped = classify("A\ttests/test_droid_repro.py\nM\tbank_service/transfers.py")
    assert dropped == ["tests/test_droid_repro.py"]
    assert source == ["bank_service/transfers.py"] and tampered == []


def test_bytecode_is_ignored():
    source, tampered, dropped = classify("A\tbank_service/__pycache__/transfers.cpython-312.pyc\nA\ttests/__pycache__/conftest.pyc")
    assert source == tampered == dropped == []


def test_rename_out_of_source_is_tampering():
    _, tampered, _ = classify("R100\tbank_service/transfers.py\ttests/transfers.py")
    assert tampered == ["bank_service/transfers.py", "tests/transfers.py"]


def test_pytest_counts():
    assert pytest_counts("20 passed in 0.09s") == (20, 20)
    assert pytest_counts("1 failed, 19 passed in 0.2s") == (19, 20)
    assert pytest_counts("2 errors in 0.1s") == (0, 2)


def test_parse_replay_takes_last_json_line():
    result = parse_replay('warning: noise\n{"attacks_total": 14, "attacks_succeeded": 0, "legit_total": 200, "legit_blocked": 0}\n')
    assert result.attacks_total == 14 and result.legit_blocked == 0
    assert parse_replay("Traceback ...") is None


def test_detector_reads_the_incident_log():
    detection = detect(load_case("ownership-check"))
    assert detection.impact.unauthorized_transfers == 14
    assert detection.impact.legit_transfers_in_window == 200
    assert len(detection.impact.affected_customers) == 3
    assert detection.impact.amount_moved_cents == sum(e["amount_cents"] for e in detection.unauthorized)
    assert "{" not in detection.alert


def test_state_machine_rejects_skipping_verification():
    incident = make_incident(S.DIAGNOSING)
    with pytest.raises(InvalidTransition):
        transition(incident, S.AWAITING_APPROVAL)
    transition(incident, S.PATCHING)
    assert incident.status == S.PATCHING


def test_event_bus_replays_history_to_new_subscribers_and_records(tmp_path):
    async def scenario():
        bus = EventBus(tmp_path)
        bus.start("INC-1")
        bus.publish(make_incident())
        bus.emit("INC-1", "incident.detected", "detected")
        queue = bus.subscribe()
        assert [queue.get_nowait()[0] for _ in range(2)] == ["incident", "event"]
        bus.emit("INC-1", "sandbox.ready", "ready")
        assert queue.get_nowait()[0] == "event"
        recording = bus.recording
        bus.clear()
        assert queue.get_nowait()[0] == "end"
        assert len(recording.read_text().splitlines()) == 3

    asyncio.run(scenario())
