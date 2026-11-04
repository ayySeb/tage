import { iso, parse, addDays, daysBetween, todayIso, startOfWeek } from './dates.js';

// All data lives in one object: { tasks: { [id]: task }, settings, sync }.
// Deletes are soft (deleted: true) and every change bumps updatedAt, so sync can merge by last write.
// `sync.dirty` lists tasks changed since they were last uploaded, `sync.cursor` marks how far we have pulled.
//
// A task with `repeat` is a series anchored at `date`. Its occurrences are computed per day; per-day state
// (done, subtask checks, order, tracked time) lives in `occ[date]`, and removed days are listed in `skip`.
//
// Time tracking: `sessions` holds finished [start, end] pairs (ms), `timerStart` is set while a timer runs.
// At most one timer runs at a time. `doneAt` records when something was checked off, for the statistics.

const KEY = 'tage.v1';
export const DEFAULT_SETTINGS = { theme: 'auto', accent: 'graphite', rollover: false };

const listeners = new Set();
let state;
let saveTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* unreadable storage: start fresh */ }
  return seed();
}

// Data from before sync existed has never been uploaded, so all of it starts out dirty.
function normalize(s) {
  const tasks = s.tasks ?? {};
  const sync = s.sync ?? { cursor: null, dirty: Object.fromEntries(Object.keys(tasks).map(id => [id, true])) };
  return { tasks, settings: { ...DEFAULT_SETTINGS, ...s.settings }, sync };
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
}
addEventListener('pagehide', () => saveTimer && flush());

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}

function commit() {
  persist();
  listeners.forEach(fn => fn());
}

export const subscribe = fn => (listeners.add(fn), () => listeners.delete(fn));

export const settings = () => state.settings;
export function setSettings(patch) {
  Object.assign(state.settings, patch);
  commit();
}

const blank = fields => ({
  id: crypto.randomUUID(), title: '', date: null, order: 0, done: false, color: null, notes: '',
  subtasks: [], repeat: null, skip: [], occ: {}, sessions: [], timerStart: null, doneAt: null,
  createdAt: Date.now(), updatedAt: Date.now(), ...fields,
});
export const sub = (text, done = false) => ({ id: crypto.randomUUID(), text, done });

function seed() {
  const today = todayIso();
  const tasks = {};
  const add = fields => { const t = blank({ ...fields, seed: true }); tasks[t.id] = t; };
  add({
    title: 'Tippe auf eine Aufgabe für Details', date: today, order: 1, color: 'blue',
    notes: 'Alles wird sofort gespeichert, auch offline.',
    subtasks: [sub('Unteraufgaben abhaken', true), sub('Notizen schreiben'), sub('Farbe auswählen')],
  });
  add({ title: 'Ziehen, um zu verschieben', date: today, order: 2, notes: 'Am Handy: kurz gedrückt halten, dann ziehen.' });
  add({ title: 'Leere Zeile antippen = neue Aufgabe', date: iso(addDays(parse(today), 1)), order: 1 });
  add({ title: 'Wochenrückblick', date: iso(addDays(startOfWeek(new Date()), 6)), order: 1, color: 'violet', repeat: { freq: 'weekly', interval: 1 } });
  add({ title: 'Ideen ohne Datum landen hier', date: null, order: 1, color: 'yellow' });
  return normalize({ tasks });
}

state = load();

// --- tasks ---------------------------------------------------------------

export function getTask(id) {
  const t = state.tasks[id];
  return t && !t.deleted ? t : null;
}

export function addTask(fields) {
  const t = blank(fields);
  state.tasks[t.id] = t;
  state.sync.dirty[t.id] = true;
  commit();
  return t;
}

// Adds many tasks in one go (an import), with a single save, render and upload.
export function addMany(list) {
  for (const fields of list) {
    const t = blank(fields);
    state.tasks[t.id] = t;
    state.sync.dirty[t.id] = true;
  }
  commit();
}

// updatedAt always moves forward, even if another device's clock ran ahead of this one.
const bump = t => Math.max(Date.now(), t.updatedAt + 1);

export function updateTask(id, patch) {
  const t = state.tasks[id];
  if (!t) return;
  Object.assign(t, patch, { updatedAt: bump(t) });
  state.sync.dirty[id] = true;
  commit();
}

export const removeTask = id => updateTask(id, { deleted: true });

// --- recurrence ------------------------------------------------------------

