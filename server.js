const { createHash, randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { join, resolve, relative } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const rootDir = __dirname;
const port = Number(process.env.PORT) || 3000;
const db = new DatabaseSync(join(rootDir, 'timecraft.db'));
const app = express();
const sessionLifetime = 8 * 60 * 60 * 1000;
const bcryptRounds = 12;

db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        access_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS journals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id INTEGER NOT NULL,
        journal_date TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(player_id, journal_date),
        FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        player_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS profiles (
        player_id INTEGER PRIMARY KEY,
        full_name TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        birth_date TEXT NOT NULL DEFAULT '',
        gender TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        avatar_data TEXT NOT NULL DEFAULT '',
        cover_data TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'private',
        language TEXT NOT NULL DEFAULT 'id',
        notifications INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );
`);

const verifyLegacyPassword = (value, storedHash) => {
    if (storedHash.startsWith('scrypt:')) {
        const [, salt, expected] = storedHash.split(':');
        const actual = scryptSync(value, salt, 64);
        const expectedBuffer = Buffer.from(expected, 'hex');
        return expectedBuffer.length === actual.length && timingSafeEqual(actual, expectedBuffer);
    }
    const expected = createHash('sha256').update(value).digest('hex');
    return storedHash.length === expected.length && timingSafeEqual(Buffer.from(storedHash), Buffer.from(expected));
};

const hashSessionToken = token => createHash('sha256').update(token).digest('hex');

const createSession = playerId => {
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + sessionLifetime;
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions (token_hash, player_id, expires_at) VALUES (?, ?, ?)').run(hashSessionToken(token), playerId, expiresAt);
    return { token, expiresAt };
};

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isRealDate = value => {
    if (!validDate(value)) return false;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};
const validImageData = value => {
    if (value === '') return true;
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 24 * 1024) return false;
    const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    return Boolean(match && Buffer.from(match[2], 'base64').length <= 16 * 1024);
};

function ensureProfile(playerId) {
    db.prepare('INSERT OR IGNORE INTO profiles (player_id, full_name) SELECT id, name FROM players WHERE id = ?').run(playerId);
    return db.prepare('SELECT * FROM profiles WHERE player_id = ?').get(playerId);
}

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
app.use(helmet({
    hsts: process.env.NODE_ENV === 'production' ? undefined : false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'https://wttr.in', 'https://query1.finance.yahoo.com'],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            objectSrc: ["'none'"]
        }
    }
}));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak permintaan. Coba lagi nanti.' }
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' }
});
app.use('/api', apiLimiter);
app.use(express.json({ limit: '64kb', strict: true }));
app.use(cookieParser());
app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) response.set('Cache-Control', 'no-store');
    const origin = request.get('origin');
    if (origin) {
        try {
            if (new URL(origin).origin !== `${request.protocol}://${request.get('host')}`) return response.status(403).json({ error: 'Origin tidak diizinkan.' });
        } catch {
            return response.status(403).json({ error: 'Origin tidak diizinkan.' });
        }
    }
    next();
});

function requireSession(request, response, next) {
    const token = request.cookies.tc_session;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return response.status(401).json({ error: 'Login diperlukan.' });
    const tokenHash = hashSessionToken(token);
    const session = db.prepare('SELECT player_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash);
    if (!session || session.expires_at <= Date.now()) {
        if (session) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
        return response.status(401).json({ error: 'Sesi tidak valid.' });
    }
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() + sessionLifetime, tokenHash);
    request.auth = { playerId: Number(session.player_id), tokenHash };
    next();
}

const secureCookie = request => process.env.NODE_ENV === 'production' || (app.get('trust proxy') && request.secure);

function setSessionCookie(response, request, token) {
    response.cookie('tc_session', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookie(request),
        path: '/',
        maxAge: sessionLifetime
    });
}

