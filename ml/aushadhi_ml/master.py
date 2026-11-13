"""Master data for the synthetic district: kendras, medicines and batches.

Every name and number here is invented for the prototype. MRPs are illustrative, per strip.
"""
from __future__ import annotations

from datetime import date, timedelta

TODAY = date(2026, 11, 12)
DISTRICT = "Ghaziabad"
WAREHOUSE = "Central warehouse, Gurugram"
OFFICER = "R. Verma, PMBI field officer"

KENDRAS = [
    {"id": "GZB01", "name": "Indirapuram", "size": 1.3},
    {"id": "GZB02", "name": "Vaishali", "size": 1.1},
    {"id": "GZB03", "name": "Raj Nagar Extension", "size": 0.9},
    {"id": "GZB04", "name": "Loni", "size": 1.0},
    {"id": "GZB05", "name": "Modinagar", "size": 0.7},
    {"id": "GZB06", "name": "Muradnagar", "size": 0.75},
    {"id": "GZB07", "name": "Kavi Nagar", "size": 1.2},
    {"id": "GZB08", "name": "Crossings Republik", "size": 1.35},
]

DRUGS = [
    {"code": "D104", "abbr": "PCM", "short": "Paracetamol", "name": "Paracetamol 500 mg", "pack": "strip of 10 tablets", "mrp": 12, "rate": 3.0, "chronic": False},
    {"code": "D117", "abbr": "MET", "short": "Metformin", "name": "Metformin 500 mg", "pack": "strip of 10 tablets", "mrp": 15, "rate": 2.2, "chronic": True},
    {"code": "D121", "abbr": "AML", "short": "Amlodipine", "name": "Amlodipine 5 mg", "pack": "strip of 10 tablets", "mrp": 8, "rate": 1.6, "chronic": True},
    {"code": "D133", "abbr": "ATV", "short": "Atorvastatin", "name": "Atorvastatin 10 mg", "pack": "strip of 10 tablets", "mrp": 14, "rate": 1.2, "chronic": True},
    {"code": "D140", "abbr": "TEL", "short": "Telmisartan", "name": "Telmisartan 40 mg", "pack": "strip of 10 tablets", "mrp": 16, "rate": 1.4, "chronic": True},
    {"code": "D152", "abbr": "PAN", "short": "Pantoprazole", "name": "Pantoprazole 40 mg", "pack": "strip of 10 tablets", "mrp": 13, "rate": 1.5, "chronic": False},
    {"code": "D165", "abbr": "CET", "short": "Cetirizine", "name": "Cetirizine 10 mg", "pack": "strip of 10 tablets", "mrp": 6, "rate": 1.0, "chronic": False},
    {"code": "D171", "abbr": "AZI", "short": "Azithromycin", "name": "Azithromycin 500 mg", "pack": "strip of 3 tablets", "mrp": 28, "rate": 0.6, "chronic": False},
    {"code": "D186", "abbr": "AMC", "short": "Amoxyclav", "name": "Amoxicillin + Clavulanate 625 mg", "pack": "strip of 6 tablets", "mrp": 58, "rate": 0.5, "chronic": False},
    {"code": "D190", "abbr": "GLM", "short": "Glimepiride", "name": "Glimepiride 2 mg", "pack": "strip of 10 tablets", "mrp": 11, "rate": 1.0, "chronic": True},
]

KENDRA = {k["id"]: k for k in KENDRAS}
DRUG = {d["code"]: d for d in DRUGS}


def day(offset: int) -> str:
    """ISO date `offset` days from TODAY."""
    return (TODAY + timedelta(days=offset)).isoformat()


def add_days(iso: str, n: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


def _build_batches() -> list[dict]:
    """Two batches per medicine: an older lot A in use and a newer lot B delivered mid-period."""
    batches = []
    for i, d in enumerate(DRUGS):
        letter = "ABCDEFGHJK"[i]
        mfg_b = day(-70 + i * 3)
        batches.append({"id": f"{d['abbr']}25{letter}{11 + i * 7}", "drug": d["code"], "lot": "A", "expiry": day(230 + i * 21)})
        batches.append({"id": f"{d['abbr']}26{letter}{12 + i * 7}", "drug": d["code"], "lot": "B", "mfg": mfg_b, "expiry": add_days(mfg_b, 730)})
    overrides = {"CET": -14, "ATV": 48, "GLM": 75}  # lot A expiry, days from TODAY
    for b in batches:
        abbr = DRUG[b["drug"]]["abbr"]
        if b["lot"] == "A" and abbr in overrides:
            b["expiry"] = day(overrides[abbr])
        b.setdefault("mfg", add_days(b["expiry"], -730))
    return batches


BATCHES = _build_batches()
BATCH = {b["id"]: b for b in BATCHES}


def batch_of(abbr: str, lot: str) -> dict:
    return next(b for b in BATCHES if b["lot"] == lot and DRUG[b["drug"]]["abbr"] == abbr)


def batches_of(code: str) -> list[dict]:
    return [b for b in BATCHES if b["drug"] == code]


def as_json() -> dict:
    return {
        "today": TODAY.isoformat(), "district": DISTRICT, "warehouse": WAREHOUSE, "officer": OFFICER,
        "kendras": KENDRAS, "drugs": DRUGS, "batches": BATCHES,
    }
