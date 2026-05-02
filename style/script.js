'use strict';

// 1. EVENT CLASS

class CalendarEvent {
  constructor({ id, title, category, priority, date, time, location, status, description, favorite, createdAt }) {
    this.id          = id || crypto.randomUUID();
    this.title       = title || '';
    this.category    = category || '';
    this.priority    = priority || '';
    this.date        = date || '';
    this.time        = time || '';
    this.location    = location || '';
    this.status      = status || '';
    this.description = description || '';
    this.favorite    = favorite || false;
    this.createdAt   = createdAt || new Date().toISOString();
  }

  getFormattedDateTime() {
    if (!this.date) return '—';
    const d = new Date(this.date + (this.time ? 'T' + this.time : 'T00:00'));
    const opts = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
    const ds = d.toLocaleDateString('ro-RO', opts);
    return this.time ? `${ds} · ${this.time}` : ds;
  }

  daysUntil() {
    if (!this.date) return null;
    const now = new Date(); now.setHours(0,0,0,0);
    const evd = new Date(this.date); evd.setHours(0,0,0,0);
    return Math.ceil((evd - now) / (1000 * 60 * 60 * 24));
  }
}


// 2. STATE

let events        = [];
let currentPage   = 1;
let sortDirection = 'asc';
let sessionStart  = Date.now();
let countdownTimer = null;
let sessionTimer   = null;

const PREFS_KEY  = 'eventflow_prefs';
const EVENTS_KEY = 'eventflow_events';

// 3. LOCAL STORAGE

function saveEvents() {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return;
    events = JSON.parse(raw).map(e => new CalendarEvent(e));
  } catch (e) { events = []; }
}

function savePrefs() {
  const prefs = {
    theme:      document.documentElement.dataset.theme || 'light',
    sortBy:     document.getElementById('sortBy').value,
    sortDir:    sortDirection,
    filterCat:  document.getElementById('filterCategory').value,
    filterStat: document.getElementById('filterStatus').value,
    filterPri:  document.getElementById('filterPriority').value,
    search:     document.getElementById('searchInput').value,
    perPage:    document.getElementById('perPageSelect').value,
  };
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (!p) return;
    if (p.theme)     document.documentElement.dataset.theme = p.theme;
    if (p.sortBy)    document.getElementById('sortBy').value = p.sortBy;
    if (p.sortDir) {
      sortDirection = p.sortDir;
      document.getElementById('sortDirBtn').textContent = sortDirection === 'asc' ? '↑' : '↓';
    }
    if (p.filterCat)  document.getElementById('filterCategory').value = p.filterCat;
    if (p.filterStat) document.getElementById('filterStatus').value = p.filterStat;
    if (p.filterPri)  document.getElementById('filterPriority').value = p.filterPri;
    if (p.search)     document.getElementById('searchInput').value = p.search;
    if (p.perPage)    document.getElementById('perPageSelect').value = p.perPage;
    updateThemeLabel();
  } catch (e) {}
}


// 4. FILTER & SORT

function getFilteredSortedEvents() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const cat    = document.getElementById('filterCategory').value;
  const stat   = document.getElementById('filterStatus').value;
  const pri    = document.getElementById('filterPriority').value;
  const sortBy = document.getElementById('sortBy').value;

  let result = events.filter(ev => {
    if (cat  && ev.category !== cat)  return false;
    if (stat && ev.status   !== stat) return false;
    if (pri  && ev.priority !== pri)  return false;
    if (search) {
      const hay = [ev.title, ev.location, ev.description].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const pmap = { inalta: 3, medie: 2, scazuta: 1 };
  result.sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'title':    va = a.title.toLowerCase();  vb = b.title.toLowerCase();  break;
      case 'priority': va = pmap[a.priority] || 0; vb = pmap[b.priority] || 0;  break;
      case 'category': va = a.category;             vb = b.category;             break;
      case 'status':   va = a.status;               vb = b.status;               break;
      case 'created':  va = a.createdAt;            vb = b.createdAt;            break;
      default:         va = a.date + (a.time||'');  vb = b.date + (b.time||'');
    }
    if (va < vb) return sortDirection === 'asc' ? -1 : 1;
    if (va > vb) return sortDirection === 'asc' ?  1 : -1;
    return 0;
  });

  return result;
}


