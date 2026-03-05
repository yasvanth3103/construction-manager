const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { getDb } = require("./sqlite");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());

// Serve static frontend
const publicDir = path.join(__dirname, "..");
app.use(express.static(publicDir));

// --- SQLite initialization ---
const db = getDb();

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT,
      location TEXT,
      start_date TEXT,
      status TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS labours (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT,
      phone TEXT,
      role TEXT,
      daily_wage REAL,
      site_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      site_id TEXT,
      date TEXT,
      labour_id TEXT,
      status TEXT,
      ot_amount REAL,
      ot_type TEXT,
      remarks TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT,
      site_id TEXT,
      name TEXT,
      unit TEXT,
      qty REAL,
      rate REAL,
      supplier TEXT,
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );
});

// --- Helpers ---
function createToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// --- Auth routes ---
app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const trimmedEmail = String(email).trim().toLowerCase();
  const passwordHash = bcrypt.hashSync(String(password), 10);

  db.run(
    "INSERT INTO users (email, password_hash) VALUES (?, ?)",
    [trimmedEmail, passwordHash],
    function (err) {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          return res.status(409).json({ error: "User already exists" });
        }
        console.error("Failed to create user", err);
        return res.status(500).json({ error: "Failed to create user" });
      }

      const user = { id: this.lastID, email: trimmedEmail };
      const token = createToken(user);
      res.json({ token, user: { id: user.id, email: user.email } });
    },
  );
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const trimmedEmail = String(email).trim().toLowerCase();

  db.get(
    "SELECT id, email, password_hash FROM users WHERE email = ?",
    [trimmedEmail],
    (err, row) => {
      if (err) {
        console.error("Failed to query user", err);
        return res.status(500).json({ error: "Failed to login" });
      }
      if (!row) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const matches = bcrypt.compareSync(String(password), row.password_hash);
      if (!matches) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = createToken(row);
      res.json({ token, user: { id: row.id, email: row.email } });
    },
  );
});

// --- State routes (single payload for all tables) ---
app.get("/api/state", authMiddleware, (req, res) => {
  const userId = req.userId;

  const result = {
    sites: [],
    labours: [],
    attendance: [],
    materials: [],
  };

  db.all(
    "SELECT id, name, location, start_date as startDate, status FROM sites WHERE user_id = ?",
    [userId],
    (err, rows) => {
      if (err) {
        console.error("Failed to load sites", err);
        return res.status(500).json({ error: "Failed to load state" });
      }
      result.sites = rows || [];

      db.all(
        "SELECT id, name, phone, role, daily_wage as dailyWage, site_id as siteId, active FROM labours WHERE user_id = ?",
        [userId],
        (err2, labRows) => {
          if (err2) {
            console.error("Failed to load labours", err2);
            return res.status(500).json({ error: "Failed to load state" });
          }
          result.labours = (labRows || []).map((l) => ({
            ...l,
            active: !!l.active,
          }));

          db.all(
            "SELECT id, site_id as siteId, date, labour_id as labourId, status, ot_amount as otAmount, ot_type as otType, remarks FROM attendance WHERE user_id = ?",
            [userId],
            (err3, attRows) => {
              if (err3) {
                console.error("Failed to load attendance", err3);
                return res.status(500).json({ error: "Failed to load state" });
              }
              result.attendance = attRows || [];

              db.all(
                "SELECT id, date, site_id as siteId, name, unit, qty, rate, supplier, notes FROM materials WHERE user_id = ?",
                [userId],
                (err4, matRows) => {
                  if (err4) {
                    console.error("Failed to load materials", err4);
                    return res
                      .status(500)
                      .json({ error: "Failed to load state" });
                  }
                  result.materials = matRows || [];
                  res.json(result);
                },
              );
            },
          );
        },
      );
    },
  );
});

app.put("/api/state", authMiddleware, (req, res) => {
  const userId = req.userId;
  const body = req.body || {};
  const sites = Array.isArray(body.sites) ? body.sites : [];
  const labours = Array.isArray(body.labours) ? body.labours : [];
  const attendance = Array.isArray(body.attendance) ? body.attendance : [];
  const materials = Array.isArray(body.materials) ? body.materials : [];

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run("DELETE FROM materials WHERE user_id = ?", [userId]);
    db.run("DELETE FROM attendance WHERE user_id = ?", [userId]);
    db.run("DELETE FROM labours WHERE user_id = ?", [userId]);
    db.run("DELETE FROM sites WHERE user_id = ?", [userId]);

    const siteStmt = db.prepare(
      "INSERT INTO sites (id, user_id, name, location, start_date, status) VALUES (?, ?, ?, ?, ?, ?)",
    );
    sites.forEach((s) => {
      siteStmt.run([
        s.id,
        userId,
        s.name || "",
        s.location || "",
        s.startDate || "",
        s.status || "",
      ]);
    });
    siteStmt.finalize();

    const labourStmt = db.prepare(
      "INSERT INTO labours (id, user_id, name, phone, role, daily_wage, site_id, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    labours.forEach((l) => {
      labourStmt.run([
        l.id,
        userId,
        l.name || "",
        l.phone || "",
        l.role || "",
        l.dailyWage || 0,
        l.siteId || "",
        l.active ? 1 : 0,
      ]);
    });
    labourStmt.finalize();

    const attStmt = db.prepare(
      "INSERT INTO attendance (id, user_id, site_id, date, labour_id, status, ot_amount, ot_type, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    attendance.forEach((a) => {
      attStmt.run([
        a.id,
        userId,
        a.siteId || "",
        a.date || "",
        a.labourId || "",
        a.status || "",
        a.otAmount || 0,
        a.otType || "",
        a.remarks || "",
      ]);
    });
    attStmt.finalize();

    const matStmt = db.prepare(
      "INSERT INTO materials (id, user_id, date, site_id, name, unit, qty, rate, supplier, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    materials.forEach((m) => {
      matStmt.run([
        m.id,
        userId,
        m.date || "",
        m.siteId || "",
        m.name || "",
        m.unit || "",
        m.qty || 0,
        m.rate || 0,
        m.supplier || "",
        m.notes || "",
      ]);
    });
    matStmt.finalize();

    db.run("COMMIT", (err) => {
      if (err) {
        console.error("Failed to save state", err);
        return res.status(500).json({ error: "Failed to save state" });
      }
      res.json({ ok: true });
    });
  });
});

// Fallback to index.html for SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Construction Manager server running on http://localhost:${PORT}`);
});

