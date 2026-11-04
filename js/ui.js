const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  prev: svg('<path d="M15 6l-6 6 6 6"/>'),
  next: svg('<path d="M9 6l6 6-6 6"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  someday: svg('<path d="M4 13l2.4-7h11.2L20 13v5H4z"/><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20"/>'),
  repeat: svg('<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>'),
  note: svg('<path d="M5 7h14M5 12h14M5 17h8"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  play: svg('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>'),
  pause: svg('<path d="M9 5v14M15 5v14" stroke-width="2.5"/>'),
  stop: svg('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>'),
  clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>'),
  stats: svg('<path d="M5 20v-8M12 20V5M19 20v-5"/>'),
};

const pad = n => String(n).padStart(2, '0');

// A running clock: 754000 → "12:34", 3723000 → "1:02:03".
export function clock(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// A total: 4800000 → "1h 20m".
export function duration(ms) {
  const total = Math.round(ms / 60000);
  if (ms > 0 && total < 1) return '<1m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// Elements showing a running timer carry data-since (timer start) and data-base (time already tracked).
export function liveClock(it, cls = '') {
  const base = it.sessions.reduce((sum, [a, b]) => sum + b - a, 0);
  return `<span class="${cls}" data-base="${base}" data-since="${it.timerStart}">${clock(base + Date.now() - it.timerStart)}</span>`;
}

export function tick(root = document) {
  const now = Date.now();
  for (const el of root.querySelectorAll('[data-since]')) el.textContent = clock(+el.dataset.base + now - +el.dataset.since);
}
setInterval(tick, 1000);

export const COLORS = { red: 'Rot', orange: 'Orange', yellow: 'Gelb', green: 'Grün', blue: 'Blau', violet: 'Violett' };
