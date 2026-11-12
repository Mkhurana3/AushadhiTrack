/* AushadhiTrack — SIH 2026 prototype (SIH26198)
 * Everything runs in the browser on clearly labelled synthetic data.
 * Risk flags are computed from four explainable rules, not hard-coded. */

// ------------------------------------------------------------------ data
const REFERENCE_DATE = '2026-09-02'; // "today" for the synthetic dataset
const MEDICINES = ['Paracetamol 500mg', 'Amoxicillin 500mg', 'Metformin 500mg', 'Atorvastatin 10mg', 'Cetirizine 10mg',
  'Azithromycin 500mg', 'Amlodipine 5mg', 'Omeprazole 20mg', 'Ciprofloxacin 500mg', 'Ibuprofen 400mg'];
const KENDRAS = [['K1', 'Sector 18, Noida'], ['K2', 'Greater Noida'], ['K3', 'Dadri'], ['K4', 'Ghaziabad'],
  ['K5', 'Meerut'], ['K6', 'Bulandshahr'], ['K7', 'Hapur']];
const kendraName = id => (KENDRAS.find(k => k[0] === id) || [id, id])[1];

// Scenario records: only the raw numbers differ — the rules decide what is suspicious.
const SCENARIOS = {
  'K1|Amlodipine 5mg': { dispatched: 110, sold: 88, written: 22, remaining: 12 },
  'K1|Ibuprofen 400mg': { dispatched: 130, sold: 95, written: 28, remaining: 7 },
  'K2|Paracetamol 500mg': { dispatched: 120, sold: 84, written: 6, remaining: 15 },
  'K3|Metformin 500mg': { dispatched: 150, sold: 60, written: 70, remaining: 25 },
  'K4|Omeprazole 20mg': { dispatched: 95, sold: 40, written: 5, remaining: 50, lastSale: '2026-08-10' },
  'K5|Azithromycin 500mg': { dispatched: 80, sold: 55, written: 5, remaining: 20, expiry: '2026-06-01', lastSale: '2026-08-25' },
  'K6|Amoxicillin 500mg': { dispatched: 100, sold: 70, written: 5, remaining: 25, expiry: '2026-07-01' },
  'K7|Atorvastatin 10mg': { dispatched: 98, sold: 40, written: 49, remaining: 9 },
  'K7|Cetirizine 10mg': { dispatched: 140, sold: 50, written: 10, remaining: 100, expiry: '2026-05-01', lastSale: '2026-08-20' },
};

const inventory = KENDRAS.flatMap(([id], ki) => MEDICINES.map((medicine, mi) => {
  const r = {
    id, medicine,
    dispatched: 90 + ki * 8 + mi * 4,
    sold: 60 + ki * 7 + mi * 3,
    written: 3 + (mi % 6),
    expiry: `2027-${String((mi + 3) % 12 + 1).padStart(2, '0')}-01`,
    lastSale: `2026-08-${String(27 + (mi % 5)).padStart(2, '0')}`,
    reviewed: false,
  };
  r.remaining = r.dispatched - r.sold - r.written;
  return Object.assign(r, SCENARIOS[`${id}|${medicine}`] || {});
}));

// ------------------------------------------------------------------ rule engine
const WRITE_OFF_LIMIT = 0.15;   // >15% of dispatched stock written off
const DORMANT_DAYS = 10;        // stock on hand but no sale for 10+ days
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const RULES = [
  { key: 'balance', label: 'Stock balance', test(r) {
      const expected = r.dispatched - r.sold - r.written, diff = r.remaining - expected;
      if (diff === 0) return null;
      return { weight: 3, detail: `Dispatched ${r.dispatched} − sold ${r.sold} − written off ${r.written} = ${expected} expected, but ${r.remaining} reported (${diff > 0 ? '+' : ''}${diff}).` };
  } },
  { key: 'writeoff', label: 'Write-off ratio', test(r) {
      const ratio = r.written / r.dispatched;
      if (ratio <= WRITE_OFF_LIMIT) return null;
      return { weight: ratio > 0.3 ? 2 : 1, detail: `${(ratio * 100).toFixed(1)}% of dispatched stock written off (limit ${WRITE_OFF_LIMIT * 100}%).` };
  } },
  { key: 'expiry', label: 'Expired-stock sale', test(r) {
      if (r.lastSale <= r.expiry) return null;
      return { weight: 2, detail: `Sale recorded on ${fmtDate(r.lastSale)}, after the batch expired on ${fmtDate(r.expiry)}.` };
  } },
  { key: 'dormant', label: 'Dormant stock', test(r) {
      const days = daysBetween(r.lastSale, REFERENCE_DATE);
      if (r.remaining <= 0 || days < DORMANT_DAYS) return null;
      return { weight: 1, detail: `${r.remaining} units on hand with no sale for ${days} days (threshold ${DORMANT_DAYS}).` };
  } },
];

