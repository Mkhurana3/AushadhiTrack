"""Unsupervised anomaly detection over the feature table.

There are no labelled fraud cases to learn from, so the model is an Isolation Forest: it isolates
rows that are easy to separate from the rest. Before training, every feature is turned into a
robust z-score against the same medicine at the other kendras (median and MAD), so a row is
judged against its real peers. Explanations list the features that sit furthest from the peers.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import IsolationForest

from .features import FEATURE_KEYS, FEATURES
from .master import DRUG, KENDRA

N_ESTIMATORS = 500
CONTAMINATION = 0.06
RANDOM_STATE = 7
EXPLAIN_Z = 2.5


def peer_z(ft: pd.DataFrame) -> pd.DataFrame:
    """Robust z-score of each feature against the same medicine at other kendras."""
    z = pd.DataFrame(index=ft.index, columns=FEATURE_KEYS, dtype=float)
    floor = ft[FEATURE_KEYS].std(ddof=0) * 0.25 + 1e-9
    for _, idx in ft.groupby("drug").groups.items():
        part = ft.loc[idx, FEATURE_KEYS]
        med = part.median()
        mad = (part - med).abs().median() * 1.4826
        scale = np.maximum(mad, floor)
        z.loc[idx] = ((part - med) / scale).values
    return z


def peer_median(ft: pd.DataFrame, row: pd.Series, key: str) -> float:
    peers = ft[(ft["drug"] == row["drug"]) & (ft["kendra"] != row["kendra"])]
    return float(peers[key].median())


def train(ft: pd.DataFrame) -> dict:
    z = peer_z(ft)
    forest = IsolationForest(n_estimators=N_ESTIMATORS, contamination=CONTAMINATION, random_state=RANDOM_STATE)
    forest.fit(z.values)
    score = -forest.score_samples(z.values)          # higher means easier to isolate, so stranger
    flagged = forest.predict(z.values) == -1
    threshold = float(-forest.offset_)

    meta_by_key = {f["key"]: f for f in FEATURES}
    rows = []
    for i, r in ft.iterrows():
        zs = z.loc[i]
        unusual = sorted((k for k in FEATURE_KEYS if abs(zs[k]) >= EXPLAIN_Z), key=lambda k: -abs(zs[k]))[:3]
        rows.append({
            "id": f"M-{r['kendra'][3:]}{r['drug'][1:]}",
            "kendra": r["kendra"], "drug": r["drug"],
            "score": round(float(score[i]), 4), "flagged": bool(flagged[i]),
            "units": int(r["units"]), "bills": int(r["bills"]),
            "unusual": [{
                "key": k, "label": meta_by_key[k]["label"], "unit": meta_by_key[k]["unit"],
                "value": round(float(r[k]), 4), "peers": round(peer_median(ft, r, k), 4), "z": round(float(zs[k]), 2),
            } for k in unusual],
            "features": {k: round(float(r[k]), 4) for k in FEATURE_KEYS},
        })
    rows.sort(key=lambda x: -x["score"])
    return {
        "meta": {
            "algorithm": "Isolation Forest", "library": f"scikit-learn {sklearn.__version__}",
            "n_estimators": N_ESTIMATORS, "contamination": CONTAMINATION, "random_state": RANDOM_STATE,
            "threshold": round(threshold, 4), "rows": len(rows), "explain_z": EXPLAIN_Z,
            "features": FEATURES,
        },
        "rows": rows,
    }


def describe(result: dict) -> str:
    lines = []
    for r in result["rows"]:
        if not r["flagged"]:
            continue
        why = "; ".join(f"{u['label']} {u['value']} vs {u['peers']} (z {u['z']})" for u in r["unusual"])
        lines.append(f"{r['id']} {KENDRA[r['kendra']]['name']} / {DRUG[r['drug']]['short']}: score {r['score']} | {why}")
    return "\n".join(lines)
