// ============================================================================
// CHAVES DE MEMÓRIA LOCAL E CONFIGURAÇÃO DO FICHEIRO NO GITHUB GIST
// ============================================================================
const TOKEN_KEY = 'equilibrio_gh_token';
const GIST_ID_KEY = 'equilibrio_gist_id';
const CACHE_LOGS_KEY = 'equilibrio_local_cache';
const GIST_FILENAME = 'equilibrio_dados.json';

// Elementos DOM
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');

const dailyForm = document.getElementById('daily-form');
const logDateInput = document.getElementById('log-date');
const logWeightInput = document.getElementById('log-weight');
const deleteCurrentBtn = document.getElementById('delete-current-btn');
const syncStatus = document.getElementById('sync-status');
const logsList = document.getElementById('logs-list');

let weightChart = null;
let allLogs = [];

const todayStr = new Date().toLocaleDateString('en-CA');
logDateInput.value = todayStr;

// ============================================================================
// 0. GERADOR DE ÍCONE MINIMALISTA COM MARGEM AMPLA PARA IPHONE (APPLE TOUCH ICON)
// ============================================================================
function generateSafeTouchIcon() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // 1. Fundo sólido suave (Verde Sálvia Claro #E6F0EA) — O iOS corta as bordas em squircle
  ctx.fillStyle = '#E6F0EA';
  ctx.fillRect(0, 0, 512, 512);

  // 2. Círculo central subtil para dar ainda mais margem visual (Raio 140px num canvas de 512px)
  ctx.fillStyle = '#D5E6DC';
  ctx.beginPath();
  ctx.arc(256, 256, 136, 0, Math.PI * 2);
  ctx.fill();

  // 3. Ícone Minimalista ao Centro (Folha / Rebento em linha fina #3F624D, ocupando apenas 36% do centro)
  ctx.strokeStyle = '#3F624D';
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Caule central
  ctx.beginPath();
  ctx.moveTo(256, 330);
  ctx.lineTo(256, 215);
  ctx.stroke();

  // Folha direita
  ctx.beginPath();
  ctx.moveTo(256, 255);
  ctx.quadraticCurveTo(256, 185, 325, 185);
  ctx.quadraticCurveTo(325, 255, 256, 255);
  ctx.stroke();

  // Folha esquerda
  ctx.beginPath();
  ctx.moveTo(256, 280);
  ctx.quadraticCurveTo(256, 225, 195, 225);
  ctx.quadraticCurveTo(195, 280, 256, 280);
  ctx.stroke();

  const iconLink = document.getElementById('apple-icon');
  if (iconLink) {
    iconLink.href = canvas.toDataURL('image/png');
  }
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function setSyncBadge(iconName, text) {
  syncStatus.innerHTML = `<i data-lucide="${iconName}"></i><span class="sync-text">${text}</span>`;
  refreshIcons();
}

// ============================================================================
// 1. AUTENTICAÇÃO E LIGAÇÃO AO GITHUB GIST
// ============================================================================
async function initApp() {
  generateSafeTouchIcon();
  refreshIcons();

  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    return;
  }

  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  const cached = localStorage.getItem(CACHE_LOGS_KEY);
  if (cached) {
    allLogs = JSON.parse(cached);
    renderEverything();
  }

  await syncFromGitHub();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';
  const loginBtn = document.getElementById('login-btn');
  const tokenInput = document.getElementById('gh-token').value.trim();

  loginBtn.textContent = 'A verificar...';
  loginBtn.disabled = true;

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `token ${tokenInput}` }
    });

    if (!res.ok) throw new Error('Token inválido');

    localStorage.setItem(TOKEN_KEY, tokenInput);
    await findOrCreateDatabaseGist(tokenInput);
    await initApp();
  } catch (err) {
    authError.textContent = 'Token inválido. Confirma se copiaste bem e se marcaste a caixa "gist".';
  } finally {
    loginBtn.innerHTML = '<i data-lucide="log-in"></i> Ligar Conta e Entrar';
    loginBtn.disabled = false;
    refreshIcons();
  }
});

logoutBtn.addEventListener('click', () => {
  if (confirm('Queres desligar a tua conta deste dispositivo? (Os teus dados continuam seguros no teu GitHub)')) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    localStorage.removeItem(CACHE_LOGS_KEY);
    allLogs = [];
    initApp();
  }
});

