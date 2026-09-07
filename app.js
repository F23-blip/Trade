// ═══════════════════════════════════════════════════════
//  CONFIGURAZIONE — sostituisci con l'URL del TUO deployment
// ═══════════════════════════════════════════════════════
const API_URL = 'https://script.google.com/macros/s/AKfycbw48DqSDcV6N31EmMZ1-GaCk1cQ8JhDDkRDgYoh9dueD8nKtGxJ9MEzvAyKa_c-Qyuv7w/exec';
const TOKEN_KEY = 'app_medica_token';

// ═══════════════════════════════════════════════════════
//  STATO GLOBALE
// ═══════════════════════════════════════════════════════
const App = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  user: null,
  pazienti: [],
  pazienteCorrente: null,
  chartPressione: null,
  paginaCorrente: 'dashboard',
};

// ═══════════════════════════════════════════════════════
//  CHIAMATE API (fetch + token, niente google.script.run)
// ═══════════════════════════════════════════════════════
async function apiGet(action, params) {
  const url = new URL(API_URL);
  url.searchParams.set('token', App.token);
  url.searchParams.set('action', action);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(action, payload) {
  // text/plain evita il preflight CORS che Apps Script non gestisce
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ token: App.token, action }, payload || {})),
  });
  return res.json();
}

// ═══════════════════════════════════════════════════════
//  SCHERMATA CODICE DI ACCESSO
// ═══════════════════════════════════════════════════════
function showTokenScreen(errore) {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('token-screen').classList.add('show');
  if (errore) document.getElementById('token-error').textContent = errore;
  setTimeout(() => document.getElementById('inp-token').focus(), 200);
}

function salvaToken() {
  const val = document.getElementById('inp-token').value.trim();
  if (!val) {
    document.getElementById('token-error').textContent = 'Inserisci il tuo codice.';
    return;
  }
  App.token = val;
  localStorage.setItem(TOKEN_KEY, val);
  document.getElementById('token-error').textContent = '';
  document.getElementById('token-screen').classList.remove('show');
  document.getElementById('loading-screen').style.display = 'flex';
  init();
}

function cambiaCodice() {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  if (!App.token) {
    showTokenScreen();
  } else {
    init();
  }
});

async function init() {
  try {
    const resp = await apiGet('init');
    if (resp.error) {
      // Codice errato o mancante: torna alla schermata di inserimento
      localStorage.removeItem(TOKEN_KEY);
      App.token = null;
      showTokenScreen(resp.error);
      return;
    }
    onUserLoaded(resp.result.user, resp.result.pazienti);
  } catch (err) {
    showError('Errore di connessione. Ricarica la pagina.');
    console.error(err);
  }
}

function onUserLoaded(user, pazienti) {
  App.user = user;

  const initials = ((user.nome || '?')[0] + (user.cognome || '?')[0]).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;

  App.pazienti = pazienti || [];

  if (App.pazienti.length === 0) {
    showError('Nessun paziente associato al tuo account.');
    return;
  }

  if (App.user.isAdmin && App.pazienti.length > 1) {
    const sel = document.getElementById('paziente-select');
    sel.innerHTML = App.pazienti.map(p =>
      `<option value="${p.email}">${p.nome}</option>`
    ).join('');
    document.getElementById('paziente-select-wrap').style.display = 'block';
    App.pazienteCorrente = App.pazienti[0];
  } else {
    App.pazienteCorrente = App.pazienti[0];
  }

  showApp();
  loadDashboard();
}

function showApp() {
  const loading = document.getElementById('loading-screen');
  loading.classList.add('fade-out');
  setTimeout(() => { loading.style.display = 'none'; }, 400);
  document.getElementById('app').style.display = 'flex';
}

function showError(msg) {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('token-screen').classList.remove('show');
  document.getElementById('error-msg-text').textContent = msg;
  document.getElementById('error-screen').classList.add('show');
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ═══════════════════════════════════════════════════════
//  NAVIGAZIONE
// ═══════════════════════════════════════════════════════
function navigateTo(pagina) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('page-' + pagina).classList.add('active');
  const navBtn = document.getElementById('nav-' + pagina);
  if (navBtn) navBtn.classList.add('active');

  const titoli = {
    dashboard: 'App Medica', pressione: 'Pressione', esami: 'Esami',
    patologie: 'Patologie', profilo: 'Profilo',
  };
  document.getElementById('topbar-title').textContent = titoli[pagina] || 'App Medica';

  const fab = document.getElementById('fab-add');
  fab.style.display = (pagina === 'pressione' || pagina === 'esami') ? 'flex' : 'none';

  App.paginaCorrente = pagina;

  if (pagina === 'pressione') loadPressione();
  if (pagina === 'esami')     loadEsami();
  if (pagina === 'profilo')   renderProfilo();
}

