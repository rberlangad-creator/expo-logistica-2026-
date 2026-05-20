/* ============================================================
   EXPO LOGÍSTICA 2026 — APP LOGIC
   - Lead capture & localStorage
   - Raffle / Sorteo electrónico
   ============================================================ */

'use strict';

// ─── STATE ────────────────────────────────────────────────────
const STORAGE_KEY  = 'expo_logistica_2026_leads';
const WINNER_KEY   = 'expo_logistica_2026_winner';
const ADMIN_PIN    = '2026';

let participants   = [];
let lastWinner     = null;
let rollInterval   = null;
let isAdmin        = false;
let pendingTab     = null;

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  updateCountBadge();
  renderLista();
  updateSorteoCount();
  updateAdminUI();

  // Hidden Kiosk unlocking gesture (Tap logo 5 times)
  const logo = document.querySelector('.company-logo');
  let logoClicks = 0;
  let logoTimer = null;
  if (logo) {
    logo.addEventListener('click', () => {
      logoClicks++;
      clearTimeout(logoTimer);
      logoTimer = setTimeout(() => { logoClicks = 0; }, 2000); // reset if no clicks for 2 seconds
      if (logoClicks >= 5) {
        logoClicks = 0;
        openPinModal();
      }
    });
  }
});

// ─── TABS ────────────────────────────────────────────────────
function switchTab(tab) {
  if (tab !== 'registro' && !isAdmin) {
    pendingTab = tab;
    openPinModal();
    return;
  }

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

  const btn = document.getElementById('tab-' + tab);
  if (btn) btn.classList.add('active');
  
  const sec = document.getElementById('section-' + tab);
  if (sec) sec.classList.add('active');

  if (tab === 'sorteo') updateSorteoCount();
  if (tab === 'lista') renderLista();
}

// ─── ADMIN PIN SYSTEM ─────────────────────────────────────────
function openPinModal() {
  const modal = document.getElementById('modal-pin');
  const input = document.getElementById('pin-input');
  const err = document.getElementById('pin-error');
  
  input.value = '';
  err.style.display = 'none';
  modal.classList.add('open');
  setTimeout(() => input.focus(), 150);
  
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      verifyPin();
    }
  };
}

function closePinModal() {
  document.getElementById('modal-pin').classList.remove('open');
  pendingTab = null;
}

function verifyPin() {
  const input = document.getElementById('pin-input');
  const err = document.getElementById('pin-error');
  
  if (input.value === ADMIN_PIN) {
    isAdmin = true;
    updateAdminUI();
    closePinModal();
    showToast('🔓 Acceso Administrador concedido', '#10b981');
    
    if (pendingTab) {
      const target = pendingTab;
      pendingTab = null;
      switchTab(target);
    }
  } else {
    err.style.display = 'block';
    input.value = '';
    input.focus();
  }
}

function toggleAdminLock() {
  if (isAdmin) {
    isAdmin = false;
    updateAdminUI();
    showToast('🔒 Interfaz bloqueada', '#f59e0b');
    switchTab('registro');
  } else {
    pendingTab = null;
    openPinModal();
  }
}

function updateAdminUI() {
  const adminCard = document.getElementById('admin-panel-card');
  
  if (isAdmin) {
    if (adminCard) adminCard.style.display = 'block';
  } else {
    if (adminCard) adminCard.style.display = 'none';
  }
}

// ─── STORAGE ─────────────────────────────────────────────────
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    participants = raw ? JSON.parse(raw) : [];
    const winRaw = localStorage.getItem(WINNER_KEY);
    lastWinner = winRaw ? JSON.parse(winRaw) : null;
  } catch { participants = []; lastWinner = null; }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(participants));
}

// ─── SUBMIT LEAD ─────────────────────────────────────────────
function submitLead(e) {
  if (e) e.preventDefault();

  const nombre   = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const correo   = document.getElementById('correo').value.trim();
  
  // Get active radio for interest
  const interesActive = document.querySelector('input[name="interes"]:checked');
  const interes = interesActive ? interesActive.value : 'Renta';

  if (!nombre || !telefono || !correo) return;

  // duplicate check by email or phone
  const dup = participants.find(
    p => p.correo.toLowerCase() === correo.toLowerCase() || p.telefono === telefono
  );
  if (dup) {
    showToast(`⚠️ "${dup.nombre}" ya está registrado`, '#f59e0b');
    return;
  }

  const lead = {
    id:        Date.now(),
    nombre,
    telefono,
    correo,
    interes,
    fecha:     new Date().toISOString(),
    isWinner:  false,
  };

  participants.unshift(lead);
  saveData();
  updateCountBadge();
  updateSorteoCount();

  document.getElementById('lead-form').reset();
  
  // Restore default radio state to Renta
  document.querySelector('input[name="interes"][value="Renta"]').checked = true;

  showToast(`✅ ${nombre} registrado!`, '#10b981');
  flashCard();
}

