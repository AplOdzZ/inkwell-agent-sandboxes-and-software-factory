# Audit : `data_dir`, `protected_files`, `writes`, `always_writable`

Dépôt `disler/inkwell-agent-sandboxes-and-software-factory`, commit `92f1701`. Lecture seule : rien n'a été exécuté. Les comportements décrits sont déduits du code.
Convention : `chemin:ligne`. « Config par défaut » = `adws/adw_sssf_config/sssf.config.yaml`.

État : **étape 1 (pilote)**. Les questions 1, 2 et 5 sont traitées. Les questions 3, 4 et 6 seront complétées à l'étape 2.

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
- Aucune autre application n'existe :
  - `.claude/skills/sssf/apps/visualizer/server/db.ts:54-57` lit seulement `data_dir`, pour trouver la base.
  - `sandbox_mount/guest/provision.sh:152` utilise `data_dir` pour localiser la trace.

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

## 3, 4, 6

À compléter à l'étape 2 : il faut d'abord lire `adws/adw_*.py`, `sandbox_mount/`, le harvest et les extensions. Des notes préliminaires existent déjà : prompts relus à chaque phase (`agents.py:89`), extensions passées en `-e` à chaque lancement de Pi (`agent_pi.py:263-264`), `commit_all` = `git add -A` (`git_helper.py:49`).
