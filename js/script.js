// Template Jadwal Rencana Default
const defaultSlots = [
    { time: "05.00 - 06.00", plan: "Bangun Pagi, Ibadah & Olahraga", cat: "rutinitas", startHour: 5, log: "", energy: "Sedang" },
    { time: "06.00 - 07.30", plan: "Mandi, Sarapan & Bersiap", cat: "rutinitas", startHour: 6, log: "", energy: "Sedang" },
    { time: "07.30 - 08.00", plan: "Cek Email & Application Tracker", cat: "kerja", startHour: 7, log: "", energy: "Tinggi" },
    { time: "08.00 - 10.30", plan: "Sesi Utama Melamar Kerja", cat: "kerja", startHour: 8, log: "", energy: "Tinggi" },
    { time: "10.30 - 12.00", plan: "Belajar Skill / Kursus Online", cat: "belajar", startHour: 10, log: "", energy: "Tinggi" },
    { time: "12.00 - 13.00", plan: "Makan Siang & Istirahat", cat: "istirahat", startHour: 12, log: "", energy: "Sedang" },
    { time: "13.00 - 15.00", plan: "Latihan Soal CPNS / Psikotes", cat: "belajar", startHour: 13, log: "", energy: "Sedang" },
    { time: "15.00 - 15.30", plan: "Ibadah & Peregangan", cat: "rutinitas", startHour: 15, log: "", energy: "Sedang" },
    { time: "15.30 - 17.00", plan: "🎮 Bermain Game (Sesi 1)", cat: "game", startHour: 15, log: "", energy: "Tinggi" },
    { time: "17.00 - 18.30", plan: "Mandi Sore & Makan Malam", cat: "istirahat", startHour: 17, log: "", energy: "Sedang" },
    { time: "18.30 - 19.30", plan: "Review Harian & Catat Lamaran", cat: "kerja", startHour: 18, log: "", energy: "Sedang" },
    { time: "19.30 - 20.30", plan: "🎮 Bermain Game (Sesi 2)", cat: "game", startHour: 19, log: "", energy: "Tinggi" },
    { time: "20.30 - 21.00", plan: "Persiapan Tidur (Wind-down)", cat: "rutinitas", startHour: 20, log: "", energy: "Rendah" }
];

let activeSlots = [];
let currentPlayer = null;
let activePlayerName = 'Player';
let activeJournalCreatedAt = null;
let showAllJournalHistory = false;
let editingGamingSessionId = null;
let showGamingHistory = false;
let focusSeconds = 25 * 60;
let focusTimerId = null;

document.addEventListener("DOMContentLoaded", () => {
    setupJournalDateInput();
    setupJournalHistoryControls();
    setupDashboardGamingDateInput();
    setupDashboardGamingHistory();
    setupProfileLink();
    setupTheme();
    setupLogin();
    updateClock();
    setInterval(updateClock, 1000);
    loadTodayJournal();
    renderHistory();
});

function setupTheme() {
    const root = document.documentElement;
    const toggles = [document.getElementById('theme-toggle'), document.getElementById('dashboard-theme-toggle'), document.getElementById('gaming-theme-toggle')].filter(Boolean);
    const savedTheme = localStorage.getItem('tc_theme') || 'dark';

    function applyTheme(theme) {
        const isLight = theme === 'light';
        root.dataset.theme = isLight ? 'light' : 'dark';
        toggles.forEach(toggle => {
            toggle.querySelector('i').className = isLight ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
            toggle.querySelector('span').textContent = isLight ? 'Dark' : 'Light';
            toggle.title = isLight ? 'Gunakan tema gelap' : 'Gunakan tema terang';
            toggle.setAttribute('aria-label', toggle.title);
        });
    }

    applyTheme(savedTheme);
    toggles.forEach(toggle => toggle.addEventListener('click', () => {
        const nextTheme = root.dataset.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('tc_theme', nextTheme);
        applyTheme(nextTheme);
    }));
}

function localDateValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function createDateControl(id, labelText, className) {
    const wrapper = document.createElement('div');
    wrapper.className = className;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'date';
    input.id = id;
    input.value = localDateValue();
    input.required = true;
    wrapper.append(label, input);
    return { wrapper, input };
}

function setupJournalDateInput() {
    const slotsContainer = document.getElementById('journal-slots-container');
    if (!slotsContainer) return;
    const { wrapper, input } = createDateControl('journal-entry-date', 'TANGGAL JURNAL', 'journal-date-control');
    slotsContainer.before(wrapper);
    input.addEventListener('change', async () => {
        showAllJournalHistory = false;
        await loadTodayJournal();
        await renderHistory();
    });
}

