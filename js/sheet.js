import * as store from './store.js';
import { longDate } from './dates.js';
import { esc, ICON, COLORS } from './ui.js';

const REPEATS = [
  ['', 'Nie'], ['daily', 'Täglich'], ['weekdays', 'Werktags'], ['weekly', 'Wöchentlich'],
  ['weekly2', 'Alle 2 Wochen'], ['monthly', 'Monatlich'], ['yearly', 'Jährlich'],
];
const toRule = v => (!v ? null : v === 'weekly2' ? { freq: 'weekly', interval: 2 } : { freq: v, interval: 1 });
const fromRule = r => (!r ? '' : r.freq === 'weekly' && r.interval === 2 ? 'weekly2' : r.freq);

const dlg = document.getElementById('sheet');
let key = null;

// Title, notes, color and subtask texts belong to the task (for a series: to every occurrence);
// done states belong to the item the sheet was opened for.
const taskId = () => key.split('@')[0];

export function openSheet(k) {
  key = k;
  render();
  dlg.showModal();
  const title = dlg.querySelector('.title');
  if (!title.value) title.focus();
}

function render() {
  const it = store.getItem(key);
  const date = it.series
    ? `<span class="static">${longDate(it.date)}</span>`
    : `<input type="date" name="date" value="${it.date ?? ''}" aria-label="Datum">`
      + `<button type="button" class="chip${it.date ? '' : ' on'}" data-act="someday">Irgendwann</button>`;
  const dots = Object.entries(COLORS).map(([c, name]) =>
    `<button type="button" class="dot" data-color="${c}" aria-pressed="${it.color === c}" aria-label="${name}" title="${name}"></button>`).join('');

  dlg.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-top">
        <button type="button" class="check big${it.done ? ' on' : ''}" data-act="done" aria-label="Erledigt"></button>
        <textarea class="title" name="title" rows="1" placeholder="Aufgabe" enterkeyhint="done">${esc(it.title)}</textarea>
        <button type="button" class="icon-btn" data-act="close" aria-label="Schließen">${ICON.close}</button>
      </div>
      <div class="colors" aria-label="Farbe">
        <button type="button" class="dot none" data-color="" aria-pressed="${!it.color}" aria-label="Keine Farbe" title="Keine Farbe"></button>${dots}
      </div>
      <div class="fields">
        <div class="field"><span class="label">Datum</span><div class="ctrl">${date}</div></div>
        <label class="field"><span class="label">Wiederholen</span><div class="ctrl"><select name="repeat">${REPEATS.map(([v, l]) =>
          `<option value="${v}"${fromRule(it.repeat) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></label>
      </div>
      <section><h3>Unteraufgaben</h3><ul class="subs"></ul></section>
      <section><h3>Notizen</h3><textarea class="notes" name="notes" placeholder="Gedanken, Links, Details …">${esc(it.notes)}</textarea></section>
    </div>
    <footer class="sheet-foot">
      ${it.series
        ? '<button type="button" class="ghost-btn danger" data-act="skip" title="Nur diesen Termin löschen">Termin löschen</button><button type="button" class="ghost-btn danger" data-act="delete" title="Alle Termine löschen">Serie löschen</button>'
        : '<button type="button" class="ghost-btn danger" data-act="delete">Löschen</button>'}
      <button type="button" class="pill primary" data-act="close">Fertig</button>
    </footer>`;
  renderSubs();
}

function renderSubs(focus) {
  const ul = dlg.querySelector('.subs');
  ul.innerHTML = store.getItem(key).subtasks.map(s =>
    `<li data-sub="${s.id}"${s.done ? ' class="done"' : ''}>`
    + '<button type="button" class="check" data-act="sub-done" aria-label="Erledigt"></button>'
    + `<input value="${esc(s.text)}" aria-label="Unteraufgabe" enterkeyhint="next">`
    + `<button type="button" class="icon-btn sm" data-act="sub-delete" aria-label="Entfernen">${ICON.close}</button></li>`).join('')
    + `<li class="add"><span class="plus">${ICON.plus}</span><input placeholder="Unteraufgabe hinzufügen" aria-label="Unteraufgabe hinzufügen" enterkeyhint="next"></li>`;
  const target = focus === 'add' ? ul.querySelector('.add input') : focus && ul.querySelector(`[data-sub="${focus}"] input`);
  target?.focus();
}

function removeSub(subId, focusPrevious) {
  const t = store.getTask(taskId());
  const i = t.subtasks.findIndex(s => s.id === subId);
  store.updateTask(t.id, { subtasks: t.subtasks.filter(s => s.id !== subId) });
  renderSubs(focusPrevious ? (t.subtasks[i - 1]?.id ?? 'add') : null);
}

dlg.addEventListener('click', e => {
  if (e.target === dlg) return dlg.close();
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.matches('.dot')) {
    store.updateTask(taskId(), { color: btn.dataset.color || null });
    dlg.querySelectorAll('.dot').forEach(d => d.setAttribute('aria-pressed', d === btn));
    return;
  }
  switch (btn.dataset.act) {
    case 'close': return dlg.close();
    case 'done':
      store.toggleDone(key);
      return btn.classList.toggle('on', store.getItem(key).done);
    case 'someday':
      store.updateTask(taskId(), { date: null, order: store.nextOrder('someday') });
      return render();
    case 'sub-done':
      store.toggleSubtask(key, btn.parentElement.dataset.sub);
      return btn.parentElement.classList.toggle('done');
    case 'sub-delete': return removeSub(btn.parentElement.dataset.sub, false);
    case 'skip':
      store.skipOccurrence(taskId(), key.split('@')[1]);
      return dlg.close();
    case 'delete':
      store.removeTask(taskId());
      return dlg.close();
  }
});

dlg.addEventListener('input', e => {
  const el = e.target;
  const row = el.closest('[data-sub]');
  if (el.name === 'title') store.updateTask(taskId(), { title: el.value.replace(/\n/g, ' ') });
  else if (el.name === 'notes') store.updateTask(taskId(), { notes: el.value });
  else if (row) {
    const t = store.getTask(taskId());
    store.updateTask(t.id, { subtasks: t.subtasks.map(s => (s.id === row.dataset.sub ? { ...s, text: el.value } : s)) });
  }
});

dlg.addEventListener('change', e => {
  const el = e.target;
  if (el.name === 'date') {
    const date = el.value || null;
    store.updateTask(taskId(), { date, order: store.nextOrder(date ?? 'someday') });
    render();
  } else if (el.name === 'repeat') {
    key = store.setRepeat(key, toRule(el.value));
    render();
  }
});

dlg.addEventListener('keydown', e => {
  const el = e.target;
  if (e.key !== 'Enter' && e.key !== 'Backspace') return;
  if (el.name === 'title' && e.key === 'Enter') {
    e.preventDefault();
    el.blur();
  } else if (el.closest('.subs .add') && e.key === 'Enter' && el.value.trim()) {
    e.preventDefault();
    const t = store.getTask(taskId());
    store.updateTask(t.id, { subtasks: [...t.subtasks, store.sub(el.value.trim())] });
    renderSubs('add');
  } else if (el.closest('[data-sub]')) {
    if (e.key === 'Enter') {
      e.preventDefault();
      dlg.querySelector('.subs .add input').focus();
    } else if (!el.value) {
      e.preventDefault();
      removeSub(el.closest('[data-sub]').dataset.sub, true);
    }
  }
});

// A task closed without any content was created by accident.
dlg.addEventListener('close', () => {
  const it = key && store.getItem(key);
  if (it && !it.title.trim() && !it.notes.trim() && !it.subtasks.length) store.removeTask(it.id);
  key = null;
});
