import { BATCH } from './master';
import type { BillRow, CaseStatus, Complaint, Item, LedgerEvent, Sale } from './types';

type Counter = Record<string, number>;
export interface CountSnapshot { counted: number; expected: number; date: string; seq: number; received: number; sold: number; written: number; tin: number; tout: number }
export interface CaseEvent { status: CaseStatus; note: string; at: string; actor: string; seq: number }
export interface Recall { batch: string; reason: string; ref: string; date: string; seq: number }
export interface TransferRequest { id: string; from: string; to: string; batch: string; qty: number; at: string; seq: number }
export interface Dispatch { challan: string; to: string; items: Item[]; date: string; seq: number }
export interface Receipt { kendra: string; challan: string; items: Item[]; date: string; seq: number }

/** Everything the screens need, rebuilt from the ledger. Keys like "GZB01|PCM25A11" are kendra|batch. */
export interface Db {
  onHand: Counter; received: Counter; dispatched: Counter; sold: Counter; written: Counter; tin: Counter; tout: Counter;
  counts: Record<string, CountSnapshot>; lastCount: Record<string, string>;
  sales: Sale[]; writeoffs: { kendra: string; batch: string; qty: number; why: string; date: string }[];
  recalls: Record<string, Recall>; acks: Record<string, Record<string, string>>;
  cases: Record<string, CaseEvent[]>; complaints: (Complaint & { at: string; seq: number })[];
  transferRequests: TransferRequest[]; transfersDone: Record<string, { at: string; qty: number }>;
  dispatches: Dispatch[]; receipts: Receipt[];
}

export const kb = (kendra: string, batch: string) => `${kendra}|${batch}`;

export function derive(events: LedgerEvent[]): Db {
  const db: Db = {
    onHand: {}, received: {}, dispatched: {}, sold: {}, written: {}, tin: {}, tout: {},
    counts: {}, lastCount: {}, sales: [], writeoffs: [], recalls: {}, acks: {}, cases: {},
    complaints: [], transferRequests: [], transfersDone: {}, dispatches: [], receipts: [],
  };
  const add = (o: Counter, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };
  const sale = (e: LedgerEvent, kendra: string, date: string, [bill, time, phone, batch, qty, price]: BillRow) => {
    const b = BATCH[batch];
    if (!b) return;
    db.sales.push({ bill, time, phone, batch, qty, price, kendra, date, at: e.at, seq: e.seq, drug: b.drug,
      expired: date > b.expiry, recalled: Boolean(db.recalls[batch]) });
    add(db.sold, kb(kendra, batch), qty); add(db.onHand, kb(kendra, batch), -qty);
  };

  for (const e of events) {
    const date = e.at.slice(0, 10);
    switch (e.type) {
      case 'dispatch':
        e.data.items.forEach(([b, q]) => add(db.dispatched, kb(e.data.to, b), q));
        db.dispatches.push({ ...e.data, date, seq: e.seq });
        break;
      case 'receipt':
        e.data.items.forEach(([b, q]) => { add(db.received, kb(e.data.kendra, b), q); add(db.onHand, kb(e.data.kendra, b), q); });
        db.receipts.push({ ...e.data, date, seq: e.seq });
        break;
      case 'dayclose':
        e.data.bills.forEach(row => sale(e, e.data.kendra, e.data.date, row));
        e.data.written.forEach(([b, q, why]) => {
          add(db.written, kb(e.data.kendra, b), q); add(db.onHand, kb(e.data.kendra, b), -q);
          db.writeoffs.push({ kendra: e.data.kendra, batch: b, qty: q, why, date: e.data.date });
        });
        break;
      case 'sale':
        sale(e, e.data.kendra, date, e.data.bill);
        break;
      case 'count':
        e.data.items.forEach(([b, c]) => {
          const k = kb(e.data.kendra, b);
          db.counts[k] = { counted: c, expected: db.onHand[k] ?? 0, date, seq: e.seq,
            received: db.received[k] ?? 0, sold: db.sold[k] ?? 0, written: db.written[k] ?? 0, tin: db.tin[k] ?? 0, tout: db.tout[k] ?? 0 };
        });
        db.lastCount[e.data.kendra] = date;
        break;
      case 'recall': db.recalls[e.data.batch] = { ...e.data, date, seq: e.seq }; break;
      case 'ack': (db.acks[e.data.batch] ??= {})[e.data.kendra] = date; break;
      case 'case': (db.cases[e.data.case] ??= []).push({ ...e.data, at: e.at, actor: e.actor, seq: e.seq }); break;
      case 'complaint': db.complaints.push({ ...e.data, at: e.at, seq: e.seq }); break;
      case 'transfer-request': db.transferRequests.push({ ...e.data, at: e.at, seq: e.seq }); break;
      case 'transfer': {
        const d = e.data;
        add(db.onHand, kb(d.from, d.batch), -d.qty); add(db.tout, kb(d.from, d.batch), d.qty);
        add(db.onHand, kb(d.to, d.batch), d.qty); add(db.tin, kb(d.to, d.batch), d.qty);
        db.transfersDone[d.request] = { at: e.at, qty: d.qty };
        break;
      }
    }
  }
  return db;
}

export const caseStatus = (db: Db, id: string): CaseStatus => db.cases[id]?.at(-1)?.status ?? 'Open';
