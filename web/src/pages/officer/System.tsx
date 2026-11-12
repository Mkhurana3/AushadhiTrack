import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHead } from '../../components/ui';
import { fmtDate, fmtShort, num, plural } from '../../lib/format';
import { DRUG, KENDRA } from '../../lib/master';
import { DEFAULT_RULES, MODEL, RULES, type RuleConfig } from '../../lib/rules';
import { store, useApp } from '../../lib/store';
import { TYPE_LABEL, summarize } from '../../lib/summary';
import { toast } from '../../lib/toast';

export function LedgerPage() {
  const { chain, events, tamper, lastCheck, added } = useApp();
  const [shown, setShown] = useState(40);
  const [params] = useSearchParams();
  const focus = Number(params.get('seq')) || null;
  const latest = events.slice(-shown).reverse();
  const list = focus && events[focus - 1] && !latest.some(e => e.seq === focus) ? [events[focus - 1], ...latest] : latest;
  return (
    <>
      <PageHead title="Ledger" sub="Every dispatch, receipt, bill, stock count and decision is a record here. Each record stores a SHA-256 hash of its own contents and of the record before it, so changing any old record breaks the chain at that point. The same hashes are produced by the Python pipeline that generated the history." />
      {chain.ok ? (
        <div className="chain ok">
          <div><p><strong>All {num(chain.count)} records match their hashes.</strong></p>
            <p>Latest hash <code>{chain.head.slice(0, 16)}</code>{lastCheck ? `. Checked at ${lastCheck} in ${chain.ms} ms` : ''}.</p></div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => { store.checkChain(); toast(`Checked ${num(events.length)} records. No changes found.`); }}>Check again</button>
            <button className="btn quiet" type="button" onClick={() => store.tamper()}>Try altering an old record</button>
          </div>
        </div>
      ) : (
        <div className="chain bad" role="alert">
          <div><p><strong>Record #{chain.seq} has been altered.</strong> Its contents no longer match the hash stored when it was written.</p>{tamper && <p>{tamper.story}</p>}</div>
          <div className="actions">
            <Link className="btn" to={`/officer/ledger?seq=${chain.seq}`}>Show record #{chain.seq}</Link>
            {tamper && <button className="btn primary" type="button" onClick={() => { store.untamper(); toast('Edit undone. The chain checks out again.'); }}>Undo the edit</button>}
          </div>
        </div>
      )}
      <div className="table-wrap"><table className="data ledger">
        <thead><tr><th className="num">#</th><th>Time</th><th>Record</th><th>Details</th><th>By</th><th>Hash</th></tr></thead>
        <tbody>{list.map(e => {
          const bad = !chain.ok && e.seq === chain.seq;
          return (
            <tr key={e.seq} className={bad ? 'row-bad' : focus === e.seq ? 'row-focus' : undefined}>
              <td className="num">{e.seq}</td><td className="nowrap">{fmtShort(e.at)}, {e.at.slice(11)}</td><td className="nowrap">{TYPE_LABEL[e.type]}</td>
              <td>{summarize(e)}{bad && <><br /><strong className="small">Contents changed after the record was written</strong></>}</td>
              <td className="small">{e.actor}</td><td><code title={e.hash}>{e.hash.slice(0, 10)}</code></td>
            </tr>
          );
        })}</tbody>
      </table></div>
      <div className="more-row">
        {shown < events.length && <button className="btn" type="button" onClick={() => setShown(shown + 60)}>Show 60 older records</button>}
        <span className="small">{num(Math.max(events.length - shown, 0))} more. </span>
        {added > 0 && <span className="small">You have added {added} {added === 1 ? 'record' : 'records'} in this browser; they are kept until you <button type="button" className="link" onClick={() => { store.resetDemo(); toast('Demo reset to the original history.'); }}>reset the demo</button>.</span>}
      </div>
    </>
  );
}

