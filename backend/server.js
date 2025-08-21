const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');


dotenv.config();
const { PORT = 3000, ALLOWED_ORIGINS = '', SHEET_WEBAPP_URL } = process.env;

if (!SHEET_WEBAPP_URL) {
  console.error('❌ Missing SHEET_WEBAPP_URL');
  process.exit(1);
}

const app = express();
app.use(express.static(path.join(__dirname, '../fronted')));
app.use(helmet());
app.use(express.urlencoded({ extended: true, limit: '100kb' })); // для form-urlencoded
app.use(express.json({ limit: '100kb' }));

app.use(cors());
app.use(rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));

function sanitizeTwitter(username) {
  return username.replace(/^@/, '').trim();
}

function isValidEth(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// --- Отправка формы на Google Apps Script ---
async function appendRow(twitter, reply_link, wallet) {
  const params = new URLSearchParams({ twitter, reply_link, wallet });
  const res = await fetch(SHEET_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  const text = await res.text();
  return text; // вернёт "OK", "DUPLICATE" или "INVALID"
}

async function getExistingRows() {
  const res = await fetch(`${SHEET_WEBAPP_URL}?action=getAll`);
  const text = await res.text();
  try {
    return JSON.parse(text); // массив строк
  } catch {
    console.error("Failed to parse JSON from Sheets:", text);
    return [];
  }
}

app.post('/api/submit', async (req, res) => {
  try {
    let { twitter, reply_link, wallet } = req.body;

    twitter = String(twitter || '').trim();
    reply_link = String(reply_link || '').trim();
    wallet = String(wallet || '').trim();

    if (!twitter || !reply_link || !wallet)
      return res.status(400).json({ success: false, error: 'All fields are required' });

    if (!/^@?[a-zA-Z0-9_]{1,15}$/.test(twitter))
      return res.status(400).json({ success: false, error: 'Invalid Twitter username' });
    if (!/^https:\/\/(twitter|x)\.com\/.+/i.test(reply_link))
      return res.status(400).json({ success: false, error: 'Invalid reply link' });
    if (!isValidEth(wallet))
      return res.status(400).json({ success: false, error: 'Invalid ETH address' });

    const existing = await getExistingRows();
    const tw = sanitizeTwitter(twitter).toLowerCase();
    const dup = existing.find(r =>
      String(r[0] || '').toLowerCase().replace(/^@/, '') === tw ||
      String(r[2] || '').toLowerCase() === wallet.toLowerCase()
    );
    if (dup) return res.status(409).json({ success: false, error: 'Duplicate entry' });

    const result = await appendRow(`@${sanitizeTwitter(twitter)}`, reply_link, wallet);
    if (result !== "OK") return res.status(400).json({ success: false, error: result });

    return res.json({ success: true, message: 'Added to whitelist ✅' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));