import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './fonts';
import { applyTheme } from './lib/theme';
import './styles.css';
import './studio.css';

applyTheme();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
