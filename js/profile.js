const profileRequest = async (path, options = {}) => {
    const response = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || 'Permintaan profil gagal.');
    }
    return result;
};

const profileForm = document.getElementById('profile-form');
const settingsForm = document.getElementById('settings-form');
const passwordForm = document.getElementById('password-form');
let avatarData = '';
let coverData = '';
const escapeText = value => String(value).replace(/[&<>\'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function cachedPlayer() {
    try {
        return JSON.parse(localStorage.getItem('tc_authenticated_player') || 'null');
    } catch {
        return null;
    }
}

function accountStorageId(player = cachedPlayer()) {
    const name = player?.name || player?.username;
    return name ? `name-${encodeURIComponent(name.trim().toLowerCase())}` : 'local';
}

function profileStorageKey(player) {
    return `tc_profile_${accountStorageId(player)}`;
}

function readCachedProfile(player) {
    try {
        return JSON.parse(localStorage.getItem(profileStorageKey(player)) || 'null');
    } catch {
        return null;
    }
}

function cacheProfile(profile, activity, synced = true) {
    try {
        localStorage.setItem(profileStorageKey(profile), JSON.stringify({ profile, activity, synced, updatedAt: new Date().toISOString() }));
        return true;
    } catch {
        return false;
    }
}

function profileIsEmpty(profile) {
    return !profile.bio && !profile.birthDate && !profile.gender && !profile.email && !profile.phone &&
        !profile.avatarData && !profile.coverData && profile.visibility === 'private' && profile.language === 'id' &&
        profile.notifications === true && (!profile.fullName || profile.fullName === profile.username);
}

function profilePayload(profile) {
    return Object.fromEntries(['fullName', 'bio', 'birthDate', 'gender', 'email', 'phone', 'visibility', 'language', 'notifications', 'avatarData', 'coverData'].map(key => [key, profile[key]]));
}

function setStatus(id, message, state = '') {
    const element = document.getElementById(id);
    element.textContent = message;
    element.dataset.state = state;
}

function showImage(file, target, maxWidth, maxHeight) {
    if (!file) return Promise.resolve('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        throw new Error('Pilih gambar JPEG, PNG, atau WebP maksimal 5 MB.');
    }
    return createImageBitmap(file).then(async bitmap => {
        let scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
        const canvas = document.createElement('canvas');
        let blob;
        for (let attempt = 0; attempt < 7; attempt += 1) {
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', Math.max(.48, .82 - attempt * .06)));
            if (blob && blob.size <= 16 * 1024) break;
            scale *= .78;
        }
        bitmap.close();
        if (!blob || blob.size > 16 * 1024) throw new Error('Gambar terlalu besar setelah diperkecil. Pilih gambar lain.');
        const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Gambar tidak dapat dibaca.'));
            reader.readAsDataURL(blob);
        });
        target.style.backgroundImage = `url("${data}")`;
        target.classList.add('has-image');
        const fallback = target.querySelector('span');
        if (fallback) fallback.hidden = true;
        return data;
    }).catch(error => {
        if (error instanceof Error) throw error;
        throw new Error('Gambar tidak dapat diproses di browser ini.');
    });
}

function setImage(target, data, fallbackText = '') {
    const fallback = target.id === 'avatar-preview' ? document.getElementById('avatar-initials') : null;
    if (data) {
        target.style.backgroundImage = `url("${data}")`;
        target.classList.add('has-image');
        if (fallback) fallback.hidden = true;
    } else {
        target.style.backgroundImage = '';
        target.classList.remove('has-image');
        if (fallback) {
            fallback.textContent = fallbackText;
            fallback.hidden = false;
        }
    }
}