function evaluate(r) {
  const hits = RULES.map(rule => { const h = rule.test(r); return h && { ...h, key: rule.key, label: rule.label }; }).filter(Boolean);
  const score = hits.reduce((s, h) => s + h.weight, 0);
  const risk = score >= 3 ? 'High' : score === 2 ? 'Medium' : score === 1 ? 'Low' : 'None';
  return { hits, score, risk };
}
const RISK_ORDER = { High: 0, Medium: 1, Low: 2 };
function flagged() {
  return inventory.map(r => ({ r, ...evaluate(r) })).filter(x => x.hits.length)
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.score - a.score);
}
const countBy = (list, risk) => list.filter(x => x.risk === risk).length;

// ------------------------------------------------------------------ state
const ROLES = {
  admin: { name: 'District coordinator', sub: 'Demo administrator', initials: 'DC', home: 'admin',
    nav: [['admin', 'grid', 'Command centre'], ['batches', 'box', 'Batch registry'], ['flags', 'alert', 'Risk inbox']] },
  vendor: { name: 'Kendra operator', sub: 'K1 · Sector 18, Noida', initials: 'KO', home: 'vendor',
    nav: [['vendor', 'receipt', 'Vendor counter']] },
  receiver: { name: 'Citizen', sub: 'Public verification', initials: 'CZ', home: 'receiver',
    nav: [['receiver', 'qr', 'Verify a purchase']] },
};
const VIEW_TITLES = { admin: 'ADMINISTRATION / COMMAND CENTRE', flags: 'ADMINISTRATION / RISK INBOX', batches: 'ADMINISTRATION / BATCH REGISTRY',
  vendor: 'KENDRA PORTAL / VENDOR COUNTER', receiver: 'CITIZEN PORTAL / VERIFY A PURCHASE' };

const state = {
  role: null, view: null, search: '', lastBill: null, verify: null,
  bills: {},
  ledger: [],
  batches: [
    { batch: 'BT-PC-260901', medicine: 'Paracetamol 500mg', quantity: 600, expiry: '2028-08-31', kendra: 'K1', status: 'Received' },
    { batch: 'BT-MT-260831', medicine: 'Metformin 500mg', quantity: 400, expiry: '2028-07-31', kendra: 'K3', status: 'In transit' },
  ],
};
function logEvent(type, text) {
  const t = new Date();
  state.ledger.unshift({ type, text, time: t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
}
logEvent('seal', 'Demo ledger opened with 70 synthetic inventory records');

// ------------------------------------------------------------------ helpers
const $ = s => document.querySelector(s);
const root = $('#view-root');
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h1M20 14h1"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16"/>',
};
const icon = (name, size = 18) => `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const riskBadge = risk => `<span class="badge ${risk.toLowerCase()}">${risk.toUpperCase()}</span>`;
const pageHead = (eyebrow, title, subtitle, action = '') =>
  `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200); }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
const RISK_COLOR = { High: 'var(--red)', Medium: 'var(--amber)', Low: 'var(--lime-dark)' };

// Deterministic QR-style pattern for a bill ID (visual only; verification uses the bill code).
function qrSvg(seed) {
  let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const n = 21, cells = [];
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (finder(x, y)) continue;
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    if ((h >>> 0) % 100 < 45) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  const fp = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  return `<svg class="qr" viewBox="-1 -1 23 23" shape-rendering="crispEdges" role="img" aria-label="Receipt code ${esc(seed)}"><rect x="-1" y="-1" width="23" height="23" fill="#fff"/><g fill="#173c38">${fp(0, 0)}${fp(n - 7, 0)}${fp(0, n - 7)}${cells.join('')}</g></svg>`;
}

