'use strict';
/* AushadhiTrack data layer.
 *
 * Builds a synthetic, hash-chained ledger for one district (8 kendras, 10 medicines, 60 days)
 * and derives stock, sales and risk findings from it. The ledger is the only source of truth:
 * change a record and every number in the app changes with it. Nothing here touches the DOM,
 * so the same file runs in Node for tests.
 */
const AT = (() => {

  // ------------------------------------------------------------------ dates and helpers
  const TODAY = '2026-11-12';
  const DAY_MS = 86400000;
  function addDays(s, n) { return new Date(Date.parse(s + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY_MS); }
  const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const fmtDate = s => DATE_FMT.format(new Date(s.slice(0, 10) + 'T00:00:00Z'));
  const START = addDays(TODAY, -60);
  const LAST = addDays(TODAY, -1);           // last closed business day
  const DELIVERY_2 = addDays(TODAY, -24);
  const RECALL_DATE = addDays(TODAY, -10);

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------------ SHA-256 and HMAC (synchronous, no dependencies)
  const SHA = (() => {
    const primes = [];
    for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n);
    const frac = x => ((x - Math.floor(x)) * 4294967296) >>> 0;
    const K = new Uint32Array(primes.map(p => frac(Math.cbrt(p))));
    const H0 = primes.slice(0, 8).map(p => frac(Math.sqrt(p)));
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    function digest(bytes) {
      const len = bytes.length, padded = ((len + 9 + 63) >> 6) << 6;
      const buf = new Uint8Array(padded);
      buf.set(bytes); buf[len] = 0x80;
      const view = new DataView(buf.buffer);
      view.setUint32(padded - 8, Math.floor(len / 0x20000000));
      view.setUint32(padded - 4, (len << 3) >>> 0);
      const H = new Uint32Array(H0), W = new Uint32Array(64);
      for (let o = 0; o < padded; o += 64) {
        for (let i = 0; i < 16; i++) W[i] = view.getUint32(o + i * 4);
        for (let i = 16; i < 64; i++) {
          const a = W[i - 15], b = W[i - 2];
          W[i] = W[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + W[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10));
        }
        let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
        for (let i = 0; i < 64; i++) {
          const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
          const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
          h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
      }
      const out = new Uint8Array(32), ov = new DataView(out.buffer);
      H.forEach((x, i) => ov.setUint32(i * 4, x));
      return out;
    }
    const enc = new TextEncoder();
    const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return {
      sha256: s => hex(digest(enc.encode(s))),
      hmac(key, msg) {
        let k = enc.encode(key);
        if (k.length > 64) k = digest(k);
        const kp = new Uint8Array(64); kp.set(k);
        const m = enc.encode(msg);
        const inner = new Uint8Array(64 + m.length);
        inner.set(kp.map(x => x ^ 0x36)); inner.set(m, 64);
        const outer = new Uint8Array(96);
        outer.set(kp.map(x => x ^ 0x5c)); outer.set(digest(inner), 64);
        return hex(digest(outer));
      },
    };
  })();

  // ------------------------------------------------------------------ master data
  const DISTRICT = 'Ghaziabad';
  const WAREHOUSE = 'Central warehouse, Gurugram';
  const KENDRAS = [
    { id: 'GZB01', name: 'Indirapuram', size: 1.3 },
    { id: 'GZB02', name: 'Vaishali', size: 1.1 },
    { id: 'GZB03', name: 'Raj Nagar Extension', size: 0.9 },
    { id: 'GZB04', name: 'Loni', size: 1.0 },
    { id: 'GZB05', name: 'Modinagar', size: 0.7 },
    { id: 'GZB06', name: 'Muradnagar', size: 0.75 },
    { id: 'GZB07', name: 'Kavi Nagar', size: 1.2 },
    { id: 'GZB08', name: 'Crossings Republik', size: 1.35 },
  ];
  // MRPs are illustrative, per strip.
  const DRUGS = [
    { code: 'D104', abbr: 'PCM', short: 'Paracetamol', name: 'Paracetamol 500 mg', pack: 'strip of 10 tablets', mrp: 12, rate: 3.0, chronic: false },
    { code: 'D117', abbr: 'MET', short: 'Metformin', name: 'Metformin 500 mg', pack: 'strip of 10 tablets', mrp: 15, rate: 2.2, chronic: true },
    { code: 'D121', abbr: 'AML', short: 'Amlodipine', name: 'Amlodipine 5 mg', pack: 'strip of 10 tablets', mrp: 8, rate: 1.6, chronic: true },
    { code: 'D133', abbr: 'ATV', short: 'Atorvastatin', name: 'Atorvastatin 10 mg', pack: 'strip of 10 tablets', mrp: 14, rate: 1.2, chronic: true },
    { code: 'D140', abbr: 'TEL', short: 'Telmisartan', name: 'Telmisartan 40 mg', pack: 'strip of 10 tablets', mrp: 16, rate: 1.4, chronic: true },
    { code: 'D152', abbr: 'PAN', short: 'Pantoprazole', name: 'Pantoprazole 40 mg', pack: 'strip of 10 tablets', mrp: 13, rate: 1.5, chronic: false },
    { code: 'D165', abbr: 'CET', short: 'Cetirizine', name: 'Cetirizine 10 mg', pack: 'strip of 10 tablets', mrp: 6, rate: 1.0, chronic: false },
    { code: 'D171', abbr: 'AZI', short: 'Azithromycin', name: 'Azithromycin 500 mg', pack: 'strip of 3 tablets', mrp: 28, rate: 0.6, chronic: false },
    { code: 'D186', abbr: 'AMC', short: 'Amoxyclav', name: 'Amoxicillin + Clavulanate 625 mg', pack: 'strip of 6 tablets', mrp: 58, rate: 0.5, chronic: false },
    { code: 'D190', abbr: 'GLM', short: 'Glimepiride', name: 'Glimepiride 2 mg', pack: 'strip of 10 tablets', mrp: 11, rate: 1.0, chronic: true },
  ];
  const KENDRA = Object.fromEntries(KENDRAS.map(k => [k.id, k]));
  const DRUG = Object.fromEntries(DRUGS.map(d => [d.code, d]));

  // Two batches per medicine: an older one in use and a newer one delivered mid-period.
  const BATCHES = [];
  DRUGS.forEach((d, i) => {
    const L = 'ABCDEFGHJK'[i];
    const expA = addDays(TODAY, 230 + i * 21), mfgB = addDays(TODAY, -70 + i * 3);
    BATCHES.push({ id: `${d.abbr}25${L}${11 + i * 7}`, drug: d.code, lot: 'A', expiry: expA });
    BATCHES.push({ id: `${d.abbr}26${L}${12 + i * 7}`, drug: d.code, lot: 'B', mfg: mfgB, expiry: addDays(mfgB, 730) });
  });
  const batchOf = (abbr, lot) => BATCHES.find(b => b.lot === lot && DRUG[b.drug].abbr === abbr);
  batchOf('CET', 'A').expiry = addDays(TODAY, -14);
  batchOf('ATV', 'A').expiry = addDays(TODAY, 48);
  batchOf('GLM', 'A').expiry = addDays(TODAY, 75);
  BATCHES.forEach(b => { if (!b.mfg) b.mfg = addDays(b.expiry, -730); });
  const BATCH = Object.fromEntries(BATCHES.map(b => [b.id, b]));
  const batchesOf = code => BATCHES.filter(b => b.drug === code);
  const RECALLED_BATCH = batchOf('AZI', 'A').id;

  // ------------------------------------------------------------------ the ledger
  const GENESIS = '0'.repeat(64);
  const ledger = [];
  const blockHash = (prev, e) => SHA.sha256(prev + '\n' + JSON.stringify([e.seq, e.at, e.type, e.actor, e.data]));
  function append(at, type, actor, data) {
    const prev = ledger.length ? ledger[ledger.length - 1].hash : GENESIS;
    const e = { seq: ledger.length + 1, at, type, actor, data, prev };
    e.hash = blockHash(prev, e);
    ledger.push(e);
    return e;
  }
  function verifyChain() {
    const t0 = Date.now();
    let prev = GENESIS;
    for (const e of ledger) {
      if (e.prev !== prev) return { ok: false, seq: e.seq, why: 'link' };
      if (blockHash(e.prev, e) !== e.hash) return { ok: false, seq: e.seq, why: 'content' };
      prev = e.hash;
    }
    return { ok: true, count: ledger.length, head: prev, ms: Date.now() - t0 };
  }

  // ------------------------------------------------------------------ synthetic history
  // Scenarios (what the rules should find):
  //  Loni / Amoxyclav            heavy write-offs and 9 strips missing at the last count
  //  Kavi Nagar / Telmisartan    one customer buys 10 strips every few days, billed above MRP
  //  Vaishali / Azithromycin     keeps billing a recalled batch
  //  Muradnagar / Cetirizine     keeps billing a batch after it expired
  //  Raj Nagar Ext / Pantoprazole  a third of stock written off as water damage
  //  Modinagar / Metformin       some bills above MRP
  //  Crossings Republik / Paracetamol  one customer buys in bulk
  //  Crossings Republik / Amoxyclav    6 strips lost between warehouse and kendra
  //  Indirapuram / Glimepiride   write-offs a little above the limit (already under inquiry)
  //  Modinagar / Atorvastatin, Raj Nagar Ext / Glimepiride  over-stocked batches close to expiry
  const BULK_TEL = '9811402267', BULK_PCM = '8800916534';
  function generate() {
    const rnd = mulberry32(20261112);
    const poisson = l => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
    const lambda = (k, d) => d.rate * k.size;
    const key = (k, b) => k + '|' + b;
    const stock = {};
    const phones = {};
    KENDRAS.forEach(k => {
      phones[k.id] = Array.from({ length: 420 }, () => String(6 + Math.floor(rnd() * 4)) + String(Math.floor(rnd() * 1e9)).padStart(9, '0'));
    });
    const billNo = Object.fromEntries(KENDRAS.map((k, i) => [k.id, 4100 + i * 377]));
    const nextBill = k => `${k}-${String(++billNo[k]).padStart(6, '0')}`;

    const qtyA = (k, d) => {
      let q = lambda(k, d) * 44;
      if (d.abbr === 'AZI') q = lambda(k, d) * 66;
      if (k.id === 'GZB02' && d.abbr === 'AZI') q = lambda(k, d) * 95;
      if (k.id === 'GZB05' && d.abbr === 'ATV') q = lambda(k, d) * 130;
      if (k.id === 'GZB03' && d.abbr === 'GLM') q = lambda(k, d) * 170;
      if (k.id === 'GZB06' && d.abbr === 'CET') q = lambda(k, d) * 80;
      if (k.id === 'GZB04' && d.abbr === 'AMC') return 60;
      if (k.id === 'GZB07' && d.abbr === 'TEL') q += 60;
      if (k.id === 'GZB08' && d.abbr === 'PCM') q += 20;
      return Math.max(6, Math.round(q * (0.92 + rnd() * 0.16)));
    };
    const qtyB = (k, d) => {
      let q = lambda(k, d) * 40;
      if (k.id === 'GZB04' && d.abbr === 'AMC') return 50;
      if (k.id === 'GZB07' && d.abbr === 'TEL') q += 40;
      if (k.id === 'GZB08' && d.abbr === 'AMC') return 30;
      return Math.max(6, Math.round(q * (0.92 + rnd() * 0.16)));
    };

    let challanNo = 41180;
    const pending = {};
    const dispatchAll = (day, lot) => {
      KENDRAS.forEach((k, i) => {
        const items = DRUGS.map(d => [batchOf(d.abbr, lot).id, lot === 'A' ? qtyA(k, d) : qtyB(k, d)]);
        const challan = `DC/26/${++challanNo}`;
        append(`${day} 15:${String(10 + i * 4).padStart(2, '0')}`, 'dispatch', WAREHOUSE, { challan, to: k.id, items });
        // Crossings Republik's second delivery arrives 6 strips short of Amoxyclav.
        pending[k.id] = { challan, items: items.map(([b, q]) => [b, k.id === 'GZB08' && b === batchOf('AMC', 'B').id ? q - 6 : q]) };
      });
    };
    const receiveAll = day => {
      KENDRAS.forEach((k, i) => {
        const p = pending[k.id];
        append(`${day} 10:${String(5 + i * 5).padStart(2, '0')}`, 'receipt', `Kendra ${k.id}`, { kendra: k.id, challan: p.challan, items: p.items });
        p.items.forEach(([b, q]) => { stock[key(k.id, b)] = (stock[key(k.id, b)] || 0) + q; });
      });
    };

    const bulkDaysTel = [26, 23, 21, 18, 15, 12, 9, 6, 3].map(n => addDays(TODAY, -n));
    const bulkDaysPcm = [28, 24, 20, 16, 12, 8, 4].map(n => addDays(TODAY, -n));
    const lossDaysAmc = [55, 49, 44, 38, 33, 27, 21, 16, 11, 5].map(n => addDays(TODAY, -n));
    const lossDaysGlm = [47, 31, 19, 8].map(n => addDays(TODAY, -n));
    let recalled = false;

    dispatchAll(addDays(START, -2), 'A');
    for (let day = START; day <= LAST; day = addDays(day, 1)) {
      if (day === START || day === DELIVERY_2) receiveAll(day);
      if (day === addDays(DELIVERY_2, -2)) dispatchAll(day, 'B');
      if (day === RECALL_DATE) {
        append(`${day} 10:40`, 'recall', 'PMBI quality cell', {
          batch: RECALLED_BATCH, reason: 'Not of standard quality: failed the dissolution test',
          ref: 'State drug alert, October 2026 (synthetic)',
        });
        recalled = true;
      }
      if (day === addDays(RECALL_DATE, 1) || day === addDays(RECALL_DATE, 2)) {
        ['GZB01', 'GZB03', 'GZB04', 'GZB05', 'GZB06', 'GZB07', 'GZB08'].filter((_, i) => i % 2 === (day === addDays(RECALL_DATE, 1) ? 0 : 1))
          .forEach((k, i) => append(`${day} 11:${String(10 + i * 7).padStart(2, '0')}`, 'ack', `Kendra ${k}`, { kendra: k, batch: RECALLED_BATCH }));
      }
      if (day === addDays(TODAY, -3)) {
        append(`${day} 16:20`, 'case', 'R. Verma, PMBI field officer', {
          case: 'C-01190', status: 'In inquiry',
          note: 'Pharmacist says a roof leak in the store room damaged stock. Asked for photos and the damage register.',
        });
      }
      const sunday = new Date(day + 'T00:00:00Z').getUTCDay() === 0;
      KENDRAS.forEach((k, ki) => {
        const bills = [], written = [];
        const pick = (d, opts) => batchesOf(d.code)
          .filter(b => (stock[key(k.id, b.id)] || 0) > 0)
          .filter(b => opts.ignoreExpiry || b.expiry >= day)
          .filter(b => opts.ignoreRecall || !(recalled && b.id === RECALLED_BATCH))
          .sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
        const sell = (d, qty, phone, price, opts) => {
          const b = pick(d, opts);
          if (!b) return;
          const kb = key(k.id, b.id);
          qty = Math.min(qty, stock[kb]);
          stock[kb] -= qty;
          bills.push([nextBill(k.id), phone, b.id, qty, price]);
        };
        DRUGS.forEach(d => {
          const opts = {
            ignoreExpiry: k.id === 'GZB06' && d.abbr === 'CET',
            ignoreRecall: k.id === 'GZB02' && d.abbr === 'AZI',
          };
          const regulars = phones[k.id].slice((d.code.charCodeAt(3) * 7) % 300, (d.code.charCodeAt(3) * 7) % 300 + (d.chronic ? 90 : 400));
          const n = poisson(lambda(k, d) * (sunday ? 0.55 : 1) / (d.chronic ? 1.6 : 1.15));
          for (let i = 0; i < n; i++) {
            const qty = d.chronic ? (rnd() < 0.55 ? 1 : rnd() < 0.7 ? 2 : 3) : (rnd() < 0.85 ? 1 : 2);
            let price = d.mrp;
            if (k.id === 'GZB05' && d.abbr === 'MET' && day >= addDays(TODAY, -20) && rnd() < 0.3) price = 17;
            sell(d, qty, regulars[Math.floor(rnd() * regulars.length)], price, opts);
          }
          if (k.id === 'GZB07' && d.abbr === 'TEL' && bulkDaysTel.includes(day)) sell(d, 10, BULK_TEL, 18, opts);
          if (k.id === 'GZB08' && d.abbr === 'PCM' && bulkDaysPcm.includes(day)) sell(d, 5, BULK_PCM, d.mrp, opts);

          // write-offs
          const writeOff = (qty, why) => {
            while (qty > 0) {
              const b = pick(d, { ignoreExpiry: true, ignoreRecall: true });
              if (!b) return;
              const kb = key(k.id, b.id), q = Math.min(qty, stock[kb]);
              stock[kb] -= q; qty -= q; written.push([b.id, q, why]);
            }
          };
          if (rnd() < 0.008) writeOff(1, 'Damaged');
          if (k.id === 'GZB04' && d.abbr === 'AMC' && lossDaysAmc.includes(day)) writeOff(day < DELIVERY_2 ? 2 : 3, 'Damaged');
          if (k.id === 'GZB01' && d.abbr === 'GLM' && lossDaysGlm.includes(day)) writeOff(5, 'Damaged');
          if (k.id === 'GZB03' && d.abbr === 'PAN' && day === addDays(TODAY, -18)) writeOff(38, 'Water damage');
        });
        // Batches reaching expiry are written off at day close, except where the scenario keeps selling them.
        BATCHES.filter(b => b.expiry === day).forEach(b => {
          const kb = key(k.id, b.id);
          if (k.id === 'GZB06' && b.id === batchOf('CET', 'A').id) return;
          if (stock[kb] > 0) { written.push([b.id, stock[kb], 'Expired']); stock[kb] = 0; }
        });
        append(`${day} 21:${String(2 + ki * 3).padStart(2, '0')}`, 'dayclose', `Kendra ${k.id}`, { kendra: k.id, date: day, bills, written });
      });
      // Weekly physical stock count, every Wednesday evening (LAST is a Wednesday).
      if (daysBetween(day, LAST) % 7 === 0) {
        KENDRAS.forEach((k, ki) => {
          const items = BATCHES.filter(b => key(k.id, b.id) in stock).map(b => {
            let counted = stock[key(k.id, b.id)];
            if (day === LAST && k.id === 'GZB04' && b.id === batchOf('AMC', 'B').id) counted -= 9;
            return [b.id, counted];
          });
          append(`${day} 21:${String(35 + ki * 3).padStart(2, '0')}`, 'count', `Kendra ${k.id}`, { kendra: k.id, items });
        });
      }
    }
  }
  generate();

  // ------------------------------------------------------------------ derive the current state from the ledger
  function derive() {
    const db = {
      onHand: {}, received: {}, dispatched: {}, sold: {}, written: {}, tin: {}, tout: {},
      counts: {}, lastCount: {}, sales: [], writeoffs: [], recalls: {}, acks: {}, cases: {},
      complaints: [], transferRequests: [], transfersDone: {}, receipts: [], dispatches: [],
    };
    const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
    const sale = (e, kendra, date, [bill, phone, batch, qty, price]) => {
      const b = BATCH[batch];
      db.sales.push({
        bill, phone, batch, qty, price, kendra, date, at: e.at, seq: e.seq, drug: b.drug,
        expired: date > b.expiry, recalled: !!db.recalls[batch],
      });
      add(db.sold, kendra + '|' + batch, qty); add(db.onHand, kendra + '|' + batch, -qty);
    };
    for (const e of ledger) {
      const d = e.data, date = e.at.slice(0, 10);
      switch (e.type) {
        case 'dispatch':
          d.items.forEach(([b, q]) => add(db.dispatched, d.to + '|' + b, q));
          db.dispatches.push({ ...d, date, seq: e.seq });
          break;
        case 'receipt':
          d.items.forEach(([b, q]) => { add(db.received, d.kendra + '|' + b, q); add(db.onHand, d.kendra + '|' + b, q); });
          db.receipts.push({ ...d, date, seq: e.seq });
          break;
        case 'dayclose':
          d.bills.forEach(row => sale(e, d.kendra, d.date, row));
          d.written.forEach(([b, q, why]) => {
            add(db.written, d.kendra + '|' + b, q); add(db.onHand, d.kendra + '|' + b, -q);
            db.writeoffs.push({ kendra: d.kendra, batch: b, qty: q, why, date: d.date });
          });
          break;
        case 'sale':
          sale(e, d.kendra, date, d.bill);
          break;
        case 'count':
          d.items.forEach(([b, c]) => {
            const kb = d.kendra + '|' + b;
            db.counts[kb] = {
              counted: c, expected: db.onHand[kb] || 0, date, seq: e.seq,
              received: db.received[kb] || 0, sold: db.sold[kb] || 0, written: db.written[kb] || 0,
              tin: db.tin[kb] || 0, tout: db.tout[kb] || 0,
            };
          });
          db.lastCount[d.kendra] = date;
          break;
        case 'recall': db.recalls[d.batch] = { ...d, date, seq: e.seq }; break;
        case 'ack': (db.acks[d.batch] = db.acks[d.batch] || {})[d.kendra] = date; break;
        case 'case': (db.cases[d.case] = db.cases[d.case] || []).push({ ...d, at: e.at, actor: e.actor, seq: e.seq }); break;
        case 'complaint': db.complaints.push({ ...d, at: e.at, seq: e.seq }); break;
        case 'transfer-request': db.transferRequests.push({ ...d, at: e.at, seq: e.seq }); break;
        case 'transfer':
          add(db.onHand, d.from + '|' + d.batch, -d.qty); add(db.tout, d.from + '|' + d.batch, d.qty);
          add(db.onHand, d.to + '|' + d.batch, d.qty); add(db.tin, d.to + '|' + d.batch, d.qty);
          db.transfersDone[d.request] = { ...d, at: e.at };
          break;
      }
    }
    return db;
  }

  // ------------------------------------------------------------------ rules
  const DEFAULT_RULES = { writeoffPct: 15, bulkStrips: 12, expiryWindow: 90 };
  const RULES = [
    { key: 'balance', name: 'Stock count mismatch', weight: '3', checks: 'Physical stock count against what the ledger says should be on the shelf.' },
    { key: 'recalled', name: 'Recalled batch billed', weight: '3', checks: 'Bills for a batch after its recall was recorded.' },
    { key: 'transit', name: 'Short delivery', weight: '2', checks: 'Strips dispatched by the warehouse against strips the kendra acknowledged.' },
    { key: 'expired', name: 'Expired batch billed', weight: '2', checks: 'Bills dated after the batch expiry date.' },
    { key: 'overcharge', name: 'Billed above MRP', weight: '2', checks: 'Price per strip on each bill against the MRP.' },
    { key: 'bulk', name: 'Bulk buying', weight: '2', checks: 'One mobile number buying more of one medicine in 30 days than a person would need.', setting: 'bulkStrips', unit: 'strips in 30 days' },
    { key: 'writeoff', name: 'High write-offs', weight: '1, or 2 above double', checks: 'Strips written off as a share of strips received.', setting: 'writeoffPct', unit: '% of received' },
  ];
  const riskOf = score => score >= 3 ? 'High' : score === 2 ? 'Medium' : 'Low';
  const caseId = (k, d) => `C-${k.slice(3)}${d.slice(1)}`;
  const mask = p => p.slice(0, 2) + '••••••' + p.slice(-2);

  function caseStatus(db, id) {
    const ev = db.cases[id];
    return ev && ev.length ? ev[ev.length - 1].status : 'Open';
  }

  function evaluate(db, cfg = DEFAULT_RULES) {
    const findings = [];
    const salesBy = {};
    db.sales.forEach(s => { (salesBy[s.kendra + '|' + s.drug] = salesBy[s.kendra + '|' + s.drug] || []).push(s); });
    for (const k of KENDRAS) {
      for (const d of DRUGS) {
        const bs = batchesOf(d.code), kb = b => k.id + '|' + b.id;
        const sum = o => bs.reduce((s, b) => s + (o[kb(b)] || 0), 0);
        const dispatched = sum(db.dispatched), received = sum(db.received), written = sum(db.written);
        const lines = salesBy[k.id + '|' + d.code] || [];
        const hits = [];
        let value = 0;

        const short = dispatched - received;
        if (short > 0) {
          const ch = db.receipts.filter(r => r.kendra === k.id && r.items.some(([b, q]) => BATCH[b].drug === d.code &&
            q < (db.dispatches.find(x => x.challan === r.challan).items.find(i => i[0] === b) || [0, 0])[1]));
          hits.push({ rule: 'transit', weight: 2, title: 'Short delivery',
            text: `The warehouse dispatched ${dispatched} strips but the kendra acknowledged ${received}${ch.length ? ` (challan ${ch.map(c => c.challan).join(', ')})` : ''}. ${short} strips went missing in transit.` });
          value += short * d.mrp;
        }

        // Reconciliation at the latest stock count
        const snap = { received: 0, sold: 0, written: 0, tin: 0, tout: 0, expected: 0, counted: 0, date: null };
        bs.forEach(b => {
          const c = db.counts[kb(b)];
          if (!c) return;
          ['received', 'sold', 'written', 'tin', 'tout', 'expected', 'counted'].forEach(f => { snap[f] += c[f]; });
          if (!snap.date || c.date > snap.date) snap.date = c.date;
        });
        const missing = snap.expected - snap.counted;
        if (snap.date && missing !== 0) {
          hits.push({ rule: 'balance', weight: 3, title: 'Stock count mismatch',
            text: missing > 0
              ? `The ledger says ${snap.expected} strips should have been on the shelf at the count on ${fmtDate(snap.date)}. The kendra counted ${snap.counted}, so ${missing} strips are missing.`
              : `The kendra counted ${snap.counted} strips but the ledger expects ${snap.expected}. ${-missing} extra strips usually means sales were not billed.` });
          value += Math.max(missing, 0) * d.mrp;
        }

        const rec = lines.filter(s => s.recalled);
        if (rec.length) {
          const units = rec.reduce((s, x) => s + x.qty, 0);
          hits.push({ rule: 'recalled', weight: 3, title: 'Recalled batch billed',
            text: `${units} strips of recalled batch ${rec[0].batch} were billed on ${rec.length} bills after the recall on ${fmtDate(db.recalls[rec[0].batch].date)}.`, bills: rec });
        }
        const exp = lines.filter(s => s.expired);
        if (exp.length) {
          const units = exp.reduce((s, x) => s + x.qty, 0);
          hits.push({ rule: 'expired', weight: 2, title: 'Expired batch billed',
            text: `${units} strips of batch ${exp[0].batch} were billed on ${exp.length} bills after it expired on ${fmtDate(BATCH[exp[0].batch].expiry)}.`, bills: exp });
        }
        const over = lines.filter(s => s.price > d.mrp);
        if (over.length) {
          const excess = over.reduce((s, x) => s + (x.price - d.mrp) * x.qty, 0);
          hits.push({ rule: 'overcharge', weight: 2, title: 'Billed above MRP',
            text: `${over.length} bills charged more than the MRP of ₹${d.mrp} per strip. Customers paid ₹${excess} extra in total.`, bills: over });
          value += excess;
        }
        const byPhone = {};
        lines.forEach(s => { (byPhone[s.phone] = byPhone[s.phone] || []).push(s); });
        const buyers = [];
        Object.entries(byPhone).forEach(([phone, ls]) => {
          ls.sort((a, b) => a.date.localeCompare(b.date));
          let best = 0, j = 0, run = 0;
          for (let i = 0; i < ls.length; i++) {
            run += ls[i].qty;
            while (daysBetween(ls[j].date, ls[i].date) >= 30) run -= ls[j++].qty;
            best = Math.max(best, run);
          }
          if (best > cfg.bulkStrips) buyers.push({ phone, best, total: ls.reduce((s, x) => s + x.qty, 0), bills: ls });
        });
        if (buyers.length) {
          const b0 = buyers.sort((a, b) => b.best - a.best)[0];
          hits.push({ rule: 'bulk', weight: 2, title: 'Bulk buying',
            text: `Customer ${mask(b0.phone)} bought ${b0.best} strips within 30 days, across ${b0.bills.length} bills. The limit is ${cfg.bulkStrips}.${buyers.length > 1 ? ` ${buyers.length - 1} more customers are over the limit.` : ''}`,
            bills: buyers.flatMap(b => b.bills), buyers });
        }
        const pct = received ? written / received * 100 : 0;
        if (pct > cfg.writeoffPct) {
          const why = {};
          bs.forEach(b => db.writeoffs.filter(w => w.kendra === k.id && w.batch === b.id).forEach(w => { why[w.why] = (why[w.why] || 0) + w.qty; }));
          hits.push({ rule: 'writeoff', weight: pct > cfg.writeoffPct * 2 ? 2 : 1, title: 'High write-offs',
            text: `${written} of ${received} strips received were written off (${pct.toFixed(1)}%, limit ${cfg.writeoffPct}%): ${Object.entries(why).map(([w, q]) => `${q} ${w.toLowerCase()}`).join(', ')}.` });
        }
        if (!hits.length) continue;
        const score = hits.reduce((s, h) => s + h.weight, 0);
        const id = caseId(k.id, d.code);
        findings.push({ id, kind: 'rule', kendra: k, drug: d, hits, score, risk: riskOf(score), value, snap, lines, status: caseStatus(db, id) });
      }
    }
    const order = { High: 0, Medium: 1, Low: 2 };
    findings.sort((a, b) => order[a.risk] - order[b.risk] || b.score - a.score || b.value - a.value);

    // Citizen reports become cases of their own.
    db.complaints.forEach(c => {
      findings.push({ id: c.ref, kind: 'report', complaint: c, kendra: c.kendra ? KENDRA[c.kendra] : null,
        drug: c.drug ? DRUG[c.drug] : null, hits: [], score: 2, risk: 'Medium', value: c.excess || 0, status: caseStatus(db, c.ref) });
    });

    return { findings, advisories: advisories(db, cfg, salesBy), recalls: recallSummary(db) };
  }

  // Stock that will expire before it sells, with a suggested transfer to a kendra that can use it.
  function advisories(db, cfg, salesBy) {
    const out = [];
    const rate = (k, code) => (salesBy[k + '|' + code] || []).filter(s => daysBetween(s.date, TODAY) <= 30).reduce((s, x) => s + x.qty, 0) / 30;
    for (const k of KENDRAS) {
      for (const b of BATCHES) {
        const onHand = db.onHand[k.id + '|' + b.id] || 0;
        if (onHand <= 0 || db.recalls[b.id]) continue;
        const left = daysBetween(TODAY, b.expiry);
        if (left < 0) { out.push({ type: 'expired', kendra: k, batch: b, drug: DRUG[b.drug], onHand, left }); continue; }
        if (left > cfg.expiryWindow) continue;
        const r = rate(k.id, b.drug), willSell = Math.floor(r * left), unsold = onHand - willSell;
        if (unsold < 5) continue;
        const options = KENDRAS.filter(o => o.id !== k.id).map(o => ({
          kendra: o, rate: rate(o.id, b.drug),
          room: Math.floor(rate(o.id, b.drug) * left) - (db.onHand[o.id + '|' + b.id] || 0),
        })).sort((x, y) => y.room - x.room);
        const best = options[0];
        const move = best && best.room >= 5 ? Math.min(unsold, best.room) : 0;
        const id = `T-${k.id.slice(3)}${b.id}`;
        out.push({ id, type: 'expiring', kendra: k, batch: b, drug: DRUG[b.drug], onHand, left, rate: r, willSell, unsold, to: move ? best : null, move,
          request: db.transferRequests.find(t => t.id === id), done: db.transfersDone[id] });
      }
    }
    return out.sort((a, b) => (a.type === 'expired' ? -1 : 0) - (b.type === 'expired' ? -1 : 0) || a.left - b.left);
  }

  function recallSummary(db) {
    return Object.values(db.recalls).map(r => {
      const rows = KENDRAS.map(k => {
        const kb = k.id + '|' + r.batch;
        const after = db.sales.filter(s => s.kendra === k.id && s.batch === r.batch && s.recalled);
        return { kendra: k, received: db.received[kb] || 0, onHand: db.onHand[kb] || 0,
          soldAfter: after.reduce((s, x) => s + x.qty, 0), ack: (db.acks[r.batch] || {})[k.id] || null };
      }).filter(x => x.received > 0);
      return { ...r, drug: DRUG[BATCH[r.batch].drug], rows,
        stillHeld: rows.reduce((s, x) => s + Math.max(x.onHand, 0), 0), soldAfter: rows.reduce((s, x) => s + x.soldAfter, 0) };
    });
  }

  // ------------------------------------------------------------------ receipts that can be checked on any device
  // The QR on a bill carries the bill details plus a signature. A real deployment would sign on the
  // PMBI server with a private key; the prototype uses an HMAC with a published demo key.
  const DEMO_KEY = 'aushadhitrack-demo-signing-key';
  const receiptPayload = s => ['b=' + s.bill, 'k=' + s.kendra, 'bt=' + s.batch, 'q=' + s.qty, 'p=' + s.price, 'd=' + s.date].join('&');
  const signReceipt = s => SHA.hmac(DEMO_KEY, receiptPayload(s)).slice(0, 20);

  return {
    TODAY, START, LAST, DISTRICT, WAREHOUSE, KENDRAS, DRUGS, BATCHES, KENDRA, DRUG, BATCH, RULES, DEFAULT_RULES,
    fmtDate, ledger, append, verifyChain, derive, evaluate, caseStatus, batchesOf, addDays, daysBetween, mask,
    sha256: SHA.sha256, hmac: SHA.hmac, receiptPayload, signReceipt, blockHash, riskOf,
  };
})();
if (typeof module !== 'undefined') module.exports = AT;
