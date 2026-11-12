import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastHost } from './components/ui';
import { Counter, KendraLayout, KendraStock, Notices } from './pages/kendra/Kendra';
import { CaseDetail, Cases } from './pages/officer/Cases';
import { OfficerLayout, Overview } from './pages/officer/Layout';
import { BatchDetail, Batches, ExpiringStock } from './pages/officer/Operations';
import { LedgerPage, ModelPage, RulesPage } from './pages/officer/System';
import { Start } from './pages/Start';
import { Verify } from './pages/Verify';

export function App() {
  return (
    <HashRouter>
      <a className="skip" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <div id="app">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/officer" element={<OfficerLayout />}>
            <Route index element={<Overview />} />
            <Route path="cases" element={<Cases />} />
            <Route path="cases/:id" element={<CaseDetail />} />
            <Route path="stock" element={<ExpiringStock />} />
            <Route path="batches" element={<Batches />} />
            <Route path="batches/:id" element={<BatchDetail />} />
            <Route path="model" element={<ModelPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="rules" element={<RulesPage />} />
          </Route>
          <Route path="/kendra/:kid" element={<KendraLayout />}>
            <Route index element={<Counter />} />
            <Route path="stock" element={<KendraStock />} />
            <Route path="notices" element={<Notices />} />
          </Route>
          <Route path="/verify" element={<Verify />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <ToastHost />
    </HashRouter>
  );
}