app.post('/api/register', authLimiter, async (request, response, next) => {
    try {
        const { name, code } = request.body || {};
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanCode = typeof code === 'string' ? code.trim() : '';
        if (cleanName.length < 3 || cleanName.length > 60 || cleanCode.length < 8 || Buffer.byteLength(cleanCode, 'utf8') > 72) {
            return response.status(400).json({ error: 'Nama 3-60 karakter dan kode akses 8-72 byte diperlukan.' });
        }
        const accessHash = await bcrypt.hash(cleanCode, bcryptRounds);
        const result = db.prepare('INSERT INTO players (name, access_hash) VALUES (?, ?)').run(cleanName, accessHash);
        const player = { id: Number(result.lastInsertRowid), name: cleanName };
        const session = createSession(player.id);
        setSessionCookie(response, request, session.token);
        return response.status(201).json({ player });
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
            return response.status(409).json({ error: 'Nama pemain sudah digunakan.' });
        }
        return next(error);
    }
});

app.post('/api/login', authLimiter, async (request, response, next) => {
    try {
        const { name, code } = request.body || {};
        const cleanName = typeof name === 'string' ? name.trim() : '';
        const cleanCode = typeof code === 'string' ? code.trim() : '';
        if (!cleanName || cleanName.length > 60 || cleanCode.length < 8 || Buffer.byteLength(cleanCode, 'utf8') > 72) {
            return response.status(400).json({ error: 'Nama dan kode akses tidak valid.' });
        }
        const playerRow = db.prepare('SELECT id, name, access_hash FROM players WHERE name = ?').get(cleanName);
        let validPassword = false;
        if (playerRow) {
            if (/^\$2[aby]\$/.test(playerRow.access_hash)) validPassword = await bcrypt.compare(cleanCode, playerRow.access_hash);
            else validPassword = verifyLegacyPassword(cleanCode, playerRow.access_hash);
        }
        if (!playerRow || !validPassword) return response.status(401).json({ error: 'Nama atau kode akses tidak cocok.' });

        if (!/^\$2[aby]\$/.test(playerRow.access_hash)) {
            const upgradedHash = await bcrypt.hash(cleanCode, bcryptRounds);
            db.prepare('UPDATE players SET access_hash = ? WHERE id = ?').run(upgradedHash, playerRow.id);
        }
        const player = { id: Number(playerRow.id), name: playerRow.name };
        const session = createSession(player.id);
        setSessionCookie(response, request, session.token);
        return response.status(200).json({ player });
    } catch (error) {
        return next(error);
    }
});

app.get('/api/me', requireSession, (request, response) => {
    const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(request.auth.playerId);
    if (!player) return response.status(401).json({ error: 'Sesi tidak valid.' });
    return response.json({ player: { id: Number(player.id), name: player.name } });
});

app.get('/api/profile', requireSession, (request, response) => {
    const player = db.prepare('SELECT id, name, created_at FROM players WHERE id = ?').get(request.auth.playerId);
    if (!player) return response.status(401).json({ error: 'Sesi tidak valid.' });
    const profile = ensureProfile(request.auth.playerId);
    const activity = db.prepare('SELECT journal_date, updated_at, payload FROM journals WHERE player_id = ? ORDER BY journal_date DESC LIMIT 20').all(request.auth.playerId).map(row => {
        const payload = JSON.parse(row.payload);
        return {
            date: row.journal_date,
            updatedAt: row.updated_at,
            completedSlots: Array.isArray(payload.slots) ? payload.slots.filter(slot => typeof slot.log === 'string' && slot.log.trim()).length : 0,
            hasReflection: Boolean(payload.reflection && Object.values(payload.reflection).some(value => typeof value === 'string' && value.trim()))
        };
    });
    return response.json({
        profile: {
            playerId: Number(player.id),
            username: player.name,
            fullName: profile.full_name || player.name,
            bio: profile.bio,
            birthDate: profile.birth_date,
            gender: profile.gender,
            email: profile.email,
            phone: profile.phone,
            avatarData: profile.avatar_data,
            coverData: profile.cover_data,
            visibility: profile.visibility,
            language: profile.language,
            notifications: Boolean(profile.notifications),
            createdAt: player.created_at
        },
        activity
    });
});