function onPazienteChange(email) {
  App.pazienteCorrente = App.pazienti.find(p => p.email === email) || App.pazienti[0];
  if (App.paginaCorrente === 'dashboard')  loadDashboard();
  if (App.paginaCorrente === 'pressione')  loadPressione();
  if (App.paginaCorrente === 'esami')      loadEsami();
  if (App.paginaCorrente === 'profilo')    renderProfilo();
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
async function loadDashboard() {
  if (!App.pazienteCorrente) return;
  document.getElementById('dashboard-content').innerHTML =
    '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const resp = await apiGet('dashboard', { paziente: App.pazienteCorrente.email });
    if (resp.error) { showToast('Errore caricamento dashboard', 'error'); return; }
    renderDashboard(resp.result);
  } catch (err) {
    showToast('Errore caricamento dashboard', 'error');
  }
}

function renderDashboard(stats) {
  if (!stats) return;
  const p = stats.ultimaPressione;
  const pazNome = App.pazienteCorrente ? App.pazienteCorrente.nome : '';
  let html = '';

  html += `
    <div class="card" style="margin-bottom:12px">
      <div style="font-size:13px;color:var(--text3);margin-bottom:4px">Ciao, ${App.user.nome}!</div>
      <div style="font-size:17px;font-weight:600">Paziente: ${pazNome}</div>
    </div>`;

  if (p) {
    const cat = classifyBP(p.sistolica, p.diastolica);
    html += `
      <p class="section-title">Ultima misurazione</p>
      <div class="card">
        <div class="card-title">Pressione — ${p.dataOra}</div>
        <div class="metric-row">
          <div class="metric"><div class="metric-val sist">${p.sistolica}</div><div class="metric-label">Sistolica</div></div>
          <div class="metric"><div class="metric-val diast">${p.diastolica}</div><div class="metric-label">Diastolica</div></div>
          <div class="metric"><div class="metric-val pulse">${p.pulsazioni}</div><div class="metric-label">Polso</div></div>
        </div>
        <div style="text-align:center"><span class="bp-badge ${cat.cls}">${cat.label}</span></div>
      </div>`;
  }

  if (stats.mediaSettimanaSist) {
    html += `
      <p class="section-title">Media ultimi 7 rilievi</p>
      <div class="card">
        <div class="metric-row">
          <div class="metric"><div class="metric-val sist">${stats.mediaSettimanaSist}</div><div class="metric-label">Sistolica</div></div>
          <div class="metric"><div class="metric-val diast">${stats.mediaSettimanaDiast}</div><div class="metric-label">Diastolica</div></div>
        </div>
      </div>`;
  }

  if (stats.ultimoEsame) {
    const e = stats.ultimoEsame;
    html += `
      <p class="section-title">Ultimo esame</p>
      <div class="card" onclick="navigateTo('esami')" style="cursor:pointer">
        <div class="card-title">${e.visite || 'Esame'} — ${e.data}</div>
        ${renderValoriEsame(e)}
        <div style="font-size:12px;color:var(--text3);margin-top:8px">Tocca per vedere tutti gli esami →</div>
      </div>`;
  }

  html += `
    <p class="section-title">Totali</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="metric" style="cursor:pointer" onclick="navigateTo('pressione')">
        <div class="metric-val" style="color:var(--accent)">${stats.totPressioni}</div>
        <div class="metric-label">Misurazioni</div>
      </div>
      <div class="metric" style="cursor:pointer" onclick="navigateTo('esami')">
        <div class="metric-val" style="color:var(--accent2)">${stats.totEsami}</div>
        <div class="metric-label">Esami</div>
      </div>
    </div>`;

  document.getElementById('dashboard-content').innerHTML = html;
}