export function RulesPage() {
  const { ev, cfg } = useApp();
  const hits = (key: string) => ev.findings.filter(f => f.hits.some(h => h.rule === key)).length;
  const changed = (Object.keys(DEFAULT_RULES) as (keyof RuleConfig)[]).some(k => cfg[k] !== DEFAULT_RULES[k]);
  return (
    <>
      <PageHead title="Rules" sub="Rule cases come only from these checks, so every flag can be explained with the numbers behind it. Change a limit to see how the case list responds." />
      <div className="table-wrap"><table className="data rules">
        <thead><tr><th>Rule</th><th>What it compares</th><th>Limit</th><th>Weight</th><th className="num">Cases now</th></tr></thead>
        <tbody>{RULES.map(r => (
          <tr key={r.key}><th scope="row">{r.name}</th><td>{r.checks}</td>
            <td className="nowrap">{r.setting ? <><LimitInput setting={r.setting} label={`${r.name} limit`} min={1} max={200} /> {r.unit}</> : <span className="small">Any</span>}</td>
            <td>{r.weight}</td><td className="num">{hits(r.key)}</td></tr>
        ))}</tbody>
      </table></div>
      <section className="panel explain"><h2>How a case gets its risk</h2>
        <p>A case’s score is the sum of the weights of the rules it breaks. A score of 3 or more is high risk, 2 is medium and 1 is low. A stock count mismatch or a recalled batch on a bill is high risk on its own; anything else needs two findings to reach high.</p>
        <p>Why these limits: a patient on a once-daily tablet uses 3 strips a month, so more than 12 strips of one medicine in 30 days is four months’ supply. Write-offs above 15% of stock received are rare outside a recorded incident.</p>
        <p>The rules only catch what someone thought to write down. The <Link to="/officer/model">pattern model</Link> looks for anything unusual.</p>
        <label className="inline">Look ahead for expiring stock <LimitInput setting="expiryWindow" label="Days to look ahead" min={15} max={365} /> days</label>
      </section>
      {changed && <p><button className="btn" type="button" onClick={() => { store.resetRules(); toast('Default limits restored.'); }}>Restore the default limits</button></p>}
    </>
  );
}

function LimitInput({ setting, label, min, max }: { setting: keyof RuleConfig; label: string; min: number; max: number }) {
  const { cfg } = useApp();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const v = Number(draft);
    if (Number.isInteger(v) && v >= min && v <= max) store.setRule(setting, v);
    else toast(`Enter a whole number from ${min} to ${max}.`);
    setDraft(null);
  };
  return (
    <input className="limit" type="number" min={min} max={max} aria-label={label} value={draft ?? cfg[setting]}
      onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); }} />
  );
}

const fmtFeature = (v: number, unit: string) => unit === '%' ? `${(v * 100).toFixed(1)}%` : unit === 'x' ? `${v.toFixed(1)}×` : v.toFixed(1);

