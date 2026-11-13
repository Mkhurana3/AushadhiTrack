import { caseStatus, kb, type CountSnapshot, type Db, type Recall } from './derive';
import { fmtDate, mask } from './format';
import { BATCH, BATCHES, DRUG, DRUGS, KENDRA, KENDRAS, TODAY, batchesOf, caseIdFor, daysBetween } from './master';
import modelData from '../data/model.json';
import type { Batch, CaseStatus, Complaint, Drug, Kendra, Risk, Sale } from './types';

export interface RuleConfig { writeoffPct: number; bulkStrips: number; expiryWindow: number }
export const DEFAULT_RULES: RuleConfig = { writeoffPct: 15, bulkStrips: 12, expiryWindow: 90 };

export type RuleKey = 'balance' | 'recalled' | 'transit' | 'expired' | 'overcharge' | 'bulk' | 'writeoff';
export const RULES: { key: RuleKey; name: string; weight: string; checks: string; setting?: keyof RuleConfig; unit?: string }[] = [
  { key: 'balance', name: 'Stock count mismatch', weight: '3', checks: 'Physical stock count against what the ledger says should be on the shelf.' },
  { key: 'recalled', name: 'Recalled batch billed', weight: '3', checks: 'Bills for a batch after its recall was recorded.' },
  { key: 'transit', name: 'Short delivery', weight: '2', checks: 'Strips dispatched by the warehouse against strips the kendra acknowledged.' },
  { key: 'expired', name: 'Expired batch billed', weight: '2', checks: 'Bills dated after the batch expiry date.' },
  { key: 'overcharge', name: 'Billed above MRP', weight: '2', checks: 'Price per strip on each bill against the MRP.' },
  { key: 'bulk', name: 'Bulk buying', weight: '2', checks: 'One mobile number buying more of one medicine in 30 days than a person would need.', setting: 'bulkStrips', unit: 'strips in 30 days' },
  { key: 'writeoff', name: 'High write-offs', weight: '1, or 2 above double', checks: 'Strips written off as a share of strips received.', setting: 'writeoffPct', unit: '% of received' },
];

export interface Hit { rule: RuleKey; weight: number; title: string; text: string; bills?: Sale[] }
export interface Snapshot { received: number; sold: number; written: number; tin: number; tout: number; expected: number; counted: number; date: string | null }

export interface ModelLead {
  id: string; kendra: string; drug: string; score: number; flagged: boolean; units: number; bills: number;
  unusual: { key: string; label: string; unit: string; value: number; peers: number; z: number }[];
  features: Record<string, number>;
}
export const MODEL = modelData as unknown as { meta: { algorithm: string; library: string; n_estimators: number; contamination: number; threshold: number; rows: number; explain_z: number; trained_on: { from: string; to: string; head: string }; features: { key: string; label: string; unit: string; help: string }[] }; rows: ModelLead[] };
const MODEL_BY_PAIR = Object.fromEntries(MODEL.rows.map(r => [r.kendra + '|' + r.drug, r]));
export const modelFor = (kendra: string, drug: string): ModelLead | undefined => MODEL_BY_PAIR[kendra + '|' + drug];

interface FindingBase { id: string; risk: Risk; score: number; value: number; status: CaseStatus; kendra: Kendra | null; drug: Drug | null; hits: Hit[] }
export interface RuleFinding extends FindingBase { kind: 'rule'; kendra: Kendra; drug: Drug; snap: Snapshot; lines: Sale[]; model?: ModelLead }
export interface ModelFinding extends FindingBase { kind: 'model'; kendra: Kendra; drug: Drug; lead: ModelLead; lines: Sale[] }
export interface ReportFinding extends FindingBase { kind: 'report'; complaint: Complaint & { at: string; seq: number } }
export type Finding = RuleFinding | ModelFinding | ReportFinding;

export interface Advisory {
  id: string; type: 'expired' | 'expiring'; kendra: Kendra; batch: Batch; drug: Drug; onHand: number; left: number;
  rate: number; willSell: number; unsold: number; to: { kendra: Kendra; rate: number; room: number } | null; move: number;
  request?: Db['transferRequests'][number]; done?: Db['transfersDone'][string];
}
export interface RecallSummary extends Recall {
  drug: Drug; stillHeld: number; soldAfter: number;
  rows: { kendra: Kendra; received: number; onHand: number; soldAfter: number; ack: string | null }[];
}
export interface Evaluation { findings: Finding[]; advisories: Advisory[]; recalls: RecallSummary[] }

const riskOf = (score: number): Risk => (score >= 3 ? 'High' : score === 2 ? 'Medium' : 'Low');
const sumQty = (xs: Sale[]) => xs.reduce((s, x) => s + x.qty, 0);

