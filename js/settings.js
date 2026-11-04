import * as store from './store.js';
import { todayIso } from './dates.js';
import { esc, ICON } from './ui.js';
import { syncInfo, onSyncChange, signIn, signUp, signOut, syncNow } from './sync.js';
import { calendarInfo, onCalendarChange, addFeed, removeFeed, setOnlySingle } from './calendar.js';

const THEMES = [['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']];
const ACCENTS = [['graphite', 'Graphit'], ['blue', 'Blau'], ['green', 'Grün'], ['coral', 'Koralle'], ['violet', 'Violett'], ['amber', 'Bernstein']];

const dlg = document.getElementById('settings');
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function applySettings() {
  const { theme, accent } = store.settings();
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.dataset.accent = accent;
  const dark = theme === 'dark' || (theme === 'auto' && darkQuery.matches);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#111113' : '#fafaf9';
}
darkQuery.addEventListener('change', applySettings);

export function openSettings() {
  render();
  dlg.showModal();
}

const STATUS = {
  syncing: 'Synchronisiere …',
  error: 'Sync hat nicht geklappt. Neuer Versuch gleich automatisch.',
  offline: 'Offline. Änderungen werden übertragen, sobald du online bist.',
};

function syncSection() {
  const s = syncInfo();
  if (!s.enabled) return '';
  if (!s.ready) return '<section><h3>Sync</h3><p class="hint">Sync ist gerade nicht erreichbar. Bist du online?</p></section>';
  if (!s.email) {
    return `<section>
      <h3>Sync</h3>
      <p class="hint">Melde dich an, damit deine Aufgaben auf Handy und PC dieselben sind.</p>
      <form class="auth">
        <input type="email" name="email" placeholder="E-Mail" autocomplete="email" required>
        <input type="password" name="password" placeholder="Passwort" autocomplete="current-password" minlength="6" required>
        <p class="auth-msg" role="status"></p>
        <div class="row">
          <button class="pill primary" value="in">Anmelden</button>
          <button class="pill" value="up">Konto erstellen</button>
        </div>
      </form>
    </section>`;
  }
  const time = s.lastSync?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const label = STATUS[s.status] ?? (time ? `Synchronisiert um ${time}` : 'Verbunden');
  return `<section>
    <h3>Sync</h3>
    <div class="sync-row"><span class="sync-dot ${s.status}"></span><div><div>${esc(s.email)}</div><div class="hint">${label}</div></div></div>
    <div class="row">
      <button type="button" class="pill" data-act="sync">Jetzt synchronisieren</button>
      <button type="button" class="pill" data-act="signout">Abmelden</button>
    </div>
  </section>`;
}

function calendarSection() {
  if (!syncInfo().email) return '';
  const { feeds, status } = calendarInfo();
  const list = feeds.map(f => `<li data-feed="${f.color}"><span class="feed-dot"></span>`
    + `<span class="feed-name">${esc(f.name) || 'Kalender'}</span>`
    + `<label class="feed-single" title="Wiederkehrende Termine ausblenden"><input type="checkbox" data-single-feed="${f.id}"${f.only_single ? ' checked' : ''}>Nur Einzeltermine</label>`
    + `<button type="button" class="icon-btn sm" data-remove-feed="${f.id}" aria-label="Kalender entfernen">${ICON.close}</button></li>`).join('');
  return `<section>
    <h3>Kalender</h3>
    ${list ? `<ul class="feeds">${list}</ul>` : ''}
    ${status === 'error' ? '<p class="auth-msg">Ein Kalender ließ sich gerade nicht laden.</p>' : ''}
    <details class="feed-add"${list ? '' : ' open'}>
      <summary>Kalender hinzufügen</summary>
      <p class="hint">Google Kalender am PC öffnen → Einstellungen (Zahnrad) → links deinen Kalender wählen → „Kalender integrieren“ → <b>Privatadresse im iCal-Format</b> kopieren und hier einfügen. Die Termine erscheinen dann zum Lesen in deiner Woche, auf allen Geräten.</p>
      <form class="auth feed-form">
        <input name="feedName" placeholder="Name, z. B. Uni" required>
        <input name="feedUrl" type="url" placeholder="https://calendar.google.com/…/basic.ics" required>
        <label class="feed-single"><input type="checkbox" name="onlySingle" checked>Nur Einzeltermine, wiederkehrende ausblenden</label>
        <p class="auth-msg" role="status"></p>
        <div class="row"><button class="pill primary">Hinzufügen</button></div>
      </form>
    </details>
  </section>`;
}

