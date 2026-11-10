(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  let state = { settings: {}, dishes: [], reservations: [] };
  let category = 'Plat';
  let resizedPhoto = null;

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

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const todayIso = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
    renderAll();
  }

  function renderAll() {
    renderMenu();
    renderHistory();
    renderResas();
    fillSettings();
  }

  // ---------- onglets ----------
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t.dataset.tab));
      window.scrollTo(0, 0);
    })
  );

  // ---------- publication d'un plat ----------
  document.querySelectorAll('#category button').forEach((b) =>
    b.addEventListener('click', () => {
      category = b.dataset.cat;
      document.querySelectorAll('#category button').forEach((x) => x.classList.toggle('on', x === b));
    })
  );

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

  $('#photo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    resizedPhoto = await resizeImage(file);
    const prev = $('#photo-preview');
    prev.src = URL.createObjectURL(resizedPhoto);
    prev.hidden = false;
    $('#photo-placeholder').hidden = true;
  });

  function resetDishForm() {
    $('#dish-form').reset();
    resizedPhoto = null;
    $('#photo-preview').hidden = true;
    $('#photo-placeholder').hidden = false;
  }

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
    fd.append('replace', f.replace.checked ? 'true' : 'false');
    if (resizedPhoto) fd.append('photo', resizedPhoto, 'photo.jpg');

    const btn = $('#publish-btn');
    btn.disabled = true;
    btn.textContent = 'Publication…';
    try {
      await api('/api/dishes', { method: 'POST', form: fd });
      resetDishForm();
      msg.textContent = '';
      toast('✅ Plat publié sur le site !');
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
    meta.appendChild(el('span', null, [d.category, d.price && d.price + (/€/.test(d.price) ? '' : ' €'), fmtDate(d.postedAt)].filter(Boolean).join(' · ')));
    row.appendChild(meta);
    const act = el('div', 'actions');
    actions.forEach((a) => act.appendChild(a));
    row.appendChild(act);
    return row;
  }

  async function setOnMenu(d, onMenu) {
    try {
      await api('/api/dishes/' + d.id, { method: 'PATCH', body: { onMenu } });
      toast(onMenu ? '✅ Remis sur l’ardoise' : 'Retiré de l’ardoise');
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  async function editDish(d) {
    const title = prompt('Nom du plat', d.title);
    if (title === null) return;
    const price = prompt('Prix', d.price);
    if (price === null) return;
    const description = prompt('Description', d.description);
    if (description === null) return;
    try {
      await api('/api/dishes/' + d.id, { method: 'PATCH', body: { title, price, description } });
      toast('Modifié');
      await load();
    } catch (err) {
      toast(err.message);
    }
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

  function renderMenu() {
    const box = $('#on-menu');
    box.innerHTML = '';
    const list = state.dishes.filter((d) => d.onMenu);
    if (!list.length) box.appendChild(el('p', 'empty-admin', 'Aucun plat sur l’ardoise. Publiez-en un ci-dessus !'));
    list.forEach((d) =>
      box.appendChild(dishItem(d, [button('Modifier', '', () => editDish(d)), button('Retirer', 'danger', () => setOnMenu(d, false))]))
    );
  }

  function renderHistory() {
    const box = $('#history');
    box.innerHTML = '';
    const q = $('#history-search').value.trim().toLowerCase();
    const list = state.dishes.filter((d) => !d.onMenu && (!q || d.title.toLowerCase().includes(q)));
    if (!list.length) box.appendChild(el('p', 'empty-admin', q ? 'Aucun résultat.' : 'Rien pour l’instant.'));
    list.slice(0, 60).forEach((d) =>
      box.appendChild(dishItem(d, [button('Remettre', 'primary', () => setOnMenu(d, true)), button('✕', 'danger', () => deleteDish(d))]))
    );
  }
  $('#history-search').addEventListener('input', renderHistory);

  $('#clear-menu').addEventListener('click', async () => {
    if (!confirm('Retirer tous les plats de l’ardoise ? (ils restent dans l’historique)')) return;
    await api('/api/dishes/clear', { method: 'POST' });
    toast('Ardoise vidée');
    await load();
  });

  // ---------- réservations ----------
  async function setStatus(r, status) {
    try {
      await api('/api/reservations/' + r.id, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      toast(err.message);
    }
  }

  function resaCard(r) {
    const c = el('div', 'resa ' + r.status);
    const top = el('div', 'top');
    const when = new Date(r.date + 'T' + r.time).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    top.appendChild(el('span', 'when', when + ' · ' + r.time.replace(':', 'h') + ' · ' + r.people + ' pers.'));
    top.appendChild(el('span', 'status', r.status));
    c.appendChild(top);
    const who = el('p');
    who.appendChild(document.createTextNode(r.name + ' — '));
    const tel = el('a', null, r.phone);
    tel.href = 'tel:' + r.phone.replace(/[^\d+]/g, '');
    who.appendChild(tel);
    c.appendChild(who);
    if (r.message) c.appendChild(el('p', null, '« ' + r.message + ' »'));
    const act = el('div', 'actions');
    if (r.status !== 'confirmée') act.appendChild(button('Confirmer', 'primary', () => setStatus(r, 'confirmée')));
    if (r.status !== 'annulée') act.appendChild(button('Annuler', '', () => setStatus(r, 'annulée')));
    act.appendChild(
      button('Supprimer', 'danger', async () => {
        if (!confirm('Supprimer cette réservation ?')) return;
        await api('/api/reservations/' + r.id, { method: 'DELETE' });
        await load();
      })
    );
    act.style.display = 'flex';
    act.style.gap = '6px';
    act.style.flexWrap = 'wrap';
    c.appendChild(act);
    return c;
  }

  function renderResas() {
    const t = todayIso();
    const upcoming = state.reservations.filter((r) => r.date >= t);
    const past = state.reservations.filter((r) => r.date < t).reverse();
    const box = $('#resa-list');
    box.innerHTML = '';
    if (!upcoming.length) box.appendChild(el('p', 'empty-admin', 'Aucune réservation à venir.'));
    upcoming.forEach((r) => box.appendChild(resaCard(r)));
    const pbox = $('#resa-past');
    pbox.innerHTML = '';
    if (!past.length) pbox.appendChild(el('p', 'empty-admin', 'Aucune.'));
    past.slice(0, 50).forEach((r) => pbox.appendChild(resaCard(r)));
    const n = upcoming.filter((r) => r.status === 'nouvelle').length;
    $('#resa-badge').textContent = n;
    $('#resa-badge').hidden = !n;
  }

  // ---------- infos ----------
  function fillSettings() {
    const f = $('#settings-form');
    ['name', 'tagline', 'phone', 'address', 'hours', 'facebook', 'instagram'].forEach((k) => (f[k].value = state.settings[k] || ''));
    f.reservationsOpen.checked = !!state.settings.reservationsOpen;
  }

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = { reservationsOpen: f.reservationsOpen.checked };
    ['name', 'tagline', 'phone', 'address', 'hours', 'facebook', 'instagram'].forEach((k) => (body[k] = f[k].value));
    try {
      state.settings = await api('/api/settings', { method: 'PUT', body });
      toast('✅ Informations enregistrées');
    } catch (err) {
      toast(err.message);
    }
  });

  // Actualise les réservations régulièrement
  setInterval(() => {
    if (!$('#app-view').hidden && document.visibilityState === 'visible') {
      api("/api/admin").then((s) => { state.reservations = s.reservations; renderResas(); }).catch(() => {});
    }
  }, 60000);

  load();
})();