export function evaluate(db: Db, cfg: RuleConfig = DEFAULT_RULES): Evaluation {
  const salesBy: Record<string, Sale[]> = {};
  db.sales.forEach(s => { (salesBy[s.kendra + '|' + s.drug] ??= []).push(s); });
  const findings: Finding[] = [];

  for (const k of KENDRAS) {
    for (const d of DRUGS) {
      const bs = batchesOf(d.code);
      const sum = (o: Record<string, number>) => bs.reduce((s, b) => s + (o[kb(k.id, b.id)] ?? 0), 0);
      const dispatched = sum(db.dispatchedReceived), received = sum(db.received), written = sum(db.written);
      const lines = salesBy[k.id + '|' + d.code] ?? [];
      const hits: Hit[] = [];
      let value = 0;

      const short = dispatched - received;
      if (short > 0) {
        const challans = db.receipts.filter(r => r.kendra === k.id && r.items.some(([b, q]) => BATCH[b].drug === d.code &&
          q < (db.dispatches.find(x => x.challan === r.challan)?.items.find(i => i[0] === b)?.[1] ?? 0))).map(r => r.challan);
        hits.push({ rule: 'transit', weight: 2, title: 'Short delivery',
          text: `The warehouse dispatched ${dispatched} strips but the kendra acknowledged ${received}${challans.length ? ` (challan ${challans.join(', ')})` : ''}. ${short} strips went missing in transit.` });
        value += short * d.mrp;
      }

      const snap: Snapshot = { received: 0, sold: 0, written: 0, tin: 0, tout: 0, expected: 0, counted: 0, date: null };
      bs.forEach(b => {
        const c: CountSnapshot | undefined = db.counts[kb(k.id, b.id)];
        if (!c) return;
        snap.received += c.received; snap.sold += c.sold; snap.written += c.written; snap.tin += c.tin; snap.tout += c.tout;
        snap.expected += c.expected; snap.counted += c.counted;
        if (!snap.date || c.date > snap.date) snap.date = c.date;
      });
      const missing = snap.expected - snap.counted;
      if (snap.date && missing !== 0) {
        hits.push({ rule: 'balance', weight: 3, title: 'Stock count mismatch',
          text: missing > 0
            ? `The ledger says ${snap.expected} strips should have been on the shelf at the count on ${fmtDate(snap.date)}. The kendra counted ${snap.counted}, so ${missing} strips are missing.`
            : `The kendra counted ${snap.counted} strips but the ledger expects ${snap.expected}. ${-missing} extra strips usually means sales were not billed.` });
        value += Math.max(missing, 0) * d.mrp;
      }

      const rec = lines.filter(s => s.recalled);
      if (rec.length) hits.push({ rule: 'recalled', weight: 3, title: 'Recalled batch billed', bills: rec,
        text: `${sumQty(rec)} strips of recalled batch ${rec[0].batch} were billed on ${rec.length} bills after the recall on ${fmtDate(db.recalls[rec[0].batch].date)}.` });
      const exp = lines.filter(s => s.expired);
      if (exp.length) hits.push({ rule: 'expired', weight: 2, title: 'Expired batch billed', bills: exp,
        text: `${sumQty(exp)} strips of batch ${exp[0].batch} were billed on ${exp.length} bills after it expired on ${fmtDate(BATCH[exp[0].batch].expiry)}.` });
      const over = lines.filter(s => s.price > d.mrp);
      if (over.length) {
        const excess = over.reduce((s, x) => s + (x.price - d.mrp) * x.qty, 0);
        hits.push({ rule: 'overcharge', weight: 2, title: 'Billed above MRP', bills: over,
          text: `${over.length} bills charged more than the MRP of ₹${d.mrp} per strip. Customers paid ₹${excess} extra in total.` });
        value += excess;
      }

      const byPhone: Record<string, Sale[]> = {};
      lines.forEach(s => { (byPhone[s.phone] ??= []).push(s); });
      const buyers = Object.entries(byPhone).map(([phone, ls]) => {
        ls.sort((a, b) => a.date.localeCompare(b.date));
        let best = 0, j = 0, run = 0;
        for (let i = 0; i < ls.length; i++) {
          run += ls[i].qty;
          while (daysBetween(ls[j].date, ls[i].date) >= 30) run -= ls[j++].qty;
          best = Math.max(best, run);
        }
        return { phone, best, bills: ls };
      }).filter(b => b.best > cfg.bulkStrips).sort((a, b) => b.best - a.best);
      if (buyers.length) {
        const b0 = buyers[0];
        hits.push({ rule: 'bulk', weight: 2, title: 'Bulk buying', bills: buyers.flatMap(b => b.bills),
          text: `Customer ${mask(b0.phone)} bought ${b0.best} strips within 30 days, across ${b0.bills.length} bills. The limit is ${cfg.bulkStrips}.${buyers.length > 1 ? ` ${buyers.length - 1} more customers are over the limit.` : ''}` });
      }

      const pct = received ? (written / received) * 100 : 0;
      if (pct > cfg.writeoffPct) {
        const why: Record<string, number> = {};
        db.writeoffs.filter(w => w.kendra === k.id && BATCH[w.batch].drug === d.code).forEach(w => { why[w.why] = (why[w.why] ?? 0) + w.qty; });
        hits.push({ rule: 'writeoff', weight: pct > cfg.writeoffPct * 2 ? 2 : 1, title: 'High write-offs',
          text: `${written} of ${received} strips received were written off (${pct.toFixed(1)}%, limit ${cfg.writeoffPct}%): ${Object.entries(why).map(([w, q]) => `${q} ${w.toLowerCase()}`).join(', ')}.` });
      }

      const lead = modelFor(k.id, d.code);
      if (hits.length) {
        const score = hits.reduce((s, h) => s + h.weight, 0), id = caseIdFor(k.id, d.code);
        findings.push({ id, kind: 'rule', kendra: k, drug: d, hits, score, risk: riskOf(score), value, snap, lines,
          status: caseStatus(db, id), model: lead?.flagged ? lead : undefined });
      } else if (lead?.flagged) {
        findings.push({ id: lead.id, kind: 'model', kendra: k, drug: d, lead, lines, hits: [], score: 0, risk: 'Medium', value: 0,
          status: caseStatus(db, lead.id) });
      }
    }
  }
  const order: Record<Risk, number> = { High: 0, Medium: 1, Low: 2 };
  findings.sort((a, b) => order[a.risk] - order[b.risk] || (a.kind === 'model' ? 1 : 0) - (b.kind === 'model' ? 1 : 0) || b.score - a.score || b.value - a.value);

  db.complaints.forEach(c => findings.push({
    id: c.ref, kind: 'report', complaint: c, kendra: c.kendra ? KENDRA[c.kendra] : null, drug: c.drug ? DRUG[c.drug] : null,
    hits: [], score: 2, risk: 'Medium', value: c.excess, status: caseStatus(db, c.ref),
  }));

  return { findings, advisories: advisories(db, cfg, salesBy), recalls: recallSummary(db) };
}

