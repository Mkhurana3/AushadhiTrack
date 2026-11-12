import { Link, useNavigate, useParams } from 'react-router-dom';
import { SalesChart } from '../../components/charts';
import { Back, PageHead, RiskTag, useTitle } from '../../components/ui';
import { fmtDate, fmtShort, inr, num } from '../../lib/format';
import { findingPoints, kendraCards, type KendraCard } from '../../lib/kendras';
import { DISTRICT, KENDRA, kname } from '../../lib/master';
import { useApp } from '../../lib/store';
import { caseTitle, caseWhy } from './Layout';

const pct = (x: number | null) => (x === null ? 'No count' : `${(x * 100).toFixed(1)}%`);

function RiskCounts({ c }: { c: KendraCard }) {
  const parts: [string, number][] = [['high', c.risk.High], ['medium', c.risk.Medium], ['low', c.risk.Low], ['lead', c.risk.lead]];
  const shown = parts.filter(([, n]) => n);
  if (!shown.length) return <span className="small">None</span>;
  return <span className="risk-counts">{shown.map(([k, n]) => <span key={k} className={`risk r-${k}`}>{n} {k === 'lead' ? (n > 1 ? 'leads' : 'lead') : k}</span>)}</span>;
}

export function Kendras() {
  const { db, ev } = useApp();
  const navigate = useNavigate();
  const cards = kendraCards(db, ev);
  const visits = cards.filter(c => c.priority > 0).slice(0, 3);
  return (
    <>
      <PageHead title="Kendras" sub="Where to go this week. A kendra’s visit priority adds up the scores of its open cases (2 for a model lead or patient report), plus 2 for each recall it hasn’t noted and 1 for each transfer it hasn’t sent." />
      <section className="panel" aria-labelledby="visit-h">
        <div className="panel-head"><h2 id="visit-h">Suggested visits this week</h2><button className="btn small" type="button" onClick={() => window.print()}>Print visit list</button></div>
        <ol className="visits">{visits.map(c => (
          <li key={c.kendra.id}>
            <div className="v-head"><Link to={`/officer/kendras/${c.kendra.id}`}>{c.kendra.name}</Link><span className="v-score">Priority {c.priority}</span></div>
            <p>{c.reasons.slice(0, 4).join('; ')}{c.reasons.length > 4 ? `; and ${c.reasons.length - 4} more` : ''}.</p>
            {c.value > 0 && <p className="small">{inr(c.value)} in missing stock and overcharges.</p>}
          </li>
        ))}</ol>
      </section>
      <div className="table-wrap"><table className="data">
        <thead><tr><th>Kendra</th><th>Open cases</th><th className="num">Money involved</th><th className="num">Last count accuracy</th><th>Recalls</th><th className="num">Strips billed, 30 days</th><th className="num">Priority</th></tr></thead>
        <tbody>{cards.map(c => (
          <tr key={c.kendra.id} className="clickable" onClick={e => { if (!(e.target as HTMLElement).closest('a')) navigate(`/officer/kendras/${c.kendra.id}`); }}>
            <td><Link to={`/officer/kendras/${c.kendra.id}`}>{c.kendra.name}</Link><br /><span className="small">{c.kendra.id}</span></td>
            <td><RiskCounts c={c} /></td>
            <td className="num">{c.value ? inr(c.value) : ''}</td>
            <td className={'num' + (c.accuracy !== null && c.accuracy < 1 ? ' over' : '')}>{pct(c.accuracy)}</td>
            <td>{c.recallsPending.length ? <span className="pending">Not noted</span> : <span className="small">All noted</span>}</td>
            <td className="num">{num(c.strips30)}</td>
            <td className="num strong">{c.priority}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </>
  );
}

export function KendraDetail() {
  const { kid = '' } = useParams();
  const { db, ev } = useApp();
  const k = KENDRA[kid];
  useTitle(k ? `${k.name} kendra` : 'Kendra');
  if (!k) return <><Back to="/officer/kendras">All kendras</Back><PageHead title="Kendra not found" /></>;
  const c = kendraCards(db, ev).find(x => x.kendra.id === kid)!;
  const lines = db.sales.filter(s => s.kendra === kid);
  // Bills behind rule findings, plus the late bills behind a pattern-model lead.
  const flagged = new Set(c.open.flatMap(f => f.kind === 'rule' ? f.hits.flatMap(h => h.bills?.map(b => b.bill) ?? [])
    : f.kind === 'model' ? f.lines.filter(s => s.time >= '20:30').map(s => s.bill) : []));
  const history = [...(db.countHistory[kid] ?? [])].reverse();
  const recalls = ev.recalls.flatMap(r => r.rows.filter(x => x.kendra.id === kid).map(x => ({ r, x })));
  const transfers = db.transferRequests.filter(t => t.from === kid || t.to === kid);
  return (
    <>
      <Back to="/officer/kendras">All kendras</Back>
      <div className="case-head">
        <div><p className="case-ref">{k.id}, {DISTRICT} district. Visit priority {c.priority}.</p><h1>{k.name} kendra</h1></div>
        <div className="case-tags"><button className="btn" type="button" onClick={() => window.print()}>Print visit sheet</button></div>
      </div>
      <p className="print-only">Visit sheet printed {fmtDate(new Date().toISOString())}. Synthetic data for SIH 2026 (SIH26198).</p>
      <dl className="figures">
        <div><dt>Open cases</dt><dd>{c.open.length}</dd><p><RiskCounts c={c} /></p></div>
        <div><dt>Missing stock and overcharges</dt><dd>{inr(c.value)}</dd><p>Across open cases</p></div>
        <div><dt>Last stock count accuracy</dt><dd>{pct(c.accuracy)}</dd><p>{c.lastCount ? `${c.lastCount.offBy} strips off on ${fmtShort(c.lastCount.date)}` : 'No count yet'}</p></div>
        <div><dt>Strips billed, 30 days</dt><dd>{num(c.strips30)}</dd><p>{inr(c.revenue30)} at the counter</p></div>
      </dl>
      <div className="case-grid">
        <div className="case-main">
          <section className="panel" aria-labelledby="kc-h"><h2 id="kc-h">Open cases</h2>
            {c.open.length ? <ul className="queue">{c.open.map(f => (
              <li key={f.id}><Link to={`/officer/cases/${f.id}`}>
                <span className="q-title">{caseTitle(f)}</span><span className="q-why">{f.id}: {caseWhy(f)}. Adds {findingPoints(f)} to priority.</span>
                <RiskTag risk={f.risk} lead={f.kind === 'model'} />
              </Link></li>
            ))}</ul> : <p className="empty-line">No open cases at this kendra.</p>}
          </section>
          <section className="panel" aria-labelledby="kb-h"><h2 id="kb-h">Strips billed per day, all medicines</h2>
            <SalesChart lines={lines} flagged={flagged} markers={[]} /></section>
          <section className="panel" aria-labelledby="kh-h"><h2 id="kh-h">Weekly stock counts</h2>
            <div className="table-wrap"><table className="data">
              <thead><tr><th>Date</th><th className="num">Batches</th><th className="num">Ledger expected</th><th className="num">Counted</th><th className="num">Strips off</th></tr></thead>
              <tbody>{history.map(h => (
                <tr key={h.seq} className={h.offBy ? 'row-bad' : undefined}><td>{fmtDate(h.date)}</td><td className="num">{h.batches}</td><td className="num">{num(h.expected)}</td><td className="num">{num(h.counted)}</td><td className="num strong">{h.offBy || ''}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        </div>
        <aside className="case-side">
          <section className="panel"><h2>Recalls</h2>
            {recalls.length ? <ul className="plain">{recalls.map(({ r, x }) => (
              <li key={r.batch}><Link to={`/officer/batches/${r.batch}`}>{r.batch}</Link> ({r.drug.short}): {Math.max(x.onHand, 0)} strips held, {x.ack ? `noted ${fmtShort(x.ack)}` : <span className="pending">not noted</span>}{x.soldAfter ? <strong className="bad-text">, {x.soldAfter} billed after the recall</strong> : null}.</li>
            ))}</ul> : <p className="empty-line">No recalled batches here.</p>}
          </section>
          <section className="panel"><h2>Transfers</h2>
            {transfers.length ? <ul className="plain">{transfers.map(t => (
              <li key={t.id}>{t.from === kid ? `Send ${t.qty} strips of ${t.batch} to ${kname(t.to)}` : `Receive ${t.qty} strips of ${t.batch} from ${kname(t.from)}`}: {db.transfersDone[t.id] ? 'done' : <span className="pending">waiting</span>}.</li>
            ))}</ul> : <p className="empty-line">No transfers requested.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