function setupJournalHistoryControls() {
    const historyContainer = document.getElementById('history-container');
    if (!historyContainer) return;
    const historyButton = document.createElement('button');
    historyButton.type = 'button';
    historyButton.id = 'journal-history-toggle';
    historyButton.className = 'journal-history-toggle';
    historyButton.textContent = 'Riwayat';
    historyContainer.before(historyButton);
    historyButton.addEventListener('click', () => {
        showAllJournalHistory = !showAllJournalHistory;
        renderHistory();
    });
    historyContainer.addEventListener('click', async event => {
        const actionButton = event.target.closest('[data-journal-action]');
        if (!actionButton) return;
        const date = actionButton.dataset.journalDate;
        if (actionButton.dataset.journalAction === 'edit') {
            showAllJournalHistory = false;
            await viewHistory(date);
            await renderHistory();
            return;
        }
        if (actionButton.dataset.journalAction === 'delete' && window.confirm(`Hapus seluruh jurnal tanggal ${date}?`)) {
            await deleteJournalDate(date);
        }
    });
}

function setupDashboardGamingDateInput() {
    const form = document.getElementById('gaming-form');
    if (!form) return;
    const { wrapper, input } = createDateControl('dashboard-gaming-date', 'TANGGAL SESI', 'field-block');
    form.prepend(wrapper);
    input.addEventListener('change', () => {
        showGamingHistory = false;
        renderGamingLog();
    });
    const submitButton = form.querySelector('[type="submit"]');
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.id = 'cancel-gaming-edit';
    cancelButton.className = 'gaming-edit-cancel';
    cancelButton.textContent = 'Batal edit';
    cancelButton.hidden = true;
    submitButton.after(cancelButton);
    cancelButton.addEventListener('click', () => {
        editingGamingSessionId = null;
        form.reset();
        input.value = localDateValue();
        submitButton.innerHTML = '<span><i class="fa-solid fa-floppy-disk"></i> SIMPAN CATATAN GAME</span><i class="fa-solid fa-arrow-right"></i>';
        cancelButton.hidden = true;
        renderGamingLog();
    });
}

function setupDashboardGamingHistory() {
    const list = document.getElementById('gaming-history-list');
    if (!list) return;
    const historyButton = document.createElement('button');
    historyButton.type = 'button';
    historyButton.id = 'gaming-history-toggle';
    historyButton.className = 'gaming-history-toggle';
    historyButton.textContent = 'Riwayat';
    list.before(historyButton);
    historyButton.addEventListener('click', () => {
        showGamingHistory = !showGamingHistory;
        renderGamingLog();
    });
    list.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-gaming-action]');
        if (!actionButton) return;
        const sessions = JSON.parse(localStorage.getItem(gamingStorageKey()) || '[]');
        const session = sessions.find(item => String(item.id) === actionButton.dataset.sessionId);
        if (!session) return;
        if (actionButton.dataset.gamingAction === 'edit') {
            editingGamingSessionId = String(session.id);
            document.getElementById('dashboard-gaming-date').value = getGamingDate(session);
            document.getElementById('game-name').value = session.game || '';
            document.getElementById('game-session').value = session.session || '';
            document.getElementById('game-duration').value = session.duration || '';
            document.getElementById('game-achievement').value = session.achievement || '';
            document.querySelector('#gaming-form [type="submit"]').textContent = 'SIMPAN PERUBAHAN';
            document.getElementById('cancel-gaming-edit').hidden = false;
            showGamingHistory = false;
            renderGamingLog();
            document.getElementById('gaming-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        if (actionButton.dataset.gamingAction === 'delete' && window.confirm('Hapus sesi gaming ini?')) {
            const gainedExp = Number(session.exp || Math.max(10, Number(session.duration || 0) * 2));
            localStorage.setItem(gamingStorageKey(), JSON.stringify(sessions.filter(item => String(item.id) !== String(session.id))));
            localStorage.setItem(gamingExpKey(), String(Math.max(0, getGamingExp() - gainedExp)));
            if (editingGamingSessionId === String(session.id)) document.getElementById('cancel-gaming-edit').click();
            else renderGamingLog();
        }
    });
}

function selectedJournalDate() {
    return document.getElementById('journal-entry-date')?.value || localDateValue();
}

