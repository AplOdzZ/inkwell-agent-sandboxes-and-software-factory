# Audit : `data_dir`, `protected_files`, `writes`, `always_writable`

Dépôt `disler/inkwell-agent-sandboxes-and-software-factory`, commit `92f1701`. Lecture seule : rien n'a été exécuté. Les comportements décrits sont déduits du code.
Convention : `chemin:ligne`. « Config par défaut » = `adws/adw_sssf_config/sssf.config.yaml`.

État : **étape 2 (complète)**. Les six questions sont traitées.

---

## 1. Où ces clés sont lues et appliquées

### Valeurs dans les configs

| Clé | Config par défaut | deepestseek | open-weights | top-speed | frontier |
|---|---|---|---|---|---|
| `defaults.protected_files` | `sssf.config.yaml:29-32` (`adws/adw_modules/`, `adws/adw_sssf_config/`, `adws/adw_*.py`) | `:38-41` | `:38-41` | `:38-41` | **absente**, donc valeur par défaut du schéma (`adws/adw_modules/data_types.py:335-337`, mêmes 3 chemins) |
| `defaults.data_dir` | `:33` (`adws/adw_data`) | `:42` | `:42` | `:42` | `:30` |
| `writes` du planner | `:50-51` (`specs/`) | `:58` | `:58` | `:58` | **absente** |
| `writes` du builder | absente (commentaire « unrestricted », `:70-71`) | absente | absente | absente | absente |
| `writes` du scout | `:89` (`[]`) | `:97` | `:99` | `:99` | **absente** |
| `writes` du reviewer | `:114` (`[]`) | `:120` | `:123` | `:123` | **absente** |
| `writes` du documenter | `:131-135` (`app_docs/`, `docs/`, `**/*.md`, `*.md`) | `:136` | `:140` | `:140` | **absente** |
| `always_writable` | n'est pas une clé de config : `permissions.py` la calcule à partir de `data_dir` (voir plus bas) | | | | |

Le modèle `.claude/skills/sssf/templates/sssf.config.yaml:25-33` reprend les mêmes valeurs (`:50`, `:89`, `:114`, `:131`).

### Schéma (valeurs par défaut)

- `adws/adw_modules/data_types.py:322` : `AgentConfig.writes` est optionnel et vaut `None` par défaut, ce qui veut dire « libre ».
- `adws/adw_modules/data_types.py:335-337` : valeur par défaut de `protected_files`.
- `adws/adw_modules/data_types.py:338` : `data_dir`.
- `ConfigDefaults` n'a pas de champ `writes` (`data_types.py:325-338`). Une clé `defaults.writes` serait donc ignorée par le schéma. Aucune config ne l'utilise.

### Lecture dans le code

- `adws/adw_modules/agents.py:33-41` charge le YAML. La ligne `:37` recopie `defaults.{coding_agent, model, thinking, color, tools, writes}` dans chaque agent qui n'a pas la clé.
- `adws/adw_modules/runner.py:54` construit `<data_dir>/sessions/<adw_id>`. Ce chemin est relatif au dossier courant du processus, pas à `repo_root`.
- `adws/adw_modules/session.py:40-41` passe `data_dir` et `observability.db` au traceur.
- `adws/adw_modules/permissions.py:139` : `always_writable` vaut `[data_dir]`.
- `adws/adw_modules/permissions.py:146` lit `agent.writes`.
- `adws/adw_modules/permissions.py:148` lit `protected_files`.
- `adws/adw_modules/agents.py:189-190` recopie `writes` et `protected_files` dans l'événement `permission_breach`.

### Application : le seul endroit qui annule ou arrête

- `adws/adw_modules/permissions.py:142-150`, fonction `permitted()`, teste dans cet ordre :
  1. Le chemin est sous `data_dir` (`always_writable`) : il est **autorisé** (`:144`).
  2. Le chemin correspond à `agent.writes` : il est autorisé (`:146`). Nommer un chemin dans `writes` débloque donc un chemin protégé.
  3. Le chemin est dans `protected_files` : il est refusé (`:148`).
  4. Sinon, la décision dépend de `agent.writes is None` : libre si `None`, refusé si `[]` (`:150`).
