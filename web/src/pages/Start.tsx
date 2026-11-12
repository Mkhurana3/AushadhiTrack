import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Footer, Mark, useTitle } from '../components/ui';
import { DISTRICT, KENDRAS } from '../lib/master';
import { MODEL } from '../lib/rules';
import { useApp } from '../lib/store';

const STOPS: [string, string][] = [
  ['Warehouse', 'Dispatch is matched with the kendra’s receipt'],
  ['Kendra', 'Weekly stock count is matched with the ledger'],
  ['Counter', 'Price, expiry and recalls are checked on every bill'],
  ['Patient', 'Scans the signed receipt to check it'],
];

export function Start() {
  useTitle('');
  const navigate = useNavigate();
  const [kid, setKid] = useState(KENDRAS[0].id);
  const { events } = useApp();
  return (
    <>
      <main id="main" className="start">
        <section className="start-intro">
          <Link className="brand big" to="/"><Mark /><span>AushadhiTrack</span></Link>
          <h1>Follows every strip of Jan Aushadhi medicine from the warehouse to the patient, and shows where it goes missing.</h1>
          <p>A working prototype for SIH 2026 (SIH26198). It runs on one synthetic district: 8 kendras in {DISTRICT}, 10 medicines and 60 days of history in a {events.length}-record hash-chained ledger. Seven explainable rules and a pattern model trained in Python ({MODEL.meta.algorithm}) look for problems.</p>
          <ol className="flow">{STOPS.map(([t, d]) => <li key={t}><strong>{t}</strong><span>{d}</span></li>)}</ol>
        </section>
        <section className="start-roles" aria-labelledby="roles-h">
          <h2 id="roles-h">Open the prototype as</h2>
          <Link className="role" to="/officer"><strong>PMBI field officer</strong><span>Review cases across the district, trace batches, record recalls and check the ledger.</span></Link>
          <form className="role" onSubmit={e => { e.preventDefault(); navigate(`/kendra/${kid}`); }}>
            <strong>Kendra pharmacist</strong><span>Create signed bills, count stock and respond to recalls.</span>
            <span className="role-pick">
              <label htmlFor="kendra-pick" className="sr">Kendra</label>
              <select id="kendra-pick" value={kid} onChange={e => setKid(e.target.value)}>{KENDRAS.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
              <button className="btn">Open counter</button>
            </span>
          </form>
          <Link className="role" to="/verify"><strong>Patient</strong><span>Check a bill or the batch on a medicine strip, in English or Hindi. No sign-in needed.</span></Link>
          <p className="start-note">No passwords. What you do here is added to the ledger in this browser and kept until you reset the demo on the Ledger page.</p>
        </section>
      </main>
      <Footer />
    </>
  );
}
