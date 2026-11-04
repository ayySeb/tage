import * as store from './store.js';
import { iso, addDays, startOfWeek, todayIso, weekNumber, monthName, monthShort, weekdayShort } from './dates.js';
import { initDnd } from './dnd.js';
import { openSheet } from './sheet.js';
import { openSettings, applySettings } from './settings.js';
import { initSync } from './sync.js';
import { esc, ICON } from './ui.js';

const board = document.getElementById('board');
const mobile = matchMedia('(max-width: 759.98px)');
let weekStart = startOfWeek(new Date());
let built = '';

const days = () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

function listHtml(list) {
  const hint = list === 'someday' ? '+ Idee' : '+ Aufgabe';
  return `<ul class="list" data-list="${list}"><li class="add"><input aria-label="Neue Aufgabe" placeholder="${hint}" autocomplete="off" enterkeyhint="enter"></li></ul>`;
}

function taskHtml(it) {
  const doneSubs = it.subtasks.filter(s => s.done).length;
  const meta = (it.repeat ? ICON.repeat : '') + (it.notes.trim() ? ICON.note : '')
    + (it.subtasks.length ? `<span>${doneSubs}/${it.subtasks.length}</span>` : '');
  return `<li class="task${it.done ? ' done' : ''}" data-key="${it.key}"${it.color ? ` data-color="${it.color}"` : ''}>`
    + `<button class="check" aria-label="${it.done ? 'Wieder öffnen' : 'Erledigt'}"></button>`
    + `<span class="text">${esc(it.title) || '<i>Ohne Titel</i>'}</span>`
    + (meta ? `<span class="meta">${meta}</span>` : '')
    + '</li>';
}

// Builds the columns for the visible week. Only needed when the week or the current day changes;
// task updates just refill the lists, so a focused input keeps its focus.
function build() {
  const today = todayIso();
  board.innerHTML = days().map(d => {
    const date = iso(d);
    const cls = ['day', date === today && 'today', date < today && 'past'].filter(Boolean).join(' ');
    return `<section class="${cls}"${date === today ? ' id="today"' : ''}>`
      + `<header class="day-head"><span class="dow">${weekdayShort(d)}</span>`
      + `<span class="num">${d.getDate()}<span class="mon">. ${monthShort(d)}</span></span></header>`
      + `${listHtml(date)}</section>`;
  }).join('')
    + `<section class="day someday" id="someday"><header class="day-head"><span class="dow">Irgendwann</span></header>${listHtml('someday')}</section>`;

  const [a, b] = [weekStart, addDays(weekStart, 6)];
  const months = a.getMonth() === b.getMonth() ? monthName(a) : `${monthShort(a)} – ${monthShort(b)}`;
  const year = a.getFullYear() === b.getFullYear() ? a.getFullYear() : `${a.getFullYear()}/${String(b.getFullYear()).slice(2)}`;
  document.getElementById('range').innerHTML = `<b>${months}</b><span class="yr"> ${year}</span>`;
  document.getElementById('kw').textContent = `KW ${weekNumber(a)}`;
  document.getElementById('todayBtn').classList.toggle('current', iso(a) === iso(startOfWeek(new Date())));
  built = iso(weekStart) + today;
}

function render() {
  if (built !== iso(weekStart) + todayIso()) build();
  for (const ul of board.querySelectorAll('[data-list]')) {
    ul.querySelectorAll(':scope > .task').forEach(n => n.remove());
    ul.lastElementChild.insertAdjacentHTML('beforebegin', store.itemsFor(ul.dataset.list).map(taskHtml).join(''));
  }
}

function go(weeks) {
  weekStart = addDays(weekStart, 7 * weeks);
  render();
}

function goToday() {
  weekStart = startOfWeek(new Date());
  render();
  if (mobile.matches) document.getElementById('today')?.scrollIntoView({ block: 'start' });
}

// --- events ------------------------------------------------------------------

board.addEventListener('click', e => {
  const check = e.target.closest('.task .check');
  if (check) return store.toggleDone(check.parentElement.dataset.key);
  const task = e.target.closest('.task');
  if (task) return openSheet(task.dataset.key);
  if (e.target.matches('.list, .list > .add')) e.target.closest('.list').querySelector('.add input').focus();
});

board.addEventListener('keydown', e => {
  const input = e.target.closest('.add input');
  if (!input) return;
  if (e.key === 'Escape') {
    input.value = '';
    input.blur();
  } else if (e.key === 'Enter' && !e.isComposing) {
    const title = input.value.trim();
    if (!title) return;
    const list = input.closest('[data-list]').dataset.list;
    input.value = '';
    store.addTask({ title, date: list === 'someday' ? null : list, order: store.nextOrder(list) });
    input.scrollIntoView({ block: 'nearest' });
  }
});

initDnd((key, list, prevKey, nextKey) => {
  const items = store.itemsFor(list).filter(i => i.key !== key);
  const prev = items.find(i => i.key === prevKey)?.order;
  const next = items.find(i => i.key === nextKey)?.order;
  const order = prev == null ? (next == null ? 1 : next - 1) : next == null ? prev + 1 : (prev + next) / 2;
  store.moveItem(key, list, order);
});

document.getElementById('prev').onclick = () => go(-1);
document.getElementById('next').onclick = () => go(1);
document.getElementById('todayBtn').onclick = goToday;
document.getElementById('settingsBtn').onclick = openSettings;
document.getElementById('somedayBtn').onclick = () => document.getElementById('someday').scrollIntoView({ behavior: 'smooth' });

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select, dialog') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
  else if (e.key === 't' || e.key === 'T') goToday();
});

// Pick up a new day when the app stays open over midnight or comes back from the background.
function checkDay() {
  if (built.endsWith(todayIso())) return;
  store.rollover();
  render();
}
setInterval(checkDay, 60_000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkDay());

// --- start ---------------------------------------------------------------------

document.querySelectorAll('[data-icon]').forEach(b => (b.innerHTML = ICON[b.dataset.icon]));
applySettings();
store.rollover();
store.subscribe(render);
render();
if (mobile.matches) document.getElementById('today')?.scrollIntoView({ block: 'start' });
initSync();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