function setupLogin() {
    const loginScreen = document.getElementById('login-screen');
    const journalApp = document.getElementById('journal-app');
    const loginForm = document.getElementById('login-form');
    const playerName = document.getElementById('player-name');
    const playerCode = document.getElementById('player-code');
    const loginMessage = document.getElementById('login-message');
    const registerScreen = document.getElementById('register-screen');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const savedPlayer = localStorage.getItem('tc_player_name');

    if (savedPlayer && savedPlayer.toLowerCase() !== 'guest player') playerName.value = savedPlayer;
    else if (savedPlayer) localStorage.removeItem('tc_player_name');

    async function enterGame(name) {
        if (!currentPlayer) return;
        activePlayerName = name;
        document.body.dataset.playerName = name;
        if (document.getElementById('remember-player').checked) localStorage.setItem('tc_player_name', name);
        localStorage.setItem('tc_authenticated_player', JSON.stringify(currentPlayer));
        localStorage.removeItem('tc_guest_active');
        document.getElementById('dashboard-player').textContent = name;
        document.getElementById('dashboard-player-name').textContent = name;
        loginScreen.classList.add('is-hidden');
        registerScreen.classList.add('is-hidden');
        dashboardScreen.classList.remove('is-hidden');
        journalApp.classList.add('is-hidden');
        await loadTodayJournal();
        await renderHistory();
        updateDashboard();
        document.getElementById('dashboard-greeting-full').textContent = `${getGreeting(new Date().getHours())}, ${name}!`;
        loadWorldSignals();
        renderGamingLog();
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (playerCode.value.trim().length < 8) {
            loginMessage.textContent = 'Kode akses minimal terdiri dari 8 karakter.';
            return;
        }
        try {
            const result = await apiRequest('/api/login', {
                method: 'POST',
                body: JSON.stringify({ name: playerName.value.trim(), code: playerCode.value.trim() })
            });
            currentPlayer = result.player;
            await enterGame(result.player.name);
        } catch (error) {
            loginMessage.textContent = error.message;
        }
    });

    document.getElementById('show-register').addEventListener('click', () => {
        window.location.href = 'register.html';
    });

    document.getElementById('show-login').addEventListener('click', () => {
        window.location.href = 'login.html';
    });

    document.getElementById('register-form').addEventListener('submit', async event => {
        event.preventDefault();
        const message = document.getElementById('register-message');
        try {
            const result = await apiRequest('/api/register', { method: 'POST', body: JSON.stringify({ name: document.getElementById('register-name').value.trim(), code: document.getElementById('register-code').value.trim() }) });
            currentPlayer = result.player;
            await enterGame(result.player.name);
        } catch (error) {
            message.textContent = error.message;
        }
    });

    document.getElementById('toggle-code').addEventListener('click', () => {
        const isPassword = playerCode.type === 'password';
        playerCode.type = isPassword ? 'text' : 'password';
        document.querySelector('#toggle-code i').className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    document.getElementById('logout-button').addEventListener('click', () => {
        logout();
    });
    document.getElementById('dashboard-logout').addEventListener('click', () => {
        logout();
    });

    document.getElementById('open-journal').addEventListener('click', () => { window.location.href = 'jurnal.html'; });
    document.getElementById('back-dashboard').addEventListener('click', () => {
        journalApp.classList.add('is-hidden');
        dashboardScreen.classList.remove('is-hidden');
        updateDashboard();
    });
    document.getElementById('study-card').addEventListener('click', () => { window.location.href = 'study.html'; });
    document.getElementById('gold-card').addEventListener('click', () => { window.location.href = 'gold.html'; });
    document.getElementById('game-card').addEventListener('click', () => { window.location.href = 'gaming.html'; });
    document.getElementById('gaming-back').addEventListener('click', () => {
        document.getElementById('gaming-screen').classList.add('is-hidden');
        dashboardScreen.classList.remove('is-hidden');
    });
    document.getElementById('gaming-logout').addEventListener('click', () => logout());
    document.getElementById('gaming-form').addEventListener('submit', event => {
        event.preventDefault();
        const key = gamingStorageKey();
        const sessions = JSON.parse(localStorage.getItem(key) || '[]');
        const duration = Number(document.getElementById('game-duration').value);
        const recordedAt = new Date().toISOString();
        const nextSession = { date: document.getElementById('dashboard-gaming-date').value, game: document.getElementById('game-name').value.trim(), duration, session: document.getElementById('game-session').value, achievement: document.getElementById('game-achievement').value.trim(), exp: Math.max(10, Math.round(duration * 2)) };
        const savedDate = nextSession.date;
        let expDelta = nextSession.exp;
        const editingIndex = sessions.findIndex(item => String(item.id) === String(editingGamingSessionId));
        if (editingIndex >= 0) {
            const existing = sessions[editingIndex];
            expDelta -= Number(existing.exp || Math.max(10, Number(existing.duration || 0) * 2));
            sessions[editingIndex] = { ...existing, ...nextSession, updatedAt: recordedAt };
        } else {
            sessions.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, ...nextSession, recordedAt, createdAt: recordedAt });
        }
        localStorage.setItem(key, JSON.stringify(sessions));
        localStorage.setItem(gamingExpKey(), String(Math.max(0, getGamingExp() + expDelta)));
        event.target.reset();
        document.getElementById('dashboard-gaming-date').value = savedDate;
        editingGamingSessionId = null;
        document.getElementById('cancel-gaming-edit').hidden = true;
        event.target.querySelector('[type="submit"]').innerHTML = '<span><i class="fa-solid fa-floppy-disk"></i> SIMPAN CATATAN GAME</span><i class="fa-solid fa-arrow-right"></i>';
        showGamingHistory = false;
        document.getElementById('gaming-message').textContent = 'Play session tersimpan.';
        renderGamingLog();
    });
    document.querySelectorAll('[data-duration]').forEach(button => button.addEventListener('click', () => {
        const durationInput = document.getElementById('game-duration');
        durationInput.value = Number(durationInput.value || 0) + Number(button.dataset.duration);
        durationInput.focus();
    }));
    document.getElementById('gaming-search').addEventListener('input', renderGamingLog);
    document.getElementById('gaming-history-list').addEventListener('click', event => {
        const deleteButton = event.target.closest('[data-delete-session]');
        if (!deleteButton) return;
        const sessions = JSON.parse(localStorage.getItem(gamingStorageKey()) || '[]');
        const session = sessions.find(item => item.id === deleteButton.dataset.deleteSession);
        localStorage.setItem(gamingStorageKey(), JSON.stringify(sessions.filter(item => item.id !== deleteButton.dataset.deleteSession)));
        if (session) localStorage.setItem(gamingExpKey(), String(Math.max(0, getGamingExp() - Number(session.exp || Math.max(10, Number(session.duration || 0) * 2)))));
        renderGamingLog();
    });
    document.getElementById('gaming-audio-toggle').addEventListener('click', event => {
        const enabled = localStorage.getItem('tc_audio_fx') !== 'off';
        localStorage.setItem('tc_audio_fx', enabled ? 'off' : 'on');
        event.currentTarget.classList.toggle('is-muted', enabled);
        event.currentTarget.querySelector('i').className = enabled ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
    });
    document.getElementById('reset-day').addEventListener('click', resetDay);
    document.getElementById('focus-card').addEventListener('click', () => {
        document.getElementById('focus-realm').classList.remove('is-hidden');
        document.getElementById('focus-realm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.getElementById('focus-close').addEventListener('click', () => {
        document.getElementById('focus-realm').classList.add('is-hidden');
        stopFocusTimer();
    });
    document.getElementById('focus-start').addEventListener('click', toggleFocusTimer);
    document.getElementById('focus-reset').addEventListener('click', resetFocusTimer);

    async function logout() {
        currentPlayer = null;
        dashboardScreen.classList.add('is-hidden');
        journalApp.classList.add('is-hidden');
        localStorage.removeItem('tc_authenticated_player');
        localStorage.removeItem('tc_guest_active');
        await apiRequest('/api/logout', { method: 'POST' }).catch(() => {});
        window.location.href = 'login.html';
        playerCode.value = '';
        loginMessage.textContent = '';
    }

    if (localStorage.getItem('tc_authenticated_player')) {
        apiRequest('/api/me').then(result => {
            currentPlayer = result.player;
            enterGame(result.player.name);
        }).catch(() => {
            localStorage.removeItem('tc_authenticated_player');
        });
    }
}

