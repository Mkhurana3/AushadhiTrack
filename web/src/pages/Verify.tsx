import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Dialog, Footer, Mark, useTitle } from '../components/ui';
import { fmtDate, fmtDateHi, inr } from '../lib/format';
import { TX, type Lang, type ReasonKey } from '../lib/i18n';
import { BATCH, BATCHES, DRUG, KENDRA, LAST, TODAY, kname } from '../lib/master';
import { verifyReceipt, type ReceiptFields } from '../lib/signing';
import { store, useApp } from '../lib/store';
import type { Batch, Sale } from '../lib/types';

type Check =
  | { kind: 'batch'; code: string; batch: Batch | null }
  | { kind: 'bill'; code: string; sale: (Sale | (ReceiptFields & { drug: string; time: string; recalled: false; viaSignature: true })) | null; sig: 'ok' | 'bad' | null };

const LANG_KEY = 'aushadhitrack.lang';
const initialLang = (): Lang => { try { return localStorage.getItem(LANG_KEY) === 'hi' ? 'hi' : 'en'; } catch { return 'en'; } };

export function Verify() {
  const { db } = useApp();
  const [params] = useSearchParams();
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [tab, setTab] = useState<'bill' | 'batch'>(params.get('batch') ? 'batch' : 'bill');
  const [code, setCode] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const t = TX[lang];
  const vDate = (s: string) => (lang === 'hi' ? fmtDateHi(s) : fmtDate(s));
  useTitle(t.title);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ } };

  const run = (kind: 'bill' | 'batch', raw: string, sigParams?: URLSearchParams): Check | null => {
    const c = raw.trim().toUpperCase();
    if (!c) return null;
    if (kind === 'batch') return { kind, code: c, batch: BATCH[c] ?? null };
    let sale: Extract<Check, { kind: 'bill' }>['sale'] = db.sales.find(s => s.bill === c) ?? null;
    let sig: 'ok' | 'bad' | null = null;
    if (sigParams?.get('s')) {
      const fields: ReceiptFields = { bill: sigParams.get('b') ?? '', kendra: sigParams.get('k') ?? '', batch: sigParams.get('bt') ?? '',
        qty: Number(sigParams.get('q')), price: Number(sigParams.get('p')), date: sigParams.get('d') ?? '' };
      sig = verifyReceipt(fields, sigParams.get('s')!) ? 'ok' : 'bad';
      if (sig === 'ok' && !sale && BATCH[fields.batch]) sale = { ...fields, drug: BATCH[fields.batch].drug, time: '', recalled: false, viaSignature: true };
    }
    return { kind, code: c, sale, sig };
  };

  // A scanned receipt opens this page with the bill details and signature in the address.
  useEffect(() => {
    const b = params.get('b'), batch = params.get('batch');
    if (b) { setTab('bill'); setCode(b); setCheck(run('bill', b, params)); }
    else if (batch) { setTab('batch'); setCode(batch); setCheck(run('batch', batch)); }
  }, [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError(t.empty); setCheck(null); return; }
    setError(''); setCheck(run(tab, code));
  };

  const samples = useMemo(() => {
    const last = (fn: (s: Sale) => boolean) => [...db.sales].reverse().find(fn);
    const recalledBatch = Object.keys(db.recalls)[0];
    type Sample = { kind: 'bill' | 'batch'; code: string | undefined; key: keyof typeof TX.en.s };
    const list: Sample[] = [
      { kind: 'bill', code: last(s => s.kendra === 'GZB01' && s.date === LAST && s.price === DRUG[s.drug].mrp && !s.expired)?.bill, key: 'normal' },
      { kind: 'bill', code: last(s => s.kendra === 'GZB07' && s.price > DRUG[s.drug].mrp)?.bill, key: 'over' },
      { kind: 'bill', code: last(s => s.recalled)?.bill, key: 'recalled' },
      { kind: 'bill', code: last(s => s.expired)?.bill, key: 'expired' },
      { kind: 'bill', code: 'GZB03-999999', key: 'fake' },
      { kind: 'batch', code: recalledBatch, key: 'brecalled' },
      { kind: 'batch', code: BATCHES[3].id, key: 'bok' },
    ];
    return list.filter((x): x is Sample & { code: string } => Boolean(x.code));
  }, [db]);

  return (
    <>
      <header className="topbar public">
        <Link className="brand" to="/verify"><Mark /><span>AushadhiTrack</span></Link>
        <div className="lang" role="group" aria-label="Language">
          <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button type="button" lang="hi" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')}>हिन्दी</button>
        </div>
        <Link className="signout" to="/">{t.staff}</Link>
      </header>
      <main id="main" className="verify" tabIndex={-1} lang={lang}>
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
        <div className="tabs" role="tablist">
          {(['bill', 'batch'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setCode(''); setCheck(null); setError(''); input.current?.focus(); }}>
              {k === 'bill' ? t.tabBill : t.tabBatch}
            </button>
          ))}
        </div>
        <form className="verify-form" role="tabpanel" onSubmit={submit} noValidate>
          <label htmlFor="vcode">{tab === 'bill' ? t.billLabel : t.batchLabel}</label>
          <div className="verify-row">
            <input id="vcode" ref={input} autoComplete="off" spellCheck={false} autoCapitalize="characters" value={code}
              onChange={e => setCode(e.target.value)} placeholder={tab === 'bill' ? 'GZB01-004512' : 'AZI25H60'} />
            <button className="btn primary">{t.check}</button>
          </div>
          <p className="hint">{tab === 'bill' ? t.billHint : t.batchHint}</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
        <div aria-live="polite">{check && <Result check={check} lang={lang} vDate={vDate} onReport={() => setReporting(true)} />}</div>
        <section className="samples" aria-labelledby="smp-h">
          <h2 id="smp-h">{t.samples}</h2>
          <ul>{samples.map(({ kind, code: c, key }) => (
            <li key={c}><button type="button" className="link" onClick={() => { setTab(kind); setCode(c); setError(''); setCheck(run(kind, c)); }}>{c}</button><span>{t.s[key]}</span></li>
          ))}</ul>
        </section>
      </main>
      <Footer hindi={lang === 'hi'} />
      <Dialog open={reporting} onClose={() => setReporting(false)} label={t.reportTitle}>
        <ReportForm check={check} lang={lang} onClose={() => setReporting(false)} />
      </Dialog>
    </>
  );
}