- `adws/adw_modules/permissions.py:220-256`, fonction `enforce()`, n'a qu'un appelant : `adws/adw_modules/agents.py:183`.
- Aucune autre application n'existe (vérifié par `git grep` sur tout le dépôt, étape 2) :
  - Le visualiseur **ne lit pas la config**. Il prend le chemin de la base dans `--db`, sinon `SSSF_DB`, sinon `adws/adw_data/sssf.db` en dur (`.claude/skills/sssf/apps/visualizer/server/db.ts:39-49`). Le dossier des sessions s'en déduit, et `data_dir` n'apparaît qu'en commentaire (`db.ts:54-57`).
  - `sandbox_mount/guest/provision.sh:152` lit `cfg.defaults.data_dir` pour créer la trace dans la VM.
  - `just/sandbox/lifecycle/teardown.just:108-113` code `adws/adw_data/sssf.db` en dur, sans lire `data_dir`.
  - Aucune recette `just` ne lit `protected_files`, `writes` ni `always_writable`.

### Mentions dans la documentation seulement

- `.claude/skills/sssf/SKILL.md:71`
- `.claude/skills/sssf/references/config.md:51-52`, `:72` et `:126-171`
- Les commentaires des YAML (`sssf.config.yaml:20-28` et `:70-71`)
- La docstring `permissions.py:27-30`
- `data_types.py:314-319` et `:332-334`

---

## 2. Un agent peut-il modifier ces fichiers sans être arrêté ?

### Le mécanisme

- **Ce qui est collecté.** `snapshot()` exécute `git diff HEAD --numstat` (`permissions.py:74`) et `git ls-files --others --exclude-standard` (`permissions.py:79`).
- **Quand c'est vérifié.** L'arbre est photographié avant le premier envoi (`agents.py:145`). `enforce()` s'exécute **une seule fois par phase agent**, après tous les envois, relances et portes, et avant d'accepter le résultat (`agents.py:179-197`). Rien n'est vérifié pendant que l'agent travaille. Les phases de code (`quality.py`, `git_helper.commit_all`) ne passent pas par `enforce()`.
- **En cas de violation.** Chaque chemin refusé est annulé par `_roll_back` (`permissions.py:191-217`), qui :
  - restaure le contenu d'origine (`:205`) ;
  - ou supprime le fichier s'il n'était pas suivi (`:209-212`) ;
  - ou lance `git checkout -- <chemin>` (`:215`).
- **Arrêt ou non.** Si **tout** a pu être annulé et qu'il y a au plus 3 chemins (`:249`), le passage **continue** avec une simple note (`:250-253`). Sinon, `PermissionBreach` est levée (`:255`). `agents.py:185-191` trace alors l'événement, et `runner.py:88-103` marque la phase en échec, puis l'ADW s'arrête.
- **Ce que l'agent peut faire.** Par défaut, il a les outils `read`, `bash`, `edit`, `write`, `grep`, `find` et `ls` (`sssf.config.yaml:12-19`). Tous les agents ont au moins `bash` et `write`, et `bash` passe outre `--tools` (docstring `permissions.py:6-12`). Le fichier `agent_cc.py` n'est qu'un squelette inopérant (`agent_cc.py:11-15`).

### Point central : `data_dir` est modifiable par **tous** les agents

`always_writable = [data_dir]` vaut `adws/adw_data/` (`permissions.py:139`), et ce test passe **en premier** (`permissions.py:144`). Les `protected_files` par défaut ne couvrent pas `adws/adw_data/`, car le motif `adws/adw_*.py` ne traverse pas les `/` (`permissions.py:92-114`). Or `adws/adw_data/` contient des fichiers suivis par git : les prompts (`prompt_engineering/<agent>/{system,user}.md`) et les extensions (`harness_engineering/{subagents,themeMap}.ts`).

