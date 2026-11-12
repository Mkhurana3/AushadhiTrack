import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Back, Dialog, PageHead, StatusTag, useTitle } from '../../components/ui';
import { kb } from '../../lib/derive';
import { fmtDate, fmtShort, num } from '../../lib/format';
import { BATCH, BATCHES, DRUG, KENDRAS, TODAY, WAREHOUSE, daysBetween, kname } from '../../lib/master';
import type { RecallSummary } from '../../lib/rules';
import { officerActor, store, useApp } from '../../lib/store';
import { toast } from '../../lib/toast';
import type { Batch } from '../../lib/types';

export function ExpiringStock() {
  const { ev, cfg } = useApp();
  const expired = ev.advisories.filter(a => a.type === 'expired');
  const exp = ev.advisories.filter(a => a.type === 'expiring');
  const request = (id: string) => {
    const a = ev.advisories.find(x => x.id === id);
    if (!a?.to) return;
    store.append('transfer-request', officerActor, { id, from: a.kendra.id, to: a.to.kendra.id, batch: a.batch.id, qty: a.move });
    toast(`Transfer requested. ${a.kendra.name} will see it under Notices.`);
  };
  return (
    <>
      <PageHead title="Expiring stock" sub={`Batches that will reach their expiry date before they sell at the kendra’s current rate, looking ${cfg.expiryWindow} days ahead. Moving them to a kendra that sells faster saves the stock.`} />
      {expired.length > 0 && (
        <section className="panel warn-panel"><h2>Expired but still on the books</h2>
          <p className="sub">Write these off and send them back with the next warehouse pickup.</p>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Kendra</th><th>Medicine</th><th>Batch</th><th>Expired on</th><th className="num">Strips</th></tr></thead>
            <tbody>{expired.map(a => (
              <tr key={a.id}><td>{a.kendra.name}</td><td>{a.drug.name}</td><td><Link to={`/officer/batches/${a.batch.id}`}>{a.batch.id}</Link></td><td>{fmtDate(a.batch.expiry)}</td><td className="num">{a.onHand}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
      <section className="panel"><h2>Likely to expire unsold</h2>
        {exp.length ? (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Kendra</th><th>Medicine and batch</th><th>Expires</th><th className="num">On hand</th><th className="num">Sells by then</th><th className="num">Left over</th><th>Suggested move</th><th /></tr></thead>
            <tbody>{exp.map(a => (
              <tr key={a.id}>
                <td>{a.kendra.name}</td>
                <td>{a.drug.name}<br /><Link className="small" to={`/officer/batches/${a.batch.id}`}>{a.batch.id}</Link></td>
                <td className="nowrap">{fmtDate(a.batch.expiry)}<br /><span className="small">in {a.left} days</span></td>
                <td className="num">{a.onHand}</td>
                <td className="num">{a.willSell}<br /><span className="small">{a.rate.toFixed(1)} a day</span></td>
                <td className="num strong">{a.unsold}</td>
                <td>{a.to ? <>{a.move} strips to {a.to.kendra.name}<br /><span className="small">sells {a.to.rate.toFixed(1)} a day</span></> : 'No kendra can use it in time'}</td>
                <td className="nowrap">{a.done ? <span className="done">Sent {fmtShort(a.done.at)}</span>
                  : a.request ? <span className="pending">Waiting for {a.kendra.name}</span>
                  : a.to ? <button className="btn small" type="button" onClick={() => request(a.id)}>Request transfer</button> : null}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="empty-line">Nothing is likely to expire unsold in the next {cfg.expiryWindow} days.</p>}
      </section>
    </>
  );
}

function batchStatus(b: Batch, recalled: boolean) {
  if (recalled) return <StatusTag status="Recalled" />;
  if (b.expiry < TODAY) return <StatusTag status="Expired" />;
  const left = daysBetween(TODAY, b.expiry);
  return left <= 90 ? <StatusTag status="Soon" label={`Expires in ${left} days`} /> : <StatusTag status="In use" />;
}

function RecallPanel({ r }: { r: RecallSummary }) {
  return (
    <section className="panel recall" aria-label={`Recall of batch ${r.batch}`}>
      <div className="panel-head"><h2>Recall: {r.drug.name}, batch <Link to={`/officer/batches/${r.batch}`}>{r.batch}</Link></h2><StatusTag status="Recalled" label={`Recalled ${fmtDate(r.date)}`} /></div>
      <p>{r.reason}. Reference: {r.ref}.</p>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Kendra</th><th className="num">Received</th><th className="num">Still held</th><th className="num">Billed after recall</th><th>Recall noted</th></tr></thead>
        <tbody>{r.rows.map(x => (
          <tr key={x.kendra.id} className={x.soldAfter ? 'row-bad' : undefined}>
            <td>{x.kendra.name}</td><td className="num">{x.received}</td><td className="num">{Math.max(x.onHand, 0)}</td><td className="num">{x.soldAfter || ''}</td>
            <td>{x.ack ? fmtDate(x.ack) : <span className="pending">Not yet</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

export function Batches() {
  const { db, ev } = useApp();
  const navigate = useNavigate();
  const rows = [...BATCHES].sort((a, b) => (db.recalls[b.id] ? 1 : 0) - (db.recalls[a.id] ? 1 : 0) || a.expiry.localeCompare(b.expiry));
  return (
    <>
      <PageHead title="Batches and recalls" sub="Every batch supplied to the district, where it went, and whether it can still be billed." />
      {ev.recalls.map(r => <RecallPanel key={r.batch} r={r} />)}
      <section className="panel"><h2>All batches</h2>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Batch</th><th>Medicine</th><th>Made</th><th>Expires</th><th className="num">Dispatched</th><th className="num">In kendras now</th><th>Status</th></tr></thead>
          <tbody>{rows.map(b => {
            const disp = KENDRAS.reduce((s, k) => s + (db.dispatched[kb(k.id, b.id)] ?? 0), 0);
            const held = KENDRAS.reduce((s, k) => s + Math.max(db.onHand[kb(k.id, b.id)] ?? 0, 0), 0);
            return (
              <tr key={b.id} className="clickable" onClick={e => { if (!(e.target as HTMLElement).closest('a')) navigate(`/officer/batches/${b.id}`); }}>
                <td><Link to={`/officer/batches/${b.id}`}>{b.id}</Link></td><td>{DRUG[b.drug].name}</td><td className="nowrap">{fmtDate(b.mfg)}</td><td className="nowrap">{fmtDate(b.expiry)}</td>
                <td className="num">{num(disp)}</td><td className="num">{num(held)}</td><td>{batchStatus(b, Boolean(db.recalls[b.id]))}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>
    </>
  );
}

export function BatchDetail() {
  const { id = '' } = useParams();
  const { db } = useApp();
  const [recalling, setRecalling] = useState(false);
  const b = BATCH[id];
  useTitle(`Batch ${id}`);
  if (!b) return <><Back to="/officer/batches">All batches</Back><PageHead title="Batch not found" sub={`There is no batch ${id} in the district records.`} /></>;
  const d = DRUG[b.drug], rc = db.recalls[id];
  const qOf = (items: [string, number][]) => items.find(i => i[0] === id)?.[1] ?? 0;
  const disp = db.dispatches.filter(x => qOf(x.items));
  const rec = db.receipts.filter(x => qOf(x.items));
  const sales = db.sales.filter(s => s.batch === id);
  const dispatched = disp.reduce((s, x) => s + qOf(x.items), 0), received = rec.reduce((s, x) => s + qOf(x.items), 0);
  const billed = sales.reduce((s, x) => s + x.qty, 0);
  const trail: [string, string][] = [[b.mfg, 'Made. Shelf life two years.']];
  if (disp.length) trail.push([disp[0].date, `Dispatched from ${WAREHOUSE}: ${num(dispatched)} strips to ${disp.length} kendras on ${disp.length} challans.`]);
  if (rec.length) trail.push([rec[0].date, `Received by ${rec.length} kendras: ${num(received)} strips${received < dispatched ? `, ${dispatched - received} fewer than dispatched` : ''}.`]);
  if (sales.length) trail.push([sales[0].date, `First bill. ${num(billed)} strips billed on ${num(sales.length)} bills so far; the latest on ${fmtDate(sales[sales.length - 1].date)}.`]);
  if (rc) {
    const after = sales.filter(s => s.recalled);
    const where = [...new Set(after.map(s => kname(s.kendra)))].join(', ');
    trail.push([rc.date, `Recalled. ${rc.reason}.${after.length ? ` Since then ${after.reduce((t, x) => t + x.qty, 0)} strips were still billed at ${where}.` : ''}`]);
  }
  trail.push([b.expiry, b.expiry < TODAY ? 'Expired.' : 'Expiry date.']);
  trail.sort((x, y) => x[0].localeCompare(y[0]));

  return (
    <>
      <Back to="/officer/batches">All batches</Back>
      <div className="case-head">
        <div><p className="case-ref">{d.name}, {d.pack}, MRP ₹{d.mrp}</p><h1>Batch {id}</h1></div>
        <div className="case-tags">{batchStatus(b, Boolean(rc))}{!rc && <button className="btn" type="button" onClick={() => setRecalling(true)}>Record a recall</button>}</div>
      </div>
      <div className="case-grid split">
        <section className="panel"><h2>Custody trail</h2>
          <ol className="trail">{trail.map(([dt, t]) => <li key={dt + t} className={dt > TODAY ? 'future' : undefined}><time dateTime={dt}>{fmtDate(dt)}</time><p>{t}</p></li>)}</ol>
        </section>
        <section className="panel"><h2>By kendra</h2>
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Kendra</th><th className="num">Received</th><th className="num">Billed</th><th className="num">Written off</th><th className="num">On the books</th></tr></thead>
            <tbody>{KENDRAS.filter(k => db.received[kb(k.id, id)] || db.tin[kb(k.id, id)]).map(k => {
              const key = kb(k.id, id);
              return <tr key={k.id}><td>{k.name}</td><td className="num">{(db.received[key] ?? 0) + (db.tin[key] ?? 0)}</td><td className="num">{db.sold[key] ?? 0}</td><td className="num">{db.written[key] ?? 0}</td><td className="num">{db.onHand[key] ?? 0}</td></tr>;
            })}</tbody>
          </table></div>
        </section>
      </div>
      <Dialog open={recalling} onClose={() => setRecalling(false)} label={`Record a recall for batch ${id}`}>
        <RecallForm batch={b} onDone={() => setRecalling(false)} />
      </Dialog>
    </>
  );
}

function RecallForm({ batch, onDone }: { batch: Batch; onDone: () => void }) {
  const [reason, setReason] = useState('Not of standard quality');
  const [ref, setRef] = useState('');
  const [error, setError] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ref.trim()) { setError('Enter the reference of the drug alert or recall order.'); return; }
    store.append('recall', officerActor, { batch: batch.id, reason, ref: ref.trim() });
    onDone();
    toast(`Recall recorded. No kendra can bill batch ${batch.id} now.`);
  };
  return (
    <form className="dialog-form" onSubmit={submit} noValidate>
      <h2>Record a recall for batch {batch.id}</h2>
      <p>{DRUG[batch.drug].name}. Every kendra holding this batch will be told to stop billing it, and the counter will block it straight away.</p>
      <label htmlFor="rc-reason">Reason</label>
      <select id="rc-reason" value={reason} onChange={e => setReason(e.target.value)}>
        <option>Not of standard quality</option><option>Spurious or falsely labelled</option><option>Packaging or labelling defect</option>
      </select>
      <label htmlFor="rc-ref">Alert reference</label>
      <input id="rc-ref" value={ref} onChange={e => setRef(e.target.value)} placeholder="For example, State drug alert, November 2026" autoFocus />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="btn" onClick={onDone}>Cancel</button><button className="btn danger">Record recall</button></div>
    </form>
  );
}