function Result({ check, lang, vDate, onReport }: { check: Check; lang: Lang; vDate: (s: string) => string; onReport: () => void }) {
  const { db } = useApp();
  const t = TX[lang];
  const lines: [cls: 'ok' | 'bad' | 'warn', text: string][] = [];
  let facts: [string, string][] = [];
  if (check.kind === 'batch') {
    const b = check.batch;
    if (!b) lines.push(['bad', t.batchUnknown(check.code)]);
    else {
      const rc = db.recalls[b.id];
      if (rc) lines.push(['bad', t.recalled(vDate(rc.date))]);
      else if (b.expiry < TODAY) lines.push(['bad', t.expiredNow(vDate(b.expiry))]);
      else lines.push(['ok', t.batchOk(vDate(b.expiry))]);
      facts = [[t.f.medicine, DRUG[b.drug].name], [t.f.batch, b.id], [t.f.made, vDate(b.mfg)], [t.f.expires, vDate(b.expiry)]];
    }
  } else {
    const s = check.sale;
    if (check.sig === 'bad') lines.push(['bad', t.badSig]);
    if (!s) { if (check.sig !== 'bad') lines.push(['bad', t.notFound(check.code)]); }
    else {
      const d = DRUG[s.drug], b = BATCH[s.batch], rc = db.recalls[s.batch];
      lines.push(['ok', 'viaSignature' in s ? t.genuineSig(kname(s.kendra)) : t.genuine(kname(s.kendra), vDate(s.date))]);
      if (s.price > d.mrp) lines.push(['bad', t.priceBad(s.price, d.mrp, (s.price - d.mrp) * s.qty)]); else lines.push(['ok', t.priceOk(d.mrp)]);
      if (rc) lines.push(['bad', t.recalled(vDate(rc.date))]);
      if (s.date > b.expiry) lines.push(['bad', t.expiredAtSale(vDate(b.expiry))]);
      else if (b.expiry < TODAY) lines.push(['warn', t.expiredNow(vDate(b.expiry))]);
      else if (!rc) lines.push(['ok', t.expiryOk(b.id, vDate(b.expiry))]);
      facts = [[t.f.bill, s.bill], [t.f.kendra, `${kname(s.kendra)} (${s.kendra})`], [t.f.medicine, d.name], [t.f.strips, String(s.qty)], [t.f.paid, inr(s.qty * s.price)]];
    }
  }
  const bad = lines.some(l => l[0] === 'bad');
  return (
    <div className={`result ${bad ? 'bad' : 'ok'}`}>
      <ul className="checks">{lines.map(([cls, text]) => <li key={text} className={cls}>{text}</li>)}</ul>
      {facts.length > 0 && <dl className="facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {bad && <button className="btn" type="button" onClick={onReport}>{t.report}</button>}
    </div>
  );
}

function ReportForm({ check, lang, onClose }: { check: Check | null; lang: Lang; onClose: () => void }) {
  const t = TX[lang];
  const sale = check?.kind === 'bill' ? check.sale : null;
  const guess: ReasonKey = sale && sale.price > DRUG[sale.drug].mrp ? 'overcharged' : (check?.kind === 'batch' && check.batch) || sale ? 'expired' : 'notfound';
  const [reason, setReason] = useState<ReasonKey>(guess);
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [sentRef, setSentRef] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (phone && !/^[6-9]\d{9}$/.test(phone)) { setError(t.badPhone); return; }
    const ref = `R-${2600 + store.getState().db.complaints.length + 1}`;
    const drug = sale ? sale.drug : check?.kind === 'batch' && check.batch ? check.batch.drug : null;
    store.append('complaint', 'Patient (unverified)', {
      ref, reason, reasonText: TX.en.reasons[reason], details: details.trim(), phone, kind: check?.kind ?? 'bill', code: check?.code ?? '',
      kendra: sale && KENDRA[sale.kendra] ? sale.kendra : null, drug,
      excess: sale && sale.price > DRUG[sale.drug].mrp ? (sale.price - DRUG[sale.drug].mrp) * sale.qty : 0,
    });
    setSentRef(ref);
  };
  if (sentRef) {
    return (
      <div className="dialog-form" lang={lang}>
        <h2>{t.reportTitle}</h2><p className="callout ok">{t.sent(sentRef)}</p>
        <div className="dialog-actions"><button type="button" className="btn primary" onClick={onClose} autoFocus>{t.close}</button></div>
      </div>
    );
  }
  return (
    <form className="dialog-form" lang={lang} onSubmit={submit} noValidate>
      <h2>{t.reportTitle}</h2>
      <fieldset><legend>{t.reasonLabel}</legend>
        {(Object.keys(t.reasons) as ReasonKey[]).map(k => (
          <label key={k} className="radio"><input type="radio" name="reason" value={k} checked={reason === k} onChange={() => setReason(k)} /> {t.reasons[k]}</label>
        ))}
      </fieldset>
      <label htmlFor="rp-details">{t.details}</label><textarea id="rp-details" rows={3} value={details} onChange={e => setDetails(e.target.value)} />
      <label htmlFor="rp-phone">{t.mobile}</label>
      <input id="rp-phone" inputMode="numeric" maxLength={10} autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="btn" onClick={onClose}>{t.cancel}</button><button className="btn primary">{t.send}</button></div>
    </form>
  );
}
