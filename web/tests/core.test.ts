import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { derive } from '../src/lib/derive';
import { GENESIS, Ledger, blockHash } from '../src/lib/ledger';
import { addDays, batchesOf, TODAY } from '../src/lib/master';
import { evaluate } from '../src/lib/rules';
import { signReceipt, verifyReceipt } from '../src/lib/signing';
import type { LedgerEvent } from '../src/lib/types';

const seed = () => new Ledger(JSON.parse(readFileSync(new URL('../src/data/ledger.json', import.meta.url), 'utf8')) as LedgerEvent[]);

describe('ledger', () => {
  it('hashes exactly like the Python pipeline', () => {
    // Same event and expected hash as ml/tests/test_pipeline.py
    const e = { seq: 1, at: '2026-11-12 10:00', type: 'sale', actor: 'Kendra GZB01',
      data: { kendra: 'GZB01', note: '₹12 जन औषधि "quoted"', items: [['PCM25A11', 2]] } } as unknown as LedgerEvent;
    expect(blockHash(GENESIS, e)).toBe('ef27674cf765c76fb8b3057e0b36cabc785097797679f75099cdac5538f02755');
  });

  it('verifies the chain generated in Python', () => {
    const check = seed().verify();
    expect(check.ok).toBe(true);
  });

  it('catches an edit to an old record and shows what it would have hidden', () => {
    const led = seed();
    const before = evaluate(derive(led.events)).findings.find(f => f.id === 'C-04186');
    const target = led.events.find(e => e.type === 'dayclose' && e.data.kendra === 'GZB04' && e.data.date === addDays(TODAY, -5))!;
    if (target.type !== 'dayclose') throw new Error('unexpected record');
    target.data.bills.push(['GZB04-009999', '20:51', '9999999999', batchesOf('D186').find(b => b.lot === 'B')!.id, 9, 58]);
    expect(led.verify()).toEqual({ ok: false, seq: target.seq, why: 'content' });
    const after = evaluate(derive(led.events)).findings.find(f => f.id === 'C-04186');
    expect(before?.risk).toBe('High');
    expect(after?.risk).toBe('Low');
  });

  it('appends records that chain on', () => {
    const led = seed();
    led.append(`${TODAY} 11:00`, 'ack', 'Kendra GZB02', { kendra: 'GZB02', batch: 'AZI25H60' });
    expect(led.verify().ok).toBe(true);
  });
});

describe('rules and model', () => {
  const { findings, advisories, recalls } = evaluate(derive(seed().events));
  const byId = Object.fromEntries(findings.map(f => [f.id, f]));

  it('finds every planted rule case with the right risk', () => {
    expect(Object.fromEntries(findings.filter(f => f.kind === 'rule').map(f => [f.id, f.risk]))).toEqual({
      'C-04186': 'High', 'C-07140': 'High', 'C-02171': 'High',
      'C-08186': 'Medium', 'C-05117': 'Medium', 'C-03152': 'Medium', 'C-06165': 'Medium', 'C-08104': 'Medium',
      'C-01190': 'Low',
    });
  });

  it('turns the phantom billing into a model-only lead', () => {
    expect(byId['M-03104']?.kind).toBe('model');
    expect(byId['C-03104']).toBeUndefined();
  });

  it('keeps the inquiry already opened on Indirapuram', () => {
    expect(byId['C-01190'].status).toBe('In inquiry');
  });

  it('suggests moving stock that will expire unsold, and tracks the recall', () => {
    expect(advisories.filter(a => a.type === 'expiring' && a.to).length).toBe(2);
    expect(recalls[0].rows.find(r => r.kendra.id === 'GZB02')?.soldAfter).toBeGreaterThan(0);
  });
});

describe('receipt signatures', () => {
  const r = { bill: 'GZB02-005124', kendra: 'GZB02', batch: 'TEL26E40', qty: 2, price: 16, date: TODAY };
  it('verifies a genuine receipt', () => expect(verifyReceipt(r, signReceipt(r))).toBe(true));
  it('rejects an edited price', () => expect(verifyReceipt({ ...r, price: 8 }, signReceipt(r))).toBe(false));
  it('rejects a receipt claimed by another kendra', () => expect(verifyReceipt({ ...r, kendra: 'GZB01' }, signReceipt(r))).toBe(false));
  it('rejects garbage', () => expect(verifyReceipt(r, 'not-a-signature')).toBe(false));
});
