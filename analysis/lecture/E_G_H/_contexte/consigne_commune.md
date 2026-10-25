# Consigne commune — étude des blocs E, G et H (lecture seule)

Projet : Theo (qui n'est pas développeur) construit un système d'agents : Pi 1.3.0, modèles via OpenRouter, VM exe.dev jetables. Il étudie la factory de disler (commit 92f1701, copie dans ce dépôt, branche `analyse/lecture`) pour décider ce qu'on garde, adapte ou vérifie, et relever toutes les failles. Tu lis, tu ne corriges rien dans le code.

Nos règles : jamais de vrai secret dans l'atelier, une clé par VM, versions épinglées, `ignore-scripts` à true, rien d'installé sans relecture.

## Où tu travailles
- Dépôt : `/home/user/inkwell-agent-sandboxes-and-software-factory`. Tu n'écris QUE dans `analysis/lecture/E_G_H/parts/` (tes livrables) et dans ton dossier d'expérience (voir plus bas). Aucun autre fichier du dépôt ne doit changer. Ne fais ni commit ni push.
- Visualiseur : `.claude/skills/sssf/apps/visualizer/` (abrégé `VIS/` plus bas).

## Contexte à lire AVANT de commencer
1. `analysis/lecture/C1/rapport.md`, `analysis/lecture/C2-C5_D/rapport.md`, `analysis/lecture/N3_lot1/rapport.md` : lis-les EN ENTIER. Ils disent ce que fait vraiment le code décrit par les fichiers que tu étudies. Ne refais pas ces lectures ; ouvre les fichiers de ces blocs (`agents.py`, `permissions.py`, `agent_pi.py`, `data_types.py`, `prompts.py`, `gates.py`, `session.py`, `tracer.py`, les `adw_*.py`, `subagents.ts`) seulement aux lignes qui servent de preuve.
2. `analysis/lecture/C2-C5_D/notes.json` : lis deux notes pour le FORMAT à reproduire exactement.
3. `analysis/lecture/E_G_H/_contexte/carte_lot<N>.json` : pour chacun de tes fichiers, la fiche de la carte (NON RELUE : un point de départ, pas une vérité), les liens sortants et entrants, les contradictions. Confronte chaque fiche et chaque lien au code. Chaque fiche fausse ou incomplète : note-la dans `deps` sous la forme « Carte à corriger : … ». La carte ne relie pas les mentions par nom court ni les motifs comme `*.yaml` : complète avec `git grep`.
4. Registres déjà existants : `analysis/lecture/N3_lot1/_contexte/registre_48_lignes.txt` (48 lignes), `analysis/lecture/N3_lot1/registre.json` (n°49 à 71 à venir), `analysis/lecture/C1/registre.json`, `analysis/lecture/C2-C5_D/registre.json`. Ne redécouvre pas ces écarts : confirme-les ou nuance-les dans tes `points` (« Registre n°X confirmé : … » avec ta preuve). N'ajoute au registre que des écarts NOUVEAUX.
5. Déjà connu (à confirmer ou corriger, pas à redécouvrir) : voir `analysis/lecture/E_G_H/_contexte/deja_connu.md`.

## Niveaux de lecture
- **Niveau 1, fiche validée** : lis le fichier, confronte la fiche de la carte au code, corrige-la, complète-la.
- **Niveau 2, lecture ciblée** : rôle, puis chaque fonction, route ou recette une par une (ce qu'elle reçoit, fait, rend), avec ses lignes.
- **Niveau 3, ligne par ligne** : chaque section, chaque phrase ou instruction, chaque valeur par défaut, confrontée au code qui l'utilise ailleurs dans le dépôt. Rien n'est sauté (constantes, imports, commentaires qui font une promesse : une promesse non tenue = écart).

## Règles de preuve
- Toute affirmation porte sa preuve `chemin:ligne` dans le CODE. La documentation de disler est souvent en retard : une doc ne prouve jamais un comportement. Distingue ce que le code FAIT de ce qu'il DIT faire.
- Préfère une affirmation de moins à une affirmation non prouvée. Ne présente jamais une supposition comme un fait. Ce qui ne peut pas s'établir dans ce dépôt (comportement de Pi, d'exe.dev, du navigateur, de bun, de just, de uv) va dans `a_verifier`.
- Pour savoir qui utilise un fichier : liens de la carte, plus `git grep` sur son nom court et ses fonctions.
- Avant d'écrire qu'une recette `just` ou un fichier « n'existe pas », cherche-le (`git ls-files`, `git grep`, et les sous-modules `just/sandbox/...`).

## Expériences permises
Tu peux reproduire un comportement pour le prouver, dans un dossier temporaire HORS du dépôt : `/tmp/claude-0/-home-user-inkwell-agent-sandboxes-and-software-factory/57435431-b871-5e3f-a3cd-ba36121df0f8/scratchpad/lot<N>/`, avec une copie de la seule logique utile (par exemple le remplacement des gabarits de `prompts.py`, une requête SQL de `db.ts` sur une base SQLite fabriquée avec le module `sqlite3` de Python, un petit test d'un motif de chemin). INTERDIT : importer ou lancer le code du dépôt tel quel, installer quoi que ce soit (`bun install`, `pip`, `npm`, `curl | bash`), lancer le visualiseur ou `install.py`, accéder au réseau. Décris chaque expérience dans la note (ce qui a été fait, ce qui a été observé). Si bun/just/node n'est pas déjà installé, ne l'installe pas : dis-le dans `a_verifier`.

## Décisions déjà prises par Theo (ne pas les rediscuter ; s'en servir dans `chez_nous`)
1. Liste fixe de variables d'environnement pour les agents (PATH, HOME, LANG, TERM, la seule clé OpenRouter de la VM).
2. Refuser toute clé inconnue dans un YAML ; `writes` obligatoire pour chaque agent.
3. Copie de chaque prompt envoyé, rangée par phase, rapatriée hors de la VM.
4. Masquer les clés dans la trace avant écriture.
5. Aucun modèle par défaut : chaque agent nomme le sien.
6. Les failles sont relevées, pas corrigées ; tu peux proposer des pistes dans `chez_nous` sans trancher.
7. Jamais de vrai secret dans l'atelier ; OpenRouter seul fournisseur dans les VM ; jamais l'abonnement Claude pour ce qui tourne seul ; versions épinglées.

## Livrables (UTF-8, JSON valide) dans `analysis/lecture/E_G_H/parts/`, avec `<lot>` = `lot1` … `lot5`
- `<lot>.notes.json` : `{chemin: note}`, UNE ENTRÉE PAR FICHIER lu (chemin relatif à la racine du dépôt). Chaque note a exactement les clés : `status` ("fait"), `niveau` (1, 2 ou 3), `role`, `points`, `deps`, `vigilance`, `chez_nous`, `a_verifier` (listes de phrases sauf `role` et `status` et `niveau`). Les `points` suivent l'ordre du fichier, une idée par point, chacun avec sa preuve `chemin:ligne`. Pour les fichiers de niveau 3, aucun passage ne doit être sauté. Pour un fichier de niveau 2, une entrée de `points` par fonction, route ou recette.
- `<lot>.sorts.json` : `[{"p", "fate", "reason"}]`, `fate` ∈ `garder` | `adapter` | `verifier` (semble mort ou sans intérêt). JAMAIS `supprimer`. Un prompt, une doc ou un code lu par un agent ou par un humain qui suit la procédure, et qui est faux sur ce que fait le code, est au moins `adapter`. Une phrase de raison (deux au plus). Un sort par fichier.
- `<lot>.registre.json` : écarts NOUVEAUX seulement, `[{"ou", "ecrit", "realite", "impact", "type"}]`, `type` ∈ `doc_en_retard` | `perime_pour_nous` | `faille` (le code laisse passer ce qu'il prétend empêcher) | `bug` (le code plante ou se trompe). `ecrit` = la promesse avec sa preuve, `realite` = ce que fait le code avec sa preuve, `impact` = la conséquence pour nous en une ou deux phrases. Ne numérote pas. Liste vide si rien de nouveau. Un écart = un fichier + une ligne + une preuve ; ne regroupe pas des choses différentes.
- Pour les écarts « déjà connus » de la liste : ne les mets PAS au registre, confirme-les (ou corrige-les) dans `points`, avec ta preuve.

## Style
Français avec accents, phrases courtes et simples : Theo lit tout. Pas de jargon sans explication. Une idée par point. Pas d'emoji.

## Ce que tu renvoies
Un résumé de 20 lignes au plus : fichiers lus et nombre de lignes lues (estimation, fichier + preuves ouvertes ailleurs), nombre de points par note, écarts nouveaux par type, les 3 à 5 constats les plus importants, le sort proposé par fichier (une ligne), les déjà connus confirmés/corrigés, les expériences faites, les questions pour Theo. Tout le détail reste dans les fichiers.
