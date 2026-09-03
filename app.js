/* =========================================================================
   STATIC DEMO DATA
   ========================================================================= */
const MEDICINES = ['Paracetamol 500mg','Amoxicillin 500mg','Metformin 500mg','Atorvastatin 10mg','Cetirizine 10mg','Azithromycin 500mg','Amlodipine 5mg','Omeprazole 20mg','Ciprofloxacin 500mg','Ibuprofen 400mg'];
const KENDRAS = [['K1','Sector 18, Noida'],['K2','Greater Noida'],['K3','Dadri'],['K4','Ghaziabad'],['K5','Meerut'],['K6','Bulandshahr'],['K7','Hapur']];

/* Reference "today" for the demo, so dormancy/expiry checks are reproducible
   no matter when you actually run the prototype. */
const REFERENCE_DATE = new Date('2026-09-02T00:00:00');

/* Only RAW numbers live here now — no hand-typed flags/risk/notes.
   Everything a coordinator sees is computed by the rule engine below. */
const RAW_OVERRIDES = {
  'K1-Amlodipine 5mg':    { dispatched:110, sold:88, written:22, remaining:12 },
  'K1-Ibuprofen 400mg':   { dispatched:130, sold:95, written:28, remaining:7 },
  'K2-Paracetamol 500mg': { dispatched:120, sold:84, written:6,  remaining:15 },
  'K3-Metformin 500mg':   { dispatched:150, sold:60, written:70, remaining:25 },
  'K4-Omeprazole 20mg':   { dispatched:95,  sold:40, written:5,  remaining:50, lastSale:'2026-08-10' },
  'K5-Azithromycin 500mg':{ dispatched:80,  sold:55, written:5,  remaining:20, expiry:'2026-06-01', lastSale:'2026-08-01' },
  'K6-Amoxicillin 500mg': { dispatched:100, sold:70, written:5,  remaining:25, expiry:'2026-07-01', lastSale:'2026-08-20' },
  'K7-Atorvastatin 10mg': { dispatched:98,  sold:40, written:49, remaining:9 },
  'K7-Cetirizine 10mg':   { dispatched:140, sold:50, written:10, remaining:100, expiry:'2026-05-01', lastSale:'2026-08-01' }
};

const inventory = KENDRAS.flatMap(([id,kendra],ki)=>MEDICINES.map((medicine,mi)=>{
  const base = {
    id, kendra, medicine,
    dispatched:90+ki*8+mi*4, sold:60+ki*7+mi*3, written:3+(mi%6),
    expiry:`2027-${String((mi+3)%12+1).padStart(2,'0')}-01`,
    lastSale:`2026-08-${String(27+(mi%5)).padStart(2,'0')}`
  };
  base.remaining = base.dispatched - base.sold - base.written;
  return { ...base, ...(RAW_OVERRIDES[`${id}-${medicine}`] || {}) };
}));
const inventoryIndex = {};
inventory.forEach(r => inventoryIndex[`${r.id}-${r.medicine}`] = r);

/* =========================================================================
   RULE ENGINE — replaces the old hardcoded flags/risk/note table.
   Every flag below is DERIVED from dispatched/sold/written/remaining/
   expiry/lastSale, not typed in by hand. Change any number and the
   flags recompute.
   ========================================================================= */
const RULES = { writeOffThreshold: 0.15, dormantDays: 20 };

function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

