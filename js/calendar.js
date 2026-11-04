import { iso, parse, addDays, todayIso } from './dates.js';
import { signedInClient, onSyncChange } from './sync.js';

// Read-only calendar subscriptions (iCal addresses, e.g. Google Calendar's private address).
// The feeds live in Supabase (calendar_feeds); the edge function "ics" fetches their text, because
// browsers may not fetch calendar.google.com directly. ical.js parses them and expands recurring events.
// Events of the weeks around today are cached, so the week still shows them offline.

const LIB = 'https://cdn.jsdelivr.net/npm/ical.js@2.2.1/dist/ical.min.js';
const CACHE_KEY = 'tage.calendar.v1';
const REFRESH = 15 * 60_000;
export const FEED_COLORS = ['blue', 'green', 'violet', 'orange', 'red', 'yellow'];

let ICAL = null;
let feeds = [];
let parsed = [];       // [{ feed, events: [ICAL.Event, exceptions related] }]
const byDay = new Map(); // iso day → events, filled per visible week
let cache = loadCache();
let lastFetch = 0;
let status = 'idle';   // idle | loading | error
const listeners = new Set();

export const onCalendarChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn());
export const calendarInfo = () => ({ feeds, status });

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? { days: {} }; } catch { return { days: {} }; }
}

function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full */ }
}

// Events of one day: all-day first, then by start time.
export const eventsFor = day => byDay.get(day) ?? cache.days[day] ?? [];

// --- feeds ---------------------------------------------------------------------

export async function refreshCalendars(force = false) {
  const db = signedInClient();
  if (!db || (!force && Date.now() - lastFetch < REFRESH)) return;
  lastFetch = Date.now();
  status = 'loading';
  notify();
  try {
    const { data, error } = await db.from('calendar_feeds').select('id, name, color, only_single').order('created_at');
    if (error) throw error;
    feeds = data;
    ICAL ??= (await import(LIB)).default;
    parsed = await Promise.all(feeds.map(async feed => {
      const { data: text, error: err } = await db.functions.invoke('ics', { body: { id: feed.id } });
      if (err) throw err;
      return { feed, events: parseIcs(String(text)) };
    }));
    byDay.clear();
    cacheAroundToday();
    status = 'idle';
  } catch (e) {
    console.warn('Kalender konnte nicht geladen werden', e);
    status = 'error';
  }
  notify();
}

export async function addFeed(name, url, onlySingle) {
  const db = signedInClient();
  const color = FEED_COLORS[feeds.length % FEED_COLORS.length];
  const { error } = await db.from('calendar_feeds').insert({ name, url, color, only_single: onlySingle });
  if (error) return error.message;
  await refreshCalendars(true);
  return status === 'error' ? 'Der Kalender ließ sich nicht laden. Stimmt die Adresse?' : null;
}

export async function setOnlySingle(id, onlySingle) {
  await signedInClient()?.from('calendar_feeds').update({ only_single: onlySingle }).eq('id', id);
  await refreshCalendars(true);
}

export async function removeFeed(id) {
  await signedInClient()?.from('calendar_feeds').delete().eq('id', id);
  await refreshCalendars(true);
}

// --- parsing -------------------------------------------------------------------

// Groups the VEVENTs by UID so moved or cancelled single occurrences (RECURRENCE-ID) apply to their series.
function parseIcs(text) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);
  const masters = new Map();
  const exceptions = [];
  for (const v of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex);
    else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }
  return [...masters.values()];
}

const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Adds one occurrence to the days of [from, to) it belongs to. All-day events end at midnight
// of the day after, so they cover [start, end); timed events show on their start day.
function place(out, feed, title, location, start, end, allDay, from, to) {
  if (allDay) {
    for (let d = start; d < end && d < to; d = addDays(d, 1)) {
      if (d >= from) (out[iso(d)] ??= []).push({ title, location, allDay: true, color: feed.color });
    }
  } else if (start >= from && start < to) {
    (out[iso(start)] ??= []).push({ title, location, allDay: false, start: hhmm(start), end: hhmm(end), color: feed.color });
  }
}

// Expands all feeds into the days of [from, to).
function expand(from, to) {
  const out = {};
  const rangeEnd = ICAL.Time.fromJSDate(to);
  for (const { feed, events } of parsed) {
    for (const ev of events) {
      const title = ev.summary || '(ohne Titel)';
      if (feed.only_single && ev.isRecurring()) continue;
      if (!ev.isRecurring()) {
        place(out, feed, title, ev.location, ev.startDate.toJSDate(), ev.endDate.toJSDate(), ev.startDate.isDate, from, to);
        continue;
      }
      const it = ev.iterator();
      for (let next = it.next(); next && next.compare(rangeEnd) < 0; next = it.next()) {
        const o = ev.getOccurrenceDetails(next);
        const end = o.endDate.toJSDate();
        if (end <= from || o.item.component.getFirstPropertyValue('status') === 'CANCELLED') continue;
        place(out, feed, o.item.summary || title, o.item.location, o.startDate.toJSDate(), end, o.startDate.isDate, from, to);
      }
    }
  }
  for (const list of Object.values(out)) {
    list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || (a.start ?? '').localeCompare(b.start ?? ''));
  }
  return out;
}

// Makes sure the week starting at `monday` is expanded (beyond the cached weeks, too).
export function prepareWeek(monday) {
  if (!parsed.length || byDay.has(iso(monday))) return;
  const days = expand(monday, addDays(monday, 7));
  for (let i = 0; i < 7; i++) {
    const day = iso(addDays(monday, i));
    byDay.set(day, days[day] ?? []);
  }
}

// Keeps four weeks back and twelve ahead for offline use.
function cacheAroundToday() {
  const today = parse(todayIso());
  cache = { days: expand(addDays(today, -28), addDays(today, 84)) };
  saveCache();
}

onSyncChange(() => refreshCalendars());
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshCalendars());