// ------------------------------------------------------------------ views
function adminView() {
  const list = flagged(), high = countBy(list, 'High'), med = countBy(list, 'Medium'), low = countBy(list, 'Low');
  const clean = inventory.length - list.length, score = (clean / inventory.length * 100).toFixed(1);
  const p1 = high / list.length * 100, p2 = p1 + med / list.length * 100;
  const last = state.ledger[0];
  return `<div class="page">
    ${pageHead(`OVERVIEW · DATA AS OF ${fmtDate(REFERENCE_DATE).toUpperCase()}`, `${greeting()}, Coordinator.`, 'Here is the integrity pulse across your monitored kendras.',
      `<button class="primary-btn" data-action="batch">${icon('plus', 16)} Create batch</button>`)}
    <div class="stats">
      <div class="stat-card" style="--accent:#41ae92"><span class="label">Kendras monitored</span><strong>${KENDRAS.length}</strong><small>Demo district coverage</small></div>
      <div class="stat-card" style="--accent:#47b4d1"><span class="label">Inventory records</span><strong>${inventory.length}</strong><small>${MEDICINES.length} priority SKUs × ${KENDRAS.length} kendras</small></div>
      <div class="stat-card" style="--accent:#f9be3c"><span class="label">Open risk flags</span><strong>${list.length}</strong><small><span class="attention">${high} high priority</span> need review</small></div>
      <div class="stat-card" style="--accent:#ee7770"><span class="label">Clean records</span><strong>${score}%</strong><small>${clean} of ${inventory.length} pass every rule</small></div>
    </div>
    <div class="grid-main">
      <div class="card">
        <div class="card-title"><div><h2>Priority review queue</h2><p>Ranked by rule severity score</p></div><button class="link-btn" data-view-link="flags">View all ${icon('arrow', 14)}</button></div>
        <div class="risk-list">${list.slice(0, 5).map(x => `
          <button class="risk-row" data-review="${x.r.id}|${esc(x.r.medicine)}">
            <i class="risk-bar" style="--risk:${RISK_COLOR[x.risk]}"></i>
            <div><strong>${kendraName(x.r.id)} · ${esc(x.r.medicine)}</strong><span>${x.hits.map(h => h.label).join(' · ')}</span></div>
            ${riskBadge(x.risk)}
          </button>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-title"><div><h2>Risk distribution</h2><p>Flagged records only</p></div></div>
        <div class="donut-wrap"><div class="donut" style="background:conic-gradient(var(--red) 0 ${p1}%,var(--amber) ${p1}% ${p2}%,var(--lime-dark) ${p2}% 100%)"></div>
          <div class="donut-label"><b>${list.length}</b><small>OPEN FLAGS</small></div></div>
        <div class="legend">
          <div><span style="--c:var(--red)">High priority</span><b>${high}</b></div>
          <div><span style="--c:var(--amber)">Medium review</span><b>${med}</b></div>
          <div><span style="--c:var(--lime-dark)">Low monitor</span><b>${low}</b></div>
        </div>
      </div>
    </div>
    <div class="ledger-strip"><span class="lock">${icon('lock', 18)}</span><div><b>Append-only demo ledger · ${state.ledger.length} event${state.ledger.length === 1 ? '' : 's'}</b><p>${esc(last.text)}</p></div><small>LAST EVENT ${last.time} IST</small></div>
  </div>`;
}

function flagRows() {
  const q = state.search.toLowerCase();
  return flagged().filter(x => `${x.r.id} ${kendraName(x.r.id)} ${x.r.medicine} ${x.risk} ${x.hits.map(h => h.label).join(' ')}`.toLowerCase().includes(q));
}
function flagTbody(rows) {
  if (!rows.length) return `<tr><td colspan="6" class="empty">No flagged records match “${esc(state.search)}”.</td></tr>`;
  return rows.map(x => `<tr class="flagged ${x.risk.toLowerCase()}">
    <td><b>${kendraName(x.r.id)}</b><br><small class="mono">${x.r.id}</small></td>
    <td><b>${esc(x.r.medicine)}</b><br><small>Expiry ${fmtDate(x.r.expiry)}</small></td>
    <td><span class="qty">${x.r.dispatched} / ${x.r.sold} / ${x.r.written} / ${x.r.remaining}</span><br><small>Dispatch / sold / written off / reported</small></td>
    <td><div class="chips">${x.hits.map(h => `<span class="chip">${h.label}</span>`).join('')}</div></td>
    <td>${riskBadge(x.risk)}${x.r.reviewed ? '<br><small class="reviewed">✓ reviewed</small>' : ''}</td>
    <td><button class="link-btn" data-review="${x.r.id}|${esc(x.r.medicine)}">Review</button></td></tr>`).join('');
}
function flagsView() {
  const rows = flagRows();
  return `<div class="page">
    ${pageHead('ADMINISTRATION / RISK INBOX', 'Explainable risk inbox', 'Only records that break a rule are shown. Open one to see exactly which numbers triggered it.',
      `<button class="secondary-btn" data-action="export">${icon('download', 16)} Export CSV</button>`)}
    <div class="rules-strip">${RULES.map(r => `<span><b>${r.label}</b>${{ balance: 'stock doesn’t reconcile', writeoff: `> ${WRITE_OFF_LIMIT * 100}% written off`, expiry: 'sold after expiry', dormant: `no sale ≥ ${DORMANT_DAYS} days` }[r.key]}</span>`).join('')}</div>
    <div class="card table-card"><div class="table-toolbar"><div><strong id="flag-count">${rows.length} flagged records</strong><small class="muted-note">Synthetic data · reference date ${fmtDate(REFERENCE_DATE)}</small></div>
      <input class="search" id="flag-search" value="${esc(state.search)}" placeholder="Search kendra, medicine or rule" aria-label="Search flagged records" /></div>
      <div class="table-scroll"><table><thead><tr><th>Kendra</th><th>Medicine</th><th>Reconciliation</th><th>Triggered rules</th><th>Risk</th><th></th></tr></thead>
      <tbody id="flag-body">${flagTbody(rows)}</tbody></table></div></div>
  </div>`;
}

function batchesView() {
  return `<div class="page">
    ${pageHead('ADMINISTRATION / BATCH REGISTRY', 'Batch custody & traceability', 'Create dispatch batches, bind them to a kendra and confirm when they arrive.',
      `<button class="primary-btn" data-action="batch">${icon('plus', 16)} Create batch</button>`)}
    <div class="split">
      <div class="card table-card"><div class="table-toolbar"><strong>Batch records</strong><span class="mono">${state.batches.length} batches</span></div>
        <div class="table-scroll"><table><thead><tr><th>Batch ID</th><th>Medicine</th><th>Qty</th><th>Expiry</th><th>Destination</th><th>Status</th></tr></thead><tbody>
        ${state.batches.map((b, i) => `<tr><td class="mono">${b.batch}</td><td><b>${esc(b.medicine)}</b></td><td>${b.quantity}</td><td>${fmtDate(b.expiry)}</td><td>${kendraName(b.kendra)}</td>
          <td>${b.status === 'Received' ? '<span class="badge low">RECEIVED</span>' : `<span class="badge medium">${b.status.toUpperCase()}</span><br><button class="link-btn small" data-receive="${i}">Confirm receipt</button>`}</td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card"><div class="card-title"><div><h2>Ledger events</h2><p>Newest first · append-only</p></div></div>
        <ol class="ledger">${state.ledger.slice(0, 8).map(e => `<li><span class="dot ${e.type}"></span><div><b>${esc(e.text)}</b><small>${e.time} IST</small></div></li>`).join('')}</ol>
        <div class="rule-box"><h3>Every batch carries</h3>
          <div><b>01 · Batch identity</b><br>Batch number, SKU, expiry, quantity and destination.</div>
          <div><b>02 · Recipient acknowledgement</b><br>The kendra confirms arrival; stock is added only then.</div>
          <div><b>03 · Event trail</b><br>Dispatch, receipt, sale and review events are kept for audit.</div></div>
      </div>
    </div>
  </div>`;
}

function vendorView() {
  return `<div class="page">
    ${pageHead('KENDRA PORTAL / VENDOR COUNTER', 'Create a sale & verified bill', 'Each bill is checked against stock and expiry, updates the ledger and gives the customer a verifiable receipt.')}
    <div class="split">
      <div class="card"><div class="card-title"><div><h2>New point-of-sale bill</h2><p>Demo mode — no SMS is actually sent</p></div></div>
        <form id="sale-form" class="form-grid">
          <div class="form-field"><label for="f-kendra">Kendra</label><select id="f-kendra" name="kendra">${KENDRAS.map(([id, n]) => `<option value="${id}">${n} (${id})</option>`).join('')}</select></div>
          <div class="form-field"><label for="f-med">Medicine</label><select id="f-med" name="medicine">${MEDICINES.map(x => `<option>${x}</option>`).join('')}</select></div>
          <div class="form-field full stock-line" id="stock-line"></div>
          <div class="form-field"><label for="f-qty">Quantity</label><input id="f-qty" name="quantity" type="number" min="1" value="1" required /></div>
          <div class="form-field"><label for="f-price">Unit price (₹)</label><input id="f-price" name="price" type="number" min="1" value="18" required /></div>
          <div class="form-field"><label for="f-name">Customer name</label><input id="f-name" name="name" placeholder="e.g. Aarav Sharma" required /></div>
          <div class="form-field"><label for="f-phone">Mobile number</label><input id="f-phone" name="phone" inputmode="numeric" maxlength="10" placeholder="10-digit mobile number" required /></div>
          <label class="form-field full consent"><input type="checkbox" name="consent" required /> The customer agreed to receive this bill by SMS.</label>
          <div class="form-field full"><button class="primary-btn" type="submit">${icon('receipt', 16)} Generate bill</button></div>
        </form></div>
      <div class="card"><div class="card-title"><div><h2>Built-in safeguards</h2><p>Checked before a bill is recorded</p></div></div>
        <div class="rule-box">
          <div><b>Expiry check</b><br>Sales are blocked once the stock’s expiry date has passed.</div>
          <div><b>Stock check</b><br>A bill can’t exceed the units the kendra reports on hand.</div>
          <div><b>Ledger update</b><br>Each sale updates sold and on-hand stock and is written to the event trail.</div>
          <div><b>Verifiable receipt</b><br>The customer can check the bill code on the Verify page.</div>
          <div><b>Privacy</b><br>The mobile number is used only for the bill and is masked on the receipt.</div></div></div>
    </div>
    ${state.lastBill ? billReceipt(state.lastBill) : ''}
  </div>`;
}
function stockLine() {
  const k = $('#f-kendra'), m = $('#f-med'), el = $('#stock-line');
  if (!k || !el) return;
  const r = inventory.find(x => x.id === k.value && x.medicine === m.value);
  const expired = r.expiry < REFERENCE_DATE;
  el.innerHTML = expired ? `<span class="warn">${icon('alert', 15)} Stock expired on ${fmtDate(r.expiry)} — sale will be blocked.</span>`
    : `<span>${icon('box', 15)} ${r.remaining} units on hand · expires ${fmtDate(r.expiry)}</span>`;
}
function billReceipt(b) {
  return `<div class="modal-backdrop" data-close="bill"><div class="receipt" role="dialog" aria-label="Bill receipt">
    <div class="receipt-top"><div><h3>AushadhiTrack</h3><small>Verified Jan Aushadhi receipt</small></div><span class="mono">${b.id}</span></div>
    <div class="receipt-row"><span>Customer</span><b>${esc(b.name)}</b></div>
    <div class="receipt-row"><span>Mobile</span><b>••••••${b.phone.slice(-4)}</b></div>
    <div class="receipt-row"><span>Medicine</span><b>${esc(b.medicine)}</b></div>
    <div class="receipt-row"><span>Quantity</span><b>${b.quantity}</b></div>
    <div class="receipt-row"><span>Kendra</span><b>${kendraName(b.kendra)}</b></div>
    <div class="receipt-total receipt-row"><span>Total paid</span><span>₹${b.total}</span></div>
    ${qrSvg(b.id)}
    <p class="receipt-note">Verify this bill with code <b class="mono">${b.id}</b> on the Verify page.</p>
    <div class="modal-actions"><button class="secondary-btn" data-action="close-bill">Close</button><button class="primary-btn" data-action="verify-this">${icon('qr', 16)} Verify it now</button></div>
  </div></div>`;
}

function receiverView() {
  const v = state.verify;
  const result = !v ? '' : v.bill
    ? `<div class="verify-result ok">${icon('shield', 20)}<div><b>Genuine bill · ${v.bill.id}</b><span>${esc(v.bill.medicine)} × ${v.bill.quantity} · ${kendraName(v.bill.kendra)} · ₹${v.bill.total} · ${v.bill.time}</span></div></div>`
    : `<div class="verify-result bad">${icon('alert', 20)}<div><b>No bill found for “${esc(v.code)}”</b><span>This receipt is not in the ledger. Do not accept the medicine and report the kendra.</span></div></div>`;
  return `<div class="page verify">
    ${pageHead('CITIZEN PORTAL / VERIFY', 'Verify a medicine purchase', 'Check that a Jan Aushadhi bill is genuine and was recorded in the ledger.')}
    <div class="card">
      <div class="eyebrow">NO LOGIN REQUIRED</div><h2 class="verify-title">Check your purchase</h2>
      <div class="scanner">${icon('scan', 44)}<span>Scan the code on your receipt, or type it below</span></div>
      <form id="verify-form" class="verify-form"><input class="search" name="code" placeholder="Bill code, e.g. AT-123456" value="${esc(v ? v.code : '')}" aria-label="Bill code" />
        <button class="primary-btn" type="submit">Verify</button></form>
      <button class="link-btn" data-action="scan">${state.lastBill || Object.keys(state.bills).length ? 'Use the latest bill from the vendor counter' : 'Try a fake code to see what happens'}</button>
      ${result}
    </div>
    <div class="card note-card"><div class="card-title"><div><h2>Privacy and future identity protection</h2><p>Proposed for the production phase</p></div></div>
      <p>Aadhaar must never be used as a public identifier or stored unnecessarily. A production rollout would use explicit consent, minimal tokenised identity references, access controls, encryption and a compliance review before any Aadhaar-linked service is introduced.</p></div>
  </div>`;
}

function loginView() {
  return `<div class="login-page"><div class="login-card">
    <span class="login-brand"><span class="mark">✚</span><span>Aushadhi<em>Track</em></span></span>
    <p class="login-eyebrow">JAN AUSHADHI INTEGRITY NETWORK</p>
    <h1>Welcome back.</h1>
    <p class="login-copy">Choose a demo role to enter the medicine-tracking workspace.</p>
    <div class="demo-roles">
      <button data-login="admin"><b>${icon('grid', 19)}</b><span><strong>District coordinator</strong><small>Review risk flags, batches and network integrity</small></span><i>${icon('arrow', 16)}</i></button>
      <button data-login="vendor"><b>${icon('receipt', 19)}</b><span><strong>Kendra vendor</strong><small>Create bills with stock and expiry checks</small></span><i>${icon('arrow', 16)}</i></button>
      <button data-login="receiver"><b>${icon('qr', 19)}</b><span><strong>Medicine receiver</strong><small>Verify that a purchase receipt is genuine</small></span><i>${icon('arrow', 16)}</i></button>
    </div>
    <p class="login-note">Demo access only · no personal identity or password is collected</p>
  </div>
  <div class="login-side"><div>
    <span class="login-seal">${icon('shield', 22)}</span>
    <p>Every medicine movement should be visible, traceable and explainable.</p>
    <ul class="login-points"><li>${icon('check', 15)} 4 explainable fraud rules</li><li>${icon('check', 15)} Append-only event ledger</li><li>${icon('check', 15)} Citizen bill verification</li></ul>
    <small>AUSHADHITRACK · SIH 2026 · PS SIH26198</small>
  </div></div></div>`;
}

// ------------------------------------------------------------------ modals
function openModal(html) { $('#modal-content').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }

function openBatch() {
  openModal(`<h2>Create dispatch batch</h2><p>Register a traceable stock movement. Stock is added to the kendra only when it confirms receipt.</p>
    <form id="batch-form" class="form-grid">
      <div class="form-field"><label for="b-med">Medicine</label><select id="b-med" name="medicine">${MEDICINES.map(x => `<option>${x}</option>`).join('')}</select></div>
      <div class="form-field"><label for="b-qty">Quantity</label><input id="b-qty" name="quantity" type="number" min="1" value="300" required></div>
      <div class="form-field"><label for="b-exp">Expiry date</label><input id="b-exp" name="expiry" type="date" min="${REFERENCE_DATE}" value="2028-09-01" required></div>
      <div class="form-field"><label for="b-k">Destination kendra</label><select id="b-k" name="kendra">${KENDRAS.map(([id, n]) => `<option value="${id}">${n}</option>`).join('')}</select></div>
      <div class="modal-actions form-field full"><button type="button" class="secondary-btn" data-action="close-modal">Cancel</button><button class="primary-btn">Dispatch batch</button></div>
    </form>`);
  $('#batch-form').onsubmit = e => {
    e.preventDefault();
    const d = new FormData(e.target);
    const b = { batch: `BT-AT-${Date.now().toString().slice(-6)}`, medicine: d.get('medicine'), quantity: Number(d.get('quantity')), expiry: d.get('expiry'), kendra: d.get('kendra'), status: 'Dispatched' };
    state.batches.unshift(b);
    logEvent('dispatch', `${b.batch} dispatched: ${b.quantity} × ${b.medicine} → ${kendraName(b.kendra)}`);
    closeModal(); toast('Batch dispatched and written to the ledger.');
    go('batches');
  };
}

function openReview(id, medicine) {
  const r = inventory.find(x => x.id === id && x.medicine === medicine), ev = evaluate(r);
  openModal(`<div class="review-head"><div><div class="eyebrow">${id} · ${kendraName(id).toUpperCase()}</div><h2>${esc(medicine)}</h2></div>${riskBadge(ev.risk)}</div>
    <div class="review-nums"><div><small>Dispatched</small><b>${r.dispatched}</b></div><div><small>Sold</small><b>${r.sold}</b></div><div><small>Written off</small><b>${r.written}</b></div><div><small>Reported</small><b>${r.remaining}</b></div></div>
    <h3 class="review-sub">Why it was flagged</h3>
    <ul class="review-hits">${ev.hits.map(h => `<li><span class="weight">+${h.weight}</span><div><b>${h.label}</b><p>${h.detail}</p></div></li>`).join('')}</ul>
    <p class="review-score">Severity score ${ev.score} → <b>${ev.risk}</b> <span>(≥3 high · 2 medium · 1 low)</span></p>
    <div class="modal-actions"><button class="secondary-btn" data-action="close-modal">Close</button>
      ${r.reviewed ? '<button class="primary-btn" disabled>✓ Reviewed</button>' : `<button class="primary-btn" data-mark="${id}|${esc(medicine)}">${icon('check', 16)} Mark as reviewed</button>`}</div>`);
}

function exportCsv() {
  const rows = [['Kendra ID', 'Kendra', 'Medicine', 'Dispatched', 'Sold', 'Written off', 'Reported', 'Expiry', 'Last sale', 'Rules', 'Score', 'Risk']];
  flagged().forEach(x => rows.push([x.r.id, kendraName(x.r.id), x.r.medicine, x.r.dispatched, x.r.sold, x.r.written, x.r.remaining, x.r.expiry, x.r.lastSale, x.hits.map(h => h.label).join('; '), x.score, x.risk]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `aushadhitrack-risk-review-${REFERENCE_DATE}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
  logEvent('export', `Risk review list exported (${rows.length - 1} records)`);
  toast('Review list downloaded as CSV.');
}

// ------------------------------------------------------------------ render + events
function renderShell() {
  const role = ROLES[state.role];
  $('#nav').innerHTML = role.nav.map(([view, ic, label]) =>
    `<button class="nav-item${state.view === view ? ' active' : ''}" data-view="${view}">${icon(ic)}<span>${label}</span>${view === 'flags' ? `<b>${flagged().length}</b>` : ''}</button>`).join('');
  $('#operator').innerHTML = `<div class="avatar">${role.initials}</div><div><strong>${role.name}</strong><small>${role.sub}</small></div>
    <button class="icon-button ghost" data-action="logout" title="Sign out" aria-label="Sign out">${icon('logout', 17)}</button>`;
  $('#breadcrumbs').textContent = VIEW_TITLES[state.view];
  document.querySelectorAll('[data-role]').forEach(b => b.classList.toggle('active', b.dataset.role === state.role));
  $('#bell-count').textContent = countBy(flagged(), 'High');
}
function render() {
  document.body.classList.toggle('login-active', !state.role);
  if (!state.role) { root.innerHTML = loginView(); return; }
  renderShell();
  root.innerHTML = { admin: adminView, flags: flagsView, batches: batchesView, vendor: vendorView, receiver: receiverView }[state.view]();
  stockLine();
}
function go(view) { state.view = view; render(); window.scrollTo(0, 0); }
function login(role) { state.role = role; state.view = ROLES[role].home; render(); }

document.addEventListener('click', e => {
  const t = e.target.closest('[data-login],[data-view],[data-view-link],[data-role],[data-action],[data-review],[data-mark],[data-receive],[data-close]');
  if (!t) return;
  if (t.matches('[data-close]') && e.target !== t) return; // only backdrop clicks close
  if (t.dataset.login) return login(t.dataset.login);
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.viewLink) return go(t.dataset.viewLink);
  if (t.dataset.role) return login(t.dataset.role);
  if (t.dataset.review) { const [id, med] = t.dataset.review.split('|'); return openReview(id, med); }
  if (t.dataset.mark) {
    const [id, med] = t.dataset.mark.split('|'); const r = inventory.find(x => x.id === id && x.medicine === med);
    r.reviewed = true; logEvent('review', `${kendraName(id)} · ${med} reviewed by coordinator`);
    closeModal(); toast('Marked as reviewed and logged.'); return render();
  }
  if (t.dataset.receive) {
    const b = state.batches[Number(t.dataset.receive)]; b.status = 'Received';
    const r = inventory.find(x => x.id === b.kendra && x.medicine === b.medicine);
    r.dispatched += b.quantity; r.remaining += b.quantity;
    logEvent('receive', `${b.batch} received at ${kendraName(b.kendra)} (+${b.quantity} units)`);
    toast('Receipt confirmed — stock added to the kendra.'); return render();
  }
  if (t.dataset.close === 'bill') { state.lastBill = null; return render(); }
  switch (t.dataset.action) {
    case 'batch': return openBatch();
    case 'export': return exportCsv();
    case 'close-modal': return closeModal();
    case 'close-bill': state.lastBill = null; return render();
    case 'verify-this': state.verify = { code: state.lastBill.id, bill: state.lastBill }; state.lastBill = null; state.role = 'receiver'; return go('receiver');
    case 'scan': {
      const latest = state.lastBill || Object.values(state.bills).slice(-1)[0];
      state.verify = latest ? { code: latest.id, bill: latest } : { code: 'AT-000000', bill: null };
      return render();
    }
    case 'logout': state.role = null; state.view = null; state.verify = null; return render();
  }
});
document.addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); if (state.lastBill) { state.lastBill = null; render(); } } });
document.addEventListener('input', e => {
  if (e.target.id === 'flag-search') {
    state.search = e.target.value; const rows = flagRows();
    $('#flag-body').innerHTML = flagTbody(rows); $('#flag-count').textContent = `${rows.length} flagged records`;
  }
  if (e.target.id === 'f-phone') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
});
document.addEventListener('change', e => { if (e.target.id === 'f-kendra' || e.target.id === 'f-med') stockLine(); });
document.addEventListener('submit', e => {
  if (e.target.id === 'sale-form') {
    e.preventDefault();
    const d = new FormData(e.target), phone = d.get('phone');
    const qty = Number(d.get('quantity')), r = inventory.find(x => x.id === d.get('kendra') && x.medicine === d.get('medicine'));
    if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit Indian mobile number.');
    if (r.expiry < REFERENCE_DATE) { logEvent('block', `Blocked sale of expired ${r.medicine} at ${kendraName(r.id)}`); return toast(`Blocked: this stock expired on ${fmtDate(r.expiry)}.`); }
    if (qty > r.remaining) return toast(`Blocked: only ${r.remaining} units on hand.`);
    r.sold += qty; r.remaining -= qty; r.lastSale = REFERENCE_DATE;
    const bill = { id: `AT-${Date.now().toString().slice(-6)}`, name: d.get('name'), phone, medicine: r.medicine, quantity: qty, kendra: r.id,
      total: qty * Number(d.get('price')), time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) };
    state.bills[bill.id] = bill; state.lastBill = bill;
    logEvent('sale', `Bill ${bill.id}: ${qty} × ${r.medicine} at ${kendraName(r.id)}`);
    toast('Bill recorded in the ledger.'); render();
  }
  if (e.target.id === 'verify-form') {
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim().toUpperCase();
    if (!code) return toast('Enter the code printed on your bill.');
    state.verify = { code, bill: state.bills[code] || null };
    logEvent('verify', `Bill ${code} checked by a citizen: ${state.bills[code] ? 'genuine' : 'not found'}`);
    render();
  }
});
render();
