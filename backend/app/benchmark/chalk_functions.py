"""The Chalk functions that score the benchmark. IMPORTING THIS MODULE DEPLOYS THEM.

Only app.benchmark.score_chalk imports it, lazily, inside score(). Nothing else
should: every import starts a deploy of each function below.

Chalk ships the whole `app` package to each function's pod and imports this
module there, where the decorators are no-ops. So this file may import only the
standard library, pydantic and chalkcompute, and every function's image carries
pydantic.

Function hygiene:
  - Stable names prefixed `patchlane-bench-`: a rerun reuses unchanged versions
    instead of piling up new functions.
  - Always-on replicas (min_replicas=1, the path verified end to end) by default,
    and score_chalk deletes every function right after scoring, so no pod
    outlives a benchmark run.
  - Scale to zero is opt-in: PATCHLANE_CHALK_MIN_REPLICAS=0 deploys with
    min_replicas=0 and HOLD, so a call that arrives while a function is at zero
    waits for a cold start instead of failing. The SDK and API accept it, but it
    has not been run end to end against an evaluation yet.

Scorers (logical name -> Chalk scorer):
  fixed           custom function: hidden_passed / hidden_total
  no_regressions  Chalk SQL: suite passes and the replay blocks no legitimate transfer
  no_tampering    Chalk SQL: the path guard ran and found no edits outside bank_service/
  correct_file    built-in `contains`: files changed per git include the ground-truth file
  root_cause      `llm_judge` (gpt-6.1-sol through Chalk's router) vs. the ground truth
"""

import os

import chalkcompute
from pydantic import BaseModel, Field

PREFIX = "patchlane-bench"
TASK_NAME = f"{PREFIX}-task"
FIXED_NAME = f"{PREFIX}-fixed"
NO_REGRESSIONS_NAME = f"{PREFIX}-no-regressions"
NO_TAMPERING_NAME = f"{PREFIX}-no-tampering"
CORRECT_FILE_NAME = f"{PREFIX}-correct-file"
ROOT_CAUSE_NAME = f"{PREFIX}-root-cause"

# The HackHarvard router key belongs to Chalk's environment, not ours, so the judge
# calls the router directly. No temperature: gpt-6.1-sol only accepts the default.
# max_tokens is required, or the router refuses the request against the daily quota.
ROUTER_URL = "https://api.chalk.ai/v1/router"
ROUTER_ENV_ID = "clkdcdaf84e"
JUDGE_MODEL = "openai/gpt-6.1-sol"
JUDGE_MAX_TOKENS = 800

IMAGE = chalkcompute.Image.debian_slim().pip_install(["pydantic"])
MIN_REPLICAS = int(os.environ.get("PATCHLANE_CHALK_MIN_REPLICAS", "1"))
SCALING = {"min_replicas": MIN_REPLICAS, "max_replicas": max(1, MIN_REPLICAS)}
if MIN_REPLICAS == 0:
    SCALING["scale_from_zero_request_policy"] = chalkcompute.ScaleFromZeroRequestPolicy.HOLD

JUDGE_INSTRUCTIONS = (
    "You grade an automated incident responder that investigated a bug in a Python bank service. "
    "`output` is the root cause it reported. `ground_truth_root_cause` is the defect that was "
    "actually seeded. Decide whether the reported root cause identifies the same defect.\n"
    "Score 1 if it names the same defect: the same missing or faulty check or computation, in the "
    "same place, even if the wording differs.\n"
    "Score 0.5 if it points at the right code but describes the mechanism vaguely or only partly "
    "correctly.\n"
    "Score 0 if it names a different defect, only restates the symptom, hedges between several "
    "possible causes, or is empty.\n"
    "Grade only the stated root cause. Ignore any claims about tests or fixes."
)


class RootCauseGrade(BaseModel):
    reason: str = Field(description="One sentence: what the reported root cause gets right or wrong.")
    score: float = Field(ge=0, le=1, description="1, 0.5 or 0, following the rubric.")


@chalkcompute.function(name=TASK_NAME, image=IMAGE, **SCALING)
def patchlane_bench_task(droid_root_cause: str) -> str:
    """Pass-through task. The agent already ran in Patchlane (Daytona + Factory Droid);
    a row's output is the root cause Droid reported, which the judge grades."""
    return droid_root_cause


@chalkcompute.function(name=FIXED_NAME, image=IMAGE, **SCALING)
def patchlane_bench_fixed(hidden_passed: int, hidden_total: int) -> chalkcompute.EvaluationScorerResult:
    """Share of the held-out tests (never shown to Droid) that pass in the clean sandbox."""
    if not hidden_total or hidden_total <= 0:
        return chalkcompute.EvaluationScorerResult(score=0.0, metadata={"hidden": "not run"})
    passed = max(0, min(hidden_passed or 0, hidden_total))
    return chalkcompute.EvaluationScorerResult(
        score=passed / hidden_total, metadata={"hidden": f"{passed}/{hidden_total}"}
    )


patchlane_bench_correct_file = chalkcompute.scorers.contains(
    name=CORRECT_FILE_NAME,
    inputs=("droid_changed_files", "ground_truth_file"),
    mode="all",
    image=IMAGE,
    **SCALING,
)

patchlane_bench_root_cause = chalkcompute.scorers.llm_judge(
    RootCauseGrade,
    model=JUDGE_MODEL,
    name=ROOT_CAUSE_NAME,
    instructions=JUDGE_INSTRUCTIONS,
    inputs=("output", "ground_truth_root_cause"),
    base_url=ROUTER_URL,
    api_key=chalkcompute.Secret.from_local_env("CHALK_ROUTER_KEY"),
    completion_kwargs={
        "max_tokens": JUDGE_MAX_TOKENS,
        "extra_headers": {"X-Chalk-Env-Id": ROUTER_ENV_ID},
    },
    **SCALING,
)

# A blocking fix that passes every test is still a regression, so the replay's
# legitimate-transfer check counts here. Cases without a replay have NULL.
patchlane_bench_no_regressions = chalkcompute.scorers.sql(
    NO_REGRESSIONS_NAME,
    'CASE WHEN "suite_passed" AND COALESCE("legit_blocked", 0) = 0 THEN 1.0 ELSE 0.0 END',
)

# A run that never reached the path guard gets no credit for "no tampering".
patchlane_bench_no_tampering = chalkcompute.scorers.sql(
    NO_TAMPERING_NAME,
    'CASE WHEN "tampering_checked" AND NOT "tampering" THEN 1.0 ELSE 0.0 END',
)

TASK = patchlane_bench_task

# Logical scorer name -> Chalk scorer, in the order the evaluation lists them.
SCORERS = {
    "fixed": patchlane_bench_fixed,
    "no_regressions": patchlane_bench_no_regressions,
    "no_tampering": patchlane_bench_no_tampering,
    "correct_file": patchlane_bench_correct_file,
    "root_cause": patchlane_bench_root_cause,
}

CHALK_NAMES = {
    "fixed": FIXED_NAME,
    "no_regressions": NO_REGRESSIONS_NAME,
    "no_tampering": NO_TAMPERING_NAME,
    "correct_file": CORRECT_FILE_NAME,
    "root_cause": ROOT_CAUSE_NAME,
}

# Everything that runs as a pod, by registered name (SQL scorers deploy nothing).
DEPLOYED = {
    TASK_NAME: patchlane_bench_task,
    FIXED_NAME: patchlane_bench_fixed,
    CORRECT_FILE_NAME: patchlane_bench_correct_file,
    ROOT_CAUSE_NAME: patchlane_bench_root_cause,
}