export function ModelPage() {
  const { ev, db } = useApp();
  const m = MODEL.meta;
  const flagged = MODEL.rows.filter(r => r.flagged);
  const caseOf = (kendra: string, drug: string) => ev.findings.find(f => f.kind !== 'report' && f.kendra.id === kendra && f.drug.code === drug);
  const W = 1000, H = 150, L = 16, R = 16;
  const lo = Math.min(...MODEL.rows.map(r => r.score)), hi = Math.max(...MODEL.rows.map(r => r.score));
  const x = (s: number) => L + ((s - lo) / (hi - lo)) * (W - L - R);
  return (
    <>
      <PageHead title="Pattern model" sub="An anomaly model trained on how each medicine sells at each kendra. It looks for combinations the rules don’t check, such as bursts of bills just before closing. A lead is a reason to look, not proof." />
      <dl className="figures model-facts">
        <div><dt>Method</dt><dd className="dd-text">{m.algorithm}</dd><p>{m.n_estimators} trees, {m.library}</p></div>
        <div><dt>Rows scored</dt><dd>{m.rows}</dd><p>Each medicine at each kendra</p></div>
        <div><dt>Leads</dt><dd>{flagged.length}</dd><p>Top {Math.round(m.contamination * 100)}% by score</p></div>
        <div><dt>Trained on</dt><dd className="dd-text">{fmtShort(m.trained_on.from)} to {fmtShort(m.trained_on.to)}</dd><p>Ledger head <code>{m.trained_on.head.slice(0, 10)}</code></p></div>
      </dl>
      <section className="panel" aria-labelledby="dist-h"><h2 id="dist-h">How unusual each pair is</h2>
        <p className="sub">Each dot is one medicine at one kendra. Further right is easier to isolate from the rest, so stranger. Dots past the line are leads.</p>
        <div className="chart-wrap"><svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${MODEL.rows.length} scores; ${flagged.length} beyond the cut-off`}>
          <line x1={L} x2={W - R} y1={H - 28} y2={H - 28} className="axis" />
          <line x1={x(m.threshold)} x2={x(m.threshold)} y1={8} y2={H - 28} className="marker" />
          <text x={x(m.threshold) + 4} y={16} className="mlabel">Cut-off {m.threshold.toFixed(2)}</text>
          {MODEL.rows.map((r, i) => (
            <circle key={r.id} cx={x(r.score)} cy={H - 42 - (i % 7) * 11} r={5} className={r.flagged ? 'dot flagged' : 'dot'}>
              <title>{`${KENDRA[r.kendra].name}, ${DRUG[r.drug].short}: ${r.score.toFixed(2)}`}</title>
            </circle>
          ))}
          <text x={L} y={H - 10} className="tick">Ordinary</text><text x={W - R} y={H - 10} className="tick" textAnchor="end">Unusual</text>
        </svg></div>
      </section>
      <section className="panel" aria-labelledby="leads-h"><h2 id="leads-h">Leads</h2>
        <div className="table-wrap"><table className="data">
          <thead><tr><th>Kendra</th><th>Medicine</th><th className="num">Score</th><th>Most unusual</th><th>Case</th></tr></thead>
          <tbody>{flagged.map(r => {
            const c = caseOf(r.kendra, r.drug), u = r.unusual[0];
            return (
              <tr key={r.id}><td>{KENDRA[r.kendra].name}</td><td>{DRUG[r.drug].name}</td><td className="num">{r.score.toFixed(2)}</td>
                <td>{u ? `${u.label}: ${fmtFeature(u.value, u.unit)} against ${fmtFeature(u.peers, u.unit)} elsewhere` : ''}</td>
                <td>{c ? <Link to={`/officer/cases/${c.id}`}>{c.id}</Link> : ''}{c?.kind === 'model' ? <span className="small"> model only</span> : c ? <span className="small"> rules agree</span> : null}</td></tr>
            );
          })}</tbody>
        </table></div>
      </section>
      <section className="panel" aria-labelledby="fbs-h"><h2 id="fbs-h">Officer feedback</h2>
        {Object.keys(db.feedback).length ? (
          <>
            <p className="sub">{plural(Object.values(db.feedback).filter(f => f.label === 'useful').length, 'useful lead', 'useful leads')}, {plural(Object.values(db.feedback).filter(f => f.label === 'false-alarm').length, 'false alarm')}. These answers are exported as labels for the next training run.</p>
            <ul className="plain">{Object.values(db.feedback).map(f => (
              <li key={f.lead}><Link to={`/officer/cases/${f.lead}`}>{f.lead}</Link>: {f.label === 'useful' ? 'useful' : 'false alarm'}, {fmtShort(f.at)}{f.note ? `, “${f.note}”` : ''}</li>
            ))}</ul>
          </>
        ) : <p className="empty-line">No feedback yet. Open a model lead and say whether it was worth checking; the answers become labels for the next training run.</p>}
      </section>
      <section className="panel explain" aria-labelledby="feat-h"><h2 id="feat-h">What it looks at</h2>
        <p>Every measure is compared with the same medicine at the other kendras, using the median and the median absolute deviation, so a fast-selling medicine is not mistaken for a suspicious one. An explanation lists the measures more than {m.explain_z} deviations from the others.</p>
        <dl className="feature-list">{m.features.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{f.help}</dd></div>)}</dl>
        <p className="small">The model is trained in Python with scikit-learn by <code>python -m aushadhi_ml</code>, on the same ledger this site loads, on {fmtDate(m.trained_on.to)}. In production it would retrain nightly.</p>
      </section>
    </>
  );
}
