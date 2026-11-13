import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { setTheme, useTheme } from '../lib/theme';
import { useToast } from '../lib/toast';
import type { CaseStatus, Risk } from '../lib/types';

export function Mark({ className = 'mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 18" aria-hidden="true">
      <rect x="1" y="1" width="28" height="16" rx="5" /><circle cx="8" cy="9" r="3.2" /><circle cx="15" cy="9" r="3.2" /><circle cx="22" cy="9" r="3.2" />
    </svg>
  );
}

const ICON_PATHS = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
  cases: <path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  kendras: <><path d="M4.5 10.5v9h15v-9" /><path d="M3 10.5 5 4.5h14l2 6z" /><path d="M9.5 19.5v-5h5v5" /></>,
  stock: <><circle cx="12" cy="12.5" r="8" /><path d="M12 8v4.5l3 2" /></>,
  batches: <><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></>,
  model: <><circle cx="6" cy="17" r="1.6" /><circle cx="10" cy="12.5" r="1.6" /><circle cx="14.5" cy="15.5" r="1.6" /><circle cx="18" cy="7" r="1.6" /><circle cx="18" cy="7" r="4" /></>,
  ledger: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  rules: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  bill: <><path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" /><path d="M9 8.5h6M9 12.5h6" /></>,
  notices: <><path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.3v.2" /></>,
};
export type IconName = keyof typeof ICON_PATHS;
export const Icon = ({ name, className = 'ico' }: { name: IconName; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICON_PATHS[name]}</svg>
);

export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} | AushadhiTrack` : 'AushadhiTrack'; }, [title]);
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  useTitle(title);
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {actions}
    </div>
  );
}

export const RiskTag = ({ risk, lead }: { risk: Risk; lead?: boolean }) =>
  lead ? <span className="risk r-lead">Model lead</span> : <span className={`risk r-${risk.toLowerCase()}`}>{risk}</span>;

export const StatusTag = ({ status, label }: { status: CaseStatus | 'Recalled' | 'Expired' | 'Soon' | 'In use'; label?: string }) =>
  <span className={`status s-${status.toLowerCase().replace(/\s+/g, '-')}`}>{label ?? status}</span>;

export const Back = ({ to, children }: { to: string; children: ReactNode }) => <Link className="back" to={to}>{children}</Link>;

export function Footer({ hindi = false }: { hindi?: boolean }) {
  return (
    <footer className="foot">
      <p>{hindi
        ? 'स्मार्ट इंडिया हैकथॉन 2026 (SIH26198) के लिए प्रोटोटाइप। सभी केंद्र, लोग और आँकड़े काल्पनिक हैं।'
        : 'Prototype for Smart India Hackathon 2026, problem statement SIH26198. Every kendra, person and figure is synthetic.'}</p>
      <div className="foot-links"><ThemeSwitch /><a href="classic/">Classic version</a><a href="https://github.com/Mkhurana3/AushadhiTrack">Source code</a></div>
    </footer>
  );
}

function ThemeSwitch() {
  const theme = useTheme();
  return (
    <span className="theme-switch" role="group" aria-label="Appearance">
      <span className="ts-label">Appearance</span>
      {(['studio', 'ledger'] as const).map(t => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === 'studio' ? 'Studio' : 'Ledger'}</button>
      ))}
    </span>
  );
}

export interface NavItem { to: string; label: string; icon: IconName; count?: number | string; alert?: boolean; end?: boolean }

export function Shell({ ctx, who, role, nav, children }: { ctx: ReactNode; who: string; role: string; nav: NavItem[]; children: ReactNode }) {
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  useEffect(() => { window.scrollTo(0, 0); main.current?.focus({ preventScroll: true }); }, [pathname]);
  return (
    <>
      <header className="topbar">
        <Link className="brand" to="/"><Mark /><span>AushadhiTrack</span></Link>
        <div className="ctx">{ctx}</div>
        <div className="who"><span className="who-name">{who}</span><span className="who-role">{role}</span><Link className="signout" to="/">Sign out</Link></div>
      </header>
      <div className="layout">
        <nav className="side" aria-label="Sections">
          <ul>{nav.map(n => (
            <li key={n.to}><NavLink to={n.to} end={n.end}>
              <Icon name={n.icon} className="nav-ico" /><span className="nav-label">{n.label}</span>{n.count ? <span className={'count' + (n.alert ? ' alert' : '')}>{n.count}</span> : null}
            </NavLink></li>
          ))}</ul>
        </nav>
        <main id="main" tabIndex={-1} ref={main}>{children}</main>
      </div>
      <Footer />
    </>
  );
}

/** Prints only the open dialog (a receipt), not the page behind it. */
export function printDialog() {
  document.body.classList.add('print-dialog');
  window.print();
  document.body.classList.remove('print-dialog');
}

export function Dialog({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return <dialog ref={ref} aria-label={label} onClose={onClose}>{open && children}</dialog>;
}

export function ToastHost() {
  const t = useToast();
  return <div className={'toast' + (t.text ? ' show' : '')} role="status" aria-live="polite">{t.text}</div>;
}

export function QrCode({ text, label }: { text: string; label: string }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const size = q.getModuleCount();
    let path = '';
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (q.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { n: size, d: path };
  }, [text]);
  return (
    <svg className="qr" viewBox={`-4 -4 ${n + 8} ${n + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#fff" /><path d={d} fill="#000" />
    </svg>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return <p className="legend">{items.map(([cls, text]) => <span key={text} className="lg"><span className={'key ' + cls} />{text}</span>)}</p>;
}
