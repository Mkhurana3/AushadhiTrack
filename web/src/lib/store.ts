import { useSyncExternalStore } from 'react';
import seedText from '../data/ledger.json?raw';
import { derive, type Db } from './derive';
import { fmtDate, timeNow } from './format';
import { Ledger, blockHash } from './ledger';
import { OFFICER, TODAY, addDays, batchesOf } from './master';
import { DEFAULT_RULES, evaluate, type Evaluation, type RuleConfig } from './rules';
import type { ChainCheck, DataOf, EventType, LedgerEvent } from './types';

const STORAGE_KEY = 'aushadhitrack.v4.events';
const SEED = JSON.parse(seedText) as LedgerEvent[];

export interface Tamper { seq: number; original: string; story: string }
export interface AppState {
  db: Db; ev: Evaluation; chain: ChainCheck; cfg: RuleConfig; tamper: Tamper | null;
  lastCheck: string | null; seedCount: number; added: number; events: LedgerEvent[];
}

class AppStore {
  private ledger = new Ledger(SEED.map(e => ({ ...e, data: structuredClone(e.data) }) as LedgerEvent));
  private cfg: RuleConfig = { ...DEFAULT_RULES };
  private tamperState: Tamper | null = null;
  private lastCheck: string | null = null;
  private listeners = new Set<() => void>();
  private state!: AppState;

  constructor() {
    this.restore();
    this.recompute();
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getState = () => this.state;

  /** Replays actions saved in this browser, keeping only records that chain correctly onto the seed. */
  private restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as LedgerEvent[];
      for (const e of saved) {
        if (e.seq !== this.ledger.events.length + 1 || e.prev !== this.ledger.head || blockHash(e.prev, e) !== e.hash) break;
        this.ledger.events.push(e);
      }
    } catch { /* storage unavailable or corrupt: start from the seed */ }
  }
  private persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.ledger.events.slice(SEED.length))); } catch { /* ignore */ }
  }
  private recompute() {
    const db = derive(this.ledger.events);
    this.state = {
      db, ev: evaluate(db, this.cfg), chain: this.ledger.verify(), cfg: this.cfg, tamper: this.tamperState,
      lastCheck: this.lastCheck, seedCount: SEED.length, added: this.ledger.events.length - SEED.length, events: this.ledger.events,
    };
    this.listeners.forEach(fn => fn());
  }

  append<T extends EventType>(type: T, actor: string, data: DataOf<T>) {
    this.ledger.append(`${TODAY} ${timeNow()}`, type, actor, data);
    this.persist();
    this.recompute();
  }
  setRule(key: keyof RuleConfig, value: number) { this.cfg = { ...this.cfg, [key]: value }; this.recompute(); }
  resetRules() { this.cfg = { ...DEFAULT_RULES }; this.recompute(); }
  checkChain() { this.lastCheck = timeNow(); this.recompute(); }

  /** Demo: quietly add a 9-strip bill to an old day close at Loni, which hides the missing stock. */
  tamper() {
    if (this.tamperState) return;
    const before = this.state.ev.findings.find(f => f.id === 'C-04186');
    const target = this.ledger.events.find(e => e.type === 'dayclose' && e.data.kendra === 'GZB04' && e.data.date === addDays(TODAY, -5));
    if (!target || target.type !== 'dayclose') return;
    const original = JSON.stringify(target.data);
    const amcB = batchesOf('D186').find(b => b.lot === 'B')!.id;
    target.data.bills.push(['GZB04-009999', '20:51', '9999999999', amcB, 9, 58]);
    const after = evaluate(derive(this.ledger.events), this.cfg).findings.find(f => f.id === 'C-04186');
    this.tamperState = { seq: target.seq, original, story:
      `The edit slipped a 9-strip Amoxyclav bill into Loni’s day close for ${fmtDate(target.data.date)}, so the books now agree with Loni’s short stock count. ` +
      `Case C-04186 has dropped from ${before ? before.risk.toLowerCase() : 'flagged'} to ${after ? after.risk.toLowerCase() : 'no'} risk and the missing strips have vanished from the case. A database without the hash chain would show nothing wrong.` };
    this.lastCheck = timeNow();
    this.recompute();
  }
  untamper() {
    if (!this.tamperState) return;
    const e = this.ledger.events[this.tamperState.seq - 1];
    (e as { data: unknown }).data = JSON.parse(this.tamperState.original);
    this.tamperState = null;
    this.recompute();
  }

  /** Clears everything done in this browser and goes back to the seeded history. */
  resetDemo() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    this.ledger.events.splice(SEED.length);
    if (this.tamperState) this.untamper();
    this.cfg = { ...DEFAULT_RULES };
    this.recompute();
  }
}

export const store = new AppStore();
export const useApp = () => useSyncExternalStore(store.subscribe, store.getState);
export const officerActor = OFFICER;
