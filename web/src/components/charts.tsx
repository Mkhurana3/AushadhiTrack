import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { fmtShort } from '../lib/format';
import { START, TODAY, addDays, daysBetween } from '../lib/master';
import type { Sale } from '../lib/types';
import { Legend } from './ui';

/** Horizontally scrollable on narrow screens, starting at the right so the latest days are in view. */
function ChartWrap({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const el = ref.current; if (el) el.scrollLeft = el.scrollWidth; }, []);
  return <div className="chart-wrap" ref={ref}>{children}</div>;
}

/** Strips billed per day over the 60-day window, with flagged bills in red and dated markers. */
export function SalesChart({ lines, flagged, markers, flagLabel = 'On a flagged bill' }: {
  lines: Sale[]; flagged: Set<string>; markers: [string, string][]; flagLabel?: string;
}) {
  const days = daysBetween(START, TODAY) + 1, W = 640, H = 150, L = 30, B = 22, T = 10;
  const per = new Array<number>(days).fill(0), flag = new Array<number>(days).fill(0);
  lines.forEach(s => {
    const i = daysBetween(START, s.date);
    if (i < 0 || i >= days) return;
    per[i] += s.qty;
    if (flagged.has(s.bill)) flag[i] += s.qty;
  });
  const max = Math.max(4, ...per), step = (W - L) / days, bw = Math.max(2, step - 2);
  const y = (v: number) => T + (H - B - T) * (1 - v / max);
  const xOf = (d: string) => L + daysBetween(START, d) * step + step / 2;
  const ticks = [0, 20, 40, days - 1].map(i => addDays(START, i));
  const total = per.reduce((s, x) => s + x, 0);
  return (
    <>
      <ChartWrap>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${total} strips billed over ${days} days, up to ${Math.max(...per)} in a day`}>
          <line x1={L} x2={W} y1={y(0)} y2={y(0)} className="axis" />
          <line x1={L} x2={W} y1={y(max)} y2={y(max)} className="grid" />
          <text x={L - 6} y={y(max) + 4} className="tick" textAnchor="end">{max}</text>
          <text x={L - 6} y={y(0) + 4} className="tick" textAnchor="end">0</text>
          {per.map((v, i) => v ? <rect key={'b' + i} x={L + i * step + 1} y={y(v)} width={bw} height={y(0) - y(v)} className="bar" /> : null)}
          {flag.map((v, i) => v ? <rect key={'f' + i} x={L + i * step + 1} y={y(v)} width={bw} height={y(0) - y(v)} className="bar flagged" /> : null)}
          {markers.map(([d, t], i) => (
            <g key={d + t}>
              <line x1={xOf(d)} x2={xOf(d)} y1={T - 4} y2={y(0)} className="marker" />
              <text x={xOf(d) - 4} y={T + 6 + i * 13} className="mlabel" textAnchor="end">{t}</text>
            </g>
          ))}
          {ticks.map((d, i) => (
            <text key={d} x={i === ticks.length - 1 ? W - 2 : xOf(d)} y={H - 6} className="tick" textAnchor={i === ticks.length - 1 ? 'end' : 'middle'}>{fmtShort(d)}</text>
          ))}
        </svg>
      </ChartWrap>
      <Legend items={[['bar', 'Billed'], ['bar flagged', flagLabel]]} />
    </>
  );
}

/** Share of bills by hour of day for one kendra, against the same medicine at the other kendras. */
export function HourChart({ own, peers }: { own: Sale[]; peers: Sale[] }) {
  const hours = Array.from({ length: 12 }, (_, i) => 9 + i);
  const share = (xs: Sale[]) => hours.map(h => xs.length ? xs.filter(s => +s.time.slice(0, 2) === h).length / xs.length : 0);
  const a = share(own), p = share(peers);
  const W = 640, H = 150, L = 30, B = 22, T = 10, max = Math.max(0.2, ...a, ...p);
  const step = (W - L) / hours.length, y = (v: number) => T + (H - B - T) * (1 - v / max);
  return (
    <>
      <ChartWrap>
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of bills by hour of the day, this kendra against the others">
          <line x1={L} x2={W} y1={y(0)} y2={y(0)} className="axis" />
          <text x={L - 6} y={y(max) + 4} className="tick" textAnchor="end">{Math.round(max * 100)}%</text>
          {hours.map((h, i) => (
            <g key={h}>
              <rect x={L + i * step + 6} y={y(a[i])} width={step / 2 - 6} height={y(0) - y(a[i])} className={h === 20 ? 'bar flagged' : 'bar'} />
              <rect x={L + i * step + step / 2} y={y(p[i])} width={step / 2 - 6} height={y(0) - y(p[i])} className="bar peer" />
              <text x={L + i * step + step / 2} y={H - 6} className="tick" textAnchor="middle">{h}:00</text>
            </g>
          ))}
        </svg>
      </ChartWrap>
      <Legend items={[['bar', 'This kendra'], ['bar flagged', 'This kendra, 20:00 to closing'], ['bar peer', 'Other kendras']]} />
    </>
  );
}
