const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);

const app = express();
const PORT = 3000;

// CHANGE THIS PASSWORD
const ADMIN_PASSWORD = 'admin123';

// In-memory storage
let ORIGINAL_SCRIPT = `-- Default protected script (will be obfuscated)
print("SafeKey + Prometheus loaded")
wait(1)
print("Replace this with your real script")
`;

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

const keyStore = {};      // key → { hwid?, expiresAt, maxSessions }
const activeTokens = {};  // token → { key, hwid, expiry }
const adminTokens = {};   // admin session tokens

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ADMIN LOGIN ───────────────────────────────────────
app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = uuidv4();
        adminTokens[token] = Date.now() + 3600000; // 1 hour
        return res.json({ success: true, adminToken: token });
    }
    res.status(401).json({ success: false, error: 'Wrong password' });
});

// ─── ADMIN CHECK ───────────────────────────────────────
const checkAdmin = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (!token || !adminTokens[token] || adminTokens[token] < Date.now()) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
};

// ─── UPDATE SCRIPT ─────────────────────────────────────
app.post('/admin/update-script', checkAdmin, (req, res) => {
    const { script } = req.body;
    if (typeof script !== 'string' || script.trim().length < 10) {
        return res.status(400).json({ success: false, error: 'Invalid script' });
    }
    ORIGINAL_SCRIPT = script;
    res.json({ success: true, message: 'Script updated – future loads will be freshly obfuscated' });
});

// ─── GENERATE KEY ──────────────────────────────────────
app.post('/admin/generate-key', checkAdmin, (req, res) => {
    const { days = 30, maxSessions = 1 } = req.body || {};

    const key = 'KEY-' + uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase();
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;

    keyStore[key] = {
        hwid: null,
        expiresAt,
        maxSessions: Number(maxSessions)
    };

    res.json({ success: true, key });
});

// ─── AUTH ──────────────────────────────────────────────
app.post('/auth', (req, res) => {
    const { key, hwid } = req.body;
    if (!key || !hwid) return res.status(400).json({ success: false, error: 'Missing key or HWID' });

    const data = keyStore[key];
    if (!data) return res.status(401).json({ success: false, error: 'Invalid key' });
    if (data.expiresAt < Date.now()) return res.status(401).json({ success: false, error: 'Key expired' });

    if (data.hwid && data.hwid !== hwid) {
        return res.status(403).json({ success: false, error: 'HWID mismatch' });
    }

    const activeCount = Object.values(activeTokens).filter(t => t.key === key).length;
    if (activeCount >= (data.maxSessions || 1)) {
        return res.status(429).json({ success: false, error: 'Max sessions reached' });
    }

    if (!data.hwid) data.hwid = hwid;

    const token = uuidv4();
    activeTokens[token] = { key, hwid, expiry: Date.now() + TOKEN_EXPIRY_MS };

    res.json({ success: true, token });
});

// ─── GET SCRIPT – FRESH PROMETHEUS OBFUSCATION ─────────
app.get('/script', async (req, res) => {
    const token = req.query.token;
    if (!token || !activeTokens[token]) {
        return res.status(401).send('-- Invalid or expired token');
    }

    const session = activeTokens[token];
    if (session.expiry < Date.now()) {
        delete activeTokens[token];
        return res.status(401).send('-- Token expired');
    }

    delete activeTokens[token]; // one-time use

    try {
        const { stdout } = await execPromise(
            `npx @gamely/prometheus-cli - --preset Strong`,
            { input: ORIGINAL_SCRIPT, shell: true, maxBuffer: 1024 * 1024 * 10 }
        );

        res.type('text/plain').send(stdout.trim() || '-- Empty obfuscation result');
    } catch (err) {
        console.error('Prometheus error:', err.message);
        res.type('text/plain').send(
            `-- Obfuscation failed\nprint("Prometheus error - contact admin")`
        );
    }
});

// Serve admin panel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`SafeKey + Prometheus running → http://localhost:${PORT}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
});