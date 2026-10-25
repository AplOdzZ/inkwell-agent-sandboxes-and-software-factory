# Lecture des blocs E, G et H : prompts, visualiseur, outillage

Code lu : factory de disler, commit 92f1701 (fork AplOdzZ, branche `analyse/lecture`). Lecture seule. 59 fichiers, 59 notes (13 en niveau 3, 19 en niveau 2, 27 en niveau 1), 726 points avec preuve. Détail : `notes.json`, `sorts.json`, `registre.json`, `matrice_agents.md`, `verif/verification.json`. Les sorties brutes des lecteurs sont dans `parts/` (avant les corrections du contrôle, comme pour N3_lot1).

Fait le 25 octobre 2026 : cinq lecteurs, deux vérificateurs, sur sonnet / effort high. Les lecteurs ont ensuite corrigé eux-mêmes leurs fichiers d'après les verdicts, en relisant chaque preuve.

## À retenir

1. **Les prompts** (bloc E) sont la partie la plus saine. Les champs JSON que chacun des cinq prompts demande correspondent exactement aux types de `data_types.py`. Les exemples se valident tels quels, et seul `status` est obligatoire.
2. **Ce qui est faux dans les prompts, ce sont les promesses de contrôle.** « Cette écriture sera annulée » est fausse pour le builder, qui n'a pas de `writes`. « Lecture seule » et « documentation seulement » ne tiennent que par le YAML, et ils manquent entièrement dans `sssf.frontier.config.yaml`. « Ne jamais écraser un plan » n'est qu'une phrase.
3. **Dans le workflow par défaut des VM**, seuls le planner et le builder tournent. Le builder y est « contrôlé » par une porte qui ne vérifie rien : son prompt met `artifacts: []`, donc `artifacts_exist` passe à vide.
4. **Les docs de prompt** (`handoff.md`, `how_to_prompt_for_the_eng.md`) décrivent une circulation entre agents plus riche que le code. Le builder ne reprend pas la session du planner, il ne reçoit pas le plan, et un agent qui a échoué repart à froid. Quiconque écrit un prompt d'après elles écrit un prompt faux.
5. **Le visualiseur** (bloc G) est un petit serveur Bun qui lit `sssf.db` et une interface Vue. Il est bien fait côté SQL (aucune injection, connexion principale en lecture seule) et côté affichage (cinq `v-html`, tous échappés ; aucun réseau externe ; aucun stockage navigateur).
6. **Mais le serveur écoute sur toutes les interfaces, sans aucune authentification**, et sert la trace complète en clair : prompts, sorties de commandes, réflexion du modèle. Sa seule écriture (archiver une session) n'est pas protégée non plus.
7. **Pour récolter la trace**, la VM ne rapatrie que `sssf.db`. Si le visualiseur est ouvert, le journal WAL reste de côté et la copie peut être vide. C'est reproduit.
8. **L'outillage** (bloc H) ne fait pas ce que sa doc dit. `install.py` n'écrase rien sans `--force`, mais avec `--force` il écrase 15 fichiers adaptés sans sauvegarde. `make_adw.py` génère un ADW qui ne peut pas aller au bout. Les commandes d'installation font trois `curl | bash` non épinglés.
9. **Cause du n°23 corrigée** : `install.py` ne renomme pas `run_quality`. Il ne modifie le contenu d'aucun fichier (seule écriture : `shutil.copy2`, `install.py:47`). Le renommage est propre à Inkwell, dans `quality.py` et trois ADW, et il a oublié `adw_quality.py` et `adw_plan_build_test_quality.py`.
10. **Place dans la factory** : les prompts et les docs disent aux agents et aux ingénieurs ce qu'il faut faire, le visualiseur montre ce qui s'est passé, `just` et `install.py` lancent et posent le tout. Aucun de ces blocs ne contrôle quoi que ce soit lui-même : tout le contrôle est dans `agents.py`, `gates.py` et `permissions.py`, déjà lus.

## Correction d'un écart existant

