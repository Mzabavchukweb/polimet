/* Polimet: logika prototypu (koszyk, listy, filtry, wyszukiwarka, dobór łańcuchów, zamówienie). Dane: dane/dane.js (window.PM). */
window.PMstart = function () {
  'use strict';
  var PM = window.PM, $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var P = {}; PM.prod.forEach(function (p) { P[p.id] = p; });
  function ma(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }
  // jak w sklepie: ilość to wielokrotność krotności, więc minimum zaokrąglone w górę do krotności (min 20, co 100 = od 100)
  PM.prod.forEach(function (p) { p.kr = p.kr || 1; p.min = Math.ceil((p.min || 1) / p.kr) * p.kr; });
  var URLP = new URLSearchParams(location.search);
  PM.firma.telTxt = PM.firma.tel.replace(/^\+48\s*/, '');
  var NA_STRONE = 30;

  function zl(n) { return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0zł'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // twarda spacja po jednoliterowych spójnikach (bez sierotek na końcu linii)
  function tw(s) { return esc(s).replace(/(^|[\s(])([aiouwzAIOUWZ]) /g, '$1$2 '); }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l'); }
  function czyt(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function zapisz(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* tryb prywatny: koszyk tylko w tej karcie */ } }
  function img(src, alt, w, h, leniwy) { return src ? '<img src="' + src + '" alt="' + esc(alt || '') + '" width="' + w + '" height="' + h + '"' + (leniwy === false ? '' : ' loading="lazy"') + ' decoding="async">' : ''; }

  /* ---------- kategorie ---------- */
  function podrzedne(id) { var w = [id]; (PM.kat[id] ? PM.kat[id].dzieci : []).forEach(function (c) { w = w.concat(podrzedne(c)); }); return w; }
  function produktyKat(id) { var ids = podrzedne(id); return PM.prod.filter(function (p) { return p.k.some(function (k) { return ids.indexOf(k) > -1; }); }); }
  function sciezka(id) { var w = []; while (id && id !== '0' && PM.kat[id]) { w.unshift(PM.kat[id]); id = PM.kat[id].r; } return w; }
  function katProduktu(p) { var najg = null; p.k.forEach(function (k) { if (PM.kat[k] && (!najg || sciezka(k).length > sciezka(najg).length)) najg = k; }); return najg; }
  function liczbaProd(n) { var j = n === 1 ? 'produkt' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'produkty' : 'produktów'; return n + ' ' + j; }

  /* ---------- wyszukiwanie: liczba z jednostką (6 mm) to rozmiar, sama liczba stoi osobno (6 nie trafia w 6x26) ---------- */
  function wzorceSzukania(fraza) {
    // rozmiar opony jak na boku opony (185/65 R15) zapisany w nazwach jako 185/65x15
    fraza = norm(fraza).replace(/(\d{3})\s*\/\s*(\d{2,3})\s*z?r\s*(\d{2})\b/g, '$1/$2x$3');
    var slowa = fraza.split(/\s+/).filter(Boolean), w = [], jedn = /^(mm|m|mb|cm|kg|t)$/;
    for (var i = 0; i < slowa.length; i++) {
      var s = slowa[i].replace(/,/g, '.'), fr = s.match(/^r(\d{2})$/);
      // „klasy 8” obejmuje też 8.8, „klasy 10” też 10.9 (śruby), a „klasy 8” haków i łańcuchów zostaje jak było
      var kl = /^klas/.test(s) && (slowa[i + 1] || '').match(/^(\d+)$/);
      if (kl) { w.push(new RegExp('kl(?:as\\w*|\\.)\\s*' + kl[1] + '([.,]\\d+)?(?![\\d])')); i++; continue; }
      if (fr) { w.push(new RegExp('(x|r\\s?)' + fr[1] + '\\b')); continue; }
      var m = s.match(/^(\d+(?:\.\d+)?)(mm|m|mb|cm|kg|t)?$/);
      if (m && !m[2] && jedn.test(slowa[i + 1] || '')) m[2] = slowa[++i];
      w.push(m ? new RegExp('(^|[^\\d.,])' + m[1].replace('.', '[.,]') + (m[2] ? '\\s*' + m[2] + '\\b' : '(?![\\d.,]*\\d)(?!x\\d)'))
        : new RegExp(rdzen(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    return w;
  }
  // prosta odmiana: haki/hak, liny/lina, szekle/szekla, łańcuchów/łańcuch
  function rdzen(s) {
    if (s.length >= 7 && /(ami|ach|ow|om|em)$/.test(s)) return s.replace(/(ami|ach|ow|om|em)$/, '');
    return s.length >= 4 && /[aeiouy]$/.test(s) ? s.slice(0, -1) : s;
  }
  function szukaj(fraza) { var w = wzorceSzukania(fraza); return w.length ? PM.prod.filter(function (p) { var t = norm(p.n + ' ' + p.kod); return w.every(function (r) { return r.test(t); }); }) : []; }

  /* ---------- koszyk ---------- */
  var koszyk = czyt('pm_koszyk', []);
  // produkt wycofany po aktualizacji danych albo zła ilość w pamięci przeglądarki: wyrzucamy/poprawiamy zamiast psuć stronę
  koszyk = (Array.isArray(koszyk) ? koszyk : []).filter(function (x) { return x && ma(P, x.id); }).map(function (x) { return { id: x.id, q: ilePoprawna(P[x.id], x.q) }; });
  zapisz('pm_koszyk', koszyk);
  function zapiszKoszyk() { zapisz('pm_koszyk', koszyk); licznik(); oznacz(); }
  // przy produktach na listach: ile już jest w koszyku
  function oznacz() {
    $$('[data-wk]').forEach(function (e) {
      var x = koszyk.find(function (k) { return k.id === e.dataset.wk; });
      e.textContent = x ? 'W koszyku: ' + x.q + ' ' + P[x.id].jm.replace(/\.$/, '') : '';
    });
  }
  function ilePoprawna(p, q) { q = parseFloat(String(q).replace(',', '.')); return q > 0 ? Math.max(p.min, Math.round(q / p.kr) * p.kr) : p.min; }
  function dodaj(id, q, cicho) {
    var p = P[id], chciano = parseFloat(String(q).replace(',', '.')); q = ilePoprawna(p, q);
    var poz = koszyk.find(function (x) { return x.id === id; });
    if (poz) poz.q += q; else koszyk.push({ id: id, q: q });
    zapiszKoszyk();
    if (cicho) return q;
    notka('Dodano do koszyka: ' + esc(p.n) + ', ' + (q + ' ' + p.jm).replace(/\.$/, '') + '. ' + (chciano > 0 && chciano !== q ? 'Sprzedaż po ' + p.kr + ' ' + p.jm.replace(/\.$/, '') + (p.min > p.kr ? ', od ' + p.min : '') + ', więc ilość zaokrągliliśmy. ' : '') + (function (t) { return t.charAt(0).toUpperCase() + t.slice(1); })(gratis()), '<a href="koszyk.html">Przejdź do koszyka</a>');
    var g = $('[data-gratis]'); if (g && dodaj.poDodaniu) dodaj.poDodaniu();
  }
  function gratis(dodatek) {
    var brak = PM.wysylka.darmowa - wartosc() - (dodatek || 0);
    return brak > 0 ? 'do darmowej dostawy brakuje <b>' + zl(brak) + '</b>.' : 'dostawa kurierem będzie gratis.';
  }
  function licznik() {
    var w = wartosc(), zmiana = licznik.p !== undefined && licznik.p !== w; licznik.p = w;
    if (zmiana) $$('.akcje__kosz').forEach(function (e) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); });
    $$('[data-licznik]').forEach(function (e) { e.textContent = koszyk.length; e.hidden = !koszyk.length; });
    $$('[data-suma]').forEach(function (e) { e.textContent = koszyk.length ? zl(wartosc()) : ''; });
    $$('.akcje__kosz').forEach(function (e) { e.setAttribute('aria-label', koszyk.length ? 'Koszyk: ' + liczbaProd(koszyk.length) + ', ' + zl(wartosc()).replace(/\u00a0/g, ' ') : 'Koszyk, pusty'); });
  }
  function wartosc() { return koszyk.reduce(function (s, x) { return s + P[x.id].c * x.q; }, 0); }
  function waga() { return koszyk.reduce(function (s, x) { return s + P[x.id].w * x.q; }, 0); }
  function kosztKuriera(war, kg) {
    if (war >= PM.wysylka.darmowa) return 0;
    var progi = PM.wysylka.progi; kg = Math.round(kg * 1000) / 1000;
    for (var i = 0; i < progi.length; i++) if (kg <= progi[i][0]) return progi[i][1];
    return progi[progi.length - 1][1];
  }
  var DOSTAWY = {
    kurier: { n: 'Kurier', opis: 'Koszt według wagi paczki, darmowa dostawa od 500 zł' },
    odbior: { n: 'Odbiór osobisty', opis: PM.firma.odbior }
  };
  var PLATNOSCI = {
    kurier: [{ id: 'przelew', n: 'Przelew bankowy', c: 0 }, { id: 'p24', n: 'Przelewy24', c: 1 }, { id: 'pobranie', n: 'Za pobraniem, kartą lub gotówką u kuriera', c: 15 }],
    odbior: [{ id: 'przelew', n: 'Przelew bankowy', c: 0 }, { id: 'p24', n: 'Przelewy24', c: 1 }, { id: 'gotowka', n: 'Płatność przy odbiorze w Policach', c: 0 }]
  };
  var wybor = czyt('pm_wybor', { d: 'kurier', p: 'przelew' });
  if (!wybor || !ma(DOSTAWY, wybor.d)) wybor = { d: 'kurier', p: 'przelew' };
  function koszty() {
    var war = wartosc(), dost = wybor.d === 'kurier' ? kosztKuriera(war, waga()) : 0;
    var pl = PLATNOSCI[wybor.d].find(function (x) { return x.id === wybor.p; }) || PLATNOSCI[wybor.d][0];
    wybor.p = pl.id;
    return { war: war, dost: dost, pl: pl, razem: war + dost + pl.c };
  }

  /* ---------- wspólne elementy ---------- */
  function ilosc(id, min, wart, etykieta, krok) {
    krok = krok || 1;
    return '<span class="ilosc"><button type="button" data-krok="-1" aria-label="Mniej' + (krok > 1 ? ' o ' + krok : '') + '">−</button>' +
      '<input id="' + id + '" type="number" inputmode="numeric" min="' + min + '" step="' + krok + '" value="' + wart + '" aria-label="' + esc(etykieta || 'Ilość') + '">' +
      '<button type="button" data-krok="1" aria-label="Więcej' + (krok > 1 ? ' o ' + krok : '') + '">+</button></span>';
  }
  function powiadomLink(p) { return '<a class="btn btn--b btn-pow" href="produkt.html?id=' + p.id + '#powiadom">Powiadom o dostępności<span class="ukryte">: ' + esc(p.n) + '</span></a>'; }
  function formDodaj(p, idPola, przycisk) {
    if (!p.dost) return powiadomLink(p);
    return '<form class="dodaj" data-dodaj="' + p.id + '" novalidate>' + ilosc(idPola, p.min, p.min, 'Ilość, ' + p.jm, p.kr) +
      '<button class="btn btn--s" type="submit">' + (przycisk || 'Do koszyka') + '</button></form>';
  }
  function wiersz(p) {
    var meta = [p.kod ? 'Kod ' + esc(p.kod) : '', p.min > 1 ? 'min. ' + p.min + ' ' + p.jm.replace(/\.$/, '') + (p.kr > 1 && p.kr !== p.min ? ', co ' + p.kr : '') + ' (' + zl(p.c * p.min) + ')' : '', p.dost ? '<span class="ok ok-kropka">Dostępny</span>' : '<span class="brak-kropka">Chwilowo niedostępny</span>', p.dost && p.czas ? 'wysyłka ' + esc(p.czas) : ''].filter(Boolean).join(', ');
    return '<li class="wiersz">' +
      '<a class="wiersz__img" href="produkt.html?id=' + p.id + '" tabindex="-1" aria-hidden="true">' + img(p.img, '', 88, 72) + '</a>' +
      '<div><a class="wiersz__n" href="produkt.html?id=' + p.id + '">' + tw(p.n) + '</a><p class="wiersz__m">' + meta + '</p>' + '<span class="w-kosz" data-wk="' + p.id + '"></span>' + '</div>' +
      '<p class="wiersz__c"><span class="cena">' + zl(p.c) + '<small>/ ' + p.jm + '</small></span><span class="netto">' + zl(p.cn) + ' netto</span></p>' +
      formDodaj(p, 'q' + p.id) + '</li>';
  }
  document.addEventListener('click', function (e) {
    var k = e.target.closest('[data-krok]');
    if (k) {
      var i = $('input', k.parentNode), min = parseInt(i.min, 10) || 1, krok = parseInt(i.step, 10) || 1;
      i.value = Math.max(min, (parseInt(i.value, 10) || min) + parseInt(k.dataset.krok, 10) * krok);
      i.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    var d = e.target.closest('[data-demo]');
    if (d) { e.preventDefault(); notka('Ta strona zostaje taka jak dziś w sklepie, w projekcie jej nie przygotowuję.'); }
  });
  // wpisana ilość od razu poprawiona jak w sklepie: wielokrotność krotności, nie mniej niż minimum
  document.addEventListener('change', function (e) {
    var i = e.target; if (!i.matches || !i.matches('.ilosc input')) return;
    var min = parseFloat(i.min) || 1, krok = parseFloat(i.step) || 1, v = parseFloat(i.value.replace(',', '.'));
    i.value = v > 0 ? Math.max(min, Math.round(v / krok) * krok) : min;
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-dodaj]'); if (!f) return;
    e.preventDefault();
    dodaj(f.getAttribute('data-dodaj'), $('input', f).value);
    potwierdz(e.submitter || $('button[type=submit]', f));
  });
  // przycisk, który dodał produkt, na chwilę pokazuje „Dodano” (odpowiedź na działanie klienta)
  function potwierdz(btn) {
    if (!btn || btn.dataset.ok) return;
    var t = btn.innerHTML; btn.dataset.ok = 1; btn.classList.add('dodano'); btn.innerHTML = 'Dodano';
    setTimeout(function () { btn.classList.remove('dodano'); btn.innerHTML = t; delete btn.dataset.ok; }, 1600);
  }
  function notka(tekst, link) {
    var n = $('#notka');
    if (!n) { n = document.createElement('div'); n.id = 'notka'; n.className = 'notka'; n.setAttribute('role', 'status'); document.body.appendChild(n); }
    n.innerHTML = '<span>' + tekst + '</span>' + (link || '');
    clearTimeout(notka.t); notka.t = setTimeout(function () { n.remove(); }, 5000);
  }

  /* ---------- menu kategorii: przycisk „Kategorie” (tablet, telefon) i „Wszystkie kategorie” (strona główna) ---------- */
  var menu = $('#menu'), mPrz = $$('[aria-controls=menu]'), mOst = mPrz[0];
  function menuOtworz(o, btn) {
    if (btn) mOst = btn;
    menu.classList.toggle('otwarte', o);
    mPrz.forEach(function (b) { b.setAttribute('aria-expanded', o && b === mOst); });
    if (o) $('a', menu).focus();
  }
  if (menu && mPrz.length) {
    mPrz.forEach(function (b) { b.addEventListener('click', function () { menuOtworz(!(menu.classList.contains('otwarte') && mOst === b), b); }); });
    menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') { menuOtworz(false); mOst.focus(); } });
    document.addEventListener('click', function (e) { if (menu.classList.contains('otwarte') && !e.target.closest('#menu, [aria-controls=menu]')) menuOtworz(false); });
    menu.addEventListener('focusout', function (e) { if (menu.classList.contains('otwarte') && e.relatedTarget && !e.relatedTarget.closest('#menu, [aria-controls=menu]')) menuOtworz(false); });
  }

  /* ---------- wyszukiwarka z podpowiedziami (combobox) ---------- */
  var pole = $('#q'), podp = $('#podpowiedzi'), aktywna = -1;
  if (URLP.get('q') && pole) pole.value = URLP.get('q');
  function zamknijPodp() { podp.hidden = true; pole.setAttribute('aria-expanded', 'false'); pole.removeAttribute('aria-activedescendant'); aktywna = -1; }
  function opcjePodp() { return $$('[role=option]:not([aria-disabled])', podp); }
  function zaznacz(i) {
    var o = opcjePodp(); if (!o.length) return;
    aktywna = (i + o.length) % o.length;
    o.forEach(function (x, j) { x.setAttribute('aria-selected', j === aktywna); });
    pole.setAttribute('aria-activedescendant', o[aktywna].id); o[aktywna].scrollIntoView({ block: 'nearest' });
  }
  function rysujPodp() {
    var f = pole.value.trim();
    if (f.length < 2) { zamknijPodp(); return; }
    var w = wzorceSzukania(f), kat = Object.keys(PM.kat).map(function (k) { return PM.kat[k]; })
      .filter(function (k) { var t = norm(k.n); return w.every(function (r) { return r.test(t); }); }).slice(0, 4);
    var prod = szukaj(f), n = 0;
    var h = (kat.length ? '<div role="group" aria-labelledby="pdk"><p class="podp__t" id="pdk">Kategorie</p>' + kat.map(function (k) { return '<a class="podp__o podp__o--k" role="option" tabindex="-1" id="pd' + (n++) + '" href="kategoria.html?id=' + k.id + '">' + tw(k.n) + '<span>' + liczbaProd(k.ile) + '</span></a>'; }).join('') + '</div>' : '') +
      (prod.length ? '<div role="group" aria-labelledby="pdp"><p class="podp__t" id="pdp">Produkty</p>' + prod.slice(0, 6).map(function (p) { return '<a class="podp__o" role="option" tabindex="-1" id="pd' + (n++) + '" href="produkt.html?id=' + p.id + '">' + img(p.img, '', 44, 36, false) + '<span style="color:inherit;font-size:15px">' + tw(p.n) + '</span><b class="cena">' + zl(p.c) + '</b></a>'; }).join('') + '</div>' : '') +
      (prod.length ? '<a class="podp__wsz" role="option" tabindex="-1" id="pd' + (n++) + '" href="szukaj.html?q=' + encodeURIComponent(f) + '">Pokaż wszystkie wyniki: ' + liczbaProd(prod.length) + '</a>'
        : kat.length ? '' : '<p class="podp__t" role="option" aria-disabled="true" id="pdbrak">Brak wyników dla „' + esc(f) + '”. Sprawdź pisownię albo zadzwoń: ' + PM.firma.telTxt + '.</p>');
    podp.innerHTML = h; podp.hidden = false; pole.setAttribute('aria-expanded', 'true'); aktywna = -1;
  }
  if (pole) {
    var t;
    pole.addEventListener('input', function () { clearTimeout(t); t = setTimeout(rysujPodp, 120); });
    pole.addEventListener('keydown', function (e) {
      if (podp.hidden && e.key === 'ArrowDown') { rysujPodp(); }
      if (podp.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); zaznacz(aktywna + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); zaznacz(aktywna < 0 ? -1 : aktywna - 1); }
      else if (e.key === 'Escape') { zamknijPodp(); }
      else if (e.key === 'Enter' && aktywna > -1) { e.preventDefault(); location.href = opcjePodp()[aktywna].href; }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.szukaj')) zamknijPodp(); });
    pole.addEventListener('blur', function () { setTimeout(function () { if (!podp.contains(document.activeElement)) zamknijPodp(); }, 150); });
  }

  /* ---------- dobór łańcuchów śniegowych po rozmiarze opony ---------- */
  function rozmiar(p) {
    var m = p.n.match(/(\d{3})\s*\/\s*(\d{2,3})\s*[xX]\s*R?\s*(\d{2})\b/) || p.n.match(/(\d{3})\s*[xX]\s*R?\s*(\d{2})\b/);
    if (!m) return null;
    return m.length === 4 ? { s: m[1], p: m[2], f: m[3] } : { s: m[1], p: '', f: m[2] };
  }
  var sniezne = produktyKat('22').filter(function (p) { return rozmiar(p); });
  function lancuchy(n) { return n + ' ' + (n === 1 ? 'łańcuch' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'łańcuchy' : 'łańcuchów'); }
  function dobor(sekcja, przyZmianie, zbior) {
    var zb = (zbior || sniezne).filter(function (p) { return rozmiar(p); }), bezRozm = zbior ? zbior.length - zb.length : 0;
    var pola = { s: $('[data-pole=s]', sekcja), p: $('[data-pole=p]', sekcja), f: $('[data-pole=f]', sekcja) };
    var stan = { s: URLP.get('s') || '', p: URLP.get('p') || '', f: URLP.get('f') || '' };
    var btn = $('[data-dobor-btn]', sekcja), info = $('[data-dobor-ile]', sekcja), czysc = $('[data-dobor-czysc]', sekcja);
    var puste = { s: 'szer.', p: 'profil', f: 'felga' };
    function pasuje(r, bez) { return ['s', 'p', 'f'].every(function (k) { return k === bez || !stan[k] || r[k] === stan[k]; }); }
    function opcje() {
      ['s', 'p', 'f'].forEach(function (k) {
        var w = {}; zb.forEach(function (p) { var r = rozmiar(p); if (r[k] && pasuje(r, k)) w[r[k]] = 1; });
        var lista = Object.keys(w).sort(function (a, b) { return a - b; });
        pola[k].innerHTML = '<option value="">' + puste[k] + '</option>' +
          lista.map(function (v) { return '<option value="' + v + '"' + (v === stan[k] ? ' selected' : '') + '>' + v + '</option>'; }).join('');
        pola[k].classList.toggle('pusty', !stan[k]);
      });
      var wybrano = stan.s || stan.p || stan.f, ile = zb.filter(function (p) { return pasuje(rozmiar(p)); }).length;
      var rozm = (stan.s || '') + (stan.p ? '/' + stan.p : '') + (stan.f ? ' R' + stan.f : '');
      if (btn) { btn.disabled = wybrano && !ile; btn.textContent = !wybrano ? 'Pokaż łańcuchy' : ile ? 'Pokaż ' + lancuchy(ile) : 'Brak tego rozmiaru'; }
      if (czysc) czysc.hidden = !wybrano;
      var dopisek = wybrano && bezRozm ? ' Jeszcze ' + lancuchy(bezRozm) + ' ma rozmiar zapisany inaczej (np. 7,00x15), zobaczysz je po wyczyszczeniu rozmiaru.' : '';
      if (info) info.innerHTML = !wybrano ? 'Rozmiar przeczytasz na boku opony, np. 185/65 R15.'
        : ile ? (btn ? 'Pasuje do ' + rozm + ': ' + lancuchy(ile) + '.' : '<b>' + lancuchy(ile) + '</b> ' + (ile % 10 >= 2 && ile % 10 <= 4 && (ile % 100 < 12 || ile % 100 > 14) ? 'pasują' : 'pasuje') + ' do rozmiaru ' + rozm + '.')
        : 'Nie mamy łańcucha w tym rozmiarze w sklepie. Zadzwoń: <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a>, sprawdzimy dostępność.';
      if (info && dopisek) info.innerHTML += dopisek;
    }
    ['s', 'p', 'f'].forEach(function (k) { pola[k].addEventListener('change', function () { stan[k] = pola[k].value; opcje(); if (przyZmianie) przyZmianie(stan); }); });
    if (czysc) czysc.addEventListener('click', function () { stan = { s: '', p: '', f: '' }; opcje(); przyZmianie(stan); pola.s.focus(); });
    opcje();
    return { pasuje: function (p) { var r = rozmiar(p); return !(stan.s || stan.p || stan.f) || (r && pasuje(r)); } };
  }

  /* ---------- filtry z parametrów produktów (Rozmiar, Długość, Średnica...) ---------- */
  // parametry do filtrów: z bazy, a gdy produkt nie ma rozmiaru w parametrach, rozmiar odczytany z nazwy (6 mm, M8)
  function parF(p) {
    if (p._pf) return p._pf;
    var f = p.par.slice();
    if (!f.some(function (r) { return /rozmiar|średnic/i.test(r[0]); })) {
      var mm = p.n.match(/(?:^|[\s-])(\d+(?:[.,]\d+)?)\s?mm\b/), gw = p.n.match(/\bM(\d{1,2})\b/);
      if (mm) f.push([/^Lin/.test(p.n) ? 'Średnica' : 'Rozmiar', mm[1].replace('.', ',') + ' mm']);
      else if (gw) f.push(['Gwint', 'M' + gw[1]]);
    }
    return (p._pf = f);
  }
  function filtry(sekcja, lista, przyZmianie) {
    var licz = {};
    lista.forEach(function (p) { parF(p).forEach(function (r) { (licz[r[0]] = licz[r[0]] || {})[r[1]] = (licz[r[0]][r[1]] || 0) + 1; }); });
    var klucze = Object.keys(licz).filter(function (k) {
      var ile = Object.keys(licz[k]).reduce(function (s, v) { return s + licz[k][v]; }, 0), rozne = Object.keys(licz[k]).length;
      return ile >= lista.length * 0.6 && rozne >= 2 && rozne <= 40;
    }).slice(0, 3);
    var stan = {};
    if (!klucze.length) return null;
    sekcja.hidden = false;
    sekcja.innerHTML = klucze.map(function (k, i) {
      var v = Object.keys(licz[k]).sort(function (a, b) { return a.localeCompare(b, 'pl', { numeric: true }); });
      return '<label>' + esc(k) + '<select data-param="' + esc(k) + '"><option value="">wszystkie</option>' + v.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') + '</select></label>';
    }).join('') + '<button class="btn btn--c" type="button" data-filtry-czysc hidden>Wyczyść filtry</button>';
    sekcja.addEventListener('change', function (e) {
      var s = e.target.closest('[data-param]'); if (!s) return;
      stan[s.dataset.param] = s.value; $('[data-filtry-czysc]', sekcja).hidden = !Object.keys(stan).some(function (k) { return stan[k]; }); przyZmianie();
    });
    $('[data-filtry-czysc]', sekcja).addEventListener('click', function () { stan = {}; $$('select', sekcja).forEach(function (s) { s.value = ''; }); this.hidden = true; przyZmianie(); });
    return { pasuje: function (p) { return Object.keys(stan).every(function (k) { return !stan[k] || parF(p).some(function (r) { return r[0] === k && r[1] === stan[k]; }); }); } };
  }

  /* ---------- kroki zamówienia ---------- */
  function kroki(nr) {
    var nazwy = ['Koszyk', 'Dane i dostawa', 'Potwierdzenie'];
    return '<ol class="kroki" aria-label="Kroki zamówienia">' + nazwy.map(function (n, i) {
      return '<li' + (i + 1 === nr ? ' aria-current="step"' : i + 1 < nr ? ' class="zrobione"' : '') + '><b>' + (i + 1) + '</b><span>' + n + '</span></li>';
    }).join('') + '</ol>';
  }

  /* ---------- strony ---------- */
  var cl = document.body.classList;

  /* ---------- opinie z Google (wygląd widżetu Trustindex) ---------- */
  function opinie(el) {
    var O = window.PM_OPINIE; if (!el || !O) return;
    var kolory = ['#5c6bc0', '#26a69a', '#ef6c00', '#8d6e63', '#7e57c2', '#00897b', '#c0392b', '#546e7a'];
    var gw = function (n) { return '<span class="op-gw" aria-hidden="true">' + new Array(n + 1).join('★') + '</span>'; };
    var ocena = O.ocena.toFixed(1).replace('.', ',');
    var MIES = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
    var data = function (d) { var m = d.split('.'); return m.length === 3 ? m[0] + ' ' + MIES[m[1] - 1] + ' ' + m[2] : d; };
    el.innerHTML = '<div class="op-sum"><b class="op-sum__s">' + (O.ocena >= 4.5 ? 'Doskonały' : O.ocena >= 4 ? 'Bardzo dobry' : 'Dobry') + '</b>' + gw(Math.round(O.ocena)) +
      '<span class="op-sum__n">Na podstawie <b>' + O.ile + ' recenzji</b></span><img class="op-sum__logo" src="img/opinie/google-logo.png" alt="Google" width="92" height="30">' +
      '<span class="ukryte">Ocena ' + ocena + ' na 5.</span></div>' +
      '<div class="op-ok"><ul class="op-tor" tabindex="0" aria-label="Opinie klientów">' + O.lista.map(function (o, i) {
        var h = 0; for (var k = 0; k < o.n.length; k++) h = (h * 31 + o.n.charCodeAt(k)) % 997;
        var av = o.a ? '<img class="op-av" src="' + o.a + '" alt="" width="40" height="40" loading="lazy">' : '<span class="op-av" style="display:grid;place-items:center;color:#fff;font-weight:700;background:' + kolory[h % kolory.length] + '" aria-hidden="true">' + esc(o.n.charAt(0).toUpperCase()) + '</span>';
        return '<li class="op-k"><div class="op-k__g">' + av +
          '<span class="op-k__o"><span class="op-k__n">' + esc(o.n) + '</span><span class="op-k__d">' + esc(data(o.d)) + '</span></span><img class="op-k__G" src="img/opinie/google-g.png" alt="" width="20" height="20"></div>' +
          '<div class="op-k__oc">' + gw(o.g) + '<span class="op-ver" title="Opinia z Google" aria-hidden="true"></span><span class="ukryte">' + o.g + ' na 5 gwiazdek.</span></div><p class="op-k__t" id="opt' + i + '">' + tw(o.t) + '</p>' +
          '<button class="op-k__wiecej" type="button" aria-expanded="false" aria-controls="opt' + i + '" hidden>Czytaj dalej</button></li>';
      }).join('') + '</ul><button class="op-str op-str--l" type="button" aria-label="Poprzednie opinie">‹</button><button class="op-str op-str--p" type="button" aria-label="Następne opinie">›</button></div>' +
      '<p class="op-stopka"><span>Opinie z Profilu Firmy w Google, treść bez zmian. Nie sprawdzamy, czy autor kupił w sklepie.</span><a href="' + O.link + '">Wszystkie opinie w Google</a></p>';
    var tor = $('.op-tor', el), l = $('.op-str--l', el), pr = $('.op-str--p', el);
    $$('.op-k', el).forEach(function (k) {
      var t = $('.op-k__t', k), b = $('.op-k__wiecej', k);
      if (t.scrollHeight > t.clientHeight + 2) b.hidden = false;
      b.addEventListener('click', function () { var o = t.classList.toggle('caly'); b.textContent = o ? 'Zwiń' : 'Czytaj dalej'; b.setAttribute('aria-expanded', o); });
    });
    function strzalki() { l.disabled = tor.scrollLeft < 4; pr.disabled = tor.scrollLeft + tor.clientWidth > tor.scrollWidth - 4; }
    function przesun(kier) { var k = $('.op-k', tor); tor.scrollBy({ left: kier * (k.offsetWidth + 16), behavior: 'smooth' }); }
    l.addEventListener('click', function () { przesun(-1); }); pr.addEventListener('click', function () { przesun(1); });
    tor.addEventListener('scroll', strzalki, { passive: true }); strzalki();
  }

  /* ---------- zatrzymanie klienta: ostatnio oglądane (z tej przeglądarki) i przypomnienie o koszyku ---------- */
  function ostatnie(el, bez) {
    if (!el) return;
    var ids = czyt('pm_ogl', []).filter(function (id) { return id !== bez && ma(P, id); }).slice(0, 6);
    if (!ids.length) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '<div class="sek__g"><h2 class="h2" id="ogl-t">Ostatnio oglądane</h2><button class="ogl__czysc" type="button">Wyczyść listę</button></div><ul class="ogl__l">' + ids.map(function (id) {
      var x = P[id];
      return '<li><a class="ogl__k" href="produkt.html?id=' + x.id + '"><span class="ogl__img">' + img(x.imgm || x.img, '', 160, 120) + '</span><span class="ogl__n">' + tw(x.n) + '</span><span class="ogl__c">' + zl(x.c) + ' <small>/ ' + x.jm.replace(/\.$/, '') + '</small></span></a></li>';
    }).join('') + '</ul>';
    $('.ogl__czysc', el).addEventListener('click', function () { zapisz('pm_ogl', []); el.hidden = true; });
  }
  function przypomnienie(el) {
    if (!el || !koszyk.length) return;
    el.hidden = false;
    el.innerHTML = '<p><b>Masz w koszyku ' + liczbaProd(koszyk.length) + '</b> za ' + zl(wartosc()) + '. ' + (function (t) { return t.charAt(0).toUpperCase() + t.slice(1); })(gratis()) + '</p><a class="btn btn--k" href="koszyk.html">Przejdź do koszyka</a>';
  }

  if (cl.contains('str-glowna')) {
    przypomnienie($('[data-przyp]'));
    ostatnie($('[data-ogl]'));
    opinie($('[data-opinie]'));
    var glowne = Object.keys(PM.kat).map(function (k) { return PM.kat[k]; }).filter(function (k) { return k.r === '0' && k.img; })
      .sort(function (a, b) { return b.ile - a.ile; }).slice(0, 12);
    $('[data-kafle]').innerHTML = glowne.map(function (k) {
      return '<li><a class="kafel" href="kategoria.html?id=' + k.id + '"><span class="kafel__img">' + img(k.imgm || k.img, '', 400, 300) + '</span><b>' + tw(k.n) + '</b><span>' + liczbaProd(k.ile) + '</span><span class="od">od <b>' + zl(k.od) + '</b> / ' + k.odj.replace(/\.$/, '') + '</span></a></li>';
    }).join('');
    $('[data-polecane]').innerHTML = PM.prod.filter(function (p) { return p.pol; }).slice(0, 8).map(function (p) {
      var kat = PM.kat[katProduktu(p)];
      return '<li class="kp"><a class="kp__img" href="produkt.html?id=' + p.id + '" tabindex="-1" aria-hidden="true">' + img(p.imgm || p.img, '', 400, 300) + '</a>' +
        '<p class="kp__kat">' + esc(kat ? kat.n : '') + '</p><a class="kp__n" href="produkt.html?id=' + p.id + '">' + tw(p.n) + '</a>' + '<span class="w-kosz" data-wk="' + p.id + '"></span>' +
        (p.dost ? '<p class="kp__dost"><span class="ok ok-kropka">Dostępny</span>' + (p.czas ? ', wysyłka ' + esc(p.czas) : '') + '</p>' : '') +
        '<div class="kp__dol"><span class="cena">' + zl(p.c) + '<small>/ ' + p.jm + '</small></span>' +
        (p.dost ? '<form data-dodaj="' + p.id + '"><input type="hidden" value="' + p.min + '"><button class="btn btn--c" type="submit">Do koszyka</button></form>' : powiadomLink(p)) + '</div></li>';
    }).join('');
    dobor($('[data-dobor]'));
    oznacz();
  }

  if (cl.contains('str-kategoria') || cl.contains('str-szukaj')) {
    var lista, ile = NA_STRONE, sort = '', dob = null, filtr = null;
    if (cl.contains('str-kategoria')) {
      var id = URLP.get('id') || '22', k = ma(PM.kat, id) || PM.kat['22'];
      id = k.id; document.title = k.n + ' | Polimet';
      $('[data-h1]').innerHTML = tw(k.n);
      var og = $('[data-opis-gora]');
      if (k.gora.length > 230) {
        var ciecie = k.gora.slice(0, 230).lastIndexOf('. ');
        var krotki = k.gora.slice(0, ciecie > 80 ? ciecie + 1 : 230);
        og.innerHTML = '<span data-krotki>' + tw(krotki) + '</span><span data-pelny hidden>' + tw(k.gora) + '</span> <button class="wiecej-tekst" type="button" aria-expanded="false">Czytaj dalej</button>';
        $('.wiecej-tekst', og).addEventListener('click', function () { var o = this.getAttribute('aria-expanded') === 'true'; $('[data-krotki]', og).hidden = !o; $('[data-pelny]', og).hidden = o; this.setAttribute('aria-expanded', !o); this.textContent = o ? 'Czytaj dalej' : 'Zwiń'; });
      } else og.innerHTML = tw(k.gora);
      $('[data-fakty]').innerHTML = '<span><b>' + liczbaProd(k.ile) + '</b></span><span>od <b>' + zl(k.od) + '</b> / ' + k.odj.replace(/\.$/, '') + '</span><span>Darmowa dostawa od 500 zł</span><span>Odbiór osobisty w Policach</span>';
      var ki = sciezka(id).reverse().find(function (x) { return x.img; }); if (ki) { var f = $('[data-kat-img]'); f.hidden = false; f.innerHTML = img(ki.img, '', 400, 300, false); }
      $('[data-okr]').innerHTML = '<a href="index.html">Strona główna</a>' + sciezka(id).map(function (x, i, a) { return i === a.length - 1 ? '<span aria-current="page">' + esc(x.n) + '</span>' : '<a href="kategoria.html?id=' + x.id + '">' + esc(x.n) + '</a>'; }).join('');
      var rodzic = k.dzieci.length ? k : PM.kat[k.r];
      if (rodzic && rodzic.dzieci.length) {
        $('[data-podkat]').innerHTML = rodzic.dzieci.map(function (c) {
          var x = PM.kat[c], n = x.n.indexOf(rodzic.n + ' ') === 0 ? x.n.slice(rodzic.n.length + 1) : x.n; n = n.charAt(0).toUpperCase() + n.slice(1);
          return '<li><a href="kategoria.html?id=' + c + '"' + (c === id ? ' aria-current="page"' : '') + '>' + tw(n) + ' <span>' + x.ile + '</span></a></li>';
        }).join('');
      }
      var top = sciezka(id)[0]; $$('.menu a[data-kat="' + top.id + '"], .katpasek a[data-kat="' + top.id + '"]').forEach(function (a) { a.setAttribute('aria-current', 'true'); });
      lista = produktyKat(id);
      if (k.dol) { var od = $('[data-opis-dol]'); od.hidden = false; od.innerHTML = '<h2>' + tw(k.n) + ': jak wybrać</h2>' + k.dol.split('\n').map(function (l) { return '<p>' + tw(l) + '</p>'; }).join(''); }
      if (top.id === '22' && lista.filter(function (x) { return rozmiar(x); }).length >= lista.length / 2) { var sek = $('[data-dobor]'); sek.hidden = false; dob = dobor(sek, function () { ile = NA_STRONE; rysuj(); }, lista); }
      else filtr = filtry($('[data-filtry]'), lista, function () { ile = NA_STRONE; rysuj(); });
    } else {
      var fraza = (URLP.get('q') || '').trim();
      document.title = 'Szukaj: ' + fraza + ' | Polimet';
      $('[data-h1]').textContent = fraza ? 'Wyniki dla: ' + fraza : 'Wyszukiwanie';
      lista = szukaj(fraza);
    }
    function rysuj() {
      var w = lista.filter(function (p) { return (!dob || dob.pasuje(p)) && (!filtr || filtr.pasuje(p)); }).slice();
      if (sort === 'c') w.sort(function (a, b) { return a.c - b.c; });
      else if (sort === '-c') w.sort(function (a, b) { return b.c - a.c; });
      else if (sort === 'n') w.sort(function (a, b) { return a.n.localeCompare(b.n, 'pl', { numeric: true }); });
      else w.sort(function (a, b) { return (b.dost ? 1 : 0) - (a.dost ? 1 : 0); }); // domyślnie dostępne najpierw, kolejność sklepu zostaje
      $('[data-ile]').textContent = liczbaProd(w.length);
      $('[data-lista]').innerHTML = w.length ? w.slice(0, ile).map(wiersz).join('') : '<li class="pusto">Nic nie pasuje. Zmień filtry, sprawdź pisownię albo zadzwoń: ' + PM.firma.telTxt + '.</li>';
      $('[data-wiecej]').hidden = w.length <= ile;
      $('[data-wiecej] button').textContent = 'Pokaż kolejne ' + Math.min(NA_STRONE, w.length - ile) + ' z ' + (w.length - ile);
      oznacz();
    }
    var s = $('[data-sort]'); if (s) s.addEventListener('change', function () { sort = s.value; rysuj(); });
    $('[data-wiecej] button').addEventListener('click', function () { ile += NA_STRONE; rysuj(); });
    rysuj();
  }

  if (cl.contains('str-produkt')) {
    var p = ma(P, URLP.get('id'));
    if (!p) {
      document.title = 'Nie ma takiego produktu | Polimet';
      $('[data-okr]').innerHTML = '<a href="index.html">Strona główna</a><span aria-current="page">Nie ma takiego produktu</span>';
      $('[data-karta]').outerHTML = '<div class="pusto pusto--duze"><h1>Nie ma takiego produktu</h1><p>Mógł zostać wycofany ze sprzedaży albo link jest niepełny. Wpisz nazwę lub rozmiar w wyszukiwarce u góry albo zadzwoń: <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a>.</p><p><a class="btn btn--c" href="index.html">Wróć do sklepu</a></p></div>';
      p = null;
    }
  }
  if (cl.contains('str-produkt') && p) {
    var kid = katProduktu(p), sc = kid ? sciezka(kid) : [];
    document.title = p.n + ' | Polimet';
    $('[data-okr]').innerHTML = '<a href="index.html">Strona główna</a>' + sc.map(function (x) { return '<a href="kategoria.html?id=' + x.id + '">' + esc(x.n) + '</a>'; }).join('') + '<span aria-current="page">' + esc(p.n) + '</span>';
    if (sc[0]) $$('.menu a[data-kat="' + sc[0].id + '"], .katpasek a[data-kat="' + sc[0].id + '"]').forEach(function (a) { a.setAttribute('aria-current', 'true'); });
    var bracia = kid ? produktyKat(kid).filter(function (x) { return x.n.split(/\d/)[0] === p.n.split(/\d/)[0]; }) : [];
    var braciaWsz = bracia.slice(), wszystkichBraci = bracia.length, gdzie = bracia.indexOf(p);
    if (bracia.length > 16) { var od2 = Math.max(0, Math.min(gdzie - 7, bracia.length - 16)); bracia = bracia.slice(od2, od2 + 16); }
    // wspólny początek nazw w tabeli rozmiarów (np. „Lina stalowa ocynkowana na szpuli -”), w wierszach tylko różnica
    var wspolny = '';
    if (bracia.length > 1) {
      var sl = bracia.map(function (x) { return x.n.split(' '); }), w = 0;
      while (sl.every(function (s) { return s[w] !== undefined && s[w] === sl[0][w]; }) && w < sl[0].length - 1) w++;
      wspolny = sl[0].slice(0, w).join(' ').replace(/[\s|,-]+$/, '');
    }
    function reszta(n) { var r = wspolny ? n.slice(wspolny.length).replace(/^[\s|,-]+/, '') : n; return r || n; }
    // dane techniczne: parametry z bazy, a gdy ich nie ma, to co jednoznacznie wynika z nazwy (średnica, splot, norma, klasa)
    var par = p.par.slice();
    if (!par.length) {
      var mm = p.n.match(/(?:^|[\s-])(\d+(?:[.,]\d+)?)\s?mm\b/), sp = p.n.match(/\b(\d+x\d+(?:\+[A-Z]+)?(?:WS)?(?:\+[A-Z]+)?)\b/), no = p.n.match(/\b((?:EN|DIN|ISO|PN)[\s-]?\d[\d-]*(?:-\d+)?[A-Z]?)\b/), kl = p.n.match(/klasy (\d+)/i);
      if (mm) par.push([/^Lina|^Linka/.test(p.n) ? 'Średnica liny' : 'Rozmiar', mm[1].replace('.', ',') + ' mm']);
      if (sp && /^Lina|^Linka/.test(p.n)) par.push(['Splot', sp[1]]);
      if (kl) par.push(['Klasa', kl[1]]);
      if (no) par.push(['Norma', no[1]]);
    }
    // osprzęt do liny stalowej w rozmiarze tej liny: kausza i tuleja tej samej średnicy, zacisk najmniejszy pasujący (EN 13411-5)
    var osprzet = [], dLiny = /^Lina stalowa/.test(p.n) && (p.n.match(/(?:^|[\s-])(\d+(?:[.,]\d+)?)\s?mm\b/) || [])[1];
    if (dLiny) {
      var d = parseFloat(dLiny.replace(',', '.')), wKat = function (kid) { return produktyKat(kid); };
      var dokl = function (x) { var m = x.n.match(/-\s(\d+(?:[.,]\d+)?)\s?mm\b/); return m && parseFloat(m[1].replace(',', '.')) === d; };
      var kaus = wKat('31').filter(dokl)[0], tul = wKat('96').filter(dokl)[0];
      var zac = wKat('20').filter(function (x) { return /kabłąkowy EN13411-5/.test(x.n); }).map(function (x) { return { p: x, r: parseFloat((x.n.match(/rozmiar (\d+(?:[.,]\d+)?)/) || [])[1]) }; })
        .filter(function (x) { return x.r >= d; }).sort(function (a, b) { return a.r - b.r; })[0];
      [kaus, zac && zac.p, tul].forEach(function (x) { if (x) osprzet.push(x); });
    }
    var opis = p.opis ? p.opis.split('\n').map(function (l) { return '<p>' + tw(l) + '</p>'; }).join('') : '';
    $('[data-karta]').innerHTML =
      '<div class="karta__tyt"><h1>' + tw(p.n) + '</h1><p class="karta__kod">' + (p.kod ? 'Kod produktu: ' + esc(p.kod) : '') + '</p></div>' +
      '<figure class="karta__img">' + img(p.img, p.n, 600, 600, false) + '</figure>' +
      '<div class="karta__det">' +
      (osprzet.length ? '<section class="blok osprzet"><h2>Osprzęt do liny ' + dLiny + ' mm</h2><p class="rozm__wsp">Kausza, zacisk i tuleja w rozmiarze tej liny. <a href="zestawy.html?lina=' + p.id + '#lina">Złóż zestaw z tą liną</a>, z szeklą albo śrubą rzymską.</p><ul class="osprzet__l">' + osprzet.map(function (x) {
        return '<li class="osp"><a class="osp__img" href="produkt.html?id=' + x.id + '" tabindex="-1" aria-hidden="true">' + img(x.img, '', 120, 96) + '</a><div><a class="osp__n" href="produkt.html?id=' + x.id + '">' + tw(x.n) + '</a>' +
          '<p class="osp__c"><span class="cena">' + zl(x.c) + '<small>/ ' + x.jm + '</small></span>' + (x.min > 1 ? '<span class="osp__min">, ' + x.min + ' ' + x.jm.replace(/\.$/, '') + ' za ' + zl(x.c * x.min) + '</span>' : '') + '</p>' +
          '<span class="w-kosz" data-wk="' + x.id + '"></span></div>' +
          (x.dost ? '<form data-dodaj="' + x.id + '" novalidate><input type="hidden" value="' + x.min + '"><button class="btn btn--c" type="submit">Dodaj ' + x.min + ' ' + x.jm.replace(/\.$/, '') + '<span class="ukryte">: ' + esc(x.n) + '</span></button></form>' : powiadomLink(x)) + '</li>';
      }).join('') + '</ul></section>' : '') +
      (par.length ? '<section class="blok"><h2>Dane techniczne</h2><table class="param"><tbody>' + par.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table></section>' : '') +
      (opis ? '<section class="blok opis"><h2>Opis</h2>' + opis + '</section>' : '') +
      '</div>' +
      '<aside class="kup" aria-label="Zakup"><p class="cena">' + zl(p.c) + '<small>brutto / ' + p.jm + '</small></p><p class="kup__netto">' + zl(p.cn) + ' netto</p>' +
      (braciaWsz.length > 1 ? '<label class="kup__rozm">Rozmiar (' + braciaWsz.length + ')<select data-rozmiar>' + braciaWsz.slice().sort(function (a, b) { return a.n.localeCompare(b.n, 'pl', { numeric: true }); }).map(function (x) {
        var et = wspolny && x.n.indexOf(wspolny) === 0 ? reszta(x.n) : x.n;
        return '<option value="' + x.id + '"' + (x === p ? ' selected' : '') + '>' + esc(et) + ', ' + zl(x.c).replace(/\u00a0/g, ' ') + ' / ' + x.jm.replace(/\.$/, '') + (x.dost ? '' : ' (niedostępny)') + '</option>';
      }).join('') + '</select></label>' : '') +
      (window.PM_OPINIE ? '<a class="kup__oc" href="' + PM_OPINIE.link + '"><span class="op-gw" aria-hidden="true">★★★★★</span> ' + PM_OPINIE.ocena.toFixed(1).replace('.', ',') + ' z ' + PM_OPINIE.ile + ' opinii w Google</a>' : '') +
      '<p class="kup__dost">' + (p.dost ? '<span class="ok ok-kropka">Dostępny</span>' + (p.czas ? ', wysyłka ' + esc(p.czas) : '') : '<span class="brak-kropka">Chwilowo niedostępny</span>') + '</p>' +
      (p.dost ? '' : '<form class="powiadom" id="powiadom" data-powiadom="' + p.id + '" novalidate><p class="powiadom__t">Napiszemy jeden e-mail, gdy <b>' + tw(p.n) + '</b> wróci na stan. Pytania o termin: <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a>.</p><p class="powiadom__stan" hidden></p><div class="powiadom__pola"><label class="ukryte" for="pw-email">Adres e-mail</label><span class="powiadom__f"><input id="pw-email" type="email" name="email" autocomplete="email" placeholder="twoj@email.pl" required><button class="btn btn--s" type="submit">Powiadom mnie</button></span><label class="zgoda powiadom__zg"><input type="checkbox" name="przetwarzanie_powiadomienie" value="1" required><span>Zgadzam się na użycie mojego e-maila do jednego powiadomienia o dostępności tego produktu.</span></label></div><p class="powiadom__w" role="status"></p></form>') +
      '<form class="kup__ilosc" data-dodaj-k novalidate' + (p.dost ? '' : ' hidden') + '>' + ilosc('ilosc', p.min, p.min, 'Ilość, ' + p.jm, p.kr) + '<button class="btn btn--k" type="submit">Dodaj do koszyka</button></form>' +
      '<p class="kup__razem" data-razem></p>' + (p.dost && (p.min > 1 || p.kr > 1) ? '<p class="kup__netto">' + (p.kr > 1 && p.kr === p.min ? 'Sprzedaż po ' + p.kr + ' ' + p.jm.replace(/\.$/, '') : 'Minimalnie ' + p.min + ' ' + p.jm.replace(/\.$/, '') + (p.kr > 1 ? ', co ' + p.kr : '')) + '.</p>' : '') + '<p class="kup__gratis" data-gratis></p>' + (p.dost ? '<div class="mini-postep" data-mini aria-hidden="true"><i></i></div>' : '') +
      '<p class="kup__pyt">Pytanie o ten produkt? <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a> albo <a href="mailto:' + PM.firma.mail + '?subject=' + encodeURIComponent('Pytanie: ' + p.n) + '">napisz e-mail</a></p>' +
      '<ul class="kup__info"><li data-kurier' + (p.dost ? '' : ' hidden') + '></li>' +
      '<li><b>Odbiór osobisty: 0,00 zł</b>' + PM.firma.odbior + '</li>' +
      '<li><b>Płatność</b>Przelew bankowy, Przelewy24 albo za pobraniem: kartą lub gotówką u kuriera.</li>' +
      '<li><b>Zwrot do 14 dni</b>Bez podania przyczyny, odesłanie na koszt kupującego.</li>' +
      '<li><b>Faktura VAT</b>Wybierasz przy zamówieniu.</li><li><b>Polimet z Polic, od 1999 r.</b>Na Allegro od 2008 r., <a href="https://allegro.pl/uzytkownik/polimet-police/oceny">zobacz oceny</a>.</li></ul></aside>' +
      (bracia.length > 1 ? '<section class="blok karta__rozm"><h2>Inne rozmiary</h2><p class="rozm__wsp">' + tw(wspolny) + '</p><table class="rozm"><thead><tr><th scope="col">Produkt</th><th scope="col">Cena brutto</th><th scope="col"><span class="ukryte">Dodaj do koszyka</span></th></tr></thead><tbody>' +
        bracia.map(function (x) {
          var kr = reszta(x.n);
          return '<tr' + (x.id === p.id ? ' aria-current="true"' : '') + '><td>' + (x.id === p.id ? '<b>' + tw(kr) + '</b> <span class="rozm__ten">oglądasz</span>' : '<a href="produkt.html?id=' + x.id + '">' + tw(kr) + '</a>') + '<span class="w-kosz" data-wk="' + x.id + '"></span></td><td class="rozm__c">' + zl(x.c) + '<small> / ' + x.jm.replace(/\.$/, '') + '</small></td>' +
            '<td>' + formDodaj(x, 'r' + x.id, 'Dodaj') + '</td></tr>';
        }).join('') + '</tbody></table>' +
        (wszystkichBraci > bracia.length ? '<p class="prog"><a href="kategoria.html?id=' + kid + '">Wszystkie rozmiary (' + wszystkichBraci + ') w kategorii ' + esc(PM.kat[kid].n) + '</a></p>' : '') + '</section>' : '');
    var rz = $('.karta__rozm'); if (rz) $('[data-karta]').after(rz);
    var wyb = $('[data-rozmiar]'); if (wyb) wyb.addEventListener('change', function () { location.href = 'produkt.html?id=' + wyb.value; });
    var ogS = document.createElement('section'); ogS.className = 'sek ogl'; ogS.setAttribute('aria-labelledby', 'ogl-t'); (rz || $('[data-karta]')).after(ogS); ostatnie(ogS, p.id);
    zapisz('pm_ogl', [p.id].concat(czyt('pm_ogl', []).filter(function (id) { return id !== p.id; })).slice(0, 12));
    oznacz();
    function kurier() {
      var q = ilePoprawna(p, $('#ilosc').value), c = kosztKuriera(wartosc() + p.c * q, waga() + p.w * q);
      $('[data-razem]').innerHTML = q > 1 ? 'Razem za ' + q + ' ' + p.jm.replace(/\.$/, '') + ': <b>' + zl(p.c * q) + '</b>' : '';
      $('[data-kurier]').innerHTML = '<b>Kurier: ' + zl(c) + '</b>' + (c ? (koszyk.length ? 'Za całą paczkę razem z koszykiem' : 'Za ' + q + ' ' + p.jm) + ', według wagi. Darmowa dostawa od 500 zł.' : 'Darmowa dostawa od 500 zł.');
      var wKoszyku = koszyk.some(function (x) { return x.id === p.id; });
      $('[data-gratis]').innerHTML = (wKoszyku ? 'Produkt jest w koszyku, ' : 'Z tym produktem ') + gratis(wKoszyku ? 0 : p.c * q);
      var mini = $('[data-mini]'), pr = Math.min(100, (wartosc() + (wKoszyku ? 0 : p.c * q)) / PM.wysylka.darmowa * 100);
      if (mini) { $('i', mini).style.width = pr + '%'; mini.classList.toggle('mini-postep--ok', pr >= 100); }
    }
    kurier(); dodaj.poDodaniu = kurier; $('#ilosc').addEventListener('change', kurier); $('#ilosc').addEventListener('input', kurier);
    var pk = $('[data-pasek-koszyka]');
    pk.hidden = false; pk.innerHTML = '<span class="cena">' + zl(p.c) + '<small>/ ' + p.jm + '</small></span>' + (p.dost ? '<button class="btn btn--k" type="button">Dodaj do koszyka</button>' : '<a class="btn btn--s" href="#powiadom">Powiadom o dostępności</a>');
    $('[data-dodaj-k]').addEventListener('submit', function (e) { e.preventDefault(); dodaj(p.id, $('#ilosc').value); potwierdz(e.submitter || $('[data-dodaj-k] button[type=submit]')); });
    if (p.dost) $('button', pk).addEventListener('click', function () { dodaj(p.id, $('#ilosc').value); potwierdz(this); });
    if (!p.dost) { $$('[data-razem], [data-gratis]').forEach(function (e) { e.hidden = true; }); if (location.hash === '#powiadom') setTimeout(function () { $('#pw-email').focus(); }, 50); }
  }

  if (cl.contains('str-koszyk')) {
    var box = $('[data-koszyk]');
    var pkk = $('[data-pasek-koszyka]');
    var rysujK = function () {
      if (!koszyk.length) { box.innerHTML = '<p class="pusto">Koszyk jest pusty. <a href="index.html">Wróć do sklepu</a>.</p>'; box.style.display = 'block'; pkk.hidden = true; return; }
      var k = koszty(), w = waga();
      var opDost = Object.keys(DOSTAWY).map(function (d) {
        var c = d === 'kurier' ? kosztKuriera(k.war, w) : 0;
        return '<label class="opcja"><input type="radio" name="d" value="' + d + '"' + (wybor.d === d ? ' checked' : '') + '><span>' + DOSTAWY[d].n + '<small>' + esc(DOSTAWY[d].opis) + '</small></span><b>' + zl(c) + '</b></label>';
      }).join('');
      var opPl = PLATNOSCI[wybor.d].map(function (x) { return '<label class="opcja"><input type="radio" name="p" value="' + x.id + '"' + (wybor.p === x.id ? ' checked' : '') + '><span>' + x.n + '</span><b>' + (x.c ? '+ ' + zl(x.c) : '0,00 zł') + '</b></label>'; }).join('');
      var brak = PM.wysylka.darmowa - k.war;
      box.innerHTML = '<div><ul>' + koszyk.map(function (x) {
        var p = P[x.id];
        return '<li class="poz"><a class="wiersz__img" href="produkt.html?id=' + p.id + '" tabindex="-1" aria-hidden="true">' + img(p.img, '', 88, 72) + '</a>' +
          '<div><a class="wiersz__n" href="produkt.html?id=' + p.id + '">' + tw(p.n) + '</a><p class="wiersz__m">' + zl(p.c) + ' / ' + p.jm + '</p></div>' +
          '<div class="poz__ilosc">' + ilosc('k' + p.id, p.min, x.q, 'Ilość: ' + p.n, p.kr) + '</div>' +
          '<p class="poz__suma cena">' + zl(p.c * x.q) + '</p><button class="poz__usun" type="button" data-usun="' + p.id + '">Usuń<span class="ukryte"> ' + esc(p.n) + '</span></button></li>';
      }).join('') + '</ul><a class="dalej" href="index.html">Kontynuuj zakupy</a>' +
        '<fieldset class="wybor"><legend>Dostawa</legend>' + opDost + '</fieldset>' +
        '<fieldset class="wybor"><legend>Płatność</legend>' + opPl + '</fieldset></div>' +
        '<aside class="podsum" aria-label="Podsumowanie"><h2>Podsumowanie</h2><dl><dt>Produkty</dt><dd>' + zl(k.war) + '</dd><dt>Dostawa</dt><dd>' + zl(k.dost) + '</dd>' +
        (k.pl.c ? '<dt>' + k.pl.n + '</dt><dd>' + zl(k.pl.c) + '</dd>' : '') + '<dt class="razem">Razem</dt><dd class="razem">' + zl(k.razem) + '</dd></dl>' +
        (wybor.d === 'kurier' ? '<div class="postep' + (brak > 0 ? '' : ' postep--ok') + '"><div class="postep__pasek" role="img" aria-label="Postęp do darmowej dostawy: ' + Math.min(100, Math.round(k.war / PM.wysylka.darmowa * 100)) + '%"><span style="width:' + Math.min(100, k.war / PM.wysylka.darmowa * 100).toFixed(1) + '%"></span></div><p>' + (brak > 0 ? 'Dodaj produkty za ' + zl(brak) + ', a dostawa kurierem będzie gratis.' : 'Dostawa kurierem gratis.') + '</p></div>' : '') +
        '<a class="btn btn--k btn--szer" href="zamowienie.html">Przejdź do danych i dostawy</a></aside>';
      pkk.hidden = false; pkk.innerHTML = '<span><small class="pk-t">Razem</small> <span class="cena">' + zl(k.razem) + '</span></span><a class="btn btn--k" href="zamowienie.html">Dalej</a>';
    };
    box.addEventListener('change', function (e) {
      var t = e.target, fokus = t.id;
      if (t.name === 'd') { wybor.d = t.value; wybor.p = PLATNOSCI[wybor.d][0].id; }
      if (t.name === 'p') wybor.p = t.value;
      if (t.id && t.id.charAt(0) === 'k' && P[t.id.slice(1)]) { var x = koszyk.find(function (z) { return z.id === t.id.slice(1); }); x.q = ilePoprawna(P[x.id], t.value); zapiszKoszyk(); }
      zapisz('pm_wybor', wybor); rysujK();
      var f = fokus && document.getElementById(fokus); if (f && f.type === 'number') f.focus();
    });
    box.addEventListener('click', function (e) {
      var u = e.target.closest('[data-usun]'); if (!u) return;
      var p = P[u.dataset.usun];
      koszyk = koszyk.filter(function (x) { return x.id !== u.dataset.usun; }); zapiszKoszyk(); rysujK();
      notka('Usunięto z koszyka: ' + esc(p.n) + '.');
    });
    rysujK();
  }

  if (cl.contains('str-zamowienie')) {
    var z = $('[data-zamowienie]');
    if (!koszyk.length) { z.innerHTML = '<p class="pusto">Koszyk jest pusty. <a href="index.html">Wróć do sklepu</a>.</p>'; z.style.display = 'block'; }
    else {
      var kz = koszty();
      // telefon: kwota do zapłaty od razu nad formularzem, produkty po rozwinięciu
      z.innerHTML = '<details class="zam-skrot"><summary><span>Do zapłaty <b>' + zl(kz.razem) + '</b></span><span class="zam-skrot__pokaz">' + liczbaProd(koszyk.length) + '</span></summary><ul>' +
        koszyk.map(function (x) { var p = P[x.id]; return '<li><span>' + tw(p.n) + '<small class="il">Ilość: ' + x.q + ' ' + p.jm.replace(/\.$/, '') + '</small></span><b>' + zl(p.c * x.q) + '</b></li>'; }).join('') +
        '<li><span>' + DOSTAWY[wybor.d].n + ', ' + kz.pl.n.charAt(0).toLowerCase() + kz.pl.n.slice(1) + '</span><b>' + zl(kz.dost + kz.pl.c) + '</b></li></ul><a href="koszyk.html">Zmień produkty, dostawę lub płatność</a></details>' +
        '<form data-form novalidate><div class="przel" role="radiogroup" aria-label="Kupujesz jako">' +
        '<label><input type="radio" name="kto" value="osoba" checked>Osoba prywatna</label><label><input type="radio" name="kto" value="firma">Firma</label></div>' +
        '<div class="pola" data-firma hidden><label class="cala">Nazwa firmy<input type="text" name="firma" autocomplete="organization"></label>' +
        '<label>NIP<input type="text" name="nip" inputmode="numeric" autocomplete="off"></label></div>' +
        '<h2>Dane kontaktowe</h2><div class="pola">' +
        '<label>Imię<input type="text" name="imie" autocomplete="given-name" required></label>' +
        '<label>Nazwisko<input type="text" name="nazwisko" autocomplete="family-name" required></label>' +
        '<label>E-mail<input type="email" name="email" autocomplete="email" required><small>Wyślemy potwierdzenie zamówienia.</small></label>' +
        '<label>Telefon<input type="tel" name="tel" autocomplete="tel" inputmode="tel" required><small>Dla kuriera i w sprawie zamówienia.</small></label></div>' +
        (wybor.d === 'kurier' ? '<h2>Adres dostawy</h2><div class="pola"><label class="cala">Ulica i numer<input type="text" name="ulica" autocomplete="street-address" required></label>' +
          '<label>Kod pocztowy<input type="text" name="kod" autocomplete="postal-code" inputmode="numeric" placeholder="00-000" required></label>' +
          '<label>Miejscowość<input type="text" name="miasto" autocomplete="address-level2" required></label></div>'
          : '<h2>Odbiór osobisty</h2><p class="kat-g__opis">' + esc(PM.firma.odbior) + '</p>') +
        '<h2>Dokument</h2><div class="przel" role="radiogroup" aria-label="Dokument sprzedaży"><label><input type="radio" name="dok" value="paragon" checked>Paragon</label><label><input type="radio" name="dok" value="faktura">Faktura VAT</label></div>' +
        '<label>Uwagi do zamówienia (opcjonalnie)<textarea name="uwagi"></textarea></label>' +
        '<label class="zgoda"><input type="checkbox" name="regulamin" required><span>Akceptuję <a href="#" data-demo>regulamin sklepu</a>.</span></label>' +
        '<label class="zgoda"><input type="checkbox" name="newsletter"><span>Chcę dostawać newsletter (opcjonalnie).</span></label></form>' +
        '<aside class="podsum" aria-label="Twoje zamówienie"><h2>Twoje zamówienie</h2><dl>' + koszyk.map(function (x) { var p = P[x.id]; return '<dt>' + esc(p.n) + '<small class="il">Ilość: ' + x.q + ' ' + p.jm.replace(/\.$/, '') + '</small></dt><dd>' + zl(p.c * x.q) + '</dd>'; }).join('') +
        '<dt>' + DOSTAWY[wybor.d].n + '</dt><dd>' + zl(kz.dost) + '</dd><dt>' + kz.pl.n + '</dt><dd>' + zl(kz.pl.c) + '</dd>' +
        '<dt class="razem">Do zapłaty</dt><dd class="razem">' + zl(kz.razem) + '</dd></dl>' +
        '<button class="btn btn--k btn--szer" type="button" data-zamawiam>Zamawiam i płacę</button><p class="prog"><a href="koszyk.html">Zmień produkty, dostawę lub płatność</a></p></aside>';
      var f = $('[data-form]');
      f.addEventListener('change', function (e) {
        if (e.target.name === 'kto') { var fi = e.target.value === 'firma'; $('[data-firma]').hidden = !fi; $('[name=firma]').required = fi; $('[name=nip]').required = fi; if (fi) $('[name=dok][value=faktura]').checked = true; }
      });
      var PUSTE = { imie: 'Wpisz imię.', nazwisko: 'Wpisz nazwisko.', email: 'Wpisz adres e-mail.', tel: 'Wpisz numer telefonu.', ulica: 'Wpisz ulicę i numer domu.', kod: 'Wpisz kod pocztowy.', miasto: 'Wpisz miejscowość.', firma: 'Wpisz nazwę firmy.', nip: 'Wpisz NIP.' };
      // kod pocztowy wpisany bez kreski: 72010 → 72-010
      var kodP = $('[name=kod]', f);
      if (kodP) kodP.addEventListener('change', function () { var c = kodP.value.replace(/\D/g, ''); if (c.length === 5) kodP.value = c.slice(0, 2) + '-' + c.slice(2); });
      $('[data-zamawiam]').addEventListener('click', function () {
        var btn = this;
        $$('.blad', f).forEach(function (b) { b.remove(); });
        var bledy = $$('input[required],textarea[required]', f).filter(function (i) {
          var pusty = i.type === 'checkbox' ? !i.checked : !i.value.trim();
          var rodzaj = i.name === 'kod' ? 'kod' : i.name === 'tel' ? 'tel' : i.name === 'nip' ? 'nip' : i.type === 'email' ? 'email' : '';
          var zly = !pusty && ((rodzaj === 'email' && !/^\S+@\S+\.\S+$/.test(i.value)) || (rodzaj === 'kod' && !/^\d{2}-?\d{3}$/.test(i.value.trim())) || (rodzaj === 'tel' && i.value.replace(/\D/g, '').length < 9) || (rodzaj === 'nip' && i.value.replace(/\D/g, '').length !== 10));
          var bid = 'b-' + i.name;
          if (pusty || zly) {
            var kom = i.type === 'checkbox' ? 'Zaznacz, aby złożyć zamówienie.' : pusty ? PUSTE[i.name] || 'Uzupełnij to pole.' : { email: 'Wpisz adres e-mail, np. jan@firma.pl.', kod: 'Kod pocztowy w formacie 00-000.', tel: 'Numer telefonu ma 9 cyfr.', nip: 'NIP ma 10 cyfr.' }[rodzaj];
            i.closest('label').insertAdjacentHTML('beforeend', '<p class="blad" id="' + bid + '">' + kom + '</p>');
            i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', bid); return true;
          }
          i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); return false;
        });
        if (bledy.length) { bledy[0].focus(); return; }
        btn.disabled = true; btn.textContent = 'Wysyłanie zamówienia…';
        zapisz('pm_zam', { t: Date.now(), razem: kz.razem, dost: DOSTAWY[wybor.d].n, pl: kz.pl.n, email: $('[name=email]').value, dok: $('[name=dok]:checked').value });
        koszyk = []; zapiszKoszyk(); location.href = 'potwierdzenie.html';
      });
    }
  }

  /* ---------- newsletter i powiadomienie o dostępności ----------
     Motyw: szablon ustawia window.PM_SKLEP = { newsletter: 'inne/do_newslettera.php?tok=…', powiadom: 'inne/powiadomienie_dostepnosc.php?tok=…' }
     i formularze idą do mechanizmów shopGold z tymi samymi polami (zapisy w panelu: Newsletter, Powiadomienia o dostępności).
     Projekt (bez PM_SKLEP): zapis zostaje w tej przeglądarce, żeby dało się przejść wszystkie stany. */
  var SKLEP = window.PM_SKLEP || null;
  function poprawnyEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()); }
  function serial(pola) { return new URLSearchParams(pola).toString(); }
  // jak $.post w shopGold: formularz zakodowany w adresie, odpowiedź to komunikat sklepu (HTML zamieniony na tekst)
  function doSklepu(url, dane) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: new URLSearchParams(dane) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) { var d = document.createElement('div'); d.innerHTML = t; return d; });
  }
  function komunikat(el, tekst, rodzaj) { el.textContent = tekst; el.className = el.className.split(' ')[0] + ' ' + rodzaj; }
  function blokuj(btn, tekst) { btn.disabled = !!tekst; if (tekst) { btn.dataset.t = btn.textContent; btn.textContent = tekst; } else if (btn.dataset.t) btn.textContent = btn.dataset.t; }

  // newsletter: zapis (dwie zgody, jak w shopGold i wymaga prawo) albo wypisanie tym samym formularzem
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nl-tryb]'); if (!t) return;
    var nl = t.closest('[data-newsletter]'), wyp = nl.dataset.tryb !== 'wypisz';
    nl.dataset.tryb = wyp ? 'wypisz' : 'zapisz';
    $('.nl__h', nl).textContent = wyp ? 'Wypisz się z newslettera' : 'Promocje i nowości z hurtowni';
    $('[data-nl-opis]', nl).textContent = wyp ? 'Wpisz adres, na który przychodzi newsletter. Usuniemy go z listy.' : 'E-mail, gdy pojawi się promocja albo nowy towar. Wypisać się możesz w każdej chwili.';
    $('button[type=submit]', nl).textContent = wyp ? 'Wypisz mnie' : 'Zapisz się';
    $$('.nl__zg', nl).forEach(function (z) { z.hidden = wyp; });
    t.textContent = wyp ? 'Wróć do zapisu' : 'Chcesz się wypisać?';
    komunikat($('[data-nl-wynik]', nl), '', ''); nl.email.focus();
  });
  document.addEventListener('submit', function (e) {
    var nl = e.target.closest('[data-newsletter]'); if (!nl) return;
    e.preventDefault();
    var wypisz = nl.dataset.tryb === 'wypisz', em = nl.email, w = $('[data-nl-wynik]', nl), btn = $('button[type=submit]', nl), adres = em.value.trim().toLowerCase();
    if (!poprawnyEmail(adres)) { komunikat(w, 'Wpisz adres e-mail, np. jan@firma.pl.', 'blad'); em.focus(); return; }
    if (!wypisz) {
      var brak = [nl.zgoda_newsletter_marketing, nl.zgoda_newsletter_info_handlowa].filter(function (z) { return !z.checked; })[0];
      if (brak) { komunikat(w, 'Zaznacz obie zgody, żeby zapisać się do newslettera.', 'blad'); brak.focus(); return; }
    }
    var pola = { email: adres, zgoda_newsletter_marketing: 1, zgoda_newsletter_info_handlowa: 1 };
    if (SKLEP) {
      blokuj(btn, wypisz ? 'Wypisuję…' : 'Zapisuję…');
      var dane = { data: serial(pola) }; if (wypisz) dane.wypisz = 'tak';
      doSklepu(SKLEP.newsletter, dane).then(function (d) { komunikat(w, d.textContent.trim() || 'Gotowe.', 'ok'); if (!wypisz) nl.reset(); })
        .catch(function () { komunikat(w, 'Nie udało się połączyć ze sklepem. Spróbuj za chwilę albo zadzwoń: ' + PM.firma.telTxt + '.', 'blad'); })
        .then(function () { blokuj(btn, ''); });
      return;
    }
    var lista = czyt('pm_newsletter', []), jest = lista.indexOf(adres) > -1;
    if (wypisz) {
      if (!jest) { komunikat(w, 'Adresu ' + adres + ' nie ma na liście newslettera.', 'blad'); return; }
      zapisz('pm_newsletter', lista.filter(function (a) { return a !== adres; }));
      komunikat(w, 'Wypisano ' + adres + '. Nie będziemy wysyłać newslettera na ten adres.', 'ok'); nl.reset(); return;
    }
    if (jest) { komunikat(w, 'Adres ' + adres + ' jest już zapisany do newslettera.', 'ok'); return; }
    lista.push(adres); zapisz('pm_newsletter', lista);
    komunikat(w, 'Zapisano ' + adres + '. Pierwszy e-mail przyjdzie przy najbliższej promocji albo nowości. (W projekcie bez wysyłki.)', 'ok'); nl.reset();
  });

  // powiadomienie o dostępności: zawsze dla jednego produktu (data-powiadom = id), z jedną zgodą jak w shopGold
  function powiadomStan(f) {
    var id = f.dataset.powiadom, zap = czyt('pm_powiadom', {})[id], s = $('.powiadom__stan', f);
    $('.powiadom__pola', f).hidden = !!zap && !f.classList.contains('zmien');
    s.hidden = !zap || f.classList.contains('zmien');
    if (zap) s.innerHTML = 'Czekasz na ten produkt. Napiszemy na <b>' + esc(zap) + '</b>, gdy wróci na stan. <button class="powiadom__zm" type="button">Zmień adres</button>';
  }
  $$('[data-powiadom]').forEach(powiadomStan);
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.powiadom__zm'); if (!b) return;
    var f = b.closest('[data-powiadom]'); f.classList.add('zmien'); powiadomStan(f); $('input[type=email]', f).focus();
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-powiadom]'); if (!f) return;
    e.preventDefault();
    var id = f.dataset.powiadom, em = $('input[type=email]', f), zg = $('input[name=przetwarzanie_powiadomienie]', f), w = $('.powiadom__w', f), btn = $('button[type=submit]', f), adres = em.value.trim().toLowerCase();
    if (!poprawnyEmail(adres)) { komunikat(w, 'Wpisz adres e-mail, np. jan@firma.pl.', 'blad'); em.focus(); return; }
    if (!zg.checked) { komunikat(w, 'Zaznacz zgodę, żebyśmy mogli wysłać powiadomienie.', 'blad'); zg.focus(); return; }
    function gotowe(tekst) {
      var z = czyt('pm_powiadom', {}); z[id] = adres; zapisz('pm_powiadom', z);
      f.classList.remove('zmien'); f.reset(); powiadomStan(f); komunikat(w, tekst, 'ok');
    }
    if (SKLEP) {
      blokuj(btn, 'Zapisuję…');
      // formularz shopGold dla tego produktu (ukryte pola, np. id), potem zapis z adresem i zgodą
      doSklepu(SKLEP.powiadom + '&id=' + encodeURIComponent(id), {}).then(function (d) {
        var pola = {}; $$('input', d).forEach(function (i) { if (i.name && (i.type !== 'checkbox' || i.checked)) pola[i.name] = i.value; });
        pola.email = adres; pola.przetwarzanie_powiadomienie = 1;
        return doSklepu(SKLEP.powiadom, { data: serial(pola), parametry: '', cechy: '' });
      }).then(function (d) { gotowe(d.textContent.trim() || 'Zapisano. Napiszemy, gdy produkt wróci.'); })
        .catch(function () { komunikat(w, 'Nie udało się zapisać. Spróbuj za chwilę albo zadzwoń: ' + PM.firma.telTxt + '.', 'blad'); })
        .then(function () { blokuj(btn, ''); });
      return;
    }
    gotowe('Zapisano. Jeden e-mail na ' + adres + ', gdy produkt wróci na stan. (W projekcie bez wysyłki.)');
  });

  /* ---------- zestawy: lina + kausza + zacisk (+ szekla albo śruba rzymska), zawiesie łańcuchowe na wymiar ---------- */
  if (cl.contains('str-zestawy')) {
    $$('.katpasek a[data-zestawy]').forEach(function (a) { a.setAttribute('aria-current', 'page'); });
    var srednica = function (x) { var m = x.n.match(/(?:^|[\s-])(\d+(?:[.,]\d+)?)\s?mm\b/); return m ? parseFloat(m[1].replace(',', '.')) : 0; };
    var liny = produktyKat('9').filter(function (x) { return /^Lina stalowa/.test(x.n) && !/pętelk/i.test(x.n) && srednica(x); }); // lina z pętelkami ma już zakończenia
    var kausze = produktyKat('31'), zaciski = produktyKat('20').filter(function (x) { return /kabłąkowy EN13411-5/.test(x.n); });
    var szekle = PM.prod.filter(function (x) { return /^Szekla podłużna klasy 6/.test(x.n); });
    var sruby = produktyKat('101').filter(function (x) { return /^Śruba rzymska/.test(x.n); });
    var start = ma(P, URLP.get('lina'));
    if (!start || liny.indexOf(start) < 0) start = liny.filter(function (x) { return srednica(x) === 5; }).sort(function (a, b) { return a.c * a.min - b.c * b.min; })[0] || liny[0];
    var grupy = function (lista, fn) { var g = {}; lista.forEach(function (x) { var k = fn(x); (g[k] = g[k] || []).push(x); }); return g; };
    var opcje = function (lista, fn, wybrany, etyk) {
      var g = grupy(lista, fn); return Object.keys(g).map(function (k) { return '<optgroup label="' + esc(k) + '">' + g[k].map(function (x) { return '<option value="' + x.id + '"' + (x === wybrany ? ' selected' : '') + '>' + esc(etyk(x)) + ' (' + zl(x.c) + ' / ' + x.jm.replace(/\.$/, '') + ')</option>'; }).join('') + '</optgroup>'; }).join('');
    };
    var kz = $('[data-konfig]'), stan = { lina: start, typ: 'szekla' };
    kz.innerHTML = '<div class="kf__pola">' +
      '<label class="kf__pole kf__pole--szer">Lina<select data-k-lina>' + opcje(liny, function (x) { var k = PM.kat[katProduktu(x)]; return k ? k.n : 'Liny'; }, start, function (x) { return x.n.replace(/^Lina stalowa\s*/, ''); }) + '</select></label>' +
      '<fieldset class="kf__typ kf__typ--pion"><legend>Do czego</legend><div class="przel"><label><input type="radio" name="kf-typ" value="szekla" checked>Mocowanie (szekla)</label><label><input type="radio" name="kf-typ" value="sruba">Odciąg (śruba rzymska)</label><label><input type="radio" name="kf-typ" value="bez">Sam osprzęt</label></div></fieldset>' +
      '<label class="kf__pole" data-k-szekla-p>Szekla, dobierz do obciążenia<select data-k-szekla><option value="">wybierz udźwig</option>' + szekle.map(function (x) { return '<option value="' + x.id + '">' + esc(x.n.replace(/^Szekla podłużna klasy 6 - obciążenie\s*/, '')) + ' (' + zl(x.c) + ')</option>'; }).join('') + '</select></label>' +
      '<label class="kf__pole" data-k-sruba-p hidden>Śruba rzymska<select data-k-sruba><option value="">wybierz śrubę</option>' + opcje(sruby, function (x) { return x.n.split(' - ')[0]; }, null, function (x) { return x.n.split(' - ').slice(1).join(' - ') || x.n; }) + '</select></label>' +
      '</div><ul class="kf__lista" data-k-lista></ul><div class="kf__dol"><p class="kf__suma" data-k-suma aria-live="polite"></p><button class="btn btn--k" type="button" data-k-dodaj>Dodaj zestaw do koszyka</button></div>' +
      '<p class="kf__uwaga">Szeklę i śrubę rzymską dobierz do obciążenia roboczego. Nie wiesz jakie? Zadzwoń: <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a>.</p>';
    var ilosci = {};
    function skladniki() {
      var d = srednica(stan.lina), w = [{ rola: 'Lina', p: stan.lina }];
      var kau = kausze.filter(function (x) { var m = x.n.match(/-\s(\d+(?:[.,]\d+)?)\s?mm\b/); return m && parseFloat(m[1].replace(',', '.')) === d; })[0];
      var zac = zaciski.map(function (x) { return { p: x, r: parseFloat((x.n.match(/rozmiar (\d+(?:[.,]\d+)?)/) || [])[1]) }; }).filter(function (x) { return x.r >= d; }).sort(function (a, b) { return a.r - b.r; })[0];
      w.push(kau ? { rola: 'Kausza', p: kau } : { rola: 'Kausza', brak: 'Kauszy do liny ' + d + ' mm nie ma w sklepie.' });
      w.push(zac ? { rola: 'Zacisk', p: zac.p } : { rola: 'Zacisk', brak: 'Zacisku do liny ' + d + ' mm nie ma w sklepie.' });
      if (stan.typ === 'szekla') { var s = ma(P, $('[data-k-szekla]').value); w.push(s ? { rola: 'Szekla', p: s } : { rola: 'Szekla', brak: 'Wybierz udźwig szekli powyżej.' }); }
      if (stan.typ === 'sruba') { var sr = ma(P, $('[data-k-sruba]').value); w.push(sr ? { rola: 'Śruba rzymska', p: sr } : { rola: 'Śruba rzymska', brak: 'Wybierz śrubę rzymską powyżej.' }); }
      return w;
    }
    function rysujK() {
      var w = skladniki(), suma = 0, ile = 0;
      $('[data-k-lista]').innerHTML = w.map(function (x) {
        if (x.brak) return '<li class="kf__poz kf__poz--brak"><span class="kf__rola">' + x.rola + '</span><span>' + x.brak + '</span></li>';
        if (!x.p.dost) return '<li class="kf__poz kf__poz--brak"><span class="kf__rola">' + x.rola + '</span><span><a href="produkt.html?id=' + x.p.id + '">' + tw(x.p.n) + '</a> jest chwilowo niedostępny. ' + powiadomLink(x.p) + '</span></li>';
        var q = ilosci[x.p.id] ? ilePoprawna(x.p, ilosci[x.p.id]) : x.p.min; suma += x.p.c * q; ile++;
        return '<li class="kf__poz"><span class="kf__img" aria-hidden="true">' + img(x.p.imgm || x.p.img, '', 72, 56) + '</span><span class="kf__o"><span class="kf__rola">' + x.rola + '</span><a href="produkt.html?id=' + x.p.id + '">' + tw(x.p.n) + '</a><small>' + zl(x.p.c) + ' / ' + x.p.jm.replace(/\.$/, '') + (x.p.min > 1 ? ', od ' + x.p.min : '') + '</small></span>' +
          '<span class="kf__q" data-p="' + x.p.id + '">' + ilosc('kq' + x.p.id, x.p.min, q, 'Ilość: ' + x.p.n, x.p.kr) + '</span><b class="kf__c">' + zl(x.p.c * q) + '</b></li>';
      }).join('');
      $('[data-k-suma]').innerHTML = 'Razem za zestaw (' + liczbaProd(ile) + '): <b>' + zl(suma) + '</b><span>' + gratis(suma).replace(/^do/, 'Do').replace(/^dostawa/, 'Dostawa') + '</span>';
      stan.gotowe = w.filter(function (x) { return x.p && x.p.dost; }).map(function (x) { return { id: x.p.id, q: ilosci[x.p.id] ? ilePoprawna(x.p, ilosci[x.p.id]) : x.p.min }; });
    }
    kz.addEventListener('change', function (e) {
      var t = e.target;
      if (t.matches('[data-k-lina]')) { stan.lina = P[t.value]; ilosci = {}; }
      if (t.name === 'kf-typ') { stan.typ = t.value; $('[data-k-szekla-p]').hidden = t.value !== 'szekla'; $('[data-k-sruba-p]').hidden = t.value !== 'sruba'; }
      var q = t.closest('.kf__q'); if (q) ilosci[q.dataset.p] = t.value;
      rysujK();
    });
    $('[data-k-dodaj]').addEventListener('click', function () {
      potwierdz(this);
      var s = 0; stan.gotowe.forEach(function (x) { dodaj(x.id, x.q, true); s += P[x.id].c * x.q; });
      notka('Dodano zestaw do koszyka: ' + liczbaProd(stan.gotowe.length) + ', ' + zl(s) + '. ' + (function (t) { return t.charAt(0).toUpperCase() + t.slice(1); })(gratis()), '<a href="koszyk.html">Przejdź do koszyka</a>');
    });
    rysujK();

    // zawiesie na wymiar: zapytanie, bo gotowe zawiesie składa i oznacza sprzedawca
    var lancZ = PM.prod.filter(function (x) { return /^Łańcuch zawiesiowy ECOAT \| klasy 10/.test(x.n); });
    var zw = $('[data-konfig-zaw]');
    zw.innerHTML = '<form class="kf" data-zaw novalidate><div class="kf__pola">' +
      '<fieldset class="kf__typ"><legend>Liczba cięgien</legend><div class="przel"><label><input type="radio" name="ciegna" value="1" checked>1 cięgno</label><label><input type="radio" name="ciegna" value="2">2 cięgna</label><label><input type="radio" name="ciegna" value="4">4 cięgna</label></div></fieldset>' +
      '<label class="kf__pole">Łańcuch klasy 10<select name="lancuch">' + lancZ.map(function (x) { return '<option>' + srednica(x) + ' mm</option>'; }).join('') + '</select></label>' +
      '<label class="kf__pole">Długość cięgna (m)<input name="dl" type="number" inputmode="decimal" min="0.5" step="0.5" value="2"></label>' +
      '<label class="kf__pole">Zakończenie<select name="hak"><option>Hak z zabezpieczeniem</option><option>Hak bezpieczny (samozamykający)</option></select></label>' +
      '<label class="kf__pole">Ilość zawiesi<input name="szt" type="number" inputmode="numeric" min="1" step="1" value="1"></label>' +
      '<label class="zgoda kf__zg"><input type="checkbox" name="skr"><span>Z hakiem skracającym (regulacja długości cięgna)</span></label>' +
      '<label class="kf__pole kf__pole--szer">Udźwig albo do czego zawiesie (opcjonalnie)<input name="opis" type="text" placeholder="np. 2 t, podnoszenie palet"></label>' +
      '<label class="kf__pole">Telefon lub e-mail<input name="kontakt" type="text" autocomplete="email" required></label>' +
      '</div><div class="kf__dol"><p class="kf__suma" data-zaw-opis aria-live="polite"></p><button class="btn btn--k" type="submit">Wyślij zapytanie</button></div><p class="kf__w" role="status"></p></form>';
    var fz = $('[data-zaw]');
    function opisZ() { var f = fz; return 'Zawiesie ' + f.ciegna.value + '-cięgnowe, łańcuch ' + f.lancuch.value + ' klasy 10, cięgno ' + String(f.dl.value).replace('.', ',') + ' m, ' + f.hak.value.toLowerCase() + (f.skr.checked ? ', z hakiem skracającym' : '') + ', ' + (f.szt.value || 1) + ' szt.'; }
    function rysujZ() { $('[data-zaw-opis]').textContent = opisZ(); }
    fz.addEventListener('change', rysujZ); fz.addEventListener('input', rysujZ); rysujZ();
    fz.addEventListener('submit', function (e) {
      e.preventDefault();
      var k = fz.kontakt, w = $('.kf__w', fz);
      if (k.value.trim().length < 6) { w.textContent = 'Wpisz telefon albo e-mail, żebyśmy mogli odpowiedzieć z ceną.'; w.className = 'kf__w blad'; k.focus(); return; }
      w.textContent = 'Otwieram e-mail z zapytaniem do Polimetu. Jeśli się nie otworzy, zadzwoń: ' + PM.firma.telTxt + '.'; w.className = 'kf__w ok';
      location.href = 'mailto:' + PM.firma.mail + '?subject=' + encodeURIComponent('Zapytanie: zawiesie łańcuchowe na wymiar') + '&body=' + encodeURIComponent(opisZ() + (fz.opis.value ? '\nZastosowanie: ' + fz.opis.value : '') + '\nKontakt: ' + k.value);
    });
  }

  if (cl.contains('str-potw')) {
    var o = czyt('pm_zam', null), pt = $('[data-potwierdzenie]');
    if (o && !(Date.now() - o.t < 30 * 60 * 1000)) o = null;
    pt.innerHTML = (o ? '<h1>Dziękujemy za zamówienie</h1><p>W sklepie w tym miejscu pojawi się numer zamówienia, a potwierdzenie przyjdzie na ' + esc(o.email) + '. W projekcie zamówienie nie jest wysyłane.</p>' +
      '<dl><dt>Do zapłaty</dt><dd>' + zl(o.razem) + '</dd><dt>Dostawa</dt><dd>' + esc(o.dost) + '</dd><dt>Płatność</dt><dd>' + esc(o.pl) + '</dd><dt>Dokument</dt><dd>' + (o.dok === 'faktura' ? 'Faktura VAT' : 'Paragon') + '</dd></dl>' +
      '<p>Pytania o zamówienie: <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a>, <span class="nw">' + PM.firma.godziny + '</span>.</p><p><a class="btn btn--s" href="index.html">Wróć do sklepu</a></p>'
      : '<h1>Brak świeżego zamówienia</h1><p>Potwierdzenie każdego zamówienia przychodzi e-mailem. Pytania: <a href="tel:' + PM.firma.tel.replace(/\s/g, '') + '">' + PM.firma.telTxt + '</a>.</p><p><a class="btn btn--s" href="index.html">Wróć do sklepu</a></p>');
  }

  if (cl.contains('str-info')) {
    var st = ma(PM.strony, URLP.get('id')) || PM.strony['16'];
    document.title = st.t + ' | Polimet';
    // linie po zdaniu zakończonym dwukropkiem (np. „metod dostawy:”) to wyliczenie: pokazujemy je jako listę
    var linie = st.x.split('\n').filter(function (l) { return l.trim(); }), h = '', lista = false;
    linie.forEach(function (l, i) {
      var el = lista && l.length < 140 && !/[.:]$/.test(l.trim().replace(/[,;]$/, ''));
      if (el) { if (h.slice(-5) !== '</li>') h += '<ul class="info__l">'; h += '<li>' + tw(l.trim().replace(/[,;.]$/, '')) + '</li>'; return; }
      if (h.slice(-5) === '</li>') h += '</ul>';
      h += '<p>' + tw(l) + '</p>'; lista = /:\s*$/.test(l);
    });
    if (h.slice(-5) === '</li>') h += '</ul>';
    $('[data-info]').innerHTML = '<h1>' + tw(st.t) + '</h1>' + h;
  }

  licznik();
};
