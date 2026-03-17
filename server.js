import express from "express";
import crypto from "crypto";

const app = express();

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.static("public"));

// ===== DEBUG =====
console.log("STARTING SERVER...");

// ===== IN-MEMORY STORAGE =====
let SCRIPT = "-- default script";

const keys = {};
const tokens = {};

// ===== UTILS =====
const genId = () => crypto.randomBytes(16).toString("hex");
const now = () => Date.now();

// cleanup expired
setInterval(() => {
    const t = now();

    for (const k in tokens) {
        if (tokens[k].expires < t) delete tokens[k];
    }

    for (const k in keys) {
        if (keys[k].expires < t) delete keys[k];
    }
}, 60000);

// ===== ROOT ROUTE (IMPORTANT FOR RAILWAY) =====
app.get("/", (req, res) => {
    res.send("Server is running ✅");
});

// ===== ADMIN AUTH =====
function adminAuth(req, res, next) {
    const pass = req.headers["x-admin-password"];
    if (pass !== ADMIN_PASSWORD) {
        return res.status(401).send("Unauthorized");
    }
    next();
}

// ===== ADMIN ROUTES =====

// Save script
app.post("/admin/script", adminAuth, (req, res) => {
    SCRIPT = req.body.script || "";
    res.json({ success: true });
});

// Generate key
app.post("/admin/generate", adminAuth, (req, res) => {
    const { days = 1, maxSessions = 1 } = req.body;

    const key = genId();

    keys[key] = {
        expires: now() + days * 86400000,
        maxSessions,
        sessions: 0,
        hwid: null
    };

    res.json({ key });
});

// ===== AUTH =====
app.post("/auth", (req, res) => {
    const { key, hwid } = req.body;

    const k = keys[key];
    if (!k) return res.status(400).json({ error: "Invalid key" });

    if (k.expires < now())
        return res.status(400).json({ error: "Key expired" });

    // HWID lock
    if (!k.hwid) {
        k.hwid = hwid;
    } else if (k.hwid !== hwid) {
        return res.status(403).json({ error: "HWID mismatch" });
    }

    // session limit
    if (k.sessions >= k.maxSessions)
        return res.status(403).json({ error: "Max sessions reached" });

    k.sessions++;

    const token = genId();

    tokens[token] = {
        key,
        hwid,
        used: false,
        expires: now() + 5 * 60 * 1000 // 5 min
    };

    res.json({ token });
});

// ===== HEARTBEAT =====
app.post("/heartbeat", (req, res) => {
    const { token } = req.body;

    const t = tokens[token];
    if (!t) return res.status(400).end();

    // extend token
    t.expires = now() + 5 * 60 * 1000;

    res.json({ ok: true });
});

// ===== SCRIPT DELIVERY (SAFE VERSION) =====
app.get("/script", (req, res) => {
    const { token } = req.query;

    const t = tokens[token];

    if (!t || t.used || t.expires < now()) {
        return res.status(403).send("-- invalid token");
    }

    t.used = true;

    // decrease active session
    if (keys[t.key]) keys[t.key].sessions--;

    // ⚠️ NO OBFUSCATION (prevents Railway crash)
    res.type("text/plain").send(SCRIPT);
});

// ===== START SERVER =====
app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port " + PORT);
});