function evaluateAnomaly(r) {
  const expected = r.dispatched - r.sold - r.written;
  const writeOffRatio = r.dispatched ? r.written / r.dispatched : 0;
  const daysSinceSale = r.lastSale ? daysBetween(new Date(r.lastSale), REFERENCE_DATE) : null;

  const flags = [];
  if (expected !== r.remaining) flags.push('Stock Balance');
  if (writeOffRatio > RULES.writeOffThreshold) flags.push('Write-off ratio');
  if (r.lastSale && r.expiry && new Date(r.lastSale) > new Date(r.expiry)) flags.push('Expired-stock sale');
  if (daysSinceSale !== null && daysSinceSale > RULES.dormantDays) flags.push('Dormant stock');

  // Severity: any stock-balance mismatch is treated as High on its own
  // (numbers not adding up is the strongest single signal of diversion).
  // Otherwise severity scales with how many independent rules co-occur.
  let risk = 'None';
  if (flags.includes('Stock Balance') || flags.length >= 3) risk = 'High';
  else if (flags.length === 2) risk = 'Medium';
  else if (flags.length === 1) risk = 'Low';

  const parts = [];
  if (flags.includes('Stock Balance')) parts.push(`Reported stock (${r.remaining}) does not match dispatched−sold−written-off (${expected})`);
  if (flags.includes('Write-off ratio')) parts.push(`Write-off is ${(writeOffRatio*100).toFixed(1)}% of dispatched (threshold ${(RULES.writeOffThreshold*100).toFixed(0)}%)`);
  if (flags.includes('Expired-stock sale')) parts.push(`Last sale (${r.lastSale}) recorded after batch expiry (${r.expiry})`);
  if (flags.includes('Dormant stock')) parts.push(`No sale in ${daysSinceSale} days (threshold ${RULES.dormantDays})`);

  return { flags, risk, note: parts.length ? parts.join(' · ') : 'Reconciled', expected, writeOffRatio };
}

function recomputeInventory() { inventory.forEach(r => Object.assign(r, evaluateAnomaly(r))); }
recomputeInventory();

/* =========================================================================
   TAMPER-EVIDENT LEDGER (demo-grade)
   Each event stores a hash of (previous hash + its own payload). If any
   past entry is edited, every hash after it stops matching — the same
   principle as a blockchain, minus the cryptographic hash function.
   NOTE: this uses a simple FNV-1a checksum, not SHA-256, so it is
   demonstration-grade, not production-grade. A production build should
   use the Web Crypto API (crypto.subtle.digest('SHA-256', ...)).
   ========================================================================= */
let ledger = [];

function simpleHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function addLedgerEvent(type, payload) {
  const prevHash = ledger.length ? ledger[ledger.length - 1].hash : '00000000';
  const timestamp = new Date().toISOString();
  const entry = { id: `EVT-${Date.now().toString().slice(-6)}`, type, payload, timestamp, prevHash };
  entry.hash = simpleHash(prevHash + JSON.stringify(payload) + timestamp);
  ledger.push(entry);
  return entry;
}
addLedgerEvent('SYSTEM_INIT', { message: 'Demo ledger session started' });

/* =========================================================================
   ROLE-BASED ACCESS
   A logged-in role can only reach the views it's entitled to. The
   role-switch control in the topbar is shown to admins only, so a
   vendor/receiver session can never escalate itself.
   ========================================================================= */
const ROLE_VIEWS = {
  admin: ['admin','flags','batches','ledger'],
  vendor: ['vendor'],
  receiver: ['receiver']
};

/* =========================================================================
   APP STATE
   ========================================================================= */
let state = {
  authenticated: false,
  role: null,
  view: 'admin',
  search: '',
  lastBill: null,
  bills: {},
  batches: [
    { batch:'BT-AX-260901', medicine:'Paracetamol 500mg', quantity:600, expiry:'2028-08-31', kendra:'K1', status:'Received' },
    { batch:'BT-MT-260831', medicine:'Metformin 500mg', quantity:400, expiry:'2028-07-31', kendra:'K3', status:'In transit' }
  ]
};
const $ = s => document.querySelector(s);
const root = $('#view-root');

