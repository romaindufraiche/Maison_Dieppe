(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#today').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

  // Date minimale de réservation : aujourd'hui
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dateInput = document.querySelector('input[name="date"]');
  dateInput.min = iso;
  dateInput.value = iso;

  const ORDER = ['Entrée', 'Plat', 'Dessert', 'Boisson'];

  function renderMenu(menu) {
    const box = $('#menu');
    box.innerHTML = '';
    if (!menu.length) {
      box.appendChild(el('p', 'empty', "L'ardoise du jour arrive bientôt… Repassez un peu plus tard !"));
      return;
    }
    const groups = {};
    menu.forEach((d) => (groups[d.category] = groups[d.category] || []).push(d));
    const cats = Object.keys(groups).sort((a, b) => {
      const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    cats.forEach((cat) => {
      if (cats.length > 1) box.appendChild(el('h3', 'cat', cat === 'Plat' ? 'Plats' : cat + 's'));
      groups[cat].forEach((d) => {
        const card = el('article', 'dish' + (d.photo ? ' has-photo' : ''));
        if (d.photo) {
          const img = el('img');
          img.src = d.photo;
          img.alt = d.title;
          img.loading = 'lazy';
          card.appendChild(img);
        }
        const body = el('div', 'dish-body');
        const head = el('div', 'dish-head');
        head.appendChild(el('h4', null, d.title));
        if (d.price) head.appendChild(el('span', 'price', /€/.test(d.price) ? d.price : d.price + ' €'));
        body.appendChild(head);
        if (d.description) body.appendChild(el('p', null, d.description));
        card.appendChild(body);
        box.appendChild(card);
      });
    });
  }

  function renderSettings(s) {
    document.querySelectorAll('[data-name]').forEach((n) => (n.textContent = s.name));
    document.title = s.name + ' — Le plat du jour';
    if (s.tagline) $('#tagline').textContent = s.tagline;
    $('#address').textContent = s.address || '';
    $('#hours').textContent = s.hours || '';
    if (s.phone) {
      const tel = 'tel:' + s.phone.replace(/[^\d+]/g, '');
      $('#call-btn').href = tel;
      $('#call-btn').textContent = 'Appeler · ' + s.phone;
      $('#call-btn').hidden = false;
      $('#phone-link').href = tel;
      $('#phone-link').textContent = s.phone;
      $('#phone-link').hidden = false;
    }
    if (s.facebook) {
      $('#fb-link').href = s.facebook;
      $('#fb-link').hidden = false;
    }
    if (!s.reservationsOpen) {
      $('#reserve-form').hidden = true;
      $('#reserve-lead').textContent = s.phone
        ? 'Pour réserver, appelez-nous au ' + s.phone + '.'
        : 'Les réservations en ligne sont momentanément fermées.';
    }
  }

  fetch('/api/public')
    .then((r) => r.json())
    .then((data) => {
      renderSettings(data.settings);
      renderMenu(data.menu);
    })
    .catch(() => {
      $('#menu').innerHTML = '';
      $('#menu').appendChild(el('p', 'empty', "Impossible de charger l'ardoise pour le moment."));
    });

  // Formulaire de réservation
  $('#reserve-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const msg = $('#reserve-msg');
    msg.className = 'form-msg';
    if (!form.checkValidity()) {
      msg.textContent = 'Merci de remplir tous les champs obligatoires.';
      msg.classList.add('error');
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      form.reset();
      dateInput.value = iso;
      msg.textContent = 'Merci ! Votre demande est bien envoyée, nous vous rappelons pour confirmer.';
      msg.classList.add('ok');
    } catch (err) {
      msg.textContent = err.message || "Une erreur est survenue, merci d'appeler le restaurant.";
      msg.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
})();
