import { Link, Outlet } from 'react-router-dom';
import { Legend, PageHead, RiskTag, Shell } from '../../components/ui';
import { fmtDate, fmtShort, inr, num } from '../../lib/format';
import { DISTRICT, DRUGS, KENDRAS, LAST, OFFICER } from '../../lib/master';
import type { Finding } from '../../lib/rules';
import { useApp } from '../../lib/store';
import { TYPE_LABEL, summarize } from '../../lib/summary';

export const openFindings = (fs: Finding[]) => fs.filter(f => f.status !== 'Closed');

export function caseTitle(f: Finding): string {
  if (f.kind === 'report') return `Patient report: ${f.complaint.reasonText.charAt(0).toLowerCase()}${f.complaint.reasonText.slice(1)}`;
  return `${f.drug.short} at ${f.kendra.name}`;
}
export function caseWhy(f: Finding): string {
  if (f.kind === 'report') return f.complaint.code || 'Patient report';
  if (f.kind === 'model') return `Pattern model: ${f.lead.unusual[0]?.label.toLowerCase() ?? 'unusual pattern'}`;
  return f.hits.map(h => h.title).join(', ');
}

export function OfficerLayout() {
  const { ev, chain } = useApp();
  const name = OFFICER.split(',')[0];
  return (
    <Shell ctx={`${DISTRICT} district`} who={name} role="PMBI field officer" nav={[
      { to: '/officer', label: 'Overview', icon: 'overview', end: true },
      { to: '/officer/cases', label: 'Cases', icon: 'cases', count: openFindings(ev.findings).length },
      { to: '/officer/kendras', label: 'Kendras', icon: 'kendras' },
      { to: '/officer/stock', label: 'Expiring stock', icon: 'stock', count: ev.advisories.filter(a => !(a.request || a.done)).length },
      { to: '/officer/batches', label: 'Batches and recalls', icon: 'batches' },
      { to: '/officer/model', label: 'Pattern model', icon: 'model' },
      { to: '/officer/ledger', label: 'Ledger', icon: 'ledger', count: chain.ok ? 0 : 'Altered', alert: true },
      { to: '/officer/rules', label: 'Rules', icon: 'rules' },
    ]}>
      <Outlet />
    </Shell>
  );
}

export function ChainLine() {
  const { chain } = useApp();
  return chain.ok
    ? <p className="chain-line ok">All {num(chain.count)} records match their hashes</p>
    : <p className="chain-line bad">Record #{chain.seq} has been altered</p>;
}

export function Overview() {
  const { ev, cfg, events } = useApp();
  const open = openFindings(ev.findings);
  const high = open.filter(f => f.risk === 'High').length;
  const leads = open.filter(f => f.kind === 'model').length;
  const value = open.reduce((s, f) => s + f.value, 0);
  const exp = ev.advisories.filter(a => a.type === 'expiring' && !a.done);
  const held = ev.recalls.reduce((s, r) => s + r.stillHeld, 0);
  const billing = ev.recalls.flatMap(r => r.rows.filter(x => x.soldAfter > 0)).length;
  // High-risk rule cases first, then model leads (the rules cannot see those), then everything else.
  const queue = [...open.filter(f => f.risk === 'High'), ...open.filter(f => f.kind === 'model'), ...open.filter(f => f.risk !== 'High' && f.kind !== 'model')].slice(0, 6);
  return (
    <>
      <PageHead title={`${DISTRICT} district`} sub={`Figures run to the stock counts submitted on the evening of ${fmtDate(LAST)}, plus today’s bills.`} />
      <dl className="figures">
        <div><dt>Open cases</dt><dd>{open.length}</dd><p>{high} high risk, {leads} from the pattern model</p></div>
        <div><dt>Missing stock and overcharges</dt><dd>{inr(value)}</dd><p>Across open cases</p></div>
        <div><dt>Likely to expire unsold</dt><dd>{num(exp.reduce((s, a) => s + a.unsold, 0))} <small>strips</small></dd><p>{exp.length} batches in the next {cfg.expiryWindow} days</p></div>
        <div><dt>Recalled stock in kendras</dt><dd>{num(held)} <small>strips</small></dd><p>{billing ? `${billing} kendra still billing it` : 'No kendra is billing it'}</p></div>
      </dl>
      <div className="overview-grid">
        <section className="panel" aria-labelledby="mx-h">
          <h2 id="mx-h">Where the findings are</h2>
          <p className="sub">One square per medicine at each kendra. The number is the rule score; M marks a lead from the pattern model. Select a square to open the case.</p>
          <Matrix findings={open} />
        </section>
        <section className="panel" aria-labelledby="first-h">
          <h2 id="first-h">Review first</h2>
          <ul className="queue">
            {queue.map(f => (
              <li key={f.id}><Link to={`/officer/cases/${f.id}`}>
                <span className="q-title">{caseTitle(f)}</span><span className="q-why">{caseWhy(f)}</span>
                <RiskTag risk={f.risk} lead={f.kind === 'model'} />
              </Link></li>
            ))}
            {!open.length && <li className="empty-line">No open cases.</li>}
          </ul>
          <Link className="more" to="/officer/cases">All cases</Link>
        </section>
      </div>
      <section className="panel ledger-mini" aria-labelledby="lg-h">
        <div className="panel-head"><h2 id="lg-h">Ledger</h2><ChainLine /></div>
        <div className="table-wrap"><table className="data compact"><tbody>
          {events.slice(-5).reverse().map(e => (
            <tr key={e.seq}><td className="nowrap">{fmtShort(e.at)} {e.at.slice(11)}</td><td>{TYPE_LABEL[e.type]}</td><td>{summarize(e)}</td></tr>
          ))}
        </tbody></table></div>
        <Link className="more" to="/officer/ledger">Open the ledger</Link>
      </section>
    </>
  );
}

function Matrix({ findings }: { findings: Finding[] }) {
  const byPair = new Map<string, Finding>();
  findings.forEach(f => { if (f.kind !== 'report') byPair.set(f.kendra.id + '|' + f.drug.code, f); });
  return (
    <>
      <div className="matrix-wrap"><table className="matrix">
        <thead><tr><td />{DRUGS.map(d => <th key={d.code} scope="col" title={d.name}><span>{d.short}</span></th>)}</tr></thead>
        <tbody>{KENDRAS.map(k => (
          <tr key={k.id}><th scope="row"><Link className="row-link" to={`/officer/kendras/${k.id}`}>{k.name}</Link></th>{DRUGS.map(d => {
            const f = byPair.get(k.id + '|' + d.code);
            if (!f || f.kind === 'report') return <td key={d.code}><span className="cell" aria-hidden="true" /></td>;
            const model = f.kind === 'model';
            const title = model ? `${d.name} at ${k.name}: pattern model lead` : `${d.name} at ${k.name}: ${f.hits.map(h => h.title).join(', ')}`;
            return (
              <td key={d.code}><Link className={`cell ${model ? 'model' : 'r-' + f.risk.toLowerCase()}`} to={`/officer/cases/${f.id}`} title={title}>
                <span className="sr">{model ? `${d.short} at ${k.name}, pattern model lead` : `${d.short} at ${k.name}, ${f.risk} risk, score`}</span>{model ? 'M' : f.score}
              </Link></td>
            );
          })}</tr>
        ))}</tbody>
      </table></div>
      <Legend items={[['r-high', 'High'], ['r-medium', 'Medium'], ['r-low', 'Low'], ['model', 'Model lead'], ['', 'No findings']]} />
    </>
  );
}
