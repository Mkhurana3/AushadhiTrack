"""The hash-chained ledger.

Each record stores SHA-256(previous hash + newline + canonical JSON of [seq, at, type, actor, data]).
The web app recomputes exactly the same hashes in TypeScript, so the two must agree byte for byte:
canonical JSON here means no spaces and no ASCII escaping, which is what JSON.stringify produces.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

GENESIS = "0" * 64


def canonical(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def block_hash(prev: str, e: dict) -> str:
    body = prev + "\n" + canonical([e["seq"], e["at"], e["type"], e["actor"], e["data"]])
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


@dataclass
class Ledger:
    events: list[dict] = field(default_factory=list)

    @property
    def head(self) -> str:
        return self.events[-1]["hash"] if self.events else GENESIS

    def append(self, at: str, type_: str, actor: str, data: dict) -> dict:
        e = {"seq": len(self.events) + 1, "at": at, "type": type_, "actor": actor, "data": data, "prev": self.head}
        e["hash"] = block_hash(e["prev"], e)
        self.events.append(e)
        return e

    def verify(self) -> dict:
        prev = GENESIS
        for e in self.events:
            if e["prev"] != prev:
                return {"ok": False, "seq": e["seq"], "why": "link"}
            if block_hash(e["prev"], e) != e["hash"]:
                return {"ok": False, "seq": e["seq"], "why": "content"}
            prev = e["hash"]
        return {"ok": True, "count": len(self.events), "head": prev}
