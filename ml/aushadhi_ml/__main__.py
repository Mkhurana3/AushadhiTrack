"""Build the data the web app ships with.

    python -m aushadhi_ml --out ../web/src/data

Writes master.json (kendras, medicines, batches), ledger.json (the hash-chained history)
and model.json (anomaly scores with explanations). The output is deterministic, so CI can
rebuild it and fail if the committed files differ.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import master
from .features import feature_table
from .model import describe, train
from .simulate import simulate


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default="../web/src/data", help="output folder")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    led = simulate()
    check = led.verify()
    assert check["ok"], check
    result = train(feature_table(led.events))
    result["meta"]["trained_on"] = {"from": led.events[0]["at"][:10], "to": led.events[-1]["at"][:10], "head": led.head}

    def dump(name: str, obj) -> None:
        (out / name).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    dump("master.json", master.as_json())
    dump("ledger.json", led.events)
    dump("model.json", result)
    print(f"ledger: {check['count']} records, head {check['head'][:16]}")
    print(f"model: {sum(r['flagged'] for r in result['rows'])} of {len(result['rows'])} rows flagged")
    print(describe(result))


if __name__ == "__main__":
    main()