refreshBtn.addEventListener('click', () => {
  syncFromGitHub();
});

// ============================================================================
// 2. MOTOR DE BASE DE DADOS (Lê e Grava no teu GitHub Gist Secreto)
// ============================================================================
async function findOrCreateDatabaseGist(token) {
  const res = await fetch('https://api.github.com/gists?per_page=100', {
    headers: { Authorization: `token ${token}` }
  });
  const gists = await res.json();
  const existingGist = gists.find(g => g.files && g.files[GIST_FILENAME]);

  if (existingGist) {
    localStorage.setItem(GIST_ID_KEY, existingGist.id);
    return existingGist.id;
  }

  const createRes = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'Base de Dados Privada — App Equilíbrio',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify([], null, 2)
        }
      }
    })
  });

  const newGist = await createRes.json();
  localStorage.setItem(GIST_ID_KEY, newGist.id);
  return newGist.id;
}

async function syncFromGitHub() {
  const token = localStorage.getItem(TOKEN_KEY);
  let gistId = localStorage.getItem(GIST_ID_KEY);
  if (!token) return;

  setSyncBadge('loader', 'A atualizar');

  try {
    if (!gistId) {
      gistId = await findOrCreateDatabaseGist(token);
    }

    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Authorization: `token ${token}` },
      cache: 'no-store'
    });

    if (!res.ok) throw new Error('Falha ao ler Gist');

    const gistData = await res.json();
    const rawContent = gistData.files[GIST_FILENAME].content;
    allLogs = JSON.parse(rawContent || '[]');

    allLogs.sort((a, b) => a.log_date.localeCompare(b.log_date));
    localStorage.setItem(CACHE_LOGS_KEY, JSON.stringify(allLogs));

    renderEverything();
    setSyncBadge('check-circle-2', 'Sincronizado');
  } catch (err) {
    setSyncBadge('wifi-off', 'Offline');
  }
}

async function saveToGitHub() {
  const token = localStorage.getItem(TOKEN_KEY);
  const gistId = localStorage.getItem(GIST_ID_KEY);
  if (!token || !gistId) return;

  setSyncBadge('cloud-upload', 'A guardar');

  try {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(allLogs, null, 2)
          }
        }
      })
    });

    if (!res.ok) throw new Error('Erro ao gravar');
    setSyncBadge('check-circle-2', 'Guardado');
  } catch (err) {
    setSyncBadge('hard-drive', 'Local');
  }
}

// ============================================================================
// 3. LÓGICA DO FORMULÁRIO DIÁRIO E REMOÇÃO DE REGISTOS
// ============================================================================
logDateInput.addEventListener('change', () => {
  populateFormForDate(logDateInput.value);
});

function populateFormForDate(dateStr) {
  const existing = allLogs.find(item => item.log_date === dateStr);
  if (existing) {
    logWeightInput.value = existing.weight !== null ? existing.weight : '';
    document.querySelector(`input[name="diet"][value="${existing.diet}"]`).checked = true;
    document.querySelector(`input[name="exercise"][value="${existing.exercise}"]`).checked = true;
    deleteCurrentBtn.classList.remove('hidden');
  } else {
    logWeightInput.value = '';
    document.getElementById('diet-yes').checked = true;
    document.getElementById('ex-none').checked = true;
    deleteCurrentBtn.classList.add('hidden');
  }
}

async function deleteLogByDate(dateStr) {
  const formatted = formatLongDate(dateStr);
  if (!confirm(`Tens a certeza que queres apagar o registo de ${formatted}?`)) {
    return;
  }

  allLogs = allLogs.filter(item => item.log_date !== dateStr);
  localStorage.setItem(CACHE_LOGS_KEY, JSON.stringify(allLogs));

  renderEverything();
  await saveToGitHub();
}

deleteCurrentBtn.addEventListener('click', () => {
  deleteLogByDate(logDateInput.value);
});

dailyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const log_date = logDateInput.value;
  const weightVal = logWeightInput.value;
  const weight = weightVal ? parseFloat(weightVal) : null;
  const diet = document.querySelector('input[name="diet"]:checked').value;
  const exercise = document.querySelector('input[name="exercise"]:checked').value;

  const entry = { log_date, weight, diet, exercise };
  const existingIndex = allLogs.findIndex(item => item.log_date === log_date);

  if (existingIndex >= 0) {
    allLogs[existingIndex] = entry;
  } else {
    allLogs.push(entry);
  }

  allLogs.sort((a, b) => a.log_date.localeCompare(b.log_date));
  localStorage.setItem(CACHE_LOGS_KEY, JSON.stringify(allLogs));

  renderEverything();
  await saveToGitHub();
});

// ============================================================================
// 4. ATUALIZAR VISUALIZAÇÃO
// ============================================================================
function renderEverything() {
  populateFormForDate(logDateInput.value);
  renderStats();
  renderChart();
  renderHistory();
  refreshIcons();
}

function renderStats() {
  const withWeight = allLogs.filter(l => l.weight !== null);
  const lastWeight = withWeight.length > 0 ? `${withWeight[withWeight.length - 1].weight} kg` : '-- kg';
  document.getElementById('stat-weight').textContent = lastWeight;

  const last7 = allLogs.slice(-7);
  const dietOkCount = last7.filter(l => l.diet === 'cumprida').length;
  const workoutCount = last7.filter(l => l.exercise !== 'descanso').length;

  document.getElementById('stat-diet').textContent = `${dietOkCount}/${last7.length || 7} dias`;
  document.getElementById('stat-exercise').textContent = `${workoutCount}x`;
}

function renderChart() {
  const weightLogs = allLogs.filter(l => l.weight !== null);
  const ctx = document.getElementById('weight-chart').getContext('2d');

  if (weightChart) weightChart.destroy();

  weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: weightLogs.map(l => formatShortDate(l.log_date)),
      datasets: [{
        label: 'Peso (kg)',
        data: weightLogs.map(l => l.weight),
        borderColor: '#3F624D',
        backgroundColor: 'rgba(63, 98, 77, 0.08)',
        borderWidth: 2.5,
        pointRadius: 3.5,
        pointBackgroundColor: '#3F624D',
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#78736C', font: { size: 11 } } },
        y: { beginAtZero: false, grid: { color: '#EDEAE2' }, ticks: { color: '#78736C', font: { size: 11 } } }
      }
    }
  });
}

function renderHistory() {
  logsList.innerHTML = '';
  const recentLogs = [...allLogs].reverse().slice(0, 20);

  if (recentLogs.length === 0) {
    logsList.innerHTML = '<li style="color:#78736C; font-size:0.85rem; padding:8px 0;">Ainda sem registos guardados.</li>';
    return;
  }

  const exConfig = {
    descanso: { label: 'Descanso', icon: 'moon', css: 'tag-ex-none' },
    leve: { label: 'Leve', icon: 'footprints', css: 'tag-ex-light' },
    intenso: { label: 'Pesado', icon: 'flame', css: 'tag-ex-heavy' }
  };

  recentLogs.forEach(item => {
    const ex = exConfig[item.exercise] || exConfig.descanso;
    const isDietOk = item.diet === 'cumprida';

    const li = document.createElement('li');
    li.className = 'log-item';
    li.innerHTML = `
      <div class="log-date-weight">
        <strong>${formatLongDate(item.log_date)}</strong>
        <span>${item.weight ? item.weight + ' kg' : 'Sem pesagem'}</span>
      </div>
      <div class="log-tags">
        <span class="pill-tag ${isDietOk ? 'tag-diet-ok' : 'tag-diet-free'}">
          <i data-lucide="${isDietOk ? 'check' : 'coffee'}"></i>
          ${isDietOk ? 'Dieta' : 'Livre'}
        </span>
        <span class="pill-tag ${ex.css}">
          <i data-lucide="${ex.icon}"></i>
          ${ex.label}
        </span>
        <button type="button" class="btn-delete-item" title="Apagar este dia">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    const deleteBtn = li.querySelector('.btn-delete-item');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteLogByDate(item.log_date);
    });

    li.addEventListener('click', () => {
      logDateInput.value = item.log_date;
      populateFormForDate(item.log_date);
      if (window.innerWidth < 900) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    logsList.appendChild(li);
  });
}

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function formatLongDate(dateStr) {
  const dateObj = new Date(dateStr + 'T12:00:00');
  return dateObj.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
}

initApp();