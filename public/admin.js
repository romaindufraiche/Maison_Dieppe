(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  let state = { settings: {}, dishes: [], orders: [], messages: [], pickupDays: [], today: '' };
  let category = 'Plat';
  let dayChoice = ''; // '' = vitrine
  let resizedPhoto = null;
  let reusedPhoto = '';

  // ---------- utilitaires ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function button(label, cls, onClick) {
    const b = el('button', 'mini ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2500);
  }

  async function api(url, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {} };
    if (opts.form) init.body = opts.form;
    else if (opts.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, init);
    if (res.status === 401 && url !== '/api/login') {
      showLogin();
      throw new Error('Session expirée, reconnectez-vous.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  }

  const dateObj = (iso) => new Date(iso + 'T12:00:00');
  const fmt = (iso, o) => dateObj(iso).toLocaleDateString('fr-FR', o);
  const longDate = (iso) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const shortDay = (iso) => {
    const s = fmt(iso, { weekday: 'short', day: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const priceLabel = (p) => (p ? p + (/€/.test(p) ? '' : ' €') : '');

  // ---------- connexion ----------
  function showLogin() {
    $('#app-view').hidden = true;
    $('#login-view').hidden = false;
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-msg').textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: e.target.password.value } });
      e.target.reset();
      await load();
    } catch (err) {
      $('#login-msg').textContent = err.message;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  async function load() {
    try {
      state = await api('/api/admin');
    } catch {
      return showLogin();
    }
    $('#login-view').hidden = true;
    $('#app-view').hidden = false;
    renderDayChips();
    renderLive();
    renderHistory();
    renderOrders();
    renderMessages();
    fillSettings();
  }

  // ---------- onglets ----------
  $$('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
      $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
      window.scrollTo(0, 0);
    })
  );

  // ---------- formulaire de publication ----------
  function renderDayChips() {
    const box = $('#day-chips');
    box.innerHTML = '';
    if (dayChoice && !state.pickupDays.includes(dayChoice)) dayChoice = '';
    const opts = [['', 'Vitrine (tous les jours)'], ...state.pickupDays.map((d) => [d, d === state.today ? 'Aujourd’hui' : shortDay(d)])];
    opts.forEach(([value, label]) => {
      const b = el('button', 'chip' + (value === dayChoice ? ' on' : ''), label);
      b.type = 'button';
      b.addEventListener('click', () => {
        dayChoice = value;
        renderDayChips();
      });
      box.appendChild(b);
    });
  }

  function setCategory(cat) {
    category = cat;
    $$('#category button').forEach((x) => x.classList.toggle('on', x.dataset.cat === cat));
  }
  $$('#category button').forEach((b) => b.addEventListener('click', () => setCategory(b.dataset.cat)));

  // Redimensionne la photo dans le navigateur : envoi rapide même en 4G
  function resizeImage(file, max = 1600) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.82);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  function showPreview(src) {
    const prev = $('#photo-preview');
    prev.hidden = !src;
    if (src) prev.src = src;
    $('#photo-placeholder').hidden = !!src;
    $('#photo-remove').hidden = !src;
  }

  $('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizedPhoto = await resizeImage(file);
    reusedPhoto = '';
    showPreview(URL.createObjectURL(resizedPhoto));
  });

  function clearPhoto() {
    resizedPhoto = null;
    reusedPhoto = '';
    $('#photo-input').value = '';
    showPreview('');
  }
  $('#photo-remove').addEventListener('click', clearPhoto);

  $('#dish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = $('#dish-msg');
    msg.className = 'form-msg';
    if (!f.title.value.trim()) {
      msg.textContent = 'Indiquez le nom du plat.';
      msg.classList.add('error');
      return;
    }
    const fd = new FormData();
    fd.append('title', f.title.value);
    fd.append('price', f.price.value);
    fd.append('description', f.description.value);
    fd.append('category', category);
    fd.append('date', dayChoice);
    if (resizedPhoto) fd.append('photo', resizedPhoto, 'photo.jpg');
    else if (reusedPhoto) fd.append('photoFrom', reusedPhoto);

    const btn = $('#publish-btn');
    btn.disabled = true;
    btn.textContent = 'Publication…';
    try {
      await api('/api/dishes', { method: 'POST', form: fd });
      f.reset();
      clearPhoto();
      msg.textContent = '';
      toast('✅ Publié ' + (dayChoice ? 'pour ' + longDate(dayChoice) : 'en vitrine'));
      // Saisie du menu de la semaine : on passe directement au jour suivant
      if (dayChoice) {
        const i = state.pickupDays.indexOf(dayChoice);
        dayChoice = state.pickupDays[i + 1] || dayChoice;
      }
      await load();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publier sur le site';
    }
  });

  // ---------- listes de plats ----------
  function dishItem(d, actions) {
    const row = el('div', 'item' + (d.photo ? '' : ' no-thumb'));
    if (d.photo) {
      const img = el('img');
      img.src = d.photo;
      img.alt = '';
      img.loading = 'lazy';
      row.appendChild(img);
    }
    const meta = el('div', 'meta');
    meta.appendChild(el('strong', null, d.title));
    const line = el('span');
    line.appendChild(el('span', 'when', d.date ? longDate(d.date) : 'Vitrine'));
    line.appendChild(document.createTextNode([' ', d.category, priceLabel(d.price)].filter(Boolean).join(' · ')));
    meta.appendChild(line);
    row.appendChild(meta);
    const act = el('div', 'actions');
    actions.forEach((a) => act.appendChild(a));
    row.appendChild(act);
    return row;
  }

  async function patchDish(d, body, okMsg) {
    try {
      await api('/api/dishes/' + d.id, { method: 'PATCH', body });
      toast(okMsg);
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  function editDish(d) {
    const title = prompt('Nom du plat', d.title);
    if (title === null) return;
    const price = prompt('Prix', d.price);
    if (price === null) return;
    const description = prompt('Description', d.description);
    if (description === null) return;
    patchDish(d, { title, price, description }, 'Modifié');
  }

  async function deleteDish(d) {
    if (!confirm('Supprimer définitivement « ' + d.title + ' » ?')) return;
    try {
      await api('/api/dishes/' + d.id, { method: 'DELETE' });
      toast('Supprimé');
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  function republish(d) {
    const f = $('#dish-form');
    f.title.value = d.title;
    f.price.value = d.price;
    f.description.value = d.description;
    setCategory(d.category || 'Plat');
    resizedPhoto = null;
    reusedPhoto = d.photo || '';
    showPreview(reusedPhoto);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Choisissez le jour puis « Publier »');
  }

  function renderLive() {
    const box = $('#live');
    box.innerHTML = '';
    const list = state.dishes
      .filter((d) => d.live)
      .sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    if (!list.length) box.appendChild(el('p', 'empty-admin', 'Rien en ligne. Publiez un plat ci-dessus !'));
    list.forEach((d) =>
      box.appendChild(
        dishItem(d, [
          button('Modifier', '', () => editDish(d)),
          button('Retirer', 'danger', () => patchDish(d, { onMenu: false }, 'Retiré du site')),
        ])
      )
    );
  }

  function renderHistory() {
    const box = $('#history');
    box.innerHTML = '';
    const q = $('#history-search').value.trim().toLowerCase();
    // Un seul exemplaire par nom de plat (le plus récent)
    const seen = new Set();
    const list = state.dishes.filter((d) => {
      const key = d.title.toLowerCase();
      if (d.live || seen.has(key) || (q && !key.includes(q))) return false;
      seen.add(key);
      return true;
    });
    if (!list.length) box.appendChild(el('p', 'empty-admin', q ? 'Aucun résultat.' : 'Rien pour l’instant.'));
    list.slice(0, 80).forEach((d) =>
      box.appendChild(dishItem(d, [button('Republier', 'primary', () => republish(d)), button('✕', 'danger', () => deleteDish(d))]))
    );
  }
  $('#history-search').addEventListener('input', renderHistory);

  $('#clear-menu').addEventListener('click', async () => {
    if (!confirm('Retirer tous les plats du site ? (ils restent dans l’historique)')) return;
    await api('/api/dishes/clear', { method: 'POST' });
    toast('Tout est retiré');
    await load();
  });

  // ---------- commandes ----------
  async function setStatus(o, status) {
    try {
      await api('/api/orders/' + o.id, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  function orderCard(o) {
    const c = el('div', 'order-card ' + o.status);
    const top = el('div', 'top-line');
    top.appendChild(el('span', 'time', o.time.replace(':', 'h')));
    top.appendChild(el('span', 'status', o.status));
    c.appendChild(top);
    c.appendChild(el('div', 'what', o.qty + ' × ' + o.dishTitle));
    const who = el('p');
    who.appendChild(document.createTextNode(o.name + ' — '));
    const tel = el('a', null, o.phone);
    tel.href = 'tel:' + o.phone.replace(/[^\d+]/g, '');
    who.appendChild(tel);
    c.appendChild(who);
    if (o.message) c.appendChild(el('p', null, '« ' + o.message + ' »'));
    const act = el('div', 'actions');
    if (o.status !== 'retirée') act.appendChild(button('✓ Retirée', 'primary', () => setStatus(o, 'retirée')));
    if (o.status !== 'à préparer') act.appendChild(button('À préparer', '', () => setStatus(o, 'à préparer')));
    if (o.status !== 'annulée') act.appendChild(button('Annuler', '', () => setStatus(o, 'annulée')));
    act.appendChild(
      button('Supprimer', 'danger', async () => {
        if (!confirm('Supprimer cette commande ?')) return;
        await api('/api/orders/' + o.id, { method: 'DELETE' });
        await load();
      })
    );
    c.appendChild(act);
    return c;
  }

  function renderOrders() {
    const upcoming = state.orders.filter((o) => o.date >= state.today);
    const past = state.orders.filter((o) => o.date < state.today).reverse();

    const box = $('#orders-upcoming');
    box.innerHTML = '';
    if (!upcoming.length) {
      const c = el('div', 'card');
      c.appendChild(el('h2', null, 'Commandes à venir'));
      c.appendChild(el('p', 'empty-admin', 'Aucune commande pour le moment.'));
      box.appendChild(c);
    }
    const byDay = {};
    upcoming.forEach((o) => (byDay[o.date] = byDay[o.date] || []).push(o));
    Object.keys(byDay)
      .sort()
      .forEach((day) => {
        const orders = byDay[day];
        const card = el('div', 'card day-group');
        const ld = longDate(day);
        card.appendChild(el('h2', null, day === state.today ? 'Aujourd’hui · ' + ld : ld.charAt(0).toUpperCase() + ld.slice(1)));
        // Récapitulatif cuisine : total par plat
        const totals = {};
        orders
          .filter((o) => o.status !== 'annulée')
          .forEach((o) => (totals[o.dishTitle] = (totals[o.dishTitle] || 0) + o.qty));
        const names = Object.keys(totals);
        if (names.length) {
          const sum = el('div', 'summary');
          sum.appendChild(el('strong', null, 'À préparer : '));
          sum.appendChild(document.createTextNode(names.map((n) => totals[n] + ' × ' + n).join(' · ')));
          card.appendChild(sum);
        }
        const list = el('div', 'list');
        orders.forEach((o) => list.appendChild(orderCard(o)));
        card.appendChild(list);
        box.appendChild(card);
      });

    const pbox = $('#orders-past');
    pbox.innerHTML = '';
    if (!past.length) pbox.appendChild(el('p', 'empty-admin', 'Aucune.'));
    past.slice(0, 60).forEach((o) => {
      const c = orderCard(o);
      c.querySelector('.time').textContent = fmt(o.date, { day: 'numeric', month: 'short' }) + ' · ' + o.time.replace(':', 'h');
      pbox.appendChild(c);
    });

    const n = upcoming.filter((o) => o.status === 'à préparer').length;
    $('#order-badge').textContent = n;
    $('#order-badge').hidden = !n;
  }

  // ---------- messages ----------
  function renderMessages() {
    const box = $('#messages');
    box.innerHTML = '';
    const list = state.messages || [];
    if (!list.length) box.appendChild(el('p', 'empty-admin', 'Aucun message pour le moment.'));
    list.forEach((m) => {
      const c = el('div', 'order-card ' + (m.status === 'traité' ? 'retirée' : ''));
      const top = el('div', 'top-line');
      top.appendChild(el('span', 'time', m.kind || 'Message'));
      top.appendChild(el('span', 'status', m.status));
      c.appendChild(top);
      const details = [
        m.date && 'pour le ' + longDate(m.date),
        m.guests && m.guests + ' personnes',
        'reçu le ' + new Date(m.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      ].filter(Boolean).join(' · ');
      c.appendChild(el('div', 'what', details));
      c.appendChild(el('p', 'msg-text', m.message));
      const who = el('p');
      who.appendChild(document.createTextNode(m.name));
      if (m.phone) {
        who.appendChild(document.createTextNode(' — '));
        const tel = el('a', null, m.phone);
        tel.href = 'tel:' + m.phone.replace(/[^\d+]/g, '');
        who.appendChild(tel);
      }
      if (m.email) {
        who.appendChild(document.createTextNode(' — '));
        const mail = el('a', null, m.email);
        mail.href = 'mailto:' + m.email;
        who.appendChild(mail);
      }
      c.appendChild(who);
      const act = el('div', 'actions');
      const toggle = m.status === 'traité' ? ['Remettre en « nouveau »', 'nouveau'] : ['✓ Traité', 'traité'];
      act.appendChild(
        button(toggle[0], m.status === 'traité' ? '' : 'primary', async () => {
          await api('/api/messages/' + m.id, { method: 'PATCH', body: { status: toggle[1] } });
          await load();
        })
      );
      act.appendChild(
        button('Supprimer', 'danger', async () => {
          if (!confirm('Supprimer ce message ?')) return;
          await api('/api/messages/' + m.id, { method: 'DELETE' });
          await load();
        })
      );
      c.appendChild(act);
      box.appendChild(c);
    });
    const n = list.filter((m) => m.status === 'nouveau').length;
    $('#msg-badge').textContent = n;
    $('#msg-badge').hidden = !n;
  }

  // ---------- infos ----------
  const FIELDS = ['name', 'tagline', 'phone', 'address', 'hours', 'openTime', 'closeTime', 'instagram', 'facebook'];
  function fillSettings() {
    const f = $('#settings-form');
    FIELDS.forEach((k) => (f[k].value = state.settings[k] || ''));
    f.ordersOpen.checked = !!state.settings.ordersOpen;
  }

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { ordersOpen: f.ordersOpen.checked };
    FIELDS.forEach((k) => (body[k] = f[k].value));
    try {
      state.settings = await api('/api/settings', { method: 'PUT', body });
      toast('✅ Informations enregistrées');
    } catch (err) {
      toast(err.message);
    }
  });

  // Nouvelles commandes : actualisation toutes les minutes
  setInterval(() => {
    if (!$('#app-view').hidden && document.visibilityState === 'visible') {
      api('/api/admin')
        .then((s) => {
          state.orders = s.orders;
          state.messages = s.messages;
          state.today = s.today;
          renderOrders();
          renderMessages();
        })
        .catch(() => {});
    }
  }, 60000);

  load();
})();