| Cible | Réponse | Pourquoi |
|---|---|---|
| (a) Un prompt dans `adws/adw_data/prompt_engineering/` | **Oui**, pour tous les agents, y compris le scout et le reviewer (`writes: []`) | Le chemin est sous `data_dir`, donc `permitted()` renvoie vrai (`permissions.py:144`). La modification apparaît seulement dans l'événement `log/paths_touched` (`agents.py:192-195`), sans alerte. Ensuite `commit_all` la commite (`git add -A`, `git_helper.py:49`). |
| (b) Une extension dans `adws/adw_data/harness_engineering/` | **Oui**, pour tous les agents | Même raison. Le planner et le scout chargent `subagents.ts` (`sssf.config.yaml:48-49` et `:87-88`), et tous les agents ont `bash` et `write`. |
| (c) Un skill ou cookbook dans `.claude/` | **Selon l'agent** | Voir le détail ci-dessous. |
| (d) `AGENTS.md` | Absent du dépôt. S'il est créé : **oui** pour le builder et le documenter (`*.md`, `:135`), **non** pour les autres | Pour les autres agents, c'est un fichier non suivi : il est supprimé (`permissions.py:209-212`). Avec la config frontier : **oui** pour tous. |
| (e) Un dossier `.pi/` | Absent du dépôt et non ignoré par git (`git check-ignore -v .pi/x` ne renvoie rien). **Oui** pour le builder. Pour le documenter, **seulement** les fichiers `.md`. **Non** pour les autres | Les fichiers créés sont supprimés. Avec la config frontier : **oui** pour tous. |

Détail pour `.claude/` (c) :

- **Builder : oui.** Son `writes` vaut `None` et `.claude/` n'est pas protégé (`sssf.config.yaml:29-32`).
- **Documenter : oui pour les `.md`** (`**/*.md` et `*.md`, `sssf.config.yaml:134-135` ; la traduction du motif est à `permissions.py:102-111`). Non pour les `.py` et `.ts`.
- **Planner, scout, reviewer : non.** Le fichier est annulé. Le passage continue s'il y a au plus 3 chemins, sinon il s'arrête.
- **Config frontier : oui pour tous**, car aucune clé `writes` n'y figure.

**Écart propre à la config frontier.** `sssf.frontier.config.yaml` n'a ni `protected_files` ni `writes`.

- `adws/adw_modules/` reste protégé grâce à la valeur par défaut du schéma (`data_types.py:335-337`).
- En revanche, **plus aucun agent n'est en lecture seule** : le planner, le scout, le reviewer et le documenter deviennent libres (`permissions.py:150`).
- Cela contredit l'en-tête de ce profil, qui dit ne changer que le choix des modèles.

---

## 5. Ce que `permissions.py` ne voit pas

L'empreinte se limite à la sortie de deux commandes git (`permissions.py:74` et `:79`), lancées dans `run.repo_root`. Si une commande échoue, l'erreur passe sous silence : `_git` renvoie `""` quand le code de sortie n'est pas 0 (`permissions.py:60-62`).

1. **Fichiers ignorés par git.**
   - Ils n'apparaissent jamais : `--exclude-standard` les écarte, et `diff` ne couvre que les fichiers suivis (docstring `permissions.py:70-71`).
   - Sont concernés : `adws/adw_data/sessions/` (`.gitignore:149`), `sssf.db*` (`.gitignore:153`), `.env` (`.gitignore:112`), `.sandbox/`, `node_modules/`, `__pycache__/`, `*.log`, `tmp/`, `logs/`, `dist/` et `build/`.
   - Conséquence : un agent peut modifier `.env` ou falsifier la trace `sssf.db` sans être vu.
