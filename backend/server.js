const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const fs = require("fs");
const csv = require("csv-parser");



dotenv.config();
const { PORT = 3000, ALLOWED_ORIGINS = '', SHEET_WEBAPP_URL, SHEET_WEBAPP_URL_2 } = process.env;

if (!SHEET_WEBAPP_URL || !SHEET_WEBAPP_URL_2) {
  console.error('❌ Missing SHEET_WEBAPP_URL or SHEET_WEBAPP_URL_2');
  process.exit(1);
}

const app = express();
app.use(express.static(path.join(__dirname, '../fronted')));
app.use(helmet());
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));

app.use(cors());
app.use(rateLimit({ windowMs: 60_000, max: 5, standardHeaders: true, legacyHeaders: false }));

function sanitizeTwitter(username) {
  return username.replace(/^@/, '').trim();
}

function isValidEth(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function appendRow(url, twitter, reply_link, wallet) {
  const params = new URLSearchParams({ twitter, reply_link, wallet });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });
  return res.text(); 
}

async function appendRowWithFallback(twitter, reply_link, wallet) {
  try {
    const res1 = await appendRow(SHEET_WEBAPP_URL, twitter, reply_link, wallet);
    if (res1 !== '429') return res1;
    throw new Error('Rate limit hit on primary sheet');
  } catch (err) {
    console.warn('Primary sheet failed, using backup:', err.message);
    return appendRow(SHEET_WEBAPP_URL_2, twitter, reply_link, wallet);
  }
}

async function getAllExistingRows() {
  const tables = [SHEET_WEBAPP_URL, SHEET_WEBAPP_URL_2];
  let allRows = [];

  for (const url of tables) {
    try {
      const res = await fetch(`${url}?action=getAll`);
      const text = await res.text();
      const rows = JSON.parse(text);
      allRows = allRows.concat(rows);
    } catch (err) {
      console.warn(`Failed to fetch rows from ${url}:`, err.message);
    }
  }

  return allRows;
}

app.post('/api/submit', async (req, res) => {
  try {
    let { twitter, reply_link, wallet } = req.body;

    twitter = String(twitter || '').trim();
    reply_link = String(reply_link || '').trim();
    wallet = String(wallet || '').trim();

    if (!twitter || !reply_link || !wallet)
      return res.status(400).json({ success: false, error: 'All fields are required' });

    // валидация
    if (!/^@?[a-zA-Z0-9_]{1,15}$/.test(twitter))
      return res.status(400).json({ success: false, error: 'Invalid Twitter username' });
    if (!/^https:\/\/(twitter|x)\.com\/.+/i.test(reply_link))
      return res.status(400).json({ success: false, error: 'Invalid reply link' });
    if (!isValidEth(wallet))
      return res.status(400).json({ success: false, error: 'Invalid ETH address' });

    const existing = await getAllExistingRows();
    const tw = sanitizeTwitter(twitter).toLowerCase();
    const dup = existing.find(r =>
      String(r[0] || '').toLowerCase().replace(/^@/, '') === tw ||
      String(r[2] || '').toLowerCase() === wallet.toLowerCase()
    );
    if (dup) return res.status(409).json({ success: false, error: 'Duplicate entry' });

    const result = await appendRowWithFallback(`@${sanitizeTwitter(twitter)}`, reply_link, wallet);
    if (result !== 'OK') return res.status(400).json({ success: false, error: result });

    return res.json({ success: true, message: 'Added to whitelist ✅' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});
app.get("/api/check-wl", (req,res)=>{
  const wallet = req.query.wallet?.toLowerCase();
  if(!wallet) return res.json({found:false});

  let found = false;
  fs.createReadStream("clean.csv")
    .pipe(csv())
    .on("data", (row)=>{
      if(row[Object.keys(row)[0]].toLowerCase() === wallet) found = true;
    })
    .on("end", ()=> res.json({found}));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));