// ═══════════════════════════════════════════════════════
//  PRESSIONE
// ═══════════════════════════════════════════════════════
async function loadPressione() {
  if (!App.pazienteCorrente) return;
  document.getElementById('pressione-list').innerHTML =
    '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const resp = await apiGet('pressione', { paziente: App.pazienteCorrente.email, limit: 30 });
    if (resp.error) { showToast('Errore caricamento pressione', 'error'); return; }
    renderPressione(resp.result);
  } catch (err) {
    showToast('Errore caricamento pressione', 'error');
  }
}

function renderPressione(dati) {
  renderChartPressione(dati ? dati.slice(0, 10).reverse() : []);

  const el = document.getElementById('pressione-list');
  if (!dati || dati.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">❤️</div><p>Nessuna misurazione</p></div>';
    return;
  }

  el.innerHTML = dati.map(p => {
    const cat = classifyBP(p.sistolica, p.diastolica);
    const ora = p.dataOra ? p.dataOra.split(' ')[1] || '' : '';
    return `
      <div class="list-item">
        <div>
          <div class="list-date">${p.dataChart}</div>
          <div style="font-size:11px;color:var(--text3)">${ora}</div>
        </div>
        <div class="list-vals">
          <span class="val-chip s">${p.sistolica}</span>
          <span class="val-chip d">${p.diastolica}</span>
          <span class="val-chip p">♥ ${p.pulsazioni}</span>
        </div>
        <div style="margin-left:auto"><span class="bp-badge ${cat.cls}" style="font-size:10px">${cat.label}</span></div>
      </div>`;
  }).join('');
}

function renderChartPressione(dati) {
  const canvas = document.getElementById('chart-pressione');
  if (!canvas) return;
  if (App.chartPressione) { App.chartPressione.destroy(); }
  if (!dati || dati.length === 0) return;

  const labels     = dati.map(p => p.dataChart || '');
  const sistolica  = dati.map(p => p.sistolica);
  const diastolica = dati.map(p => p.diastolica);
  const pulsazioni = dati.map(p => p.pulsazioni);

  App.chartPressione = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Sistolica', data: sistolica, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.08)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#dc2626', tension: .3, fill: false },
        { label: 'Diastolica', data: diastolica, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,.08)', borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#2563eb', tension: .3, fill: false },
        { label: 'Polso', data: pulsazioni, borderColor: '#9ca3af', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 3, pointBackgroundColor: '#9ca3af', tension: .3, fill: false, borderDash: [4, 3] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } },
        tooltip: { backgroundColor: '#1a1917', titleFont: { size: 11 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8 },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { min: 40, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { size: 10 } } },
      },
    },
  });
}

// ── FAB: apre il modal giusto in base alla pagina ────────
function fabAction() {
  if (App.paginaCorrente === 'pressione') openModal();
  if (App.paginaCorrente === 'esami')     openModalEsame();
}

// ── MODAL INSERIMENTO ────────────────────────────────────
function openModal() {
  document.getElementById('modal-pressione').classList.add('open');
  document.getElementById('inp-sist').focus();
}

function closeModalOnBg(e) {
  if (e.target === e.currentTarget) closeModal();
}

function closeModal() {
  document.getElementById('modal-pressione').classList.remove('open');
  document.getElementById('inp-sist').value = '';
  document.getElementById('inp-diast').value = '';
  document.getElementById('inp-pulse').value = '';
  document.getElementById('inp-nota').value = '';
  document.getElementById('bp-preview').innerHTML = '';
}

document.addEventListener('DOMContentLoaded', () => {
  ['inp-sist', 'inp-diast'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateBpPreview);
  });
});

function updateBpPreview() {
  const s = parseInt(document.getElementById('inp-sist').value);
  const d = parseInt(document.getElementById('inp-diast').value);
  if (!s || !d) { document.getElementById('bp-preview').innerHTML = ''; return; }
  const cat = classifyBP(s, d);
  document.getElementById('bp-preview').innerHTML = `<span class="bp-badge ${cat.cls}">${cat.label}</span>`;
}

