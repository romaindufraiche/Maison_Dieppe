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
const TZ = 'Europe/Paris';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD non défini : mot de passe par défaut "changez-moi". À changer avant la mise en ligne !');
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Dates (toujours à l'heure de Paris)
// ---------------------------------------------------------------------------
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const nowHHMM = () =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = dimanche
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => /^\d{2}:\d{2}$/.test(v);

// ---------------------------------------------------------------------------
// Stockage : un simple fichier JSON (largement suffisant pour une boutique)
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS = {
  name: 'Maison Dieppe',
  tagline: 'Du vrai, du bon, du fait maison',
  phone: '01 39 84 97 23',
  address: '3 place de Verdun\n95880 Enghien-les-Bains',
  hours: 'Du lundi au samedi\n8h – 19h non-stop',
  openTime: '08:00',
  closeTime: '19:00',
  openDays: [1, 2, 3, 4, 5, 6],
  facebook: 'https://www.facebook.com/p/Maison-Dieppe-100071220223822/',
  instagram: 'https://www.instagram.com/maisondieppe_traiteur/',
  ordersOpen: true,
};

function nextOpenDays(count, openDays = DEFAULT_SETTINGS.openDays) {
  const days = [];
  let d = todayIso();
  while (days.length < count) {
    if (openDays.includes(weekday(d))) days.push(d);
    d = addDays(d, 1);
  }
  return days;
}

// Contenu de démonstration au premier lancement (repris de leur Instagram)
function seedDishes() {
  const now = new Date().toISOString();
  const menu = [
    ['Joue de porc au cidre', 'Boulgour pilaf'],
    ['Filet de bar', 'Flan de carottes'],
    ['Suprême de pintade forestière', 'Poêlée de légumes'],
    ['Queue de lotte à l’armoricaine', 'Purée de patates douces blanches'],
    ['Paella de la Maison Dieppe', 'La recette de la maison, généreuse et parfumée'],
  ];
  const days = nextOpenDays(6).filter((d) => weekday(d) !== 1).slice(0, 5); // du mardi au samedi
  const dishes = menu.map(([title, description], i) => ({
    id: newId(), title, description, price: '', category: 'Plat', date: days[i] || '', photo: '', onMenu: true, postedAt: now,
  }));
  const vitrine = [
    ['Choucroute au champagne', 'Championne de France 2026 ! Chou longuement mijoté, saucisses fumées, pommes de terre bien beurrées.', 'Spécialité', '/img/choucroute-champagne.jpg'],
    ['Feuilleté jambon', 'Doré, croustillant, fondant : une pâte feuilletée bien beurrée.', 'Entrée', '/img/feuillete-jambon.jpg'],
    ['Salade César maison', 'Poulet rôti par nos soins, œufs, parmesan, croûtons et notre sauce César maison.', 'Entrée', '/img/salade-cesar.jpg'],
    ['Rillettes maison', 'À tartiner à l’apéritif ou sur une bonne tranche de pain.', 'Spécialité', '/img/rillettes.jpg'],
    ['Tartelette chocolat-pécan', 'Fond chocolaté, crème généreuse et éclats de noix de pécan.', 'Dessert', '/img/tartelette-chocolat-pecan.jpg'],
  ].map(([title, description, category, photo]) => ({
    id: newId(), title, description, price: '', category, date: '', photo, onMenu: true, postedAt: now,
  }));
  return [...dishes, ...vitrine];
}

function loadDb() {
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      dishes: raw.dishes || [],
      orders: raw.orders || [],
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, dishes: seedDishes(), orders: [] };
  }
}

let db = loadDb();

function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
if (!fs.existsSync(DB_FILE)) saveDb();

function newId() {
  return crypto.randomBytes(8).toString('hex');
}
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Un plat est visible s'il est publié et que sa date (s'il en a une) n'est pas passée
const isLive = (d) => d.onMenu && (!d.date || d.date >= todayIso());

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

// Limitation simple des tentatives
const hits = new Map();
function tooMany(key, max, windowMs) {
  const now = Date.now();
  const a = hits.get(key) || { count: 0, since: now };
  if (now - a.since > windowMs) { a.count = 0; a.since = now; }
  a.count++;
  hits.set(key, a);
  return a.count > max;
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
  if (!photo || !photo.startsWith('/uploads/')) return;
  if (db.dishes.some((d) => d.photo === photo)) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(photo)), () => {});
}

// Réutiliser la photo d'un plat déjà publié (bouton « Republier »)
function reusablePhoto(p) {
  p = str(p, 200);
  return db.dishes.some((d) => d.photo && d.photo === p) ? p : '';
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
    .filter(isLive)
    .sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || b.postedAt.localeCompare(a.postedAt));
  const { name, tagline, phone, address, hours, openTime, closeTime, openDays, facebook, instagram, ordersOpen } = db.settings;
  res.json({
    today: todayIso(),
    now: nowHHMM(),
    pickupDays: nextOpenDays(7, db.settings.openDays),
    settings: { name, tagline, phone, address, hours, openTime, closeTime, openDays, facebook, instagram, ordersOpen },
    menu,
  });
});

