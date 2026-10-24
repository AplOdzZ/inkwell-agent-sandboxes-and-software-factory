# Voisinage — vue visuelle de la carte du dépôt (lecture seule)

Trois vues pour comprendre d'un coup d'œil un fichier, ses relations, et ce qu'une modification toucherait.
Elles lisent n'importe quel `carte.json` du même format : rien n'est écrit en dur sur un dépôt en particulier.
Les agents lisent le JSON ; ce dossier est pour les humains.

| Fichier | Rôle |
|---|---|
| `voisinage.js` | le module (JavaScript natif, sans dépendance ni build) |
| `voisinage.css` | les styles (couleurs uniquement par variables CSS) |
| `demo.html` | page d'essai : charge `../carte.json` et `suivi.exemple.json`, trois onglets |
| `suivi.exemple.json` | exemple du second fichier de données |
| `verifier_carte.py` | contrôle de fraîcheur de la carte (Python standard) |
| `captures/` | captures d'écran des trois vues, clair et sombre, large et 360 px |

## Essayer la démo

```
python3 -m http.server 8000 --directory analysis
# puis ouvrir http://localhost:8000/vue/demo.html
```

Il faut un serveur : `fetch` ne marche pas depuis `file://`.

## Intégrer le module dans une page

```html
<link rel="stylesheet" href="voisinage.css">
<div id="vue"></div>
<script src="voisinage.js"></script>
<script>
  Promise.all([fetch('carte.json').then(r => r.json()),
               fetch('suivi.json').then(r => r.json()).catch(() => null)])
    .then(([carte, suivi]) => {
      const vue = Voisinage.mount(document.getElementById('vue'), {
        carte, suivi,
        onSelect: (chemin) => { /* afficher la note du fichier, etc. */ }
      });
      vue.show('chemin/du/fichier');
    });
</script>
```

La page hôte doit définir ces variables CSS (la démo les définit en clair et en sombre avec `prefers-color-scheme`) :
`--bg --panel --ink --muted --line --accent --accent-soft --cred --cred-soft --done --done-soft --del --del-soft --font-display --font-body --font-mono`.
Les couleurs des familles de liens (`--lien-code`, `--lien-donnees`, `--lien-config`, `--lien-copie`, `--lien-doc`, `--lien-autre`) sont définies, en clair et en sombre, dans `voisinage.css` ; la page hôte peut les redéfinir.

Le module est aussi chargeable en CommonJS (`require`) pour des tests ; il a besoin d'un DOM.

### API

```js
const vue = Voisinage.mount(element, { carte, suivi, onSelect, onVue, lecteur, textes });
```

