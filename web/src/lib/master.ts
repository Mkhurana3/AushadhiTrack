import master from '../data/master.json';
import type { Batch, Drug, Kendra } from './types';

export const TODAY: string = master.today;
export const DISTRICT: string = master.district;
export const WAREHOUSE: string = master.warehouse;
export const OFFICER: string = master.officer;
export const KENDRAS = master.kendras as Kendra[];
export const DRUGS = master.drugs as Drug[];
export const BATCHES = master.batches as Batch[];

export const KENDRA: Record<string, Kendra> = Object.fromEntries(KENDRAS.map(k => [k.id, k]));
export const DRUG: Record<string, Drug> = Object.fromEntries(DRUGS.map(d => [d.code, d]));
export const BATCH: Record<string, Batch> = Object.fromEntries(BATCHES.map(b => [b.id, b]));
export const batchesOf = (code: string) => BATCHES.filter(b => b.drug === code);
export const kname = (id: string | null | undefined) => (id && KENDRA[id] ? KENDRA[id].name : id ?? '');

const DAY_MS = 86_400_000;
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / DAY_MS);
export const START = addDays(TODAY, -60);
export const LAST = addDays(TODAY, -1);
export const caseIdFor = (kendra: string, drug: string) => `C-${kendra.slice(3)}${drug.slice(1)}`;