function flashCard() {
  const btn = document.getElementById('btn-registrar');
  btn.style.background = 'linear-gradient(135deg, #10b981, #34d399)';
  setTimeout(() => { btn.style.background = ''; }, 700);
}

// ─── SORTEO / RAFFLE ─────────────────────────────────────────
function updateSorteoCount() {
  const el = document.getElementById('sorteo-count');
  if (el) el.textContent = participants.length;
}

function iniciarSorteo() {
  if (participants.length === 0) {
    showToast('⚠️ No hay participantes registrados', '#f59e0b');
    return;
  }
  if (participants.length === 1) {
    declareWinner(participants[0]);
    return;
  }

  const btn          = document.getElementById('btn-sorteo');
  const winnerCard   = document.getElementById('winner-card');
  const rollingDiv   = document.getElementById('rolling-names');
  const note         = document.getElementById('sorteo-note');

  winnerCard.style.display = 'none';
  btn.disabled = true;
  note.textContent = '🎲 Sorteando…';

  // Animate rolling names
  let ticks = 0;
  const totalTicks = 28 + Math.floor(Math.random() * 14); // 28-42 iterations

  rollInterval = setInterval(() => {
    const rnd = participants[Math.floor(Math.random() * participants.length)];
    rollingDiv.innerHTML = `<div class="roll-item rolling">${rnd.nombre}</div>`;
    ticks++;

    if (ticks >= totalTicks) {
      clearInterval(rollInterval);

      // Pick final winner
      const winner = participants[Math.floor(Math.random() * participants.length)];

      // Slow down "landing" frames
      let landing = 0;
      const landingInterval = setInterval(() => {
        const lrnd = participants[Math.floor(Math.random() * participants.length)];
        rollingDiv.innerHTML = `<div class="roll-item rolling">${lrnd.nombre}</div>`;
        landing++;
        if (landing >= 5) {
          clearInterval(landingInterval);
          declareWinner(winner);
          btn.disabled = false;
          note.textContent = 'Todos los participantes registrados entran automáticamente.';
        }
      }, 180);
    }
  }, 80);
}

function declareWinner(winner) {
  const rollingDiv = document.getElementById('rolling-names');
  const winnerCard = document.getElementById('winner-card');

  rollingDiv.innerHTML = `<div class="roll-item rolling">🏆</div>`;

  // Mark winner
  participants.forEach(p => p.isWinner = false);
  const idx = participants.findIndex(p => p.id === winner.id);
  if (idx !== -1) participants[idx].isWinner = true;
  lastWinner = winner;
  saveData();
  localStorage.setItem(WINNER_KEY, JSON.stringify(winner));

  // Show winner card
  document.getElementById('winner-name').textContent  = winner.nombre;
  document.getElementById('winner-phone').textContent = '📞 ' + winner.telefono;
  document.getElementById('winner-email').textContent = '✉️ ' + winner.correo;
  winnerCard.style.display = 'block';

  // Confetti effect
  launchConfetti();
  renderLista(); // refresh to show winner badge
}

function resetSorteo() {
  document.getElementById('winner-card').style.display = 'none';
  document.getElementById('rolling-names').innerHTML = `
    <div class="roll-item roll-idle">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <span>Presiona para sortear</span>
    </div>`;
  participants.forEach(p => p.isWinner = false);
  lastWinner = null;
  saveData();
  localStorage.removeItem(WINNER_KEY);
  renderLista();
}

// ─── CONFETTI ────────────────────────────────────────────────
function launchConfetti() {
  const colors = ['#6366f1','#f59e0b','#10b981','#f472b6','#60a5fa','#fbbf24'];
  const body = document.body;

  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    const size = 6 + Math.random() * 8;
    el.style.cssText = `
      position:fixed;
      top:-10px;
      left:${Math.random() * 100}vw;
      width:${size}px;
      height:${size}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      pointer-events:none;
      z-index:9999;
      animation: confettiFall ${1.5 + Math.random() * 2}s ease forwards;
      animation-delay: ${Math.random() * 0.6}s;
    `;
    body.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // Inject keyframes once
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `
      @keyframes confettiFall {
        from { transform: translateY(0) rotate(0deg); opacity:1; }
        to   { transform: translateY(100vh) rotate(${360 + Math.random() * 360}deg); opacity:0; }
      }`;
    document.head.appendChild(style);
  }
}