async function salvaPressione() {
  const sist  = document.getElementById('inp-sist').value;
  const diast = document.getElementById('inp-diast').value;
  const pulse = document.getElementById('inp-pulse').value;
  const nota  = document.getElementById('inp-nota').value;

  if (!sist || !diast || !pulse) { showToast('Inserisci tutti i valori', 'error'); return; }
  if (sist < 60 || sist > 250 || diast < 40 || diast > 150 || pulse < 30 || pulse > 200) {
    showToast('Valori fuori range', 'error'); return;
  }

  const btn = document.getElementById('btn-salva-pressione');
  btn.textContent = 'Salvataggio…';
  btn.disabled = true;

  try {
    const resp = await apiPost('salvaPressione', {
      email: App.pazienteCorrente.email,
      sistolica: sist, diastolica: diast, pulsazioni: pulse, dettaglio: nota,
    });
    btn.textContent = 'Salva misurazione';
    btn.disabled = false;
    const res = resp.result || {};
    if (res.ok) {
      showToast('Salvato! ✓', 'success');
      closeModal();
      loadPressione();
      if (App.paginaCorrente === 'dashboard') loadDashboard();
    } else {
      showToast(res.msg || resp.error || 'Errore', 'error');
    }
  } catch (err) {
    btn.textContent = 'Salva misurazione';
    btn.disabled = false;
    showToast('Errore di connessione', 'error');
  }
}

// ═══════════════════════════════════════════════════════
//  ESAMI
// ═══════════════════════════════════════════════════════
async function loadEsami() {
  if (!App.pazienteCorrente) return;
  document.getElementById('esami-list').innerHTML =
    '<div class="empty-state"><div class="spinner" style="margin:0 auto"></div></div>';
  try {
    const resp = await apiGet('esami', { paziente: App.pazienteCorrente.email, limit: 20 });
    if (resp.error) { showToast('Errore caricamento esami', 'error'); return; }
    renderEsami(resp.result);
  } catch (err) {
    showToast('Errore caricamento esami', 'error');
  }
}

function renderEsami(dati) {
  const el = document.getElementById('esami-list');
  if (!dati || dati.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔬</div><p>Nessun esame registrato</p></div>';
    return;
  }
  el.innerHTML = dati.map(e => `
    <div class="list-item" style="flex-direction:column;align-items:flex-start;gap:8px">
      <div style="display:flex;justify-content:space-between;width:100%">
        <div style="font-weight:600;font-size:14px">${e.visite || 'Esame generico'}</div>
        <div class="list-date">${e.data}</div>
      </div>
      ${renderValoriEsame(e)}
      ${e.nota ? `<div style="font-size:12px;color:var(--text2);font-style:italic">${e.nota}</div>` : ''}
    </div>
  `).join('');
}