function renderProfile(profile, activity) {
    profileForm.elements.fullName.value = profile.fullName || profile.username;
    profileForm.elements.username.value = profile.username;
    profileForm.elements.bio.value = profile.bio || '';
    profileForm.elements.birthDate.value = profile.birthDate || '';
    profileForm.elements.gender.value = profile.gender || '';
    profileForm.elements.email.value = profile.email || '';
    profileForm.elements.phone.value = profile.phone || '';
    settingsForm.elements.visibility.value = profile.visibility || 'private';
    settingsForm.elements.language.value = profile.language || 'id';
    settingsForm.elements.notifications.checked = Boolean(profile.notifications);
    avatarData = profile.avatarData || '';
    coverData = profile.coverData || '';

    const initials = (profile.fullName || profile.username).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    document.getElementById('identity-name').textContent = profile.fullName || profile.username;
    document.getElementById('identity-username').textContent = `@${profile.username}`;
    document.getElementById('avatar-initials').textContent = initials || 'TC';
    document.getElementById('member-since').textContent = profile.createdAt ? new Date(`${profile.createdAt.replace(' ', 'T')}Z`).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }) : '-';
    setImage(document.getElementById('avatar-preview'), avatarData, initials || 'TC');
    setImage(document.getElementById('cover-preview'), coverData);
    renderActivity(activity, profile);
}

function migrateLegacyActivity(player) {
    const accountId = accountStorageId(player);
    ['journal', 'study', 'gaming', 'gold'].forEach(key => {
        const legacyKey = `tc_module_${key}`;
        const scopedKey = `tc_module_${accountId}_${key}`;
        const oldScopedKey = player.playerId ? `tc_module_${player.playerId}_${key}` : null;
        const legacyData = localStorage.getItem(legacyKey);
        const oldScopedData = oldScopedKey ? localStorage.getItem(oldScopedKey) : null;
        if (!localStorage.getItem(scopedKey) && (oldScopedData || legacyData)) localStorage.setItem(scopedKey, oldScopedData || legacyData);
    });
    [['tc_gaming_', 'tc_gaming_'], ['tc_gaming_exp_', 'tc_gaming_exp_'], ['tc_focus_exp_', 'tc_focus_exp_']].forEach(([prefix, stablePrefix]) => {
        if (!player.playerId) return;
        const oldKey = `${prefix}${player.playerId}`;
        const stableKey = `${stablePrefix}${accountId}`;
        if (!localStorage.getItem(stableKey) && localStorage.getItem(oldKey)) localStorage.setItem(stableKey, localStorage.getItem(oldKey));
    });
}

