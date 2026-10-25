# Niveau 3, lot 1 : agents.py, permissions.py, agent_pi.py

Code lu : factory de disler, commit 92f1701 (fork AplOdzZ, branche `analyse/lecture`). Lecture ligne par ligne des trois fichiers d'`adws/adw_modules/` (890 lignes), et de leurs copies dans le modèle du skill par différences. Fait dans le chat dédié au niveau 3, le 25 octobre, sur l'abonnement : trois lecteurs Opus (un par fichier), un vérificateur Opus indépendant, puis contrôle et intégration par Claude.

Fichiers : `notes.json` (les trois notes, format de C1), `sorts.json`, `registre.json` (écarts nouveaux n°49 à 71), `verif/verification.json` (verdicts du vérificateur), `parts/` (sorties brutes des lecteurs, avant corrections), `consigne_lot1.md`.

## À retenir

1. **agents.py porte toute la boucle d'un agent** : config, prompts, lancement de Pi, relances JSON, portes, contrôle des droits, enveloppe et trace. C'est le fichier à réécrire avec le plus de soin chez nous.
2. **Le contrôle des droits ne tourne que si la phase réussit.** `enforce` est appelé une seule fois, après les portes (agents.py:183), sans `finally`. Une phase qui échoue (porte ratée, JSON jamais valide, Pi en erreur, signal) laisse ses écritures hors droits dans l'arbre, et la phase suivante les prend pour l'état de départ (n°49).
3. **permissions.py ne voit que ce que git lui résume.** L'empreinte d'un fichier est le couple « lignes ajoutées, lignes retirées » (l.78). Elle ne voit ni une réécriture à compteurs égaux, ni les binaires déjà modifiés, ni l'index, ni `.git/`, ni les fichiers ignorés ou hors dépôt (n°53, n°57, n°19, n°20).
4. **Le retour arrière n'est pas vérifié.** Il remet depuis l'index et non depuis HEAD (l.215), ne reprend pas de photo après, et peut écrire à travers un lien symbolique : « réparé » n'est pas une garantie (n°54, n°62, n°63).
5. **Le contrôle échoue ouvert.** Une erreur de git donne « aucun changement » (l.62) ; une porte qui rend `None` passe (agents.py:230) (n°58, n°50).
6. **agent_pi.py lance Pi sans filet** : pas de délai, stderr lu après stdout (blocage reproduit au-delà de 64 Kio), pas de `finally` qui arrête Pi, code de retour ignoré dès qu'un texte existe (n°64, n°65).
7. **« OpenRouter seul » n'est pas garanti par le code** : un motif de modèle peut être résolu par sous-chaîne, chez un autre fournisseur selon le catalogue de la machine, et le couple réellement utilisé n'est tracé nulle part (n°67, n°71).
8. **Pi peut charger plus que ce que la config déclare** : pas de `--no-extensions` pour les agents (les sous-agents l'ont), et extensions comme sessions vivent sous `data_dir`, modifiable par tous (n°68, n°14).
9. **Copies du modèle du skill** : agents.py et permissions.py du skill n'ont ni `preserve` ni le seuil de 3 (une écriture interdite arrête toujours la phase) ; agent_pi.py du skill ne trace ni la réflexion ni les messages de l'agent. On part de la version Inkwell.

## Écarts au registre

23 nouveaux (n°49 à 71) : 11 failles, 6 bugs, 6 docs en retard. Les lecteurs en ont trouvé 20 ; le vérificateur en a ajouté 3 (n°62 `.gitignore` modifié qui cache une écriture, n°63 retour arrière à travers un lien, n°71 config.md:106), revérifiés par Claude dans le code.

Registre existant : confirmés avec preuve n°14, 16, 17, 18, 19, 20, 21, 26, 27, 29, 36, 37, 39, 42, 43, 46, 47. Nuancés :
- n°14 : rien ne valide que `data_dir` ne recouvre pas un chemin protégé.
- n°17 : après un retour arrière pardonné, l'enveloppe acceptée peut citer un fichier effacé, et l'agent fautif n'est pas prévenu.
- n°19 : s'ajoutent `pi_sessions/`, `agent_map.json` et `PI_PATH` venu de `.env`.
- n°21 : le flux des sous-agents n'arrive ni dans `raw_output.jsonl` ni dans la trace.
- n°26 : la même promesse est aussi dans `SKILL.md:71` et `agents.py:179-181`.
- n°29 : `defaults.writes` est bien effectif (recopié dans chaque agent avant validation), seulement pas documenté.
- n°40 : `config.md:147-152` décrit exactement la copie du skill.

## Sorts proposés

Les trois à **adapter**. Le principe de chacun est bon (agent borné, sortie typée, photo avant/après, flux JSON lu en direct), mais la mécanique de sécurité est à refaire avant tout usage chez nous.

## Questions pour Theo

Regroupées par thème ; aucune correction n'est décidée (décision 6) :

1. **Ordre du contrôle** : contrôle des droits avant les portes, et dans un `finally` pour qu'il tourne aussi quand la phase ou Pi échoue ?
2. **Écritures annulées** : seuil de pardon à 0 (comme le skill), ou un petit nombre compté aussi par passage ? Et dans ce cas, faire échouer la phase ou renvoyer une correction à l'agent ?
3. **Arbre sale** : exiger un arbre propre avant chaque passage, ou protéger contre tous les agents, builder compris, les chemins déjà modifiés ?
4. **Photo** : empreinte par contenu (sha256 ou arbre git), HEAD et refs mémorisés, git lancé avec un environnement fixe et en échec fermé ?
5. **Portée des agents** : sortir `.git`, `.env`, la trace, les sessions et les extensions de ce qu'un agent peut modifier, ou les surveiller ?
6. **Délais et coût** : durée maximale par tour de Pi, et plafond de coût par phase : quelles valeurs ?
7. **Trace** : garder la réflexion complète du modèle (une fois les clés masquées) ? `raw_output.jsonl` peut-il servir de copie d'audit de chaque envoi (décision 3), si Pi y écrit bien le message envoyé ?
8. **Reprise de session** : seulement si le modèle, les outils, `writes` et le prompt système sont identiques ?
9. **Enveloppes** : validation stricte, avec refus des champs inconnus ?

## Contrôle

- Vérificateur indépendant (Opus) : 97 éléments contrôlés (les 20 écarts, 32 confirmations du registre existant, 42 points et dépendances tirés au hasard, les 3 sorts). 91 exacts, 6 à nuancer, 0 faux, 0 doublon. Les 6 nuances (numéros de ligne décalés, impact de n°67 à borner, n°69 recentré sur la perte avec la VM) sont appliquées dans `notes.json` et `registre.json` ; `parts/` garde les sorties brutes.
- Claude a revérifié dans le code les constats 2 à 7 (agents.py:145-197, :226-230 ; permissions.py:60-83, :178-256 ; agent_pi.py:67-90, :250-321) et l'écart n°71 (config.md:106, agents.py:203-204, tracer.py:269).
- Toutes les expériences ont été faites sur des dépôts jetables du scratchpad, avec une copie de la seule logique utile ; le code du dépôt n'a été ni importé ni lancé, rien n'a été installé, pas de réseau.
- Non vérifiable ici (Pi n'est pas installé) : ce que Pi 1.3.0 charge de lui-même (`.pi/`, `AGENTS.md`, extensions globales), le format et la reprise des sessions, le comportement de `--thinking`, `--tools` et `--system-prompt`, le code de sortie après une erreur du fournisseur. Liste complète dans les `a_verifier` des notes.
- Déroulé : les lecteurs d'agents.py et agent_pi.py ont été interrompus par la limite de session de l'abonnement, puis repris dans leur contexte ; le premier lecteur de permissions.py a été arrêté par un filtre de sécurité pendant la rédaction, et un nouveau lecteur a refait le fichier avec une consigne recentrée sur la couverture du contrôle.