app.post('/api/orders', (req, res) => {
  if (!db.settings.ordersOpen) return res.status(403).json({ error: 'Les réservations en ligne sont fermées pour le moment.' });
  if (tooMany('order:' + req.ip, 20, 60 * 60e3)) return res.status(429).json({ error: 'Trop de demandes, merci de nous appeler.' });
  const b = req.body || {};
  if (str(b.website)) return res.json({ ok: true }); // pot de miel anti-spam

  const dish = db.dishes.find((d) => d.id === b.dishId && isLive(d));
  if (!dish) return res.status(400).json({ error: 'Ce plat n’est plus disponible.' });

  const o = {
    id: newId(),
    dishId: dish.id,
    dishTitle: dish.title,
    qty: Math.max(1, Math.min(50, parseInt(b.qty, 10) || 1)),
    name: str(b.name, 80),
    phone: str(b.phone, 30),
    date: dish.date || str(b.date, 10),
    time: str(b.time, 5),
    message: str(b.message, 400),
    status: 'à préparer',
    createdAt: new Date().toISOString(),
  };
  const { openTime, closeTime, openDays } = db.settings;
  if (!o.name || !o.phone.replace(/\D/g, '').match(/^\d{8,15}$/)) {
    return res.status(400).json({ error: 'Merci d’indiquer votre nom et un numéro de téléphone valide.' });
  }
  if (!isDate(o.date) || !isTime(o.time)) return res.status(400).json({ error: 'Choisissez un jour et une heure de retrait.' });
  if (o.date < todayIso() || (o.date === todayIso() && o.time < nowHHMM())) {
    return res.status(400).json({ error: 'Cette heure de retrait est déjà passée.' });
  }
  if (!openDays.includes(weekday(o.date)) || o.time < openTime || o.time > closeTime) {
    return res.status(400).json({ error: 'La boutique est fermée à ce moment-là.' });
  }
  db.orders.push(o);
  saveDb();
  res.json({ ok: true, order: { dishTitle: o.dishTitle, qty: o.qty, date: o.date, time: o.time } });
});

// ---- Admin : session --------------------------------------------------------
app.post('/api/login', (req, res) => {
  if (tooMany('login:' + req.ip, 10, 15 * 60e3)) return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 15 minutes.' });
  const given = Buffer.from(sign(str(req.body && req.body.password, 200)));
  const expected = Buffer.from(sign(ADMIN_PASSWORD));
  if (!crypto.timingSafeEqual(given, expected)) return res.status(401).json({ error: 'Mot de passe incorrect' });
  hits.delete('login:' + req.ip);
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
  const dishes = [...db.dishes]
    .map((d) => ({ ...d, live: isLive(d) }))
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const orders = [...db.orders].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json({ today: todayIso(), pickupDays: nextOpenDays(7, db.settings.openDays), settings: db.settings, dishes, orders });
});

// ---- Admin : plats ----------------------------------------------------------
app.post('/api/dishes', requireAdmin, upload.single('photo'), (req, res) => {
  const b = req.body || {};
  const title = str(b.title, 120);
  const date = str(b.date, 10);
  if (!title || (date && !isDate(date))) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Le nom du plat est obligatoire.' });
  }
  const dish = {
    id: newId(),
    title,
    description: str(b.description, 600),
    price: str(b.price, 20),
    category: str(b.category, 30) || 'Plat',
    date,
    photo: req.file ? '/uploads/' + req.file.filename : reusablePhoto(b.photoFrom),
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
  if (typeof b.onMenu === 'boolean') dish.onMenu = b.onMenu;
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

// ---- Admin : commandes ------------------------------------------------------
const STATUSES = ['à préparer', 'retirée', 'annulée'];

app.patch('/api/orders/:id', requireAdmin, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Commande introuvable' });
  const status = str(req.body && req.body.status, 20);
  if (STATUSES.includes(status)) o.status = status;
  saveDb();
  res.json(o);
});

app.delete('/api/orders/:id', requireAdmin, (req, res) => {
  db.orders = db.orders.filter((x) => x.id !== req.params.id);
  saveDb();
  res.json({ ok: true });
});

// ---- Admin : informations de la boutique -----------------------------------
app.put('/api/settings', requireAdmin, (req, res) => {
  const b = req.body || {};
  for (const k of ['name', 'tagline', 'phone', 'address', 'hours', 'facebook', 'instagram']) {
    if (typeof b[k] === 'string') db.settings[k] = str(b[k], 300);
  }
  for (const k of ['openTime', 'closeTime']) {
    if (isTime(b[k])) db.settings[k] = b[k];
  }
  if (typeof b.ordersOpen === 'boolean') db.settings.ordersOpen = b.ordersOpen;
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
