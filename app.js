/* ============================================================
   EXPO LOGÍSTICA 2026 — APP LOGIC
   - QR Scanner (ZXing)
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
let scannerActive  = false;
let codeReader     = null;
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
  // allow QR placeholder click
  document.getElementById('qr-placeholder').addEventListener('click', startScanner);
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

  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('section-' + tab).classList.add('active');

  if (tab !== 'registro' && scannerActive) stopScanner();
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
  const btn = document.getElementById('admin-lock-btn');
  const icon = document.getElementById('lock-icon');
  const label = document.getElementById('lock-label');
  
  if (isAdmin) {
    btn.classList.add('admin-unlocked');
    label.textContent = 'Desbloqueado';
    icon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
  } else {
    btn.classList.remove('admin-unlocked');
    label.textContent = 'Bloqueado';
    icon.innerHTML = `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`;
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
    fecha:     new Date().toISOString(),
    isWinner:  false,
  };

  participants.unshift(lead);
  saveData();
  updateCountBadge();
  updateSorteoCount();

  document.getElementById('lead-form').reset();

  showToast(`✅ ${nombre} registrado!`, '#10b981');
  flashCard();
}

function flashCard() {
  const btn = document.getElementById('btn-registrar');
  btn.style.background = 'linear-gradient(135deg, #10b981, #34d399)';
  setTimeout(() => { btn.style.background = ''; }, 700);
}

// ─── QR SCANNER ──────────────────────────────────────────────
async function startScanner() {
  if (scannerActive) return;

  const placeholder = document.getElementById('qr-placeholder');
  const video       = document.getElementById('qr-video');
  const overlay     = document.getElementById('qr-overlay');
  const stopBtn     = document.getElementById('qr-stop-btn');
  const btnScan     = document.getElementById('btn-scan');
  const status      = document.getElementById('qr-status');

  // Check camera permission / support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = '❌ Cámara no disponible en este dispositivo/navegador';
    status.style.color = '#ef4444';
    return;
  }

  status.textContent = 'Iniciando cámara…';
  status.style.color = '#94a3b8';

  try {
    // First ensure permission
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach(t => t.stop()); // stop preview stream, ZXing will open its own

    codeReader = new ZXing.BrowserMultiFormatReader();

    const devices = await ZXing.BrowserCodeReader.listVideoInputDevices();
    let deviceId = undefined;

    // prefer rear camera
    if (devices && devices.length > 0) {
      const rear = devices.find(d => /back|rear|environment/i.test(d.label));
      deviceId = rear ? rear.deviceId : devices[devices.length - 1].deviceId;
    }

    placeholder.style.display = 'none';
    video.style.display = 'block';
    overlay.style.display = 'block';
    stopBtn.style.display = 'flex';
    btnScan.style.display = 'none';
    document.querySelector('.qr-card').classList.add('scanning');
    scannerActive = true;

    status.textContent = '📷 Apunta al código QR…';
    status.style.color = '#6366f1';

    codeReader.decodeFromVideoDevice(deviceId, video, (result, err) => {
      if (result) {
        const text = result.getText();
        handleQRResult(text);
      }
      // suppress NotFoundException spam
      if (err && !(err instanceof ZXing.NotFoundException)) {
        console.warn('QR error:', err);
      }
    });

  } catch (err) {
    console.error(err);
    status.textContent = '❌ No se pudo acceder a la cámara. Verifica permisos.';
    status.style.color = '#ef4444';
    placeholder.style.display = 'flex';
  }
}

function stopScanner() {
  if (codeReader) {
    try { codeReader.reset(); } catch {}
    codeReader = null;
  }
  scannerActive = false;

  const placeholder = document.getElementById('qr-placeholder');
  const video       = document.getElementById('qr-video');
  const overlay     = document.getElementById('qr-overlay');
  const stopBtn     = document.getElementById('qr-stop-btn');
  const btnScan     = document.getElementById('btn-scan');
  const status      = document.getElementById('qr-status');

  video.srcObject = null;
  video.style.display = 'none';
  overlay.style.display = 'none';
  stopBtn.style.display = 'none';
  btnScan.style.display = 'flex';
  placeholder.style.display = 'flex';
  document.querySelector('.qr-card').classList.remove('scanning');
  status.textContent = '';
}

/**
 * Handles decoded QR text.
 * Supports:
 *  1. vCard / MECARD format
 *  2. JSON  { nombre, telefono, correo }
 *  3. Plain text  "Nombre | Teléfono | Correo"
 *  4. URL with query params  ?nombre=&telefono=&correo=
 */