2. **Chemins hors du dépôt.** `~/.pi/agent/models.json` (lu par `agent_pi.py:110`), `~/.claude`, `/tmp` et `$HOME` restent tous accessibles par `bash` et `write`. Le contenu d'un dépôt imbriqué ou d'un sous-module n'est pas listé non plus.
3. **Modifications annulées ou commitées dans la phase.** Seul l'état net est comparé (docstring `permissions.py:18-21`). Si un agent modifie puis restaure, ou s'il fait lui-même `git commit`, `git stash`, `git reset` ou change de branche, rien n'est détecté. Après un commit, `diff HEAD` redevient vide.
4. **Empreinte réduite aux compteurs `numstat`** (`permissions.py:77-78`). Une nouvelle modification d'un fichier déjà modifié qui garde les mêmes nombres d'ajouts et de suppressions passe inaperçue. Les fichiers binaires (`-,-`) et les changements de mode ne sont pas vérifiés (confiance faible).
5. **Une seule vérification par phase** (`agents.py:183`). Les portes, dont `tests_pass` (`gates.py:98-108`), s'exécutent **avant** `enforce()` (`agents.py:152-177`). Elles évaluent donc un arbre qui contient encore des modifications interdites, pas encore annulées.
6. **Phases de code non contrôlées.** `quality.py` lance `bun test apps/inkwell/server.test.ts` (`quality.py:193`), mais ce fichier n'est pas protégé : `protected_files` ne couvre ni `apps/`, ni `justfile`, ni `just/`, ni `sandbox_mount/`, ni `.claude/`. Le builder peut donc modifier le test qui le juge.
7. **Sans dépôt git ou sans commit.** `git diff HEAD` échoue et renvoie `""` (`permissions.py:60-62`), ce qui rend le contrôle aveugle. Sans dépôt, `repo_root` vaut le dossier courant (`git_helper.py:38-40`).
8. **Noms de fichiers.** Git met entre guillemets les chemins non ASCII, et un renommage s'affiche `a => b` dans `numstat`. La correspondance avec les motifs (`permissions.py:118-119`) pourrait alors échouer. Hypothèse non testée (**confiance faible**).
9. **Limite de restauration.** Seuls les chemins déjà modifiés avant la phase et de 1 Mio au plus sont sauvegardés (`permissions.py:57` et `:171`). Au-delà, le fichier n'est pas récupérable (`:207-208`) et `PermissionBreach` est levée.

---

## 3. Quand une modification prend-elle effet, et où est-elle relue ?

### Ce qui est relu, et quand

| Élément | Relu quand | Preuve |
|---|---|---|
| Config YAML (`--config`) | **Une fois par passage**, au début de `main`. Elle n'est plus relue ensuite. Une modification vaut donc pour le **passage suivant** (et `adws/adw_sssf_config/` est protégé). | `adws/adw_modules/agents.py:34` ; appel par ex. `adws/adw_build.py:23` |
| Prompts `prompt_engineering/<agent>/{system,user}.md` | **À chaque phase agent** : `execute()` les rend au début de la phase (`Path.read_text()`). Pendant la phase, les textes sont figés : les relances et corrections de portes rejouent la même session. | `adws/adw_modules/agents.py:89-90` ; `adws/adw_modules/prompts.py:9` ; `agents.py:116`, `:173-176` |
| Extensions `harness_engineering/*.ts` | **À chaque lancement de Pi**, donc à chaque envoi, y compris les relances d'une même phase. Elles passent en `-e <chemin>`. Seuls le planner et le scout chargent `subagents.ts` ; `themeMap.ts` est chargé par lui. Pi relit-il bien le `.ts` à chaque démarrage ? C'est probable, mais non vérifiable dans le dépôt (confiance faible). | `adws/adw_modules/agent_pi.py:264` ; `adws/adw_modules/agents.py:127` ; `sssf.config.yaml:48-49`, `:87-88` ; `subagents.ts:25` |
| Skills `.claude/`, `AGENTS.md`, `.pi/` | **Aucun fichier du dépôt ne les charge.** Leur prise en compte éventuelle dépend de Pi ou de Claude Code, qui démarrent avec le dépôt comme dossier courant. Non vérifiable ici. | `agent_pi.py:280` (cwd = `repo_root`) ; `just/sandbox/run/mod.just:86` (`claude -p` dans `~/app`) |
| Sous-agents de `subagents.ts` | Un nouveau `pi` à chaque lancement, avec `--no-extensions`, sans `--system-prompt` et avec `--tools read,bash,grep,find,ls`. Ils ne relisent **ni** les prompts **ni** les extensions. Leur dossier courant est hérité du parent (`repo_root`), et ils reçoivent l'environnement du parent, clés comprises. | `adws/adw_data/harness_engineering/subagents.ts:229-241` |

### Au moment où la modification prend effet

- **Même phase :**
  - Prompts : **non**, car ils sont déjà rendus (`agents.py:89-90`).
  - Extensions : **possible** dès l'envoi suivant de la même phase (relance JSON ou correction de porte), car Pi est relancé (`agents.py:127`, `agent_pi.py:264`).
- **Phases suivantes du même passage :** **oui** pour toute phase agent qui suit, y compris celle d'un **autre** agent.
  - Exemple dans `adw_simple_sdlc.py` : un builder qui modifie `reviewer/system.md` pendant `build` change le prompt de `review_1` (ordre des phases : `adws/adw_simple_sdlc.py:78-171`).
  - Les extensions modifiées agissent sur le prochain planner ou scout.