// 5. RENDER

function renderEvents() {
  const list     = document.getElementById('eventsList');
  const perPage  = parseInt(document.getElementById('perPageSelect').value);
  const filtered = getFilteredSortedEvents();
  const total    = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const pageItems = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  document.getElementById('totalCountBadge').textContent     = events.length;
  document.getElementById('displayedCountBadge').textContent = total;

  list.innerHTML = '';

  if (pageItems.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>${
      events.length === 0
        ? 'Niciun eveniment adăugat. Folosiți formularul din stânga.'
        : 'Niciun eveniment corespunde filtrelor selectate.'
    }</p></div>`;
  } else {
    const search = document.getElementById('searchInput').value.trim();
    pageItems.forEach(ev => list.appendChild(buildEventCard(ev, search)));
  }

  renderPagination(totalPages);
  updateStats();
  renderFavorites();
  updateCountdown();
  savePrefs();
}

function highlight(text, query) {
  if (!query) return escHtml(text);
  return escHtml(text).replace(new RegExp(`(${escRe(query)})`, 'gi'), '<mark class="highlight">$1</mark>');
}

function escHtml(t) {
  return (t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildEventCard(ev, searchQ) {
  const card = document.createElement('div');
  card.className = `event-card priority-${ev.priority}${ev.favorite ? ' favorite-card' : ''}`;
  card.dataset.id = ev.id;

  const days = ev.daysUntil();
  let daysLabel = '';
  if (days !== null) {
    if (days < 0)       daysLabel = `<span style="color:var(--text3)">${Math.abs(days)}z trecut</span>`;
    else if (days === 0) daysLabel = `<span style="color:var(--accent);font-weight:700">AZI</span>`;
    else if (days === 1) daysLabel = `<span style="color:var(--gold);font-weight:700">MÂINE</span>`;
    else if (days <= 7)  daysLabel = `<span style="color:var(--gold)">peste ${days}z</span>`;
    else                 daysLabel = `<span>peste ${days}z</span>`;
  }

  card.innerHTML = `
    <div class="event-header">
      <div class="event-title-row">
        <div class="event-title">${highlight(ev.title, searchQ)}</div>
        <div class="event-meta">
          <span class="badge badge-cat-${ev.category}">${catLabel(ev.category)}</span>
          <span class="badge badge-status-${ev.status}">${statLabel(ev.status)}</span>
          <span class="badge badge-priority-${ev.priority}">${priLabel(ev.priority)}</span>
        </div>
      </div>
      <div class="event-actions">
        <button class="icon-btn fav-btn ${ev.favorite ? 'active' : ''}" data-id="${ev.id}" title="Favorit">⭐</button>
        <button class="icon-btn edit-btn" data-id="${ev.id}" title="Editează">✏️</button>
        <button class="icon-btn del-btn" data-id="${ev.id}" title="Șterge">🗑️</button>
      </div>
    </div>
    ${ev.description ? `<div class="event-body">${highlight(ev.description, searchQ)}</div>` : ''}
    <div class="event-footer">
      <div class="event-date-display">
        📅 ${ev.getFormattedDateTime()}
        ${ev.location ? `&nbsp;·&nbsp; 📍 ${escHtml(ev.location)}` : ''}
      </div>
      <div>${daysLabel}</div>
    </div>`;

  card.querySelector('.fav-btn').addEventListener('click', () => toggleFavorite(ev.id));
  card.querySelector('.edit-btn').addEventListener('click', () => editEvent(ev.id));
  card.querySelector('.del-btn').addEventListener('click', () => deleteEvent(ev.id));
  card.addEventListener('mouseover', () => card.style.borderColor = 'var(--border2)');
  card.addEventListener('mouseout',  () => card.style.borderColor = ev.favorite ? 'var(--gold)' : '');

  return card;
}


// 6. PAGINATION

function renderPagination(totalPages) {
  const filtered = getFilteredSortedEvents().length;
  const info = document.getElementById('pageInfo');
  const btns = document.getElementById('pageButtons');

  info.textContent = filtered === 0 ? '' : `Pagina ${currentPage} din ${totalPages} (${filtered} rezultate)`;
  btns.innerHTML = '';

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '← Anterior';
  prev.disabled = currentPage === 1;
  prev.addEventListener('click', () => { currentPage--; renderEvents(); });
  btns.appendChild(prev);

  let startP = Math.max(1, currentPage - 2);
  let endP   = Math.min(totalPages, startP + 4);
  if (endP - startP < 4) startP = Math.max(1, endP - 4);

  for (let p = startP; p <= endP; p++) {
    const pb = document.createElement('button');
    pb.className = 'page-btn' + (p === currentPage ? ' active' : '');
    pb.textContent = p;
    const pp = p;
    pb.addEventListener('click', () => { currentPage = pp; renderEvents(); });
    btns.appendChild(pb);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = 'Următor →';
  next.disabled = currentPage === totalPages || totalPages === 0;
  next.addEventListener('click', () => { currentPage++; renderEvents(); });
  btns.appendChild(next);
}


// 7. STATISTICS

function updateStats() {
  document.getElementById('statTotal').textContent    = events.length;
  document.getElementById('statFav').textContent      = events.filter(e => e.favorite).length;
  document.getElementById('statDone').textContent     = events.filter(e => e.status === 'finalizat').length;
  document.getElementById('statInalta').textContent   = events.filter(e => e.priority === 'inalta').length;
  document.getElementById('statAcademic').textContent = events.filter(e => e.category === 'academic').length;
  document.getElementById('statCanceled').textContent = events.filter(e => e.status === 'anulat').length;
  document.getElementById('favCount').textContent     = events.filter(e => e.favorite).length;
}


// 8. FAVORITES

function renderFavorites() {
  const favs = events.filter(e => e.favorite);
  const list = document.getElementById('favList');
  list.innerHTML = '';

  if (favs.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:20px"><div class="empty-icon" style="font-size:28px">⭐</div><p>Niciun eveniment favorit</p></div>`;
    return;
  }

  favs.forEach(ev => {
    const div = document.createElement('div');
    div.className = 'fav-mini';
    div.innerHTML = `
      <span class="fav-mini-icon">⭐</span>
      <span class="fav-mini-title">${escHtml(ev.title)}</span>
      <span class="fav-mini-date">${ev.date || '—'}</span>`;
    list.appendChild(div);
  });
}