app.put('/api/profile', requireSession, (request, response) => {
    const body = request.body || {};
    const current = ensureProfile(request.auth.playerId);
    const fields = ['fullName', 'bio', 'birthDate', 'gender', 'email', 'phone', 'visibility', 'language'];
    const limits = { fullName: 100, bio: 240, birthDate: 10, gender: 24, email: 254, phone: 25, visibility: 10, language: 2 };
    if (fields.some(field => typeof body[field] !== 'string' || body[field].trim().length > limits[field])) {
        return response.status(400).json({ error: 'Data profil tidak valid atau terlalu panjang.' });
    }
    const profile = Object.fromEntries(fields.map(field => [field, body[field].trim()]));
    if (!profile.fullName || (profile.birthDate && !isRealDate(profile.birthDate)) ||
        (profile.gender && !['female', 'male', 'non_binary', 'prefer_not'].includes(profile.gender)) ||
        (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) ||
        (profile.phone && !/^[0-9+().\s-]{7,25}$/.test(profile.phone)) ||
        !['private', 'public'].includes(profile.visibility) || !['id', 'en'].includes(profile.language) ||
        typeof body.notifications !== 'boolean') {
        return response.status(400).json({ error: 'Periksa kembali data profil.' });
    }
    const avatarData = body.avatarData === undefined ? current.avatar_data : body.avatarData;
    const coverData = body.coverData === undefined ? current.cover_data : body.coverData;
    if (!validImageData(avatarData) || !validImageData(coverData)) {
        return response.status(400).json({ error: 'Gambar harus berupa JPEG, PNG, atau WebP berukuran kecil.' });
    }
    db.prepare(`
        UPDATE profiles SET full_name = ?, bio = ?, birth_date = ?, gender = ?, email = ?, phone = ?,
            avatar_data = ?, cover_data = ?, visibility = ?, language = ?, notifications = ?
        WHERE player_id = ?
    `).run(profile.fullName, profile.bio, profile.birthDate, profile.gender, profile.email, profile.phone,
        avatarData, coverData, profile.visibility, profile.language, Number(body.notifications), request.auth.playerId);
    return response.json({ saved: true });
});

app.post('/api/profile/password', requireSession, authLimiter, async (request, response, next) => {
    try {
        const { currentPassword, newPassword } = request.body || {};
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' ||
            Buffer.byteLength(currentPassword, 'utf8') > 72 || Buffer.byteLength(newPassword, 'utf8') < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) {
            return response.status(400).json({ error: 'Password baru harus terdiri dari 8-72 byte.' });
        }
        const player = db.prepare('SELECT access_hash FROM players WHERE id = ?').get(request.auth.playerId);
        if (!player) return response.status(401).json({ error: 'Sesi tidak valid.' });
        const bcryptHash = /^\$2[aby]\$/.test(player.access_hash);
        const valid = bcryptHash ? await bcrypt.compare(currentPassword, player.access_hash) : verifyLegacyPassword(currentPassword, player.access_hash);
        if (!valid) return response.status(403).json({ error: 'Password saat ini tidak cocok.' });
        const nextHash = await bcrypt.hash(newPassword, bcryptRounds);
        db.prepare('UPDATE players SET access_hash = ? WHERE id = ?').run(nextHash, request.auth.playerId);
        db.prepare('DELETE FROM sessions WHERE player_id = ? AND token_hash != ?').run(request.auth.playerId, request.auth.tokenHash);
        return response.json({ changed: true });
    } catch (error) {
        return next(error);
    }
});

app.post('/api/logout', (request, response) => {
    const token = request.cookies.tc_session;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
    }
    response.clearCookie('tc_session', { httpOnly: true, sameSite: 'lax', secure: secureCookie(request), path: '/' });
    return response.json({ loggedOut: true });
});

