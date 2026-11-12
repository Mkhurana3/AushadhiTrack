export interface Kendra { id: string; name: string; size: number }
export interface Drug { code: string; abbr: string; short: string; name: string; pack: string; mrp: number; rate: number; chronic: boolean }
export interface Batch { id: string; drug: string; lot: 'A' | 'B'; mfg: string; expiry: string }

/** [batch id, strips] */
export type Item = [string, number];
/** [bill no, time, mobile, batch id, strips, price per strip] */
export type BillRow = [string, string, string, string, number, number];
/** [batch id, strips, reason] */
export type WriteOff = [string, number, string];

export type CaseStatus = 'Open' | 'In inquiry' | 'Closed';
export type Risk = 'High' | 'Medium' | 'Low';

export interface Complaint {
  ref: string; reason: string; reasonText: string; details: string; phone: string;
  kind: 'bill' | 'batch'; code: string; kendra: string | null; drug: string | null; excess: number;
}

interface Base<T extends string, D> { seq: number; at: string; type: T; actor: string; data: D; prev: string; hash: string }

export type LedgerEvent =
  | Base<'dispatch', { challan: string; to: string; items: Item[] }>
  | Base<'receipt', { kendra: string; challan: string; items: Item[] }>
  | Base<'dayclose', { kendra: string; date: string; bills: BillRow[]; written: WriteOff[] }>
  | Base<'sale', { kendra: string; bill: BillRow }>
  | Base<'count', { kendra: string; items: Item[] }>
  | Base<'recall', { batch: string; reason: string; ref: string }>
  | Base<'ack', { kendra: string; batch: string }>
  | Base<'case', { case: string; status: CaseStatus; note: string }>
  | Base<'complaint', Complaint>
  | Base<'transfer-request', { id: string; from: string; to: string; batch: string; qty: number }>
  | Base<'transfer', { request: string; from: string; to: string; batch: string; qty: number }>;

export type EventType = LedgerEvent['type'];
export type DataOf<T extends EventType> = Extract<LedgerEvent, { type: T }>['data'];

export interface Sale {
  bill: string; time: string; phone: string; batch: string; drug: string; kendra: string;
  qty: number; price: number; date: string; at: string; seq: number; expired: boolean; recalled: boolean;
}

export type ChainCheck = { ok: true; count: number; head: string; ms: number } | { ok: false; seq: number; why: 'link' | 'content' };
