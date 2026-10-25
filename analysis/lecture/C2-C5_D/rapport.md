# Lecture des blocs C2 à C5 et D (niveaux 1 et 2)

Code lu : factory de disler, commit 92f1701 (`adws/` est identique au commit de travail). Fichiers : `gates.py`, `git_helper.py`, `quality.py`, `changes.py` (C2, niveau 2) ; `runner.py`, `session.py`, `tracer.py` (C3, niveau 2) ; les 12 `adw_*.py` (D, niveau 2) ; `agent_cc.py` (niveau 1). Détail et preuves : `notes.json`, `sorts.json`, `registre.json`.

## À retenir

1. Les workflows (`adw_*.py`) sont de courts scripts qui enchaînent des phases : planner, builder, tests, revue, documentation. Chacun appelle des agents, puis des « portes » qui vérifient ce que l'agent a annoncé.
2. `runner.py` fait tourner les phases et note le résultat de chacune. Une phase est réussie dès que son bloc finit sans erreur ; c'est l'appel à l'agent qui lève l'erreur si une porte échoue. Le premier échec arrête tout le workflow.
3. `session.py` et `tracer.py` écrivent la trace dans `sssf.db` et `events.jsonl`. Tout y est en clair (arguments d'outils, sorties de commandes, ligne de commande lancée), sans masquage de secret.
4. `gates.py`, `quality.py` et `changes.py` vérifient et résument le travail : fichiers annoncés, commandes qualité (lint, types, build), liste des fichiers modifiés. `git_helper.py` fait les commits.
5. Par défaut, nos VM lancent `adw_plan_build_test` (pas de revue, pas de documentation, un seul commit). Le workflow le plus strict est `adw_simple_sdlc`, mais il faut le demander.
6. Dans la plupart des workflows, plan, build et revue n'ont aucune nouvelle tentative : un seul écart de porte coûte un run complet, contrairement à ce que dit le README.
7. Un run rouge ne laisse aucun commit de code : le travail reste dans l'arbre de la VM. La récolte de ce cas n'a pas été lue.
8. `agent_cc.py` est un stub mort, sans effet pour nous. Verdict : on garde l'ossature, on adapte les portes, la trace et le lancement par défaut.

## Failles et bugs

Du plus grave au moins grave. Preuves dans `registre.json`.

1. **Faille : `just kill` ne vérifie pas la commande enregistrée** (`just/obs.just:56`, `:63`). La doc promet le contraire. Le test laisse passer tout processus dont la commande contient `pi`, `adw_` ou `python` (par exemple `ping`). Risque faible sur une VM jetable.
2. **Bug : arrêt par signal sans arrêter l'agent** (`session.py:30-32`, `tracer.py:165`, `agent_pi.py:278`). Après un `kill` simple de l'ADW, la trace dit « rien de vivant » alors que Pi peut tourner encore. Seule la structure du code est établie, pas l'orphelin lui-même.
3. **Bug : un délai dépassé fait planter l'ADW** (`quality.py:73-76` et `:116`). `TimeoutExpired` rend des bytes même avec `text=True`, et le code y ajoute du texte. Reproduit avec Python 3.13.17.
4. **Doc en retard : retries** (`README.md:142`, `agents.py:6`). « Jamais un redémarrage » est faux pour les phases sans `retries`.
5. **Doc en retard : liste des ADW** (`sssf_overview.md:17-21`) sans `adw_quality` ni `adw_plan_build_test_quality`.
6. **Doc en retard : type des portes** (`data_types.py:294`) : le commentaire dit `list[str]`, les portes rendent un `GateReport`.

Non mis au registre, car c'est un choix de conception : si le builder ne change aucun fichier, `commit_all` refuse (« nothing to commit », `git_helper.py:50-51`) et le run échoue après des tests verts. Les écarts déjà connus (n°16, 23, 25, 28, 31, 32, 36 et le pilote C1) sont confirmés dans les notes. Cause de n°23 : le modèle livré (`templates/.../quality.py:214`) a `run_quality`, l'installation l'a renommé mais seuls 3 ADW ont suivi.

## Questions pour Theo

1. **Workflow par défaut des VM.** Garde-t-on `adw_plan_build_test` (rapide, sans revue) ? Je recommande `adw_simple_sdlc`, plus strict, une fois ses boucles corrigées.
2. **Nouvelles tentatives.** Donne-t-on `retries=1` au plan, au build et à la revue ? Je recommande oui : cela coûte un peu de crédit mais évite de perdre un run pour un seul écart.
3. **Trace et secrets.** Ajoute-t-on un masquage des clés (`sk-or-...`) avant écriture, ou exclut-on la trace de la récolte ? Je recommande le masquage, simple et peu coûteux.
4. **Arrêt d'un run.** Exige-t-on que l'arrêt tue aussi Pi (et que `just kill` vérifie la vraie commande) ? Je recommande oui, car un agent orphelin consomme des crédits.
5. **Run rouge.** Veut-on récupérer le travail non committé d'un run en échec (par exemple un commit « wip ») ? Je recommande oui, après avoir lu la récolte.

## Contrôle

- Le vérificateur (sonnet, high, sans rien avoir écrit) a rouvert les preuves des **8 candidats**. **10 erreurs avant correction**, sur 6 candidats :
  - quality (2) : la condition du plantage était trop étroite (aussi avec stdout seul) et « sans événement de trace » était faux ; corrigé.
  - `just kill` (2) : mauvaise ligne de `tracer.py` et « presque n'importe quel processus » exagéré ; corrigé.
  - Signaux (1) : « aucune occurrence kill » faux ; reformulé en « aucun appel ».
  - Retries (1) : le scout était cité à tort dans une liste ; corrigé.
  - Liste des ADW (1) : « plantent de toute façon » non étayé ; retiré.
  - `agent_cc.py` (1) : la docstring n'est pas en retard sur le code ; candidat retiré du registre (le stub reste en `verifier`).
  - Commit vide (2) : mauvais numéros de ligne et « sans raison » faux ; retiré du registre, signalé ci-dessus.
- **Non établi** : si Pi survit à un `kill` simple ; ce que la récolte fait d'un run rouge et de `adw_data` ; la base `main` dans une VM clonée ; le blocage réel des écritures du scout (dépend de `permissions.py`, niveau 3) ; si les ADW lancés hors de la racine écrivent leurs traces ailleurs (chemins relatifs) ; l'identité git (`user.name`) dont `commit_all` dépend.
- Rien exécuté ni installé, hors un petit script de test de `TimeoutExpired` à part.

## Volume

6 subagents. Lignes estimées par chacun (fichier lu plus preuves ailleurs).

| Subagent | Modèle, effort | Lignes lues |
|---|---|---|
| Lot 1 · Validation (4 fichiers) | sonnet, high | ~730 |
| Lot 2 · Session et trace (3 fichiers) | sonnet, high | ~610 |
| Lot 3 · 12 workflows | sonnet, high | ~1 300 |
| Lot 4 · Stub `agent_cc.py` | sonnet, medium | ~45 |
| Vérificateur | sonnet, high | ~650 |