app.get('/api/market', requireSession, async (request, response) => {
    const result = { weather: null, stock: null };
    try {
        const weatherResponse = await fetch('https://wttr.in/Jakarta?format=j1');
        if (!weatherResponse.ok) throw new Error('Weather service unavailable');
        const weather = await weatherResponse.json();
        const current = weather.current_condition[0];
        result.weather = { temp: current.temp_C, feelsLike: current.FeelsLikeC, description: current.weatherDesc[0].value };
    } catch (error) {
        console.error('Weather API unavailable:', error.message);
    }
    try {
        const stockResponse = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?range=1d&interval=1d');
        if (!stockResponse.ok) throw new Error('Market service unavailable');
        const stock = await stockResponse.json();
        const meta = stock.chart.result[0].meta;
        result.stock = { value: meta.regularMarketPrice, previousClose: meta.chartPreviousClose };
    } catch (error) {
        console.error('Stock API unavailable:', error.message);
    }
    return response.json(result);
});

app.get('/api/journal', requireSession, (request, response) => {
    const date = request.query.date;
    if (!validDate(date)) return response.status(400).json({ error: 'Tanggal tidak valid.' });
    const row = db.prepare('SELECT payload FROM journals WHERE player_id = ? AND journal_date = ?').get(request.auth.playerId, date);
    return response.json({ journal: row ? JSON.parse(row.payload) : null });
});

app.put('/api/journal', requireSession, (request, response) => {
    const { date, slots, reflection } = request.body || {};
    if (!validDate(date) || !Array.isArray(slots) || slots.length > 31 || !reflection || typeof reflection !== 'object' || Array.isArray(reflection)) {
        return response.status(400).json({ error: 'Format jurnal tidak valid.' });
    }
    const payload = JSON.stringify({ date, slots, reflection });
    db.prepare(`
        INSERT INTO journals (player_id, journal_date, payload, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(player_id, journal_date) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
    `).run(request.auth.playerId, date, payload);
    return response.json({ saved: true });
});

app.delete('/api/journal', requireSession, (request, response) => {
    const date = request.query.date;
    if (!validDate(date)) return response.status(400).json({ error: 'Tanggal tidak valid.' });
    const result = db.prepare('DELETE FROM journals WHERE player_id = ? AND journal_date = ?').run(request.auth.playerId, date);
    return response.json({ deleted: result.changes > 0 });
});

app.get('/api/history', requireSession, (request, response) => {
    const rows = db.prepare('SELECT journal_date AS date FROM journals WHERE player_id = ? ORDER BY journal_date DESC').all(request.auth.playerId);
    return response.json({ history: rows });
});

const publicPages = new Set(['gaming.html', 'gold.html', 'index.html', 'journal.html', 'jurnal.html', 'login.html', 'profile.html', 'register.html', 'study.html']);
app.use((request, response, next) => {
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(request.path);
    } catch {
        return response.status(404).json({ error: 'File tidak ditemukan.' });
    }
    if (decodedPath.includes('%')) return response.status(404).json({ error: 'File tidak ditemukan.' });
    const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
    const filePath = resolve(rootDir, `.${requestedPath}`);
    const relativePath = relative(rootDir, filePath).replace(/\\/g, '/');
    const isPublicAsset = /^(assets|css|js)\//.test(relativePath);
    if (!publicPages.has(relativePath) && !isPublicAsset) return response.status(404).json({ error: 'File tidak ditemukan.' });
    next();
}, express.static(rootDir, { index: 'index.html', dotfiles: 'deny', fallthrough: true, maxAge: 0 }));

app.use((request, response) => response.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Ukuran permintaan terlalu besar.' });
    if (error.type === 'entity.parse.failed' || error.status === 400) return response.status(400).json({ error: 'Format permintaan tidak valid.' });
    console.error('Request failed:', error);
    return response.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

app.listen(port, () => console.log(`TimeCraft berjalan pada port ${port}`));
