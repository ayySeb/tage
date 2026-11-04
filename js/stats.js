import * as store from './store.js';
import { iso, addDays, startOfWeek, todayIso, monthShort, longDate } from './dates.js';
import { esc, ICON, duration } from './ui.js';

const WEEKS = 26;
const METRICS = {
  time: {
    label: 'Zeit',
    format: duration,
    level: ms => { const m = ms / 60000; return !m ? 0 : m < 30 ? 1 : m < 60 ? 2 : m < 120 ? 3 : 4; },
  },
  done: {
    label: 'Erledigt',
    format: n => `${n} erledigt`,
    level: n => (!n ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 7 ? 3 : 4),
  },
};

const dlg = document.getElementById('stats');
let metric = 'time';

export function openStats() {
  render();
  dlg.showModal();
  const scroller = dlg.querySelector('.hm-scroll');
  scroller.scrollLeft = scroller.scrollWidth;
}

// Sums per day: tracked time (by the day a session started) and completed items.
function perDay() {
  const { sessions, completions } = store.activity();
  const time = {};
  const done = {};
  for (const s of sessions) {
    const day = iso(new Date(s.start));
    time[day] = (time[day] ?? 0) + s.end - s.start;
  }
  for (const c of completions) done[c.day] = (done[c.day] ?? 0) + 1;
  return { time, done, sessions };
}

// Days in a row with activity, counting back from today (or from yesterday if today is still empty).
function streak(values) {
  let d = new Date();
  if (!values[iso(d)]) d = addDays(d, -1);
  let n = 0;
  while (values[iso(d)]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function heatmap(values, m) {
  const today = todayIso();
  const first = addDays(startOfWeek(new Date()), -7 * (WEEKS - 1));
  const labels = ['', 'Mo', '', 'Mi', '', 'Fr', '', ''];
  let html = labels.map(l => `<span class="hm-label">${l}</span>`).join('');
  let lastMonth = -1;
  for (let w = 0; w < WEEKS; w++) {
    const monday = addDays(first, 7 * w);
    const month = monday.getMonth() !== lastMonth ? monthShort(monday) : '';
    lastMonth = monday.getMonth();
    html += `<span class="hm-month">${month}</span>`;
    for (let d = 0; d < 7; d++) {
      const day = iso(addDays(monday, d));
      const v = values[day] ?? 0;
      html += day > today
        ? '<span class="hm-cell future"></span>'
        : `<span class="hm-cell" data-l="${m.level(v)}" data-day="${day}" title="${longDate(day)}: ${v ? m.format(v) : 'nichts'}"></span>`;
    }
  }
  return `<div class="hm-scroll"><div class="hm" style="--weeks:${WEEKS}">${html}</div></div>`;
}

function topTasks(sessions) {
  const since = startOfWeek(new Date()).getTime();
  const sums = {};
  for (const s of sessions) if (s.start >= since) sums[s.title] = (sums[s.title] ?? 0) + s.end - s.start;
  const top = Object.entries(sums).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top.length) return '';
  const max = top[0][1];
  return `<section><h3>Meiste Zeit diese Woche</h3><ul class="toplist">${top.map(([title, ms]) =>
    `<li><span class="top-title">${esc(title) || 'Ohne Titel'}</span><span class="top-bar"><i style="width:${Math.max(4, ms / max * 100)}%"></i></span><span class="top-time">${duration(ms)}</span></li>`).join('')}</ul></section>`;
}

function render() {
  const data = perDay();
  const values = data[metric];
  const m = METRICS[metric];
  const today = todayIso();
  const monday = iso(startOfWeek(new Date()));
  const week = Object.entries(values).filter(([d]) => d >= monday && d <= today).reduce((s, [, v]) => s + v, 0);
  const fmt = v => (metric === 'time' ? duration(v) : String(v));
  const days = streak(values);

  dlg.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-top">
        <h2>Statistik</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Schließen">${ICON.close}</button>
      </div>
      <div class="seg">${Object.entries(METRICS).map(([k, v]) =>
        `<button type="button" data-metric="${k}" aria-pressed="${k === metric}">${v.label}</button>`).join('')}</div>
      <div class="cards">
        <div class="card"><b>${fmt(values[today] ?? 0)}</b><span>Heute</span></div>
        <div class="card"><b>${fmt(week)}</b><span>Diese Woche</span></div>
        <div class="card"><b>${days}</b><span>${days === 1 ? 'Tag' : 'Tage'} in Folge</span></div>
      </div>
      <section>
        <h3>Letzte ${WEEKS} Wochen</h3>
        ${heatmap(values, m)}
        <div class="hm-foot">
          <span class="hm-caption">Tippe auf einen Tag</span>
          <span class="hm-legend">Weniger${[0, 1, 2, 3, 4].map(l => `<span class="hm-cell" data-l="${l}"></span>`).join('')}Mehr</span>
        </div>
      </section>
      ${metric === 'time' ? topTasks(data.sessions) : ''}
    </div>`;
}

dlg.addEventListener('click', e => {
  if (e.target === dlg || e.target.closest('[data-act="close"]')) return dlg.close();
  const tab = e.target.closest('[data-metric]');
  if (tab) {
    metric = tab.dataset.metric;
    render();
    const scroller = dlg.querySelector('.hm-scroll');
    scroller.scrollLeft = scroller.scrollWidth;
    return;
  }
  const cell = e.target.closest('.hm-cell[data-day]');
  if (cell) dlg.querySelector('.hm-caption').textContent = cell.title;
});