- **Passage suivant :** **oui**, et de façon **durable**. Les flux qui commitent font `git add -A` (`adws/adw_modules/git_helper.py:49`), ce qui embarque les prompts et extensions modifiés, car ce sont des fichiers suivis. Les points de commit sont :
  - `adws/adw_plan_build.py:44` : sans condition ;
  - `adws/adw_plan_build_test.py:70-74` : si les tests passent ;
  - `adws/adw_simple_sdlc.py:87-89` : juste après le planner, avant tout test ;
  - `adws/adw_simple_sdlc.py:146-148` et `:169-171`.
- **Dans une VM (mode sandbox) :**
  - Tous les `execute` d'un même run partagent le même checkout `~/app` et la même branche `sbx/<run_id>`. Rien ne remet l'arbre à zéro entre deux passages (`just/sandbox/lifecycle/execute.just:91`). Un remplissage ultérieur garde les commits de la branche (`just/sandbox/lifecycle/fill.just:51-55`, `:75-78`).
  - Une modification survit donc à tous les passages suivants **de la même VM**.
  - Une **autre** VM reclone le dépôt public GitHub, codé en dur (`fill.just:20`, `:60`). Elle ne voit la modification que si elle a été récoltée, puis fusionnée et poussée par un humain.

## 4. Qu'est-ce qui la détecterait ou la ferait remonter à un humain ?

| Mécanisme | Voit-il une modification de prompt ou d'extension ? | Preuve |
|---|---|---|
| `permissions.enforce` | **Non**, car le chemin est autorisé d'office. Seuls les autres chemins interdits sont annulés. Au-delà de 3 chemins, ou si l'un n'est pas récupérable, `PermissionBreach` est levée. | `permissions.py:144`, `:248-255` |
| `PermissionBreach` | Elle est attrapée **seulement** pour tracer `error/permission_breach`, puis relancée. Aucun script `adw_*.py` ne l'attrape : le passage finit sur une trace Python avec le code de sortie 1. | `agents.py:185-191` ; `runner.py:88-103` |
| Événement `log/paths_touched` | **Oui**, la liste des chemins modifiés **et autorisés** y figure. Mais il n'est écrit que dans la trace, n'est jamais affiché dans la console, et le visualiseur ne le traite pas spécialement. | `agents.py:192-195` ; `.claude/skills/sssf/apps/visualizer/shared/types.ts:19-31` |
| Portes (`gates.py`) | **Non.** Elles vérifient que les artefacts annoncés existent et ne sont pas vides, et que le verdict est cohérent. `diff_matches_claims` vérifie seulement que les fichiers *déclarés* existent : un fichier modifié mais non déclaré passe. Les portes s'exécutent **avant** `enforce`. | `adws/adw_modules/gates.py:27`, `:36`, `:61-68`, `:71` ; `agents.py:152-177` |
| Commits (`commit_all`) | Le changement **entre dans le commit**, mais sans contrôle de contenu (`git add -A`). Le message est rédigé par l'agent. Il n'y a ni validation humaine ni push. | `git_helper.py:49-52` ; `adw_plan_build.py:43` |
| Bandeau de fin (`Run.finish`) | **Non.** Il affiche le statut, les phases, les jetons, le coût, l'identifiant et la base, mais ni les chemins touchés ni les commits. | `runner.py:114-142` ; `console.py:53-71` |
| Trace `sssf.db` / `events.jsonl` | Tous les appels d'outils y sont enregistrés avec leurs arguments : c'est **la seule piste fine**. Mais ces fichiers sont sous `data_dir` et ignorés par git : un agent peut les **modifier sans être détecté**. | `agents.py:258-262` ; `tracer.py:123-136` ; `.gitignore:149`, `:153` ; `permissions.py:144` |
| Visualiseur | Il affiche en rouge les appels d'outils et les événements `error` (donc `permission_breach`) et `gate_fail`, mais **aucun filtre ni alerte** sur les écritures dans `adws/adw_data/`. | `.claude/skills/sssf/apps/visualizer/src/lib/events.ts:14-15`, `:78-133` |
| Harvest (sandbox) | Il ramène **tous** les commits de `commit_sha..sbx/<id>`, sans filtre de chemin, dans `refs/sandbox/<id>`. Il n'y a **pas de fusion**. Le message donne seulement le nombre de commits et *suggère* `git log` / `git diff`. C'est le vrai point de revue humaine, mais il n'est pas guidé. Les fichiers non commités ou ignorés ne reviennent pas. | `just/sandbox/manage/harvest.just:71`, `:100`, `:103-106` |
| Teardown | Il copie `specs`, `app_docs`, `adws/adw_data/sssf.db` et `run.log` vers l'hôte, **pas** les prompts ni les extensions. Avec `--no-harvest`, ou si la VM a disparu, les commits sont perdus. | `just/sandbox/lifecycle/teardown.just:108-113`, `:129-139` |
| Run record | Il ne contient ni liste de commits, ni diff, ni sha de pointe. | `sandbox_mount/host/run_record.py:43-56` |

