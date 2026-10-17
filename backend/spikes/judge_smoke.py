"""Chalk llm_judge smoke test: can the judge reach gpt-6.1-sol through Chalk's router?

The HackHarvard key only works against Chalk's own environment, so the judge is
pointed at the router with base_url + api_key, and the X-Chalk-Env-Id header
rides along in completion_kwargs["extra_headers"]. max_tokens is required: the
router refuses requests it can't estimate against the daily token quota.

Two rows, one judge:
  match      root cause agrees with the ground truth  -> expect score near 1
  mismatch   root cause blames the wrong thing         -> expect score near 0

If the judge errors on extra_headers or a missing environment header, the
fallback is a custom @chalkcompute.function scorer that builds its own client.

Setup (once):
  .venv/bin/pip install chalkcompute pyarrow
  add CHALK_ROUTER_KEY=ck-... to backend/.env (gitignored, never commit the key)

Usage (from the repo root):
  set -a; source backend/.env; set +a
  .venv/bin/python backend/spikes/judge_smoke.py
"""

import os
import sys
import time

import chalkcompute
from pydantic import BaseModel, Field

ROUTER_URL = "https://api.chalk.ai/v1/router"
ROUTER_ENV_ID = "clkdcdaf84e"  # Chalk's environment that owns the HackHarvard keys, not ours
JUDGE_MODEL = "openai/gpt-6.1-sol"


class RootCauseGrade(BaseModel):
    score: float = Field(ge=0, le=1, description="1 if the stated root cause matches the ground truth, 0 if it does not.")
    reason: str = Field(description="One sentence explaining the grade.")


root_cause = chalkcompute.scorers.llm_judge(
    RootCauseGrade,
    model=JUDGE_MODEL,
    name="root-cause-smoke",
    instructions=(
        "You are grading an automated bug fixer. Compare the root cause it reported (output) "
        "with the ground-truth root cause (expected_root_cause). Score 1 if they describe the "
        "same underlying defect, even in different words, and 0 if they do not."
    ),
    inputs=("output", "expected_root_cause"),
    base_url=ROUTER_URL,
    api_key=chalkcompute.Secret.from_local_env("CHALK_ROUTER_KEY"),
    completion_kwargs={
        # No temperature: gpt-6.1-sol only accepts the default (1).
        "max_tokens": 400,
        "extra_headers": {"X-Chalk-Env-Id": ROUTER_ENV_ID},
    },
)


# Every function deployed from this file imports the whole file, so the task's
# image needs pydantic too (the judge gets it automatically).
@chalkcompute.function(image=chalkcompute.Image.debian_slim().pip_install(["pydantic"]))
def judge_smoke_task(root_cause: str) -> str:
    return root_cause


ROWS = [
    {
        "case": "match",
        "root_cause": "transfer() never checks that the source account belongs to the caller, so anyone can move money out of another user's account.",
        "expected_root_cause": "The transfer endpoint is missing an ownership check on the source account.",
    },
    {
        "case": "mismatch",
        "root_cause": "The fee calculation rounds half-cents down instead of up.",
        "expected_root_cause": "The transfer endpoint is missing an ownership check on the source account.",
    },
]


if __name__ == "__main__":
    if not os.getenv("CHALK_ROUTER_KEY"):
        sys.exit("CHALK_ROUTER_KEY is not set (add it to backend/.env, then: set -a; source backend/.env; set +a)")

    ts = time.strftime("%Y%m%d-%H%M%S")
    dataset = chalkcompute.DatasetClient().upload(f"patchlane-judge-smoke-{ts}", ROWS)
    evaluation = chalkcompute.Evaluation.create(
        f"patchlane-judge-smoke-{ts}",
        dataset=dataset,
        task=judge_smoke_task,
        scorers=[root_cause],
    )
    run = evaluation.run(metadata={"spike": "judge_smoke"}).wait()
    print(f"run status: {run.status}")

    table = chalkcompute.DatasetClient().read(run.result_dataset)
    for row in table.to_pylist():
        picked = {k: v for k, v in row.items() if k == "case" or "root-cause-smoke" in k or k.endswith("_error")}
        print({k: (v[:300] if isinstance(v, str) else v) for k, v in picked.items()})