- **n°23 (cause)** : `analysis/lecture/C2-C5_D/rapport.md:27` et `notes.json` (fiche de `quality.py`) écrivent que l'installation a renommé la fonction. C'est faux. Preuve : `install.py` en entier (aucun replace, rename ni sed ; `shutil.copy2` à la ligne 47). Les trois ADW diffèrent du modèle de 4 lignes seulement (`run_tests` devenu `run_inkwell_tests`), ce qui correspond aux « four call sites across three files » de `gotchas.md:108`. `quality.py` diffère de 85 lignes ajoutées et 79 retirées. Qui a fait la réécriture, un humain ou un agent, n'est pas établi ; le commit 8ed94eb cité par `gotchas.md` n'est pas dans le dépôt.
- Le constat reste vrai : le renommage a oublié `adw_quality.py:33` et `adw_plan_build_test_quality.py:58`, qui appellent encore `quality.run_quality`, absent du `quality.py` d'Inkwell (`quality.py:223` définit `run_inkwell_quality`). Ces deux ADW plantent après le builder. Ce n'est pas une ligne nouvelle du registre.

Écarts déjà connus confirmés avec preuve : n°1, 5, 7, 14, 21, 23, 24, 34, 37, 41, 44, 47, 52, 60, 69, 70, 72, 76, plus `sssf_overview.md`. Aucune de leurs lignes n'était fausse, sauf la cause de n°23 ci-dessus. Nuancés : n°46 (le cache de prompts est par agent, pas par phase), n°72 (la « commande enregistrée » est un libellé, pas la vraie ligne de commande : le contrôle promis est impossible tel quel), n°39 (étendu à `update_config.md:51`).

## Failles et bugs nouveaux

