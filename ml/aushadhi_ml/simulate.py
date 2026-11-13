"""Generates 60 days of synthetic history for the district and writes it into a ledger.

Scenarios the system should catch (everything else is ordinary noise):

Rules (deterministic checks in the web app)
  Loni / Amoxyclav               heavy write-offs, and 9 strips missing at the last stock count
  Kavi Nagar / Telmisartan       one customer buys 10 strips every few days, billed above MRP
  Vaishali / Azithromycin        keeps billing a recalled batch
  Muradnagar / Cetirizine        keeps billing a batch after it expired
  Raj Nagar Ext / Pantoprazole   a third of stock written off as water damage
  Modinagar / Metformin          some bills above MRP
  Crossings Republik / Paracetamol  one customer buys in bulk
  Crossings Republik / Amoxyclav    6 strips lost between warehouse and kendra
  Indirapuram / Glimepiride      write-offs slightly above the limit (already under inquiry)
  Modinagar / Atorvastatin, Raj Nagar Ext / Glimepiride  over-stocked batches near expiry

Model only (no rule fires; the books balance)
  Raj Nagar Ext / Paracetamol    phantom bills: for three weeks, a burst of 2-strip bills to
                                 never-seen mobile numbers in the last minutes before closing.
                                 The stock really left the kendra, so the count matches.
"""
from __future__ import annotations

import math
import random
from datetime import date

from .ledger import Ledger
from .master import (
    BATCHES, DRUGS, KENDRAS, OFFICER, TODAY, WAREHOUSE,
    add_days, batch_of, batches_of, day,
)

SEED = 20261112
START = day(-60)
LAST = day(-1)
DELIVERY_2 = day(-24)
RECALL_DATE = day(-10)
RECALLED_BATCH = batch_of("AZI", "A")["id"]
BULK_TEL = "9811402267"
BULK_PCM = "8800916534"


def _weekday(iso: str) -> int:
    return date.fromisoformat(iso).weekday()  # Monday 0 ... Sunday 6


