const paths: Record<string, string> = {
  menu: 'M3 6h16 M3 11h16 M3 16h16',
  grid: 'M3 3h6v6H3z M13 3h6v6h-6z M3 13h6v6H3z M13 13h6v6h-6z',
  folder: 'M3 6V4h6l2 2h8v12H3z', search: 'M15 15l5 5 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  check: 'm5 11 4 4L18 6', arrow: 'M4 11h14m-5-5 5 5-5 5', document: 'M5 2h8l5 5v13H5z M13 2v6h5 M8 12h7 M8 16h7',
  clock: 'M11 6v6l4 2 M20 11a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  shield: 'M11 2 3 5v6c0 5 8 9 8 9s8-4 8-9V5z m-4 9 3 3 5-6',
  user: 'M18 20v-3c0-3-3-5-7-5s-7 2-7 5v3 M15 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  alert: 'm11 2 10 18H1z M11 8v5 M11 16v1', close: 'm5 5 12 12 M17 5 5 17', refresh: 'M18 7a8 8 0 1 0 1 9 M18 2v6h-6',
  info: 'M11 10v6 M11 6v1 M20 11a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.document} /></svg>;
}