75 écarts nouveaux au registre : 9 failles, 20 bugs, 42 docs en retard, 4 périmés pour nous. Du plus grave au moins grave (la numérotation se fait à l'intégration). Les preuves sont dans `registre.json`, à la ligne dont le champ `ou` est cité.

**Failles**

1. **Visualiseur ouvert à tout le réseau de la VM, sans authentification** (`server/index.ts:113-115`, `:201`). `Bun.serve` n'a pas de `hostname`. Le port écoute sur 0.0.0.0 (observé), alors que le journal écrit « localhost » en dur. Le port est 4600. Aucun contrôle d'Host, d'Origin ni de jeton. Tout ce qui atteint le port lit la trace complète. Le seul rempart est une affirmation de la doc : « 4600 réservé au propriétaire ». Le code ne la contrôle pas (`observe.just:159-167`) : le test accepte un 200 anonyme.
2. **Route d'archivage sans protection** (`server/index.ts`, `db.ts:11-12`). Le POST fonctionne sans corps, ou en `text/plain` depuis une autre origine. C'est la seule écriture, sur une seconde connexion en lecture-écriture, alors que `package.json:6` parle de « lecture seule ». Il faut connaître l'`adw_id` (8 caractères hexadécimaux) : l'impact est borné, mais réel.
3. **Reviewer qui approuve à vide** (`reviewer/user.md:23`, `gates.py`). `verdict_consistent` accepte `approved=true` avec `findings=[]` et `blocking=[]`. La revue n'est un contrôle que si le modèle fait son travail.
4. **Documenter qui peut réécrire les consignes des autres agents** (`sssf.config.yaml:133-134`, `permissions.py:146-148`). `writes: ["**/*.md"]` passe avant `protected_files`. Il peut modifier `SKILL.md`, les cookbooks, `.claude/commands`, les modèles de prompts et les `.md` d'`adws/`. Le choix est assumé dans le YAML, mais il lève la protection.
5. **Enveloppes : champs inconnus jetés en silence** (`handoff.md:67,74`, `data_types.py:72-128`). Un champ oublié ou renommé ne déclenche pas la relance JSON, et `diff_matches_claims` valide une liste `changed_files` vide. `{"status":"success"}` seul est valide.
6. **« Ne jamais écraser » : seulement une phrase** (`planner/user.md:25`, `documenter/user.md:26`). `specs/` et `app_docs/` sont dans `writes`, `cp` écrase sans `-n`, et l'écrasement d'un fichier non commité ne laisse aucune trace (expérience). Même remède : un nom calculé par le code.
7. **Couleur d'agent non validée envoyée dans le CSS** (`SessionTrace.vue:466`, `:488`). Une couleur modifiée dans la base ou un YAML repris d'ailleurs peut faire contacter un hôte extérieur au navigateur de celui qui regarde. Pas d'exécution de script. Établi par lecture, à tester dans un navigateur.

8. **Exposition par exe.dev non contrôlée** (`observe.just:159-167`). Seul le port 4501 est partagé et public (`observe.just:130-131`) ; que 4600 reste réservé au propriétaire n'est qu'une affirmation de la doc. Si exe.dev change de comportement, ou si quelqu'un lance `share set-public` sur ce port, la trace complète est exposée sans qu'aucun contrôle du dépôt ne le dise.

(Le n°6 regroupe deux lignes du registre, planner et documenter : cela fait 9 failles en tout.)

**Bugs (les plus importants)**

1. **Récolte de la trace** (`teardown.just:109`) : seul `sssf.db` est copié. Avec le visualiseur ouvert, le journal WAL reste, et la copie donne « no such table » ou une base incomplète. Reproduit sur copie : 50 lignes sur 50 sans lecteur ; avec un lecteur ouvert, « no such table » sur une petite base, et 4 871 lignes sur 5 000 sur une plus grosse. À confirmer sur une vraie VM.
2. **Builder non contrôlé dans le workflow par défaut** (`adw_plan_build_test.py:49`, `:67`) : `artifacts_exist` sur une liste vide, donc rien n'est vérifié, même pas l'existence des fichiers annoncés.
3. **Reprise d'un agent après échec impossible** (`agents.py:168,191,203-204`) : `agent_map.json` n'est écrit qu'après un succès. Le cas où l'on veut le plus reprendre repart à froid. `handoff.md:157` promet le contraire.
4. **Trace du visualiseur incomplète ou fausse** : si une page d'événements échoue après la première, 1 000 événements disparaissent (reproduit, `SessionTrace.vue:55-62`) ; les portes et enveloppes restent périmées après une erreur réseau (`:62-70`) ; une commande qualité qui échoue n'est jamais rouge (`format.ts:74-83`) ; `usage` sous-compte les phases échouées car `agent_end` n'est écrit qu'en cas de réussite (`db.ts:335-360`).
5. **Sondage sans fin** : 500 ms en dur à quatre endroits (n°41 confirmé), 4 requêtes par seconde dans la vue trace, sans s'arrêter quand la session est terminée ou l'onglet caché. Aucun index dans la base : `EXPLAIN` montre des `SCAN` sur `events`, `phases`, enveloppes et portes à chaque rafraîchissement.
6. **Lenteur sur texte hostile** : le motif de coloration et celui des liens du rendu markdown sont quadratiques. Un guillemet ouvrant jamais fermé suivi de `\"` répété : 3,4 s à 80 000 caractères ; 0,99 s par un bloc json à 40 000. Les prompts sont rendus dès leur chargement (`PhaseDetail.vue:464`), donc l'onglet peut se figer à l'ouverture d'une phase.
7. **Générateur d'ADW** (`make_adw.py:25`, `:105-110`) : le squelette échoue à l'import avant la première phase (`rich` non déclaré, `run.succeeded` inexistant, `finish()` jamais appelé). `--name` mal formé écrit hors de `adws/`. `templates/justfile:82-89` : `just obs` plante sur une installation en portée utilisateur.
8. **`PORT` vide** : `server/index.ts:18` donne un port aléatoire. Rare : il faut que la variable soit vide dans l'environnement du processus bun lui-même.
9. **Les autres** (rendu markdown qui perd le texte de la ligne ouvrant un bloc de code, hash mal formé qui donne une page blanche, couleur vide qui gagne sur la palette, 876 001 graduations d'axe possibles pour 100 ans, lien symbolique suivi par `install.py`) sont au registre. Le service statique de `dist/` suit aussi les liens symboliques (deux fichiers hors dossier servis dans le test) : noté dans la note du serveur, pas au registre.

**Périmés pour nous**

- Les cinq `system.md` disent à l'agent « credentials already live », contraire à la décision 1.
- Trois `curl | bash` non épinglés dans `.claude/commands/install.md:42,46,47`, avec « Auto-install » (l.30). Ils contredisent « versions épinglées » et « rien d'installé sans relecture ». `bun install` est lancé sans `--frozen-lockfile` ni `--ignore-scripts` (`provision.sh:107`, `obs.just:73`).
- `just local cc` (`local.just:25-27`) lance `claude --dangerously-skip-permissions`, contraire à « jamais l'abonnement Claude pour ce qui tourne seul ».
- L'exemple de `how_to_prompt_for_the_eng.md` cite des chemins qui n'existent pas dans l'application (`src/server.ts`).

**Vigilance hors registre**

- **Secrets en argument de commande** : aucun dans `justfile`, `adws.just`, `obs.just`, `inkwell.just`, `local.just`. Mais dans `just/sandbox/**` (module `sbx`), `curl -H "Authorization: Bearer ..."` met la clé de provisioning (`create.just:134`, `teardown.just:89,151,185`, `reap.just:43,113,122`) et la clé d'exécution (`teardown.just:83` ; `setup.just:163-164,185-186,249` sur la VM) dans les arguments : visibles par `ps`. Le code fait ce qu'il dit, donc ce n'est pas un écart, mais c'est contraire à notre règle.
- **Dépendances du visualiseur** : toutes les plages sont en `^`. `bun.lock` verrouille 120 paquets avec empreinte sha512 (sans URL de téléchargement). Aucun `ignore-scripts`, aucun `trustedDependencies`. D'après `bun pm default-trusted` (bun 1.4.4), `esbuild` est le seul des 120 paquets dont le script d'installation peut tourner (non vérifié par une installation).
- **Chevrons** : les `user.md` citent `<context_handoff_dir>`, `<adw_id>` et `<slug>` dans la tâche et dans les JSON d'exemple. `prompts.py` ne remplace que les `{{...}}`. L'agent doit recopier la valeur de la section Variables. Un modèle faible qui recopie l'exemple tel quel perd un run.
- **Gabarits** : une demande qui contient `{{previous_envelope}}` ou `{{context_handoff_dir}}` est remplacée ensuite, car les remplacements se font en chaîne (expérience). Une demande peut aussi créer de fausses sections « ## Task » et « ## Report ». Un `{{prompt}}` dans l'enveloppe reste littéral, et un `{{inconnu}}` aussi.

## Ce qu'on garde pour notre système

- **Le contrat de sortie par agent** : un rapport JSON typé, un exemple dans le prompt qui se valide tel quel, un seul champ obligatoire (`status`). Les cinq contrats sont exacts et réutilisables.
- **La structure `system.md` / `user.md`** par agent, avec des sections Variables, Tâche, Rapport, et des règles courtes. Bonne base, à réécrire sans « credentials already live » ni promesses de contrôle.
- **Le client SQL du visualiseur** : 11 SELECT, 1 UPDATE, 5 PRAGMA, tous paramétrés par `?`. Connexion principale en lecture seule. Aucune colonne lue qui n'existe pas dans le schéma du traceur. À garder tel quel pour la partie lecture.
- **Le rendu des traces** : tous les `v-html` passent par `markdown.ts` ou `highlight.ts` qui échappent d'abord. 40 entrées piégées et 250 000 entrées aléatoires (puis 80 000 par le vérificateur) : aucune balise hors liste blanche. Pas de réseau externe, pas de stockage navigateur, pas de bouton copier ni d'export.
- **La séparation des rôles** : prompts séparés des ADW, `just` comme point d'entrée, `sssf.db` comme seul enregistrement. L'idée est bonne ; le contenu est à refaire.
- **Les recettes `just` sans secret en argument** de la racine et de `adws`, `obs`, `inkwell`, `local` (sauf `cc`).

## Questions pour Theo

Décisions déjà prises, non reposées : masquer les clés dans la trace, liste fixe de variables pour les agents, `writes` obligatoire pour chaque agent, aucun modèle par défaut, copie des prompts rangée par phase et rapatriée. Les questions restantes :

1. **Où tourne le visualiseur ?** Recommandation : sur l'hôte seulement, sur une copie rapatriée de la trace, à l'écoute de 127.0.0.1 uniquement. Raison : il lit la trace complète en clair et écoute aujourd'hui sur toutes les interfaces sans jeton ; la doc de disler dit que le proxy exe.dev exige 0.0.0.0 (`gotchas.md:66`, non vérifié), donc le garder dans la VM suppose un jeton sur toutes les routes. Sur l'hôte, il n'y a aucune installation `bun install` dans les VM.
2. **Comment rapatrier la trace ?** Recommandation : arrêter les écritures ou forcer un point de contrôle du WAL avant la copie (ou utiliser la sauvegarde en ligne de sqlite), et rapatrier aussi `adws/adw_data/sessions/`. Raison : copier le seul `sssf.db` peut donner un fichier vide, et sans `sessions/` les prompts affichent « no compiled prompts recorded » sans erreur.
3. **`install.py`, `make_adw.py`, `make_config.py` : les utilise-t-on ?** Recommandation : non, on écrit nos ADW et notre `justfile` à la main, relus, et on garde seulement l'idée du squelette. Raison : le squelette ne peut pas aller au bout, et `--force` écrase 15 fichiers sans sauvegarde.
4. **Comment installer bun, uv et just dans les VM ?** Recommandation : les préinstaller dans l'image, versions épinglées, avec empreinte, puis `--frozen-lockfile --ignore-scripts` pour tout paquet. Raison : les `curl | bash` actuels ne sont ni épinglés ni relus, et cela contredit nos règles.
5. **Le documenter et les noms de fichiers.** Recommandation : limiter le documenter à `app_docs/` et faire calculer les noms uniques (planner, documenter) par le code, jamais par le modèle. Raison : `**/*.md` ouvre les consignes des autres agents, et « ne jamais écraser » n'est qu'une phrase.
6. **Lancement sans surveillance.** Recommandation : interdire `claude --dangerously-skip-permissions` (`just local cc`, `sbx orch cc`) et ne pas activer les sous-agents du scout au départ. Raison : l'abonnement Claude est exclu pour ce qui tourne seul, et le flux des sous-agents n'est ni dans `raw_output.jsonl` ni dans la trace (n°21).

## Contrôle

- **Deux vérificateurs** (sonnet, effort high, rien écrit hors de leur fichier `verif/verifA.json` ou `verifB.json`) ont rouvert la preuve de chaque ligne candidate au registre, de chaque affirmation des notes de niveau 3 (par groupe de note × points / dépendances / vigilance), de 10 affirmations tirées au hasard dans les autres notes de leurs lots (graines 7 et 11, indices dans `verif/verification.json`), de chaque sort, et de 5 « Carte à corriger » chacun. Ils ont aussi cherché ce qui manquait.
- **Verdicts** : A, 138 éléments : 109 exacts, 28 à nuancer, 1 faux. B, 183 éléments : 142 exacts, 37 à nuancer, 4 faux. Total : 321 éléments, 251 exacts, 65 à nuancer, 5 faux. Les 10 tirages au hasard de A étaient tous exacts ; ceux de B, 9 exacts et 1 à nuancer.
- **Les 5 éléments faux avant correction (4 affirmations distinctes)** : la cause de n°23 (« l'installation a renommé », dans le rapport de C2-C5_D) ; « le rendu markdown n'est calculé qu'à l'ouverture de la section » (faux, dans deux notes, `PhaseDetail` et `DetailSection` : `PhaseDetail.vue:464` le calcule dès le chargement des prompts) ; « 19 types » dans `src/lib/types.ts` (22 en réalité) ; « oxlint seulement dans un commentaire » (faux : `quality.py:22,125,134` le lancent sur `apps/inkwell`).
- **Nuances typiques** : numéros de ligne décalés (`agents.py:197` et non `:206`, `--system-prompt` à `:116`), `agent_end` écrit même si le statut annoncé est un échec, « local » seulement dans un message de journal et pas dans la doc de `db.ts`, un bug de `PORT` dont le chemin d'impact « `set dotenv-load` » ne joint pas le visualiseur, `requests/<slug>.md` requalifié en `doc_en_retard` (`resolve_prompt` est voulu et documenté, `execute.just:23-26`), « 1 graduation par heure » pour une session figée au lieu d'un gel, « aucune injection possible » devenu « aucune trouvée ».
- **Ce qui manquait** : règle du `<slug>`, chevrons non remplacés, `{{AGENT}}` non protégé (`adws.just:33`), cas limites d'`install.py`, absence d'index SQL, motif quadratique de coloration, alias de types morts (`types.ts:231, 293, 296`), repli `fetch` hors `safely` (`index.ts:194-198`, noté mais sans écart au registre : on n'a pas montré qu'une exception y est possible). Tout a été ajouté, sauf ce qui est dit ci-dessus.
- **Un désaccord de chiffre** : un vérificateur a compté 205 lignes de différence pour `quality.py`, le lecteur 85 ajoutées et 79 retirées. Mesuré avec `git diff --no-index --numstat` : 85 et 79, le chiffre du lecteur est juste.
- **Preuves rouvertes par moi** : `install.py` sans renommage (`grep` sur `replace|rename|sed`, aucun résultat) ; `Bun.serve` sans `hostname` (`index.ts:113-115`) ; `teardown.just:109` ne copie que `sssf.db` ; cinq `v-html` seulement ; `claude --dangerously-skip-permissions` à `local.just:27` ; `parts/` dans `.gitignore:17`.
- **Expériences** (toutes hors dépôt, dans le scratchpad, sur des copies de la seule logique utile, rien du dépôt importé ni lancé, rien installé, pas de réseau) : remplacement des gabarits de `prompts.py` ; validation pydantic des cinq exemples ; tableau `permitted()` par agent ; requêtes SQL du visualiseur sur des bases SQLite fabriquées (Python et `bun:sqlite`, entrées `'`, `%`, `;`, NUL, 1 à 2 Mo) ; serveur de test sur 127.0.0.1 avec la logique recopiée (30 chemins de sortie par `..`, liens symboliques, adresse d'écoute) ; copie du WAL ; fuzz de `markdown.ts` et `highlight.ts` avec node 22 déjà présent ; motif `case` de `just kill` ; copie de la logique de `install.py` (pose vide, relance, `--force`, liens) ; génération et `py_compile` d'un squelette de `make_adw.py`. bun 1.4.4 et node 22 étaient déjà sur la machine.
- **Non établi**, car ces outils ne sont pas dans le dépôt ou pas lancés ici (100 entrées `a_verifier` dans les notes) :
  - Pi 1.3.0 : ce que fait `--system-prompt` (remplace ou complète), `--session-id` à la reprise, si Pi attend les sous-agents en mode `-p`, si son outil bash reçoit tout l'environnement, s'il charge seul des `.md` du dépôt.
  - exe.dev : si le port 4600 est joignable directement ou bloqué par le proxy, et si 4501 reste public.
  - bun : ce que fait `bun install` des scripts d'`esbuild` (non lancé), et la version de bun des VM, non épinglée.
  - Navigateur : le rendu des couleurs piégées, les minuteries d'un onglet caché, la lenteur sur un très gros run, le CSRF avec un vrai navigateur.
  - just, uv, zsh et sqlite3 ne sont pas installés ici : les recettes n'ont pas été lancées, et la version de pydantic que résout `uv run` n'est pas établie.
  - La récolte du cas « VM avec visualiseur ouvert » sur une vraie VM.

## Volume

7 subagents lancés (aucun autre). Les lecteurs des lots 1 à 4 puis 5 ont été repris une fois chacun (par message) pour appliquer les corrections. Les nombres de lignes sont estimés par chaque subagent (fichier lu plus preuves ouvertes ailleurs) ; les deux vérificateurs n'ont pas donné leur total de lignes, on indique leurs comptes d'éléments et le nombre d'outils appelés.

| Subagent | Modèle, effort | Lignes lues |
|---|---|---|
| Lecteur lot 1 · 10 prompts (niveau 3) | sonnet, high | ~2 200 (297 lignes de prompts + ~1 900 de preuves) |
| Lecteur lot 2 · 2 docs de prompt (niveau 2) | sonnet, high | ~3 170 (271 + ~2 900) |
| Lecteur lot 3 · serveur du visualiseur (3 et 2) | sonnet, high | ~2 580 (~1 480 + ~1 100) |
| Lecteur lot 4 · front du visualiseur (2 et 1) | sonnet, high | ~5 500 (3 973 lignes de `src/` et pages voisines + preuves) |
| Lecteur lot 5 · outillage (3, 2 et 1) | sonnet, high | ~2 700 (~1 400 + ~1 300) |
| Vérificateur A · lots 1, 2, 5 | sonnet, high | non communiqué (133 appels d'outils ; 138 éléments contrôlés) |
| Vérificateur B · lots 3, 4 | sonnet, high | non communiqué (105 appels d'outils ; 183 éléments contrôlés) |
