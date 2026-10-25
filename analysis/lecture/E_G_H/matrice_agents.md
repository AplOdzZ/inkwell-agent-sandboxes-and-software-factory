# Matrice des agents (lot 1, prompts du bloc E)

Cinq agents sont définis dans les cinq YAML de `adws/adw_sssf_config/` : planner, builder, scout, reviewer, documenter. Il n'y en a pas d'autre (vérifié par lecture des 5 fichiers). « Tester », « quality » et « git » sont des phases de code, pas des agents (sssf.config.yaml:103-104). Valeurs lues dans `sssf.config.yaml` ; les écarts des quatre autres YAML sont dans le second tableau. Les lignes d'ADW sont celles de `adws/adw_*.py`. « retries » = nombre de nouvelles tentatives de la phase après un écart de porte (0 : le premier écart arrête le run, agents.py:167-169).

Les `user.md` déclarent `{{context_handoff_dir}}` (remplacé par le code) mais citent ensuite `<context_handoff_dir>`, `<adw_id>` et `<slug>` entre chevrons dans la tâche et dans les JSON d'exemple : ces chevrons ne sont jamais remplacés (prompts.py:10-11) ; l'agent doit recopier la valeur de la section Variables.

Défaut des VM : `just sdlc` lance `adw_plan_build_test.py` (just/adws.just:68-69 ; execute.just:48). Seuls le planner et le builder y tournent. Le reviewer et le documenter ne tournent que dans `adw_simple_sdlc` (et `adw_build_review` / `adw_document`), le scout seulement dans `adw_scout`.

