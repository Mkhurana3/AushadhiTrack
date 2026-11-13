import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Dialog, HashMark, Mark, PageHead, QrCode, Shell, printDialog } from '../../components/ui';
import { inTransit, kb, type Db } from '../../lib/derive';
import { fmtDate, inr } from '../../lib/format';
import { BATCH, BATCHES, DRUG, DRUGS, KENDRA, KENDRAS, TODAY, batchesOf, daysBetween, kname } from '../../lib/master';
import { signReceipt, receiptPayload } from '../../lib/signing';
import { store, useApp } from '../../lib/store';
import { toast } from '../../lib/toast';
import type { Batch, Kendra, Sale } from '../../lib/types';

const useKendra = () => useOutletContext<Kendra>();

function kendraNotices(db: Db, recalls: ReturnType<typeof useApp>['ev']['recalls'], kid: string) {
  const recall = recalls.flatMap(r => {
    const row = r.rows.find(x => x.kendra.id === kid);
    return row ? [{ type: 'recall' as const, r, row, pending: !row.ack }] : [];
  });
  const send = db.transferRequests.filter(t => t.from === kid).map(t => ({ type: 'send' as const, t, pending: !db.transfersDone[t.id] }));
  const incoming = db.transferRequests.filter(t => t.to === kid).map(t => ({ type: 'incoming' as const, t, pending: false }));
  const deliveries = inTransit(db).filter(d => d.to === kid).map(d => ({ type: 'delivery' as const, d, pending: true }));
  return [...deliveries, ...recall, ...send, ...incoming];
}