// Refresh status lines while the dialog is open, but never wipe what is being typed into a form.
const refresh = () => dlg.open && !dlg.querySelector('.auth input:focus') && render();
onSyncChange(refresh);
onCalendarChange(refresh);

function render() {
  const s = store.settings();
  dlg.innerHTML = `
    <div class="sheet-body">
      <div class="sheet-top">
        <h2>Einstellungen</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Schließen">${ICON.close}</button>
      </div>
      ${syncSection()}
      ${calendarSection()}
      <section>
        <h3>Erscheinungsbild</h3>
        <div class="seg">${THEMES.map(([v, l]) => `<button type="button" data-set-theme="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}</div>
      </section>
      <section>
        <h3>Akzentfarbe</h3>
        <div class="colors">${ACCENTS.map(([v, l]) =>
          `<button type="button" class="dot swatch-${v}" data-set-accent="${v}" aria-pressed="${s.accent === v}" aria-label="${l}" title="${l}"></button>`).join('')}</div>
      </section>
      <section>
        <h3>Aufgaben</h3>
        <label class="switch-row">
          <span>Unerledigtes von vergangenen Tagen automatisch auf heute schieben</span>
          <input type="checkbox" class="switch" name="rollover"${s.rollover ? ' checked' : ''}>
        </label>
      </section>
      <section>
        <h3>Daten</h3>
        <p class="hint">Deine Aufgaben sind auf diesem Gerät gespeichert. Ein Backup kannst du jederzeit exportieren.</p>
        <div class="row">
          <button type="button" class="pill" data-act="export">Backup exportieren</button>
          <label class="pill">Backup importieren<input type="file" name="import" accept="application/json,.json" hidden></label>
        </div>
      </section>
    </div>`;
}

function download() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `tage-backup-${todayIso()}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

dlg.addEventListener('click', e => {
  if (e.target === dlg) return dlg.close();
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'close') dlg.close();
  else if (b.dataset.act === 'export') download();
  else if (b.dataset.act === 'sync') syncNow();
  else if (b.dataset.act === 'signout') signOut().then(render);
  else if (b.dataset.removeFeed && confirm('Diesen Kalender entfernen?')) removeFeed(b.dataset.removeFeed);
  else if (b.dataset.setTheme || b.dataset.setAccent) {
    store.setSettings(b.dataset.setTheme ? { theme: b.dataset.setTheme } : { accent: b.dataset.setAccent });
    applySettings();
    render();
  }
});

dlg.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const msg = form.querySelector('.auth-msg');
  const { email, password, feedName, feedUrl, onlySingle } = Object.fromEntries(new FormData(form));
  form.querySelectorAll('button').forEach(b => (b.disabled = true));
  msg.textContent = form.matches('.feed-form') ? 'Lade Kalender …' : '';
  const error = form.matches('.feed-form')
    ? await addFeed(feedName.trim(), feedUrl.trim(), !!onlySingle)
    : await (e.submitter?.value === 'up' ? signUp : signIn)(email.trim(), password);
  if (!error) {
    document.activeElement?.blur();
    return render();
  }
  msg.textContent = error;
  form.querySelectorAll('button').forEach(b => (b.disabled = false));
});

dlg.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.singleFeed) {
    setOnlySingle(el.dataset.singleFeed, el.checked);
  } else if (el.name === 'rollover') {
    store.setSettings({ rollover: el.checked });
    store.rollover();
  } else if (el.name === 'import' && el.files[0]) {
    if (!confirm('Das Backup ersetzt alle aktuellen Aufgaben. Fortfahren?')) return;
    try {
      store.importData(await el.files[0].text());
      applySettings();
      dlg.close();
    } catch {
      alert('Diese Datei ist kein gültiges Tage-Backup.');
    }
  }
});
