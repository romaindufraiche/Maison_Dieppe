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
  const priceNum = (p) => {
    const m = String(p || '').replace(/\s/g, '').replace(',', '.').match(/\d+(\.\d{1,2})?/);
    return m ? parseFloat(m[0]) : null;
  };
  const euros = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const isoOf = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  };
  const shiftDays = (iso, n) => {
    const dt = dateObj(iso);
    dt.setDate(dt.getDate() + n);
    return isoOf(dt);
  };

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
    renderCompta();
    renderClosures();
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
    if (priceNum(f.price.value) == null) {
      msg.textContent = 'Indiquez le prix du plat (ex : 12,50).';
      msg.classList.add('error');
      f.price.focus();
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

  // ---------- comptabilité ----------
  let period = 'day';
  let anchor = '';

  function periodRange(kind, iso) {
    if (kind === 'day') return [iso, iso];
    if (kind === 'week') {
      const wd = (dateObj(iso).getDay() + 6) % 7; // lundi = 0
      const start = shiftDays(iso, -wd);
      return [start, shiftDays(start, 6)];
    }
    const dt = dateObj(iso);
    const first = isoOf(new Date(dt.getFullYear(), dt.getMonth(), 1, 12));
    const last = isoOf(new Date(dt.getFullYear(), dt.getMonth() + 1, 0, 12));
    return [first, last];
  }

  function shiftPeriod(kind, iso, dir) {
    if (kind === 'day') return shiftDays(iso, dir);
    if (kind === 'week') return shiftDays(iso, 7 * dir);
    const dt = dateObj(iso);
    return isoOf(new Date(dt.getFullYear(), dt.getMonth() + dir, 1, 12));
  }

  function periodLabel(kind, [from, to]) {
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    if (kind === 'day') return cap(longDate(from)) + (from === state.today ? ' (aujourd’hui)' : '');
    if (kind === 'week') {
      const sameMonth = from.slice(0, 7) === to.slice(0, 7);
      return 'Semaine du ' + fmt(from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' }) + ' au ' + fmt(to, { day: 'numeric', month: 'long' });
    }
    return cap(dateObj(from).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
  }

  function stats([from, to]) {
    const list = state.orders.filter((o) => o.date >= from && o.date <= to && o.status !== 'annulée');
    const sum = (arr, f) => arr.reduce((t, o) => t + f(o), 0);
    const priced = list.filter((o) => o.total != null);
    const done = priced.filter((o) => o.status === 'retirée');
    return {
      list,
      orders: list.length,
      qty: sum(list, (o) => o.qty),
      revenue: sum(priced, (o) => o.total),
      cashed: sum(done, (o) => o.total),
      unpriced: sum(list.filter((o) => o.total == null), (o) => o.qty),
    };
  }

  function kpi(label, value, sub) {
    const k = el('div', 'kpi');
    k.appendChild(el('span', 'kpi-label', label));
    k.appendChild(el('strong', 'kpi-value', value));
    if (sub) k.appendChild(el('span', 'kpi-sub', sub));
    return k;
  }

  function evolution(now, before) {
    if (!before) return now ? 'nouveau' : '';
    const pct = Math.round(((now - before) / before) * 100);
    const names = { day: 'à la veille', week: 'à la semaine précédente', month: 'au mois précédent' };
    return (pct >= 0 ? '+' : '') + pct + ' % par rapport ' + names[period];
  }

  function renderCompta() {
    if (!anchor) anchor = state.today;
    $$('#period button').forEach((b) => b.classList.toggle('on', b.dataset.period === period));
    const range = periodRange(period, anchor);
    $('#period-label').textContent = periodLabel(period, range);
    $('#period-today').hidden = range[0] <= state.today && state.today <= range[1];

    const st = stats(range);
    const prev = stats(periodRange(period, shiftPeriod(period, anchor, -1)));

    const k = $('#kpis');
    k.innerHTML = '';
    k.appendChild(kpi('Plats commandés', String(st.qty), st.orders + ' commande' + (st.orders > 1 ? 's' : '')));
    k.appendChild(kpi('Chiffre d’affaires', euros(st.revenue), evolution(st.revenue, prev.revenue)));
    k.appendChild(kpi('Déjà encaissé', euros(st.cashed), 'commandes retirées'));
    const pricedOrders = st.list.filter((o) => o.total != null).length;
    k.appendChild(kpi('Panier moyen', pricedOrders ? euros(st.revenue / pricedOrders) : '—', 'par commande'));
    $('#compta-note').textContent = st.unpriced
      ? '⚠️ ' + st.unpriced + ' plat(s) commandé(s) sans prix ne sont pas comptés dans le chiffre d’affaires : ajoutez le prix du plat (Plats → Modifier).'
      : '';

    // Par plat
    const byDish = {};
    st.list.forEach((o) => {
      const r = (byDish[o.dishTitle] = byDish[o.dishTitle] || { qty: 0, total: 0 });
      r.qty += o.qty;
      r.total += o.total || 0;
    });
    const rows = Object.entries(byDish).sort((a, b) => b[1].total - a[1].total || b[1].qty - a[1].qty);
    const tbox = $('#by-dish');
    tbox.innerHTML = '';
    if (!rows.length) tbox.appendChild(el('p', 'empty-admin', 'Aucune commande sur cette période.'));
    else {
      const table = el('table', 'compta-table');
      const head = el('tr');
      ['Plat', 'Qté', 'Montant'].forEach((t) => head.appendChild(el('th', null, t)));
      table.appendChild(head);
      rows.forEach(([name, r]) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, name));
        tr.appendChild(el('td', 'num', String(r.qty)));
        tr.appendChild(el('td', 'num', euros(r.total)));
        table.appendChild(tr);
      });
      const tot = el('tr', 'total');
      tot.appendChild(el('td', null, 'Total'));
      tot.appendChild(el('td', 'num', String(st.qty)));
      tot.appendChild(el('td', 'num', euros(st.revenue)));
      table.appendChild(tot);
      tbox.appendChild(table);
    }

    // Jour par jour (semaine et mois)
    $('#by-day-card').hidden = period === 'day';
    const dbox = $('#by-day');
    dbox.innerHTML = '';
    if (period !== 'day') {
      const days = [];
      for (let d = range[0]; d <= range[1]; d = shiftDays(d, 1)) {
        const s2 = stats([d, d]);
        if (s2.qty || period === 'week') days.push([d, s2]);
      }
      const max = Math.max(1, ...days.map(([, x]) => x.revenue));
      if (!days.length) dbox.appendChild(el('p', 'empty-admin', 'Aucune commande sur cette période.'));
      days.forEach(([d, x]) => {
        const row = el('button', 'day-row' + (d === state.today ? ' is-today' : ''));
        row.type = 'button';
        row.title = 'Voir le détail de ce jour';
        row.appendChild(el('span', 'day-name', fmt(d, period === 'week' ? { weekday: 'long', day: 'numeric' } : { weekday: 'short', day: 'numeric' })));
        const bar = el('span', 'bar');
        const fill = el('span', 'bar-fill');
        fill.style.width = Math.round((x.revenue / max) * 100) + '%';
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(el('span', 'day-qty', x.qty + ' plat' + (x.qty > 1 ? 's' : '')));
        row.appendChild(el('span', 'day-rev', euros(x.revenue)));
        row.addEventListener('click', () => {
          period = 'day';
          anchor = d;
          renderCompta();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        dbox.appendChild(row);
      });
    }
  }

  $$('#period button').forEach((b) =>
    b.addEventListener('click', () => {
      period = b.dataset.period;
      renderCompta();
    })
  );
  $('#period-prev').addEventListener('click', () => {
    anchor = shiftPeriod(period, anchor, -1);
    renderCompta();
  });
  $('#period-next').addEventListener('click', () => {
    anchor = shiftPeriod(period, anchor, 1);
    renderCompta();
  });
  $('#period-today').addEventListener('click', () => {
    anchor = state.today;
    renderCompta();
  });

  // ---------- fermetures exceptionnelles ----------
  function renderClosures() {
    const box = $('#closures');
    box.innerHTML = '';
    const list = (state.settings.closures || []).filter((c) => c.to >= state.today);
    if (!list.length) box.appendChild(el('p', 'empty-admin', 'Aucune fermeture prévue.'));
    list.forEach((c) => {
      const row = el('div', 'item no-thumb');
      const meta = el('div', 'meta');
      const when = c.from === c.to ? longDate(c.from) : 'Du ' + longDate(c.from) + ' au ' + longDate(c.to);
      meta.appendChild(el('strong', null, when));
      meta.appendChild(el('span', null, (c.reason || 'Fermeture exceptionnelle') + (c.from <= state.today ? ' · en cours' : '')));
      row.appendChild(meta);
      const act = el('div', 'actions');
      act.appendChild(
        button('Supprimer', 'danger', async () => {
          if (!confirm('Supprimer cette fermeture ?')) return;
          await api('/api/closures/' + c.id, { method: 'DELETE' });
          toast('Fermeture supprimée');
          await load();
        })
      );
      row.appendChild(act);
      box.appendChild(row);
    });
    $('#closure-form').from.min = state.today;
    $('#closure-form').to.min = state.today;
  }

  $('#closure-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const msg = $('#closure-msg');
    msg.className = 'form-msg';
    msg.textContent = '';
    try {
      await api('/api/closures', { method: 'POST', body: { from: f.from.value, to: f.to.value || f.from.value, reason: f.reason.value } });
      f.reset();
      toast('✅ Fermeture enregistrée : le site est à jour');
      await load();
    } catch (err) {
      msg.textContent = err.message;
      msg.classList.add('error');
    }
  });
  $('#closure-form').from.addEventListener('change', (e) => {
    const to = $('#closure-form').to;
    to.min = e.target.value;
    if (!to.value || to.value < e.target.value) to.value = e.target.value;
  });

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
          renderCompta();
        })
        .catch(() => {});
    }
  }, 60000);

  load();
})();
