import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useToast } from '../lib/toast';
import type { CaseStatus, Risk } from '../lib/types';

export function Mark({ className = 'mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 30 18" aria-hidden="true">
      <rect x="1" y="1" width="28" height="16" rx="5" /><circle cx="8" cy="9" r="3.2" /><circle cx="15" cy="9" r="3.2" /><circle cx="22" cy="9" r="3.2" />
    </svg>
  );
}

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
      <p className="foot-links"><a href="classic/">Classic version</a><a href="https://github.com/Mkhurana3/AushadhiTrack">Source code</a></p>
    </footer>
  );
}

export interface NavItem { to: string; label: string; count?: number | string; alert?: boolean; end?: boolean }

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
              <span>{n.label}</span>{n.count ? <span className={'count' + (n.alert ? ' alert' : '')}>{n.count}</span> : null}
            </NavLink></li>
          ))}</ul>
        </nav>
        <main id="main" tabIndex={-1} ref={main}>{children}</main>
      </div>
      <Footer />
    </>
  );
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
