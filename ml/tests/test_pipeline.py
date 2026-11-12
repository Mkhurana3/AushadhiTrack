import copy

import pytest

from aushadhi_ml.features import feature_table
from aushadhi_ml.ledger import GENESIS, Ledger, block_hash
from aushadhi_ml.model import train
from aushadhi_ml.simulate import simulate

# The web app's TypeScript test checks the same event and expects the same hash.
GOLDEN_EVENT = {"seq": 1, "at": "2026-11-12 10:00", "type": "sale", "actor": "Kendra GZB01",
                "data": {"kendra": "GZB01", "note": "₹12 जन औषधि \"quoted\"", "items": [["PCM25A11", 2]]}}
GOLDEN_HASH = "ef27674cf765c76fb8b3057e0b36cabc785097797679f75099cdac5538f02755"


@pytest.fixture(scope="module")
def ledger() -> Ledger:
    return simulate()


@pytest.fixture(scope="module")
def model(ledger):
    return train(feature_table(ledger.events))


def test_golden_hash_matches_typescript():
    assert block_hash(GENESIS, GOLDEN_EVENT) == GOLDEN_HASH


def test_simulation_is_deterministic(ledger):
    assert simulate().head == ledger.head


def test_chain_verifies(ledger):
    assert ledger.verify()["ok"]


def test_editing_an_old_record_breaks_the_chain(ledger):
    led = Ledger(copy.deepcopy(ledger.events))
    target = next(e for e in led.events if e["type"] == "dayclose" and e["data"]["kendra"] == "GZB04")
    target["data"]["bills"][0][4] += 9
    result = led.verify()
    assert result == {"ok": False, "seq": target["seq"], "why": "content"}


def test_model_finds_phantom_billing(model):
    row = next(r for r in model["rows"] if r["id"] == "M-03104")
    assert row["flagged"]
    assert row["unusual"][0]["key"] == "late_share"


def test_model_flags_few_rows(model):
    flagged = [r for r in model["rows"] if r["flagged"]]
    assert 3 <= len(flagged) <= 8
    assert model["rows"][0]["score"] >= model["rows"][-1]["score"]