| Option | Rôle |
|---|---|
| `carte` | l'objet de `carte.json` (obligatoire) |
| `suivi` | l'objet de `suivi.json` (facultatif ; sans lui, la carte seule suffit) |
| `onSelect(chemin)` | appelé quand la personne choisit un fichier (clic ou Entrée sur un voisin, un fichier touché, un fichier d'un bloc, une suggestion). Pas appelé par `show()` / `impact()` / `ensemble()` |
| `onVue(nom, chemin)` | facultatif : appelé à chaque changement de vue (`'show'`, `'impact'`, `'ensemble'`), pour synchroniser des onglets |
| `lecteur` | prénom du badge « relu par … » (défaut : `Theo`) |
| `textes` | surcharge des libellés (voir `TEXTES` en tête de `voisinage.js`) |

Méthodes de l'objet retourné :

- `vue.show(chemin)` : vue 1, le voisinage du fichier. Sans argument : le fichier courant (ou un écran d'accueil).
- `vue.impact(chemin)` : vue 2, l'impact d'une modification. Même règle.
- `vue.ensemble()` : vue 3, les blocs.
- `vue.courant()` : `{ vue, chemin }`.
- `vue.destroy()` : retire la vue et ses observateurs.

Le champ de recherche (avec suggestions, flèches + Entrée) fait partie du module et sert aux trois vues.

### Ce que fait chaque vue

1. **Voisinage** : fichier au centre, entrants à gauche, sortants à droite, regroupés par type de lien (12 par côté, puis « + N autres »). Les liens `decrit` sont cachés par défaut (bouton avec leur nombre). Dessous : la liste complète des liens (sens, type, autre fichier, preuve, confiance), filtrable par famille, puis la fiche machine repliable.
2. **Impact** : on remonte les liens à l'envers sur 3 niveaux, chaque fichier compté une fois, au niveau le plus proche. `decrit` exclu par défaut. Bilan en haut (fichiers par niveau, leviers, « zones à vérifier » = fichiers touchés ayant `contradictions` ou `secrets`). Au-delà de 12 fichiers dans un niveau : regroupement par dossier, dépliable.
3. **Blocs** : un cadre par bloc, replié au départ ; traits entre blocs dont l'épaisseur suit le nombre de liens hors `decrit` ; un clic déplie le bloc sur place (plusieurs à la fois).

Couleurs : une famille de liens = une couleur, mais le type est toujours écrit. Pointillé = la cible n'est pas un fichier de la carte (motif, hors dépôt, créé à l'exécution, ou dossier/fichier absent de la carte). Losange = fichier levier.

## Format de `carte.json`

```json
{
  "meta": {"depot": "...", "commit": "...", "genere_le": "...", "fichiers_exclus": ["images/", "*.png"]},
  "fichiers": [{
    "chemin": "src/a.py", "type": "code", "langage": "python", "lignes": 120, "role": "…",
    "levier": {"valeur": true, "pourquoi": "…"},
    "fonctions_cles": [{"nom": "f", "lignes": "10-20", "ce_quelle_fait": "…"}],
    "lit": [{"quoi": "…", "ligne": 3}], "ecrit": [{"quoi": "…", "ligne": 4}],
    "lance": [{"commande": "…", "ligne": 5}], "reseau": [{"hote": "…", "ligne": 6}],
    "variables_env": [{"nom": "…", "ligne": 7, "lue_ou_ecrite": "…"}],
    "secrets": "texte ou null", "contradictions": [{"doc": "f:1", "code": "g:2", "resume": "…"}]
  }],
  "liens": [{
    "de": "src/a.py", "vers": "src/b.py", "type": "importe", "preuve": "src/a.py:34", "confiance": "haute",
    "note": "…", "motif": true, "hors_depot": true, "produit_a_l_execution": true, "indirect": true
  }]
}
```

Obligatoires : `fichiers[].chemin` et `liens[].de / vers / type`. Tout le reste est facultatif et affiché s'il existe. Types de liens connus : `importe appelle lance charge_extension rend_prompt` (code), `lit ecrit` (données), `configure`, `copie`, `decrit` ; un autre type est affiché dans une famille « Autre ». `vers` peut désigner autre chose qu'un fichier de la carte (motif, dossier, hors dépôt) : il est alors affiché en pointillé et n'est pas cliquable. `preuve` se termine par `:ligne` (ou `:ligne-ligne`).

## Format de `suivi.json` (lu, jamais écrit)

```json
{
  "blocs": {"A": "Vue d'ensemble", "B": "Configuration"},
  "files": [{"p": "README.md", "b": "A"}],
  "notes": {"README.md": {"status": "fait", "role": "..."}},
  "fates": [{"p": "images", "fate": "supprimer", "reason": "..."}]
}
```

- `files[].b` range un fichier dans un bloc de `blocs` ; sans entrée, le bloc est le dossier de premier niveau (les fichiers à la racine vont dans « Racine du dépôt »).
- `notes[chemin]` : `status` = `fait` (badge « relu par … ») ou `apercu` (badge « aperçu »). Le contenu des notes n'est pas affiché : c'est à la page hôte de le faire (via `onSelect`).
- `fates[].fate` = `supprimer`, `adapter` ou `garder` (badges « à supprimer / à adapter / à garder »). `p` peut être un dossier : il s'applique à tout ce qu'il contient ; l'entrée la plus précise l'emporte.

## Le script de fraîcheur

```
python3 analysis/vue/verifier_carte.py <carte.json> <racine du dépôt> [--ignorer PREFIXE] [--tout]
```

Python standard seulement (et `git ls-files` s'il est disponible). Ne modifie rien.

Pour chaque lien : le fichier `de` existe-t-il, la ligne de preuve existe-t-elle, nomme-t-elle encore la cible (nom, nom sans extension, chemin ; pour un motif, son plus long morceau littéral) ? Pour chaque fiche : le fichier existe-t-il, son nombre de lignes a-t-il changé ? Enfin, les fichiers suivis par git (hors `meta.fichiers_exclus`) qui n'ont pas de fiche.

Un lien est classé :

- **à jour** : la ligne de preuve nomme la cible ;
- **à confirmer à la main** : la ligne existe mais ne nomme pas la cible en toutes lettres (appel de fonction, commande, copie, lien indirect ou motif, instruction sur plusieurs lignes, nom trouvé à moins de 15 lignes) ; jamais une erreur, sauf si le fichier source a changé de taille depuis la carte ;
- **à revoir** : fichier source disparu, ligne absente, ou lien « nommé » (importe, decrit) dont la cible n'apparaît pas près de la preuve.

Sortie : résumé chiffré, puis la liste à revoir triée par fichier (`--tout` détaille aussi les liens à confirmer). Code de sortie `0` si rien n'est à revoir, `1` sinon (les liens « à confirmer » ne comptent pas). `--ignorer` écarte des préfixes de la liste « sans fiche » (par exemple le dossier où vit la carte elle-même).

## Limites connues

- **Un lien absent de la carte n'existe pas pour la vue.** L'impact est calculé d'après `carte.json` seulement : il ne remplace ni une recherche dans le code, ni les tests.
- **Les motifs ne sont pas résolus.** Un lien vers `dossier/*.yaml` est affiché en pointillé, mais ne compte pas comme un lien vers chacun des fichiers qui correspondent : l'impact d'un fichier peut donc être sous-estimé quand des liens passent par un motif. Même chose pour les dossiers.
- **Les fichiers dont la fiche n'est pas détaillée** (sans `levier`, `lit`, etc.) n'ont ni losange ni zone à vérifier : ce n'est pas la preuve qu'ils n'ont rien à signaler.
- **Vue 1** : les traits ne se dessinent qu'à partir de 720 px de large ; en dessous, les colonnes passent l'une sous l'autre sans traits (le type et la preuve restent écrits sur chaque voisin). Les traits ne sont pas atteignables au clavier : le focus d'un voisin affiche la même infobulle (type, preuve, confiance, note) et met son trait en évidence. L'infobulle n'apparaît pas au toucher ; la liste sous le schéma donne les mêmes informations.
- **Vue 3** : les traits entre blocs sont droits, de bord à bord, et passent *sous* les cadres qu'ils croisent ; le nombre est écrit aux deux bouts, collé au cadre relié. Avec beaucoup de blocs, survoler ou focaliser un bloc met ses traits en évidence ; la liste de puces dans chaque bloc donne les mêmes nombres sans ambiguïté. Un bloc déplié occupe deux colonnes en écran large.
- Le calcul de l'impact ne compte que les liens dont `de` est un fichier de la carte.
- Pas de gestion du clavier fine dans l'arbre des blocs (ni flèches, ni raccourcis) : Tab et Entrée/Espace seulement.
- Testé avec Chromium (Playwright) ; non testé sur Safari/Firefox.