// ─── LISTA PARTICIPANTES ─────────────────────────────────────
function renderLista() {
  const container = document.getElementById('lista-container');
  const query     = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

  const filtered = participants.filter(p =>
    !query ||
    p.nombre.toLowerCase().includes(query) ||
    p.telefono.includes(query) ||
    p.correo.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p>${query ? 'Sin resultados para "' + query + '"' : 'No hay participantes aún.<br>Registra el primero arriba.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map((p, i) => {
    const initials = p.nombre.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
    const num      = participants.indexOf(p) + 1;
    const interesVal = p.interes || 'Renta';
    const badgeClass = interesVal.toLowerCase() === 'venta' ? 'badge-venta' : 'badge-renta';
    return `
      <div class="participant-card ${p.isWinner ? 'winner-highlight' : ''}">
        ${p.isWinner ? '<div class="winner-badge">🏆 GANADOR</div>' : ''}
        <div class="participant-avatar">${initials}</div>
        <div class="participant-info">
          <div class="participant-name">${escHtml(p.nombre)}</div>
          <div class="participant-meta">
            <span>📞 ${escHtml(p.telefono)}</span>
            <span>✉️ ${escHtml(p.correo)}</span>
          </div>
          <div class="badge-interes ${badgeClass}">${interesVal}</div>
        </div>
        <div class="participant-num">#${num}</div>
      </div>`;
  }).join('');
}

// ─── EXPORT CSV ──────────────────────────────────────────────
function exportCSV() {
  if (participants.length === 0) {
    showToast('⚠️ No hay datos para exportar', '#f59e0b');
    return;
  }

  const header = ['#', 'Nombre', 'Teléfono', 'Correo', 'Interés', 'Fecha', 'Ganador'];
  const rows   = participants.map((p, i) => [
    i + 1,
    '"' + p.nombre.replace(/"/g, '""') + '"',
    p.telefono,
    p.correo,
    p.interes || 'Renta',
    new Date(p.fecha).toLocaleString('es-MX'),
    p.isWinner ? 'SÍ' : 'NO',
  ]);

  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const bom = '\uFEFF'; // BOM for Excel
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `expo-logistica-2026-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 CSV exportado', '#10b981');
}

// ─── IMPORT TXT / CSV ──────────────────────────────────────────
function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/);
    let count = 0;
    
    lines.forEach(line => {
      if (!line.trim()) return;
      
      // Try splitting by comma, semicolon, pipe, or tab
      let parts = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(';')) {
        parts = line.split(';');
      } else if (line.includes('|')) {
        parts = line.split('|');
      } else {
        // parse comma but handle quoted fields (standard CSV)
        parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      }
      
      // Clean quotes and whitespaces
      parts = parts.map(p => p.replace(/^["']|["']$/g, '').trim());
      
      // Find candidate fields
      let nombre = '';
      let telefono = '';
      let correo = '';
      let interes = 'Renta';
      
      // Check if parts[0] is a number (like a row index)
      let startIndex = 0;
      if (parts.length >= 4 && !isNaN(parts[0]) && parts[0] !== '') {
        startIndex = 1;
      }
      
      const remainingParts = [];
      parts.slice(startIndex).forEach(part => {
        if (!part) return;
        if (part.includes('@')) {
          correo = part;
        } else if (/^\+?[\d\s-]{8,20}$/.test(part) && !telefono) {
          telefono = part;
        } else if (/^(renta|venta)$/i.test(part)) {
          interes = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        } else {
          remainingParts.push(part);
        }
      });
      
      if (remainingParts.length > 0) {
        nombre = remainingParts[0];
      } else if (parts[startIndex]) {
        nombre = parts[startIndex];
      }
      
      if (nombre && nombre.toLowerCase() !== 'nombre') { // skip header row
        if (!telefono) telefono = 'Sin teléfono';
        if (!correo) correo = 'sin@correo.com';
        
        participants.push({
          nombre: nombre,
          telefono: telefono,
          correo: correo,
          interes: interes,
          fecha: Date.now(),
          isWinner: false
        });
        count++;
      }
    });
    
    if (count > 0) {
      saveData();
      updateCountBadge();
      updateSorteoCount();
      renderLista();
      showToast(`📥 Importados ${count} registros`, '#10b981');
    } else {
      showToast('⚠️ No se encontraron registros válidos', '#f59e0b');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // reset file input selection
}

// ─── CLEAR ALL ───────────────────────────────────────────────
function confirmClear() {
  document.getElementById('modal-clear').classList.add('open');
}
function closeClear() {
  document.getElementById('modal-clear').classList.remove('open');
}
function clearAll() {
  participants = [];
  lastWinner   = null;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(WINNER_KEY);
  updateCountBadge();
  updateSorteoCount();
  renderLista();
  resetSorteo();
  closeClear();
  showToast('🗑️ Lista limpiada', '#ef4444');
}

// ─── HELPERS ─────────────────────────────────────────────────
function updateCountBadge() {
  const badge = document.getElementById('count-badge');
  if (badge) badge.textContent = participants.length;
}

function showToast(msg, color = '#10b981') {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  msgEl.textContent = msg;
  toast.style.background = color;
  toast.style.boxShadow  = `0 8px 32px ${color}66`;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
