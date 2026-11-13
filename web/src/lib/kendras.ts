import type { CountRecord, Db } from './derive';
import { KENDRAS, TODAY, daysBetween } from './master';
import type { Evaluation, Finding } from './rules';
import type { Kendra } from './types';

export interface KendraCard {
  kendra: Kendra; open: Finding[]; value: number; priority: number; reasons: string[];
  risk: { High: number; Medium: number; Low: number; lead: number };
  lastCount: CountRecord | null; accuracy: number | null;
  recallsPending: string[]; transfersPending: number; strips30: number; revenue30: number;
}

/** Points a finding adds to a kendra's visit priority: its rule score, or 2 for a model lead or patient report. */
export const findingPoints = (f: Finding) => (f.kind === 'rule' ? f.score : 2);

export function kendraCards(db: Db, ev: Evaluation): KendraCard[] {
  return KENDRAS.map(k => {
    const open = ev.findings.filter(f => f.status !== 'Closed' && f.kendra?.id === k.id);
    const recallsPending = ev.recalls.filter(r => r.rows.some(x => x.kendra.id === k.id && !x.ack)).map(r => r.batch);
    const transfersPending = db.transferRequests.filter(t => t.from === k.id && !db.transfersDone[t.id]).length;
    const history = db.countHistory[k.id] ?? [];
    const lastCount = history.at(-1) ?? null;
    const recent = db.sales.filter(s => s.kendra === k.id && daysBetween(s.date, TODAY) <= 30);
    const reasons = open.flatMap(f => f.kind === 'rule' ? f.hits.map(h => `${f.drug.short}: ${h.title.toLowerCase()}`)
      : f.kind === 'model' ? [`${f.drug.short}: pattern model lead`] : [`Patient report: ${f.complaint.reasonText.toLowerCase()}`]);
    recallsPending.forEach(b => reasons.push(`Recall of ${b} not noted`));
    if (transfersPending) reasons.push(`${transfersPending} transfer${transfersPending > 1 ? 's' : ''} not sent`);
    return {
      kendra: k, open, value: open.reduce((s, f) => s + f.value, 0), reasons,
      priority: open.reduce((s, f) => s + findingPoints(f), 0) + 2 * recallsPending.length + transfersPending,
      risk: {
        High: open.filter(f => f.kind !== 'model' && f.risk === 'High').length,
        Medium: open.filter(f => f.kind !== 'model' && f.risk === 'Medium').length,
        Low: open.filter(f => f.kind !== 'model' && f.risk === 'Low').length,
        lead: open.filter(f => f.kind === 'model').length,
      },
      lastCount, accuracy: lastCount && lastCount.expected ? 1 - lastCount.offBy / lastCount.expected : null,
      recallsPending, transfersPending,
      strips30: recent.reduce((s, x) => s + x.qty, 0), revenue30: recent.reduce((s, x) => s + x.qty * x.price, 0),
    };
  }).sort((a, b) => b.priority - a.priority || b.value - a.value);
}
