import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HourChart, SalesChart } from '../../components/charts';
import { Back, PageHead, RiskTag, StatusTag, useTitle } from '../../components/ui';
import { fmtDate, fmtShort, inr, mask, num } from '../../lib/format';
import { BATCH, DRUG, START, TODAY, batchesOf, caseIdFor, kname } from '../../lib/master';
import { MODEL, type Finding, type ModelFinding, type ReportFinding, type RuleFinding } from '../../lib/rules';
import { officerActor, store, useApp } from '../../lib/store';
import { toast } from '../../lib/toast';
import type { CaseStatus, Sale } from '../../lib/types';
import { caseTitle, caseWhy } from './Layout';

const FILTERS: (CaseStatus | 'All')[] = ['Open', 'In inquiry', 'Closed', 'All'];

export function Cases() {
  const { ev } = useApp();
  const [filter, setFilter] = useState<CaseStatus | 'All'>('Open');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const rows = ev.findings
    .filter(f => filter === 'All' || f.status === filter)
    .filter(f => !q.trim() || [f.id, f.kendra?.name, f.drug?.name, caseWhy(f), caseTitle(f)].join(' ').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <PageHead title="Cases" sub="A case is one medicine at one kendra where a rule or the pattern model found something, or a report sent in by a patient." />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Show cases by status">
          {FILTERS.map(s => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}>
              {s} <span>{s === 'All' ? ev.findings.length : ev.findings.filter(f => f.status === s).length}</span>
            </button>
          ))}
        </div>
        <label className="search"><span className="sr">Search cases</span>
          <input type="search" placeholder="Search kendra, medicine or case number" value={q} onChange={e => setQ(e.target.value)} /></label>
      </div>
      <div className="table-wrap"><table className="data cases">
        <thead><tr><th>Case</th><th>Kendra</th><th>Medicine</th><th>What was found</th><th className="num">Money involved</th><th>Risk</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(f => (
            <tr key={f.id} className="clickable" onClick={e => { if (!(e.target as HTMLElement).closest('a')) navigate(`/officer/cases/${f.id}`); }}>
              <td className="nowrap"><Link to={`/officer/cases/${f.id}`}>{f.id}</Link></td>
              <td>{f.kendra ? <Link to={`/officer/kendras/${f.kendra.id}`}>{f.kendra.name}</Link> : 'Not given'}</td>
              <td>{f.drug?.name ?? 'Patient report'}</td>
              <td>{f.kind === 'report' ? f.complaint.reasonText : caseWhy(f)}</td>
              <td className="num">{f.value ? inr(f.value) : ''}</td>
              <td><RiskTag risk={f.risk} lead={f.kind === 'model'} /></td>
              <td><StatusTag status={f.status} /></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="empty-line">No cases match. Try another status or clear the search.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

export function CaseDetail() {
  const { id = '' } = useParams();
  const { ev } = useApp();
  const f = ev.findings.find(x => x.id === id);
  useTitle(f ? caseTitle(f) : `Case ${id}`);
  if (!f) {
    return (
      <>
        <Back to="/officer/cases">All cases</Back>
        <PageHead title={`Case ${id} has no findings now`} sub="Nothing flags this record any more. That happens when a limit is changed on the Rules page, or when the ledger has been altered." />
        <p><Link to="/officer/rules">Check the rules</Link> or <Link to="/officer/ledger">check the ledger</Link>.</p>
      </>
    );
  }
  return (
    <>
      <Back to="/officer/cases">All cases</Back>
      <div className="case-head">
        <div>
          <p className="case-ref">{f.kind === 'report'
            ? `Report ${f.complaint.ref}, received ${fmtDate(f.complaint.at)} at ${f.complaint.at.slice(11)}.`
            : `Case ${f.id}. ${f.kendra.name} kendra (${f.kendra.id}), ${f.drug.name}, ${f.drug.pack}, MRP ₹${f.drug.mrp}.`}</p>
          <h1>{caseTitle(f)}</h1>
        </div>
        <div className="case-tags">
          <RiskTag risk={f.risk} lead={f.kind === 'model'} /><StatusTag status={f.status} />
          <button className="btn small" type="button" onClick={() => window.print()}>Print case file</button>
        </div>
      </div>
      <p className="print-only">Case file printed {fmtDate(new Date().toISOString())} from AushadhiTrack. Synthetic data for SIH 2026 (SIH26198).</p>
      {f.kendra && <p className="case-links"><Link to={`/officer/kendras/${f.kendra.id}`}>Everything at {f.kendra.name}</Link>{f.kind !== 'report' && f.drug && <> <Link to={`/officer/batches/${batchesOf(f.drug.code)[0].id}`}>{f.drug.short} batches</Link></>}</p>}
      <div className="case-grid">
        <div className="case-main">
          {f.kind === 'rule' && <RuleBody f={f} />}
          {f.kind === 'model' && <ModelBody f={f} />}
          {f.kind === 'report' && <ReportBody f={f} />}
        </div>
        <aside className="case-side"><StatusPanel f={f} /><HistoryPanel f={f} /></aside>
      </div>
    </>
  );
}

function flaggedBills(f: RuleFinding) {
  const map = new Map<string, Sale & { why: string[] }>();
  f.hits.forEach(h => h.bills?.forEach(b => {
    const why = { recalled: 'Recalled batch', expired: 'Expired batch', overcharge: 'Above MRP', bulk: 'Bulk buyer' }[h.rule as 'recalled'] ?? h.title;
    const cur = map.get(b.bill) ?? { ...b, why: [] };
    if (!cur.why.includes(why)) cur.why.push(why);
    map.set(b.bill, cur);
  }));
  return [...map.values()].sort((a, b) => b.at.localeCompare(a.at) || b.bill.localeCompare(a.bill));
}

function markersFor(code: string, countDate: string | null, recalls: Record<string, { date: string }>): [string, string][] {
  const out: [string, string][] = [];
  batchesOf(code).forEach(b => {
    if (recalls[b.id]) out.push([recalls[b.id].date, `${b.id} recalled`]);
    if (b.expiry >= START && b.expiry <= TODAY) out.push([b.expiry, `${b.id} expired`]);
  });
  if (countDate) out.push([countDate, 'Stock count']);
  return out;
}

function RuleBody({ f }: { f: RuleFinding }) {
  const { db } = useApp();
  const bills = flaggedBills(f);
  const transit = f.hits.some(h => h.rule === 'transit');
  return (
    <>
      <section className="panel" aria-labelledby="rec-h"><h2 id="rec-h">Stock reconciliation</h2><Sheet f={f} transit={transit} /></section>
      <section className="panel" aria-labelledby="why-h"><h2 id="why-h">Why it was flagged</h2>
        <ul className="hits">{f.hits.map(h => (
          <li key={h.rule}><span className="weight" title="Weight">+{h.weight}</span><div><h3>{h.title}</h3><p>{h.text}</p></div></li>
        ))}</ul>
        <p className="score">Score {f.score}, so {f.risk.toLowerCase()} risk. A score of 3 or more is high, 2 is medium and 1 is low. <Link to="/officer/rules">How the rules work</Link></p>
        {f.model && <p className="callout model">The pattern model ranks this pair among the most unusual in the district too (score {f.model.score.toFixed(2)}). <Link to="/officer/model">See the model</Link></p>}
      </section>
      <section className="panel" aria-labelledby="sales-h"><h2 id="sales-h">Strips billed per day</h2>
        <SalesChart lines={f.lines} flagged={new Set(bills.map(b => b.bill))} markers={markersFor(f.drug.code, f.snap.date, db.recalls)} /></section>
      {bills.length > 0 && <BillsTable bills={bills} mrp={f.drug.mrp} file={`${f.id}-flagged-bills`} />}
    </>
  );
}

function Sheet({ f, transit }: { f: RuleFinding; transit: boolean }) {
  const { db } = useApp();
  const s = f.snap;
  if (!s.date) return <p>No stock count has been submitted for this medicine yet.</p>;
  const dispatched = batchesOf(f.drug.code).reduce((t, b) => t + (db.dispatchedReceived[`${f.kendra.id}|${b.id}`] ?? 0), 0);
  const rows: [string, string, boolean?][] = [];
  if (transit) { rows.push(['Dispatched by the warehouse', num(dispatched)]); rows.push(['Lost between warehouse and kendra', '− ' + num(dispatched - s.received), true]); }
  rows.push(['Received at the kendra', num(s.received)]);
  if (s.tin) rows.push(['Transferred in from other kendras', '+ ' + num(s.tin)]);
  rows.push(['Billed', '− ' + num(s.sold)]);
  rows.push(['Written off', '− ' + num(s.written), f.hits.some(h => h.rule === 'writeoff')]);
  if (s.tout) rows.push(['Transferred out', '− ' + num(s.tout)]);
  const diff = s.counted - s.expected;
  return (
    <>
      <table className="sheet"><tbody>
        {rows.map(([l, v, flag]) => <tr key={l} className={flag ? 'flag' : undefined}><th scope="row">{l}</th><td>{v}</td></tr>)}
        <tr className="subtotal"><th scope="row">Should be on the shelf</th><td>{num(s.expected)}</td></tr>
        <tr><th scope="row">Counted on {fmtDate(s.date)}</th><td>{num(s.counted)}</td></tr>
        <tr className={`net ${diff ? 'bad' : 'ok'}`}>
          <th scope="row">{diff < 0 ? 'Missing' : diff > 0 ? 'Extra on the shelf' : 'Difference'}</th>
          <td>{diff ? <>{num(Math.abs(diff))} strips{diff < 0 && <span>{inr(-diff * f.drug.mrp)} at MRP</span>}</> : 'None'}</td>
        </tr>
      </tbody></table>
      <p className="sheet-note">In strips, up to the stock count on {fmtDate(s.date)}. Bills after the count are not included.</p>
    </>
  );
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function BillsTable({ bills, mrp, title = 'Flagged bills', file }: { bills: (Sale & { why: string[] })[]; mrp: number; title?: string; file: string }) {
  const shown = bills.slice(0, 12);
  const download = () => downloadCsv(`${file}.csv`, [['Date', 'Time', 'Bill', 'Kendra', 'Customer (masked)', 'Batch', 'Strips', 'Price per strip', 'MRP', 'Flag'],
    ...bills.map(b => [b.date, b.time, b.bill, b.kendra, mask(b.phone), b.batch, b.qty, b.price, mrp, b.why.join('; ')])]);
  return (
    <section className="panel" aria-labelledby="ev-h">
      <div className="panel-head"><h2 id="ev-h">{title}</h2><button className="btn small no-print" type="button" onClick={download}>Download all {bills.length} as CSV</button></div>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Date</th><th>Time</th><th>Bill</th><th>Customer</th><th>Batch</th><th className="num">Strips</th><th className="num">Per strip</th><th>Flag</th></tr></thead>
        <tbody>{shown.map(b => (
          <tr key={b.bill}><td className="nowrap">{fmtShort(b.date)}</td><td>{b.time}</td><td className="nowrap">{b.bill}</td><td className="nowrap">{mask(b.phone)}</td><td>{b.batch}</td>
            <td className="num">{b.qty}</td><td className={'num' + (b.price > mrp ? ' over' : '')}>₹{b.price}</td><td>{b.why.join(', ')}</td></tr>
        ))}</tbody>
      </table></div>
      {bills.length > shown.length && <p className="sub">Showing the latest {shown.length} of {bills.length} bills.</p>}
    </section>
  );
}

const fmtFeature = (v: number, unit: string) => unit === '%' ? `${(v * 100).toFixed(1)}%` : unit === 'x' ? `${v.toFixed(1)}×` : v.toFixed(1);

function ModelBody({ f }: { f: ModelFinding }) {
  const { db } = useApp();
  const late = f.lines.filter(s => s.time >= '20:30');
  const visits = new Map<string, number>();
  db.sales.filter(s => s.kendra === f.kendra.id).forEach(s => visits.set(s.phone, (visits.get(s.phone) ?? 0) + 1));
  const lateBills = late.map(s => ({ ...s, why: [visits.get(s.phone) === 1 ? 'Late, number seen once' : 'Late'] })).sort((a, b) => b.at.localeCompare(a.at) || b.bill.localeCompare(a.bill));
  const peers = db.sales.filter(s => s.drug === f.drug.code && s.kendra !== f.kendra.id);
  return (
    <>
      <section className="panel" aria-labelledby="mod-h"><h2 id="mod-h">What the pattern model noticed</h2>
        <p className="sub">No rule fires here and the stock count matches. The model ranks this pair among the {MODEL.rows.filter(r => r.flagged).length} most unusual of {MODEL.rows.length} in the district (score {f.lead.score.toFixed(2)}, cut-off {MODEL.meta.threshold.toFixed(2)}). These are the measures furthest from the same medicine at other kendras:</p>
        <ul className="unusual">{f.lead.unusual.map(u => {
          const max = Math.max(u.value, u.peers) || 1;
          return (
            <li key={u.key}>
              <h3>{u.label}</h3>
              <div className="compare">
                <span className="c-label">{f.kendra.name}</span><span className="c-track"><span className="c-bar own" style={{ width: `${(u.value / max) * 100}%` }} /></span><span className="c-val">{fmtFeature(u.value, u.unit)}</span>
                <span className="c-label">Other kendras</span><span className="c-track"><span className="c-bar" style={{ width: `${(u.peers / max) * 100}%` }} /></span><span className="c-val">{fmtFeature(u.peers, u.unit)}</span>
              </div>
            </li>
          );
        })}</ul>
        <p className="callout model">A lead is a reason to look, not proof. Here the pattern fits phantom billing: stock leaves the kendra and is covered with bills to numbers that never come back. Ask for the counter CCTV for the evenings with late bills, and call a sample of the numbers.</p>
      </section>
      <section className="panel" aria-labelledby="hr-h"><h2 id="hr-h">When the bills are made</h2><HourChart own={f.lines} peers={peers} /></section>
      <section className="panel" aria-labelledby="sales-h"><h2 id="sales-h">Strips billed per day</h2>
        <SalesChart lines={f.lines} flagged={new Set(late.map(s => s.bill))} markers={[]} flagLabel="Billed after 20:30" /></section>
      {lateBills.length > 0 && <BillsTable bills={lateBills} mrp={f.drug.mrp} title="Bills after 20:30" file={`${f.id}-late-bills`} />}
      <FeedbackPanel id={f.id} />
    </>
  );
}

function FeedbackPanel({ id }: { id: string }) {
  const { db } = useApp();
  const fb = db.feedback[id];
  const [note, setNote] = useState('');
  const give = (label: 'useful' | 'false-alarm') => {
    store.append('feedback', officerActor, { lead: id, label, note: note.trim() });
    setNote('');
    toast(label === 'useful' ? 'Marked useful. It will count as a confirmed pattern at the next training run.' : 'Marked as a false alarm. The next training run will learn from it.');
  };
  return (
    <section className="panel no-print" aria-labelledby="fb-h"><h2 id="fb-h">Was this lead useful?</h2>
      <p className="sub">Your answer is saved in the ledger and becomes a label for the next training run, so the model learns which patterns matter in this district.</p>
      {fb && <p className={`callout ${fb.label === 'useful' ? 'ok' : 'bad'}`}>Marked {fb.label === 'useful' ? 'useful' : 'a false alarm'} by {fb.actor.split(',')[0]} on {fmtDate(fb.at)}{fb.note ? `: “${fb.note}”` : '.'} You can change the answer below.</p>}
      <label htmlFor="fb-note" className="sr">Note</label>
      <input id="fb-note" value={note} onChange={e => setNote(e.target.value)} placeholder="Optional: what did you find?" />
      <div className="actions fb-actions">
        <button className="btn" type="button" onClick={() => give('useful')}>Useful, worth checking</button>
        <button className="btn" type="button" onClick={() => give('false-alarm')}>False alarm</button>
      </div>
    </section>
  );
}

function ReportBody({ f }: { f: ReportFinding }) {
  const { db } = useApp();
  const c = f.complaint;
  const sale = c.kind === 'bill' ? db.sales.find(s => s.bill === c.code) : undefined;
  const b = c.kind === 'batch' ? BATCH[c.code] : sale ? BATCH[sale.batch] : undefined;
  return (
    <>
      <section className="panel"><h2>What the patient said</h2>
        <dl className="facts">
          <div><dt>Problem</dt><dd>{c.reasonText}</dd></div>
          <div><dt>{c.kind === 'bill' ? 'Bill number' : 'Batch number'}</dt><dd>{c.code || 'Not given'}</dd></div>
          <div><dt>Call back</dt><dd>{c.phone ? mask(c.phone) : 'Not requested'}</dd></div>
        </dl>
        {c.details && <blockquote>{c.details}</blockquote>}
      </section>
      <section className="panel"><h2>What the ledger shows</h2>
        {sale ? (
          <>
            <p>Bill {sale.bill} was recorded at {kname(sale.kendra)} on {fmtDate(sale.date)} at {sale.time}: {sale.qty} strips of {DRUG[sale.drug].name} from batch {sale.batch} at ₹{sale.price} a strip (MRP ₹{DRUG[sale.drug].mrp}).</p>
            {sale.price > DRUG[sale.drug].mrp && <p className="callout bad">The bill is above MRP by ₹{(sale.price - DRUG[sale.drug].mrp) * sale.qty}. <Link to={`/officer/cases/${caseIdFor(sale.kendra, sale.drug)}`}>Open the kendra’s case</Link></p>}
          </>
        ) : c.kind === 'bill' ? <p className="callout bad">No bill numbered {c.code} is in the ledger. The sale was never recorded, or the receipt is not genuine.</p>
          : b ? <p>Batch {b.id} is {DRUG[b.drug].name}, expiring {fmtDate(b.expiry)}{db.recalls[b.id] ? `, recalled on ${fmtDate(db.recalls[b.id].date)}` : ''}. <Link to={`/officer/batches/${b.id}`}>Trace the batch</Link></p>
            : <p className="callout bad">Batch {c.code} is not in the records. The strip may be counterfeit.</p>}
      </section>
    </>
  );
}

function StatusPanel({ f }: { f: Finding }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const status = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as CaseStatus;
    if (status === 'Closed' && !note.trim()) { setError('Add a note saying why the case is being closed.'); return; }
    store.append('case', officerActor, { case: f.id, status, note: note.trim() });
    setNote(''); setError('');
    toast({ 'In inquiry': 'Inquiry started.', Closed: 'Case closed.', Open: 'Case reopened.' }[status]);
  };
  return (
    <section className="panel" aria-labelledby="st-h"><h2 id="st-h">Status</h2>
      <p className="status-now"><StatusTag status={f.status} /></p>
      <form onSubmit={submit} noValidate className="case-form">
        <label htmlFor="case-note">Note for the record</label>
        <textarea id="case-note" rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="What did you check or decide?" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="actions">
          {f.status === 'Open' && <><button className="btn primary" value="In inquiry">Start inquiry</button><button className="btn" value="Closed">Close case</button></>}
          {f.status === 'In inquiry' && <><button className="btn primary" value="Closed">Close case</button><button className="btn" value="Open">Move back to open</button></>}
          {f.status === 'Closed' && <button className="btn" value="Open">Reopen case</button>}
        </div>
      </form>
    </section>
  );
}

function HistoryPanel({ f }: { f: Finding }) {
  const { db } = useApp();
  const ev = db.cases[f.id] ?? [];
  const first = f.kind === 'report' ? 'Report received from a patient' : f.kind === 'model' ? 'Flagged by the pattern model' : 'Flagged by the rules';
  return (
    <section className="panel" aria-labelledby="hist-h"><h2 id="hist-h">History</h2>
      <ol className="history">
        <li><span className="h-when">{f.kind === 'report' ? `${fmtDate(f.complaint.at)}, ${f.complaint.at.slice(11)}` : f.kind === 'model' ? `Model run on ${fmtDate(MODEL.meta.trained_on.to)}` : 'Automatic'}</span><span>{first}</span></li>
        {ev.map(e => (
          <li key={e.seq}><span className="h-when">{fmtDate(e.at)}, {e.at.slice(11)}</span><span><strong>{e.status}</strong> by {e.actor}</span>{e.note && <q>{e.note}</q>}</li>
        ))}
      </ol>
    </section>
  );
}
