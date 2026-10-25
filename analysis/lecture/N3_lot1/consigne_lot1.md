# Consigne — niveau 3, lot 1 : agents.py, permissions.py, agent_pi.py

Projet : Theo construit un environnement d'agents sur Pi (Pi 1.3.0, Earendil) et veut comprendre parfaitement la factory de disler avant de bâtir la sienne. Ta lecture sert à décider ce qu'on garde, adapte ou vérifie, et à relever toutes les failles. Tu lis, tu ne corriges rien.

## Le code

- Dépôt cloné : `/root/inkwell` (fork de `disler/inkwell-agent-sandboxes-and-software-factory`, branche `analyse/lecture`). Le code est identique au commit `92f1701` de disler ; seul `analysis/` est ajouté.
- Les trois fichiers du lot sont dans `adws/adw_modules/` : `agents.py` (313 lignes), `permissions.py` (256), `agent_pi.py` (321).
- Chacun a une copie DIFFÉRENTE dans le modèle du skill : `.claude/skills/sssf/templates/adws/adw_modules/<même nom>`. C'est la version que le skill installe dans un nouveau dépôt. Lis-la **par différences** (`diff -u`) et dis ce que chaque différence change pour la sécurité ou le comportement.

## Contexte fourni (à lire avant de commencer)

- `analysis/lecture/N3_lot1/_contexte/registre_48_lignes.txt` : le registre des écarts actuel (48 lignes). Ceux qui touchent ce lot : n°14, 17, 19, 20, 26, 27, 29, 36, 37, 39, 40, 43, 46 (et 21, 42, 45 indirectement). **Ne les recopie pas** : confirme-les ou nuance-les dans tes `points`, avec ta propre preuve (« Registre n°17 confirmé : … »). N'ajoute au registre que des écarts NOUVEAUX.
- `analysis/lecture/N3_lot1/_contexte/carte_lot1.json` : la fiche de la carte et tous les liens entrants et sortants de ces trois fichiers. Confronte la fiche et chaque lien au code. Les erreurs vont dans `deps` sous la forme « Carte à corriger : … ».
- `analysis/lecture/C1/notes.json`, `analysis/lecture/C1/registre.json`, `analysis/lecture/C1/rapport.md` : la lecture du bloc C1 (data_types, utils, prompts, console). C'est **le format à reproduire exactement**, et le contexte des modules dont tes fichiers dépendent.
- `analysis/audit_data_dir.md` : audit déjà fait du trou `data_dir` dans `permissions.py`.

## Méthode (niveau 3 = ligne par ligne)

1. **Rôle** du fichier en une ou deux phrases simples.
2. **Chaque fonction ou section, dans l'ordre du fichier** : ce qu'elle reçoit, ce qu'elle fait, ce qu'elle rend, avec ses lignes. Rien ne doit être sauté, y compris les constantes, les imports et les commentaires qui font une promesse (une promesse de commentaire non tenue par le code = écart).
3. **Dépendances dans les deux sens** : qui il importe ou lance, qui l'importe ou l'appelle. Cherche avec `git grep` : les noms de fonctions, mais aussi **les noms courts et les motifs** (la carte ne relie ni les motifs comme `*.yaml` ni les mentions par nom court). Les docs (`.md`) qui décrivent ce fichier comptent aussi : relève celles qui le contredisent.
4. **Vigilance** : sécurité, secrets, réseau, écriture disque, processus lancés, délais, ce qui peut échapper au contrôle.
5. **Chez nous** : ce qu'on garderait, adapterait ou remplacerait, et pourquoi. Tiens compte des décisions déjà prises par Theo (plus bas).
6. **À vérifier** : tout ce que le dépôt ne permet pas de prouver (comportement de Pi 1.3.0, de git, de uv, d'une bibliothèque).

## Règles de preuve

- **Toute affirmation porte sa preuve `chemin:ligne`** (ou `l.X-Y` pour le fichier lu). La doc de disler est souvent en retard : seule une ligne de code prouve un comportement.
- Distingue ce que le code **fait** de ce qu'il **dit** faire (commentaires, docstrings, docs).
- Ne présente jamais une supposition comme un fait. Si tu ne peux pas prouver, mets-le dans `a_verifier`.
- Pour un comportement de Python ou de git, tu peux faire une petite expérience **autonome** dans `/tmp/claude-0/-home-claude/f4b01076-2589-505b-b3d7-e209d827f320/scratchpad/lot1/` (par exemple tester `fnmatch` ou `git diff --numstat` sur un dépôt jetable que tu crées). Dis-le dans la note. Tu ne lances **jamais** le code du dépôt, tu n'installes **rien**, tu n'utilises pas le réseau.
- Pi n'est pas installé ici : tout ce qui dépend de Pi va dans `a_verifier`.

## Décisions déjà prises par Theo (ne pas les rediscuter, s'en servir dans « chez nous »)

1. Ne transmettre aux agents qu'une liste fixe de variables (PATH, HOME, LANG, TERM, la seule clé OpenRouter de la VM).
2. Refuser toute clé inconnue dans un YAML ; `writes` obligatoire pour chaque agent.
3. Copie de chaque prompt envoyé, rangée par phase, rapatriée hors de la VM.
4. Masquer les clés avant écriture dans la trace.
5. Aucun modèle par défaut : chaque agent nomme le sien.
6. Les failles sont relevées, pas corrigées ; la correction de `permissions.py` se décidera après l'analyse complète. Tu peux proposer des pistes dans `chez_nous`, sans trancher.
7. Règles de l'environnement : jamais de vrai secret dans l'atelier (un projet qui en a besoin tourne dans une VM) ; OpenRouter seul fournisseur dans les VM ; jamais l'abonnement Claude pour ce qui tourne seul ; versions épinglées.

## Sort du fichier

Un seul parmi : `garder`, `adapter`, `verifier` (semble mort ou sans intérêt). Jamais `supprimer`. Une doc ou un code que lisent les agents et qui contient une erreur est au moins `adapter`. Donne la raison en une ou deux phrases.

## Livrables (écris-les toi-même, en UTF-8, JSON valide)

Dans `analysis/lecture/N3_lot1/parts/`, avec `<nom>` = `agents`, `permissions` ou `agent_pi` :

- `<nom>.notes.json` : un objet `{ "adws/adw_modules/<nom>.py": { ... } }` avec exactement les clés de C1 : `status` ("fait"), `niveau` (3), `role`, `points`, `deps`, `vigilance`, `chez_nous`, `a_verifier`. Les `points` suivent l'ordre du fichier. Ajoute dans `points` une entrée « Copie du modèle du skill : … » qui résume le diff.
- `<nom>.sorts.json` : une liste d'un objet `{ "p": ..., "fate": ..., "reason": ... }`.
- `<nom>.registre.json` : une liste des écarts NOUVEAUX, chacun `{ "ou", "ecrit", "realite", "impact", "type" }`, avec `type` parmi `faille`, `bug`, `doc` (doc en retard sur le code ou commentaire trompeur). `ecrit` = la promesse (avec sa preuve), `realite` = ce que fait le code (avec sa preuve), `impact` = la conséquence pour nous en une ou deux phrases. Liste vide si rien de nouveau.

## Style

Français, phrases courtes et simples : Theo lit tout. Pas de jargon sans explication. Une idée par point.

## Ce que tu renvoies

Seulement un résumé de 15 lignes au plus : nombre de points, d'écarts nouveaux par type, les 3 constats les plus importants, les registres existants confirmés ou nuancés, le sort proposé, et les questions pour Theo. Tout le détail reste dans les fichiers.
