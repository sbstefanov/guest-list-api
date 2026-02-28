import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

async function initDatabase() {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS guests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(120) UNIQUE NOT NULL,
        status ENUM('invited', 'confirmed', 'declined') DEFAULT 'invited',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    connection.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateStatus(status) {
  return ['invited', 'confirmed', 'declined'].includes(status);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/guests', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM guests ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching guests:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch guests' });
  }
});

app.get('/guests/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid guest ID' });
    }

    const [rows] = await pool.query('SELECT * FROM guests WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Error fetching guest:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch guest' });
  }
});

app.post('/guests', async (req, res) => {
  try {
    const { name, email, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, error: 'Valid email is required' });
    }

    if (status && !validateStatus(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be one of: invited, confirmed, declined'
      });
    }

    const guestData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      status: status || 'invited'
    };

    const [result] = await pool.query('INSERT INTO guests SET ?', guestData);

    const [newGuest] = await pool.query('SELECT * FROM guests WHERE id = ?', [result.insertId]);

    res.status(201).json({ success: true, data: newGuest[0] });
  } catch (error) {
    console.error('Error creating guest:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Email already exists' });
    }

    res.status(500).json({ success: false, error: 'Failed to create guest' });
  }
});

app.put('/guests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, status } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid guest ID' });
    }

    const [existing] = await pool.query('SELECT * FROM guests WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    const updates = {};

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ success: false, error: 'Name cannot be empty' });
      }
      updates.name = name.trim();
    }

    if (email !== undefined) {
      if (!validateEmail(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }
      updates.email = email.trim().toLowerCase();
    }

    if (status !== undefined) {
      if (!validateStatus(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status must be one of: invited, confirmed, declined'
        });
      }
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    await pool.query('UPDATE guests SET ? WHERE id = ?', [updates, id]);

    const [updated] = await pool.query('SELECT * FROM guests WHERE id = ?', [id]);

    res.json({ success: true, data: updated[0] });
  } catch (error) {
    console.error('Error updating guest:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'Email already exists' });
    }

    res.status(500).json({ success: false, error: 'Failed to update guest' });
  }
});

app.delete('/guests/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid guest ID' });
    }

    const [existing] = await pool.query('SELECT * FROM guests WHERE id = ?', [id]);

    if (existing.length === 0) {
      return res.status(404).json({ success: false, error: 'Guest not found' });
    }

    await pool.query('DELETE FROM guests WHERE id = ?', [id]);

    res.json({ success: true, message: 'Guest deleted successfully' });
  } catch (error) {
    console.error('Error deleting guest:', error);
    res.status(500).json({ success: false, error: 'Failed to delete guest' });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

await initDatabase();

app.listen(PORT, () => {
  console.log(`Guest List API running on port ${PORT}`);
});
