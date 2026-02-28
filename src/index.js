import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

/**
 * DB config
 * - Railway MySQL plugin: MYSQLHOST, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE, MYSQLPORT
 * - Optional: MYSQL_URL (ако го сетнеш като variable, ще работи още по-лесно)
 * - Local fallback: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT
 */
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;

const dbConfig =
  process.env.MYSQL_URL
    ? process.env.MYSQL_URL
    : {
        host: process.env.MYSQLHOST || process.env.DB_HOST || "127.0.0.1",
        user: process.env.MYSQLUSER || process.env.DB_USER || "root",
        password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
        database:
          process.env.MYSQLDATABASE ||
          process.env.MYSQL_DATABASE ||
          process.env.DB_NAME ||
          "guestdb",
        port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
      };

const pool = mysql.createPool(dbConfig);

// Retry DB connect (Railway понякога стартира app преди DB да е ready)
async function waitForDb(retries = 40, delayMs = 1000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      console.log("✅ Database connected");
      return;
    } catch (err) {
      console.log(
        `⏳ Waiting for DB... (${i}/${retries}) ${err?.code || err?.message || err}`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("❌ Could not connect to DB after retries");
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(120) UNIQUE NOT NULL,
      status ENUM('invited', 'confirmed', 'declined') DEFAULT 'invited',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // optional seed (само ако е празно)
  const [[{ cnt }]] = await pool.query(`SELECT COUNT(*) as cnt FROM guests`);
  if (Number(cnt) === 0) {
    await pool.query(
      `INSERT INTO guests (name, email, status) VALUES
       ('Demo Guest 1','demo1@example.com','invited'),
       ('Demo Guest 2','demo2@example.com','confirmed'),
       ('Demo Guest 3','demo3@example.com','declined')`
    );
  }

  console.log("✅ Database initialized successfully");
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateStatus(status) {
  return ["invited", "confirmed", "declined"].includes(status);
}

app.get("/health", async (req, res) => {
  // (по желание) ping DB, за да знаеш че е live
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "ok", timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ ok: false, db: "down", timestamp: new Date().toISOString() });
  }
});

app.get("/guests", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM guests ORDER BY created_at DESC");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching guests:", error);
    res.status(500).json({ success: false, error: "Failed to fetch guests" });
  }
});

app.get("/guests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid guest ID" });
    }

    const [rows] = await pool.query("SELECT * FROM guests WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Guest not found" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching guest:", error);
    res.status(500).json({ success: false, error: "Failed to fetch guest" });
  }
});

app.post("/guests", async (req, res) => {
  try {
    const { name, email, status } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }

    if (!email || !validateEmail(String(email).trim())) {
      return res.status(400).json({ success: false, error: "Valid email is required" });
    }

    if (status && !validateStatus(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be one of: invited, confirmed, declined",
      });
    }

    const guestData = {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      status: status || "invited",
    };

    const [result] = await pool.query("INSERT INTO guests SET ?", guestData);
    const [newGuest] = await pool.query("SELECT * FROM guests WHERE id = ?", [
      result.insertId,
    ]);

    res.status(201).json({ success: true, data: newGuest[0] });
  } catch (error) {
    console.error("Error creating guest:", error);
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, error: "Email already exists" });
    }
    res.status(500).json({ success: false, error: "Failed to create guest" });
  }
});

app.put("/guests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid guest ID" });
    }

    const [existing] = await pool.query("SELECT * FROM guests WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: "Guest not found" });
    }

    const { name, email, status } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ success: false, error: "Name cannot be empty" });
      }
      updates.name = String(name).trim();
    }

    if (email !== undefined) {
      if (!validateEmail(String(email).trim())) {
        return res.status(400).json({ success: false, error: "Invalid email format" });
      }
      updates.email = String(email).trim().toLowerCase();
    }

    if (status !== undefined) {
      if (!validateStatus(status)) {
        return res.status(400).json({
          success: false,
          error: "Status must be one of: invited, confirmed, declined",
        });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: "No valid fields to update" });
    }

    await pool.query("UPDATE guests SET ? WHERE id = ?", [updates, id]);
    const [updated] = await pool.query("SELECT * FROM guests WHERE id = ?", [id]);

    res.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error("Error updating guest:", error);
    if (error?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, error: "Email already exists" });
    }
    res.status(500).json({ success: false, error: "Failed to update guest" });
  }
});

app.delete("/guests/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "Invalid guest ID" });
    }

    const [existing] = await pool.query("SELECT * FROM guests WHERE id = ?", [id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: "Guest not found" });
    }

    await pool.query("DELETE FROM guests WHERE id = ?", [id]);
    res.json({ success: true, message: "Guest deleted successfully" });
  } catch (error) {
    console.error("Error deleting guest:", error);
    res.status(500).json({ success: false, error: "Failed to delete guest" });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error" });
});

const PORT = Number(process.env.PORT || 3000);

(async () => {
  try {
    // Debug (махни го после, ако искаш)
    console.log("ENV MYSQLHOST:", process.env.MYSQLHOST);
    console.log("ENV MYSQLDATABASE:", process.env.MYSQLDATABASE);
    console.log("ENV MYSQLPORT:", process.env.MYSQLPORT);

    await waitForDb();
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`✅ Guest List API running on port ${PORT}`);
      console.log(`Mode: ${isRailway ? "Railway" : "Local"}`);
    });
  } catch (e) {
    console.error("❌ Startup error:", e);
    process.exit(1);
  }
})();