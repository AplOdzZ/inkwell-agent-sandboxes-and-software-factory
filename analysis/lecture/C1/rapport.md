# Lecture du bloc C1 (pilote)

Code lu : factory de disler, commit 92f1701. Fichiers : `data_types.py` (niveau 3), `utils.py` (niveau 2, `operator_env` en niveau 3), `prompts.py` (niveau 2), `console.py` (niveau 1). Les copies dans `.claude/skills/sssf/templates/adws/adw_modules/` sont identiques aux originaux pour les quatre fichiers.

## À retenir

1. Le bloc C1 regroupe la « boîte à outils » commune à tous les ADW. Il ne lance aucun agent lui-même, mais tous les autres modules s'appuient dessus.
2. `data_types.py` décrit les formes : la config `sssf.config.yaml` (agents, droits d'écriture, fichiers protégés), les rapports JSON que chaque agent doit rendre, et les événements de la trace.
3. Ce schéma est permissif : une clé mal orthographiée dans le YAML est ignorée sans message, et un agent sans `writes` peut tout modifier, sauf les fichiers protégés.
4. `utils.py` charge le fichier `.env` dès son import. Ensuite, `operator_env` donne à Pi et aux commandes qualité une copie **complète** de l'environnement, clés comprises. Seul le venv de uv en est retiré.
5. `prompts.py` remplit les gabarits `{{...}}` des agents et garde une copie du prompt envoyé. Cette copie est écrasée quand le même agent repasse dans la session.
6. `console.py` affiche le déroulé à l'écran et recopie chaque ligne dans la trace (`sssf.db` et `events.jsonl`), sans aucun filtre de secret.
7. Les quatre lignes déjà au registre qui touchent ces fichiers sont confirmées (n°18, 29, 37, 39). La contradiction sur `AgentCall` (`data_types.py` l.294, `list[str]` au lieu de `GateReport`) l'est aussi.
8. Verdict : on garde l'idée des quatre fichiers, mais il faut les adapter tous les quatre (voir `sorts.json`).

## Failles et bugs

Du plus grave au moins grave. Le détail et les preuves sont dans `registre.json`.

1. **Faille : la config accepte les fautes de frappe** (`data_types.py` l.304-349). Aucun modèle n'a `extra="forbid"`. Écrire `write: []` au lieu de `writes: []` ne déclenche aucune erreur. L'agent, censé être en lecture seule, devient libre d'écrire (`permissions.py:150`). Une faute sur `protected_files` efface en silence les protections ajoutées par l'utilisateur ; seul le défaut reste (`permissions.py:148`). C'est la même cause que la ligne n°29 du registre. Aujourd'hui, aucun des 6 YAML du dépôt n'a de clé inconnue.
2. **Bug : la copie d'audit des prompts est incomplète** (`agents.py` l.81 et l.92, avec `prompts.py` l.16-20). La copie est rangée par agent, pas par phase. Quand le builder repasse en phase `fix_i` ou `revise_i`, elle est écrasée. De plus, les messages de correction ne sont jamais sauvegardés.
3. **Bug : `engineer_name` peut bloquer le démarrage** (`utils.py` l.70-76). Si `ENGINEER_NAME` n'est pas posé et que `git config` met plus de 5 s à répondre, l'erreur de délai n'est pas attrapée et la session ne démarre pas.
4. **Bug : une commande affichée est fausse** (`console.py` l.65). Le panneau final conseille `just phases <id>`, mais la bonne commande est `just obs phases <id>`.

Il y a aussi un point de vigilance majeur pour nous, qui n'entre pas dans le registre faute de promesse contraire dans le code : **tout le contenu de `.env` part chez l'agent**. `load_dotenv` (`utils.py` l.13) et la copie complète (`utils.py` l.31) font qu'une clé de provisioning OpenRouter posée sur l'hôte (`.env.sample:15`) arrive chez Pi (`agent_pi.py:281`). Elle arrive aussi chez les commandes qualité (`quality.py:54`).

## Questions pour Theo

1. **Variables transmises aux agents.** On remplace la copie complète par une liste blanche : PATH, HOME, LANG, TERM, et la seule clé OpenRouter de la VM. D'accord pour refuser tout le reste par défaut ?
2. **Config stricte.** D'accord pour qu'une clé inconnue dans un YAML arrête le lancement, et que `writes` soit obligatoire pour chaque agent ? Plus aucun agent ne serait « libre » par oubli.
3. **Audit des prompts.** Veut-on garder une copie de chaque envoi, rangée par phase, puis la rapatrier hors de la VM jetable avant sa destruction ? Cela demande un peu de place disque et une étape de plus.
4. **Filtre de secrets dans la trace.** Notre règle interdit les vrais secrets dans l'atelier. Ajoute-t-on quand même un filtre qui masque les clés (`sk-or-...`) avant écriture dans la trace ? C'est une ceinture de sécurité qui coûte peu.
5. **Modèle par défaut.** Dans le schéma, le modèle par défaut est `google/gemini-3.6-flash`. Préfère-t-on aucun modèle par défaut, chaque agent devant nommer le sien, ou un modèle OpenRouter épinglé ?

## Contrôle

- Le vérificateur (un subagent qui n'avait rien écrit) a rouvert chaque preuve des **15 écarts candidats** et de **5 affirmations tirées au hasard** dans les notes. Le tirage a été fait avec un script, sur 138 affirmations.
- **5 erreurs avant correction**, sur 4 écarts, plus 5 remarques :
  - n°1 : la conséquence d'une faute sur `protected_files` était fausse. Corrigé.
  - « Plantage avec pydantic 3 » (`data_types.py` l.432) : non prouvable, car cette version n'existe pas ici. Retiré du registre et mis dans `a_verifier`.
  - Porte `tests_pass` sans environnement filtré : un numéro de ligne était faux (la citation est à `utils.py:25`). Surtout, le bug n'est pas établi : la porte n'est utilisée par aucun ADW. Retiré du registre et mis en vigilance.
  - « Trace écrite sans filtre » : ce n'était pas un écart, car le code fait ce qu'il dit. Retiré du registre et mis en vigilance.
  - Remarques traitées :
    - le commentaire de `operator_env` est passé en vigilance ;
    - l'audit des prompts est requalifié en bug (« fix_i ou revise_i ») ;
    - deux preuves manquantes ont été ajoutées (`adw_simple_sdlc.py:167`, `git_helper.py:61`) ;
    - deux affirmations sur just et uv portent désormais la mention « à vérifier ».
- Résultat : 11 écarts nouveaux au registre (1 faille, 3 bugs, 7 doc en retard).
- **Non établi**, car ces outils ne sont pas dans le dépôt :
  - ce que `uv run` pose dans l'environnement (VIRTUAL_ENV, PATH) et quelle version de pydantic il résout ;
  - quel `.env` charge just pour un module ;
  - ce que fait Pi 1.3.0 d'une valeur `--thinking` inconnue, et s'il transmet tout son environnement à son outil bash.
- Rien n'a été installé. pydantic 2.13.5 et python-dotenv 1.2.3 étaient déjà sur la machine. Ils n'ont servi qu'à lire leur code source et à tester un petit modèle à part, jamais le code du dépôt.

## Volume

5 subagents lancés. Les nombres de lignes sont estimés par chaque subagent ; ils comptent le fichier lu plus tous les fichiers ouverts pour les preuves.

| Subagent | Modèle, effort | Lignes lues |
|---|---|---|
| Lecteur `data_types.py` (niveau 3) | opus, high | ~2 300 |
| Lecteur `utils.py` (niveau 2, `operator_env` niveau 3) | opus, high | ~1 150 |
| Lecteur `prompts.py` (niveau 2) | opus, high | ~520 |
| Lecteur `console.py` (niveau 1) | sonnet, medium | ~430 |
| Vérificateur | opus, high | ~1 450 |