export function occursOn(t, date) {
  const r = t.repeat;
  if (!r || !t.date || date < t.date || (r.until && date > r.until) || t.skip.includes(date)) return false;
  const a = parse(t.date), d = parse(date), n = r.interval || 1;
  switch (r.freq) {
    case 'daily': return daysBetween(t.date, date) % n === 0;
    case 'weekdays': return d.getDay() % 6 !== 0;
    case 'weekly': return daysBetween(t.date, date) % (7 * n) === 0;
    case 'monthly': return d.getDate() === a.getDate() && ((d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth()) % n === 0;
    case 'yearly': return d.getDate() === a.getDate() && d.getMonth() === a.getMonth();
    default: return false;
  }
}

// --- items: what the board shows (a plain task, or one occurrence of a series) ---

// The time-tracking fields of a task or of one occurrence (tasks from before tracking lack them).
const track = o => ({ sessions: o.sessions ?? [], timerStart: o.timerStart ?? null, doneAt: o.doneAt ?? null });

const plainItem = t => ({ ...t, ...track(t), key: t.id, series: false });

function occurrence(t, date) {
  const o = t.occ[date] ?? {};
  return {
    ...t, ...track(o), key: `${t.id}@${date}`, date, series: true, done: !!o.done, order: o.order ?? t.order,
    subtasks: t.subtasks.map(s => ({ ...s, done: !!o.sub?.[s.id] })),
  };
}

export function getItem(key) {
  const [id, date] = key.split('@');
  const t = getTask(id);
  if (!t) return null;
  return date ? occurrence(t, date) : plainItem(t);
}

// `list` is an ISO day or 'someday'.
export function itemsFor(list) {
  const out = [];
  for (const t of Object.values(state.tasks)) {
    if (t.deleted) continue;
    if (list === 'someday') { if (t.date === null) out.push(plainItem(t)); }
    else if (t.repeat) { if (occursOn(t, list)) out.push(occurrence(t, list)); }
    else if (t.date === list) out.push(plainItem(t));
  }
  return out.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export const nextOrder = list => itemsFor(list).reduce((m, i) => Math.max(m, i.order), 0) + 1;

function patchOcc(t, date, patch) {
  updateTask(t.id, { occ: { ...t.occ, [date]: { ...t.occ[date], ...patch } } });
}

// Writes per-item state: into the task itself, or into the occurrence's slot of a series.
function patchItem(key, patch) {
  const [id, date] = key.split('@');
  const t = getTask(id);
  if (!t) return;
  if (date) patchOcc(t, date, patch);
  else updateTask(id, patch);
}

// Checking an item off also stops its timer.
export function toggleDone(key) {
  const it = getItem(key);
  if (!it) return;
  const done = !it.done;
  patchItem(key, { done, doneAt: done ? Date.now() : null, ...(done && it.timerStart ? stopped(it) : {}) });
}

// --- timer -------------------------------------------------------------------

export const tracked = (it, now = Date.now()) =>
  it.sessions.reduce((sum, [a, b]) => sum + b - a, 0) + (it.timerStart ? now - it.timerStart : 0);

// Sessions shorter than a second are taps by mistake, not work.
function stopped(it) {
  const end = Date.now();
  const sessions = end - it.timerStart >= 1000 ? [...it.sessions, [it.timerStart, end]] : it.sessions;
  return { sessions, timerStart: null };
}

export function runningKey() {
  for (const t of Object.values(state.tasks)) {
    if (t.deleted) continue;
    if (t.timerStart) return t.id;
    for (const [date, o] of Object.entries(t.occ ?? {})) if (o.timerStart) return `${t.id}@${date}`;
  }
  return null;
}

export function startTimer(key) {
  const running = runningKey();
  if (running === key) return;
  if (running) stopTimer(running);
  patchItem(key, { timerStart: Date.now() });
}

export function stopTimer(key) {
  const it = getItem(key);
  if (it?.timerStart) patchItem(key, stopped(it));
}

export const resetTimer = key => patchItem(key, { sessions: [], timerStart: null });

// Everything the statistics need: tracked sessions and completions, across all tasks and occurrences.
export function activity() {
  const sessions = [];
  const completions = [];
  const now = Date.now();
  const collect = (title, o, day) => {
    for (const [start, end] of o.sessions ?? []) sessions.push({ title, start, end });
    if (o.timerStart) sessions.push({ title, start: o.timerStart, end: now });
    const doneDay = o.doneAt ? iso(new Date(o.doneAt)) : day;
    if (o.done && doneDay) completions.push({ title, day: doneDay });
  };
  for (const t of Object.values(state.tasks)) {
    if (t.deleted) continue;
    if (t.repeat) for (const [date, o] of Object.entries(t.occ)) collect(t.title, o, date);
    else collect(t.title, t, t.date);
  }
  return { sessions, completions };
}

export function toggleSubtask(key, subId) {
  const [id, date] = key.split('@');
  const t = getTask(id);
  if (!t) return;
  if (date) patchOcc(t, date, { sub: { ...t.occ[date]?.sub, [subId]: !t.occ[date]?.sub?.[subId] } });
  else updateTask(id, { subtasks: t.subtasks.map(s => (s.id === subId ? { ...s, done: !s.done } : s)) });
}

export function skipOccurrence(id, date) {
  const t = getTask(id);
  const { [date]: _, ...occ } = t.occ;
  updateTask(id, { skip: [...t.skip, date], occ });
}

// Moving one occurrence off its day turns it into a standalone task and leaves a gap in the series.
export function moveItem(key, list, order) {
  const [id, date] = key.split('@');
  const t = getTask(id);
  if (!t) return;
  const target = list === 'someday' ? null : list;
  if (!date) return updateTask(id, { date: target, order });
  if (target === date) return patchOcc(t, date, { order });
  const o = t.occ[date] ?? {};
  addTask({
    title: t.title, color: t.color, notes: t.notes, done: !!o.done, date: target, order, ...track(o),
    subtasks: t.subtasks.map(s => ({ ...s, done: !!o.sub?.[s.id] })),
  });
  skipOccurrence(id, date);
}

// Splits a series so that a new one starts at `date`; the old one ends the day before.
function splitAt(t, date) {
  if (date === t.date) return t;
  const after = ([d]) => d >= date;
  const entries = Object.entries(t.occ);
  const next = addTask({
    title: t.title, color: t.color, notes: t.notes, order: t.order, date,
    subtasks: t.subtasks.map(s => ({ ...s })), repeat: { ...t.repeat },
    occ: Object.fromEntries(entries.filter(after)), skip: t.skip.filter(d => d >= date),
  });
  updateTask(t.id, {
    repeat: { ...t.repeat, until: iso(addDays(parse(date), -1)) },
    occ: Object.fromEntries(entries.filter(e => !after(e))), skip: t.skip.filter(d => d < date),
  });
  return next;
}

// Changes the repeat rule from the item's own day on. Returns the key the item has afterwards.
export function setRepeat(key, repeat) {
  const [id, date] = key.split('@');
  let t = getTask(id);
  if (!date) {
    if (!repeat) return key;
    const anchor = t.date ?? todayIso();
    const sub = Object.fromEntries(t.subtasks.filter(s => s.done).map(s => [s.id, true]));
    updateTask(id, {
      repeat, date: anchor, done: false, skip: [], sessions: [], timerStart: null, doneAt: null,
      subtasks: t.subtasks.map(s => ({ ...s, done: false })),
      occ: { [anchor]: { done: t.done, sub, ...track(t) } },
    });
    return `${id}@${anchor}`;
  }
  t = splitAt(t, date);
  if (repeat) {
    updateTask(t.id, { repeat });
    return `${t.id}@${date}`;
  }
  const o = t.occ[date] ?? {};
  updateTask(t.id, {
    repeat: null, date, done: !!o.done, occ: {}, skip: [], ...track(o),
    subtasks: t.subtasks.map(s => ({ ...s, done: !!o.sub?.[s.id] })),
  });
  return t.id;
}

// Carries unfinished one-off tasks from past days over to today.
export function rollover() {
  if (!state.settings.rollover) return;
  const today = todayIso();
  const stale = Object.values(state.tasks).filter(t => !t.deleted && !t.repeat && !t.done && t.date && t.date < today);
  if (!stale.length) return;
  let order = nextOrder(today);
  for (const t of stale) {
    Object.assign(t, { date: today, order: order++, updatedAt: bump(t) });
    state.sync.dirty[t.id] = true;
  }
  commit();
}

// --- backup ----------------------------------------------------------------

export const exportData = () => JSON.stringify(state, null, 2);

export function importData(json) {
  const s = JSON.parse(json);
  if (!s || typeof s.tasks !== 'object') throw new Error('not a backup');
  const { tasks, settings } = normalize(s);
  for (const t of Object.values(tasks)) t.updatedAt = bump(t);
  state = { tasks, settings, sync: { cursor: state.sync.cursor, dirty: Object.fromEntries(Object.keys(tasks).map(id => [id, true])) } };
  commit();
}

// --- sync bookkeeping (used by sync.js) --------------------------------------

export const syncState = () => state.sync;
export const rawTask = id => state.tasks[id] ?? null;

export function setCursor(cursor) {
  state.sync.cursor = cursor;
  persist();
}

// Takes rows from the server; a row only replaces the local task if it is newer.
export function applyRemote(rows) {
  let changed = false;
  for (const r of rows) {
    const local = state.tasks[r.id];
    if (local && local.updatedAt >= r.updated_at) continue;
    state.tasks[r.id] = r.data;
    delete state.sync.dirty[r.id];
    changed = true;
  }
  if (changed) commit();
}

// Clears the dirty mark, unless the task changed again while the upload was running.
export function markPushed(pairs) {
  for (const [id, updatedAt] of pairs) if (state.tasks[id]?.updatedAt === updatedAt) delete state.sync.dirty[id];
  persist();
}

// A second device signing in to an account that already has tasks should not add its welcome tasks again.
export function dropUntouchedSeed() {
  for (const t of Object.values(state.tasks)) {
    if (!t.seed || t.updatedAt !== t.createdAt) continue;
    delete state.tasks[t.id];
    delete state.sync.dirty[t.id];
  }
  commit();
}