def simulate() -> Ledger:
    rnd = random.Random(SEED)
    led = Ledger()
    stock: dict[tuple[str, str], int] = {}

    def poisson(lam: float) -> int:
        limit, k, p = math.exp(-lam), 0, 1.0
        while True:
            k += 1
            p *= rnd.random()
            if p <= limit:
                return k - 1

    def lam(k, d):
        return d["rate"] * k["size"]

    def phone() -> str:
        return str(6 + rnd.randrange(4)) + str(rnd.randrange(10**9)).zfill(9)

    phones = {k["id"]: [phone() for _ in range(420)] for k in KENDRAS}
    bill_no = {k["id"]: 4100 + i * 377 for i, k in enumerate(KENDRAS)}

    def next_bill(kid: str) -> str:
        bill_no[kid] += 1
        return f"{kid}-{bill_no[kid]:06d}"

    def qty_a(k, d) -> int:
        q = lam(k, d) * 44
        if d["abbr"] == "AZI":
            q = lam(k, d) * (95 if k["id"] == "GZB02" else 66)
        if (k["id"], d["abbr"]) == ("GZB05", "ATV"):
            q = lam(k, d) * 165
        if (k["id"], d["abbr"]) == ("GZB03", "GLM"):
            q = lam(k, d) * 170
        if (k["id"], d["abbr"]) == ("GZB06", "CET"):
            q = lam(k, d) * 80
        if (k["id"], d["abbr"]) == ("GZB04", "AMC"):
            return 60
        if (k["id"], d["abbr"]) == ("GZB07", "TEL"):
            q += 60
        if (k["id"], d["abbr"]) == ("GZB08", "PCM"):
            q += 20
        if (k["id"], d["abbr"]) == ("GZB03", "PCM"):
            q += 60
        return max(6, round(q * (0.92 + rnd.random() * 0.16)))

    def qty_b(k, d) -> int:
        q = lam(k, d) * 40
        if (k["id"], d["abbr"]) == ("GZB04", "AMC"):
            return 50
        if (k["id"], d["abbr"]) == ("GZB08", "AMC"):
            return 30
        if (k["id"], d["abbr"]) == ("GZB07", "TEL"):
            q += 40
        if (k["id"], d["abbr"]) == ("GZB03", "PCM"):
            q += 120
        return max(6, round(q * (0.92 + rnd.random() * 0.16)))

    challan = [41180]
    pending: dict[str, dict] = {}

    def dispatch_all(d_iso: str, lot: str) -> None:
        for i, k in enumerate(KENDRAS):
            items = [[batch_of(d["abbr"], lot)["id"], qty_a(k, d) if lot == "A" else qty_b(k, d)] for d in DRUGS]
            challan[0] += 1
            ch = f"DC/26/{challan[0]}"
            led.append(f"{d_iso} 15:{10 + i * 4:02d}", "dispatch", WAREHOUSE, {"challan": ch, "to": k["id"], "items": items})
            short_batch = batch_of("AMC", "B")["id"]
            received = [[b, q - 6 if (k["id"] == "GZB08" and b == short_batch) else q] for b, q in items]
            pending[k["id"]] = {"challan": ch, "items": received}

    def receive_all(d_iso: str) -> None:
        for i, k in enumerate(KENDRAS):
            p = pending[k["id"]]
            led.append(f"{d_iso} 10:{5 + i * 5:02d}", "receipt", f"Kendra {k['id']}", {"kendra": k["id"], "challan": p["challan"], "items": p["items"]})
            for b, q in p["items"]:
                stock[(k["id"], b)] = stock.get((k["id"], b), 0) + q

    bulk_tel_days = {day(-n) for n in (26, 23, 21, 18, 15, 12, 9, 6, 3)}
    bulk_pcm_days = {day(-n) for n in (28, 24, 20, 16, 12, 8, 4)}
    loss_amc_days = {day(-n) for n in (55, 49, 44, 38, 33, 27, 21, 16, 11, 5)}
    loss_glm_days = {day(-n) for n in (47, 31, 19, 8)}
    phantom_from = day(-21)
    recalled = False

    def bill_time() -> str:
        # Footfall peaks in the morning and early evening; the counter closes at 21:00.
        h = rnd.choices(range(9, 21), weights=[6, 9, 9, 7, 5, 5, 6, 7, 9, 10, 8, 4])[0]
        m = rnd.randrange(60 if h < 20 else 45)
        return f"{h:02d}:{m:02d}"

    dispatch_all(add_days(START, -2), "A")
    d_iso = START
    while d_iso <= LAST:
        if d_iso in (START, DELIVERY_2):
            receive_all(d_iso)
        if d_iso == add_days(DELIVERY_2, -2):
            dispatch_all(d_iso, "B")
        if d_iso == RECALL_DATE:
            led.append(f"{d_iso} 10:40", "recall", "PMBI quality cell", {
                "batch": RECALLED_BATCH, "reason": "Not of standard quality: failed the dissolution test",
                "ref": "State drug alert, October 2026 (synthetic)",
            })
            recalled = True
        if d_iso in (add_days(RECALL_DATE, 1), add_days(RECALL_DATE, 2)):
            first = d_iso == add_days(RECALL_DATE, 1)
            acking = [kid for i, kid in enumerate(["GZB01", "GZB03", "GZB04", "GZB05", "GZB06", "GZB07", "GZB08"]) if (i % 2 == 0) == first]
            for i, kid in enumerate(acking):
                led.append(f"{d_iso} 11:{10 + i * 7:02d}", "ack", f"Kendra {kid}", {"kendra": kid, "batch": RECALLED_BATCH})
        if d_iso == day(-3):
            led.append(f"{d_iso} 16:20", "case", OFFICER, {
                "case": "C-01190", "status": "In inquiry",
                "note": "Pharmacist says a roof leak in the store room damaged stock. Asked for photos and the damage register.",
            })

        sunday = _weekday(d_iso) == 6
        for ki, k in enumerate(KENDRAS):
            bills: list[list] = []
            written: list[list] = []

            def pick(d, ignore_expiry=False, ignore_recall=False):
                cands = [b for b in batches_of(d["code"])
                         if stock.get((k["id"], b["id"]), 0) > 0
                         and (ignore_expiry or b["expiry"] >= d_iso)
                         and (ignore_recall or not (recalled and b["id"] == RECALLED_BATCH))]
                return min(cands, key=lambda b: b["expiry"]) if cands else None

            def sell(d, qty, ph, price, t, **opts):
                b = pick(d, **opts)
                if not b:
                    return
                q = min(qty, stock[(k["id"], b["id"])])
                stock[(k["id"], b["id"])] -= q
                bills.append([None, t, ph, b["id"], q, price])

            def write_off(d, qty, why):
                while qty > 0:
                    b = pick(d, ignore_expiry=True, ignore_recall=True)
                    if not b:
                        return
                    q = min(qty, stock[(k["id"], b["id"])])
                    stock[(k["id"], b["id"])] -= q
                    qty -= q
                    written.append([b["id"], q, why])

            for d in DRUGS:
                opts = {
                    "ignore_expiry": (k["id"], d["abbr"]) == ("GZB06", "CET"),
                    "ignore_recall": (k["id"], d["abbr"]) == ("GZB02", "AZI"),
                }
                off = (ord(d["code"][3]) * 7) % 300
                regulars = phones[k["id"]][off: off + (90 if d["chronic"] else 400)]
                n = poisson(lam(k, d) * (0.55 if sunday else 1) / (1.6 if d["chronic"] else 1.15))
                for _ in range(n):
                    if d["chronic"]:
                        qty = 1 if rnd.random() < 0.55 else (2 if rnd.random() < 0.7 else 3)
                    else:
                        qty = 1 if rnd.random() < 0.85 else 2
                    price = d["mrp"]
                    if (k["id"], d["abbr"]) == ("GZB05", "MET") and d_iso >= day(-20) and rnd.random() < 0.3:
                        price = 17
                    sell(d, qty, rnd.choice(regulars), price, bill_time(), **opts)
                if (k["id"], d["abbr"]) == ("GZB07", "TEL") and d_iso in bulk_tel_days:
                    sell(d, 10, BULK_TEL, 18, f"{rnd.randrange(16, 19)}:{rnd.randrange(60):02d}", **opts)
                if (k["id"], d["abbr"]) == ("GZB08", "PCM") and d_iso in bulk_pcm_days:
                    sell(d, 5, BULK_PCM, d["mrp"], f"{rnd.randrange(10, 13)}:{rnd.randrange(60):02d}", **opts)
                if (k["id"], d["abbr"]) == ("GZB03", "PCM") and d_iso >= phantom_from and not sunday:
                    for _ in range(rnd.randrange(3, 6)):
                        sell(d, 2, phone(), d["mrp"], f"20:{rnd.randrange(38, 59):02d}", **opts)

                if rnd.random() < 0.008:
                    write_off(d, 1, "Damaged")
                if (k["id"], d["abbr"]) == ("GZB04", "AMC") and d_iso in loss_amc_days:
                    write_off(d, 2 if d_iso < DELIVERY_2 else 3, "Damaged")
                if (k["id"], d["abbr"]) == ("GZB01", "GLM") and d_iso in loss_glm_days:
                    write_off(d, 5, "Damaged")
                if (k["id"], d["abbr"]) == ("GZB03", "PAN") and d_iso == day(-18):
                    write_off(d, 38, "Water damage")

            # Batches reaching expiry are written off at day close, except where the scenario keeps selling them.
            for b in BATCHES:
                if b["expiry"] != d_iso:
                    continue
                if k["id"] == "GZB06" and b["id"] == batch_of("CET", "A")["id"]:
                    continue
                left = stock.get((k["id"], b["id"]), 0)
                if left > 0:
                    written.append([b["id"], left, "Expired"])
                    stock[(k["id"], b["id"])] = 0

            bills.sort(key=lambda r: r[1])
            for r in bills:
                r[0] = next_bill(k["id"])
            led.append(f"{d_iso} 21:{2 + ki * 3:02d}", "dayclose", f"Kendra {k['id']}", {"kendra": k["id"], "date": d_iso, "bills": bills, "written": written})

        # Weekly physical stock count, Wednesday evenings (LAST is a Wednesday).
        if (date.fromisoformat(LAST) - date.fromisoformat(d_iso)).days % 7 == 0:
            amc_b = batch_of("AMC", "B")["id"]
            for ki, k in enumerate(KENDRAS):
                items = []
                for b in BATCHES:
                    if (k["id"], b["id"]) not in stock:
                        continue
                    counted = stock[(k["id"], b["id"])]
                    if d_iso == LAST and k["id"] == "GZB04" and b["id"] == amc_b:
                        counted -= 9
                    items.append([b["id"], counted])
                led.append(f"{d_iso} 21:{35 + ki * 3:02d}", "count", f"Kendra {k['id']}", {"kendra": k["id"], "items": items})
        d_iso = add_days(d_iso, 1)

    assert TODAY.isoformat() == add_days(LAST, 1)
    return led
