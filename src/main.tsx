import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({ immediate: false });
      })
      .catch(() => null);
  } else {
    // Clear any stale dev service workers from prior sessions so Vite dev modules never stall behind a SW cache
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => null);
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  try {
    createRoot(rootEl).render(<App />);
    if (typeof window !== 'undefined') {
      (window as unknown as { __STOCKS_MOUNTED__?: boolean }).__STOCKS_MOUNTED__ = true;
    }
  } catch (err) {
    console.error('[Stocks] Fatal mount error:', err);
  }
}
