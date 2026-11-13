import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Footer, HashMark, Icon, Mark, useTitle } from '../components/ui';
import { fmtShort, num } from '../lib/format';
import { DISTRICT, KENDRAS } from '../lib/master';
import { MODEL } from '../lib/rules';
import { useApp } from '../lib/store';
import { TYPE_LABEL, summarize } from '../lib/summary';

const STOPS: [string, string][] = [
  ['Warehouse', 'Dispatch is matched with the kendra’s receipt'],
  ['Kendra', 'Weekly stock count is matched with the ledger'],
  ['Counter', 'Price, expiry and recalls are checked on every bill'],
  ['Patient', 'Scans the signed receipt to check it'],
];

const Flow = () => <ol className="flow">{STOPS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}</ol>;

function Tour() {
  return (
    <section className="tour" aria-labelledby="tour-h">
      <h2 id="tour-h">See it work in three minutes</h2>
      <ol>
        <li><Link to="/officer/cases/C-04186">Open the Loni case</Link> and read the reconciliation: 9 strips of Amoxyclav missing at the last count.</li>
        <li><Link to="/officer/ledger">Alter an old ledger record</Link> to hide them. The case drops to low risk, and the hash chain catches the edit.</li>
        <li><Link to="/officer/cases/M-03104">See the lead only the model found</Link>: bursts of bills just before closing at Raj Nagar Extension.</li>
        <li><Link to="/kendra/GZB02">Make a bill at Vaishali</Link>. The recalled Azithromycin batch can no longer be selected.</li>
        <li>Choose <em>Open as patient</em> on the receipt, or scan its QR code with a phone, to check the signed bill.</li>
      </ol>
    </section>
  );
}

function Roles({ withIcons = false }: { withIcons?: boolean }) {
  const navigate = useNavigate();
  const [kid, setKid] = useState(KENDRAS[0].id);
  return (
    <>
      <Link className="role" to="/officer">{withIcons && <Icon name="cases" className="role-ico" />}<strong>PMBI field officer</strong><span>Review cases across the district, plan inspections, trace batches, record recalls and check the ledger.</span></Link>
      <form className="role" onSubmit={e => { e.preventDefault(); navigate(`/kendra/${kid}`); }}>
        {withIcons && <Icon name="bill" className="role-ico" />}<strong>Kendra pharmacist</strong><span>Create signed bills, count stock and respond to recalls.</span>
        <span className="role-pick">
          <label htmlFor="kendra-pick" className="sr">Kendra</label>
          <select id="kendra-pick" value={kid} onChange={e => setKid(e.target.value)}>{KENDRAS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
          <button className="btn">Open counter</button>
        </span>
      </form>
      <Link className="role" to="/verify">{withIcons && <Icon name="check" className="role-ico" />}<strong>Patient</strong><span>Check a bill or the batch on a medicine strip, in English or Hindi. No sign-in needed.</span></Link>
    </>
  );
}

/** The latest records of the live ledger, each pointing at the hash of the one before it. */
function ChainVisual() {
  const { events, chain } = useApp();
  const recent = events.slice(-4).reverse();
  return (
    <figure className="chain-vis" aria-label="The four most recent ledger records and how their hashes link">
      {recent.map((e, i) => (
        <div key={e.seq} className={'block' + (!chain.ok && chain.seq === e.seq ? ' broken' : '')}>
          <div className="b-top"><span className="b-seq">#{e.seq}</span><span className="b-type">{TYPE_LABEL[e.type]}</span><span className="b-time">{fmtShort(e.at)}, {e.at.slice(11)}</span></div>
          <p className="b-sum">{summarize(e)}</p>
          <dl className="b-hashes">
            <div><dt>Hash</dt><dd><code className={i > 0 ? 'link-in' : undefined}>{e.hash.slice(0, 20)}</code></dd></div>
            <div><dt>Previous</dt><dd><code className={i < recent.length - 1 ? 'link-out' : undefined}>{e.prev.slice(0, 20)}</code></dd></div>
          </dl>
        </div>
      ))}
      <figcaption className={'chain-seal ' + (chain.ok ? 'ok' : 'bad')}>
        <HashMark className="hashmark seal-ico" />
        {chain.ok ? `All ${num(chain.count)} records verified in your browser` : `Record #${chain.seq} has been altered`}
      </figcaption>
    </figure>
  );
}

export function Start() {
  useTitle('');
  const { events } = useApp();
  const lede = `A working prototype for SIH 2026 (SIH26198). It runs on one synthetic district: 8 kendras in ${DISTRICT}, 10 medicines and 60 days of history in a ${events.length}-record hash-chained ledger. Seven explainable rules and a pattern model trained in Python (${MODEL.meta.algorithm}) look for problems.`;

  return (
    <>
      <main id="main" className="start">
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-copy">
              <Link className="brand big" to="/"><Mark /><span>AushadhiTrack</span></Link>
              <h1>Every strip of Jan Aushadhi medicine, accounted for from warehouse to patient.</h1>
              <p>{lede}</p>
              <div className="hero-actions">
                <Link className="btn primary" to="/officer">Open the district view</Link>
                <Link className="btn ghost" to="/verify">Check a bill as a patient</Link>
              </div>
            </div>
            <ChainVisual />
          </div>
        </section>
        <section className="roles-row" aria-labelledby="roles-h2">
          <h2 id="roles-h2">Open the prototype as</h2>
          <div className="roles-grid"><Roles withIcons /></div>
          <p className="start-note">No passwords. What you do here is added to the ledger in this browser and kept until you reset the demo on the Ledger page.</p>
        </section>
        <section className="how">
          <div><h2>How a strip is followed</h2><Flow /></div>
          <Tour />
        </section>
      </main>
      <Footer />
    </>
  );
}
