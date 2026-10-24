# Rapport : carte du dépôt Inkwell

Dépôt `disler/inkwell-agent-sandboxes-and-software-factory`, commit `92f1701`, branche `analyse/carte`.
État : **étape 1 (pilote)**. Seuls `adws/adw_modules/` et `adws/adw_sssf_config/` sont couverts.

> Taux d'erreur du contrôle qualité avant correction : 3 éléments faux sur 33 contrôlés, soit **9,1 %**. C'est sous le seuil de 10 %, mais de peu. Les 3 erreurs sont corrigées.

## Couverture

- **Fichiers couverts :** 21 fiches complètes, toutes lues en entier une seule fois (148 095 octets) :
  - `adws/adw_modules/` : 16 fichiers ;
  - `adws/adw_sssf_config/` : 5 fichiers.
- **Liens :** 172 au total.
  - Par type : `configure` 90, `importe` 25, `lit` 23, `appelle` 22, `ecrit` 9, `charge_extension` 1, `rend_prompt` 1, `decrit` 1.
  - 8 sont à confiance faible : surtout des appels passés par des objets injectés (`run.tracer`, etc.).
- **Exclus (périmètre) :** `images/`, `*.png`, `*.svg`, `*.lock`, `uv.lock`, `bun.lock`.
- **Restent pour l'étape 2 :** environ 224 des 245 fichiers suivis dans le périmètre.
- **Liens inverses et classements :** calculés par script dans `analysis/classements.json`, à partir de `analysis/build_carte.py`.

## Contrôle qualité (étape 1)

Un sous-agent vérificateur, qui n'a produit aucune fiche, a contrôlé **20 liens, 5 fiches et 8 affirmations de l'audit**, tirés au hasard avec la graine 92.

Résultats avant correction :

| Élément | Exacts | Faux |
|---|---|---|
| Liens | 18 | 2 |
| Fiches | 4 | 1 |
| Affirmations de l'audit | 8 | 0 |

Les 3 erreurs, toutes corrigées :

1. **Lien non étayé.** `justfile` → `sssf.config.yaml` (`lit`) : `justfile:22` déclare une variable qui n'est jamais utilisée. Le lien est supprimé. La lecture réelle passe par `just/adws.just`.
2. **Ligne de preuve décalée.** Les liens `configure` config → `agents.py` citaient `:36`, la boucle. La bonne ligne est `:37`, la recopie des `defaults`. Corrigé dans les 5 configs, car l'erreur était systématique.
3. **Citation imprécise dans une contradiction.** Fiche `sssf.frontier.config.yaml` : « change nothing » est dans `purpose` aux lignes 80 et 105, pas dans un commentaire `tools:` à la ligne 86.

Une erreur annexe est aussi corrigée : une note citait `agent_pi.py:263` au lieu de `:264` pour `-e`.

## Ce qui n'a pas pu être établi

- Ce que fait `adws/adw_data/harness_engineering/subagents.ts` : ce fichier n'a pas encore été lu. On ne sait donc pas si un sous-agent peut écrire hors du dépôt.
- Le comportement de `git diff --numstat` sur les noms non ASCII, les renommages et les fichiers binaires (confiance faible, rien n'a été exécuté).
- Qui intercepte `PermissionBreach` au-delà de `runner.py` : à voir dans `adws/adw_*.py` à l'étape 2.
- Les liens entrants depuis les fichiers non encore couverts, et les `decrit` venant de la documentation.
- `observability.poll_ms` n'a pas de lecteur en Python, seulement le schéma. Le visualiseur reste à vérifier.

## Contradictions trouvées (documentation ou commentaire contre code)

1. **Profil frontier.** L'en-tête `adws/adw_sssf_config/sssf.frontier.config.yaml:4-5` dit que seul le choix des modèles change. Or ce profil omet `protected_files` et **toutes** les clés `writes` : aucun agent n'y est plus en lecture seule (`permissions.py:146-150` ; valeur par défaut à `data_types.py:335`).
2. **Violation tolérée.** `permissions.py:23-25` dit qu'une violation « aborts the phase ». Le code tolère pourtant jusqu'à 3 chemins, si tous ont été annulés (`permissions.py:248-253`).
3. **`data_dir` traité à part.** `permissions.py:70-71` dit que `data_dir` n'a pas besoin de cas particulier puisqu'il est ignoré par git. Or `always_writable` le traite explicitement (`:125-139`), et `adws/adw_data/` contient des fichiers **suivis** : les prompts et les extensions.
4. **Porte `diff_matches_claims`.** La docstring `gates.py:62` annonce une confrontation au diff. Le code vérifie seulement que les fichiers existent (`gates.py:64-67`).
5. **Module inexistant.** `git_helper.py:61` cite `documentation.py`, qui n'existe nulle part dans le dépôt. C'est `changes.py:52-84` qui compose le diff.
6. **Signature des portes.** Les commentaires de `data_types.py:294` décrivent `gate(...) -> list[str]`. Les portes renvoient en réalité un `GateReport` (`gates.py:27` ; une liste n'est acceptée que comme cas ancien, `agents.py:226-230`).
7. **Types d'événements.** Le commentaire de `data_types.py:359` omet les types `thinking` et `agent_message`, que `agents.py:250` émet pourtant.
8. **`defaults.writes`.** `agents.py:37` propage `defaults.writes`, mais `ConfigDefaults` n'a pas ce champ (`data_types.py:325-338`).
9. **Module mort.** `agent_cc.py:1-6` se présente comme un adaptateur, mais aucun module ne l'importe, et `agents.validate` refuse tout `coding_agent` autre que `pi` (`agents.py:61-63`).

## Les dix fichiers les plus reliés (étape 1, calcul par script)

| # | Fichier | Entrants | Sortants | Total |
|---|---|---|---|---|
| 1 | `adws/adw_sssf_config/sssf.config.yaml` | 15 | 18 | 33 |
| 2 | `adws/adw_modules/agents.py` | 7 | 16 | 23 |
| 3 | `adws/adw_modules/runner.py` | 8 | 12 | 20 |
| 4 | `adws/adw_sssf_config/sssf.deepestseek.config.yaml` | 0 | 18 | 18 |
| 5 | `adws/adw_sssf_config/sssf.frontier.config.yaml` | 0 | 18 | 18 |
| 6 | `adws/adw_sssf_config/sssf.open-weights.config.yaml` | 0 | 18 | 18 |
| 7 | `adws/adw_sssf_config/sssf.top-speed.config.yaml` | 0 | 18 | 18 |
| 8 | `adws/adw_modules/data_types.py` | 15 | 0 | 15 |
| 9 | `adws/adw_modules/agent_pi.py` | 7 | 6 | 13 |
| 10 | `adws/adw_modules/utils.py` | 12 | 1 | 13 |

Ce classement est provisoire : les liens entrants depuis `adws/adw_*.py`, `just/` et la documentation viendront à l'étape 2.