function toggleFavorite(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  ev.favorite = !ev.favorite;
  saveEvents();
  renderEvents();
  showNotif(ev.favorite ? '⭐ Adăugat la favorite' : 'Eliminat din favorite', ev.favorite ? 'warning' : 'info');
}

// 9. CRUD

function addOrUpdateEvent(data) {
  const editId = document.getElementById('editingId').value;
  if (editId) {
    const idx = events.findIndex(e => e.id === editId);
    if (idx > -1) {
      events[idx] = new CalendarEvent({ ...events[idx], ...data });
      showNotif('✏️ Eveniment actualizat!', 'success');
    }
  } else {
    events.unshift(new CalendarEvent(data));
    showNotif('✅ Eveniment adăugat!', 'success');
    currentPage = 1;
  }
  saveEvents();
  clearForm();
  renderEvents();
}

function editEvent(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  document.getElementById('fTitle').value    = ev.title;
  document.getElementById('fCategory').value = ev.category;
  document.getElementById('fPriority').value = ev.priority;
  document.getElementById('fDate').value     = ev.date;
  document.getElementById('fTime').value     = ev.time;
  document.getElementById('fLocation').value = ev.location;
  document.getElementById('fStatus').value   = ev.status;
  document.getElementById('fDesc').value     = ev.description;
  document.getElementById('editingId').value = ev.id;
  document.getElementById('editBanner').classList.add('show');
  document.getElementById('submitBtn').textContent = '💾 Salvează Modificările';
  document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  ['fTitle','fCategory','fPriority','fDate','fStatus'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
    document.getElementById(id).classList.add('valid');
  });
}

