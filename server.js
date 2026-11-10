'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changez-moi';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update('md:' + ADMIN_PASSWORD).digest('hex');
const SESSION_DAYS = 30;

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD non défini : mot de passe par défaut "changez-moi". À changer avant la mise en ligne !');
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Stockage : un simple fichier JSON (largement suffisant pour un restaurant)
// ---------------------------------------------------------------------------
const DEFAULT_DB = {
  settings: {
    name: 'Maison Dieppe',
    tagline: 'Cuisine maison, produits frais — la carte change tous les jours',
    phone: '',
    address: '',
    hours: 'Du mardi au samedi, midi et soir',
    facebook: 'https://www.facebook.com/p/Maison-Dieppe-100071220223822/',
    reservationsOpen: true,
  },
  dishes: [],
  reservations: [],
};

function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...DEFAULT_DB, ...db, settings: { ...DEFAULT_DB.settings, ...db.settings } };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

let db = loadDb();

function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const newId = () => crypto.randomBytes(8).toString('hex');
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------------------------------------------------------------------------
// Authentification administrateur (cookie signé, sans dépendance)
// ---------------------------------------------------------------------------
function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('hex');
}

function makeToken() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return exp + '.' + sign(exp);
}

function validToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function requireAdmin(req, res, next) {
  if (validToken(getCookie(req, 'md_admin'))) return next();
  res.status(401).json({ error: 'Non connecté' });
}

// Limitation simple des tentatives de connexion
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const a = attempts.get(ip) || { count: 0, since: now };
  if (now - a.since > 15 * 60e3) { a.count = 0; a.since = now; }
  a.count++;
  attempts.set(ip, a);
  return a.count > 10;
}

// ---------------------------------------------------------------------------
// Upload des photos
// ---------------------------------------------------------------------------
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, Date.now() + '-' + newId() + EXT[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, Boolean(EXT[file.mimetype])),
});

function deletePhoto(photo) {
  if (!photo) return;
  const stillUsed = db.dishes.some((d) => d.photo === photo);
  if (stillUsed) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(photo)), () => {});
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---- Public ---------------------------------------------------------------
app.get('/api/public', (_req, res) => {
  const menu = db.dishes
    .filter((d) => d.onMenu)
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  res.json({ settings: db.settings, menu });
});

app.post('/api/reservations', (req, res) => {
  if (!db.settings.reservationsOpen) return res.status(403).json({ error: 'Les réservations en ligne sont fermées.' });
  const b = req.body || {};
  if (str(b.website)) return res.json({ ok: true }); // pot de miel anti-spam
  const r = {
    id: newId(),
    name: str(b.name, 80),
    phone: str(b.phone, 30),
    date: str(b.date, 10),
    time: str(b.time, 5),
    people: Math.max(1, Math.min(30, parseInt(b.people, 10) || 0)),
    message: str(b.message, 500),
    status: 'nouvelle',
    createdAt: new Date().toISOString(),
  };
  if (!r.name || !r.phone || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !/^\d{2}:\d{2}$/.test(r.time)) {
    return res.status(400).json({ error: 'Merci de renseigner nom, téléphone, date et heure.' });
  }
  if (r.date < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: 'La date est déjà passée.' });
  }
  db.reservations.push(r);
  saveDb();
  res.json({ ok: true });
});

// ---- Admin : session --------------------------------------------------------
app.post('/api/login', (req, res) => {
  if (tooManyAttempts(req.ip)) return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes.' });
  const given = Buffer.from(sign(str(req.body && req.body.password, 200)));
  const expected = Buffer.from(sign(ADMIN_PASSWORD));
  if (!crypto.timingSafeEqual(given, expected)) return res.status(401).json({ error: 'Mot de passe incorrect' });
  attempts.delete(req.ip);
  res.cookie('md_admin', makeToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: SESSION_DAYS * 864e5,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  res.clearCookie('md_admin');
  res.json({ ok: true });
});

app.get('/api/admin', requireAdmin, (_req, res) => {
  const dishes = [...db.dishes].sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const reservations = [...db.reservations].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json({ settings: db.settings, dishes, reservations });
});

// ---- Admin : plats ----------------------------------------------------------
app.post('/api/dishes', requireAdmin, upload.single('photo'), (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 120);
  if (!title) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Le nom du plat est obligatoire.' });
  }
  if (b.replace === 'true') db.dishes.forEach((d) => (d.onMenu = false));
  const dish = {
    id: newId(),
    title,
    description: str(b.description, 600),
    price: str(b.price, 20),
    category: str(b.category, 30) || 'Plat',
    photo: req.file ? '/uploads/' + req.file.filename : '',
    onMenu: true,
    postedAt: new Date().toISOString(),
  };
  db.dishes.push(dish);
  saveDb();
  res.json(dish);
});

app.patch('/api/dishes/:id', requireAdmin, (req, res) => {
  const dish = db.dishes.find((d) => d.id === req.params.id);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable' });
  const b = req.body || {};
  if (typeof b.onMenu === 'boolean') {
    dish.onMenu = b.onMenu;
    if (b.onMenu) dish.postedAt = new Date().toISOString(); // republier = remonte en tête
  }
  for (const k of ['title', 'description', 'price', 'category']) {
    if (typeof b[k] === 'string') dish[k] = str(b[k], k === 'description' ? 600 : 120);
  }
  saveDb();
  res.json(dish);
});

app.post('/api/dishes/clear', requireAdmin, (_req, res) => {
  db.dishes.forEach((d) => (d.onMenu = false));
  saveDb();
  res.json({ ok: true });
});

app.delete('/api/dishes/:id', requireAdmin, (req, res) => {
  const dish = db.dishes.find((d) => d.id === req.params.id);
  if (!dish) return res.status(404).json({ error: 'Plat introuvable' });
  db.dishes = db.dishes.filter((d) => d.id !== dish.id);
  deletePhoto(dish.photo);
  saveDb();
  res.json({ ok: true });
});

// ---- Admin : réservations --------------------------------------------------
app.patch('/api/reservations/:id', requireAdmin, (req, res) => {
  const r = db.reservations.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Réservation introuvable' });
  const status = str(req.body && req.body.status, 20);
  if (['nouvelle', 'confirmée', 'annulée'].includes(status)) r.status = status;
  saveDb();
  res.json(r);
});

app.delete('/api/reservations/:id', requireAdmin, (req, res) => {
  db.reservations = db.reservations.filter((x) => x.id !== req.params.id);
  saveDb();
  res.json({ ok: true });
});

// ---- Admin : informations du restaurant -------------------------------------
app.put('/api/settings', requireAdmin, (req, res) => {
  const b = req.body || {};
  for (const k of ['name', 'tagline', 'phone', 'address', 'hours', 'facebook']) {
    if (typeof b[k] === 'string') db.settings[k] = str(b[k], 300);
  }
  if (typeof b.reservationsOpen === 'boolean') db.settings.reservationsOpen = b.reservationsOpen;
  saveDb();
  res.json(db.settings);
});

// Erreurs (ex. photo trop lourde)
app.use((err, _req, res, _next) => {
  const msg = err && err.code === 'LIMIT_FILE_SIZE' ? 'Photo trop lourde (10 Mo max).' : 'Erreur serveur';
  if (!(err && err.code)) console.error(err);
  res.status(err && err.code ? 400 : 500).json({ error: msg });
});

app.listen(PORT, () => console.log(`Maison Dieppe en ligne sur http://localhost:${PORT} (admin : /admin)`));
