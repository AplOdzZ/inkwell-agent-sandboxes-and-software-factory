/*
 * Voisinage — vue visuelle (lecture seule) d'une « carte de dépôt » au format carte.json.
 *
 *   const vue = Voisinage.mount(element, { carte, suivi, onSelect });
 *   vue.show(chemin);    // vue 1 : le voisinage d'un fichier
 *   vue.impact(chemin);  // vue 2 : ce qu'une modification toucherait
 *   vue.ensemble();      // vue 3 : les blocs qui se déplient
 *
 * Aucune dépendance, aucune étape de build. Le module ne connaît aucun nom de fichier,
 * de bloc ou de dossier : tout vient de `carte` (et de `suivi`, facultatif).
 * Styles : voisinage.css. Documentation : README.md.
 */
(function (racine, usine) {
  'use strict';
  const api = usine();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Voisinage = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ constantes */

  const VERSION = '1.0.0';
  const LIMITE_VOISINS = 12;     // voisins affichés par côté avant « + N autres »
  const LIMITE_NIVEAU = 12;      // fichiers par niveau d'impact avant regroupement par dossier
  const NIVEAUX_IMPACT = 3;
  const LARGEUR_COLONNES = 720;  // en dessous : les colonnes passent l'une sous l'autre
  const NS_SVG = 'http://www.w3.org/2000/svg';

  const TEXTES = {
    lecteur: 'Theo',
    recherche: 'Chercher un fichier par son nom…',
    relu: 'relu par {lecteur}',
    apercu: 'aperçu',
    fate_garder: 'à garder',
    fate_adapter: 'à adapter',
    fate_supprimer: 'à supprimer',
    fiche: 'Fiche machine — session cloud, non relue',
    impactBouton: 'Impact si je le modifie',
    racine: 'Racine du dépôt'
  };

  // Familles de liens. Les couleurs sont des variables CSS (--lien-<id>) définies dans voisinage.css.
  const FAMILLES = [
    { id: 'code', nom: 'Code', types: ['importe', 'appelle', 'lance', 'charge_extension', 'rend_prompt'] },
    { id: 'donnees', nom: 'Données', types: ['lit', 'ecrit'] },
    { id: 'config', nom: 'Configuration', types: ['configure'] },
    { id: 'copie', nom: 'Copie', types: ['copie'] },
    { id: 'doc', nom: 'Documentation', types: ['decrit'] }
  ];
  const FAMILLE_AUTRE = { id: 'autre', nom: 'Autre', types: [] };
  const ORDRE_TYPES = FAMILLES.reduce((a, f) => a.concat(f.types), []);
  const FAMILLE_DU_TYPE = {};
  FAMILLES.forEach((f) => f.types.forEach((t) => { FAMILLE_DU_TYPE[t] = f; }));

  let compteur = 0;

  /* ------------------------------------------------------------------ utilitaires DOM */

  function ajouter(parent, enfants) {
    for (const e of enfants.flat(Infinity)) {
      if (e == null || e === false) continue;
      parent.append(e.nodeType ? e : document.createTextNode(String(e)));
    }
  }

  function h(balise, props, ...enfants) {
    const e = document.createElement(balise);
    if (props) {
      for (const k of Object.keys(props)) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'on') for (const ev of Object.keys(v)) e.addEventListener(ev, v[ev]);
        else if (k === 'hidden') e.hidden = true;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    ajouter(e, enfants);
    return e;
  }

  function svg(balise, attrs, ...enfants) {
    const e = document.createElementNS(NS_SVG, balise);
    if (attrs) for (const k of Object.keys(attrs)) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    ajouter(e, enfants);
    return e;
  }

  /* ------------------------------------------------------------------ utilitaires texte */

  const nomDe = (c) => c.slice(c.lastIndexOf('/') + 1) || c;
  const dossierDe = (c) => (c.lastIndexOf('/') > 0 ? c.slice(0, c.lastIndexOf('/')) : '');
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const pluriel = (n, un, plusieurs) => n + ' ' + (n > 1 ? plusieurs : un);

  // « chemin/fichier.py:34 » ou « …:34-40 » -> « 34 » / « 34-40 »
  function ligneDe(preuve) {
    const m = /:(\d+(?:\s*[-–,]\s*\d+)*)\s*$/.exec(preuve || '');
    return m ? m[1].replace(/\s+/g, '') : '';
  }

  const rangType = (t) => { const i = ORDRE_TYPES.indexOf(t); return i < 0 ? ORDRE_TYPES.length : i; };
  const familleDe = (t) => FAMILLE_DU_TYPE[t] || FAMILLE_AUTRE;

  function vide(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  /* ------------------------------------------------------------------ mount */

  function mount(element, options) {
    options = options || {};
    const carte = options.carte;
    const T = Object.assign({}, TEXTES, options.textes || {}, options.lecteur ? { lecteur: options.lecteur } : {});
    const uid = 'vsn' + (++compteur);
    const onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;
    const onVue = typeof options.onVue === 'function' ? options.onVue : null;

    element.textContent = '';
    const racineEl = h('div', { class: 'vsn', 'data-largeur': 'large' });
    element.append(racineEl);

    if (!carte || !Array.isArray(carte.fichiers) || !Array.isArray(carte.liens)) {
      racineEl.append(h('p', { class: 'vsn-vide', role: 'alert', text: 'Carte absente ou illisible : il faut un objet avec « fichiers » et « liens ».' }));
      return { show() {}, impact() {}, ensemble() {}, courant() { return { vue: null, chemin: null }; }, destroy() { element.textContent = ''; } };
    }

    /* ---------------- index de la carte ---------------- */

    const fichiers = new Map();
    carte.fichiers.forEach((f) => { if (f && f.chemin) fichiers.set(f.chemin, f); });
    const liens = carte.liens.filter((l) => l && l.de && l.vers);
    const idLien = new Map();
    liens.forEach((l, i) => idLien.set(l, i));

    const sortants = new Map();
    const entrants = new Map();
    const pousser = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    liens.forEach((l) => { pousser(sortants, l.de, l); pousser(entrants, l.vers, l); });
    const parRang = (cle) => (a, b) => rangType(a.type) - rangType(b.type) || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0) ||
      (a[cle] < b[cle] ? -1 : a[cle] > b[cle] ? 1 : 0);
    sortants.forEach((v) => v.sort(parRang('vers')));
    entrants.forEach((v) => v.sort(parRang('de')));

    const degre = (c) => (sortants.get(c) || []).length + (entrants.get(c) || []).length;

    /* ---------------- suivi (facultatif) ---------------- */

    const suivi = options.suivi || null;
    const nomsBlocs = (suivi && suivi.blocs) || {};
    const blocParFichier = new Map();
    ((suivi && suivi.files) || []).forEach((x) => { if (x && x.p && x.b != null) blocParFichier.set(x.p, String(x.b)); });
    const notes = (suivi && suivi.notes) || {};
    const fates = ((suivi && suivi.fates) || []).filter((x) => x && x.p).map((x) => ({ p: String(x.p).replace(/\/+$/, ''), fate: x.fate, reason: x.reason }));

    function fateDe(chemin) {
      let meilleur = null;
      for (const x of fates) {
        if ((chemin === x.p || chemin.startsWith(x.p + '/')) && (!meilleur || x.p.length > meilleur.p.length)) meilleur = x;
      }
      return meilleur;
    }

    function badge(texte, classe, titre) {
      return h('span', { class: 'vsn-badge vsn-badge-' + classe, title: titre || null, text: texte });
    }

    function badgesDe(chemin) {
      const out = [];
      const n = notes[chemin];
      if (n && n.status === 'fait') out.push(badge(T.relu.replace('{lecteur}', T.lecteur), 'relu'));
      else if (n && n.status === 'apercu') out.push(badge(T.apercu, 'apercu'));
      const f = fateDe(chemin);
      if (f && (f.fate === 'garder' || f.fate === 'adapter' || f.fate === 'supprimer')) {
        out.push(badge(T['fate_' + f.fate], 'fate-' + f.fate, f.reason || null));
      }
      return out;
    }

    function levierDe(chemin) {
      const f = fichiers.get(chemin);
      return !!(f && f.levier && f.levier.valeur === true);
    }

    function losange(chemin) {
      const f = fichiers.get(chemin);
      return h('span', {
        class: 'vsn-levier', role: 'img', 'aria-label': 'fichier levier',
        title: 'Fichier levier' + (f && f.levier && f.levier.pourquoi ? ' — ' + f.levier.pourquoi : '')
      });
    }

    /* ---------------- blocs ---------------- */

    const blocs = (function () {
      const ordreSuivi = Object.keys(nomsBlocs);
      const map = new Map();
      for (const chemin of fichiers.keys()) {
        let id; let nom; let ordre;
        const b = blocParFichier.get(chemin);
        if (b != null) {
          id = 'b:' + b; nom = nomsBlocs[b] || b;
          const i = ordreSuivi.indexOf(b); ordre = [0, i < 0 ? 1000 : i, nom];
        } else {
          const i = chemin.indexOf('/');
          const d = i < 0 ? '' : chemin.slice(0, i);
          id = 'd:' + d; nom = d || T.racine; ordre = [d ? 1 : 2, 0, nom];
        }
        if (!map.has(id)) map.set(id, { id, nom, ordre, fichiers: [] });
        map.get(id).fichiers.push(chemin);
      }
      const liste = Array.from(map.values());
      liste.sort((a, b) => a.ordre[0] - b.ordre[0] || a.ordre[1] - b.ordre[1] || a.ordre[2].localeCompare(b.ordre[2]));
      liste.forEach((b) => b.fichiers.sort());
      return liste;
    }());
    const blocDeChemin = new Map();
    blocs.forEach((b) => b.fichiers.forEach((c) => blocDeChemin.set(c, b)));

    /* ---------------- état ---------------- */

    const etat = {
      vue: 'show', chemin: null,
      decrit: false,          // vue 1 : afficher les liens decrit
      famille: null,          // vue 1 : filtre de la liste
      cotesOuverts: { entr: false, sort: false },
      impactDecrit: false,    // vue 2 : inclure les liens decrit
      groupesOuverts: new Set(),
      blocsOuverts: new Set()
    };

    /* ---------------- squelette ---------------- */

    const idListe = uid + '-suggestions';
    const entree = h('input', {
      type: 'search', class: 'vsn-recherche-champ', role: 'combobox', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Chercher un fichier', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': idListe,
      placeholder: T.recherche
    });
    const suggestions = h('ul', { class: 'vsn-suggestions', role: 'listbox', id: idListe, hidden: true });
    const bulle = h('div', { class: 'vsn-bulle', role: 'tooltip', id: uid + '-bulle', hidden: true });
    const zone = h('div', { class: 'vsn-zone' });
    const barre = h('div', { class: 'vsn-barre-haut' },
      h('div', { class: 'vsn-recherche' }, entree, suggestions));
    racineEl.append(barre, zone, bulle);

    /* ---------------- recherche ---------------- */

    const index = Array.from(fichiers.keys()).map((c) => ({ chemin: c, n: norm(c), nom: norm(nomDe(c)) }));
    let suggestionsListe = [];
    let suggestionActive = -1;

    function chercher(q) {
      const jetons = norm(q).split(/\s+/).filter(Boolean);
      if (!jetons.length) return [];
      const res = [];
      for (const it of index) {
        if (!jetons.every((j) => it.n.includes(j))) continue;
        const j0 = jetons[0];
        const score = it.nom === j0 ? 0 : it.nom.startsWith(j0) ? 1 : it.nom.includes(j0) ? 2 : 3;
        res.push({ chemin: it.chemin, score });
      }
      res.sort((a, b) => a.score - b.score || a.chemin.length - b.chemin.length || (a.chemin < b.chemin ? -1 : 1));
      return res.slice(0, 8).map((r) => r.chemin);
    }

    function fermerSuggestions() {
      suggestions.hidden = true; suggestions.textContent = '';
      suggestionsListe = []; suggestionActive = -1;
      entree.setAttribute('aria-expanded', 'false'); entree.removeAttribute('aria-activedescendant');
    }

    function marquerActive(i) {
      suggestionActive = i;
      Array.from(suggestions.children).forEach((li, k) => {
        li.setAttribute('aria-selected', k === i ? 'true' : 'false');
        li.classList.toggle('vsn-actif', k === i);
      });
      if (i >= 0) entree.setAttribute('aria-activedescendant', uid + '-sug-' + i); else entree.removeAttribute('aria-activedescendant');
    }

    function choisirSuggestion(chemin) {
      fermerSuggestions();
      entree.value = '';
      aller(chemin, { vue: 'show', focus: false });
    }

    function majSuggestions() {
      const q = entree.value.trim();
      suggestions.textContent = '';
      suggestionsListe = chercher(q);
      suggestionActive = -1;
      if (!q) { fermerSuggestions(); return; }
      if (!suggestionsListe.length) {
        suggestions.append(h('li', { class: 'vsn-suggestion-vide', role: 'presentation', text: 'Aucun fichier de la carte ne correspond.' }));
      }
      suggestionsListe.forEach((c, i) => {
        suggestions.append(h('li', {
          role: 'option', id: uid + '-sug-' + i, 'aria-selected': 'false', class: 'vsn-suggestion',
          on: {
            mousedown: (e) => { e.preventDefault(); choisirSuggestion(c); },
            mousemove: () => marquerActive(i)
          }
        }, h('span', { class: 'vsn-nom', text: nomDe(c) }), ' ', h('span', { class: 'vsn-dir', text: dossierDe(c) }), badgesDe(c)));
      });
      suggestions.hidden = false;
      entree.setAttribute('aria-expanded', 'true');
    }

    entree.addEventListener('input', majSuggestions);
    entree.addEventListener('focus', () => { if (entree.value.trim()) majSuggestions(); });
    entree.addEventListener('blur', () => setTimeout(fermerSuggestions, 120));
    entree.addEventListener('keydown', (e) => {
      const n = suggestionsListe.length;
      if (e.key === 'ArrowDown' && n) { e.preventDefault(); marquerActive((suggestionActive + 1) % n); }
      else if (e.key === 'ArrowUp' && n) { e.preventDefault(); marquerActive((suggestionActive - 1 + n) % n); }
      else if (e.key === 'Enter') {
        const c = suggestionsListe[suggestionActive >= 0 ? suggestionActive : 0];
        if (c) { e.preventDefault(); choisirSuggestion(c); }
      } else if (e.key === 'Escape') { fermerSuggestions(); }
    });

    /* ---------------- bulle d'information ---------------- */

    let ancreBulle = null;
    function montrerBulle(contenu, point, pour) {
      bulle.textContent = '';
      ajouter(bulle, [contenu]);
      bulle.hidden = false;
      const w = bulle.offsetWidth; const hh = bulle.offsetHeight;
      let x; let y;
      if (point && typeof point.x === 'number') { x = point.x + 12; y = point.y + 16; }
      else { const r = point.getBoundingClientRect(); x = r.left; y = r.bottom + 6; }
      const vw = document.documentElement.clientWidth; const vh = window.innerHeight;
      if (x + w + 8 > vw) x = vw - w - 8;
      if (x < 8) x = 8;
      if (y + hh + 8 > vh) y = Math.max(8, (point.getBoundingClientRect ? point.getBoundingClientRect().top : point.y) - hh - 8);
      bulle.style.left = x + 'px'; bulle.style.top = y + 'px';
      if (ancreBulle && ancreBulle !== pour) ancreBulle.removeAttribute('aria-describedby');
      ancreBulle = pour || null;
      if (pour) pour.setAttribute('aria-describedby', bulle.id);
    }
    function cacherBulle() {
      bulle.hidden = true;
      if (ancreBulle) { ancreBulle.removeAttribute('aria-describedby'); ancreBulle = null; }
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cacherBulle(); });

    function contenuLien(l) {
      const fam = familleDe(l.type);
      const ligne = ligneDe(l.preuve);
      const marques = [];
      if (l.motif) marques.push('motif (plusieurs fichiers possibles)');
      if (l.hors_depot) marques.push('hors dépôt');
      if (l.produit_a_l_execution) marques.push('créé à l\'exécution');
      if (l.indirect) marques.push('lien indirect');
      return h('div', { class: 'vsn-bulle-bloc' },
        h('div', { class: 'vsn-bulle-titre' }, h('span', { class: 'vsn-pastille vsn-f-' + fam.id }), ' ', h('strong', { text: l.type }), ' · ' + fam.nom),
        h('div', { class: 'vsn-mono', text: nomDe(l.de) + ' → ' + nomDe(l.vers) }),
        h('div', null, 'Preuve : ', h('span', { class: 'vsn-mono', text: l.preuve || '—' }), ligne ? ' (ligne ' + ligne + ')' : ''),
        h('div', null, 'Confiance : ', h('strong', { text: l.confiance || 'non indiquée' }),
          l.pourquoi_faible ? ' — ' + l.pourquoi_faible : ''),
        l.occurrences > 1 ? h('div', { text: 'Apparaît ' + l.occurrences + ' fois dans ce fichier.' }) : null,
        marques.length ? h('div', { class: 'vsn-muted', text: marques.join(' · ') }) : null,
        Array.isArray(l.cles) && l.cles.length ? h('div', null, 'Clés : ', h('span', { class: 'vsn-mono', text: l.cles.join(', ') })) : null,
        l.note ? h('div', { class: 'vsn-note', text: l.note }) : null);
    }

    function contenuRole(chemin) {
      const f = fichiers.get(chemin);
      if (!f) return null;
      return h('div', { class: 'vsn-bulle-bloc' }, h('div', { class: 'vsn-mono vsn-bulle-chemin', text: chemin }), h('div', { text: f.role || 'Rôle non renseigné.' }));
    }

    /* ---------------- navigation ---------------- */

    function aller(chemin, opt) {
      opt = opt || {};
      const vue = opt.vue || 'show';
      const change = chemin !== etat.chemin;
      etat.vue = vue;
      if (change) {
        etat.chemin = chemin; etat.famille = null;
        etat.cotesOuverts = { entr: false, sort: false };
        etat.groupesOuverts = new Set();
      }
      cacherBulle();
      rendre({ focusTitre: opt.focus !== false });
      if (opt.utilisateur && onSelect && change) onSelect(chemin);
      if (onVue) onVue(vue, etat.chemin);
    }

    const api = {
      show(chemin) { aller(chemin == null ? etat.chemin : chemin, { vue: 'show', focus: false }); },
      impact(chemin) { aller(chemin == null ? etat.chemin : chemin, { vue: 'impact', focus: false }); },
      ensemble() { aller(etat.chemin, { vue: 'ensemble', focus: false }); },
      courant() { return { vue: etat.vue, chemin: etat.chemin }; },
      destroy() { if (observateur) observateur.disconnect(); cacherBulle(); element.textContent = ''; }
    };

    /* ---------------- briques communes ---------------- */

    function lienUtilisateur(chemin, vue) { aller(chemin, { vue: vue || 'show', utilisateur: true, focus: true }); }

    function legende() {
      const presentes = new Set(liens.map((l) => familleDe(l.type).id));
      const fams = FAMILLES.concat(presentes.has('autre') ? [FAMILLE_AUTRE] : []);
      return h('ul', { class: 'vsn-legende', 'aria-label': 'Légende' },
        fams.map((f) => h('li', null, h('span', { class: 'vsn-pastille vsn-f-' + f.id }), ' ', h('strong', { text: f.nom }),
          f.types.length ? h('span', { class: 'vsn-muted', text: ' (' + f.types.join(', ') + ')' }) : null)),
        h('li', null, h('span', { class: 'vsn-echantillon vsn-pointille' }), ' pas un fichier de la carte (motif, hors dépôt, créé à l\'exécution)'),
        h('li', null, h('span', { class: 'vsn-levier', 'aria-hidden': 'true' }), ' fichier levier'));
    }

    function accueil(titre, phrase) {
      const top = Array.from(fichiers.keys()).sort((a, b) => degre(b) - degre(a) || (a < b ? -1 : 1)).slice(0, 8);
      return h('div', { class: 'vsn-accueil' },
        h('h2', { class: 'vsn-titre', tabindex: '-1', text: titre }),
        h('p', { class: 'vsn-vide', text: phrase }),
        top.length ? h('div', null, h('p', { class: 'vsn-muted', text: 'Les fichiers les plus reliés :' }),
          h('ul', { class: 'vsn-puces' }, top.map((c) => h('li', null,
            h('button', { type: 'button', class: 'vsn-puce', 'data-cle': 'acc:' + c, on: { click: () => lienUtilisateur(c, etat.vue) } },
              h('span', { class: 'vsn-nom', text: nomDe(c) }), ' ', h('span', { class: 'vsn-dir', text: dossierDe(c) }),
              ' ', h('span', { class: 'vsn-muted', text: degre(c) + ' liens' })))))) : null);
    }

    /* ---------------- rendu général ---------------- */

    function rendre(opt) {
      opt = opt || {};
      const actif = document.activeElement;
      const cle = actif && zone.contains(actif) ? actif.getAttribute('data-cle') : null;
      zone.textContent = '';
      traceur = null;
      racineEl.setAttribute('data-vue', etat.vue);
      if (etat.chemin) racineEl.setAttribute('data-chemin', etat.chemin); else racineEl.removeAttribute('data-chemin');
      if (etat.vue === 'ensemble') rendreEnsemble();
      else if (!etat.chemin) {
        zone.append(etat.vue === 'impact'
          ? accueil('Impact d\'une modification', 'Choisissez un fichier avec la recherche ci-dessus : on montrera ce qui serait touché si vous le modifiez.')
          : accueil('Voisinage d\'un fichier', 'Choisissez un fichier avec la recherche ci-dessus pour voir qui pointe vers lui et vers qui il pointe.'));
      } else if (!fichiers.has(etat.chemin)) {
        zone.append(h('p', { class: 'vsn-vide', role: 'alert', text: 'Fichier inconnu de la carte : ' + etat.chemin }));
      } else if (etat.vue === 'impact') rendreImpact();
      else rendreVoisinage();
      if (opt.focusTitre) {
        const t = zone.querySelector('.vsn-titre');
        if (t) t.focus({ preventScroll: true });
      } else if (cle) {
        const e = Array.from(zone.querySelectorAll('[data-cle]')).find((x) => x.getAttribute('data-cle') === cle);
        if (e) e.focus({ preventScroll: true });
      }
      tracer();
    }

    /* ================================================================== VUE 1 */

    let traceur = null; // fonction qui (re)dessine les traits de la vue courante

    function carteVoisin(l, cote) {
      const autre = cote === 'entr' ? l.de : l.vers;
      const estFichier = fichiers.has(autre);
      const hors = !estFichier || l.motif || l.hors_depot || l.produit_a_l_execution;
      const fam = familleDe(l.type);
      const ligne = ligneDe(l.preuve);
      const marques = [];
      if (!estFichier && !l.motif && !l.hors_depot && !l.produit_a_l_execution) marques.push('hors carte');
      if (l.motif) marques.push('motif');
      if (l.hors_depot) marques.push('hors dépôt');
      if (l.produit_a_l_execution) marques.push('créé à l\'exécution');
      const contenu = [
        h('span', { class: 'vsn-ligne1' },
          h('span', { class: 'vsn-nom', text: nomDe(autre) }), levierDe(autre) ? losange(autre) : null),
        dossierDe(autre) ? h('span', { class: 'vsn-dir', text: dossierDe(autre) }) : null,
        h('span', { class: 'vsn-ligne3' },
          h('span', { class: 'vsn-pastille vsn-f-' + fam.id, 'aria-hidden': 'true' }), ' ',
          h('span', { class: 'vsn-type', text: l.type }), ligne ? h('span', { class: 'vsn-muted', text: ' · ligne ' + ligne }) : null),
        marques.length ? h('span', { class: 'vsn-marques', text: marques.join(' · ') }) : null,
        badgesDe(autre).length ? h('span', { class: 'vsn-badges' }, badgesDe(autre)) : null
      ];
      const attrs = {
        class: 'vsn-voisin vsn-f-' + fam.id + (hors ? ' vsn-pointille' : ''),
        'data-chemin': autre, 'data-type': l.type, 'data-lien': idLien.get(l), 'data-cle': 'v:' + cote + ':' + idLien.get(l)
      };
      const el = estFichier
        ? h('button', Object.assign({ type: 'button', on: { click: () => lienUtilisateur(autre, 'show') } }, attrs), contenu)
        : h('div', Object.assign({ tabindex: '0', role: 'group', 'aria-label': nomDe(autre) + ', ' + l.type + ' (' + (marques.join(', ') || 'hors carte') + ')' }, attrs), contenu);
      const montrer = () => {
        surligner(idLien.get(l), true);
        const c = h('div', null, estFichier ? contenuRole(autre) : null, contenuLien(l));
        if (!estFichier) c.prepend(h('div', { class: 'vsn-bulle-bloc' }, h('div', { class: 'vsn-mono vsn-bulle-chemin', text: autre }),
          h('div', { class: 'vsn-muted', text: 'Ce n\'est pas un fichier de la carte.' })));
        montrerBulle(c, el, el);
      };
      el.addEventListener('mouseenter', () => montrer());
      el.addEventListener('focus', () => montrer());
      el.addEventListener('mouseleave', () => { surligner(idLien.get(l), false); cacherBulle(); });
      el.addEventListener('blur', () => { surligner(idLien.get(l), false); cacherBulle(); });
      return el;
    }

    function surligner(id, oui) {
      const sch = zone.querySelector('.vsn-schema');
      if (!sch) return;
      const g = sch.querySelector('.vsn-trait[data-lien="' + id + '"]');
      sch.classList.toggle('vsn-survol', oui);
      if (g) g.classList.toggle('vsn-actif', oui);
    }

    function colonneVoisins(cote, ensemble, total, masques) {
      const entete = cote === 'entr' ? 'Entrants' : 'Sortants';
      const sous = cote === 'entr' ? 'ils pointent vers ce fichier' : 'ce fichier pointe vers eux';
      const ouvert = etat.cotesOuverts[cote];
      const visibles = ouvert ? ensemble : ensemble.slice(0, LIMITE_VOISINS);
      const comptes = {};
      ensemble.forEach((l) => { comptes[l.type] = (comptes[l.type] || 0) + 1; });
      const corps = [];
      let dernier = null;
      visibles.forEach((l) => {
        if (l.type !== dernier) {
          corps.push(h('div', { class: 'vsn-groupe', text: l.type + ' · ' + comptes[l.type] }));
          dernier = l.type;
        }
        corps.push(carteVoisin(l, cote));
      });
      const reste = ensemble.length - visibles.length;
      return h('section', { class: 'vsn-col vsn-col-' + cote, 'data-sens': cote, 'data-total': total, 'data-affiches': ensemble.length },
        h('h3', { class: 'vsn-col-titre' }, entete, ' ', h('span', { class: 'vsn-muted', text: '— ' + sous })),
        h('p', { class: 'vsn-col-compte' }, pluriel(ensemble.length, 'lien', 'liens'),
          masques ? h('span', { class: 'vsn-muted', text: ' (+ ' + masques + ' de documentation masqué' + (masques > 1 ? 's' : '') + ')' }) : null),
        ensemble.length ? h('div', { class: 'vsn-col-corps' }, corps) : h('p', { class: 'vsn-vide-col', text: 'Aucun.' }),
        reste > 0 ? h('button', {
          type: 'button', class: 'vsn-bouton', 'data-cle': 'plus:' + cote,
          on: { click: () => { etat.cotesOuverts[cote] = true; rendre(); } }
        }, '+ ' + reste + ' autre' + (reste > 1 ? 's' : '')) : null,
        ouvert && ensemble.length > LIMITE_VOISINS ? h('button', {
          type: 'button', class: 'vsn-bouton', 'data-cle': 'moins:' + cote,
          on: { click: () => { etat.cotesOuverts[cote] = false; rendre(); } }
        }, 'Réduire à ' + LIMITE_VOISINS) : null);
    }

    function rendreVoisinage() {
      const chemin = etat.chemin;
      const f = fichiers.get(chemin);
      const tousEntr = entrants.get(chemin) || [];
      const tousSort = sortants.get(chemin) || [];
      const nbDecrit = tousEntr.filter((l) => l.type === 'decrit').length + tousSort.filter((l) => l.type === 'decrit').length;
      const visible = (l) => etat.decrit || l.type !== 'decrit';
      const entr = tousEntr.filter(visible);
      const sort = tousSort.filter(visible);
      const masqEntr = tousEntr.length - entr.length;
      const masqSort = tousSort.length - sort.length;

      const metas = h('p', { class: 'vsn-meta' },
        f.type ? h('span', { class: 'vsn-etiquette', text: f.type }) : null,
        f.lignes != null ? h('span', { class: 'vsn-muted', text: f.lignes + ' lignes' }) : null,
        levierDe(chemin) ? h('span', { class: 'vsn-etiquette vsn-etiquette-levier' }, losange(chemin), ' levier') : null,
        badgesDe(chemin));

      zone.append(
        h('header', { class: 'vsn-entete' },
          h('h2', { class: 'vsn-titre', tabindex: '-1' }, h('span', { class: 'vsn-nom', text: nomDe(chemin) }),
            dossierDe(chemin) ? h('span', { class: 'vsn-dir', text: dossierDe(chemin) }) : null),
          metas,
          f.role ? h('p', { class: 'vsn-role', text: f.role }) : null,
          h('div', { class: 'vsn-actions' },
            h('button', { type: 'button', class: 'vsn-bouton vsn-bouton-fort', 'data-cle': 'impact', on: { click: () => aller(chemin, { vue: 'impact', focus: true }) } }, T.impactBouton),
            nbDecrit ? h('button', {
              type: 'button', class: 'vsn-bouton', 'aria-pressed': etat.decrit ? 'true' : 'false', 'data-cle': 'decrit',
              on: { click: () => { etat.decrit = !etat.decrit; rendre(); } }
            }, (etat.decrit ? 'Masquer' : 'Afficher') + ' les liens de documentation (' + nbDecrit + ')')
              : h('span', { class: 'vsn-muted', text: 'Aucun lien de documentation.' }))),
        legende(),
        schemaVoisinage(chemin, f, entr, sort, tousEntr.length, tousSort.length, masqEntr, masqSort),
        listeLiens(chemin, tousEntr, tousSort),
        ficheMachine(f));
    }

    function schemaVoisinage(chemin, f, entr, sort, totE, totS, masqE, masqS) {
      const cadre = svg('svg', { class: 'vsn-traits', 'aria-hidden': 'true', focusable: 'false' });
      const centre = h('div', { class: 'vsn-centre', 'data-chemin': chemin },
        h('span', { class: 'vsn-centre-etiquette', text: 'Fichier choisi' }),
        h('span', { class: 'vsn-ligne1' }, h('span', { class: 'vsn-nom', text: nomDe(chemin) }), levierDe(chemin) ? losange(chemin) : null),
        dossierDe(chemin) ? h('span', { class: 'vsn-dir', text: dossierDe(chemin) }) : null,
        f.type ? h('span', { class: 'vsn-muted', text: f.type }) : null,
        badgesDe(chemin).length ? h('span', { class: 'vsn-badges' }, badgesDe(chemin)) : null);
      const colE = colonneVoisins('entr', entr, totE, masqE);
      const colS = colonneVoisins('sort', sort, totS, masqS);
      const sch = h('div', { class: 'vsn-schema' }, cadre, colE, h('section', { class: 'vsn-col vsn-col-centre' }, centre), colS);
      traceur = () => tracerVoisinage(sch, cadre, centre);
      return sch;
    }

    function tracerVoisinage(sch, cadre, centre) {
      cadre.textContent = '';
      if (racineEl.getAttribute('data-largeur') !== 'large') { cadre.style.display = 'none'; return; }
      cadre.style.display = '';
      const cr = sch.getBoundingClientRect();
      cadre.setAttribute('width', cr.width); cadre.setAttribute('height', cr.height);
      cadre.setAttribute('viewBox', '0 0 ' + cr.width + ' ' + cr.height);
      const rc = centre.getBoundingClientRect();
      ['entr', 'sort'].forEach((cote) => {
        const cartes = Array.from(sch.querySelectorAll('.vsn-col-' + cote + ' .vsn-voisin'));
        const n = cartes.length;
        const marge = Math.min(12, rc.height / 4);
        cartes.forEach((c, i) => {
          const r = c.getBoundingClientRect();
          const yCentre = rc.top - cr.top + marge + (i + 0.5) * ((rc.height - 2 * marge) / n);
          const yCarte = r.top - cr.top + r.height / 2;
          let x1; let y1; let x2; let y2;
          if (cote === 'entr') { x1 = r.right - cr.left; y1 = yCarte; x2 = rc.left - cr.left; y2 = yCentre; }
          else { x1 = rc.right - cr.left; y1 = yCentre; x2 = r.left - cr.left; y2 = yCarte; }
          const fin = x2 - 7; const xm = (x1 + fin) / 2;
          const id = c.getAttribute('data-lien');
          const l = liens[Number(id)];
          const fam = familleDe(l.type);
          const g = svg('g', { class: 'vsn-trait vsn-f-' + fam.id + (c.classList.contains('vsn-pointille') ? ' vsn-pointille' : ''), 'data-lien': id },
            svg('path', { class: 'vsn-trait-zone', d: 'M' + x1 + ',' + y1 + ' C' + xm + ',' + y1 + ' ' + xm + ',' + y2 + ' ' + fin + ',' + y2 }),
            svg('path', { class: 'vsn-trait-ligne', d: 'M' + x1 + ',' + y1 + ' C' + xm + ',' + y1 + ' ' + xm + ',' + y2 + ' ' + fin + ',' + y2 }),
            svg('path', { class: 'vsn-trait-pointe', d: 'M' + x2 + ',' + y2 + ' L' + fin + ',' + (y2 - 4) + ' L' + fin + ',' + (y2 + 4) + ' Z' }));
          g.addEventListener('mouseenter', (e) => { surligner(Number(id), true); montrerBulle(contenuLien(l), { x: e.clientX, y: e.clientY }, null); });
          g.addEventListener('mousemove', (e) => { if (!bulle.hidden) { bulle.style.left = Math.min(e.clientX + 12, document.documentElement.clientWidth - bulle.offsetWidth - 8) + 'px'; bulle.style.top = (e.clientY + 16) + 'px'; } });
          g.addEventListener('mouseleave', () => { surligner(Number(id), false); cacherBulle(); });
          cadre.append(g);
        });
      });
    }

    /* ---- liste des liens ---- */

    function listeLiens(chemin, tousEntr, tousSort) {
      const tous = tousEntr.map((l) => ({ l, cote: 'entr' })).concat(tousSort.map((l) => ({ l, cote: 'sort' })));
      const famillesPresentes = FAMILLES.concat([FAMILLE_AUTRE]).filter((fa) => tous.some((x) => familleDe(x.l.type).id === fa.id));
      const filtres = tous.filter((x) => !etat.famille || familleDe(x.l.type).id === etat.famille);
      const bouton = (id, nom, n) => h('button', {
        type: 'button', class: 'vsn-filtre' + (etat.famille === id ? ' vsn-filtre-actif' : ''), 'aria-pressed': etat.famille === id ? 'true' : 'false',
        'data-cle': 'filtre:' + id, on: { click: () => { etat.famille = id; rendre(); } }
      }, id ? h('span', { class: 'vsn-pastille vsn-f-' + id, 'aria-hidden': 'true' }) : null, id ? ' ' : '', nom + ' (' + n + ')');
      return h('section', { class: 'vsn-section' },
        h('h3', { class: 'vsn-section-titre', text: 'Tous les liens de ce fichier' }),
        tous.length ? h('div', { class: 'vsn-filtres', role: 'group', 'aria-label': 'Filtrer par famille' },
          bouton(null, 'Toutes', tous.length),
          famillesPresentes.map((fa) => bouton(fa.id, fa.nom, tous.filter((x) => familleDe(x.l.type).id === fa.id).length))) : null,
        tous.length ? h('ul', { class: 'vsn-liste', 'data-total': tous.length, 'data-affiches': filtres.length },
          filtres.map(({ l, cote }) => {
            const autre = cote === 'entr' ? l.de : l.vers;
            const estFichier = fichiers.has(autre);
            const fam = familleDe(l.type);
            const hors = !estFichier || l.motif || l.hors_depot || l.produit_a_l_execution;
            return h('li', { class: 'vsn-ligne-lien vsn-f-' + fam.id, 'data-sens': cote },
              h('span', { class: 'vsn-sens', text: cote === 'entr' ? '← entrant' : '→ sortant' }),
              h('span', { class: 'vsn-type' }, h('span', { class: 'vsn-pastille vsn-f-' + fam.id, 'aria-hidden': 'true' }), ' ', l.type),
              estFichier
                ? h('button', { type: 'button', class: 'vsn-lien-fichier' + (hors ? ' vsn-pointille' : ''), 'data-cle': 'lst:' + idLien.get(l), on: { click: () => lienUtilisateur(autre, 'show') }, title: autre, text: autre })
                : h('span', { class: 'vsn-lien-fichier vsn-pointille', title: 'Pas un fichier de la carte', text: autre }),
              h('span', { class: 'vsn-mono vsn-preuve', text: l.preuve || '—' }),
              h('span', { class: 'vsn-confiance vsn-confiance-' + (l.confiance || 'inconnue'), text: 'confiance ' + (l.confiance || '?') }),
              l.note ? h('span', { class: 'vsn-note', text: l.note }) : null);
          }))
          : h('p', { class: 'vsn-vide-col', text: 'Aucun lien pour ce fichier dans la carte.' }));
    }

    /* ---- fiche machine ---- */

    function listeLignes(titre, items, rendu) {
      if (vide(items)) return null;
      return h('div', { class: 'vsn-fiche-bloc' }, h('h4', { text: titre }),
        h('ul', null, items.map((it) => h('li', null, rendu(it)))));
    }

    function texteItem(it, champPrincipal, champLigne) {
      if (typeof it === 'string') return it;
      const ligne = it[champLigne || 'ligne'];
      return [h('span', { class: 'vsn-mono', text: String(it[champPrincipal] == null ? JSON.stringify(it) : it[champPrincipal]) }),
        ligne != null ? h('span', { class: 'vsn-muted', text: ' — ligne ' + ligne }) : null];
    }

    function ficheMachine(f) {
      const secrets = Array.isArray(f.secrets) ? f.secrets.map((s) => (typeof s === 'string' ? s : JSON.stringify(s))).join(' ; ') : f.secrets;
      const contenu = [
        h('p', { class: 'vsn-fiche-note vsn-muted', text: 'Produite automatiquement, pas relue par un humain : à lire comme une piste, pas comme une vérité.' }),
        f.role ? h('div', { class: 'vsn-fiche-bloc' }, h('h4', { text: 'Rôle' }), h('p', { text: f.role })) : null,
        f.levier ? h('div', { class: 'vsn-fiche-bloc' }, h('h4', null, 'Levier ', h('strong', { text: f.levier.valeur ? 'oui' : 'non' })),
          f.levier.pourquoi ? h('p', { text: f.levier.pourquoi }) : null) : null,
        listeLignes('Fonctions clés', f.fonctions_cles, (x) => [h('strong', { text: x.nom || '' }),
          x.lignes != null ? h('span', { class: 'vsn-muted', text: ' — lignes ' + x.lignes }) : null,
          x.ce_quelle_fait ? h('div', { text: x.ce_quelle_fait }) : null]),
        listeLignes('Lit', f.lit, (x) => texteItem(x, 'quoi')),
        listeLignes('Écrit', f.ecrit, (x) => texteItem(x, 'quoi')),
        listeLignes('Lance', f.lance, (x) => texteItem(x, 'commande')),
        listeLignes('Réseau', f.reseau, (x) => texteItem(x, 'hote')),
        listeLignes('Variables d\'environnement', f.variables_env, (x) => [texteItem(x, 'nom'), x.lue_ou_ecrite ? h('span', { class: 'vsn-muted', text: ' (' + x.lue_ou_ecrite + ')' }) : null]),
        listeLignes('Clés de configuration', f.cles_config, (x) => texteItem(x, 'cle')),
        vide(secrets) ? null : h('div', { class: 'vsn-fiche-bloc vsn-attention' }, h('h4', { text: 'Secrets' }), h('p', { text: secrets })),
        listeLignes('Contradictions', f.contradictions, (x) => (typeof x === 'string' ? x : [
          h('div', { text: x.resume || '' }),
          h('div', { class: 'vsn-muted' }, x.doc ? ['Doc : ', h('span', { class: 'vsn-mono', text: x.doc })] : null, x.doc && x.code ? ' · ' : null,
            x.code ? ['Code : ', h('span', { class: 'vsn-mono', text: x.code })] : null)])),
        f.copie_de ? h('div', { class: 'vsn-fiche-bloc' }, h('h4', { text: 'Copie de' }), h('p', { class: 'vsn-mono', text: f.copie_de })) : null,
        listeLignes('Différences avec l\'original', f.differences, (x) => (typeof x === 'string' ? x : [h('div', { text: x.resume || '' }),
          h('div', { class: 'vsn-muted vsn-mono', text: [x.lignes_modele ? 'copie : ' + x.lignes_modele : '', x.lignes_original ? 'original : ' + x.lignes_original : ''].filter(Boolean).join(' · ') })]))
      ];
      const aDuDetail = ['fonctions_cles', 'lit', 'ecrit', 'lance', 'reseau', 'variables_env', 'secrets', 'contradictions', 'cles_config', 'levier'].some((k) => !vide(f[k]) || (k === 'levier' && f.levier));
      return h('details', { class: 'vsn-fiche', 'data-cle': 'fiche' },
        h('summary', { text: T.fiche }),
        aDuDetail ? contenu : [contenu[0], contenu[1], h('p', { class: 'vsn-vide-col', text: 'Pas de fiche détaillée pour ce fichier : seuls son type, sa taille et son rôle sont connus.' })]);
    }

    /* ================================================================== VUE 2 */

    function calculerImpact(chemin, avecDecrit) {
      const vus = new Map([[chemin, { niveau: 0 }]]);
      const niveaux = [];
      let front = [chemin];
      for (let n = 1; n <= NIVEAUX_IMPACT; n++) {
        const liste = []; const suivants = [];
        for (const cible of front) {
          for (const l of (entrants.get(cible) || [])) {
            if (!avecDecrit && l.type === 'decrit') continue;
            if (vus.has(l.de) || !fichiers.has(l.de)) continue;
            vus.set(l.de, { niveau: n, via: l, cible });
            liste.push(l.de); suivants.push(l.de);
          }
        }
        niveaux.push(liste); front = suivants;
      }
      return { vus, niveaux };
    }

    function carteTouchee(chemin, info) {
      const f = fichiers.get(chemin);
      const l = info.via;
      const fam = familleDe(l.type);
      const el = h('button', {
        type: 'button', class: 'vsn-touche vsn-f-' + fam.id, 'data-chemin': chemin, 'data-cle': 'imp:' + chemin,
        on: { click: () => lienUtilisateur(chemin, 'show') }
      },
      h('span', { class: 'vsn-ligne1' }, h('span', { class: 'vsn-nom', text: nomDe(chemin) }), levierDe(chemin) ? losange(chemin) : null),
      dossierDe(chemin) ? h('span', { class: 'vsn-dir', text: dossierDe(chemin) }) : null,
      h('span', { class: 'vsn-ligne3' }, h('span', { class: 'vsn-pastille vsn-f-' + fam.id, 'aria-hidden': 'true' }), ' ',
        h('span', { class: 'vsn-type', text: l.type }), ' → ', h('span', { class: 'vsn-mono', text: nomDe(info.cible) })),
      h('span', { class: 'vsn-mono vsn-preuve', text: l.preuve || '' }),
      f && f.role ? h('span', { class: 'vsn-role-court', text: f.role }) : null,
      badgesDe(chemin).length ? h('span', { class: 'vsn-badges' }, badgesDe(chemin)) : null);
      return el;
    }

    function colonneNiveau(n, liste, vus) {
      const titre = n === 1 ? 'Niveau 1 — touchés directement' : n === 2 ? 'Niveau 2 — touchés par ricochet' : 'Niveau 3 — plus loin encore';
      let corps;
      if (!liste.length) corps = h('p', { class: 'vsn-vide-col', text: 'Aucun fichier.' });
      else if (liste.length <= LIMITE_NIVEAU) corps = h('div', { class: 'vsn-col-corps' }, liste.map((c) => carteTouchee(c, vus.get(c))));
      else {
        const groupes = new Map();
        liste.forEach((c) => { const d = dossierDe(c) || T.racine; if (!groupes.has(d)) groupes.set(d, []); groupes.get(d).push(c); });
        corps = h('div', { class: 'vsn-col-corps' }, Array.from(groupes.keys()).sort().map((d) => {
          const cle = n + '|' + d; const ouvert = etat.groupesOuverts.has(cle);
          const m = groupes.get(d);
          return h('div', { class: 'vsn-groupe-dossier' + (ouvert ? ' vsn-ouvert' : '') },
            h('button', {
              type: 'button', class: 'vsn-groupe-bouton', 'aria-expanded': ouvert ? 'true' : 'false', 'data-cle': 'grp:' + cle,
              on: { click: () => { if (ouvert) etat.groupesOuverts.delete(cle); else etat.groupesOuverts.add(cle); rendre(); } }
            }, h('span', { class: 'vsn-chevron', 'aria-hidden': 'true' }), h('span', { class: 'vsn-mono', text: d }), h('span', { class: 'vsn-compte', text: pluriel(m.length, 'fichier', 'fichiers') })),
            ouvert ? h('div', { class: 'vsn-groupe-corps' }, m.map((c) => carteTouchee(c, vus.get(c)))) : null);
        }));
      }
      return h('section', { class: 'vsn-col vsn-niveau', 'data-niveau': n, 'data-total': liste.length },
        h('h3', { class: 'vsn-col-titre', text: titre }),
        h('p', { class: 'vsn-col-compte', text: pluriel(liste.length, 'fichier', 'fichiers') }),
        corps);
    }

    function rendreImpact() {
      const chemin = etat.chemin;
      const f = fichiers.get(chemin);
      const { vus, niveaux } = calculerImpact(chemin, etat.impactDecrit);
      const touches = [].concat(...niveaux);
      const leviers = touches.filter(levierDe).length;
      const aVerifier = touches.map((c) => {
        const fc = fichiers.get(c); const raisons = [];
        if (!vide(fc.contradictions)) raisons.push(pluriel(fc.contradictions.length, 'contradiction', 'contradictions'));
        if (!vide(fc.secrets)) raisons.push('secrets signalés');
        return raisons.length ? { c, raisons } : null;
      }).filter(Boolean);
      const nbDecrit = (entrants.get(chemin) || []).filter((l) => l.type === 'decrit').length;

      zone.append(
        h('header', { class: 'vsn-entete' },
          h('h2', { class: 'vsn-titre', tabindex: '-1' }, 'Si je modifie ', h('span', { class: 'vsn-nom', text: nomDe(chemin) }),
            dossierDe(chemin) ? h('span', { class: 'vsn-dir', text: dossierDe(chemin) }) : null),
          h('p', { class: 'vsn-role', text: 'Qu\'est-ce qui est touché ? On remonte les liens à l\'envers : les fichiers qui pointent vers celui-ci, puis ceux qui pointent vers eux, sur ' + NIVEAUX_IMPACT + ' niveaux.' }),
          h('div', { class: 'vsn-actions' },
            h('button', { type: 'button', class: 'vsn-bouton', 'data-cle': 'voisin', on: { click: () => aller(chemin, { vue: 'show', focus: true }) } }, 'Voir son voisinage'),
            h('button', {
              type: 'button', class: 'vsn-bouton', 'aria-pressed': etat.impactDecrit ? 'true' : 'false', 'data-cle': 'impdecrit',
              on: { click: () => { etat.impactDecrit = !etat.impactDecrit; rendre(); } }
            }, (etat.impactDecrit ? 'Exclure' : 'Inclure') + ' les liens de documentation' + (nbDecrit ? ' (' + nbDecrit + ' vers ce fichier)' : '')))),
        h('section', { class: 'vsn-bilan', 'aria-label': 'Bilan' },
          h('p', { class: 'vsn-bilan-ligne' }, h('strong', { text: pluriel(touches.length, 'fichier touché', 'fichiers touchés') }),
            ' (' + niveaux.map((n, i) => 'niveau ' + (i + 1) + ' : ' + n.length).join(' · ') + ')'),
          h('p', { class: 'vsn-bilan-ligne' }, h('span', { class: 'vsn-levier', 'aria-hidden': 'true' }), ' ', h('strong', { text: pluriel(leviers, 'levier touché', 'leviers touchés') })),
          h('div', { class: 'vsn-verifier' + (aVerifier.length ? ' vsn-attention' : '') },
            h('h3', { text: 'Zones à vérifier' }),
            aVerifier.length ? h('ul', null, aVerifier.map((x) => h('li', null,
              h('button', { type: 'button', class: 'vsn-lien-fichier', 'data-cle': 'ver:' + x.c, on: { click: () => lienUtilisateur(x.c, 'show') }, title: x.c, text: x.c }),
              ' ', h('span', { class: 'vsn-muted', text: '— ' + x.raisons.join(', ') }))))
              : h('p', { class: 'vsn-muted', text: 'Aucun fichier touché n\'a de contradiction ni de secret signalé dans sa fiche.' })),
          h('p', { class: 'vsn-muted vsn-petit', text: 'Calculé d\'après les liens de la carte : un lien absent de la carte n\'est pas pris en compte.' })),
        h('div', { class: 'vsn-colonnes' },
          h('section', { class: 'vsn-col vsn-niveau vsn-niveau-0', 'data-niveau': '0' },
            h('h3', { class: 'vsn-col-titre', text: 'Fichier modifié' }),
            h('div', { class: 'vsn-col-corps' },
              h('div', { class: 'vsn-centre' },
                h('span', { class: 'vsn-ligne1' }, h('span', { class: 'vsn-nom', text: nomDe(chemin) }), levierDe(chemin) ? losange(chemin) : null),
                dossierDe(chemin) ? h('span', { class: 'vsn-dir', text: dossierDe(chemin) }) : null,
                f.role ? h('span', { class: 'vsn-role-court', text: f.role }) : null,
                badgesDe(chemin).length ? h('span', { class: 'vsn-badges' }, badgesDe(chemin)) : null))),
          niveaux.map((liste, i) => colonneNiveau(i + 1, liste, vus))));
    }

    /* ================================================================== VUE 3 */

    function liensEntreBlocs() {
      const paires = new Map();
      for (const l of liens) {
        if (l.type === 'decrit') continue;
        const a = blocDeChemin.get(l.de); const b = blocDeChemin.get(l.vers);
        if (!a || !b || a === b) continue;
        const [x, y] = a.id < b.id ? [a, b] : [b, a];
        const cle = x.id + '\u0001' + y.id;
        if (!paires.has(cle)) paires.set(cle, { a: x, b: y, n: 0, ab: 0, ba: 0 });
        const p = paires.get(cle); p.n++;
        if (a === x) p.ab++; else p.ba++;
      }
      return Array.from(paires.values());
    }

    function rendreEnsemble() {
      const paires = liensEntreBlocs();
      const max = paires.reduce((m, p) => Math.max(m, p.n), 1);
      const parBloc = new Map();
      blocs.forEach((b) => parBloc.set(b.id, []));
      paires.forEach((p) => {
        parBloc.get(p.a.id).push({ autre: p.b, n: p.n, sortants: p.ab, entrants: p.ba });
        parBloc.get(p.b.id).push({ autre: p.a, n: p.n, sortants: p.ba, entrants: p.ab });
      });
      const elements = new Map();
      const fond = svg('svg', { class: 'vsn-traits', 'aria-hidden': 'true', focusable: 'false' });
      const dessus = svg('svg', { class: 'vsn-traits vsn-etiquettes', 'aria-hidden': 'true', focusable: 'false' });

      const cartes = blocs.map((b) => {
        const ouvert = etat.blocsOuverts.has(b.id);
        const voisins = parBloc.get(b.id).sort((x, y) => y.n - x.n);
        const idCorps = uid + '-corps-' + elements.size;
        const nbLeviers = b.fichiers.filter(levierDe).length;
        const entete = h('button', {
          type: 'button', class: 'vsn-bloc-entete', 'aria-expanded': ouvert ? 'true' : 'false', 'aria-controls': idCorps, 'data-cle': 'bloc:' + b.id,
          on: { click: () => { if (etat.blocsOuverts.has(b.id)) etat.blocsOuverts.delete(b.id); else etat.blocsOuverts.add(b.id); rendre(); } }
        }, h('span', { class: 'vsn-chevron', 'aria-hidden': 'true' }),
        h('span', { class: 'vsn-bloc-nom', text: b.nom }),
        h('span', { class: 'vsn-compte', text: pluriel(b.fichiers.length, 'fichier', 'fichiers') + (nbLeviers ? ' · ' + pluriel(nbLeviers, 'levier', 'leviers') : '') }));
        const el = h('article', { class: 'vsn-bloc' + (ouvert ? ' vsn-ouvert' : ''), 'data-bloc': b.id },
          entete,
          voisins.length ? h('ul', { class: 'vsn-liens-blocs', 'aria-label': 'Liens vers les autres blocs' }, voisins.map((v) => h('li', null,
            h('button', {
              type: 'button', class: 'vsn-lien-bloc', 'data-cle': 'lb:' + b.id + ':' + v.autre.id,
              title: v.sortants + ' sortant' + (v.sortants > 1 ? 's' : '') + ', ' + v.entrants + ' entrant' + (v.entrants > 1 ? 's' : '') + ' (hors documentation)',
              on: { click: () => { const t = elements.get(v.autre.id); if (t) { t.el.classList.add('vsn-flash'); t.entete.focus(); setTimeout(() => t.el.classList.remove('vsn-flash'), 1400); } } }
            }, h('span', { class: 'vsn-fleche-bloc', 'aria-hidden': 'true', style: 'border-top-width:' + Math.max(1, Math.round(1 + 5 * Math.sqrt(v.n / max))) + 'px' }),
            h('span', { class: 'vsn-bloc-nom', text: v.autre.nom }), ' ', h('strong', { text: String(v.n) }), h('span', { class: 'vsn-muted', text: ' liens' }))))) :
            h('p', { class: 'vsn-muted vsn-petit', text: 'Aucun lien vers un autre bloc (hors documentation).' }),
          ouvert ? h('ul', { class: 'vsn-bloc-fichiers', id: idCorps }, b.fichiers.map((c) => {
            const fc = fichiers.get(c);
            return h('li', null, h('button', { type: 'button', class: 'vsn-fichier', 'data-chemin': c, 'data-cle': 'bf:' + c, on: { click: () => lienUtilisateur(c, 'show') }, title: c },
              h('span', { class: 'vsn-ligne1' }, h('span', { class: 'vsn-nom', text: nomDe(c) }), levierDe(c) ? losange(c) : null, badgesDe(c)),
              dossierDe(c) && dossierDe(c) !== b.nom ? h('span', { class: 'vsn-dir', text: dossierDe(c) }) : null,
              fc.role ? h('span', { class: 'vsn-role-court', text: fc.role }) : null));
          })) : null);
        elements.set(b.id, { el, entete });
        const surv = (oui) => {
          fond.parentNode && fond.parentNode.classList.toggle('vsn-survol', oui);
          fond.querySelectorAll('[data-a="' + CSS.escape(b.id) + '"],[data-b="' + CSS.escape(b.id) + '"]').forEach((g) => g.classList.toggle('vsn-actif', oui));
          dessus.querySelectorAll('[data-a="' + CSS.escape(b.id) + '"],[data-b="' + CSS.escape(b.id) + '"]').forEach((g) => g.classList.toggle('vsn-actif', oui));
        };
        el.addEventListener('mouseenter', () => surv(true)); el.addEventListener('mouseleave', () => surv(false));
        el.addEventListener('focusin', () => surv(true)); el.addEventListener('focusout', () => surv(false));
        return el;
      });

      const grille = h('div', { class: 'vsn-blocs-grille' }, cartes);
      const sch = h('div', { class: 'vsn-schema vsn-schema-blocs' }, fond, grille, dessus);
      traceur = () => tracerBlocs(sch, fond, dessus, paires, max, elements);

      zone.append(
        h('header', { class: 'vsn-entete' },
          h('h2', { class: 'vsn-titre', tabindex: '-1', text: 'Les blocs du dépôt' }),
          h('p', { class: 'vsn-role', text: blocs.length + ' blocs, ' + fichiers.size + ' fichiers. Cliquez un bloc pour le déplier sur place ; plusieurs peuvent rester ouverts. L\'épaisseur d\'un trait suit le nombre de liens entre deux blocs (documentation exclue).' }),
          h('div', { class: 'vsn-actions' },
            h('button', { type: 'button', class: 'vsn-bouton', 'data-cle': 'toutdeplier', on: { click: () => { blocs.forEach((b) => etat.blocsOuverts.add(b.id)); rendre(); } } }, 'Tout déplier'),
            h('button', { type: 'button', class: 'vsn-bouton', 'data-cle': 'toutreplier', on: { click: () => { etat.blocsOuverts.clear(); rendre(); } } }, 'Tout replier'))),
        sch);
      if (!paires.length) zone.append(h('p', { class: 'vsn-muted', text: 'Aucun lien entre blocs dans cette carte.' }));
    }

    function tracerBlocs(sch, fond, dessus, paires, max, elements) {
      fond.textContent = ''; dessus.textContent = '';
      if (racineEl.getAttribute('data-largeur') !== 'large') { fond.style.display = 'none'; dessus.style.display = 'none'; return; }
      fond.style.display = ''; dessus.style.display = '';
      const cr = sch.getBoundingClientRect();
      [fond, dessus].forEach((s) => { s.setAttribute('width', cr.width); s.setAttribute('height', cr.height); s.setAttribute('viewBox', '0 0 ' + cr.width + ' ' + cr.height); });
      const boite = (id) => {
        const r = elements.get(id).el.getBoundingClientRect();
        return { cx: r.left - cr.left + r.width / 2, cy: r.top - cr.top + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
      };
      paires.forEach((p) => {
        const A = boite(p.a.id); const B = boite(p.b.id);
        const dx = B.cx - A.cx; const dy = B.cy - A.cy;
        const tA = Math.min(Math.abs(dx) > 1e-6 ? A.hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? A.hh / Math.abs(dy) : Infinity);
        const tB = Math.min(Math.abs(dx) > 1e-6 ? B.hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? B.hh / Math.abs(dy) : Infinity);
        if (tA + tB >= 1) return; // les deux cadres se touchent : pas de place pour un trait
        const x1 = A.cx + dx * tA; const y1 = A.cy + dy * tA;
        const x2 = B.cx - dx * tB; const y2 = B.cy - dy * tB;
        const epaisseur = (1.5 + 6 * Math.sqrt(p.n / max)).toFixed(1);
        const titre = p.a.nom + ' ↔ ' + p.b.nom + ' : ' + p.n + ' liens (' + p.ab + ' de l\'un vers l\'autre, ' + p.ba + ' en sens inverse)';
        fond.append(svg('g', { class: 'vsn-trait-bloc', 'data-a': p.a.id, 'data-b': p.b.id },
          svg('title', null, titre),
          svg('line', { x1, y1, x2, y2, 'stroke-width': epaisseur })));
        const txt = String(p.n); const w = 10 + txt.length * 7;
        const longueur = Math.hypot(x2 - x1, y2 - y1) || 1;
        const decal = Math.min(16, longueur / 3);
        const ux = (x2 - x1) / longueur; const uy = (y2 - y1) / longueur;
        // le nombre est écrit à chaque bout, collé au cadre qu'il relie : un trait qui passe sous un autre cadre ne s'y rattache pas
        [[x1 + ux * decal, y1 + uy * decal], [x2 - ux * decal, y2 - uy * decal]].forEach(([mx, my]) => {
          dessus.append(svg('g', { class: 'vsn-etiquette-bloc', 'data-a': p.a.id, 'data-b': p.b.id },
            svg('title', null, titre),
            svg('rect', { x: mx - w / 2, y: my - 9, width: w, height: 18, rx: 9 }),
            svg('text', { x: mx, y: my + 4, 'text-anchor': 'middle' }, txt)));
        });
      });
    }

    /* ---------------- tracé / redimensionnement ---------------- */

    function tracer() { if (traceurCourant()) traceur(); }
    function traceurCourant() { return typeof traceur === 'function' && racineEl.isConnected; }

    let observateur = null;
    let largeurPrecedente = 0;
    if (typeof ResizeObserver === 'function') {
      observateur = new ResizeObserver(() => {
        const w = racineEl.getBoundingClientRect().width;
        const mode = w >= LARGEUR_COLONNES ? 'large' : 'etroit';
        const change = racineEl.getAttribute('data-largeur') !== mode;
        racineEl.setAttribute('data-largeur', mode);
        if (Math.abs(w - largeurPrecedente) > 1 || change) { largeurPrecedente = w; tracer(); }
      });
      observateur.observe(racineEl);
    } else {
      racineEl.setAttribute('data-largeur', racineEl.getBoundingClientRect().width >= LARGEUR_COLONNES ? 'large' : 'etroit');
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(tracer);

    rendre();
    return api;
  }

  return { mount, version: VERSION };
}));
