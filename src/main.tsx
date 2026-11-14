import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Follow the GoblinLife theme cookie (shared across the site); with none, follow the device.
try {
  const m = document.cookie.match(/(?:^|; )gl_color_scheme=(light|dark)/);
  if (m) document.documentElement.dataset.theme = m[1];
} catch {
  /* cookies blocked: follow the device */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