function activityDate(item) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) return item.date;
    const timestamp = item.recordedAt || item.updatedAt || item.createdAt || (typeof item.id === 'number' ? item.id : null);
    const date = timestamp ? new Date(timestamp) : new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function activityTime(item) {
    const source = `${item.time || ''} ${item.session || ''}`;
    const planned = source.match(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\b/);
    if (planned) return `${planned[1].padStart(2, '0')}:${planned[2]}`;
    const date = new Date(item.recordedAt || item.updatedAt || item.createdAt || Date.now());
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function buildLocalActivity(player) {
    const accountId = accountStorageId(player);
    const definitions = {
        journal: { title: item => item.title || 'Aktivitas jurnal', detail: item => `${item.category || 'Jurnal'} · ${item.note || ''}` },
        study: { title: item => item.topic || 'Catatan belajar', detail: item => `${item.type || 'Belajar'} · +${item.exp || 0} EXP` },
        gaming: { title: item => item.game || 'Sesi gaming', detail: item => `${item.session || 'Gaming'} · ${item.duration || 0} menit` },
        gold: { title: item => item.title || 'Transaksi', detail: item => `${item.category || 'Keuangan'} · ${item.type === 'inflow' ? '+' : '-'} Rp ${Number(item.amount || 0).toLocaleString('id-ID')}` }
    };
    const localItems = [];
    Object.entries(definitions).forEach(([key, definition]) => {
        let records = [];
        try {
            records = JSON.parse(localStorage.getItem(`tc_module_${accountId}_${key}`) || '[]');
        } catch {
            records = [];
        }
        records.forEach(item => localItems.push({
            date: activityDate(item),
            time: activityTime(item),
            title: definition.title(item),
            detail: definition.detail(item),
            kind: key
        }));
    });
    let sessions = [];
    try {
        sessions = JSON.parse(localStorage.getItem(`tc_gaming_${accountId}`) || '[]');
    } catch {
        sessions = [];
    }
    sessions.forEach(item => localItems.push({
        date: activityDate(item),
        time: activityTime(item),
        title: item.game || 'Sesi gaming',
        detail: `${item.session || 'Gaming'} · ${item.duration || 0} menit`,
        kind: 'gaming'
    }));
    return localItems;
}

function localJournalActivity(player) {
    const prefix = `tc_journal_${accountStorageId(player)}_`;
    return Object.keys(localStorage).filter(key => key.startsWith(prefix)).flatMap(key => {
        try {
            const journal = JSON.parse(localStorage.getItem(key));
            if (!journal?.date) return [];
            const slots = Array.isArray(journal.slots) ? journal.slots : [];
            const reflection = journal.reflection || {};
            return [{
                date: journal.date,
                updatedAt: journal.updatedAt || journal.createdAt || new Date().toISOString(),
                completedSlots: slots.filter(slot => typeof slot.log === 'string' && slot.log.trim()).length,
                hasReflection: Object.values(reflection).some(value => typeof value === 'string' && value.trim())
            }];
        } catch {
            return [];
        }
    });
}

function renderActivity(activity, player) {
    migrateLegacyActivity(player);
    const journalByDate = new Map(activity.map(item => [item.date, item]));
    localJournalActivity(player).forEach(item => {
        journalByDate.set(item.date, item);
    });
    const journalItems = [...journalByDate.values()].map(item => ({
        date: item.date,
        time: activityTime({ updatedAt: item.updatedAt }),
        title: 'Jurnal harian',
        detail: `${item.completedSlots} aktivitas${item.hasReflection ? ' · refleksi' : ''}`,
        kind: 'journal'
    }));
    const timeline = [...journalItems, ...buildLocalActivity(player)].sort((left, right) => `${right.date} ${right.time}`.localeCompare(`${left.date} ${left.time}`));
    const journalDates = new Set(journalItems.map(item => item.date));
    document.getElementById('journal-count').textContent = journalDates.size;
    document.getElementById('activity-count').textContent = timeline.length;
    const list = document.getElementById('activity-list');
    if (!timeline.length) {
        list.innerHTML = '<p class="empty-activity">Belum ada aktivitas yang tersimpan.</p>';
        return;
    }
    const groups = new Map();
    timeline.forEach(item => {
        if (!groups.has(item.date)) groups.set(item.date, []);
        groups.get(item.date).push(item);
    });
    list.innerHTML = [...groups.entries()].map(([date, items]) => `<section class="profile-activity-day"><header><strong>${new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong><span>${items.length} aktivitas</span></header>${items.map(item => `<article class="activity-row"><span class="activity-kind activity-${item.kind}"><i class="fa-solid ${item.kind === 'journal' ? 'fa-book-open' : item.kind === 'study' ? 'fa-graduation-cap' : item.kind === 'gaming' ? 'fa-gamepad' : 'fa-coins'}"></i></span><div><strong>${escapeText(item.title)}</strong><small>${escapeText(item.detail)}</small></div><time>${escapeText(item.time)}</time></article>`).join('')}</section>`).join('');
}

async function loadProfile() {
    const cached = readCachedProfile();
    try {
        const result = await profileRequest('/api/profile');
        let profile = result.profile;
        const activityByDate = new Map((result.activity || []).map(item => [item.date, item]));
        (cached?.activity || []).forEach(item => {
            if (!activityByDate.has(item.date)) activityByDate.set(item.date, item);
        });
        const activity = [...activityByDate.values()];
        if (cached?.profile && (cached.synced === false || profileIsEmpty(profile))) {
            profile = { ...cached.profile, playerId: result.profile.playerId, username: result.profile.username, createdAt: result.profile.createdAt };
            const synced = await profileRequest('/api/profile', {
                method: 'PUT',
                body: JSON.stringify(profilePayload(profile))
            }).then(() => true).catch(() => false);
            cacheProfile(profile, activity, synced);
        } else {
            cacheProfile(profile, activity);
        }
        renderProfile(profile, activity);
    } catch (error) {
        if (cached?.profile) {
            renderProfile(cached.profile, cached.activity || []);
            const alert = document.getElementById('profile-load-error');
            alert.textContent = 'Menampilkan salinan profil di browser. Perubahan akan disinkronkan saat server tersedia.';
            alert.hidden = false;
            return;
        }
        if (error.message) {
            const alert = document.getElementById('profile-load-error');
            alert.textContent = error.message;
            alert.hidden = false;
        }
    }
}

async function saveProfile(event) {
    event.preventDefault();
    const statusId = event.currentTarget.id === 'settings-form' ? 'settings-status' : 'profile-status';
    setStatus(statusId, 'Menyimpan...');
    const payload = {
        fullName: profileForm.elements.fullName.value.trim(),
        bio: profileForm.elements.bio.value.trim(),
        birthDate: profileForm.elements.birthDate.value,
        gender: profileForm.elements.gender.value,
        email: profileForm.elements.email.value.trim(),
        phone: profileForm.elements.phone.value.trim(),
        visibility: settingsForm.elements.visibility.value,
        language: settingsForm.elements.language.value,
        notifications: settingsForm.elements.notifications.checked,
        avatarData,
        coverData
    };
    const existingCache = readCachedProfile();
    const account = cachedPlayer();
    const profile = {
        ...existingCache?.profile,
        ...payload,
        playerId: account?.id || existingCache?.profile?.playerId,
        username: account?.name || existingCache?.profile?.username || profileForm.elements.username.value,
        createdAt: existingCache?.profile?.createdAt || ''
    };
    const activity = existingCache?.activity || [];
    cacheProfile(profile, activity, false);
    try {
        await profileRequest('/api/profile', { method: 'PUT', body: JSON.stringify(payload) });
        cacheProfile(profile, activity);
        document.getElementById('identity-name').textContent = payload.fullName;
        document.getElementById('avatar-initials').textContent = payload.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
        setStatus(statusId, 'Perubahan berhasil disimpan.', 'success');
    } catch {
        setStatus(statusId, 'Disimpan di browser. Sinkronisasi cloud akan dicoba lagi saat server tersedia.', 'success');
    }
}

async function changePassword(event) {
    event.preventDefault();
    const currentPassword = passwordForm.elements.currentPassword.value;
    const newPassword = passwordForm.elements.newPassword.value;
    if (newPassword !== passwordForm.elements.confirmPassword.value) {
        setStatus('password-status', 'Konfirmasi password baru tidak cocok.', 'error');
        return;
    }
    setStatus('password-status', 'Memperbarui password...');
    try {
        await profileRequest('/api/profile/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
        passwordForm.reset();
        setStatus('password-status', 'Password berhasil diperbarui. Sesi lain sudah dikeluarkan.', 'success');
    } catch (error) {
        setStatus('password-status', error.message, 'error');
    }
}

profileForm.addEventListener('submit', saveProfile);
settingsForm.addEventListener('submit', saveProfile);
passwordForm.addEventListener('submit', changePassword);

document.getElementById('avatar-file').addEventListener('change', async event => {
    try {
        avatarData = await showImage(event.target.files[0], document.getElementById('avatar-preview'), 512, 512);
        setStatus('profile-status', 'Foto profil siap disimpan.');
    } catch (error) {
        setStatus('profile-status', error.message, 'error');
        event.target.value = '';
    }
});

document.getElementById('cover-file').addEventListener('change', async event => {
    try {
        coverData = await showImage(event.target.files[0], document.getElementById('cover-preview'), 1400, 500);
        setStatus('profile-status', 'Foto sampul siap disimpan.');
    } catch (error) {
        setStatus('profile-status', error.message, 'error');
        event.target.value = '';
    }
});

document.getElementById('profile-logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    localStorage.removeItem('tc_authenticated_player');
    localStorage.removeItem('tc_player_name');
    localStorage.removeItem('tc_guest_active');
    window.location.href = 'login.html';
});

loadProfile();