function gamingStorageKey() {
    return `tc_gaming_${currentPlayer?.id || activePlayerName}`;
}

function gamingExpKey() {
    return `tc_gaming_exp_${currentPlayer?.id || activePlayerName}`;
}

function getGamingExp() {
    return Number(localStorage.getItem(gamingExpKey()) || 0);
}

function formatGamingDuration(minutes) {
    return `${Math.floor(minutes / 60)}j ${minutes % 60}m`;
}

function renderGamingLog() {
    const sessions = JSON.parse(localStorage.getItem(gamingStorageKey()) || '[]');
    let migrated = false;
    sessions.forEach((item, index) => {
        if (!item.id) {
            item.id = `${item.createdAt || Date.now()}-${index}`;
            migrated = true;
        }
    });
    if (migrated) localStorage.setItem(gamingStorageKey(), JSON.stringify(sessions));
    const total = sessions.reduce((sum, item) => sum + Number(item.duration || 0), 0);
    const exp = getGamingExp();
    document.getElementById('gaming-player-name').textContent = activePlayerName.toUpperCase();
    document.getElementById('gaming-total').innerHTML = `${formatGamingDuration(total).replace('j', '<span>j').replace('m', 'm</span>')}`;
    document.getElementById('gaming-session-count').textContent = sessions.length;
    document.getElementById('gaming-exp-total').innerHTML = `${exp} <span>EXP</span>`;
    document.getElementById('gaming-exp-bar').style.width = `${Math.min(100, Math.max(10, exp % 100))}%`;
    document.getElementById('gaming-mini-exp-bar').style.width = `${Math.min(100, Math.max(10, exp % 100))}%`;
    document.getElementById('gaming-exp-label').textContent = `${Math.min(100, Math.max(10, exp % 100))}% EXP`;
    const list = document.getElementById('gaming-history-list');
    const query = (document.getElementById('gaming-search')?.value || '').trim().toLowerCase();
    const selectedDate = document.getElementById('dashboard-gaming-date')?.value || localDateValue();
    const filtered = sessions.filter(item => (showGamingHistory || getGamingDate(item) === selectedDate) && `${item.game} ${item.session} ${item.achievement}`.toLowerCase().includes(query));
    const dateGroups = new Map();
    filtered.forEach(item => {
        const date = getGamingDate(item);
        if (!dateGroups.has(date)) dateGroups.set(date, new Map());
        const hour = getGamingHour(item);
        if (!dateGroups.get(date).has(hour)) dateGroups.get(date).set(hour, []);
        dateGroups.get(date).get(hour).push(item);
    });
    list.innerHTML = dateGroups.size ? [...dateGroups.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([date, hourGroups]) => {
        const dayItems = [...hourGroups.values()].flat();
        const duration = dayItems.reduce((sum, item) => sum + Number(item.duration || 0), 0);
        const hours = [...hourGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([hour, items]) => `<section class="dashboard-recap-hour"><h3><i class="fa-regular fa-clock"></i> ${escapeHtml(hour)}</h3>${items.map(item => `<div class="gaming-entry"><div class="entry-game"><span class="game-badge"><i class="fa-solid fa-gamepad"></i></span><div><strong>${escapeHtml(item.game)}</strong><small>${escapeHtml(item.session)}${item.achievement ? ` · ${escapeHtml(item.achievement)}` : ''}</small><time>${escapeHtml(getGamingDate(item))} · ${escapeHtml(getGamingHour(item))} · +${item.exp || Math.max(10, Number(item.duration || 0) * 2)} EXP</time></div></div><div class="entry-actions"><b>${Number(item.duration)}m</b><button type="button" data-gaming-action="edit" data-session-id="${escapeHtml(item.id)}" title="Edit sesi" aria-label="Edit ${escapeHtml(item.game)}"><i class="fa-solid fa-pen"></i></button><button type="button" data-gaming-action="delete" data-session-id="${escapeHtml(item.id)}" title="Hapus sesi" aria-label="Hapus ${escapeHtml(item.game)}"><i class="fa-solid fa-trash-can"></i></button></div></div>`).join('')}</section>`).join('');
        return `<section class="dashboard-recap-day"><header><strong>${escapeHtml(new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</strong><span>${dayItems.length} sesi · ${formatGamingDuration(duration)}</span></header>${hours}</section>`;
    }).join('') : `<p class="empty-state">${query ? 'Tidak ada log yang cocok.' : 'Belum ada sesi pada tanggal ini.'}</p>`;
    const historyButton = document.getElementById('gaming-history-toggle');
    if (historyButton) historyButton.textContent = showGamingHistory ? 'Tampilkan tanggal terpilih' : 'Riwayat';
}