function renderValoriEsame(e) {
  const vals = [];
  if (e.colLDL)     vals.push({ label: 'LDL',      val: e.colLDL,     unit: 'mg/dL', range: [0,100] });
  if (e.colHDL)     vals.push({ label: 'HDL',      val: e.colHDL,     unit: 'mg/dL', range: [40,999] });
  if (e.trig)       vals.push({ label: 'Trigl.',    val: e.trig,       unit: 'mg/dL', range: [0,150] });
  if (e.creatinina) vals.push({ label: 'Creat.',    val: e.creatinina, unit: 'mg/dL', range: [0.6,1.2] });
  if (e.tsh)        vals.push({ label: 'TSH',       val: e.tsh,        unit: 'mU/L',  range: [0.4,4.0] });
  if (e.vitD)       vals.push({ label: 'Vit. D3',   val: e.vitD,       unit: 'ng/mL', range: [30,100] });
  if (vals.length === 0) return '';

  return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
    ${vals.map(v => {
      const num = parseFloat(v.val);
      const ok  = !isNaN(num) && num >= v.range[0] && num <= v.range[1];
      const cls = isNaN(num) ? '' : (ok ? 'bp-ottimale' : 'bp-alta');
      return `<span class="bp-badge ${cls}" style="font-size:10px">${v.label} ${v.val} ${v.unit}</span>`;
    }).join('')}
  </div>`;
}

// ── MODAL NUOVO ESAME ─────────────────────────────────────
function openModalEsame() {
  document.getElementById('inp-data-esame').value = todayISO();
  ['inp-visite', 'inp-ldl', 'inp-hdl', 'inp-trig', 'inp-creat', 'inp-tsh', 'inp-vitd', 'inp-tariffa', 'inp-nota-esame']
    .forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('modal-esame').classList.add('open');
}

function closeModalEsameOnBg(e) {
  if (e.target === e.currentTarget) closeModalEsame();
}

function closeModalEsame() {
  document.getElementById('modal-esame').classList.remove('open');
}

async function salvaEsame() {
  const dati = {
    email:      App.pazienteCorrente.email,
    data:       document.getElementById('inp-data-esame').value,
    visite:     document.getElementById('inp-visite').value,
    colLDL:     document.getElementById('inp-ldl').value,
    colHDL:     document.getElementById('inp-hdl').value,
    trig:       document.getElementById('inp-trig').value,
    creatinina: document.getElementById('inp-creat').value,
    tsh:        document.getElementById('inp-tsh').value,
    vitD:       document.getElementById('inp-vitd').value,
    tariffa:    document.getElementById('inp-tariffa').value,
    nota:       document.getElementById('inp-nota-esame').value,
  };

  if (!dati.visite) { showToast('Inserisci almeno il tipo di visita/esame', 'error'); return; }

  const btn = document.getElementById('btn-salva-esame');
  btn.textContent = 'Salvataggio…';
  btn.disabled = true;

  try {
    const resp = await apiPost('salvaEsame', dati);
    btn.textContent = 'Salva esame';
    btn.disabled = false;
    const res = resp.result || {};
    if (res.ok) {
      showToast('Esame salvato ✓', 'success');
      closeModalEsame();
      loadEsami();
      if (App.paginaCorrente === 'dashboard') loadDashboard();
    } else {
      showToast(res.msg || resp.error || 'Errore', 'error');
    }
  } catch (err) {
    btn.textContent = 'Salva esame';
    btn.disabled = false;
    showToast('Errore di connessione', 'error');
  }
}

// ═══════════════════════════════════════════════════════
//  PROFILO
// ═══════════════════════════════════════════════════════
function renderProfilo() {
  const p = App.pazienteCorrente;
  const u = App.user;
  if (!p) return;

  const initials = p.nome.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();

  document.getElementById('profilo-content').innerHTML = `
    <div style="text-align:center;padding:8px 0 20px">
      <div style="width:72px;height:72px;border-radius:50%;background:var(--accent);color:white;
                  font-size:24px;font-weight:600;display:flex;align-items:center;justify-content:center;
                  margin:0 auto 12px">
        ${initials}
      </div>
      <div style="font-size:20px;font-weight:600">${p.nome}</div>
      <div style="font-size:13px;color:var(--text3);margin-top:4px">${p.email}</div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:16px">
      ${infoRow('🎂', 'Data di nascita', p.nascita || '—')}
      ${infoRow('🩸', 'Gruppo sanguigno', p.sangue || '—')}
      ${infoRow('⚠️', 'Allergie', p.allergie || 'Nessuna')}
    </div>
    <div style="border-top:1px solid var(--border);margin-top:16px;padding-top:16px">
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px">Account connesso</div>
      <div style="font-size:14px;font-weight:500">${u.nome} ${u.cognome}</div>
      ${u.isAdmin ? '<span class="bp-badge bp-normale" style="margin-top:8px;display:inline-flex">Admin</span>' : ''}
    </div>
    <button class="btn btn-secondary" style="width:100%;margin-top:20px" onclick="cambiaCodice()">Cambia codice di accesso</button>`;
}

function infoRow(icon, label, value) {
  return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:18px">${icon}</span>
      <div>
        <div style="font-size:11px;color:var(--text3);font-weight:600;letter-spacing:.04em;text-transform:uppercase">${label}</div>
        <div style="font-size:14px;font-weight:500;margin-top:2px">${value}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════
function classifyBP(s, d) {
  if (s < 120 && d < 80)  return { cls: 'bp-ottimale',   label: 'Ottimale' };
  if (s < 130 && d < 85)  return { cls: 'bp-normale',    label: 'Normale' };
  if (s < 140 && d < 90)  return { cls: 'bp-elevata',    label: 'Normale-alta' };
  if (s < 160 && d < 100) return { cls: 'bp-alta',       label: 'Ipert. grado 1' };
  if (s < 180 && d < 110) return { cls: 'bp-molto-alta', label: 'Ipert. grado 2' };
  return                         { cls: 'bp-molto-alta',  label: 'Ipert. grado 3' };
}

let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' ' + type : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}