**Autre voie hors contrôle.** `just sbx run agent` lance `claude -p --dangerously-skip-permissions` dans le checkout de la VM (`just/sandbox/run/mod.just:86`). Cet agent ne passe pas du tout par `permissions.py`.

## 6. Pistes de correction (décrites seulement, rien n'a été modifié)

1. **Séparer les données d'exécution des actifs d'ingénierie.**
   - Le problème : `always_writable` est testé **avant** `protected_files` (`permissions.py:144` puis `:148`). Ajouter `adws/adw_data/prompt_engineering/` aux `protected_files` **ne suffirait donc pas**.
   - Option A : réduire `always_writable` aux sous-chemins réellement produits à l'exécution (`<data_dir>/sessions/`, `<data_dir>/sssf.db*`).
   - Option B : sortir les prompts et extensions de `data_dir`.
   - Option C : tester `protected_files` avant `always_writable`.
2. **Figer les actifs au démarrage du passage.**
   - Calculer l'empreinte (sha256) des prompts, extensions et configs dans `load_config`, et l'écrire dans la trace (`session_start`).
   - Avant chaque phase (`agents.py:89`) et avant chaque commit, refuser ou signaler toute empreinte modifiée.
3. **Renforcer la photo de l'arbre.**
   - Remplacer les compteurs `numstat` par des empreintes de contenu.
   - Enregistrer `git rev-parse HEAD` au début de la phase et faire le diff contre ce commit plutôt que contre `HEAD`, pour voir les commits, `stash` et `reset` faits par l'agent (`permissions.py:74-82`).
   - Exécuter `enforce` **avant** les portes (`agents.py:152-183`).
4. **Contrôler aussi les phases de code et les commits.**
   - Remplacer `git add -A` (`git_helper.py:49`) par l'ajout des seuls chemins autorisés ou déclarés.
   - Ou ajouter une vérification avant commit qui refuse `adws/adw_data/**` (hors données d'exécution), `.claude/**`, `AGENTS.md`, `.pi/**`, les tests et les recettes `just`.
5. **Rendre visibles les chemins sensibles.**
   - Afficher `paths_touched` dans le bandeau de fin (`runner.py:114-142`) et dans le visualiseur.
   - Dans le harvest, afficher automatiquement `git diff --stat <commit_sha>..refs/sandbox/<id> -- adws/adw_data .claude AGENTS.md .pi` (`harvest.just:103-106`).
   - Enregistrer le sha de pointe et la liste des chemins touchés dans le run record (`run_record.py:43-56`).
6. **Protéger la trace.** Écrire `sssf.db` et `events.jsonl` hors du dépôt, ou dans un emplacement non inscriptible par les agents. Ou bien les signer et chaîner leurs empreintes.
7. **Sous-agents.** Ne pas donner `bash` aux sous-agents dits « en lecture seule » (`subagents.ts:235`), et attendre leur fin avant `enforce`, car ils sont lancés sans attente (`subagents.ts:335-336`, `:460-461`).
8. **Corriger les incohérences de configuration.**
   - Le profil frontier n'a ni `protected_files` ni `writes`.
   - Le modèle `templates/adws/adw_modules/permissions.py` diffère de l'original : il n'a ni le seuil de 3 chemins ni la restauration des octets. Un dépôt installé n'a donc pas la même politique que ce dépôt.
   - Protéger `apps/inkwell/server.test.ts`, que le builder peut aujourd'hui modifier alors que ce test le juge (`quality.py:193`).
