import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import type { FrontendAdapter } from './adapters/types';
import './styles.css';

async function boot() {
  let adapter: FrontendAdapter;
  if (import.meta.env.VITE_DATA_MODE === 'live') {
    const { LiveAdapter } = await import('./adapters/live');
    adapter = new LiveAdapter();
  } else {
    const { FixtureAdapter } = await import('./adapters/fixture');
    adapter = new FixtureAdapter(window.sessionStorage);
  }
  createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App adapter={adapter} /></BrowserRouter></React.StrictMode>);
}
void boot().catch(() => {
  const root = document.getElementById('root')!;
  root.textContent = 'LoanWick could not start. Reload the page and check the application setup.';
});