function handleQRResult(text) {
  stopScanner();

  const status = document.getElementById('qr-status');
  status.textContent = '✅ QR leído — procesando…';
  status.style.color = '#10b981';

  let nombre = '', telefono = '', correo = '';

  // 1. JSON
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text);
      nombre   = obj.nombre   || obj.name  || '';
      telefono = obj.telefono || obj.phone || obj.tel || '';
      correo   = obj.correo   || obj.email || '';
    } catch {}
  }

  // 2. URL query params
  if (!nombre && text.includes('?')) {
    try {
      const url    = new URL(text.startsWith('http') ? text : 'http://x.com/' + text.split('?')[1]);
      nombre   = url.searchParams.get('nombre')   || url.searchParams.get('name')  || '';
      telefono = url.searchParams.get('telefono') || url.searchParams.get('phone') || '';
      correo   = url.searchParams.get('correo')   || url.searchParams.get('email') || '';
    } catch {}
  }

  // 3. vCard / MECARD
  if (!nombre && (text.includes('MECARD') || text.includes('BEGIN:VCARD'))) {
    const fnMatch    = text.match(/(?:FN:|N:|MECARD:.*?N:)([^\n;]+)/i);
    const telMatch   = text.match(/TEL[^:]*:([^\n]+)/i);
    const emailMatch = text.match(/EMAIL[^:]*:([^\n]+)/i);
    nombre   = fnMatch    ? fnMatch[1].trim()    : '';
    telefono = telMatch   ? telMatch[1].trim()   : '';
    correo   = emailMatch ? emailMatch[1].trim() : '';
  }

  // 4. Pipe-separated plain text  "Nombre | Teléfono | Correo"
  if (!nombre && text.includes('|')) {
    const parts = text.split('|').map(s => s.trim());
    nombre   = parts[0] || '';
    telefono = parts[1] || '';
    correo   = parts[2] || '';
  }

  // 5. Tab-separated
  if (!nombre && text.includes('\t')) {
    const parts = text.split('\t').map(s => s.trim());
    nombre   = parts[0] || '';
    telefono = parts[1] || '';
    correo   = parts[2] || '';
  }

  // 6. Comma-separated
  if (!nombre && text.includes(',')) {
    const parts = text.split(',').map(s => s.trim());
    nombre   = parts[0] || '';
    telefono = parts[1] || '';
    correo   = parts[2] || '';
  }

  // 7. Fallback — put full text in nombre field so user can complete
  if (!nombre) {
    nombre = text;
  }

  // Fill form fields
  document.getElementById('nombre').value   = nombre;
  document.getElementById('telefono').value = telefono;
  document.getElementById('correo').value   = correo;

  // Auto-focus the first empty field
  if (!nombre)   document.getElementById('nombre').focus();
  else if (!telefono) document.getElementById('telefono').focus();
  else if (!correo)   document.getElementById('correo').focus();
  else            document.getElementById('btn-registrar').focus();

  // If all fields complete, auto-submit
  if (nombre && telefono && correo) {
    submitLead(null);
  } else {
    showToast('📋 Completa los datos y confirma', '#6366f1');
  }
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

  const header = ['#', 'Nombre', 'Teléfono', 'Correo', 'Fecha', 'Ganador'];
  const rows   = participants.map((p, i) => [
    i + 1,
    '"' + p.nombre.replace(/"/g, '""') + '"',
    p.telefono,
    p.correo,
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
