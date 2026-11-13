const D_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const D_SHORT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const D_HI = new Intl.DateTimeFormat('hi-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const asDate = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00Z');

export const fmtDate = (s: string) => D_FMT.format(asDate(s));
export const fmtShort = (s: string) => D_SHORT.format(asDate(s));
export const fmtDateHi = (s: string) => D_HI.format(asDate(s));
export const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
export const num = (n: number) => Math.round(n).toLocaleString('en-IN');
export const mask = (p: string) => p.slice(0, 2) + '••••••' + p.slice(-2);
export const plural = (n: number, one: string, many = one + 's') => `${num(n)} ${n === 1 ? one : many}`;
export const timeNow = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