function deleteEvent(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  if (!window.confirm(`Ștergeți evenimentul "${ev.title}"?`)) return;
  const card = document.querySelector(`.event-card[data-id="${id}"]`);
  if (card) {
    card.classList.add('removing');
    setTimeout(() => {
      events = events.filter(e => e.id !== id);
      saveEvents();
      renderEvents();
      showNotif('🗑️ Eveniment șters', 'error');
    }, 300);
  } else {
    events = events.filter(e => e.id !== id);
    saveEvents();
    renderEvents();
    showNotif('🗑️ Eveniment șters', 'error');
  }
}


// 10. VALIDATION

const validationRules = {
  fTitle:    { min: 3, errId: 'errTitle',    msg: 'Titlul este obligatoriu (min. 3 caractere)' },
  fCategory: { min: 1, errId: 'errCategory', msg: 'Selectați o categorie' },
  fPriority: { min: 1, errId: 'errPriority', msg: 'Selectați o prioritate' },
  fDate:     { min: 1, errId: 'errDate',     msg: 'Data este obligatorie' },
  fStatus:   { min: 1, errId: 'errStatus',   msg: 'Selectați un status' },
};

function validateField(fieldId) {
  const field = document.getElementById(fieldId);
  const rule  = validationRules[fieldId];
  if (!rule) return true;
  const val = field.value.trim();
  const err = document.getElementById(rule.errId);
  if (!val || val.length < rule.min) {
    field.classList.add('invalid');
    field.classList.remove('valid');
    err.textContent = rule.msg;
    err.classList.add('show');
    return false;
  }
  field.classList.remove('invalid');
  field.classList.add('valid');
  err.classList.remove('show');
  return true;
}

function validateAll() {
  return Object.keys(validationRules).map(validateField).every(v => v);
}

function clearForm() {
  document.getElementById('eventForm').reset();
  document.getElementById('editingId').value = '';
  document.getElementById('editBanner').classList.remove('show');
  document.getElementById('submitBtn').textContent = '➕ Adaugă Eveniment';
  Object.keys(validationRules).forEach(id => {
    document.getElementById(id).classList.remove('invalid','valid');
    document.getElementById(validationRules[id].errId).classList.remove('show');
  });
}


// 11. COUNTDOWN & SESSION

