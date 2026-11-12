"""Turns the ledger into one row of behavioural features per (kendra, medicine).

The rules in the web app check single facts (a bill above MRP, a count that doesn't match).
These features describe *how* a medicine sells at a kendra, so the model can spot patterns
no single rule describes. Each feature is later compared with the same medicine at the other
kendras, because Paracetamol and Glimepiride sell in very different ways.
"""
from __future__ import annotations

import pandas as pd

from .master import BATCH, DRUG, DRUGS, KENDRAS, day

LATE_FROM = "20:30"  # the last 30 minutes before the counter closes at 21:00

FEATURES = [
    {"key": "volume_index", "label": "Share of the kendra’s sales", "unit": "x",
     "help": "This medicine’s share of the kendra’s strips sold, divided by its share across the district."},
    {"key": "late_share", "label": "Bills in the last 30 minutes before closing", "unit": "%",
     "help": "Share of this medicine’s bills dated 20:30 or later. The counter closes at 21:00."},
    {"key": "one_time_share", "label": "Bills to numbers never seen again", "unit": "%",
     "help": "Share of bills to a mobile number that appears only once at this kendra in 60 days."},
    {"key": "mean_qty", "label": "Strips per bill", "unit": "",
     "help": "Average number of strips on a bill."},
    {"key": "top_buyer_share", "label": "Strips bought by the top customer", "unit": "%",
     "help": "Share of strips sold that went to the single biggest buyer."},
    {"key": "writeoff_ratio", "label": "Written off", "unit": "%",
     "help": "Strips written off as a share of strips received."},
    {"key": "price_gap", "label": "Charged above MRP", "unit": "%",
     "help": "Money charged above MRP as a share of the MRP value sold."},
    {"key": "recent_growth", "label": "Sales growth, last 3 weeks", "unit": "x",
     "help": "Strips sold in the last 21 days divided by the 21 days before."},
]
FEATURE_KEYS = [f["key"] for f in FEATURES]


def sales_frame(events: list[dict]) -> pd.DataFrame:
    rows = []
    for e in events:
        if e["type"] != "dayclose":
            continue
        d = e["data"]
        for bill, t, phone, batch, qty, price in d["bills"]:
            rows.append({"bill": bill, "kendra": d["kendra"], "date": d["date"], "time": t, "phone": phone,
                         "batch": batch, "drug": BATCH[batch]["drug"], "qty": qty, "price": price})
    return pd.DataFrame(rows)


def _stock_frames(events: list[dict]) -> tuple[pd.DataFrame, pd.DataFrame]:
    rec, wo = [], []
    for e in events:
        d = e["data"]
        if e["type"] == "receipt":
            rec += [{"kendra": d["kendra"], "drug": BATCH[b]["drug"], "qty": q} for b, q in d["items"]]
        elif e["type"] == "dayclose":
            wo += [{"kendra": d["kendra"], "drug": BATCH[b]["drug"], "qty": q} for b, q, _ in d["written"]]
    return pd.DataFrame(rec), pd.DataFrame(wo, columns=["kendra", "drug", "qty"])


def feature_table(events: list[dict]) -> pd.DataFrame:
    s = sales_frame(events)
    s["mrp"] = s["drug"].map(lambda c: DRUG[c]["mrp"])
    rec, wo = _stock_frames(events)
    received = rec.groupby(["kendra", "drug"])["qty"].sum()
    written = wo.groupby(["kendra", "drug"])["qty"].sum()

    visits = s.groupby(["kendra", "phone"])["bill"].count()
    s["one_time"] = [visits[(k, p)] == 1 for k, p in zip(s["kendra"], s["phone"])]
    kendra_units = s.groupby("kendra")["qty"].sum()
    drug_share = s.groupby("drug")["qty"].sum() / s["qty"].sum()
    recent_from, earlier_from = day(-21), day(-42)

    rows = []
    for k in KENDRAS:
        for d in DRUGS:
            g = s[(s["kendra"] == k["id"]) & (s["drug"] == d["code"])]
            units = int(g["qty"].sum())
            bills = len(g)
            recv = int(received.get((k["id"], d["code"]), 0))
            recent = g.loc[g["date"] >= recent_from, "qty"].sum()
            earlier = g.loc[(g["date"] >= earlier_from) & (g["date"] < recent_from), "qty"].sum()
            rows.append({
                "kendra": k["id"], "drug": d["code"], "units": units, "bills": bills,
                "volume_index": (units / kendra_units[k["id"]]) / drug_share[d["code"]] if units else 0.0,
                "late_share": float((g["time"] >= LATE_FROM).mean()) if bills else 0.0,
                "one_time_share": float(g["one_time"].mean()) if bills else 0.0,
                "mean_qty": units / bills if bills else 0.0,
                "top_buyer_share": float(g.groupby("phone")["qty"].sum().max() / units) if units else 0.0,
                "writeoff_ratio": float(written.get((k["id"], d["code"]), 0) / recv) if recv else 0.0,
                "price_gap": float(((g["price"] - g["mrp"]) * g["qty"]).sum() / (g["mrp"] * g["qty"]).sum()) if units else 0.0,
                "recent_growth": float((recent + 5) / (earlier + 5)),  # +5 keeps tiny volumes from looking like spikes
            })
    return pd.DataFrame(rows)
