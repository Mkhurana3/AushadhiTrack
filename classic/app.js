'use strict';
/* AushadhiTrack interface.
 * Every screen is rendered from the ledger in ledger.js, and every action (a bill, a stock count,
 * a recall, a case decision) is appended to that ledger before the screen is redrawn. */
(() => {
  const { TODAY, LAST, KENDRAS, DRUGS, BATCHES, KENDRA, DRUG, BATCH, RULES } = AT;
  const OFFICER = 'R. Verma';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = AT.fmtDate;
  const HI_DATE = new Intl.DateTimeFormat('hi-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const SHORT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fmtShort = s => SHORT.format(new Date(s.slice(0, 10) + 'T00:00:00Z'));
  const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  const num = n => Math.round(n).toLocaleString('en-IN');
  const pad2 = n => String(n).padStart(2, '0');
  const stamp = () => { const d = new Date(); return `${TODAY} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const sumQty = items => items.reduce((s, i) => s + i[1], 0);
  const kname = id => KENDRA[id] ? KENDRA[id].name : id;

  const S = {
    cfg: { ...AT.DEFAULT_RULES }, lang: 'en', caseFilter: 'Open', search: '', ledgerShown: 40,
    tamper: null, lastCheck: null, vtab: 'bill', verify: null, counterDrug: DRUGS[0].code, route: null,
  };
  let db, R;
  function refresh() { db = AT.derive(); R = AT.evaluate(db, S.cfg); S.chain = AT.verifyChain(); }

  // ------------------------------------------------------------------ small pieces
  const MARK = '<svg class="mark" viewBox="0 0 30 18" aria-hidden="true"><rect x="1" y="1" width="28" height="16" rx="5"/><circle cx="8" cy="9" r="3.2"/><circle cx="15" cy="9" r="3.2"/><circle cx="22" cy="9" r="3.2"/></svg>';
  const head = (title, sub, actions = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions}</div>`;
  const riskTag = r => `<span class="risk r-${r.toLowerCase()}">${r}</span>`;
  const statusTag = s => `<span class="status s-${s.toLowerCase().replace(/\s+/g, '-')}">${s}</span>`;
  const onHand = (k, b) => db.onHand[k + '|' + b] || 0;
  const openFindings = () => R.findings.filter(f => f.status !== 'Closed');
  const caseTitle = f => f.kind === 'report'
    ? `Patient report: ${f.complaint.reasonText.charAt(0).toLowerCase() + f.complaint.reasonText.slice(1)}`
    : `${f.drug.short} at ${f.kendra.name}`;

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
  }
  function openDialog(html, label) {
    const d = $('#dlg');
    d.innerHTML = html; d.setAttribute('aria-label', label);
    if (!d.open) d.showModal();
    const first = d.querySelector('input:not([type=hidden]), select, textarea, button.primary');
    if (first) first.focus();
  }
  const closeDialog = () => { const d = $('#dlg'); if (d.open) d.close(); };

  function summarize(e) {
    const d = e.data;
    switch (e.type) {
      case 'dispatch': return `Challan ${d.challan} to ${kname(d.to)}: ${num(sumQty(d.items))} strips of ${d.items.length} medicines`;
      case 'receipt': return `${kname(d.kendra)} received challan ${d.challan}: ${num(sumQty(d.items))} strips`;
      case 'dayclose': {
        const units = d.bills.reduce((s, b) => s + b[3], 0), w = d.written.reduce((s, x) => s + x[1], 0);
        return `${kname(d.kendra)} closed ${fmtShort(d.date)}: ${d.bills.length} bills, ${units} strips${w ? `, ${w} written off` : ''}`;
      }
      case 'sale': return `${kname(d.kendra)} bill ${d.bill[0]}: ${d.bill[3]} × ${DRUG[BATCH[d.bill[2]].drug].name}`;
      case 'count': return `${kname(d.kendra)} counted ${d.items.length} batches`;
      case 'recall': return `Batch ${d.batch} recalled. ${d.reason}`;
      case 'ack': return `${kname(d.kendra)} acknowledged the recall of ${d.batch}`;
      case 'case': return `Case ${d.case} set to ${d.status.toLowerCase()}`;
      case 'complaint': return `Patient report ${d.ref}: ${d.reasonText.toLowerCase()}`;
      case 'transfer-request': return `Transfer requested: ${d.qty} strips of ${d.batch}, ${kname(d.from)} to ${kname(d.to)}`;
      case 'transfer': return `${kname(d.from)} sent ${d.qty} strips of ${d.batch} to ${kname(d.to)}`;
      default: return e.type;
    }
  }
  const TYPE_LABEL = {
    dispatch: 'Dispatch', receipt: 'Receipt', dayclose: 'Day close', sale: 'Bill', count: 'Stock count', recall: 'Recall',
    ack: 'Recall noted', case: 'Case update', complaint: 'Patient report', 'transfer-request': 'Transfer request', transfer: 'Transfer',
  };

  // ------------------------------------------------------------------ routing and shell
  function parseRoute() {
    const h = location.hash.slice(1) || '/';
    const i = h.indexOf('?');
    const path = i < 0 ? h : h.slice(0, i);
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
  }

  function shell({ ctx, who, role, nav, active, body }) {
    return `<header class="topbar">
      <a class="brand" href="#/">${MARK}<span>AushadhiTrack</span></a>
      <div class="ctx">${ctx}</div>
      <div class="who"><span class="who-name">${who}</span><span class="who-role">${role}</span><a class="signout" href="#/">Sign out</a></div>
    </header>
    <div class="layout">
      <nav class="side" aria-label="Sections"><ul>${nav.map(n => `<li><a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}><span>${n.label}</span>${n.count ? `<span class="count${n.alert ? ' alert' : ''}">${n.count}</span>` : ''}</a></li>`).join('')}</ul></nav>
      <main id="main" tabindex="-1">${body}</main>
    </div>
    ${footer()}`;
  }
  const footer = () => `<footer class="foot"><p>${S.lang === 'hi' && document.body.dataset.view === 'verify'
    ? 'स्मार्ट इंडिया हैकथॉन 2026 (SIH26198) के लिए प्रोटोटाइप। सभी केंद्र, लोग और आँकड़े काल्पनिक हैं।'
    : 'Prototype for Smart India Hackathon 2026, problem statement SIH26198. Every kendra, person and figure is synthetic.'}</p><p><a href="../">Open the current version</a></p></footer>`;

  function render() {
    const { parts, q } = parseRoute();
    const key = location.hash;
    const changed = key !== S.route;
    S.route = key;
    document.body.dataset.view = parts[0] || 'start';
    let html;
    if (!parts.length) html = startView();
    else if (parts[0] === 'officer') html = officerShell(parts.slice(1), q);
    else if (parts[0] === 'kendra' && KENDRA[parts[1]]) html = kendraShell(parts[1], parts.slice(2));
    else if (parts[0] === 'verify') html = verifyView(q, changed);
    else { location.hash = '#/'; return; }
    $('#app').innerHTML = html;
    const h1 = $('#app h1');
    document.title = (h1 ? h1.textContent + ' | ' : '') + 'AushadhiTrack';
    if (changed) {
      window.scrollTo(0, 0);
      const m = $('#main');
      if (m && parts.length) m.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------------ start
  function startView() {
    return `<main id="main" class="start">
      <section class="start-intro">
        <a class="brand big" href="#/">${MARK}<span>AushadhiTrack</span></a>
        <h1>Follows every strip of Jan Aushadhi medicine from the warehouse to the patient, and shows where it goes missing.</h1>
        <p>A working prototype for SIH 2026 (SIH26198). It runs on one synthetic district: 8 kendras in Ghaziabad, 10 medicines, 60 days of dispatches, bills and stock counts.</p>
        ${flowDiagram()}
      </section>
      <section class="start-roles" aria-labelledby="roles-h">
        <h2 id="roles-h">Open the prototype as</h2>
        <a class="role" href="#/officer"><strong>PMBI field officer</strong><span>Review cases across the district, trace batches, record recalls and check the ledger.</span></a>
        <form class="role" id="kendra-open"><strong>Kendra pharmacist</strong><span>Create bills, count stock and respond to recalls.</span>
          <span class="role-pick"><label for="kendra-pick" class="sr">Kendra</label><select id="kendra-pick">${KENDRAS.map(k => `<option value="${k.id}">${k.name}</option>`).join('')}</select><button class="btn">Open counter</button></span></form>
        <a class="role" href="#/verify"><strong>Patient</strong><span>Check a bill or the batch on a medicine strip. No sign-in needed.</span></a>
        <p class="start-note">No passwords. Everything you do here is written to the prototype's ledger in this browser tab and is gone when you reload.</p>
      </section>
    </main>${footer()}`;
  }
  function flowDiagram() {
    const stops = [['Warehouse', 'Dispatch is matched with the kendra’s receipt'], ['Kendra', 'Weekly stock count is matched with the ledger'], ['Counter', 'Price, expiry and recalls are checked on every bill'], ['Patient', 'Scans the bill to check it']];
    return `<ol class="flow">${stops.map(([t, d]) => `<li><strong>${t}</strong><span>${d}</span></li>`).join('')}</ol>`;
  }

  // ------------------------------------------------------------------ officer
  function officerShell(p, q) {
    const nav = [
      { key: 'overview', href: '#/officer', label: 'Overview' },
      { key: 'cases', href: '#/officer/cases', label: 'Cases', count: openFindings().length },
      { key: 'stock', href: '#/officer/stock', label: 'Expiring stock', count: R.advisories.filter(a => !(a.request || a.done)).length },
      { key: 'batches', href: '#/officer/batches', label: 'Batches and recalls' },
      { key: 'ledger', href: '#/officer/ledger', label: 'Ledger', count: S.chain.ok ? 0 : 'Altered', alert: true },
      { key: 'rules', href: '#/officer/rules', label: 'Rules' },
    ];
    const active = p[0] || 'overview';
    const views = {
      overview: () => overview(),
      cases: () => p[1] ? caseView(p[1]) : casesView(),
      stock: () => stockView(),
      batches: () => p[1] ? batchView(p[1]) : batchesView(),
      ledger: () => ledgerView(q),
      rules: () => rulesView(),
    };
    const body = (views[active] || views.overview)();
    return shell({ ctx: `${AT.DISTRICT} district`, who: OFFICER, role: 'PMBI field officer', nav, active, body });
  }

  function overview() {
    const open = openFindings(), high = open.filter(f => f.risk === 'High').length;
    const value = open.reduce((s, f) => s + f.value, 0);
    const exp = R.advisories.filter(a => a.type === 'expiring' && !a.done);
    const unsold = exp.reduce((s, a) => s + a.unsold, 0);
    const rc = R.recalls, held = rc.reduce((s, r) => s + r.stillHeld, 0);
    const stillBilling = rc.flatMap(r => r.rows.filter(x => x.soldAfter > 0)).length;
    const top = open.slice(0, 6);
    return `${head(`${AT.DISTRICT} district`, `Figures run to the stock counts submitted on the evening of ${fmtDate(LAST)}, plus today’s bills.`)}
    <dl class="figures">
      <div><dt>Open cases</dt><dd>${open.length}</dd><p>${high} high risk</p></div>
      <div><dt>Missing stock and overcharges</dt><dd>${inr(value)}</dd><p>Across open cases</p></div>
      <div><dt>Likely to expire unsold</dt><dd>${num(unsold)} <small>strips</small></dd><p>${exp.length} batches in the next ${S.cfg.expiryWindow} days</p></div>
      <div><dt>Recalled stock in kendras</dt><dd>${num(held)} <small>strips</small></dd><p>${stillBilling ? `${stillBilling} kendra still billing it` : 'No kendra is billing it'}</p></div>
    </dl>
    <div class="overview-grid">
      <section class="panel" aria-labelledby="mx-h">
        <h2 id="mx-h">Where the findings are</h2>
        <p class="sub">One square per medicine at each kendra. The number is the case score; select a square to open the case.</p>
        ${matrix()}
      </section>
      <section class="panel" aria-labelledby="first-h">
        <h2 id="first-h">Review first</h2>
        <ul class="queue">${top.map(f => `<li><a href="#/officer/cases/${f.id}">
          <span class="q-title">${esc(caseTitle(f))}</span>
          <span class="q-why">${f.kind === 'report' ? esc(f.complaint.code || 'Patient report') : f.hits.map(h => h.title).join(', ')}</span>
          ${riskTag(f.risk)}</a></li>`).join('') || '<li class="empty-line">No open cases.</li>'}</ul>
        <a class="more" href="#/officer/cases">All cases</a>
      </section>
    </div>
    <section class="panel ledger-mini" aria-labelledby="lg-h">
      <div class="panel-head"><h2 id="lg-h">Ledger</h2>${chainLine()}</div>
      <div class="table-wrap"><table class="data compact"><tbody>${AT.ledger.slice(-5).reverse().map(e => `<tr><td class="nowrap">${fmtShort(e.at)} ${e.at.slice(11)}</td><td>${TYPE_LABEL[e.type]}</td><td>${esc(summarize(e))}</td></tr>`).join('')}</tbody></table></div>
      <a class="more" href="#/officer/ledger">Open the ledger</a>
    </section>`;
  }
  const chainLine = () => S.chain.ok
    ? `<p class="chain-line ok">All ${num(S.chain.count)} records match their hashes</p>`
    : `<p class="chain-line bad">Record #${S.chain.seq} has been altered</p>`;

  function matrix() {
    const byKey = {};
    R.findings.filter(f => f.kind === 'rule' && f.status !== 'Closed').forEach(f => { byKey[f.kendra.id + '|' + f.drug.code] = f; });
    return `<div class="matrix-wrap"><table class="matrix">
      <thead><tr><td></td>${DRUGS.map(d => `<th scope="col" title="${esc(d.name)}"><span>${d.short}</span></th>`).join('')}</tr></thead>
      <tbody>${KENDRAS.map(k => `<tr><th scope="row">${k.name}</th>${DRUGS.map(d => {
        const f = byKey[k.id + '|' + d.code];
        return `<td>${f ? `<a class="cell r-${f.risk.toLowerCase()}" href="#/officer/cases/${f.id}" title="${esc(`${d.name} at ${k.name}: ${f.hits.map(h => h.title).join(', ')}`)}"><span class="sr">${esc(`${d.short} at ${k.name}, ${f.risk} risk, score`)}</span>${f.score}</a>` : '<span class="cell" aria-hidden="true"></span>'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="legend"><span class="key r-high"></span>High <span class="key r-medium"></span>Medium <span class="key r-low"></span>Low <span class="key"></span>No findings</p>`;
  }

  // cases -------------------------------------------------------------
  function filteredCases() {
    const q = S.search.trim().toLowerCase();
    return R.findings.filter(f => S.caseFilter === 'All' || f.status === S.caseFilter)
      .filter(f => !q || [f.id, f.kendra && f.kendra.name, f.drug && f.drug.name, f.hits.map(h => h.title).join(' '), f.kind === 'report' ? f.complaint.reasonText : '']
        .join(' ').toLowerCase().includes(q));
  }
  function caseRows(rows) {
    if (!rows.length) return `<tr><td colspan="7" class="empty-line">No cases match. Try another status or clear the search.</td></tr>`;
    return rows.map(f => `<tr data-href="#/officer/cases/${f.id}">
      <td class="nowrap"><a href="#/officer/cases/${f.id}">${f.id}</a></td>
      <td>${f.kendra ? f.kendra.name : 'Not given'}</td>
      <td>${f.drug ? esc(f.drug.name) : f.kind === 'report' ? 'Patient report' : ''}</td>
      <td>${f.kind === 'report' ? esc(f.complaint.reasonText) : f.hits.map(h => h.title).join(', ')}</td>
      <td class="num">${f.value ? inr(f.value) : ''}</td>
      <td>${riskTag(f.risk)}</td><td>${statusTag(f.status)}</td></tr>`).join('');
  }
  function casesView() {
    const filters = ['Open', 'In inquiry', 'Closed', 'All'];
    const count = s => s === 'All' ? R.findings.length : R.findings.filter(f => f.status === s).length;
    const rows = filteredCases();
    return `${head('Cases', 'A case is one medicine at one kendra where a rule found a problem, or a report sent in by a patient.')}
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Show cases by status">${filters.map(s => `<button type="button" data-filter="${s}" aria-pressed="${S.caseFilter === s}">${s} <span>${count(s)}</span></button>`).join('')}</div>
      <label class="search"><span class="sr">Search cases</span><input id="case-search" type="search" placeholder="Search kendra, medicine or case number" value="${esc(S.search)}"></label>
    </div>
    <div class="table-wrap"><table class="data cases">
      <thead><tr><th>Case</th><th>Kendra</th><th>Medicine</th><th>What was found</th><th class="num">Money involved</th><th>Risk</th><th>Status</th></tr></thead>
      <tbody id="case-rows">${caseRows(rows)}</tbody></table></div>`;
  }

  function caseView(id) {
    const back = '<a class="back" href="#/officer/cases">All cases</a>';
    const f = R.findings.find(x => x.id === id);
    if (!f) {
      return `${back}${head(`Case ${esc(id)} has no findings now`, 'The rules no longer flag this record. That happens when a limit is changed on the Rules page, or when the ledger has been altered.')}
        <p><a href="#/officer/rules">Check the rules</a> or <a href="#/officer/ledger">check the ledger</a>.</p>`;
    }
    if (f.kind === 'report') return reportView(f, back);
    const transit = f.hits.find(h => h.rule === 'transit');
    return `${back}
    <div class="case-head">
      <div><p class="case-ref">Case ${f.id}. ${f.kendra.name} kendra (${f.kendra.id}), ${esc(f.drug.name)}, ${f.drug.pack}, MRP ₹${f.drug.mrp}.</p>
      <h1>${esc(f.drug.short)} at ${f.kendra.name}</h1></div>
      <div class="case-tags">${riskTag(f.risk)} ${statusTag(f.status)}</div>
    </div>
    <div class="case-grid">
      <div class="case-main">
        <section class="panel" aria-labelledby="rec-h"><h2 id="rec-h">Stock reconciliation</h2>${sheet(f, transit)}</section>
        <section class="panel" aria-labelledby="why-h"><h2 id="why-h">Why it was flagged</h2>
          <ul class="hits">${f.hits.map(h => `<li><span class="weight" title="Weight">+${h.weight}</span><div><h3>${h.title}</h3><p>${esc(h.text)}</p></div></li>`).join('')}</ul>
          <p class="score">Score ${f.score}, so ${f.risk.toLowerCase()} risk. A score of 3 or more is high, 2 is medium and 1 is low. <a href="#/officer/rules">How the rules work</a></p>
        </section>
        <section class="panel" aria-labelledby="sales-h"><h2 id="sales-h">Strips billed per day</h2>${salesChart(f)}</section>
        ${evidence(f)}
      </div>
      <aside class="case-side">${statusPanel(f)}${historyPanel(f)}</aside>
    </div>`;
  }

  function sheet(f, transit) {
    const s = f.snap;
    if (!s.date) return '<p>No stock count has been submitted for this medicine yet.</p>';
    const dispatched = AT.batchesOf(f.drug.code).reduce((t, b) => t + (db.dispatched[f.kendra.id + '|' + b.id] || 0), 0);
    const rows = [];
    if (transit) {
      rows.push(['Dispatched by the warehouse', num(dispatched)]);
      rows.push(['Lost between warehouse and kendra', '− ' + num(dispatched - s.received), 'flag']);
    }
    rows.push(['Received at the kendra', num(s.received)]);
    if (s.tin) rows.push(['Transferred in from other kendras', '+ ' + num(s.tin)]);
    rows.push(['Billed', '− ' + num(s.sold)]);
    rows.push(['Written off', '− ' + num(s.written), f.hits.some(h => h.rule === 'writeoff') ? 'flag' : '']);
    if (s.tout) rows.push(['Transferred out', '− ' + num(s.tout)]);
    const diff = s.counted - s.expected;
    return `<table class="sheet"><tbody>
      ${rows.map(([l, v, c]) => `<tr${c ? ` class="${c}"` : ''}><th scope="row">${l}</th><td>${v}</td></tr>`).join('')}
      <tr class="subtotal"><th scope="row">Should be on the shelf</th><td>${num(s.expected)}</td></tr>
      <tr><th scope="row">Counted on ${fmtDate(s.date)}</th><td>${num(s.counted)}</td></tr>
      <tr class="net ${diff ? 'bad' : 'ok'}"><th scope="row">${diff < 0 ? 'Missing' : diff > 0 ? 'Extra on the shelf' : 'Difference'}</th>
        <td>${diff ? `${num(Math.abs(diff))} strips${diff < 0 ? `<span>${inr(-diff * f.drug.mrp)} at MRP</span>` : ''}` : 'None'}</td></tr>
    </tbody></table>
    <p class="sheet-note">In strips, up to the stock count on ${fmtDate(s.date)}. Bills after the count are not included.</p>`;
  }

  function flaggedBills(f) {
    const map = new Map();
    f.hits.forEach(h => (h.bills || []).forEach(b => {
      const why = { recalled: 'Recalled batch', expired: 'Expired batch', overcharge: 'Above MRP', bulk: 'Bulk buyer' }[h.rule];
      if (!map.has(b.bill)) map.set(b.bill, { ...b, why: [] });
      if (!map.get(b.bill).why.includes(why)) map.get(b.bill).why.push(why);
    }));
    return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
  }

  function salesChart(f) {
    const days = AT.daysBetween(AT.START, TODAY) + 1, W = 640, H = 150, L = 30, B = 22, T = 10;
    const per = new Array(days).fill(0), flag = new Array(days).fill(0);
    const flagged = new Set(flaggedBills(f).map(b => b.bill));
    f.lines.forEach(s => { const i = AT.daysBetween(AT.START, s.date); per[i] += s.qty; if (flagged.has(s.bill)) flag[i] += s.qty; });
    const max = Math.max(4, ...per), step = (W - L) / days, bw = Math.max(2, step - 2);
    const y = v => T + (H - B - T) * (1 - v / max);
    const markers = [];
    AT.batchesOf(f.drug.code).forEach(b => {
      const r = db.recalls[b.id];
      if (r && r.date >= AT.START) markers.push([r.date, `${b.id} recalled`]);
      if (b.expiry >= AT.START && b.expiry <= TODAY) markers.push([b.expiry, `${b.id} expired`]);
    });
    if (f.snap.date) markers.push([f.snap.date, 'Stock count']);
    const xOf = d => L + AT.daysBetween(AT.START, d) * step + step / 2;
    const ticks = [0, 20, 40, days - 1].map(i => AT.addDays(AT.START, i));
    const total = per.reduce((s, x) => s + x, 0);
    return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${total} strips billed over ${days} days, up to ${Math.max(...per)} in a day`)}">
      <line x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}" class="axis"/>
      <line x1="${L}" x2="${W}" y1="${y(max)}" y2="${y(max)}" class="grid"/>
      <text x="${L - 6}" y="${y(max) + 4}" class="tick" text-anchor="end">${max}</text>
      <text x="${L - 6}" y="${y(0) + 4}" class="tick" text-anchor="end">0</text>
      ${per.map((v, i) => v ? `<rect x="${L + i * step + 1}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" class="bar"/>` : '').join('')}
      ${flag.map((v, i) => v ? `<rect x="${L + i * step + 1}" y="${y(v)}" width="${bw}" height="${y(0) - y(v)}" class="bar flagged"/>` : '').join('')}
      ${markers.map(([d, t], i) => `<line x1="${xOf(d)}" x2="${xOf(d)}" y1="${T - 4}" y2="${y(0)}" class="marker"/><text x="${xOf(d) - 4}" y="${T + 6 + i * 13}" class="mlabel" text-anchor="end">${esc(t)}</text>`).join('')}
      ${ticks.map((d, i) => `<text x="${i === ticks.length - 1 ? W - 2 : xOf(d)}" y="${H - 6}" class="tick" text-anchor="${i === ticks.length - 1 ? 'end' : 'middle'}">${fmtShort(d)}</text>`).join('')}
    </svg></div>
    <p class="legend"><span class="key bar"></span>Billed <span class="key bar flagged"></span>On a flagged bill</p>`;
  }

  function evidence(f) {
    const bills = flaggedBills(f);
    if (!bills.length) return '';
    const shown = bills.slice(0, 12);
    return `<section class="panel" aria-labelledby="ev-h"><h2 id="ev-h">Flagged bills</h2>
      <div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Bill</th><th>Customer</th><th>Batch</th><th class="num">Strips</th><th class="num">Per strip</th><th>Flag</th></tr></thead>
      <tbody>${shown.map(b => `<tr><td class="nowrap">${fmtShort(b.date)}</td><td class="nowrap">${b.bill}</td><td class="nowrap">${AT.mask(b.phone)}</td><td>${b.batch}</td><td class="num">${b.qty}</td><td class="num${b.price > f.drug.mrp ? ' over' : ''}">₹${b.price}</td><td>${b.why.join(', ')}</td></tr>`).join('')}</tbody></table></div>
      ${bills.length > shown.length ? `<p class="sub">Showing the latest ${shown.length} of ${bills.length} flagged bills.</p>` : ''}</section>`;
  }

  function statusPanel(f) {
    const st = f.status;
    const buttons = st === 'Open'
      ? '<button class="btn primary" name="status" value="In inquiry">Start inquiry</button><button class="btn" name="status" value="Closed">Close case</button>'
      : st === 'In inquiry'
        ? '<button class="btn primary" name="status" value="Closed">Close case</button><button class="btn" name="status" value="Open">Move back to open</button>'
        : '<button class="btn" name="status" value="Open">Reopen case</button>';
    return `<section class="panel" aria-labelledby="st-h"><h2 id="st-h">Status</h2>
      <p class="status-now">${statusTag(st)}</p>
      <form id="case-form" data-case="${f.id}" novalidate>
        <label for="case-note">Note for the record</label>
        <textarea id="case-note" name="note" rows="3" placeholder="What did you check or decide?"></textarea>
        <p class="form-error" id="case-error" role="alert"></p>
        <div class="actions">${buttons}</div>
      </form></section>`;
  }
  function historyPanel(f) {
    const ev = db.cases[f.id] || [];
    const first = f.kind === 'report' ? `Report received from a patient` : `Flagged by the rules`;
    const firstAt = f.kind === 'report' ? f.complaint.at : null;
    return `<section class="panel" aria-labelledby="hist-h"><h2 id="hist-h">History</h2><ol class="history">
      <li><span class="h-when">${firstAt ? `${fmtDate(firstAt)}, ${firstAt.slice(11)}` : 'Automatic'}</span><span>${first}</span></li>
      ${ev.map(e => `<li><span class="h-when">${fmtDate(e.at)}, ${e.at.slice(11)}</span><span><strong>${e.status}</strong> by ${esc(e.actor)}</span>${e.note ? `<q>${esc(e.note)}</q>` : ''}</li>`).join('')}
    </ol></section>`;
  }

  function reportView(f, back) {
    const c = f.complaint;
    const sale = c.kind === 'bill' ? db.sales.find(s => s.bill === c.code) : null;
    const b = c.kind === 'batch' ? BATCH[c.code] : sale ? BATCH[sale.batch] : null;
    return `${back}
    <div class="case-head"><div><p class="case-ref">Report ${c.ref}, received ${fmtDate(c.at)} at ${c.at.slice(11)}.</p><h1>${esc(caseTitle(f))}</h1></div>
      <div class="case-tags">${riskTag(f.risk)} ${statusTag(f.status)}</div></div>
    <div class="case-grid"><div class="case-main">
      <section class="panel"><h2>What the patient said</h2>
        <dl class="facts">
          <div><dt>Problem</dt><dd>${esc(c.reasonText)}</dd></div>
          <div><dt>${c.kind === 'bill' ? 'Bill number' : 'Batch number'}</dt><dd>${esc(c.code || 'Not given')}</dd></div>
          <div><dt>Call back</dt><dd>${c.phone ? AT.mask(c.phone) : 'Not requested'}</dd></div>
        </dl>
        ${c.details ? `<blockquote>${esc(c.details)}</blockquote>` : ''}
      </section>
      <section class="panel"><h2>What the ledger shows</h2>
        ${sale ? `<p>Bill ${sale.bill} was recorded at ${kname(sale.kendra)} on ${fmtDate(sale.date)}: ${sale.qty} strips of ${esc(DRUG[sale.drug].name)} from batch ${sale.batch} at ₹${sale.price} a strip (MRP ₹${DRUG[sale.drug].mrp}).</p>
          ${sale.price > DRUG[sale.drug].mrp ? `<p class="callout bad">The bill is above MRP by ₹${(sale.price - DRUG[sale.drug].mrp) * sale.qty}. <a href="#/officer/cases/${'C-' + sale.kendra.slice(3) + sale.drug.slice(1)}">Open the kendra’s case</a></p>` : ''}`
        : c.kind === 'bill' ? `<p class="callout bad">No bill numbered ${esc(c.code)} is in the ledger. The sale was never recorded, or the receipt is not genuine.</p>`
        : b ? `<p>Batch ${b.id} is ${esc(DRUG[b.drug].name)}, expiring ${fmtDate(b.expiry)}${db.recalls[b.id] ? `, recalled on ${fmtDate(db.recalls[b.id].date)}` : ''}. <a href="#/officer/batches/${b.id}">Trace the batch</a></p>`
        : `<p class="callout bad">Batch ${esc(c.code)} is not in the records. The strip may be counterfeit.</p>`}
      </section>
    </div><aside class="case-side">${statusPanel(f)}${historyPanel(f)}</aside></div>`;
  }

  // expiring stock -----------------------------------------------------
  function stockView() {
    const expired = R.advisories.filter(a => a.type === 'expired');
    const exp = R.advisories.filter(a => a.type === 'expiring');
    return `${head('Expiring stock', `Batches that will reach their expiry date before they sell at the kendra’s current rate, looking ${S.cfg.expiryWindow} days ahead. Moving them to a kendra that sells faster saves the stock.`)}
    ${expired.length ? `<section class="panel warn-panel"><h2>Expired but still on the books</h2>
      <p class="sub">Write these off and send them back with the next warehouse pickup.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Kendra</th><th>Medicine</th><th>Batch</th><th>Expired on</th><th class="num">Strips</th></tr></thead>
      <tbody>${expired.map(a => `<tr><td>${a.kendra.name}</td><td>${esc(a.drug.name)}</td><td><a href="#/officer/batches/${a.batch.id}">${a.batch.id}</a></td><td>${fmtDate(a.batch.expiry)}</td><td class="num">${a.onHand}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <section class="panel"><h2>Likely to expire unsold</h2>
    ${exp.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Kendra</th><th>Medicine and batch</th><th>Expires</th><th class="num">On hand</th><th class="num">Sells by then</th><th class="num">Left over</th><th>Suggested move</th><th></th></tr></thead>
      <tbody>${exp.map(a => `<tr><td>${a.kendra.name}</td><td>${esc(a.drug.name)}<br><a class="small" href="#/officer/batches/${a.batch.id}">${a.batch.id}</a></td>
        <td class="nowrap">${fmtDate(a.batch.expiry)}<br><span class="small">in ${a.left} days</span></td>
        <td class="num">${a.onHand}</td><td class="num">${a.willSell}<br><span class="small">${a.rate.toFixed(1)} a day</span></td><td class="num strong">${a.unsold}</td>
        <td>${a.to ? `${a.move} strips to ${a.to.kendra.name}<br><span class="small">sells ${a.to.rate.toFixed(1)} a day</span>` : 'No kendra can use it in time'}</td>
        <td class="nowrap">${a.done ? `<span class="done">Sent ${fmtShort(a.done.at)}</span>` : a.request ? `<span class="pending">Waiting for ${a.kendra.name}</span>` : a.to ? `<button class="btn small" data-act="transfer" data-id="${a.id}">Request transfer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="empty-line">Nothing is likely to expire unsold in the next ${S.cfg.expiryWindow} days.</p>`}</section>`;
  }

  // batches ------------------------------------------------------------
  function batchesView() {
    const rows = BATCHES.slice().sort((a, b) => (db.recalls[b.id] ? 1 : 0) - (db.recalls[a.id] ? 1 : 0) || a.expiry.localeCompare(b.expiry));
    const status = b => db.recalls[b.id] ? '<span class="status s-recalled">Recalled</span>' : b.expiry < TODAY ? '<span class="status s-expired">Expired</span>' : AT.daysBetween(TODAY, b.expiry) <= 90 ? `<span class="status s-soon">Expires in ${AT.daysBetween(TODAY, b.expiry)} days</span>` : '<span class="status s-ok">In use</span>';
    return `${head('Batches and recalls', 'Every batch supplied to the district, where it went, and whether it can still be billed.')}
    ${R.recalls.map(recallPanel).join('')}
    <section class="panel"><h2>All batches</h2><div class="table-wrap"><table class="data">
      <thead><tr><th>Batch</th><th>Medicine</th><th>Made</th><th>Expires</th><th class="num">Dispatched</th><th class="num">In kendras now</th><th>Status</th></tr></thead>
      <tbody>${rows.map(b => {
        const disp = KENDRAS.reduce((s, k) => s + (db.dispatched[k.id + '|' + b.id] || 0), 0);
        const held = KENDRAS.reduce((s, k) => s + Math.max(onHand(k.id, b.id), 0), 0);
        return `<tr data-href="#/officer/batches/${b.id}"><td><a href="#/officer/batches/${b.id}">${b.id}</a></td><td>${esc(DRUG[b.drug].name)}</td><td class="nowrap">${fmtDate(b.mfg)}</td><td class="nowrap">${fmtDate(b.expiry)}</td><td class="num">${num(disp)}</td><td class="num">${num(held)}</td><td>${status(b)}</td></tr>`;
      }).join('')}</tbody></table></div></section>`;
  }
  function recallPanel(r) {
    return `<section class="panel recall" aria-label="Recall of batch ${r.batch}">
      <div class="panel-head"><h2>Recall: ${esc(r.drug.name)}, batch <a href="#/officer/batches/${r.batch}">${r.batch}</a></h2><span class="status s-recalled">Recalled ${fmtDate(r.date)}</span></div>
      <p>${esc(r.reason)}. Reference: ${esc(r.ref)}.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th>Kendra</th><th class="num">Received</th><th class="num">Still held</th><th class="num">Billed after recall</th><th>Recall noted</th></tr></thead>
      <tbody>${r.rows.map(x => `<tr${x.soldAfter ? ' class="row-bad"' : ''}><td>${x.kendra.name}</td><td class="num">${x.received}</td><td class="num">${Math.max(x.onHand, 0)}</td><td class="num">${x.soldAfter || ''}</td><td>${x.ack ? fmtDate(x.ack) : '<span class="pending">Not yet</span>'}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  }

  function batchView(id) {
    const b = BATCH[id], back = '<a class="back" href="#/officer/batches">All batches</a>';
    if (!b) return `${back}${head('Batch not found', `There is no batch ${esc(id)} in the district records.`)}`;
    const d = DRUG[b.drug], rc = db.recalls[id];
    const disp = db.dispatches.filter(x => x.items.some(i => i[0] === id));
    const rec = db.receipts.filter(x => x.items.some(i => i[0] === id));
    const sales = db.sales.filter(s => s.batch === id);
    const qOf = (x, field = 0) => (x.items.find(i => i[0] === id) || [0, 0])[1];
    const dispatched = disp.reduce((s, x) => s + qOf(x), 0), received = rec.reduce((s, x) => s + qOf(x), 0);
    const billed = sales.reduce((s, x) => s + x.qty, 0);
    const trail = [[b.mfg, `Made. Shelf life two years.`]];
    if (disp.length) trail.push([disp[0].date, `Dispatched from ${AT.WAREHOUSE}: ${num(dispatched)} strips to ${disp.length} kendras on ${disp.length} challans.`]);
    if (rec.length) trail.push([rec[0].date, `Received by ${rec.length} kendras: ${num(received)} strips${received < dispatched ? `, ${dispatched - received} fewer than dispatched` : ''}.`]);
    if (sales.length) trail.push([sales[0].date, `First bill. ${num(billed)} strips billed on ${num(sales.length)} bills so far; the latest on ${fmtDate(sales[sales.length - 1].date)}.`]);
    if (rc) {
      const after = sales.filter(x => x.recalled), kset = [...new Set(after.map(x => kname(x.kendra)))];
      trail.push([rc.date, `Recalled. ${esc(rc.reason)}.${after.length ? ` Since then ${after.reduce((t, x) => t + x.qty, 0)} strips were still billed at ${kset.join(', ')}.` : ''}`]);
    }
    trail.push([b.expiry, b.expiry < TODAY ? 'Expired.' : 'Expiry date.']);
    trail.sort((x, y) => x[0].localeCompare(y[0]));
    return `${back}
    <div class="case-head"><div><p class="case-ref">${esc(d.name)}, ${d.pack}, MRP ₹${d.mrp}</p><h1>Batch ${id}</h1></div>
      <div class="case-tags">${rc ? '<span class="status s-recalled">Recalled</span>' : b.expiry < TODAY ? '<span class="status s-expired">Expired</span>' : '<span class="status s-ok">In use</span>'}
      ${rc ? '' : `<button class="btn" data-act="recall" data-id="${id}">Record a recall</button>`}</div></div>
    <div class="case-grid split">
      <section class="panel"><h2>Custody trail</h2><ol class="trail">${trail.map(([dt, t]) => `<li${dt > TODAY ? ' class="future"' : ''}><time datetime="${dt}">${fmtDate(dt)}</time><p>${t}</p></li>`).join('')}</ol></section>
      <section class="panel"><h2>By kendra</h2><div class="table-wrap"><table class="data"><thead><tr><th>Kendra</th><th class="num">Received</th><th class="num">Billed</th><th class="num">Written off</th><th class="num">On the books</th></tr></thead>
        <tbody>${KENDRAS.filter(k => db.received[k.id + '|' + id] || db.tin[k.id + '|' + id]).map(k => {
          const kb = k.id + '|' + id;
          return `<tr><td>${k.name}</td><td class="num">${(db.received[kb] || 0) + (db.tin[kb] || 0)}</td><td class="num">${db.sold[kb] || 0}</td><td class="num">${db.written[kb] || 0}</td><td class="num">${onHand(k.id, id)}</td></tr>`;
        }).join('')}</tbody></table></div></section>
    </div>`;
  }

  // ledger ---------------------------------------------------------------
  function ledgerView(q) {
    const c = S.chain, shown = AT.ledger.slice(-S.ledgerShown).reverse();
    const focus = Number(q.get('seq')) || null;
    const list = focus && !shown.some(e => e.seq === focus) ? [AT.ledger[focus - 1], ...shown] : shown;
    const status = c.ok
      ? `<div class="chain ok"><div><p><strong>All ${num(c.count)} records match their hashes.</strong></p>
          <p>Latest hash <code>${c.head.slice(0, 16)}</code>${S.lastCheck ? `. Checked at ${S.lastCheck} in ${c.ms} ms` : ''}.</p></div>
          <div class="actions"><button class="btn" data-act="check">Check again</button>${S.tamper ? '' : '<button class="btn quiet" data-act="tamper">Try altering an old record</button>'}</div></div>`
      : `<div class="chain bad" role="alert"><div><p><strong>Record #${c.seq} has been altered.</strong> Its contents no longer match the hash stored when it was written.</p>
          ${S.tamper ? `<p>${esc(S.tamper.story)}</p>` : ''}</div>
          <div class="actions"><a class="btn" href="#/officer/ledger?seq=${c.seq}">Show record #${c.seq}</a>${S.tamper ? '<button class="btn primary" data-act="untamper">Undo the edit</button>' : ''}</div></div>`;
    return `${head('Ledger', 'Every dispatch, receipt, bill, stock count and decision is a record here. Each record stores a SHA-256 hash of its own contents and of the record before it, so changing any old record breaks the chain at that point.')}
    ${status}
    <div class="table-wrap"><table class="data ledger">
      <thead><tr><th class="num">#</th><th>Time</th><th>Record</th><th>Details</th><th>By</th><th>Hash</th></tr></thead>
      <tbody>${list.map(e => {
        const bad = !c.ok && e.seq === c.seq;
        return `<tr${bad ? ' class="row-bad"' : ''}${focus === e.seq ? ' id="focus-row"' : ''}><td class="num">${e.seq}</td><td class="nowrap">${fmtShort(e.at)}, ${e.at.slice(11)}</td><td class="nowrap">${TYPE_LABEL[e.type]}</td><td>${esc(summarize(e))}${bad ? '<br><strong class="small">Contents changed after the record was written</strong>' : ''}</td><td class="small">${esc(e.actor)}</td><td><code title="${e.hash}">${e.hash.slice(0, 10)}</code></td></tr>`;
      }).join('')}</tbody></table></div>
    ${S.ledgerShown < AT.ledger.length ? `<p class="more-row"><button class="btn" data-act="more-ledger">Show 60 older records</button> <span class="small">${num(AT.ledger.length - S.ledgerShown)} more</span></p>` : ''}`;
  }

  // rules ----------------------------------------------------------------
  function rulesView() {
    const hits = key => R.findings.filter(f => f.hits.some(h => h.rule === key)).length;
    const changed = Object.keys(AT.DEFAULT_RULES).some(k => S.cfg[k] !== AT.DEFAULT_RULES[k]);
    return `${head('Rules', 'Cases come only from these checks, so every flag can be explained with the numbers behind it. Change a limit to see how the case list responds.')}
    <div class="table-wrap"><table class="data rules">
      <thead><tr><th>Rule</th><th>What it compares</th><th>Limit</th><th>Weight</th><th class="num">Cases now</th></tr></thead>
      <tbody>${RULES.map(r => `<tr><th scope="row">${r.name}</th><td>${r.checks}</td>
        <td class="nowrap">${r.setting ? `<label><span class="sr">${r.name} limit</span><input class="limit" type="number" min="1" max="200" data-setting="${r.setting}" value="${S.cfg[r.setting]}"></label> ${r.unit}` : '<span class="small">Any</span>'}</td>
        <td>${r.weight}</td><td class="num">${hits(r.key)}</td></tr>`).join('')}</tbody></table></div>
    <section class="panel explain"><h2>How a case gets its risk</h2>
      <p>A case’s score is the sum of the weights of the rules it breaks. A score of 3 or more is high risk, 2 is medium and 1 is low. A stock count mismatch or a recalled batch on a bill is high risk on its own; anything else needs two findings to reach high.</p>
      <p>Why these limits: a patient on a once-daily tablet uses 3 strips a month, so more than 12 strips of one medicine in 30 days is four months’ supply. Write-offs above 15% of stock received are rare outside a recorded incident.</p>
      <label class="inline">Look ahead for expiring stock <input class="limit" type="number" min="15" max="365" data-setting="expiryWindow" value="${S.cfg.expiryWindow}"> days</label>
    </section>
    ${changed ? '<p><button class="btn" data-act="reset-rules">Restore the default limits</button></p>' : ''}`;
  }

  // ------------------------------------------------------------------ kendra pharmacist
  function kendraShell(kid, p) {
    const k = KENDRA[kid];
    const notices = kendraNotices(kid).filter(n => n.pending).length;
    const nav = [
      { key: 'counter', href: `#/kendra/${kid}`, label: 'New bill' },
      { key: 'stock', href: `#/kendra/${kid}/stock`, label: 'Stock' },
      { key: 'notices', href: `#/kendra/${kid}/notices`, label: 'Notices', count: notices, alert: true },
    ];
    const active = p[0] || 'counter';
    const body = active === 'stock' ? kendraStock(k) : active === 'notices' ? noticesView(k) : counterView(k);
    const ctx = `<label class="ctx-switch">Kendra
      <select data-act="switch-kendra">${KENDRAS.map(x => `<option value="${x.id}"${x.id === kid ? ' selected' : ''}>${x.name} (${x.id})</option>`).join('')}</select></label>`;
    return shell({ ctx, who: 'Pharmacist on duty', role: 'Kendra pharmacist', nav, active, body });
  }

  function batchStatus(kid, b) {
    if (db.recalls[b.id]) return { ok: false, text: `Recalled on ${fmtDate(db.recalls[b.id].date)}. Keep aside for return.` };
    if (b.expiry < TODAY) return { ok: false, text: `Expired on ${fmtDate(b.expiry)}.` };
    const left = AT.daysBetween(TODAY, b.expiry);
    return { ok: true, text: `Expires ${fmtDate(b.expiry)}${left <= 90 ? `, in ${left} days` : ''}` };
  }
  function batchOptions(kid, code) {
    const list = AT.batchesOf(code).filter(b => onHand(kid, b.id) > 0).sort((a, b) => a.expiry.localeCompare(b.expiry));
    if (!list.length) return '<p class="empty-line">None in stock. Raise an indent with the warehouse.</p>';
    const firstOk = list.find(b => batchStatus(kid, b).ok);
    return list.map(b => {
      const st = batchStatus(kid, b);
      return `<label class="batch-opt${st.ok ? '' : ' blocked'}"><input type="radio" name="batch" value="${b.id}"${st.ok ? '' : ' disabled'}${b === firstOk ? ' checked' : ''}>
        <span class="b-id">${b.id}</span><span class="b-st">${st.text}</span><span class="b-qty">${onHand(kid, b.id)} strips</span></label>`;
    }).join('') + (firstOk ? '<p class="hint">The batch that expires first is selected.</p>' : '<p class="hint">No batch of this medicine can be billed.</p>');
  }
  function counterView(k) {
    const d = DRUG[S.counterDrug];
    const today = db.sales.filter(s => s.kendra === k.id && s.date === TODAY).reverse();
    return `${head('New bill', 'Prices are fixed at MRP. Expired and recalled batches cannot be billed.')}
    <div class="counter">
      <form id="bill-form" class="panel" data-kendra="${k.id}" novalidate>
        <div class="field"><label for="bill-drug">Medicine</label>
          <select id="bill-drug" name="drug">${DRUGS.map(x => `<option value="${x.code}"${x.code === d.code ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
        <fieldset class="field"><legend>Batch</legend><div id="batch-opts">${batchOptions(k.id, d.code)}</div></fieldset>
        <div class="field-row">
          <div class="field"><label for="bill-qty">Strips</label><input id="bill-qty" name="qty" type="number" min="1" max="50" value="1" inputmode="numeric"></div>
          <p class="price" id="bill-price">₹${d.mrp} a strip (${d.pack})<strong>Total ₹${d.mrp}</strong></p>
        </div>
        <div class="field"><label for="bill-phone">Customer’s mobile number</label>
          <input id="bill-phone" name="phone" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="10 digits">
          <p class="hint">The bill is sent to this number. It is also used to spot unusually large purchases.</p>
          <p class="notice-inline" id="bulk-warn" hidden></p></div>
        <p class="form-error" id="bill-error" role="alert"></p>
        <button class="btn primary">Create bill</button>
      </form>
      <section class="panel" aria-labelledby="today-h"><h2 id="today-h">Bills today</h2>
        ${today.length ? `<table class="data compact"><tbody>${today.map(s => `<tr><td class="nowrap">${s.at.slice(11)}</td><td>${s.bill}<br><span class="small">${s.qty} × ${esc(DRUG[s.drug].short)}</span></td><td class="num">${inr(s.qty * s.price)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="empty-line">No bills yet today. Each bill you create is written to the ledger straight away.</p>'}
      </section>
    </div>`;
  }
  function updateCounter() {
    const form = $('#bill-form');
    if (!form) return;
    const d = DRUG[form.drug.value], qty = Math.max(0, parseInt(form.qty.value, 10) || 0);
    $('#bill-price').innerHTML = `₹${d.mrp} a strip (${d.pack})<strong>Total ${inr(d.mrp * qty)}</strong>`;
    const phone = form.phone.value, warn = $('#bulk-warn');
    if (/^\d{10}$/.test(phone)) {
      const recent = db.sales.filter(s => s.kendra === form.dataset.kendra && s.drug === d.code && s.phone === phone && AT.daysBetween(s.date, TODAY) < 30)
        .reduce((s, x) => s + x.qty, 0);
      if (recent + qty > S.cfg.bulkStrips) {
        warn.hidden = false;
        warn.textContent = `This number has bought ${recent} strips of ${d.short} here in the last 30 days. With this bill it reaches ${recent + qty}, above the limit of ${S.cfg.bulkStrips}, so the district office will be asked to review it.`;
        return;
      }
    }
    warn.hidden = true;
  }

  function kendraStock(k) {
    const rows = BATCHES.filter(b => (db.received[k.id + '|' + b.id] || db.tin[k.id + '|' + b.id]) && onHand(k.id, b.id) !== 0)
      .sort((a, b) => DRUGS.indexOf(DRUG[a.drug]) - DRUGS.indexOf(DRUG[b.drug]) || a.expiry.localeCompare(b.expiry));
    return `${head('Stock', `Batches on the books at ${k.name}. Count what is on the shelf and enter it; the ledger compares your count with its own figures. Last count: ${db.lastCount[k.id] ? fmtDate(db.lastCount[k.id]) : 'none'}.`)}
    <form id="count-form" data-kendra="${k.id}" novalidate>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Medicine</th><th>Batch</th><th>Status</th><th class="num">On the books</th><th class="num">Counted</th></tr></thead>
        <tbody>${rows.map(b => { const st = batchStatus(k.id, b); return `<tr${st.ok ? '' : ' class="row-warn"'}><td>${esc(DRUG[b.drug].name)}</td><td>${b.id}</td><td class="small">${st.text}</td><td class="num">${onHand(k.id, b.id)}</td>
          <td class="num"><label><span class="sr">Counted strips of ${b.id}</span><input class="count-in" type="number" min="0" inputmode="numeric" name="${b.id}"></label></td></tr>`; }).join('')}</tbody></table></div>
      <p class="form-error" id="count-error" role="alert"></p>
      <div class="form-foot"><button class="btn primary">Submit stock count</button><span class="hint">Leave a row empty if you have not counted it.</span></div>
      <div id="count-result" aria-live="polite"></div>
    </form>`;
  }

  function kendraNotices(kid) {
    const out = [];
    R.recalls.forEach(r => {
      const row = r.rows.find(x => x.kendra.id === kid);
      if (!row) return;
      out.push({ type: 'recall', r, row, pending: !row.ack });
    });
    db.transferRequests.forEach(t => {
      if (t.from === kid) out.push({ type: 'send', t, pending: !db.transfersDone[t.id] });
      if (t.to === kid) out.push({ type: 'incoming', t, pending: false });
    });
    return out;
  }
  function noticesView(k) {
    const list = kendraNotices(k.id);
    return `${head('Notices', 'Recalls and transfer requests from the district office.')}
    ${list.length ? list.map(n => {
      if (n.type === 'recall') {
        const held = Math.max(n.row.onHand, 0);
        return `<article class="panel notice${n.pending ? ' pending' : ''}"><h2>Recall: ${esc(n.r.drug.name)}, batch ${n.r.batch}</h2>
          <p>Recalled on ${fmtDate(n.r.date)}. ${esc(n.r.reason)}.</p>
          <p>${held ? `You hold <strong>${held} strips</strong> of this batch. Do not bill them. Keep them apart and return them with the next warehouse pickup.` : 'You hold none of this batch now.'}
          ${n.row.soldAfter ? ` <strong class="bad-text">${n.row.soldAfter} strips were billed here after the recall.</strong>` : ''}</p>
          ${n.row.ack ? `<p class="done">Noted on ${fmtDate(n.row.ack)}</p>` : `<button class="btn primary" data-act="ack" data-kendra="${k.id}" data-batch="${n.r.batch}">Confirm recall noted</button>`}</article>`;
      }
      const t = n.t, d = DRUG[BATCH[t.batch].drug];
      if (n.type === 'send') {
        const done = db.transfersDone[t.id];
        return `<article class="panel notice${n.pending ? ' pending' : ''}"><h2>Send ${t.qty} strips of ${esc(d.name)} to ${kname(t.to)}</h2>
          <p>Batch ${t.batch} expires on ${fmtDate(BATCH[t.batch].expiry)} and will not sell here in time. ${kname(t.to)} sells it faster. Requested by the district office on ${fmtDate(t.at)}.</p>
          ${done ? `<p class="done">Sent on ${fmtDate(done.at)}</p>` : `<button class="btn primary" data-act="send" data-id="${t.id}">Mark as sent</button>`}</article>`;
      }
      const done = db.transfersDone[t.id];
      return `<article class="panel notice"><h2>Incoming: ${t.qty} strips of ${esc(d.name)} from ${kname(t.from)}</h2>
        <p>Batch ${t.batch}, expires ${fmtDate(BATCH[t.batch].expiry)}. ${done ? `Sent on ${fmtDate(done.at)} and added to your stock.` : 'Not sent yet.'}</p></article>`;
    }).join('') : '<p class="empty-line">No notices. Recalls and transfer requests from the district office appear here.</p>'}`;
  }

  // ------------------------------------------------------------------ patient verification
  const TX = {
    en: {
      title: 'Check your Jan Aushadhi bill or medicine',
      lede: 'Find out whether a bill is genuine, whether you paid the right price, and whether the batch is safe to use.',
      tabBill: 'Bill number', tabBatch: 'Batch number on the strip',
      billLabel: 'Bill number', batchLabel: 'Batch number',
      billHint: 'Printed at the top of your receipt, for example GZB01-004512. Scanning the QR code on the receipt fills this in for you.',
      batchHint: 'Printed on the back of the strip after “Batch No.” or “B. No.”',
      check: 'Check', empty: 'Enter a number to check.', samples: 'Sample numbers to try',
      s: { normal: 'An ordinary bill', over: 'Charged above MRP', recalled: 'Recalled medicine sold', expired: 'Expired medicine sold', fake: 'A bill that does not exist', brecalled: 'A recalled batch', bok: 'A batch in normal use' },
      genuine: (k, d) => `Genuine bill from ${k} Janaushadhi Kendra, recorded on ${d}.`,
      genuineSig: 'Genuine bill. The code on the receipt matches its details.',
      badSig: 'The code on this receipt does not match its details. The receipt may have been altered.',
      notFound: c => `No bill numbered ${c} is on record. Check the number on your receipt. If it matches, the sale was not recorded and the medicine may not be Jan Aushadhi stock.`,
      priceOk: m => `You paid the MRP of ₹${m} a strip.`,
      priceBad: (p, m, x) => `You paid ₹${p} a strip but the MRP is ₹${m}. You were charged ₹${x} too much.`,
      expiredAtSale: d => `This medicine had already expired when it was sold (expiry ${d}). Do not take it.`,
      expiredNow: d => `This batch expired on ${d}. Do not use it any more.`,
      expiryOk: (b, d) => `Batch ${b} can be used until ${d}.`,
      recalled: d => `This batch was recalled on ${d} because it failed a quality test. Stop taking it and return it to the kendra.`,
      batchOk: d => `This batch was supplied through Jan Aushadhi. It can be used until ${d}.`,
      batchUnknown: c => `Batch ${c} is not in the Jan Aushadhi records. The medicine may not be genuine. Show it to a pharmacist before taking it.`,
      f: { medicine: 'Medicine', strips: 'Strips', paid: 'Amount paid', batch: 'Batch', made: 'Made', expires: 'Expires', kendra: 'Kendra', bill: 'Bill' },
      report: 'Report a problem', reportTitle: 'Report a problem to the district office',
      reasons: { overcharged: 'I was charged more than the MRP', expired: 'The medicine was expired or recalled', notfound: 'My bill or batch is not on record', unavailable: 'The medicine I needed was out of stock', other: 'Something else' },
      reasonLabel: 'What went wrong?', details: 'What happened? (optional)', mobile: 'Mobile number, if you want a call back (optional)',
      send: 'Send report', cancel: 'Cancel', sent: r => `Report ${r} sent to the ${AT.DISTRICT} district office.`, staff: 'Staff sign in',
      needReason: 'Choose what went wrong.', badPhone: 'Enter a 10-digit mobile number, or leave it empty.', close: 'Close',
    },
    hi: {
      title: 'अपना जन औषधि बिल या दवा जाँचें',
      lede: 'जानिए कि बिल असली है या नहीं, आपने सही कीमत दी या नहीं, और दवा का बैच इस्तेमाल के लिए सुरक्षित है या नहीं।',
      tabBill: 'बिल नंबर', tabBatch: 'दवा के पत्ते पर बैच नंबर',
      billLabel: 'बिल नंबर', batchLabel: 'बैच नंबर',
      billHint: 'यह आपकी रसीद के ऊपर छपा होता है, जैसे GZB01-004512। रसीद का QR कोड स्कैन करने पर यह अपने-आप भर जाता है।',
      batchHint: 'यह पत्ते के पीछे “Batch No.” या “B. No.” के बाद छपा होता है।',
      check: 'जाँचें', empty: 'जाँचने के लिए नंबर डालें।', samples: 'आज़माने के लिए नमूना नंबर',
      s: { normal: 'एक सामान्य बिल', over: 'MRP से ज़्यादा कीमत ली गई', recalled: 'वापस मंगाई गई दवा बेची गई', expired: 'एक्सपायर दवा बेची गई', fake: 'ऐसा बिल जो मौजूद नहीं है', brecalled: 'वापस मंगाया गया बैच', bok: 'सामान्य उपयोग वाला बैच' },
      genuine: (k, d) => `${k} जनऔषधि केंद्र का असली बिल, ${d} को दर्ज।`,
      genuineSig: 'असली बिल। रसीद का कोड उसके विवरण से मेल खाता है।',
      badSig: 'इस रसीद का कोड उसके विवरण से मेल नहीं खाता। हो सकता है रसीद में बदलाव किया गया हो।',
      notFound: c => `${c} नंबर का कोई बिल दर्ज नहीं है। अपनी रसीद पर नंबर दोबारा देखें। अगर नंबर सही है, तो यह बिक्री दर्ज नहीं हुई और हो सकता है दवा जन औषधि की न हो।`,
      priceOk: m => `आपने प्रति पत्ता ₹${m} की सही MRP दी।`,
      priceBad: (p, m, x) => `आपने प्रति पत्ता ₹${p} दिए, जबकि MRP ₹${m} है। आपसे ₹${x} ज़्यादा लिए गए।`,
      expiredAtSale: d => `बेचते समय यह दवा पहले ही एक्सपायर हो चुकी थी (एक्सपायरी ${d})। इसे न लें।`,
      expiredNow: d => `यह बैच ${d} को एक्सपायर हो गया। अब इसका इस्तेमाल न करें।`,
      expiryOk: (b, d) => `बैच ${b} का इस्तेमाल ${d} तक किया जा सकता है।`,
      recalled: d => `यह बैच ${d} को गुणवत्ता जाँच में फेल होने के कारण वापस मंगाया गया। इसे लेना बंद करें और केंद्र पर लौटाएँ।`,
      batchOk: d => `यह बैच जन औषधि के ज़रिए आया है। इसका इस्तेमाल ${d} तक किया जा सकता है।`,
      batchUnknown: c => `बैच ${c} जन औषधि के रिकॉर्ड में नहीं है। हो सकता है दवा असली न हो। लेने से पहले किसी फ़ार्मासिस्ट को दिखाएँ।`,
      f: { medicine: 'दवा', strips: 'पत्ते', paid: 'चुकाई गई राशि', batch: 'बैच', made: 'निर्माण', expires: 'एक्सपायरी', kendra: 'केंद्र', bill: 'बिल' },
      report: 'शिकायत दर्ज करें', reportTitle: 'ज़िला कार्यालय को शिकायत भेजें',
      reasons: { overcharged: 'मुझसे MRP से ज़्यादा पैसे लिए गए', expired: 'दवा एक्सपायर थी या वापस मंगाई गई थी', notfound: 'मेरा बिल या बैच रिकॉर्ड में नहीं है', unavailable: 'मुझे जो दवा चाहिए थी वह उपलब्ध नहीं थी', other: 'कुछ और' },
      reasonLabel: 'क्या गलत हुआ?', details: 'क्या हुआ? (वैकल्पिक)', mobile: 'अगर आप चाहते हैं कि आपको कॉल किया जाए, तो मोबाइल नंबर (वैकल्पिक)',
      send: 'शिकायत भेजें', cancel: 'रद्द करें', sent: r => `शिकायत ${r} गाज़ियाबाद ज़िला कार्यालय को भेज दी गई।`, staff: 'स्टाफ़ लॉगिन',
      needReason: 'बताइए कि क्या गलत हुआ।', badPhone: '10 अंकों का मोबाइल नंबर डालें, या इसे खाली छोड़ दें।', close: 'बंद करें',
    },
  };
  const T = () => TX[S.lang];
  const vDate = s => S.lang === 'hi' ? HI_DATE.format(new Date(s.slice(0, 10) + 'T00:00:00Z')) : fmtDate(s);

  function samples() {
    const last = (fn) => { for (let i = db.sales.length - 1; i >= 0; i--) if (fn(db.sales[i])) return db.sales[i]; return null; };
    return [
      ['bill', last(s => s.kendra === 'GZB01' && s.date === LAST && s.price === DRUG[s.drug].mrp && !s.expired), 'normal'],
      ['bill', last(s => s.kendra === 'GZB07' && s.price > DRUG[s.drug].mrp), 'over'],
      ['bill', last(s => s.recalled), 'recalled'],
      ['bill', last(s => s.expired), 'expired'],
      ['bill', { bill: 'GZB03-999999' }, 'fake'],
      ['batch', { bill: R.recalls[0] ? R.recalls[0].batch : BATCHES[0].id }, 'brecalled'],
      ['batch', { bill: BATCHES[3].id }, 'bok'],
    ].filter(x => x[1]).map(([kind, s, key]) => ({ kind, code: s.bill, key }));
  }

  function checkCode(kind, code, q) {
    code = code.trim().toUpperCase();
    if (!code) return null;
    if (kind === 'batch') {
      const b = BATCH[code];
      return { kind, code, batch: b || null };
    }
    let sale = db.sales.find(s => s.bill === code) || null, sig = null;
    if (q && q.get('s')) {
      const payload = { bill: q.get('b'), kendra: q.get('k'), batch: q.get('bt'), qty: +q.get('q'), price: +q.get('p'), date: q.get('d') };
      sig = AT.signReceipt(payload) === q.get('s') ? 'ok' : 'bad';
      if (sig === 'ok' && !sale && BATCH[payload.batch] && KENDRA[payload.kendra]) sale = { ...payload, drug: BATCH[payload.batch].drug, recalled: false, fromSig: true };
    }
    return { kind, code, sale, sig };
  }

  function resultHtml(r) {
    const t = T();
    if (!r) return '';
    const lines = [];
    let bad = false;
    const add = (cls, text) => { lines.push(`<li class="${cls}">${esc(text)}</li>`); if (cls === 'bad') bad = true; };
    let facts = [];
    if (r.kind === 'batch') {
      const b = r.batch;
      if (!b) add('bad', t.batchUnknown(r.code));
      else {
        const d = DRUG[b.drug], rc = db.recalls[b.id];
        if (rc) add('bad', t.recalled(vDate(rc.date)));
        else if (b.expiry < TODAY) add('bad', t.expiredNow(vDate(b.expiry)));
        else add('ok', t.batchOk(vDate(b.expiry)));
        facts = [[t.f.medicine, d.name], [t.f.batch, b.id], [t.f.made, vDate(b.mfg)], [t.f.expires, vDate(b.expiry)]];
      }
    } else {
      const s = r.sale;
      if (r.sig === 'bad') add('bad', t.badSig);
      if (!s) { if (r.sig !== 'bad') add('bad', t.notFound(r.code)); }
      else {
        const d = DRUG[s.drug], b = BATCH[s.batch], rc = db.recalls[s.batch];
        add('ok', s.fromSig ? t.genuineSig : t.genuine(kname(s.kendra), vDate(s.date)));
        if (s.price > d.mrp) add('bad', t.priceBad(s.price, d.mrp, (s.price - d.mrp) * s.qty)); else add('ok', t.priceOk(d.mrp));
        if (rc) add('bad', t.recalled(vDate(rc.date)));
        if (s.date > b.expiry) add('bad', t.expiredAtSale(vDate(b.expiry)));
        else if (b.expiry < TODAY) add('warn', t.expiredNow(vDate(b.expiry)));
        else if (!rc) add('ok', t.expiryOk(b.id, vDate(b.expiry)));
        facts = [[t.f.bill, s.bill], [t.f.kendra, `${kname(s.kendra)} (${s.kendra})`], [t.f.medicine, d.name], [t.f.strips, String(s.qty)], [t.f.paid, inr(s.qty * s.price)]];
      }
    }
    return `<div class="result ${bad ? 'bad' : 'ok'}">
      <ul class="checks">${lines.join('')}</ul>
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      ${bad ? `<button class="btn" data-act="report">${t.report}</button>` : ''}
    </div>`;
  }

  function verifyView(q, changed) {
    const t = T();
    if (changed && (q.get('b') || q.get('batch'))) {
      S.vtab = q.get('batch') ? 'batch' : 'bill';
      S.verify = checkCode(S.vtab, q.get('b') || q.get('batch'), q);
    }
    const isBill = S.vtab === 'bill';
    return `<header class="topbar public">
      <a class="brand" href="#/verify">${MARK}<span>AushadhiTrack</span></a>
      <div class="lang" role="group" aria-label="Language"><button type="button" data-lang="en" aria-pressed="${S.lang === 'en'}" lang="en">English</button><button type="button" data-lang="hi" aria-pressed="${S.lang === 'hi'}" lang="hi">हिन्दी</button></div>
      <a class="signout" href="#/">${t.staff}</a>
    </header>
    <main id="main" class="verify" tabindex="-1" lang="${S.lang}">
      <h1>${t.title}</h1><p class="lede">${t.lede}</p>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-vtab="bill" aria-selected="${isBill}">${t.tabBill}</button>
        <button type="button" role="tab" data-vtab="batch" aria-selected="${!isBill}">${t.tabBatch}</button>
      </div>
      <form id="verify-form" class="verify-form" role="tabpanel" novalidate>
        <label for="vcode">${isBill ? t.billLabel : t.batchLabel}</label>
        <div class="verify-row"><input id="vcode" name="code" autocomplete="off" spellcheck="false" autocapitalize="characters" value="${esc(S.verify && S.verify.kind === S.vtab ? S.verify.code : '')}" placeholder="${isBill ? 'GZB01-004512' : 'AZI25H60'}"><button class="btn primary">${t.check}</button></div>
        <p class="hint">${isBill ? t.billHint : t.batchHint}</p>
        <p class="form-error" id="verify-error" role="alert"></p>
      </form>
      <div id="verify-result" aria-live="polite">${S.verify && S.verify.kind === S.vtab ? resultHtml(S.verify) : ''}</div>
      <section class="samples" aria-labelledby="smp-h"><h2 id="smp-h">${t.samples}</h2>
        <ul>${samples().map(s => `<li><button type="button" class="link" data-sample="${s.kind}|${s.code}">${s.code}</button><span>${t.s[s.key]}</span></li>`).join('')}</ul></section>
    </main>${footer()}`;
  }

  function reportDialog() {
    const t = T(), r = S.verify;
    const guess = r && r.kind === 'bill' && r.sale && r.sale.price > DRUG[r.sale.drug].mrp ? 'overcharged'
      : r && ((r.kind === 'batch' && r.batch) || (r.sale)) ? 'expired' : 'notfound';
    openDialog(`<form id="report-form" class="dialog-form" lang="${S.lang}" novalidate>
      <h2>${t.reportTitle}</h2>
      <fieldset><legend>${t.reasonLabel}</legend>${Object.entries(t.reasons).map(([k, v]) => `<label class="radio"><input type="radio" name="reason" value="${k}"${k === guess ? ' checked' : ''}> ${v}</label>`).join('')}</fieldset>
      <label for="rp-details">${t.details}</label><textarea id="rp-details" name="details" rows="3"></textarea>
      <label for="rp-phone">${t.mobile}</label><input id="rp-phone" name="phone" inputmode="numeric" maxlength="10" autocomplete="tel">
      <p class="form-error" id="report-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="btn" data-act="close-dialog">${t.cancel}</button><button class="btn primary">${t.send}</button></div>
    </form>`, t.reportTitle);
  }

  // ------------------------------------------------------------------ receipt and QR
  function qrSvg(text) {
    if (typeof qrcode !== 'function') return '';
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg class="qr" viewBox="-4 -4 ${n + 8} ${n + 8}" role="img" aria-label="QR code that opens this bill's check page" shape-rendering="crispEdges"><rect x="-4" y="-4" width="${n + 8}" height="${n + 8}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function receiptDialog(s) {
    const d = DRUG[s.drug], b = BATCH[s.batch], k = KENDRA[s.kendra];
    const url = `${location.href.split('#')[0]}#/verify?${AT.receiptPayload(s)}&s=${AT.signReceipt(s)}`;
    const qr = qrSvg(url);
    openDialog(`<div class="receipt" id="receipt">
      <header><span class="brand">${MARK}<span>AushadhiTrack</span></span><p>${k.name} Janaushadhi Kendra, ${k.id}</p></header>
      <dl>
        <div><dt>Bill</dt><dd>${s.bill}</dd></div>
        <div><dt>Date</dt><dd>${fmtDate(s.date)}, ${s.at.slice(11)}</dd></div>
        <div><dt>Medicine</dt><dd>${esc(d.name)}<br><small>${d.pack}</small></dd></div>
        <div><dt>Batch</dt><dd>${b.id}<br><small>Expires ${fmtDate(b.expiry)}</small></dd></div>
        <div><dt>Strips</dt><dd>${s.qty} × ₹${s.price}</dd></div>
        <div class="total"><dt>Total</dt><dd>${inr(s.qty * s.price)}</dd></div>
      </dl>
      <div class="r-qr">${qr}<p>${qr ? 'Scan to check that this bill is genuine and the price is right.' : 'Check this bill at the patient page using the bill number.'}</p></div>
    </div>
    <div class="dialog-actions"><button type="button" class="btn" data-act="print">Print</button><a class="btn" href="${esc(url.split('#')[1] ? '#' + url.split('#')[1] : '#/verify')}" data-act="close-dialog">Open as patient</a><button type="button" class="btn primary" data-act="close-dialog">Done</button></div>`, `Bill ${s.bill}`);
  }

  // ------------------------------------------------------------------ actions
  function transferRequest(id) {
    const a = R.advisories.find(x => x.id === id);
    if (!a || !a.to) return;
    AT.append(stamp(), 'transfer-request', `${OFFICER}, PMBI field officer`, { id, from: a.kendra.id, to: a.to.kendra.id, batch: a.batch.id, qty: a.move });
    refresh(); render();
    toast(`Transfer requested. ${a.kendra.name} will see it under Notices.`);
  }
  function recallDialog(id) {
    openDialog(`<form id="recall-form" class="dialog-form" data-batch="${id}" novalidate>
      <h2>Record a recall for batch ${id}</h2>
      <p>${esc(DRUG[BATCH[id].drug].name)}. Every kendra holding this batch will be told to stop billing it, and the counter will block it straight away.</p>
      <label for="rc-reason">Reason</label>
      <select id="rc-reason" name="reason"><option>Not of standard quality</option><option>Spurious or falsely labelled</option><option>Packaging or labelling defect</option></select>
      <label for="rc-ref">Alert reference</label><input id="rc-ref" name="ref" placeholder="For example, State drug alert, November 2026">
      <p class="form-error" id="recall-error" role="alert"></p>
      <div class="dialog-actions"><button type="button" class="btn" data-act="close-dialog">Cancel</button><button class="btn danger">Record recall</button></div>
    </form>`, `Record a recall for batch ${id}`);
  }
  function tamper() {
    const target = AT.ledger.find(e => e.type === 'dayclose' && e.data.kendra === 'GZB04' && e.data.date === AT.addDays(TODAY, -5));
    const amcB = AT.batchesOf('D186').find(b => b.lot === 'B').id;
    const before = R.findings.find(f => f.id === 'C-04186');
    S.tamper = { seq: target.seq, original: JSON.stringify(target.data) };
    target.data.bills.push(['GZB04-009999', '9999999999', amcB, 9, 58]);
    refresh();
    const after = R.findings.find(f => f.id === 'C-04186');
    S.tamper.story = `The edit slipped a 9-strip Amoxyclav bill into Loni’s day close for ${fmtDate(target.data.date)}, so the books now agree with Loni’s short stock count. Case C-04186 has dropped from ${before ? before.risk.toLowerCase() : 'flagged'} to ${after ? after.risk.toLowerCase() : 'no'} risk and the missing strips have vanished from the case. A database without the hash chain would show nothing wrong.`;
    S.lastCheck = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    render();
  }
  function untamper() {
    const e = AT.ledger[S.tamper.seq - 1];
    e.data = JSON.parse(S.tamper.original);
    S.tamper = null;
    refresh(); render();
    toast('Edit undone. The chain checks out again.');
  }

  // ------------------------------------------------------------------ events
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act],[data-filter],[data-lang],[data-vtab],[data-sample],tr[data-href]');
    if (!el) return;
    if (el.matches('tr[data-href]')) { if (!e.target.closest('a,button,input,select')) location.hash = el.dataset.href; return; }
    if (el.dataset.filter) { S.caseFilter = el.dataset.filter; render(); return; }
    if (el.dataset.lang) { S.lang = el.dataset.lang; render(); return; }
    if (el.dataset.vtab) { S.vtab = el.dataset.vtab; render(); $('#vcode').focus(); return; }
    if (el.dataset.sample) {
      const [kind, code] = el.dataset.sample.split('|');
      S.vtab = kind; S.verify = checkCode(kind, code); render();
      $('#verify-result').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    switch (el.dataset.act) {
      case 'close-dialog': closeDialog(); break;
      case 'print': window.print(); break;
      case 'transfer': transferRequest(el.dataset.id); break;
      case 'recall': recallDialog(el.dataset.id); break;
      case 'check':
        S.chain = AT.verifyChain();
        S.lastCheck = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        render(); toast(S.chain.ok ? `Checked ${num(S.chain.count)} records. No changes found.` : `Record #${S.chain.seq} has been altered.`);
        break;
      case 'tamper': tamper(); break;
      case 'untamper': untamper(); break;
      case 'more-ledger': S.ledgerShown += 60; render(); break;
      case 'reset-rules': S.cfg = { ...AT.DEFAULT_RULES }; refresh(); render(); toast('Default limits restored.'); break;
      case 'report': reportDialog(); break;
      case 'ack':
        AT.append(stamp(), 'ack', `Kendra ${el.dataset.kendra}`, { kendra: el.dataset.kendra, batch: el.dataset.batch });
        refresh(); render(); toast('Recall noted. The district office can see your confirmation.');
        break;
      case 'send': {
        const t = db.transferRequests.find(x => x.id === el.dataset.id);
        AT.append(stamp(), 'transfer', `Kendra ${t.from}`, { request: t.id, from: t.from, to: t.to, batch: t.batch, qty: t.qty });
        refresh(); render(); toast(`Marked as sent. ${t.qty} strips moved to ${kname(t.to)} in the ledger.`);
        break;
      }
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-act="switch-kendra"]')) { location.hash = `#/kendra/${t.value}`; return; }
    if (t.id === 'bill-drug') {
      S.counterDrug = t.value;
      $('#batch-opts').innerHTML = batchOptions(t.form.dataset.kendra, t.value);
      updateCounter(); return;
    }
    if (t.matches('input.limit')) {
      const v = parseInt(t.value, 10);
      if (!(v >= +t.min && v <= +t.max)) { t.value = S.cfg[t.dataset.setting]; toast(`Enter a whole number from ${t.min} to ${t.max}.`); return; }
      S.cfg[t.dataset.setting] = v; refresh(); render();
      const again = document.querySelector(`input[data-setting="${t.dataset.setting}"]`);
      if (again) again.focus();
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'case-search') { S.search = t.value; $('#case-rows').innerHTML = caseRows(filteredCases()); }
    if (t.id === 'bill-phone' || t.id === 'rp-phone') t.value = t.value.replace(/\D/g, '').slice(0, 10);
    if (t.form && t.form.id === 'bill-form') updateCounter();
  });

  document.addEventListener('submit', e => {
    const f = e.target;
    e.preventDefault();
    const err = (id, msg) => { const el = $('#' + id); el.textContent = msg; return false; };

    if (f.id === 'kendra-open') { location.hash = `#/kendra/${f.querySelector('select').value}`; return; }

    if (f.id === 'bill-form') {
      const kid = f.dataset.kendra, batch = f.batch ? (f.querySelector('input[name=batch]:checked') || {}).value : null;
      const qty = Number(f.qty.value), phone = f.phone.value;
      if (!batch) return err('bill-error', 'There is no batch of this medicine that can be billed.');
      if (!Number.isInteger(qty) || qty < 1) return err('bill-error', 'Enter the number of strips, 1 or more.');
      if (qty > onHand(kid, batch)) return err('bill-error', `Only ${onHand(kid, batch)} strips of batch ${batch} are on the books.`);
      if (!/^[6-9]\d{9}$/.test(phone)) { f.phone.focus(); return err('bill-error', 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9.'); }
      if (!batchStatus(kid, BATCH[batch]).ok) return err('bill-error', 'This batch cannot be billed.');
      const nums = db.sales.filter(s => s.kendra === kid).map(s => +s.bill.split('-')[1]);
      const bill = `${kid}-${String(Math.max(...nums) + 1).padStart(6, '0')}`;
      AT.append(stamp(), 'sale', `Kendra ${kid}`, { kendra: kid, bill: [bill, phone, batch, qty, DRUG[BATCH[batch].drug].mrp] });
      refresh(); render();
      receiptDialog(db.sales.find(s => s.bill === bill));
      return;
    }

    if (f.id === 'count-form') {
      const kid = f.dataset.kendra;
      const items = [...f.querySelectorAll('.count-in')].filter(i => i.value !== '').map(i => [i.name, Number(i.value)]);
      if (!items.length) return err('count-error', 'Enter at least one counted figure.');
      if (items.some(([, v]) => !Number.isInteger(v) || v < 0)) return err('count-error', 'Counts must be whole numbers, 0 or more.');
      const diffs = items.map(([b, v]) => [b, v - onHand(kid, b)]).filter(([, d]) => d !== 0);
      AT.append(stamp(), 'count', `Kendra ${kid}`, { kendra: kid, items });
      refresh(); render();
      $('#count-result').innerHTML = diffs.length
        ? `<p class="callout bad">${diffs.length} ${diffs.length === 1 ? 'batch differs' : 'batches differ'} from the ledger: ${diffs.map(([b, d]) => `${b} (${d > 0 ? '+' : ''}${d})`).join(', ')}. The district office will see this as a case.</p>`
        : `<p class="callout ok">All ${items.length} counted ${items.length === 1 ? 'batch matches' : 'batches match'} the ledger.</p>`;
      toast('Stock count submitted.');
      return;
    }

    if (f.id === 'case-form') {
      const status = e.submitter && e.submitter.value, note = f.note.value.trim();
      if (status === 'Closed' && !note) { f.note.focus(); return err('case-error', 'Add a note saying why the case is being closed.'); }
      AT.append(stamp(), 'case', `${OFFICER}, PMBI field officer`, { case: f.dataset.case, status, note });
      refresh(); render();
      toast({ 'In inquiry': 'Inquiry started.', Closed: 'Case closed.', Open: 'Case reopened.' }[status]);
      return;
    }

    if (f.id === 'recall-form') {
      const batch = f.dataset.batch, ref = f.ref.value.trim();
      if (!ref) { f.ref.focus(); return err('recall-error', 'Enter the reference of the drug alert or recall order.'); }
      AT.append(stamp(), 'recall', `${OFFICER}, PMBI field officer`, { batch, reason: f.reason.value, ref });
      closeDialog(); refresh(); render();
      toast(`Recall recorded. No kendra can bill batch ${batch} now.`);
      return;
    }

    if (f.id === 'verify-form') {
      const code = f.code.value;
      if (!code.trim()) { S.verify = null; render(); return err('verify-error', T().empty); }
      S.verify = checkCode(S.vtab, code);
      $('#verify-result').innerHTML = resultHtml(S.verify);
      $('#verify-error').textContent = '';
      return;
    }

    if (f.id === 'report-form') {
      const t = T(), reason = (f.querySelector('input[name=reason]:checked') || {}).value, phone = f.phone.value;
      if (!reason) return err('report-error', t.needReason);
      if (phone && !/^[6-9]\d{9}$/.test(phone)) return err('report-error', t.badPhone);
      const r = S.verify || {}, s = r.sale;
      const ref = `R-${2600 + db.complaints.length + 1}`;
      AT.append(stamp(), 'complaint', 'Patient (unverified)', {
        ref, reason, reasonText: TX.en.reasons[reason], details: f.details.value.trim(), phone, kind: r.kind || 'bill', code: r.code || '',
        kendra: s ? s.kendra : null, drug: s ? s.drug : r.batch ? r.batch.drug : null, excess: s && s.price > DRUG[s.drug].mrp ? (s.price - DRUG[s.drug].mrp) * s.qty : 0,
      });
      refresh();
      openDialog(`<div class="dialog-form" lang="${S.lang}"><h2>${t.reportTitle}</h2><p class="callout ok">${t.sent(ref)}</p>
        <div class="dialog-actions"><button type="button" class="btn primary" data-act="close-dialog">${t.close}</button></div></div>`, t.reportTitle);
    }
  });

  window.addEventListener('hashchange', render);
  refresh();
  render();
})();
