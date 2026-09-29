document.addEventListener('DOMContentLoaded', () => {
    const module = document.body.dataset.module;
    const player = localStorage.getItem('tc_player_name') || 'Player';
    migrateLegacyModuleData();
    document.querySelectorAll('[data-player-name]').forEach(element => { element.textContent = player.toUpperCase(); });
    document.querySelectorAll('[data-now]').forEach(element => { element.textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); });
    const topActions = document.querySelector('.top-actions');
    if (topActions) {
        const profileLink = document.createElement('a');
        profileLink.className = 'back-button profile-back-button';
        profileLink.href = 'profile.html';
        profileLink.title = 'Profil akun';
        profileLink.innerHTML = '<i class="fa-regular fa-id-card"></i> Profil';
        topActions.insertBefore(profileLink, topActions.querySelector('.back-button'));
    }
    if (module === 'journal') setupJournal();
    if (module === 'study') setupStudy();
    if (module === 'gaming') setupGaming();
    if (module === 'gold') setupGold();
});

const getModulePlayerId = () => {
    try {
        const player = JSON.parse(localStorage.getItem('tc_authenticated_player') || 'null');
        return player?.name ? `name-${encodeURIComponent(player.name.trim().toLowerCase())}` : player?.id || 'local';
    } catch {
        return 'local';
    }
};
const storage = key => `tc_module_${getModulePlayerId()}_${key}`;
const read = key => JSON.parse(localStorage.getItem(storage(key)) || '[]');
const write = (key, value) => localStorage.setItem(storage(key), JSON.stringify(value));
const escapeText = value => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const money = value => Number(value || 0).toLocaleString('id-ID');
const localDateValue = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const createEntryId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const entryDate = item => item.date || item.created?.slice(0, 10) || localDateValue();
const entryTimestamp = item => item.recordedAt || item.createdAt || (typeof item.id === 'number' ? new Date(item.id).toISOString() : '');
const entryTime = item => {
    const source = `${item.time || ''} ${item.session || ''}`;
    const plannedTime = source.match(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\b/);
    if (plannedTime) return `${plannedTime[1].padStart(2, '0')}:${plannedTime[2]}`;
    const timestamp = entryTimestamp(item);
    return timestamp ? new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }) : '00:00';
};
const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function migrateLegacyModuleData() {
    const player = JSON.parse(localStorage.getItem('tc_authenticated_player') || 'null');
    if (!player) return;
    ['journal', 'study', 'gaming', 'gold'].forEach(key => {
        const legacyKey = `tc_module_${key}`;
        const scopedKey = storage(key);
        const oldScopedKey = player.id ? `tc_module_${player.id}_${key}` : null;
        const legacyData = localStorage.getItem(legacyKey);
        const oldScopedData = oldScopedKey ? localStorage.getItem(oldScopedKey) : null;
        if (!localStorage.getItem(scopedKey) && (oldScopedData || legacyData)) {
            localStorage.setItem(scopedKey, oldScopedData || legacyData);
        }
    });
}

function addDateInput(form, moduleName) {
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.htmlFor = `${moduleName}-entry-date`;
    label.textContent = 'TANGGAL CATATAN';
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.name = 'entryDate';
    input.type = 'date';
    input.required = true;
    input.value = localDateValue();
    field.append(label, input);
    form.prepend(field);
}