function advisories(db: Db, cfg: RuleConfig, salesBy: Record<string, Sale[]>): Advisory[] {
  const out: Advisory[] = [];
  const rate = (k: string, code: string) => sumQty((salesBy[k + '|' + code] ?? []).filter(s => daysBetween(s.date, TODAY) <= 30)) / 30;
  for (const k of KENDRAS) {
    for (const b of BATCHES) {
      const onHand = db.onHand[kb(k.id, b.id)] ?? 0;
      if (onHand <= 0 || db.recalls[b.id]) continue;
      const left = daysBetween(TODAY, b.expiry), drug = DRUG[b.drug];
      const id = `T-${k.id.slice(3)}${b.id}`;
      const base = { id, kendra: k, batch: b, drug, onHand, left, rate: 0, willSell: 0, unsold: onHand, to: null, move: 0 };
      if (left < 0) { out.push({ ...base, type: 'expired' }); continue; }
      if (left > cfg.expiryWindow) continue;
      const r = rate(k.id, b.drug), willSell = Math.floor(r * left), unsold = onHand - willSell;
      if (unsold < 5) continue;
      const best = KENDRAS.filter(o => o.id !== k.id).map(o => ({
        kendra: o, rate: rate(o.id, b.drug), room: Math.floor(rate(o.id, b.drug) * left) - (db.onHand[kb(o.id, b.id)] ?? 0),
      })).sort((x, y) => y.room - x.room)[0];
      const move = best && best.room >= 5 ? Math.min(unsold, best.room) : 0;
      out.push({ ...base, type: 'expiring', rate: r, willSell, unsold, to: move ? best : null, move,
        request: db.transferRequests.find(t => t.id === id), done: db.transfersDone[id] });
    }
  }
  return out.sort((a, b) => (a.type === 'expired' ? -1 : 0) - (b.type === 'expired' ? -1 : 0) || a.left - b.left);
}

function recallSummary(db: Db): RecallSummary[] {
  return Object.values(db.recalls).map(r => {
    const rows = KENDRAS.map(k => {
      const after = db.sales.filter(s => s.kendra === k.id && s.batch === r.batch && s.recalled);
      return { kendra: k, received: db.received[kb(k.id, r.batch)] ?? 0, onHand: db.onHand[kb(k.id, r.batch)] ?? 0,
        soldAfter: sumQty(after), ack: db.acks[r.batch]?.[k.id] ?? null };
    }).filter(x => x.received > 0);
    return { ...r, drug: DRUG[BATCH[r.batch].drug], rows,
      stillHeld: rows.reduce((s, x) => s + Math.max(x.onHand, 0), 0), soldAfter: rows.reduce((s, x) => s + x.soldAfter, 0) };
  });
}