function getGamingDate(item) {
    if (item.date) return item.date;
    const date = new Date(item.recordedAt || item.createdAt || Date.now());
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getGamingHour(item) {
    const scheduled = String(item.session || '').match(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\b/);
    if (scheduled) return `${scheduled[1].padStart(2, '0')}:${scheduled[2]}`;
    return new Date(item.recordedAt || item.createdAt || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function loadWorldSignals() {
    const weatherDetail = document.getElementById('weather-detail');
    const weatherStatus = document.getElementById('weather-status');
    const stockDetail = document.getElementById('stock-detail');
    const stockStatus = document.getElementById('stock-status');
    try {
        const data = await apiRequest('/api/market');
        if (data.weather) {
            document.getElementById('weather-temp').textContent = `${data.weather.temp}°C`;
            weatherDetail.textContent = `${data.weather.description} · terasa ${data.weather.feelsLike}°C`;
        } else throw new Error('Weather unavailable');
        weatherStatus.textContent = 'LIVE';
    } catch {
        document.getElementById('weather-temp').textContent = '28°C';
        weatherDetail.textContent = 'Jakarta · data offline';
        weatherStatus.textContent = 'OFFLINE';
        weatherStatus.classList.add('loading');
    }
    try {
        const data = await apiRequest('/api/market');
        if (data.stock) {
            document.getElementById('stock-value').textContent = Number(data.stock.value).toLocaleString('id-ID', { maximumFractionDigits: 2 });
            stockDetail.textContent = `${data.stock.previousClose ? `${(data.stock.value - data.stock.previousClose).toFixed(2)} poin hari ini` : 'Pasar Indonesia'}`;
        } else throw new Error('Stock unavailable');
        stockStatus.textContent = 'LIVE';
    } catch {
        document.getElementById('stock-value').textContent = 'IHSG';
        stockDetail.textContent = 'Data pasar tersedia saat online';
        stockStatus.textContent = 'OFFLINE';
        stockStatus.classList.add('loading');
    }
}

function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID') + ' WIB';
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    
    document.getElementById('digital-clock').innerText = timeString;
    document.getElementById('current-date').innerText = now.toLocaleDateString('id-ID', options);

    const dashboardClock = document.getElementById('dashboard-clock');
    const dashboardDate = document.getElementById('dashboard-date');
    if (dashboardClock) dashboardClock.innerText = now.toLocaleTimeString('id-ID');
    if (dashboardDate) dashboardDate.innerText = now.toLocaleDateString('id-ID', options);
    updateDashboard(now);

    highlightCurrentSlot(now.getHours());
}

async function loadTodayJournal() {
    const todayStr = selectedJournalDate();
    let parsed = null;

    if (currentPlayer) {
        const result = await apiRequest(`/api/journal?date=${todayStr}`);
        parsed = result.journal;
    } else {
        const savedToday = localStorage.getItem(`tc_journal_${todayStr}`);
        parsed = savedToday ? JSON.parse(savedToday) : null;
    }

    if (parsed) {
        activeJournalCreatedAt = parsed.createdAt || parsed.updatedAt || new Date().toISOString();
        activeSlots = parsed.slots;
        document.getElementById('ref-wins').value = parsed.reflection.wins || '';
        document.getElementById('ref-blockers').value = parsed.reflection.blockers || '';
        document.getElementById('ref-tomorrow').value = parsed.reflection.tomorrow || '';
    } else {
        activeJournalCreatedAt = new Date().toISOString();
        activeSlots = defaultSlots;
        document.getElementById('ref-wins').value = '';
        document.getElementById('ref-blockers').value = '';
        document.getElementById('ref-tomorrow').value = '';
    }

    renderJournalSlots();
}

function renderJournalSlots() {
    const container = document.getElementById('journal-slots-container');
    container.innerHTML = '';

    activeSlots.forEach((slot, index) => {
        const slotEl = document.createElement('div');
        slotEl.className = 'journal-slot';
        slotEl.setAttribute('data-cat', slot.cat);
        slotEl.setAttribute('data-hour', slot.startHour);

        slotEl.innerHTML = `
            <div class="slot-top">
                <div class="slot-title-group">
                    <span class="time-label">${slot.time}</span>
                    <span class="plan-label">${slot.plan}</span>
                </div>
                <select class="energy-select" onchange="updateEnergy(${index}, this.value)">
                    <option value="Tinggi" ${slot.energy === 'Tinggi' ? 'selected' : ''}>⚡ Energy: Tinggi</option>
                    <option value="Sedang" ${slot.energy === 'Sedang' ? 'selected' : ''}>🙂 Energy: Sedang</option>
                    <option value="Lelah" ${slot.energy === 'Lelah' ? 'selected' : ''}>🪫 Energy: Lelah</option>
                </select>
            </div>
            <input type="text" class="log-input" placeholder="Tulis apa yang sebenarnya dikerjakan / catatan singkat..." value="${slot.log || ''}" onchange="updateLog(${index}, this.value)">
        `;

        container.appendChild(slotEl);
    });

    highlightCurrentSlot(new Date().getHours());
}

function highlightCurrentSlot(currentHour) {
    const slots = document.querySelectorAll('.journal-slot');
    slots.forEach(slot => {
        const slotHour = parseInt(slot.getAttribute('data-hour'));
        if (slotHour === currentHour) {
            slot.classList.add('active-slot');
        } else {
            slot.classList.remove('active-slot');
        }
    });
}

function updateLog(index, value) {
    activeSlots[index].log = value;
    autoSaveToday();
}

function updateEnergy(index, value) {
    activeSlots[index].energy = value;
    autoSaveToday();
}

async function autoSaveToday() {
    const todayStr = selectedJournalDate();
    const updatedAt = new Date().toISOString();
    const dataToSave = {
        date: todayStr,
        createdAt: activeJournalCreatedAt || updatedAt,
        updatedAt,
        slots: activeSlots,
        reflection: {
            wins: document.getElementById('ref-wins').value,
            blockers: document.getElementById('ref-blockers').value,
            tomorrow: document.getElementById('ref-tomorrow').value
        }
    };
    if (currentPlayer) {
        await apiRequest('/api/journal', { method: 'PUT', body: JSON.stringify(dataToSave) });
    } else {
        localStorage.setItem(`tc_journal_${todayStr}`, JSON.stringify(dataToSave));
    }
}

async function saveFullJournal() {
    await autoSaveToday();
    alert("Jurnal hari ini berhasil disimpan ke dalam riwayat!");
    await renderHistory();
}

async function renderHistory() {
    const historyContainer = document.getElementById('history-container');
    historyContainer.innerHTML = '';

    let entries;
    if (currentPlayer) {
        const result = await apiRequest('/api/history');
        entries = result.history.map(entry => ({ key: entry.date, date: entry.date }));
    } else {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('tc_journal_')).sort().reverse();
        entries = keys.map(key => ({ key, date: JSON.parse(localStorage.getItem(key)).date }));
    }
    if (!showAllJournalHistory) entries = entries.filter(entry => entry.date === selectedJournalDate());

    if (entries.length === 0) {
        historyContainer.innerHTML = `<div class="history-empty">${showAllJournalHistory ? 'Belum ada riwayat jurnal.' : 'Belum ada jurnal pada tanggal ini.'}</div>`;
        document.getElementById('journal-history-toggle').textContent = showAllJournalHistory ? 'Tanggal terpilih' : 'Riwayat';
        return;
    }

    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <span class="history-date"><i class="fa-regular fa-calendar"></i> ${escapeHtml(entry.date)}</span>
            <div class="history-actions"><button type="button" data-journal-action="edit" data-journal-date="${escapeHtml(entry.date)}" title="Edit jurnal" aria-label="Edit jurnal ${escapeHtml(entry.date)}"><i class="fa-solid fa-pen"></i></button><button type="button" data-journal-action="delete" data-journal-date="${escapeHtml(entry.date)}" title="Hapus jurnal" aria-label="Hapus jurnal ${escapeHtml(entry.date)}"><i class="fa-solid fa-trash"></i></button></div>
        `;
        historyContainer.appendChild(item);
    });
    document.getElementById('journal-history-toggle').textContent = showAllJournalHistory ? 'Tanggal terpilih' : 'Riwayat';
}

async function deleteJournalDate(date) {
    if (currentPlayer) {
        await apiRequest(`/api/journal?date=${encodeURIComponent(date)}`, { method: 'DELETE' });
    } else {
        localStorage.removeItem(`tc_journal_${date}`);
    }
    if (date === selectedJournalDate()) {
        activeJournalCreatedAt = null;
        activeSlots = defaultSlots.map(slot => ({ ...slot, log: '' }));
        document.getElementById('ref-wins').value = '';
        document.getElementById('ref-blockers').value = '';
        document.getElementById('ref-tomorrow').value = '';
        renderJournalSlots();
    }
    await renderHistory();
}

async function viewHistory(key) {
    if (currentPlayer) {
        const result = await apiRequest(`/api/journal?date=${encodeURIComponent(key)}`);
        const entry = result.journal;
        document.getElementById('journal-entry-date').value = entry.date;
        activeJournalCreatedAt = entry.createdAt || entry.updatedAt || null;
        activeSlots = entry.slots;
        document.getElementById('ref-wins').value = entry.reflection.wins || '';
        document.getElementById('ref-blockers').value = entry.reflection.blockers || '';
        document.getElementById('ref-tomorrow').value = entry.reflection.tomorrow || '';
        renderJournalSlots();
        alert(`Menampilkan jurnal tanggal: ${entry.date}`);
        return;
    }
    const storageKey = key.startsWith('tc_journal_') ? key : `tc_journal_${key}`;
    const entry = JSON.parse(localStorage.getItem(storageKey));
    document.getElementById('journal-entry-date').value = entry.date;
    activeJournalCreatedAt = entry.createdAt || entry.updatedAt || null;
    activeSlots = entry.slots;
    document.getElementById('ref-wins').value = entry.reflection.wins || '';
    document.getElementById('ref-blockers').value = entry.reflection.blockers || '';
    document.getElementById('ref-tomorrow').value = entry.reflection.tomorrow || '';
    renderJournalSlots();
    alert(`Menampilkan jurnal tanggal: ${entry.date}`);
}

async function apiRequest(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Server tidak dapat dihubungi.');
    return result;
}

function updateDashboard(now = new Date()) {
    const hour = now.getHours();
    const greeting = getGreeting(hour);
    const name = document.body.dataset.playerName || currentPlayer?.name || activePlayerName;
    const fullGreeting = document.getElementById('dashboard-greeting-full');
    if (fullGreeting) fullGreeting.textContent = `${greeting}, ${name}!`;
    const activeSlot = defaultSlots.find((slot, index) => {
        const nextSlot = defaultSlots[index + 1];
        return hour >= slot.startHour && (!nextSlot || hour < nextSlot.startHour);
    }) || defaultSlots[defaultSlots.length - 1];
    const currentTask = document.getElementById('current-task');
    const currentTaskTime = document.getElementById('current-task-time');
    if (currentTask) currentTask.textContent = activeSlot ? activeSlot.plan : 'Tidak ada quest aktif';
    if (currentTaskTime) currentTaskTime.textContent = activeSlot ? `Saat ini · ${activeSlot.time} WIB` : 'Waktu bebas';
    const focusExp = Number(localStorage.getItem(`tc_focus_exp_${currentPlayer?.id || activePlayerName}`) || 0);
    const expPercent = Math.min(100, Math.max(25, focusExp % 100 || 25));
    document.getElementById('dashboard-energy-bar')?.style.setProperty('width', '82%');
    document.getElementById('dashboard-exp-bar')?.style.setProperty('width', `${expPercent}%`);
    const expLabel = document.getElementById('dashboard-exp-label');
    if (expLabel) expLabel.textContent = `${expPercent}% · ${focusExp} EXP`;
}

function toggleFocusTimer() {
    if (focusTimerId) {
        stopFocusTimer();
        return;
    }
    const startButton = document.getElementById('focus-start');
    startButton.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSE FOCUS';
    document.getElementById('focus-status').textContent = 'FOCUS ACTIVE · STAY IN THE ZONE';
    focusTimerId = setInterval(() => {
        focusSeconds -= 1;
        renderFocusTimer();
        if (focusSeconds <= 0) completeFocusSession();
    }, 1000);
}

function stopFocusTimer() {
    clearInterval(focusTimerId);
    focusTimerId = null;
    const startButton = document.getElementById('focus-start');
    if (startButton) startButton.innerHTML = '<i class="fa-solid fa-play"></i> START FOCUS';
    const status = document.getElementById('focus-status');
    if (status && focusSeconds > 0) status.textContent = 'PAUSED · RESUME WHEN READY';
}

function resetFocusTimer() {
    stopFocusTimer();
    focusSeconds = 25 * 60;
    renderFocusTimer();
    document.getElementById('focus-status').textContent = 'READY · +50 EXP saat selesai';
}

function renderFocusTimer() {
    const minutes = Math.floor(Math.max(0, focusSeconds) / 60).toString().padStart(2, '0');
    const seconds = (Math.max(0, focusSeconds) % 60).toString().padStart(2, '0');
    document.getElementById('focus-timer').textContent = `${minutes}:${seconds}`;
}

function completeFocusSession() {
    stopFocusTimer();
    const key = `tc_focus_exp_${currentPlayer?.id || activePlayerName}`;
    localStorage.setItem(key, String(Number(localStorage.getItem(key) || 0) + 50));
    focusSeconds = 25 * 60;
    renderFocusTimer();
    document.getElementById('focus-status').textContent = 'QUEST COMPLETE · +50 EXP ACQUIRED';
    updateDashboard();
}

function showLockedMessage(message) {
    document.getElementById('locked-message').textContent = message;
    setTimeout(() => { document.getElementById('locked-message').textContent = ''; }, 3000);
}

async function resetDay() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!confirm('Reset semua log dan refleksi hari ini?')) return;
    activeSlots = structuredClone(defaultSlots);
    document.getElementById('ref-wins').value = '';
    document.getElementById('ref-blockers').value = '';
    document.getElementById('ref-tomorrow').value = '';
    await autoSaveToday();
    await renderHistory();
    showLockedMessage(`Quest ${todayStr} siap dimulai ulang.`);
}

function getGreeting(hour) {
    return hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam';
}

function setupProfileLink() {
    const tools = document.querySelector('.dashboard-tools');
    if (!tools) return;
    const link = document.createElement('a');
    link.className = 'profile-link';
    link.href = 'profile.html';
    link.title = 'Profil akun';
    link.setAttribute('aria-label', 'Profil akun');
    link.innerHTML = '<i class="fa-regular fa-id-card"></i><span>Profil</span>';
    tools.insertBefore(link, document.getElementById('dashboard-theme-toggle'));
}