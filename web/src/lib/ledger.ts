import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { ChainCheck, DataOf, EventType, LedgerEvent } from './types';

export const GENESIS = '0'.repeat(64);

/** SHA-256 of the previous hash, a newline and the canonical JSON of the record. Must match ml/aushadhi_ml/ledger.py. */
export function blockHash(prev: string, e: Pick<LedgerEvent, 'seq' | 'at' | 'type' | 'actor' | 'data'>): string {
  return bytesToHex(sha256(utf8ToBytes(prev + '\n' + JSON.stringify([e.seq, e.at, e.type, e.actor, e.data]))));
}

export class Ledger {
  readonly events: LedgerEvent[];
  constructor(events: LedgerEvent[] = []) { this.events = events; }

  get head(): string { return this.events.length ? this.events[this.events.length - 1].hash : GENESIS; }

  append<T extends EventType>(at: string, type: T, actor: string, data: DataOf<T>): LedgerEvent {
    const e = { seq: this.events.length + 1, at, type, actor, data, prev: this.head, hash: '' } as LedgerEvent;
    e.hash = blockHash(e.prev, e);
    this.events.push(e);
    return e;
  }

  verify(): ChainCheck {
    const t0 = performance.now();
    let prev = GENESIS;
    for (const e of this.events) {
      if (e.prev !== prev) return { ok: false, seq: e.seq, why: 'link' };
      if (blockHash(e.prev, e) !== e.hash) return { ok: false, seq: e.seq, why: 'content' };
      prev = e.hash;
    }
    return { ok: true, count: this.events.length, head: prev, ms: Math.round(performance.now() - t0) };
  }
}