export function KendraLayout() {
  const { kid = '' } = useParams();
  const { db, ev } = useApp();
  const navigate = useNavigate();
  const k = KENDRA[kid];
  if (!k) return <Navigate to="/" replace />;
  const pending = kendraNotices(db, ev.recalls, kid).filter(n => n.pending).length;
  const ctx = (
    <label className="ctx-switch">Kendra
      <select value={kid} onChange={e => navigate(`/kendra/${e.target.value}`)}>
        {KENDRAS.map(x => <option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}
      </select>
    </label>
  );
  return (
    <Shell ctx={ctx} who="Pharmacist on duty" role="Kendra pharmacist" nav={[
      { to: `/kendra/${kid}`, label: 'New bill', icon: 'bill', end: true },
      { to: `/kendra/${kid}/stock`, label: 'Stock', icon: 'batches' },
      { to: `/kendra/${kid}/notices`, label: 'Notices', icon: 'notices', count: pending, alert: true },
    ]}>
      <Outlet context={k} />
    </Shell>
  );
}

function batchState(db: Db, b: Batch): { ok: boolean; text: string } {
  if (db.recalls[b.id]) return { ok: false, text: `Recalled on ${fmtDate(db.recalls[b.id].date)}. Keep aside for return.` };
  if (b.expiry < TODAY) return { ok: false, text: `Expired on ${fmtDate(b.expiry)}.` };
  const left = daysBetween(TODAY, b.expiry);
  return { ok: true, text: `Expires ${fmtDate(b.expiry)}${left <= 90 ? `, in ${left} days` : ''}` };
}

export function Counter() {
  const k = useKendra();
  const { db, cfg } = useApp();
  const [code, setCode] = useState(DRUGS[0].code);
  const [chosen, setChosen] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState('1');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [consent, setConsent] = useState(false);
  const d = DRUG[code];
  const options = batchesOf(code).filter(b => (db.onHand[kb(k.id, b.id)] ?? 0) > 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const firstOk = options.find(b => batchState(db, b).ok);
  const batch = chosen && options.some(b => b.id === chosen && batchState(db, b).ok) ? chosen : firstOk?.id ?? null;
  const qty = Number(qtyText);
  const recent = /^\d{10}$/.test(phone)
    ? db.sales.filter(s => s.kendra === k.id && s.drug === code && s.phone === phone && daysBetween(s.date, TODAY) < 30).reduce((s, x) => s + x.qty, 0) : 0;
  const today = db.sales.filter(s => s.kendra === k.id && s.date === TODAY).reverse();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!batch) return setError('There is no batch of this medicine that can be billed.');
    if (!Number.isInteger(qty) || qty < 1) return setError('Enter the number of strips, 1 or more.');
    const onHand = db.onHand[kb(k.id, batch)] ?? 0;
    if (qty > onHand) return setError(`Only ${onHand} strips of batch ${batch} are on the books.`);
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.');
    if (!consent) return setError('Ask the customer before sending the bill by SMS, then tick the consent box.');
    const nums = db.sales.filter(s => s.kendra === k.id).map(s => Number(s.bill.split('-')[1]));
    const bill = `${k.id}-${String(Math.max(...nums) + 1).padStart(6, '0')}`;
    store.append('sale', `Kendra ${k.id}`, { kendra: k.id, bill: [bill, new Date().toTimeString().slice(0, 5), phone, batch, qty, d.mrp] });
    const sale = store.getState().db.sales.find(s => s.bill === bill) ?? null;
    setReceipt(sale); setError(''); setPhone(''); setQtyText('1'); setConsent(false);
  };

  return (
    <>
      <PageHead title="New bill" sub="Prices are fixed at MRP. Expired and recalled batches cannot be billed." />
      <div className="counter">
        <form className="panel" onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="bill-drug">Medicine</label>
            <select id="bill-drug" value={code} onChange={e => { setCode(e.target.value); setChosen(null); }}>
              {DRUGS.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select></div>
          <fieldset className="field"><legend>Batch</legend>
            {options.length ? options.map(b => {
              const st = batchState(db, b);
              return (
                <label key={b.id} className={'batch-opt' + (st.ok ? '' : ' blocked')}>
                  <input type="radio" name="batch" value={b.id} disabled={!st.ok} checked={b.id === batch} onChange={() => setChosen(b.id)} />
                  <span className="b-id">{b.id}</span><span className="b-st">{st.text}</span><span className="b-qty">{db.onHand[kb(k.id, b.id)]} strips</span>
                </label>
              );
            }) : <p className="empty-line">None in stock. Raise an indent with the warehouse.</p>}
            {options.length > 0 && <p className="hint">{firstOk ? 'The batch that expires first is selected.' : 'No batch of this medicine can be billed.'}</p>}
          </fieldset>
          <div className="field-row">
            <div className="field"><label htmlFor="bill-qty">Strips</label><input id="bill-qty" type="number" min={1} max={50} inputMode="numeric" value={qtyText} onChange={e => setQtyText(e.target.value)} /></div>
            <p className="price">₹{d.mrp} a strip ({d.pack})<strong>Total {inr(d.mrp * (Number.isFinite(qty) ? Math.max(qty, 0) : 0))}</strong></p>
          </div>
          <div className="field"><label htmlFor="bill-phone">Customer’s mobile number</label>
            <input id="bill-phone" inputMode="numeric" maxLength={10} autoComplete="off" placeholder="10 digits" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            <p className="hint">The bill is sent to this number. It is also used to spot unusually large purchases.</p>
            {recent + (qty || 0) > cfg.bulkStrips && (
              <p className="notice-inline">This number has bought {recent} strips of {d.short} here in the last 30 days. With this bill it reaches {recent + qty}, above the limit of {cfg.bulkStrips}, so the district office will be asked to review it.</p>
            )}
          </div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> The customer agreed to receive this bill by SMS.</label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary">Create bill</button>
        </form>
        <section className="panel" aria-labelledby="today-h"><h2 id="today-h">Bills today</h2>
          {today.length ? (
            <table className="data compact"><tbody>{today.map(s => (
              <tr key={s.bill}><td className="nowrap">{s.time}</td><td>{s.bill}<br /><span className="small">{s.qty} × {DRUG[s.drug].short}</span></td><td className="num">{inr(s.qty * s.price)}</td></tr>
            ))}</tbody></table>
          ) : <p className="empty-line">No bills yet today. Each bill you create is written to the ledger straight away.</p>}
        </section>
      </div>
      <Dialog open={Boolean(receipt)} onClose={() => setReceipt(null)} label={receipt ? `Bill ${receipt.bill}` : 'Bill'}>
        {receipt && <Receipt sale={receipt} onClose={() => setReceipt(null)} />}
      </Dialog>
    </>
  );
}

function Receipt({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const navigate = useNavigate();
  const record = useApp().events[sale.seq - 1];
  const d = DRUG[sale.drug], b = BATCH[sale.batch], k = KENDRA[sale.kendra];
  const fields = { bill: sale.bill, kendra: sale.kendra, batch: sale.batch, qty: sale.qty, price: sale.price, date: sale.date };
  const query = useMemo(() => `${receiptPayload(fields)}&s=${signReceipt(fields)}`, [sale.bill]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = `${location.href.split('#')[0]}#/verify?${query}`;
  return (
    <>
      <div className="receipt">
        <header><span className="brand"><Mark /><span>AushadhiTrack</span></span><p>{k.name} Janaushadhi Kendra, {k.id}</p></header>
        <dl>
          <div><dt>Bill</dt><dd>{sale.bill}</dd></div>
          <div><dt>Date</dt><dd>{fmtDate(sale.date)}, {sale.time}</dd></div>
          <div><dt>Medicine</dt><dd>{d.name}<br /><small>{d.pack}</small></dd></div>
          <div><dt>Batch</dt><dd>{b.id}<br /><small>Expires {fmtDate(b.expiry)}</small></dd></div>
          <div><dt>Strips</dt><dd>{sale.qty} × ₹{sale.price}</dd></div>
          <div className="total"><dt>Total</dt><dd>{inr(sale.qty * sale.price)}</dd></div>
        </dl>
        <div className="r-qr"><QrCode text={url} label="QR code that opens this bill’s check page" /><div><p>Scan to check that this bill is genuine and the price is right.</p><p className="r-sig"><HashMark className="hashmark inline" />Signed by {k.name}’s billing key. Ledger record {sale.seq}, hash <code>{record?.hash.slice(0, 12)}</code>.</p></div></div>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={printDialog}>Print</button>
        <button type="button" className="btn" onClick={() => { onClose(); navigate(`/verify?${query}`); }}>Open as patient</button>
        <button type="button" className="btn primary" onClick={onClose} autoFocus>Done</button>
      </div>
    </>
  );
}

export function KendraStock() {
  const k = useKendra();
  const { db } = useApp();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState('');
  const rows = BATCHES.filter(b => (db.received[kb(k.id, b.id)] || db.tin[kb(k.id, b.id)]) && (db.onHand[kb(k.id, b.id)] ?? 0) !== 0)
    .sort((a, b) => DRUGS.indexOf(DRUG[a.drug]) - DRUGS.indexOf(DRUG[b.drug]) || a.expiry.localeCompare(b.expiry));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const items = Object.entries(counts).filter(([, v]) => v !== '').map(([b, v]) => [b, Number(v)] as [string, number]);
    if (!items.length) return setError('Enter at least one counted figure.');
    if (items.some(([, v]) => !Number.isInteger(v) || v < 0)) return setError('Counts must be whole numbers, 0 or more.');
    const diffs = items.map(([b, v]) => [b, v - (db.onHand[kb(k.id, b)] ?? 0)] as const).filter(([, d]) => d !== 0);
    store.append('count', `Kendra ${k.id}`, { kendra: k.id, items });
    setCounts({}); setError('');
    setResult(diffs.length
      ? { ok: false, text: `${diffs.length} ${diffs.length === 1 ? 'batch differs' : 'batches differ'} from the ledger: ${diffs.map(([b, d]) => `${b} (${d > 0 ? '+' : ''}${d})`).join(', ')}. The district office will see this as a case.` }
      : { ok: true, text: `All ${items.length} counted ${items.length === 1 ? 'batch matches' : 'batches match'} the ledger.` });
    toast('Stock count submitted.');
  };
  return (
    <>
      <PageHead title="Stock" sub={`Batches on the books at ${k.name}. Count what is on the shelf and enter it; the ledger compares your count with its own figures. Last count: ${db.lastCount[k.id] ? fmtDate(db.lastCount[k.id]) : 'none'}.`} />
      <form onSubmit={submit} noValidate>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Medicine</th><th>Batch</th><th>Status</th><th className="num">On the books</th><th className="num">Counted</th></tr></thead>
          <tbody>{rows.map(b => {
            const st = batchState(db, b);
            return (
              <tr key={b.id} className={st.ok ? undefined : 'row-warn'}>
                <td>{DRUG[b.drug].name}</td><td>{b.id}</td><td className="small">{st.text}</td><td className="num">{db.onHand[kb(k.id, b.id)]}</td>
                <td className="num"><input className="count-in" type="number" min={0} inputMode="numeric" aria-label={`Counted strips of ${b.id}`}
                  value={counts[b.id] ?? ''} onChange={e => setCounts({ ...counts, [b.id]: e.target.value })} /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-foot"><button className="btn primary">Submit stock count</button><span className="hint">Leave a row empty if you have not counted it.</span></div>
        <div aria-live="polite">{result && <p className={`callout ${result.ok ? 'ok' : 'bad'}`}>{result.text}</p>}</div>
      </form>
    </>
  );
}

function DeliveryNotice({ kid, challan, items, date }: { kid: string; challan: string; items: [string, number][]; date: string }) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const confirm = () => {
    const got = items.map(([b, q]) => [b, counts[b] === undefined || counts[b] === '' ? NaN : Number(counts[b]), q] as const);
    if (got.some(([, n, q]) => !Number.isInteger(n) || n < 0 || n > q)) { setError('Enter how many strips of each batch arrived, from 0 up to the number dispatched.'); return; }
    store.append('receipt', `Kendra ${kid}`, { kendra: kid, challan, items: got.map(([b, n]) => [b, n]) });
    const short = got.reduce((s, [, n, q]) => s + q - n, 0);
    toast(short ? `Receipt confirmed, ${short} strips short. The district office will see a short-delivery case.` : 'Receipt confirmed. Everything on the challan arrived.');
  };
  return (
    <article className="panel notice notice-pending">
      <h2>Delivery on its way: challan {challan}</h2>
      <p>Dispatched from the warehouse on {fmtDate(date)}. Count what arrives and confirm it; only the strips you confirm are added to your stock.</p>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Medicine</th><th>Batch</th><th className="num">Dispatched</th><th className="num">Arrived</th></tr></thead>
        <tbody>{items.map(([b, q]) => (
          <tr key={b}><td>{DRUG[BATCH[b].drug].name}</td><td>{b}</td><td className="num">{q}</td>
            <td className="num"><input className="count-in" type="number" min={0} max={q} inputMode="numeric" aria-label={`Strips of ${b} that arrived`} value={counts[b] ?? ''} onChange={e => setCounts({ ...counts, [b]: e.target.value })} /></td></tr>
        ))}</tbody>
      </table></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-foot"><button className="btn primary" type="button" onClick={confirm}>Confirm receipt</button></div>
    </article>
  );
}

export function Notices() {
  const k = useKendra();
  const { db, ev } = useApp();
  const list = kendraNotices(db, ev.recalls, k.id);
  return (
    <>
      <PageHead title="Notices" sub="Deliveries to confirm, recalls and transfer requests from the district office." />
      {!list.length && <p className="empty-line">No notices. Deliveries, recalls and transfer requests from the district office appear here.</p>}
      {list.map(n => {
        if (n.type === 'delivery') return <DeliveryNotice key={'d' + n.d.challan} kid={k.id} challan={n.d.challan} items={n.d.items} date={n.d.date} />;
        if (n.type === 'recall') {
          const held = Math.max(n.row.onHand, 0);
          return (
            <article key={'r' + n.r.batch} className={'panel notice' + (n.pending ? ' notice-pending' : '')}>
              <h2>Recall: {n.r.drug.name}, batch {n.r.batch}</h2>
              <p>Recalled on {fmtDate(n.r.date)}. {n.r.reason}.</p>
              <p>{held ? <>You hold <strong>{held} strips</strong> of this batch. Do not bill them. Keep them apart and return them with the next warehouse pickup.</> : 'You hold none of this batch now.'}
                {n.row.soldAfter > 0 && <strong className="bad-text"> {n.row.soldAfter} strips were billed here after the recall.</strong>}</p>
              {n.row.ack ? <p className="done">Noted on {fmtDate(n.row.ack)}</p>
                : <button className="btn primary" type="button" onClick={() => { store.append('ack', `Kendra ${k.id}`, { kendra: k.id, batch: n.r.batch }); toast('Recall noted. The district office can see your confirmation.'); }}>Confirm recall noted</button>}
            </article>
          );
        }
        const t = n.t, d = DRUG[BATCH[t.batch].drug], done = db.transfersDone[t.id];
        if (n.type === 'send') {
          return (
            <article key={'s' + t.id} className={'panel notice' + (n.pending ? ' notice-pending' : '')}>
              <h2>Send {t.qty} strips of {d.name} to {kname(t.to)}</h2>
              <p>Batch {t.batch} expires on {fmtDate(BATCH[t.batch].expiry)} and will not sell here in time. {kname(t.to)} sells it faster. Requested by the district office on {fmtDate(t.at)}.</p>
              {done ? <p className="done">Sent on {fmtDate(done.at)}</p>
                : <button className="btn primary" type="button" onClick={() => { store.append('transfer', `Kendra ${t.from}`, { request: t.id, from: t.from, to: t.to, batch: t.batch, qty: t.qty }); toast(`Marked as sent. ${t.qty} strips moved to ${kname(t.to)} in the ledger.`); }}>Mark as sent</button>}
            </article>
          );
        }
        return (
          <article key={'i' + t.id} className="panel notice">
            <h2>Incoming: {t.qty} strips of {d.name} from {kname(t.from)}</h2>
            <p>Batch {t.batch}, expires {fmtDate(BATCH[t.batch].expiry)}. {done ? `Sent on ${fmtDate(done.at)} and added to your stock.` : 'Not sent yet.'}</p>
          </article>
        );
      })}
    </>
  );
}
