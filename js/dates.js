// Dates are passed around as local ISO day strings ("2026-11-04"), which sort and compare as plain strings.
const pad = n => String(n).padStart(2, '0');

export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => iso(new Date());

export function parse(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function startOfWeek(d) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

// Rounded so that daylight saving days (23 or 25 hours) still count as one day.
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);

export function weekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

const format = opts => {
  const f = new Intl.DateTimeFormat('de-DE', opts);
  return d => f.format(d).replace('.', '');
};
export const monthName = format({ month: 'long' });
export const monthShort = format({ month: 'short' });
export const weekdayShort = format({ weekday: 'short' });
export const longDate = s => new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }).format(parse(s));