| Agent | Outils (`tools`) | `writes` | Extensions (`harness_engineering`) | Types de sortie selon l'ADW (ADW:ligne) | Portes appliquées (par ADW) | Promesses du prompt (fichier:ligne) | Écart entre promesse et code |
|---|---|---|---|---|---|---|---|
| **planner** | read, grep, find, ls, bash, write, subagent_create, subagent_continue, subagent_list, subagent_remove (sssf.config.yaml:52-62). Pas d'`edit`, mais `bash` et `write` suffisent pour tout modifier. | `[specs/]` (sssf.config.yaml:50-51). Seulement dans ce YAML et deepestseek, open-weights, top-speed. **Frontier : aucun `writes`** = libre (sssf.frontier.config.yaml:37-58). | `adws/adw_data/harness_engineering/subagents.ts` (sssf.config.yaml:48-49), chargé par `-e` (agent_pi.py:263-264). | `PlanOutput` : adw_plan.py:33, adw_plan_build.py:33, adw_plan_build_test.py:43, adw_plan_build_test_quality.py:40, adw_simple_sdlc.py:84. `GenericOutput` : adw_prompt.py:32 (`--agent planner`). | `artifacts_exist` + `files_non_empty` dans les 5 ADW (adw_plan.py:34, adw_plan_build.py:34, adw_plan_build_test.py:44, adw_plan_build_test_quality.py:41, adw_simple_sdlc.py:85), **retries 0** (phase `plan` sans `retries`). Aucune porte dans adw_prompt.py. | planner/system.md:16 « Do not implement anything » ; :11 et planner/user.md:25 « never overwrite an existing spec » ; planner/user.md:39 `artifacts` = les deux chemins réellement écrits ; :45 « Gates open these files » ; :40 `commit_message` « for committing THIS PLAN DOCUMENT » ; system.md:22 « Wait for every [subagent] » ; system.md:13 « credentials are already live » ; system.md:15 « scratch… will be undone ». | « Do not implement » tenu par `writes` sauf en frontier. « Never overwrite » : aucune garde (`specs/` permis, `cp` sans `-n`, écrasement d'un fichier non suivi invisible). `commit_message` utilisé seulement par adw_simple_sdlc.py:89. Attente des sous-agents non contrôlée (subagents.ts:335-341). `<context_handoff_dir>` entre chevrons non remplacé (system.md:10). Faute de chemin dans `artifacts` = run arrêté sans nouvelle tentative. Scratch : annulé seulement si la phase réussit, ≤3 chemins, pas les fichiers ignorés. |
| **builder** | read, grep, find, ls, bash, edit, write (sssf.config.yaml:72-79). | **Absent** = libre, sauf `protected_files` `adws/adw_modules/`, `adws/adw_sssf_config/`, `adws/adw_*.py` (sssf.config.yaml:29-32, :70-71). `adws/adw_data/` (prompts compris) et `.claude/` restent écrivables. Identique dans les 5 YAML. | Aucune (`[]` par défaut, agents.py:40). | `BuildOutput` : adw_build.py:33, adw_build_review.py:44 et :63, adw_build_test.py:48 et :65, adw_plan_build.py:38, adw_plan_build_test.py:48 et :65, adw_plan_build_test_quality.py:45 et :76, adw_simple_sdlc.py:93, :110, :127. `GenericOutput` : adw_prompt.py:32 (agent par défaut `builder`, adw_prompt.py:20 et :40). | `diff_matches_claims` : adw_build.py:34 (retries 1), adw_build_review.py:45 (0) et :64 (1), adw_build_test.py:49 (0) et :67 (1), adw_plan_build.py:39 (0), adw_plan_build_test_quality.py:46 (0) et :78 (1), adw_simple_sdlc.py:94 (0), :112 (1), :128 (1). **`artifacts_exist` seul** : adw_plan_build_test.py:49 et :67 (le défaut des VM). Aucune : adw_prompt.py:32. | builder/system.md:5 « report every file you changed » ; :9 suivre `previous_envelope` ; :13 juger par code de sortie ; :14 « `bun test > out.txt`… will be undone » ; :12 « credentials are already live » ; builder/user.md:23 « ONLY valid JSON » ; :31 `commit_message` « is what the commit of your work will say ». | **:14 faux** (n°60 : builder libre, rien n'est annulé ; fichiers ignorés jamais vus). `changed_files` : porte d'existence seulement (n°28), **vide** dans l'ADW par défaut (`artifacts` vide). `commit_message` fait le commit dans 4 ADW seulement ; c'est celui du dernier `fix_i`. Pas de consigne pour `fail`. Texte libre du planner/reviewer/tests collé dans son prompt (« your spec »). |
| **scout** | read, grep, find, ls, bash, write, subagent_create, subagent_continue, subagent_list, subagent_remove (sssf.config.yaml:91-101). | `[]` (sssf.config.yaml:89-90) ; deepestseek, open-weights, top-speed idem. **Frontier : aucun `writes`** (sssf.frontier.config.yaml:76-100). `adws/adw_data/` toujours écrivable (c'est là qu'il met `scout_findings.md`). | `subagents.ts` (sssf.config.yaml:87-88). | `ScoutOutput` : adw_scout.py:33. `GenericOutput` : adw_prompt.py:32 (`just ask scout`, just/adws.just:32-34). | `artifacts_exist` seul : adw_scout.py:34, **retries 0**. Aucune pour adw_prompt.py. | scout/system.md:9 « Read-only… never write to the codebase » ; :10 « Cite exact file paths » ; :14 « findings… for agents that follow » ; :19 « hold [subagents] to read-only work » ; :21 « Wait for every one » ; :11 « credentials are already live » ; :13 « scratch… will be undone ». | « Read-only » : `writes: []` mais contrôle tardif (seulement si phase réussie, ≤3, fichiers ignorés invisibles) ; bash + write donnés ; frontier sans `writes`. Sous-agents : bash, environnement complet, fire-and-forget (subagents.ts:235, :240, :335-341) : « lecture seule » non tenu (n°21). Chemins cités jamais vérifiés. « Agents that follow » : aucun ADW n'en place. |
| **reviewer** | read, grep, find, ls, bash, write (sssf.config.yaml:116-122). Pas d'`edit` ; `write` et `bash` suffisent. | `[]` (sssf.config.yaml:114-115) ; deepestseek, open-weights, top-speed idem. **Frontier : aucun `writes`** (bloc l.101-116). | Aucune. | `ReviewOutput` : adw_build_review.py:51, adw_simple_sdlc.py:119. `GenericOutput` : adw_prompt.py:32. | `artifacts_exist` + `verdict_consistent` : adw_build_review.py:53-54 et adw_simple_sdlc.py:120, **retries 0**. Aucune pour adw_prompt.py. | reviewer/system.md:10 « never the builder's summary » ; :13 « Change nothing » et « only repair path » ; :14 « approved… ONLY when every requirement is met » ; reviewer/user.md:23 « one findings entry each » ; :24 écrire `review.md` ; :44 status/approved ; system.md:15 « credentials… live » ; :17 « scratch… will be undone ». | « Change nothing » : writes `[]` sauf frontier ; annulation tardive ; `adws/adw_data/` réécrivable (le reviewer peut changer le prompt du builder). `verdict_consistent` accepte `approved=true` avec zéro exigence et sans `review.md` (nouveau). Le résumé du builder est dans son prompt. Pas de révision après la dernière revue (adw_build_review.py:58-59 ; adw_simple_sdlc.py:122-123). |
| **documenter** | read, grep, find, ls, bash, write, edit (sssf.config.yaml:136-143). | `[app_docs/, docs/, "**/*.md", "*.md"]` (sssf.config.yaml:131-135) ; deepestseek, open-weights, top-speed idem. **Frontier : aucun `writes`** (sssf.frontier.config.yaml:117-132). `**/*.md` passe avant `protected_files` (permissions.py:146-148). | Aucune. | `DocumentOutput` : adw_document.py:62, adw_simple_sdlc.py:165. `GenericOutput` : adw_prompt.py:32. | `artifacts_exist` + `files_non_empty` : adw_document.py:64 et adw_simple_sdlc.py:167, **retries 1** (adw_document.py:60 ; adw_simple_sdlc.py:163). Aucune pour adw_prompt.py. | documenter/system.md:9 « Read `diff_path` — the full diff » ; :11 « Name a file only if… » ; :14 « Write documentation only. Never modify source code, tests, or config » ; :15 « pick a name nothing else holds » ; documenter/user.md:26 « Never overwrite » ; :43 `commit_message` « for committing THIS WRITE-UP » ; :48 « Gates open these files » ; system.md:17 « credentials… live » ; :18 « scratch… will be undone ». | « Full diff » coupé à 2 000 lignes, fichiers non suivis non lus (changes.py:62-72). « Docs only » : `**/*.md` autorise aussi SKILL.md, cookbooks, prompts-modèles, `specs/`, dossiers protégés (nouveau). « Never overwrite » : aucune garde. `document_path` et `documented_files` lus par aucun code (n°44). `commit_message` utilisé seulement par adw_simple_sdlc.py:171. `out.md` autorisé (scratch non annulé). |

## Lecture simple pour Theo

1. Les cinq prompts décrivent bien les cinq rapports JSON : chaque champ demandé existe dans le code, aucun champ obligatoire ne manque. Sur ce point précis, rien n'est faux.
2. Ce qui est faux, ce sont les promesses de contrôle. « Cette redirection sera annulée » est fausse pour le builder, et vraie pour les autres seulement si la phase va au bout.
3. Seuls le planner et le builder tournent dans le workflow par défaut des VM. Et là, le builder est contrôlé par une porte qui ne vérifie rien (`artifacts_exist` sur une liste vide).
4. « Lecture seule » (scout, reviewer) et « documentation seulement » (documenter) sont des règles de configuration, pas de prompt. Elles manquent entièrement dans le YAML « frontier » : à ne pas copier tel quel.
5. Le documenter peut écrire n'importe quel fichier `.md`, y compris les fichiers qui donnent des consignes à d'autres agents. À restreindre à `app_docs/`.
6. « Ne jamais écraser un plan ou un document » n'est qu'une phrase : aucun code ne l'applique. Il faudra faire calculer le nom du fichier par le code.
7. Chaque prompt dit à l'agent que « ses clés sont déjà actives ». C'est vrai dans le code actuel et contraire à notre règle : à réécrire.
8. Les agents se parlent par du texte libre collé dans le message suivant (résumé du builder dans celui du reviewer, notes du reviewer dans celui du builder). Rien ne le filtre.
9. Le reviewer peut dire « approuvé » sans avoir listé une seule exigence : la porte accepte. La revue n'est un contrôle que si le modèle fait son travail.
10. Plusieurs promesses (message de commit du plan, du document) ne sont tenues que par un seul workflow, `adw_simple_sdlc`.

## Ce qui change dans les autres YAML

| YAML | Modèles (planner / builder / scout / reviewer / documenter) | `writes` | `protected_files` | Outils et extensions |
|---|---|---|---|---|
| `sssf.config.yaml` (Inkwell) | gemini-3.6-flash / deepseek-v4-flash-0731 (défaut) / défaut / glm-5.2 / gpt-5.6-luna | planner `[specs/]`, builder absent, scout `[]`, reviewer `[]`, documenter `[app_docs/, docs/, **/*.md, *.md]` | 3 entrées (l.29-32) | tels que dans le premier tableau |
| `sssf.deepestseek.config.yaml` | tous le défaut deepseek-v4-flash-0731, réflexion `high` | identiques à Inkwell | 3 entrées | identiques |
| `sssf.top-speed.config.yaml` | gemini-3.6-flash / défaut / défaut / gemini-3.6-flash / gpt-5.6-luna | identiques | 3 entrées | identiques |
| `sssf.open-weights.config.yaml` | glm-5.2 / kimi-k3 / défaut / glm-5.2 / défaut | identiques | 3 entrées | identiques |
| `sssf.frontier.config.yaml` | claude-opus-5 / kimi-k3 / gpt-5.6-sol / claude-opus-5 / kimi-k3 | **aucun `writes` pour aucun agent** : planner, scout, reviewer, documenter deviennent libres (n°18 confirmé) | **absent** : le défaut du code s'applique (data_types.py:335-337) | identiques |

Les listes d'outils et les extensions sont les mêmes dans les cinq YAML. Aucune clé inconnue n'a été trouvée dans les cinq fichiers (lecture par `yaml.safe_load`, clés comparées à celles du schéma). Rappel : le schéma n'interdit pas les clés inconnues (data_types.py:304-349, n°42).

## Contrat de sortie, champ par champ

Source des types : `adws/adw_modules/data_types.py` (lignes dans la colonne « Type »). Lignes de prompt : fichier `user.md` de l'agent. Tous les champs sont optionnels (valeur par défaut) sauf `status`, qui doit valoir `success` ou `fail` (data_types.py:75). Une clé inconnue est ignorée sans erreur (expérience 2, partie B). « Générique » = ce qu'attend `adw_prompt.py:32` (`GenericOutput`, data_types.py:81-82), qui ne garde que `status`, `summary`, `artifacts`, `notes_for_next_agent`. Aucune clé du prompt n'est absente du type et aucun champ obligatoire du type n'est absent du prompt (expérience 2, partie A : les 5 exemples de prompt se valident tels quels).

Extraction de l'enveloppe : `_extract_json` (agents.py:266-277) prend un bloc entre ``` si son contenu commence par `{`, sinon le texte entier ; puis de la première `{` à la dernière `}` ; `json.loads` ; `model_validate` (agents.py:285-286) ; en cas d'échec, 2 relances dans la même session (agents.py:24, :283-300). Le texte retenu est le DERNIER message de l'assistant (agent_pi.py:301).

### builder : `BuildOutput` (data_types.py:93-95 + base 72-78)

| Champ | Prompt | Type et défaut | Obligatoire | Générique | Qui le lit |
|---|---|---|---|---|---|
| status | builder/user.md:27 | `Literal[success, fail]` (l.75) | oui | oui | agents.py:219-220 (≠ success = run arrêté) |
| summary | :28 | `str = ""` (l.76) | non | oui | trace agents.py:208 ; message de commit de secours (adw_plan_build.py:43) |
| changed_files | :29 | `list[str] = []` (l.94) | non | **non** | gates.py:64 (`diff_matches_claims`) ; texte du reviewer |
| artifacts | :30 | `list[str] = []` (l.77) | non | oui | gates.py:29, :38 |
| commit_message | :31 | `str = ""` (l.95) | non | **non** | adw_plan_build.py:43, adw_plan_build_test.py:73, adw_plan_build_test_quality.py:85, adw_simple_sdlc.py:69 |
| notes_for_next_agent | :32 | `str = ""` (l.78) | non | oui | aucun code : injecté dans le prompt suivant |

### planner : `PlanOutput` (data_types.py:85-90)

| Champ | Prompt | Type et défaut | Obligatoire | Générique | Qui le lit |
|---|---|---|---|---|---|
| status | planner/user.md:37 | `Literal[success, fail]` | oui | oui | agents.py:219-220 |
| summary | :38 | `str = ""` | non | oui | trace |
| artifacts | :39 | `list[str] = []` | non | oui | gates.py:29, :38 (`artifacts_exist`, `files_non_empty`) |
| commit_message | :40 | `str = ""` (l.90) | non | **non** | seulement adw_simple_sdlc.py:89 |
| notes_for_next_agent | :41 | `str = ""` | non | oui | injecté dans le prompt du builder |

### reviewer : `ReviewOutput` (data_types.py:107-120)

| Champ | Prompt | Type et défaut | Obligatoire | Générique | Qui le lit |
|---|---|---|---|---|---|
| status | reviewer/user.md:32 | `Literal[success, fail]` | oui | oui | agents.py:219-220 |
| approved | :33 | `bool = False` (l.118) | non | **non** | adw_build_review.py:56, :66 ; adw_simple_sdlc.py:122, :133, :144 ; gates.py:80 |
| summary | :34 | `str = ""` | non | oui | trace |
| findings[].requirement | :36 | `str` (l.110) | **oui** (dans chaque objet) | non | gates.py:82 (liste des non remplies) |
| findings[].met | :36 | `bool` (l.111) | **oui** (dans chaque objet) | non | gates.py:82 |
| findings[].evidence | :36 | `str = ""` (l.112) | non | non | aucun code |
| findings (liste) | :35 | `list[ReviewFinding] = []` (l.119) | non | non | gates.py:82 |
| blocking | :38 | `list[str] = []` (l.120) | non | **non** | gates.py:81, :84-94 |
| artifacts | :39 | `list[str] = []` | non | oui | gates.py:29 (`artifacts_exist`) |
| notes_for_next_agent | :40 | `str = ""` | non | oui | injecté dans le prompt du builder en révision |

### scout : `ScoutOutput` (data_types.py:98-104)

| Champ | Prompt | Type et défaut | Obligatoire | Générique | Qui le lit |
|---|---|---|---|---|---|
| status | scout/user.md:27 | `Literal[success, fail]` | oui | oui | agents.py:219-220 |
| summary | :28 | `str = ""` | non | oui | trace |
| findings[].file | :30 | `str` (l.99) | **oui** (dans chaque objet) | non | aucun code (chemins non vérifiés) |
| findings[].note | :30 | `str = ""` (l.100) | non | non | aucun code |
| findings (liste) | :29 | `list[ScoutFinding] = []` (l.104) | non | non | aucun code |
| artifacts | :32 | `list[str] = []` | non | oui | gates.py:29 (`artifacts_exist`, adw_scout.py:34) |
| notes_for_next_agent | (absent du prompt) | `str = ""` | non | oui | aucun |

### documenter : `DocumentOutput` (data_types.py:123-128)

| Champ | Prompt | Type et défaut | Obligatoire | Générique | Qui le lit |
|---|---|---|---|---|---|
| status | documenter/user.md:38 | `Literal[success, fail]` | oui | oui | agents.py:219-220 |
| summary | :39 | `str = ""` | non | oui | trace ; message de commit de secours (adw_simple_sdlc.py:69) |
| document_path | :40 | `str = ""` (l.126) | non | **non** | **aucun code** (n°44) |
| documented_files | :41 | `list[str] = []` (l.127) | non | **non** | **aucun code** |
| artifacts | :42 | `list[str] = []` | non | oui | gates.py:29, :38 (adw_document.py:64 ; adw_simple_sdlc.py:167) |
| commit_message | :43 | `str = ""` (l.128) | non | **non** | seulement adw_simple_sdlc.py:171 |
| notes_for_next_agent | :44 | `str = ""` | non | oui | aucun |

### Cas limites vérifiés (expérience 2, partie B, pydantic 2.13.5)

- `status: "partial"` : refusé, relance JSON. Sans `status` : refusé.
- Clé en trop : acceptée, ignorée.
- `changed_files` donné comme chaîne : refusé. `artifacts: null` : refusé.
- `approved: "yes"` : converti en vrai. `approved` absent : faux.
- `findings[]` sans `met` : refusé. `findings` sous forme de chaînes (scout ou reviewer) : refusé.
- `approved: true` avec `findings: []` et `blocking: []` : accepté par le type ET par `verdict_consistent` (expérience 3).