function updateCountdown() {
  const upcoming = events
    .filter(e => e.date && (e.status === 'planificat' || e.status === 'confirmat'))
    .sort((a, b) => (a.date + a.time) > (b.date + b.time) ? 1 : -1)
    .find(e => new Date(e.date) >= new Date(new Date().toDateString()));

  if (!upcoming) {
    document.getElementById('countdownEventName').textContent = 'Niciun eveniment viitor';
    ['cdDays','cdHours','cdMins','cdSecs'].forEach(id => document.getElementById(id).textContent = '--');
    return;
  }

  document.getElementById('countdownEventName').textContent = upcoming.title;
  if (countdownTimer) clearInterval(countdownTimer);

  function tick() {
    const target = new Date(upcoming.date + 'T' + (upcoming.time || '00:00'));
    let diff = target - new Date();
    if (diff <= 0) {
      ['cdDays','cdHours','cdMins','cdSecs'].forEach(id => document.getElementById(id).textContent = '00');
      clearInterval(countdownTimer);
      return;
    }
    const d = Math.floor(diff / 86400000); diff %= 86400000;
    const h = Math.floor(diff / 3600000);  diff %= 3600000;
    const m = Math.floor(diff / 60000);    diff %= 60000;
    const s = Math.floor(diff / 1000);
    document.getElementById('cdDays').textContent  = String(d).padStart(2,'0');
    document.getElementById('cdHours').textContent = String(h).padStart(2,'0');
    document.getElementById('cdMins').textContent  = String(m).padStart(2,'0');
    document.getElementById('cdSecs').textContent  = String(s).padStart(2,'0');
  }
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function startSessionTimer() {
  sessionStart = Date.now();
  if (sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    const e = Date.now() - sessionStart;
    const h = Math.floor(e / 3600000);
    const m = Math.floor((e % 3600000) / 60000);
    const s = Math.floor((e % 60000) / 1000);
    document.getElementById('sessionTime').textContent =
      `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }, 1000);
}


// 12. NOTIFICATIONS

function showNotif(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⭐' };
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `<span>${icons[type]}</span><span class="notif-text">${msg}</span>`;
  document.getElementById('notifications').appendChild(notif);
  setTimeout(() => {
    notif.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}


// 13. EXPORT

function exportTxt() {
  if (events.length === 0) { showNotif('Nu există date de exportat', 'error'); return; }
  let txt = `EVENTFLOW — EXPORT EVENIMENTE\nData export: ${new Date().toLocaleString('ro-RO')}\nTotal: ${events.length} evenimente\n${'═'.repeat(60)}\n\n`;
  events.forEach((ev, i) => {
    txt += `${i+1}. ${ev.title}\n`;
    txt += `   Categorie: ${catLabel(ev.category)} | Prioritate: ${priLabel(ev.priority)} | Status: ${statLabel(ev.status)}\n`;
    txt += `   Data: ${ev.getFormattedDateTime()}\n`;
    if (ev.location)    txt += `   Locație: ${ev.location}\n`;
    if (ev.description) txt += `   Descriere: ${ev.description}\n`;
    if (ev.favorite)    txt += `   ⭐ FAVORIT\n`;
    txt += '\n';
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
  a.download = `eventflow_${Date.now()}.txt`;
  a.click();
  showNotif('📤 Export finalizat!', 'success');
}


// 14. THEME

function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
  updateThemeLabel();
  savePrefs();
}

function updateThemeLabel() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.getElementById('themeLabel').textContent = isDark ? '🌙' : '☀️';
}


// 15. HELPERS

function catLabel(v) {
  return { academic:'Academic', personal:'Personal', profesional:'Profesional', social:'Social', alt:'Alt' }[v] || v;
}
function statLabel(v) {
  return { planificat:'Planificat', confirmat:'Confirmat', anulat:'Anulat', finalizat:'Finalizat' }[v] || v;
}
function priLabel(v) {
  return { inalta:'Înaltă', medie:'Medie', scazuta:'Scăzută' }[v] || v;
}


// 16. SAMPLE DATA

function loadSampleData() {
  const fmt = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return d.toISOString().split('T')[0];
  };
  [
    { title:'Examen Analiză Matematică', category:'academic', priority:'inalta', date:fmt(3), time:'09:00', location:'Sala B204', status:'confirmat', description:'Materie: integrale duble, serii Fourier.', favorite:true },
    { title:'Conferință Business Innovation', category:'profesional', priority:'inalta', date:fmt(5), time:'14:00', location:'Hotel Radisson', status:'planificat', description:'Prezentare proiect startup.', favorite:false },
    { title:'Aniversare mama', category:'personal', priority:'medie', date:fmt(7), time:'18:00', location:'Restaurant Vatra', status:'confirmat', description:'Rezervare pentru 8 persoane.', favorite:true },
    { title:'Workshop JavaScript Avansat', category:'academic', priority:'medie', date:fmt(10), time:'10:00', location:'Online - Zoom', status:'planificat', description:'React Hooks, Context API.', favorite:false },
    { title:'Dentist - control', category:'personal', priority:'scazuta', date:fmt(14), time:'11:30', location:'Clinica Dent Expert', status:'planificat', description:'Control de rutină.', favorite:false },
    { title:'Team Building Departament', category:'social', priority:'medie', date:fmt(12), time:'09:00', location:'Parc Dendrarium', status:'confirmat', description:'Activități outdoor.', favorite:false },
    { title:'Predare proiect de curs', category:'academic', priority:'inalta', date:fmt(2), time:'23:59', location:'Moodle online', status:'planificat', description:'Documentație + cod sursă.', favorite:false },
    { title:'Meetup Tech Community', category:'social', priority:'scazuta', date:fmt(20), time:'18:30', location:'Hub IT Chișinău', status:'planificat', description:'Networking și prezentări tehnice.', favorite:false },
  ].forEach(s => events.push(new CalendarEvent(s)));
  saveEvents();
  renderEvents();
  showNotif('📚 Date demo încărcate!', 'info');
}


// 17. INIT
document.addEventListener('DOMContentLoaded', () => {
  // BOM - browser info
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  document.getElementById('browserInfo').textContent = browser + ' | ' + (navigator.platform || '');

  loadPrefs();
  loadEvents();
  if (events.length === 0) loadSampleData();
  else renderEvents();
  startSessionTimer();

  // Form submit
  document.getElementById('eventForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!validateAll()) { showNotif('⚠️ Completați câmpurile obligatorii', 'error'); return; }
    addOrUpdateEvent({
      title:       document.getElementById('fTitle').value.trim(),
      category:    document.getElementById('fCategory').value,
      priority:    document.getElementById('fPriority').value,
      date:        document.getElementById('fDate').value,
      time:        document.getElementById('fTime').value,
      location:    document.getElementById('fLocation').value.trim(),
      status:      document.getElementById('fStatus').value,
      description: document.getElementById('fDesc').value.trim(),
    });
  });

  // Real-time validation
  Object.keys(validationRules).forEach(fieldId => {
    const el = document.getElementById(fieldId);
    el.addEventListener('input',  () => validateField(fieldId));
    el.addEventListener('change', () => validateField(fieldId));
    el.addEventListener('blur',   () => validateField(fieldId));
  });

  // Search
  document.getElementById('searchInput').addEventListener('keyup', () => { currentPage = 1; renderEvents(); });
  document.getElementById('searchInput').addEventListener('input', () => { currentPage = 1; renderEvents(); });

  // Filters
  document.getElementById('filterCategory').addEventListener('change', () => { currentPage=1; renderEvents(); });
  document.getElementById('filterStatus').addEventListener('change',   () => { currentPage=1; renderEvents(); });
  document.getElementById('filterPriority').addEventListener('change', () => { currentPage=1; renderEvents(); });

  // Sort
  document.getElementById('sortBy').addEventListener('change', () => renderEvents());
  document.getElementById('sortDirBtn').addEventListener('click', () => {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    document.getElementById('sortDirBtn').textContent = sortDirection === 'asc' ? '↑' : '↓';
    renderEvents();
  });

  // Per page
  document.getElementById('perPageSelect').addEventListener('change', () => { currentPage=1; renderEvents(); });

  // Reset filters
  document.getElementById('resetFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterStatus').value   = '';
    document.getElementById('filterPriority').value = '';
    document.getElementById('searchInput').value    = '';
    document.getElementById('sortBy').value         = 'date';
    sortDirection = 'asc';
    document.getElementById('sortDirBtn').textContent = '↑';
    currentPage = 1;
    renderEvents();
    showNotif('🔄 Filtre resetate', 'info');
  });

  // Clear form
  document.getElementById('clearFormBtn').addEventListener('click', clearForm);

  // Theme
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Export
  document.getElementById('exportBtn').addEventListener('click', exportTxt);

  // Reset all
  document.getElementById('resetAllBtn').addEventListener('click', () => {
    if (!window.confirm('Ștergeți TOATE evenimentele? Acțiune ireversibilă.')) return;
    events = [];
    localStorage.removeItem(EVENTS_KEY);
    currentPage = 1;
    clearForm();
    renderEvents();
    showNotif('🗑️ Toate evenimentele au fost șterse', 'error');
  });

  // ESC = clear form
  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearForm(); });
});