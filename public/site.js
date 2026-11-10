(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  const dateObj = (iso) => new Date(iso + 'T12:00:00');
  const fmt = (iso, opts) => dateObj(iso).toLocaleDateString('fr-FR', opts);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const dayName = (iso) => cap(fmt(iso, { weekday: 'long' }));
  const longDate = (iso) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const priceLabel = (p) => (p ? (/€/.test(p) ? p : p + ' €') : '');
  const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '');

  let data = null;

  // ------------------------------------------------------------------ menu
  function reserveBtn(dish, label) {
    const b = el('button', 'btn btn-red', label || 'Réserver');
    b.type = 'button';
    if (dish.date && !timeSlots(dish.date).length) {
      b.disabled = true;
      b.className = 'btn btn-off';
      b.textContent = 'Retraits terminés';
      return b;
    }
    b.addEventListener('click', () => openOrder(dish));
    return b;
  }

  function renderMenu() {
    const { menu, today, settings } = data;
    const canOrder = settings.ordersOpen;
    const dated = menu.filter((d) => d.date);
    const vitrine = menu.filter((d) => !d.date);
    const todays = dated.filter((d) => d.date === today);
    const week = dated.filter((d) => d.date !== today);

    // Plat du jour
    if (todays.length) {
      $('#today-label').textContent = 'Aujourd’hui · ' + longDate(today);
      const box = $('#today-dish');
      box.innerHTML = '';
      todays.forEach((d) => {
        const card = el('article', 'today-card' + (d.photo ? ' has-photo' : ''));
        if (d.photo) {
          const img = el('img');
          img.src = d.photo;
          img.alt = d.title;
          card.appendChild(img);
        }
        const body = el('div', 'today-body');
        body.appendChild(el('h3', null, d.title));
        if (d.description) body.appendChild(el('p', null, d.description));
        const foot = el('div', 'today-foot');
        if (d.price) foot.appendChild(el('span', 'price', priceLabel(d.price)));
        if (canOrder) foot.appendChild(reserveBtn(d, 'Réserver ce plat'));
        body.appendChild(foot);
        card.appendChild(body);
        box.appendChild(card);
      });
      $('#today-block').hidden = false;
    }

    // Menu de la semaine
    if (week.length) {
      const list = $('#week');
      list.innerHTML = '';
      week.forEach((d) => {
        const li = el('li', 'week-row');
        const day = el('div', 'week-day');
        day.appendChild(el('strong', null, dayName(d.date)));
        day.appendChild(el('span', null, fmt(d.date, { day: 'numeric', month: 'short' })));
        li.appendChild(day);
        const txt = el('div', 'week-dish');
        txt.appendChild(el('strong', null, d.title));
        if (d.description) txt.appendChild(el('span', null, d.description));
        li.appendChild(txt);
        if (d.price) li.appendChild(el('span', 'price small', priceLabel(d.price)));
        if (canOrder) li.appendChild(reserveBtn(d));
        list.appendChild(li);
      });
      $('#week-block').hidden = false;
    }

    // Vitrine
    if (vitrine.length) {
      const grid = $('#vitrine');
      grid.innerHTML = '';
      vitrine.forEach((d) => {
        const card = el('article', 'v-card');
        const media = el('div', 'v-media');
        if (d.photo) {
          const img = el('img');
          img.src = d.photo;
          img.alt = d.title;
          img.loading = 'lazy';
          media.appendChild(img);
        } else {
          media.appendChild(el('span', 'v-mono', 'MD'));
        }
        if (d.category) media.appendChild(el('span', 'tag', d.category));
        card.appendChild(media);
        const body = el('div', 'v-body');
        body.appendChild(el('h3', null, d.title));
        if (d.description) body.appendChild(el('p', null, d.description));
        const foot = el('div', 'v-foot');
        foot.appendChild(el('span', 'price small', priceLabel(d.price)));
        if (canOrder) foot.appendChild(reserveBtn(d));
        body.appendChild(foot);
        card.appendChild(body);
        grid.appendChild(card);
      });
      $('#vitrine-block').hidden = false;
    }

    $('#menu-empty').hidden = menu.length > 0;
    if (!canOrder) {
      const lead = $('.order .lead');
      lead.textContent = 'Les réservations en ligne sont en pause : appelez-nous au ' + settings.phone + ', on s’occupe de tout.';
    }
  }

  function renderSettings(s) {
    if (s.phone) {
      $$('[data-phone]').forEach((n) => (n.textContent = s.phone));
      $$('[data-tel], #top-call').forEach((a) => (a.href = telHref(s.phone)));
    }
    if (s.address) {
      const a = $('[data-address]');
      a.textContent = s.address;
      a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.name + ' ' + s.address.replace(/\n/g, ' '));
    }
    if (s.hours) $('[data-hours]').textContent = s.hours;
    $$('[data-instagram]').forEach((a) => (s.instagram ? (a.href = s.instagram) : a.remove()));
    $$('[data-facebook]').forEach((a) => (s.facebook ? (a.href = s.facebook) : a.remove()));
  }

  // ------------------------------------------------------------ commande
  const dlg = $('#order-dialog');
  const form = $('#order-form');
  let current = null;
  let qty = 1;
  let chosenDate = null;

  function timeSlots(date) {
    const { openTime, closeTime } = data.settings;
    const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
    let start = toMin(openTime);
    const end = toMin(closeTime);
    if (date === data.today) {
      const now = new Date();
      const min = now.getHours() * 60 + now.getMinutes() + 30; // 30 min pour préparer
      start = Math.max(start, Math.ceil(min / 15) * 15);
    }
    const out = [];
    for (let m = start; m <= end; m += 15) {
      out.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
    }
    return out;
  }

  function fillTimes() {
    const sel = $('#od-time');
    const prev = sel.value || localStorage.getItem('md_time') || '12:00';
    sel.innerHTML = '';
    const slots = timeSlots(chosenDate);
    if (!slots.length) {
      const o = el('option', null, 'Plus de créneau ce jour-là');
      o.value = '';
      sel.appendChild(o);
      return;
    }
    slots.forEach((t) => {
      const o = el('option', null, t.replace(':', 'h'));
      o.value = t;
      sel.appendChild(o);
    });
    sel.value = slots.includes(prev) ? prev : slots.find((t) => t >= prev) || slots[0];
  }

  function dayLabel(iso) {
    if (iso === data.today) return 'Aujourd’hui';
    const tomorrow = new Date(dateObj(data.today).getTime() + 864e5).toISOString().slice(0, 10);
    if (iso === tomorrow) return 'Demain';
    return cap(fmt(iso, { weekday: 'short', day: 'numeric' }));
  }

  function pickDate(iso) {
    chosenDate = iso;
    $$('#od-days button').forEach((b) => b.classList.toggle('on', b.dataset.date === iso));
    fillTimes();
  }

  function openOrder(dish) {
    current = dish;
    qty = 1;
    $('#od-qty').textContent = qty;
    $('#od-title').textContent = dish.title;
    const photo = $('#od-photo');
    photo.hidden = !dish.photo;
    if (dish.photo) photo.src = dish.photo;

    const days = $('#od-days');
    days.innerHTML = '';
    if (dish.date) {
      $('#od-when').textContent = 'Plat du ' + longDate(dish.date);
      $('#od-days-wrap').hidden = true;
      pickDate(dish.date);
    } else {
      $('#od-when').textContent = dish.category || 'En vitrine';
      $('#od-days-wrap').hidden = false;
      // Si plus aucun créneau aujourd'hui, on ne propose pas « Aujourd'hui »
      const choices = data.pickupDays.filter((d) => timeSlots(d).length);
      choices.forEach((d) => {
        const b = el('button', 'chip', dayLabel(d));
        b.type = 'button';
        b.dataset.date = d;
        b.addEventListener('click', () => pickDate(d));
        days.appendChild(b);
      });
      pickDate(choices[0]);
    }

    form.name.value = localStorage.getItem('md_name') || '';
    form.phone.value = localStorage.getItem('md_phone') || '';
    form.message.value = '';
    $('#od-msg').textContent = '';
    $('#od-msg').className = 'form-msg';
    form.hidden = false;
    $('#order-done').hidden = true;
    dlg.showModal();
  }

  $$('[data-qty]').forEach((b) =>
    b.addEventListener('click', () => {
      qty = Math.max(1, Math.min(50, qty + Number(b.dataset.qty)));
      $('#od-qty').textContent = qty;
    })
  );

  $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog').forEach((d) =>
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close(); // clic en dehors
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#od-msg');
    msg.className = 'form-msg';
    const time = $('#od-time').value;
    if (!form.name.value.trim() || !form.phone.value.trim()) {
      msg.textContent = 'Indiquez votre nom et votre téléphone pour que l’on puisse vous joindre.';
      msg.classList.add('error');
      return;
    }
    if (!time) {
      msg.textContent = 'Choisissez un autre jour de retrait.';
      msg.classList.add('error');
      return;
    }
    const btn = $('#od-submit');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishId: current.id,
          qty,
          date: chosenDate,
          time,
          name: form.name.value,
          phone: form.phone.value,
          message: form.message.value,
          website: form.website.value,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Erreur');
      localStorage.setItem('md_name', form.name.value.trim());
      localStorage.setItem('md_phone', form.phone.value.trim());
      localStorage.setItem('md_time', time);
      const done = $('#done-text');
      done.innerHTML = '';
      done.appendChild(el('strong', null, qty + ' × ' + current.title));
      done.appendChild(document.createElement('br'));
      done.appendChild(document.createTextNode('À retirer ' + longDate(chosenDate) + ', à partir de ' + time.replace(':', 'h') + '.'));
      const map = $('#order-done iframe');
      if (!map.src) map.src = map.dataset.mapSrc;
      form.hidden = true;
      $('#order-done').hidden = false;
    } catch (err) {
      msg.textContent = err.message || 'Une erreur est survenue, appelez-nous directement.';
      msg.classList.add('error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Réserver';
    }
  });

  // ------------------------------------------------- message traiteur
  const cdlg = $('#contact-dialog');
  const cform = $('#contact-form');
  let kind = '';
  $$('#ct-kinds .chip').forEach((c) =>
    c.addEventListener('click', () => {
      kind = kind === c.dataset.kind ? '' : c.dataset.kind;
      $$('#ct-kinds .chip').forEach((x) => x.classList.toggle('on', x.dataset.kind === kind));
    })
  );
  $$('[data-contact]').forEach((b) =>
    b.addEventListener('click', () => {
      cform.hidden = false;
      $('#contact-done').hidden = true;
      $('#ct-msg').textContent = '';
      cform.name.value = cform.name.value || localStorage.getItem('md_name') || '';
      cform.phone.value = cform.phone.value || localStorage.getItem('md_phone') || '';
      if (data) cform.date.min = data.today;
      cdlg.showModal();
    })
  );
  cform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#ct-msg');
    msg.className = 'form-msg';
    const btn = $('#ct-submit');
    btn.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(cform));
      body.kind = kind;
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Erreur');
      cform.reset();
      kind = '';
      $$('#ct-kinds .chip').forEach((x) => x.classList.remove('on'));
      cform.hidden = true;
      $('#contact-done').hidden = false;
    } catch (err) {
      msg.textContent = err.message || 'Une erreur est survenue, appelez-nous directement.';
      msg.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });

  // -------------------------------------------------------------- posts
  function renderPosts(posts) {
    const grid = $('#posts');
    posts.forEach((p) => {
      const a = el('a', 'post');
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';
      const img = el('img');
      img.src = p.image;
      img.alt = '';
      img.loading = 'lazy';
      a.appendChild(img);
      const body = el('div', 'post-body');
      body.appendChild(el('time', null, fmt(p.date, { day: 'numeric', month: 'long', year: 'numeric' })));
      body.appendChild(el('p', null, p.text));
      body.appendChild(el('span', 'more', 'Voir sur Instagram →'));
      a.appendChild(body);
      grid.appendChild(a);
    });
  }

  // -------------------------------------------------------------- init
  fetch('/api/public')
    .then((r) => r.json())
    .then((d) => {
      data = d;
      renderSettings(d.settings);
      renderMenu();
    })
    .catch(() => {
      $('#menu-empty').hidden = false;
      $('#menu-empty').textContent = 'Impossible de charger le menu pour le moment : appelez-nous pour réserver.';
    });

  fetch('/posts.json')
    .then((r) => r.json())
    .then(renderPosts)
    .catch(() => {});
})();
