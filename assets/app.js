/**
 * ConflictWatch — Main Application Logic
 * Dashboard interactions, data fetching, and Realtime integration.
 */

window.CW_CONFIG = window.CW_CONFIG || {
    supabaseUrl: 'https://rhgnuobnohggdieqckah.supabase.co',
    supabaseAnon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZ251b2Jub2hnZ2RpZXFja2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMDE4NjIsImV4cCI6MjA4Nzg3Nzg2Mn0.AO83kUCwiQf4qfD0e3lYMuCIuMVYKbUZ1aBwhEBA5Eo',
    apiUrl: 'https://conflictwatch-backend.onrender.com',
    appUrl: window.location.origin
};

document.addEventListener('DOMContentLoaded', async () => {


document.addEventListener('DOMContentLoaded', async () => {
    const { Auth, RealtimeManager, apiGet, apiPost } = window.CW;

    // ── Elementos do DOM ─────────────────────────────────────────
    const tensionNumber = document.getElementById('tension-number');
    const tensionStatus = document.getElementById('tension-status');
    const newsFeed = document.getElementById('news-feed');
    const chatBox = document.getElementById('chat-box');
    const aiInput = document.getElementById('ai-input');
    const sendBtn = document.getElementById('send-btn');
    const userEmail = document.getElementById('user-email');
    const planBadge = document.getElementById('plan-badge');
    const authBtn = document.getElementById('auth-btn');
    const upgradeBtn = document.getElementById('upgrade-btn');
    const langFilter = document.getElementById('lang-filter');

    // ── Estado ───────────────────────────────────────────────────
    let currentLang = 'pt';
    let userId = null;

    // ── Inicialização ───────────────────────────────────────────
    async function init() {
        updateAuthUI();
        loadTension();
        loadEvents();
        initRealtime();
        setupEventListeners();
    }

    // ── Auth UI ─────────────────────────────────────────────────
    async function updateAuthUI() {
        const session = await Auth.getSession();
        if (session) {
            const profile = await Auth.getCachedProfile();
            userId = session.user.id;
            userEmail.textContent = session.user.email;
            planBadge.textContent = profile?.plan || 'FREE';
            planBadge.className = `plan-badge ${profile?.plan === 'pro' ? 'pro' : ''}`;
            authBtn.textContent = 'Sair';
            authBtn.onclick = () => Auth.logout();

            if (profile?.plan === 'pro') {
                upgradeBtn.textContent = 'GERENCIAR PLANO';
                upgradeBtn.onclick = () => window.CW.Billing.openPortal();
            } else {
                upgradeBtn.onclick = () => window.CW.Billing.startCheckout();
            }
        } else {
            userEmail.textContent = 'Não autenticado';
            planBadge.textContent = 'CONVIDADO';
            authBtn.textContent = 'Entrar';
            authBtn.onclick = () => window.location.href = 'login.html';
            upgradeBtn.onclick = () => window.location.href = 'login.html?redirect=pricing.html';
        }
    }

    // ── Dados: Tensão ───────────────────────────────────────────
    async function loadTension() {
        try {
            // O backend expõe via Supabase direto ou via rota de históricos
            const res = await apiGet('/api/tension/latest');
            if (res.success) {
                updateTensionUI(res.data.value);
            }
        } catch (err) {
            console.error('Erro ao carregar tensão:', err);
        }
    }

    function updateTensionUI(value) {
        if (!tensionNumber) return;
        tensionNumber.textContent = value.toFixed(1);

        // Lógica de cores baseada no valor
        let color = '#00ff88'; // estável
        let label = 'ESTÁVEL';

        if (value >= 90) { color = '#ff3e3e'; label = 'CRÍTICO'; }
        else if (value >= 75) { color = '#ff6a00'; label = 'ELEVADO'; }
        else if (value >= 55) { color = '#ffb700'; label = 'MODERADO'; }
        else if (value >= 35) { color = '#88cc44'; label = 'BAIXO'; }

        tensionStatus.textContent = label;
        tensionStatus.style.color = color;
        tensionNumber.style.textShadow = `0 0 20px ${color}44`;
    }

    // ── Dados: Eventos ──────────────────────────────────────────
    async function loadEvents() {
        try {
            const res = await apiGet(`/api/events?lang=${currentLang}`);
            if (res.success) {
                renderEvents(res.data);
            }
        } catch (err) {
            console.error('Erro ao carregar eventos:', err);
        }
    }

    function renderEvents(events) {
        if (!newsFeed) return;
        if (!events.length) {
            newsFeed.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-dim);">Nenhum evento recente encontrado.</div>';
            return;
        }

        newsFeed.innerHTML = events.map(ev => `
      <div class="event-card ${ev.is_critical ? 'critical' : ''}">
        <div class="event-impact">
          <span class="val" style="color: ${getImpactColor(ev.impact_score)}">${ev.impact_score}</span>
          <span class="lbl">Impacto</span>
        </div>
        <div class="event-content">
          <div class="event-meta">
            <span style="color:var(--secondary)">${ev.category}</span>
            <span>•</span>
            <span>${new Date(ev.published_at).toLocaleString()}</span>
            <span>•</span>
            <span style="color:var(--accent)">${ev.source}</span>
          </div>
          <h3 class="event-title">${ev.title_pt || ev.title}</h3>
          <p class="event-summary">${ev.ai_summary || ev.description || ''}</p>
          <div class="event-footer">
            <a href="${ev.url}" target="_blank" class="event-link">VER FONTE ORIGINAL ↗</a>
          </div>
        </div>
      </div>
    `).join('');
    }

    function getImpactColor(score) {
        if (score >= 8) return '#ff3e3e';
        if (score >= 5) return '#ffb700';
        return '#00f2fe';
    }

    // ── AI Analyst ──────────────────────────────────────────────
    async function handleAISend() {
        const text = aiInput.value.trim();
        if (!text) return;

        // Adicionar msg do usuário
        appendChatMessage('user', text);
        aiInput.value = '';

        // Loading AI
        const loadingId = 'ai-loading-' + Date.now();
        appendChatMessage('ai', '<div class="spinner" style="width:20px;height:20px"></div> Pensando...', loadingId);

        try {
            const token = await Auth.getToken();
            const res = await apiPost('/api/analysis/chat', { query: text, language: currentLang }, token);

            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();

            if (res.success) {
                appendChatMessage('ai', res.data.text);
            } else {
                appendChatMessage('ai', '⚠️ Erro: ' + (res.error || 'Ocorreu um problema na análise.'));
            }
        } catch (err) {
            console.error('Erro no chat IA:', err);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.remove();
            appendChatMessage('ai', '❌ Erro de conexão com o analista.');
        }
    }

    function appendChatMessage(role, content, id) {
        const msg = document.createElement('div');
        msg.className = `chat-msg ${role}`;
        if (id) msg.id = id;
        msg.innerHTML = content;
        chatBox.appendChild(msg);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // ── Realtime ────────────────────────────────────────────────
    function initRealtime() {
        RealtimeManager.subscribeTension((newTension) => {
            console.log('⚡ Atualização Realtime: Tensão', newTension);
            updateTensionUI(newTension.tension_value);
        });

        RealtimeManager.subscribeEvents((newEvent) => {
            console.log('⚡ Novo Evento Realtime', newEvent);
            // Recarregar feed (ou prepend se quisermos ser mais eficientes)
            loadEvents();

            if (newEvent.is_critical) {
                showGlobalAlert(newEvent);
            }
        });

        RealtimeManager.subscribeAlerts((alert) => {
            console.log('🔔 Alerta Crítico PRO', alert);
            renderPremiumAlert(alert);
        });
    }

    function showGlobalAlert(event) {
        // Notificação toast ou visual
        const notification = document.createElement('div');
        notification.style = "position:fixed; bottom:20px; right:20px; background:var(--primary); color:#fff; padding:16px; border-radius:8px; z-index:10000; box-shadow:0 10px 30px rgba(0,0,0,0.5);";
        notification.innerHTML = `<strong>ALERTA CRÍTICO:</strong> ${event.title}`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 8000);
    }

    function renderPremiumAlert(alert) {
        const container = document.getElementById('alerts-container');
        if (!container) return;

        const pill = document.createElement('div');
        pill.className = 'alert-pill';
        pill.innerHTML = `
      <div style="font-size:20px">⚠️</div>
      <div>
        <div style="font-weight:700; font-size:12px;">${alert.title}</div>
        <div style="font-size:11px; color:var(--text-dim);">${alert.message}</div>
      </div>
    `;
        container.prepend(pill);
    }

    // ── Event Listeners ─────────────────────────────────────────
    function setupEventListeners() {
        sendBtn.addEventListener('click', handleAISend);
        aiInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleAISend();
        });

        langFilter.addEventListener('change', (e) => {
            currentLang = e.target.value;
            loadEvents();
        });
    }

    init();
});