function flags() { return inventory.filter(r => r.flags.length); }
function riskClass(r) { return r.risk.toLowerCase(); }
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3200); }
function esc(x) { return String(x).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function badge(r) { return `<span class="badge ${riskClass(r)}">${r.risk.toUpperCase()}</span>`; }
function pageHead(eyebrow,title,subtitle,action='') { return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }

function setView(view) {
  if (!ROLE_VIEWS[state.role] || !ROLE_VIEWS[state.role].includes(view)) { toast('Not permitted for this role.'); return; }
  state.view = view;
  render();
}

/* =========================================================================
   VIEWS
   ========================================================================= */
function admin() {
  const list = flags();
  const high = list.filter(r=>r.risk==='High').length, med = list.filter(r=>r.risk==='Medium').length, low = list.filter(r=>r.risk==='Low').length;
  return `<div class="page">${pageHead('OVERVIEW / 02 SEP 2026','Good afternoon, Coordinator.','Here is the integrity pulse across your monitored kendras.','<button class="primary-btn" data-action="batch">＋ Create batch</button>')}<div class="stats"><div class="stat-card" style="--accent:#41ae92"><span class="label">Kendras monitored</span><strong>${KENDRAS.length}</strong><small>Demo coverage</small></div><div class="stat-card" style="--accent:#47b4d1"><span class="label">Medicine records</span><strong>${inventory.length}</strong><small>Across ${MEDICINES.length} priority SKUs</small></div><div class="stat-card" style="--accent:#f9be3c"><span class="label">Open risk flags</span><strong>${list.length}</strong><small><span class="attention">${high} high priority</span> need review</small></div><div class="stat-card" style="--accent:#ee7770"><span class="label">Ledger events</span><strong>${ledger.length}</strong><small>Tamper-evident chain</small></div></div><div class="grid-main"><div class="card"><div class="card-title"><div><h2>Priority review queue</h2><p>Ranked by explainable rule severity</p></div><button class="link-btn" data-view-link="flags">View all →</button></div><div class="risk-list">${list.slice(0,5).map(r=>`<div class="risk-row"><i class="risk-bar" style="--risk:${r.risk==='High'?'#e25150':r.risk==='Medium'?'#f9be3c':'#a3cc54'}"></i><div><strong>${r.kendra} · ${r.medicine}</strong><br><span>${r.flags.join(' · ')}</span></div>${badge(r)}</div>`).join('')}</div></div><div class="card"><div class="card-title"><div><h2>Risk distribution</h2><p>Flagged records only — computed live</p></div></div><div class="donut-wrap"><div class="donut" style="background:conic-gradient(var(--red) 0 ${list.length?Math.round(high/list.length*100):0}%,var(--amber) ${list.length?Math.round(high/list.length*100):0}% ${list.length?Math.round((high+med)/list.length*100):0}%,var(--lime) ${list.length?Math.round((high+med)/list.length*100):0}% 100%)"></div><div class="donut-label"><b>${list.length}</b><small>OPEN FLAGS</small></div></div><div class="legend"><div><span style="--c:#e25150">High priority</span><b>${high}</b></div><div><span style="--c:#f9be3c">Medium review</span><b>${med}</b></div><div><span style="--c:#beeb53">Low monitor</span><b>${low}</b></div></div></div></div><div class="ledger-strip"><span class="lock">▣</span><div><b>Ledger integrity: ${verifyLedgerChain()?'verified':'BROKEN'}</b><p>Every demo movement is timestamped and hash-linked. <button class="link-btn" data-view-link="ledger" style="color:#beeb53">View chain →</button></p></div><small>${ledger.length} EVENTS</small></div></div>`;
}

function flagsView() {
  let rows = flags().filter(r => `${r.kendra} ${r.medicine} ${r.risk}`.toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="page">${pageHead('ADMINISTRATION / RISK INBOX','Explainable risk inbox','Only records with rule breaches are shown. Each flag retains its supporting numbers.','<button class="secondary-btn" data-action="export">⇩ Export review list</button>')}<div class="card table-card"><div class="table-toolbar"><div><strong>${rows.length} flagged records</strong><small style="margin-left:8px;color:#758886">Synthetic demo data · reference date 02 Sep 2026 · rules computed live</small></div><input class="search" id="flag-search" value="${esc(state.search)}" placeholder="Search kendra or medicine" /></div><table><thead><tr><th>Kendra</th><th>Medicine / batch health</th><th>Reconciliation</th><th>Triggered rules</th><th>Risk</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr class="flagged"><td><b>${r.kendra}</b><br><small class="mono">${r.id}</small></td><td><b>${r.medicine}</b><br><small>Expiry ${r.expiry} · ${r.note}</small></td><td><span class="qty">${r.dispatched} / ${r.sold} / ${r.written} / ${r.remaining}</span><br><small>Dispatch / sale / write-off / reported</small></td><td>${r.flags.map(x=>`<span class="badge ${riskClass(r)}">${x}</span>`).join(' ')}</td><td>${badge(r)}</td><td><button class="link-btn" data-action="review" data-item="${r.id}|${r.medicine}">Review</button></td></tr>`).join('')}</tbody></table></div></div>`;
}

function batches() {
  return `<div class="page">${pageHead('ADMINISTRATION / BATCH REGISTRY','Batch custody & traceability','Create dispatch batches, bind them to a kendra and retain their history.','<button class="primary-btn" data-action="batch">＋ Create batch</button>')}<div class="split"><div class="card table-card"><div class="table-toolbar"><strong>Active batch records</strong><span class="mono">${state.batches.length} batches</span></div><table><thead><tr><th>Batch ID</th><th>Medicine</th><th>Quantity</th><th>Expiry</th><th>Destination</th><th>Status</th></tr></thead><tbody>${state.batches.map(b=>`<tr><td class="mono">${b.batch}</td><td><b>${b.medicine}</b></td><td>${b.quantity} units</td><td>${b.expiry}</td><td>${b.kendra}</td><td><span class="badge low">${b.status.toUpperCase()}</span></td></tr>`).join('')}</tbody></table></div><div class="card"><div class="card-title"><div><h2>Chain of custody</h2><p>Live-linked to inventory</p></div></div><div class="rule-box"><h3>Every batch carries:</h3><div><b>01 · Batch identity</b><br>Batch number, SKU, expiry, quantity and dispatch source.</div><div><b>02 · Reconciliation link</b><br>Creating a batch increases that kendra's dispatched quantity, so the risk inbox reflects it immediately.</div><div><b>03 · Ledger event</b><br>Dispatch is written to the tamper-evident ledger with a hash link to the prior event.</div></div></div></div></div>`;
}

function vendor() {
  return `<div class="page">${pageHead('KENDRA PORTAL / VENDOR COUNTER','Create a sale & verified bill','Each bill checks live stock, updates the sale ledger and gives the customer a QR-verifiable receipt.')}<div class="split"><div class="card"><div class="card-title"><div><h2>New point-of-sale bill</h2><p>Demo mode — SMS is simulated safely</p></div></div><form id="sale-form" class="form-grid"><div class="form-field"><label>Kendra</label><select name="kendra">${KENDRAS.map(([id,n])=>`<option value="${id}">${n} (${id})</option>`).join('')}</select></div><div class="form-field"><label>Medicine</label><select name="medicine">${MEDICINES.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="form-field"><label>Quantity</label><input name="quantity" type="number" min="1" value="1" required /></div><div class="form-field"><label>Unit price (₹)</label><input name="price" type="number" min="1" value="18" required /></div><div class="form-field"><label>Customer name</label><input name="name" placeholder="e.g. Aarav Sharma" required /></div><div class="form-field"><label>Mobile number</label><input name="phone" inputmode="numeric" pattern="[0-9]{10}" placeholder="10-digit mobile number" required /></div><div class="form-field full"><label><input type="checkbox" name="consent" required /> I have obtained the customer's consent to send this bill by SMS.</label></div><div class="form-field full"><button class="primary-btn" type="submit">Generate bill & send SMS</button></div></form></div><div class="card"><div class="card-title"><div><h2>Built-in safeguards</h2><p>Rule checks before the bill is recorded</p></div></div><div class="rule-box"><div><b>Stock check</b><br>Blocks the sale if quantity exceeds the kendra's reported remaining stock.</div><div><b>Inventory reconciliation</b><br>Sale event updates expected stock, recomputes flags, and writes to the audit ledger.</div><div><b>Customer privacy</b><br>Mobile number is used only for the transactional bill in this prototype.</div><div><b>QR receipt</b><br>A real QR is generated encoding the bill ID and its ledger hash, verifiable on the receiver portal.</div></div></div></div>${state.lastBill?billReceipt(state.lastBill):''}</div>`;
}

function billReceipt(b) {
  return `<div class="modal-backdrop"><div class="receipt"><div class="receipt-top"><div><h3>AushadhiTrack</h3><small>Verified Jan Aushadhi receipt</small></div><span class="mono">${b.id}</span></div><div class="receipt-row"><span>Customer</span><b>${esc(b.name)}</b></div><div class="receipt-row"><span>Medicine</span><b>${b.medicine}</b></div><div class="receipt-row"><span>Quantity</span><b>${b.quantity}</b></div><div class="receipt-row"><span>Kendra</span><b>${b.kendra}</b></div><div class="receipt-total receipt-row"><span>Total paid</span><span>₹${b.total}</span></div><div class="qr qr-live" id="qr-box"></div><p style="text-align:center;font-size:10px;color:#64767b">Bill ID: <span class="mono">${b.id}</span> · Ledger hash: <span class="mono">${b.ledgerHash}</span></p><div class="modal-actions"><button class="secondary-btn" data-action="close-bill">Close</button><button class="primary-btn" data-action="sms">✓ SMS sent</button></div></div></div>`;
}

function ledgerView() {
  return `<div class="page">${pageHead('ADMINISTRATION / AUDIT LEDGER','Tamper-evident event chain','Every dispatch, sale and consent event is hash-linked to the one before it.')}<div class="card table-card"><div class="table-toolbar"><strong>${ledger.length} events</strong><small style="color:#758886">Demo hash (FNV-1a) — production would use SHA-256 via Web Crypto</small></div><table><thead><tr><th>Event</th><th>Type</th><th>Details</th><th>Prev hash</th><th>Hash</th></tr></thead><tbody>${ledger.map(e=>`<tr><td class="mono">${e.id}<br><small>${new Date(e.timestamp).toLocaleString()}</small></td><td><span class="badge low">${e.type}</span></td><td><small>${esc(JSON.stringify(e.payload))}</small></td><td class="mono">${e.prevHash}</td><td class="mono">${e.hash}</td></tr>`).join('')}</tbody></table></div><div class="card" style="margin-top:16px"><p style="font-size:11px;color:var(--muted)">Verification: <b>${verifyLedgerChain()?'chain intact — each hash matches the previous entry':'CHAIN BROKEN — an entry does not match'}</b>. In this demo, editing any past event's payload would make every hash after it fail to recompute correctly, the same principle used by production audit logs.</p></div></div>`;
}

function verifyLedgerChain() {
  let prev = '00000000';
  for (const e of ledger) {
    if (e.prevHash !== prev) return false;
    if (simpleHash(e.prevHash + JSON.stringify(e.payload) + e.timestamp) !== e.hash) return false;
    prev = e.hash;
  }
  return true;
}

function receiver() {
  return `<div class="page verify">${pageHead('CITIZEN PORTAL / RECEIVER','Verify a medicine purchase','Scan the QR on a bill with any phone camera, then paste the code below to confirm its status.')}<div class="card"><div class="eyebrow">NO LOGIN REQUIRED</div><h2 style="margin:8px 0">Check your purchase</h2><p style="color:var(--muted);font-size:11px">The QR encodes the bill ID and its ledger hash. Enter the bill ID to verify it against the audit ledger.</p><div class="form-field" style="margin:16px 0"><input class="search" id="verify-input" placeholder="Enter Bill ID, e.g. AT-482913" style="width:100%" /></div><button class="primary-btn" data-action="scan">Verify bill</button><div class="verify-result hidden" id="verify-result"><b id="verify-heading">Checking…</b><br><span id="verify-text"></span></div></div><div class="card" style="margin-top:18px;text-align:left"><div class="card-title"><div><h2>Privacy and future identity protection</h2><p>Proposed for the production phase</p></div></div><p style="font-size:11px;line-height:1.7;color:var(--muted)">Aadhaar must never be used as a public identifier or stored unnecessarily. A production rollout would use explicit consent, minimal tokenised identity references, access controls, encryption, and compliance review before any Aadhaar-linked service is introduced.</p></div></div>`;
}

function login() {
  return `<div class="login-page"><div class="login-card"><a class="login-brand"><span>✚</span>Aushadhi<span>Track</span></a><p class="login-eyebrow">JAN AUSHADHI INTEGRITY NETWORK</p><h1>Welcome back.</h1><p class="login-copy">Choose a demo role to enter the protected medicine-tracking workspace. In production this screen would be PMBI staff SSO with real credentials — this is a role selector for the prototype only.</p><div class="demo-roles"><button data-login="admin"><b>▦</b><span><strong>District coordinator</strong><small>Review flags, batches and network integrity</small></span><i>→</i></button><button data-login="vendor"><b>▤</b><span><strong>Kendra vendor</strong><small>Create bills and lodge verified medicine sales</small></span><i>→</i></button><button data-login="receiver"><b>⌁</b><span><strong>Medicine receiver</strong><small>Verify a purchase receipt with its QR code</small></span><i>→</i></button></div><p class="login-note">Demo access only · no personal identity or password is collected</p></div><div class="login-side"><div><span class="login-seal">◈</span><p>Every medicine movement should be visible, traceable and explainable.</p><small>AUShADHITRACK / SIH 2026 PROTOTYPE</small></div></div></div>`;
}

/* =========================================================================
   RENDER / BIND
   ========================================================================= */
function render() {
  document.body.classList.toggle('login-active', !state.authenticated);
  if (!state.authenticated) {
    root.innerHTML = login();
    document.querySelectorAll('[data-login]').forEach(b => b.onclick = () => {
      state.role = b.dataset.login;
      state.view = ROLE_VIEWS[state.role][0];
      state.authenticated = true;
      render();
    });
    return;
  }
  const map = { admin, flags: flagsView, batches, vendor, receiver, ledger: ledgerView };
  root.innerHTML = map[state.view]();
  $('#breadcrumbs').textContent = ({ admin:'ADMINISTRATION / COMMAND CENTRE', flags:'ADMINISTRATION / RISK INBOX', batches:'ADMINISTRATION / BATCH REGISTRY', vendor:'KENDRA PORTAL / VENDOR COUNTER', receiver:'CITIZEN PORTAL / RECEIVER', ledger:'ADMINISTRATION / AUDIT LEDGER' })[state.view];

  // RBAC: hide nav items the current role isn't allowed to open.
  document.querySelectorAll('.nav-item').forEach(b => {
    const allowed = ROLE_VIEWS[state.role].includes(b.dataset.view);
    b.classList.toggle('hidden', !allowed);
    b.classList.toggle('active', b.dataset.view === state.view);
  });
  const navRisk = $('#navRisk'); if (navRisk) navRisk.textContent = flags().length;

  // The admin-only demo role-switcher in the topbar — never shown to a
  // logged-in vendor/receiver session, so they can't escalate privileges.
  const roleSwitch = document.querySelector('.role-switch');
  if (roleSwitch) roleSwitch.classList.toggle('hidden', state.role !== 'admin');
  document.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('active', b.dataset.role === state.view));

  // Draw a real QR code on the receipt if one is showing.
  const qrBox = document.getElementById('qr-box');
  if (qrBox && state.lastBill && window.QRCode) {
    qrBox.innerHTML = '';
    new QRCode(qrBox, { text: JSON.stringify({ bill: state.lastBill.id, hash: state.lastBill.ledgerHash }), width: 118, height: 118, correctLevel: QRCode.CorrectLevel.M });
  }

  bind();
}

function openBatch() {
  const modal = $('#modal');
  $('#modal-content').innerHTML = `<h2>Create dispatch batch</h2><p>Register a traceable stock movement for the demo ledger.</p><form id="batch-form" class="form-grid"><div class="form-field"><label>Medicine</label><select name="medicine">${MEDICINES.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="form-field"><label>Quantity</label><input name="quantity" type="number" min="1" value="300" required></div><div class="form-field"><label>Expiry date</label><input name="expiry" type="date" value="2028-09-01" required></div><div class="form-field"><label>Destination Kendra</label><select name="kendra">${KENDRAS.map(([id,n])=>`<option value="${id}">${n}</option>`).join('')}</select></div><div class="modal-actions form-field full"><button type="button" class="secondary-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Add sealed batch</button></div></form>`;
  modal.classList.remove('hidden');
  $('#batch-form').onsubmit = e => {
    e.preventDefault();
    const d = new FormData(e.target);
    const medicine = d.get('medicine'), kendraId = d.get('kendra'), quantity = Number(d.get('quantity')), expiry = d.get('expiry');
    state.batches.unshift({ batch:`BT-AT-${Date.now().toString().slice(-6)}`, medicine, quantity, expiry, kendra:kendraId, status:'Dispatched' });

    // Link the batch straight into inventory instead of leaving it a
    // disconnected record — this is what actually makes "chain of
    // custody" affect the reconciliation numbers.
    const key = `${kendraId}-${medicine}`;
    let rec = inventoryIndex[key];
    if (rec) { rec.dispatched += quantity; }
    else {
      rec = { id:kendraId, kendra:KENDRAS.find(k=>k[0]===kendraId)[1], medicine, dispatched:quantity, sold:0, written:0, remaining:quantity, expiry, lastSale:null };
      inventory.push(rec); inventoryIndex[key] = rec;
    }
    recomputeInventory();
    addLedgerEvent('BATCH_DISPATCHED', { batch: state.batches[0].batch, kendra:kendraId, medicine, quantity, expiry });

    modal.classList.add('hidden');
    toast('Batch created, linked to inventory, and sealed in the ledger.');
    state.view = 'batches';
    render();
  };
}

function bind() {
  document.querySelectorAll('[data-view-link]').forEach(x => x.onclick = () => setView(x.dataset.viewLink));
  document.querySelectorAll('[data-action]').forEach(el => el.onclick = () => {
    const a = el.dataset.action;
    if (a === 'batch') openBatch();
    if (a === 'export') toast('Review list prepared — export connector comes in production.');
    if (a === 'review') { const [id, med] = el.dataset.item.split('|'); const r = inventory.find(x => x.id === id && x.medicine === med); toast(`${r.kendra}: ${r.note}`); }
    if (a === 'close-modal') $('#modal').classList.add('hidden');
    if (a === 'close-bill') { state.lastBill = null; render(); }
    if (a === 'sms') toast('SMS receipt recorded for this demo.');
    if (a === 'scan') {
      const id = ($('#verify-input')?.value || '').trim();
      const v = $('#verify-result'), heading = $('#verify-heading'), text = $('#verify-text');
      v.classList.remove('hidden');
      const b = state.bills[id];
      if (!b) { heading.textContent = '✗ No matching bill'; text.textContent = 'No record with that Bill ID was found in this demo session.'; return; }
      const evt = ledger.find(e => e.type === 'SALE_RECORDED' && e.payload.billId === id);
      const intact = evt && verifyLedgerChain();
      heading.textContent = intact ? '✓ Bill verified' : '✗ Verification failed';
      text.textContent = `${b.medicine} · ${b.quantity} unit(s) · ${b.kendra} · ₹${b.total} · ledger hash ${evt ? evt.hash : 'n/a'}`;
    }
  });
  const search = $('#flag-search'); if (search) search.oninput = e => { state.search = e.target.value; render(); setTimeout(() => $('#flag-search').focus(), 0); };
  const form = $('#sale-form');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const d = new FormData(form);
    let phone = d.get('phone').replace(/\D/g, '');
    if (phone.length !== 10) { toast('Enter a valid 10-digit mobile number.'); return; }
    const kendraId = d.get('kendra'), medicine = d.get('medicine'), quantity = Number(d.get('quantity'));
    const rec = inventoryIndex[`${kendraId}-${medicine}`];
    if (rec && quantity > rec.remaining) { toast(`Only ${rec.remaining} unit(s) of ${medicine} remain at this kendra — reduce the quantity.`); return; }

    const kendraName = KENDRAS.find(x => x[0] === kendraId)[1];
    const billId = `AT-${Date.now().toString().slice(-6)}`;
    const total = quantity * Number(d.get('price'));

    if (rec) { rec.sold += quantity; rec.remaining -= quantity; rec.lastSale = '2026-09-02'; recomputeInventory(); }
    const evt = addLedgerEvent('SALE_RECORDED', { billId, kendra: kendraId, medicine, quantity, consent: true });

    const bill = { id: billId, name: d.get('name'), phone, medicine, quantity, kendra: kendraName, total, ledgerHash: evt.hash };
    state.bills[billId] = bill;
    state.lastBill = bill;
    toast('Bill saved; consented SMS queued in demo mode.');
    render();
  };
}

document.querySelectorAll('.nav-item').forEach(n => n.onclick = () => setView(n.dataset.view));
document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => setView(b.dataset.role));
render();
