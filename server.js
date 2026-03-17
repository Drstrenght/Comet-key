import express from "express";
import crypto from "crypto";
import { exec } from "child_process";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.use(express.json());
app.use(express.static("public"));

let SCRIPT = "-- default script";
const keys = {};
const tokens = {};

const genId = () => crypto.randomBytes(16).toString("hex");
const now = () => Date.now();

function cleanExpired() {
    const t = now();
    for (const k in tokens) if (tokens[k].expires < t) delete tokens[k];
    for (const k in keys) if (keys[k].expires < t) delete keys[k];
}
setInterval(cleanExpired, 60000);

function adminAuth(req, res, next) {
    const pass = req.headers["x-admin-password"];
    if (pass !== ADMIN_PASSWORD) return res.status(401).send("Unauthorized");
    next();
}

app.post("/admin/script", adminAuth, (req, res) => {
    SCRIPT = req.body.script || "";
    res.json({ success: true });
});

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

app.post("/auth", (req, res) => {
    const { key, hwid } = req.body;
    const k = keys[key];
    if (!k) return res.status(400).json({ error: "Invalid key" });
    if (k.expires < now()) return res.status(400).json({ error: "Expired" });

    if (!k.hwid) k.hwid = hwid;
    else if (k.hwid !== hwid) return res.status(403).json({ error: "HWID mismatch" });

    if (k.sessions >= k.maxSessions)
        return res.status(403).json({ error: "Max sessions reached" });

    k.sessions++;

    const token = genId();
    tokens[token] = {
        key,
        hwid,
        used: false,
        expires: now() + 300000
    };

    res.json({ token });
});

app.post("/heartbeat", (req, res) => {
    const { token } = req.body;
    const t = tokens[token];
    if (!t) return res.status(400).end();
    t.expires = now() + 300000;
    res.json({ ok: true });
});

app.get("/script", async (req, res) => {
    const { token } = req.query;
    const t = tokens[token];

    if (!t || t.used || t.expires < now())
        return res.status(403).send("-- invalid token");

    t.used = true;
    if (keys[t.key]) keys[t.key].sessions--;

    try {
        fs.writeFileSync("temp.lua", SCRIPT);

        await new Promise((resolve, reject) => {
            exec(
                `npx @gamely/prometheus-cli temp.lua --preset Strong --output out.lua`,
                (err) => (err ? reject(err) : resolve())
            );
        });

        const obf = fs.readFileSync("out.lua", "utf-8");

        fs.unlinkSync("temp.lua");
        fs.unlinkSync("out.lua");

        res.type("text/plain").send(obf);
    } catch {
        res.type("text/plain").send(SCRIPT);
    }
});

app.listen(PORT, () => console.log("Running on " + PORT));