function setupRecordModule(config) {
    const form = document.querySelector(config.form);
    const list = document.querySelector(config.list);
    const dateInput = form.elements.entryDate;
    const submitButton = form.querySelector('[type="submit"]');
    const submitMarkup = submitButton.innerHTML;
    const historyButton = document.createElement('button');
    const cancelButton = document.createElement('button');
    let editingId = null;
    let activeDate = localDateValue();
    let showHistory = false;

    historyButton.type = 'button';
    historyButton.className = 'history-toggle';
    historyButton.textContent = 'Riwayat';
    list.before(historyButton);
    cancelButton.type = 'button';
    cancelButton.className = 'edit-cancel-button';
    cancelButton.textContent = 'Batal edit';
    cancelButton.hidden = true;
    submitButton.after(cancelButton);

    const resetForm = (date = localDateValue()) => {
        editingId = null;
        form.reset();
        dateInput.value = date;
        activeDate = dateInput.value;
        submitButton.innerHTML = submitMarkup;
        cancelButton.hidden = true;
        render();
    };

    const render = () => {
        const allEntries = read(config.key);
        const searchTerm = config.search ? config.search.value.trim().toLowerCase() : '';
        const filtered = allEntries.filter(item => (showHistory || entryDate(item) === activeDate) && (!searchTerm || config.searchable(item).toLowerCase().includes(searchTerm)));
        const byDate = new Map();
        filtered.forEach(item => {
            const date = entryDate(item);
            if (!byDate.has(date)) byDate.set(date, new Map());
            const byHour = byDate.get(date);
            const hour = entryTime(item);
            if (!byHour.has(hour)) byHour.set(hour, []);
            byHour.get(hour).push(item);
        });
        const dateGroups = [...byDate.entries()].sort(([left], [right]) => right.localeCompare(left));
        list.innerHTML = dateGroups.length ? dateGroups.map(([date, hourGroups]) => {
            const dayItems = [...hourGroups.values()].flat();
            const hourMarkup = [...hourGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([hour, items]) => `
                <section class="recap-hour">
                    <h4><i class="fa-regular fa-clock"></i> ${escapeText(hour)}</h4>
                    ${items.sort((left, right) => entryTime(left).localeCompare(entryTime(right))).map(item => config.renderItem(item)).join('')}
                </section>`).join('');
            return `<section class="recap-day"><header class="recap-day-header"><div><strong>${escapeText(formatDate(date))}</strong><small>${dayItems.length} catatan</small></div><span class="recap-summary">${config.summarize(dayItems)}</span></header>${hourMarkup}</section>`;
        }).join('') : `<p class="muted">${showHistory ? 'Belum ada riwayat.' : 'Belum ada catatan pada tanggal ini.'}</p>`;
        historyButton.textContent = showHistory ? 'Tampilkan tanggal terpilih' : 'Riwayat';
    };

    form.addEventListener('submit', event => {
        event.preventDefault();
        const data = new FormData(form);
        const entries = read(config.key);
        const updatedAt = new Date().toISOString();
        const values = config.readFields(data);
        const existingIndex = entries.findIndex(item => String(item.id) === String(editingId));
        if (existingIndex >= 0) {
            entries[existingIndex] = { ...entries[existingIndex], ...values, date: data.get('entryDate'), updatedAt };
        } else {
            entries.push({ id: createEntryId(), ...values, date: data.get('entryDate'), recordedAt: updatedAt });
        }
        write(config.key, entries);
        showHistory = false;
        resetForm(String(data.get('entryDate')));
    });

    dateInput.addEventListener('change', () => {
        activeDate = dateInput.value || localDateValue();
        showHistory = false;
        render();
    });
    historyButton.addEventListener('click', () => {
        showHistory = !showHistory;
        render();
    });
    cancelButton.addEventListener('click', resetForm);
    list.addEventListener('click', event => {
        const actionButton = event.target.closest('[data-record-action]');
        if (!actionButton) return;
        const id = actionButton.dataset.recordId;
        const entries = read(config.key);
        const item = entries.find(entry => String(entry.id) === id);
        if (!item) return;
        if (actionButton.dataset.recordAction === 'edit') {
            editingId = id;
            dateInput.value = entryDate(item);
            activeDate = dateInput.value;
            showHistory = false;
            config.fields.forEach(field => { form.elements.namedItem(field).value = item[field] ?? ''; });
            submitButton.textContent = 'Simpan perubahan';
            cancelButton.hidden = false;
            render();
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        if (actionButton.dataset.recordAction === 'delete' && window.confirm('Hapus catatan ini?')) {
            write(config.key, entries.filter(entry => String(entry.id) !== id));
            if (String(editingId) === id) resetForm();
            else render();
        }
    });
    config.search?.addEventListener('input', render);
    render();
}

function recordActions(item) {
    const id = escapeText(item.id);
    return `<div class="record-actions"><button type="button" class="record-action edit-record" data-record-action="edit" data-record-id="${id}" title="Edit catatan" aria-label="Edit catatan"><i class="fa-solid fa-pen"></i></button><button type="button" class="record-action delete-record" data-record-action="delete" data-record-id="${id}" title="Hapus catatan" aria-label="Hapus catatan"><i class="fa-solid fa-trash"></i></button></div>`;
}

function setupJournal() {
    const form = document.querySelector('#journal-entry-form');
    addDateInput(form, 'journal');
    setupRecordModule({
        key: 'journal', form: '#journal-entry-form', list: '#journal-list', fields: ['title', 'time', 'category', 'note'],
        readFields: data => Object.fromEntries(['title', 'time', 'category', 'note'].map(field => [field, data.get(field)])),
        searchable: item => `${item.title} ${item.category} ${item.note}`,
        summarize: items => `${items.length} aktivitas`,
        renderItem: item => `<article class="list-item"><div><strong>${escapeText(item.title)}</strong><small>${escapeText(item.category)} · ${escapeText(item.note)}</small></div>${recordActions(item)}</article>`
    });
}

function setupStudy() {
    const form = document.querySelector('#study-form');
    addDateInput(form, 'study');
    setupRecordModule({
        key: 'study', form: '#study-form', list: '#study-list', fields: ['topic', 'type', 'note'],
        readFields: data => ({ topic: data.get('topic'), type: data.get('type'), note: data.get('note'), exp: 25 }),
        searchable: item => `${item.topic} ${item.type} ${item.note}`,
        summarize: items => `+${items.reduce((sum, item) => sum + Number(item.exp || 0), 0)} EXP`,
        renderItem: item => `<article class="list-item"><div><strong>${escapeText(item.topic)}</strong><small>${escapeText(item.type)} · ${escapeText(item.note)}</small></div><div class="record-item-end"><span class="badge status-gold">+${Number(item.exp || 0)} EXP</span>${recordActions(item)}</div></article>`
    });
}

function setupGaming() {
    const form = document.querySelector('#gaming-form');
    const search = document.querySelector('#gaming-search');
    addDateInput(form, 'gaming');
    setupRecordModule({
        key: 'gaming', form: '#gaming-form', list: '#gaming-list', search, fields: ['game', 'session', 'duration', 'achievement'],
        readFields: data => ({ game: data.get('game'), session: data.get('session'), duration: data.get('duration'), achievement: data.get('achievement') }),
        searchable: item => `${item.game} ${item.session} ${item.achievement}`,
        summarize: items => `${items.reduce((sum, item) => sum + Number(item.duration || 0), 0)} menit`,
        renderItem: item => `<article class="list-item"><div><strong>${escapeText(item.game)}</strong><small>${escapeText(item.session)} · ${escapeText(item.achievement || 'Tanpa achievement')}</small></div><div class="record-item-end"><span class="badge status-pink">${Number(item.duration)}m</span>${recordActions(item)}</div></article>`
    });
}

function setupGold() {
    const form = document.querySelector('#gold-form');
    addDateInput(form, 'gold');
    setupRecordModule({
        key: 'gold', form: '#gold-form', list: '#gold-list', fields: ['title', 'type', 'amount', 'category'],
        readFields: data => ({ title: data.get('title'), type: data.get('type'), amount: data.get('amount'), category: data.get('category') }),
        searchable: item => `${item.title} ${item.type} ${item.category}`,
        summarize: items => {
            const inflow = items.filter(item => item.type === 'inflow').reduce((sum, item) => sum + Number(item.amount), 0);
            const outflow = items.filter(item => item.type === 'outflow').reduce((sum, item) => sum + Number(item.amount), 0);
            return `Masuk Rp ${money(inflow)} · Keluar Rp ${money(outflow)}`;
        },
        renderItem: item => `<article class="list-item"><div><strong>${escapeText(item.title)}</strong><small>${escapeText(item.category)}</small></div><div class="record-item-end"><span class="badge ${item.type === 'inflow' ? 'status-safe' : 'status-danger'}">${item.type === 'inflow' ? '+' : '-'} Rp ${money(item.amount)}</span>${recordActions(item)}</div></article>`
    });
}

