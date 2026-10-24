#!/usr/bin/env python3
"""Vérifie qu'une carte (carte.json) colle encore à l'état du dépôt. Lecture seule.

Usage :
    python3 verifier_carte.py <carte.json> <racine du dépôt> [--ignorer PREFIXE ...] [--tout]

Pour chaque lien : le fichier `de` existe-t-il, la ligne de preuve existe-t-elle, nomme-t-elle
encore la cible ? Pour chaque fiche : le fichier existe-t-il, son nombre de lignes a-t-il changé ?
Enfin : les fichiers suivis par git qui n'ont pas de fiche.

Sortie : un résumé chiffré, puis ce qui est à revoir, trié par fichier.
Code de sortie : 0 si tout tient, 1 sinon. Les liens « à confirmer à la main » (la ligne existe
mais ne nomme pas sa cible en toutes lettres : appel de fonction, commande, lien indirect, motif…)
n'entraînent pas le code 1 ; ils ne sont détaillés qu'avec --tout.

Python standard uniquement. Ne modifie rien.
"""
import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

# Types de liens dont la cible n'est pas forcément écrite en toutes lettres sur la ligne de preuve.
TYPES_IMPLICITES = {"appelle", "lance", "rend_prompt", "charge_extension", "configure", "lit", "ecrit", "copie"}
VOISINAGE = 15  # lignes de part et d'autre de la preuve où l'on cherche encore le nom de la cible
MORCEAU_MIN = 3


def lire_lignes(racine, chemin, cache):
    if chemin not in cache:
        complet = os.path.join(racine, chemin)
        try:
            with open(complet, "rb") as f:
                brut = f.read()
            cache[chemin] = brut.decode("utf-8", "replace").splitlines()
        except (OSError, IsADirectoryError):
            cache[chemin] = None
    return cache[chemin]


def decouper_preuve(preuve):
    """« chemin:34 » ou « chemin:34-40 » -> (chemin, [34, 40]) ; (preuve, []) si pas de ligne."""
    m = re.match(r"^(.*?):(\d+(?:\s*[-–,]\s*\d+)*)\s*$", preuve or "")
    if not m:
        return preuve or "", []
    return m.group(1), [int(x) for x in re.findall(r"\d+", m.group(2))]


def morceaux(motif):
    """Morceaux littéraux d'un motif (ce qui reste quand on retire jokers et variables)."""
    bruts = re.split(r"[*?<>{}\[\]/\\]+", motif)
    return [m for m in bruts if len(m) >= MORCEAU_MIN]


def noms_attendus(lien):
    vers = lien["vers"].rstrip("/")
    base = os.path.basename(vers)
    sans_ext = os.path.splitext(base)[0]
    if lien.get("motif"):
        # un motif n'a pas de nom propre : on cherche son morceau littéral le plus long
        m = morceaux(vers)
        return [max(m, key=len)] if m else []
    cand = [vers, base, sans_ext]
    return [c for c in dict.fromkeys(cand) if len(c) >= 2]


def verifier_lien(lien, racine, cache):
    """-> (statut, détail) avec statut dans ok / confirmer / revoir."""
    source = lien["de"]
    lignes_source = lire_lignes(racine, source, cache)
    if lignes_source is None:
        return "revoir", "le fichier source n'existe plus"
    fichier_preuve, numeros = decouper_preuve(lien.get("preuve", ""))
    if not numeros:
        return "revoir", "pas de numéro de ligne dans la preuve (%r)" % lien.get("preuve")
    lignes = lire_lignes(racine, fichier_preuve, cache)
    if lignes is None:
        return "revoir", "le fichier de la preuve n'existe plus (%s)" % fichier_preuve
    debut, fin = min(numeros), max(numeros)
    if not lignes and fin <= 1:
        return "confirmer", "le fichier est vide : la preuve ne peut pas nommer la cible"
    if fin > len(lignes):
        return "revoir", "la ligne %d n'existe plus (le fichier n'a que %d lignes)" % (fin, len(lignes))
    texte = "\n".join(lignes[debut - 1:fin])
    noms = noms_attendus(lien)
    if any(n in texte for n in noms):
        return "ok", ""
    # La cible n'est pas nommée sur la ligne : relation implicite, instruction sur plusieurs lignes, ou dérive ?
    proches = [i + 1 for i in range(max(0, debut - 1 - VOISINAGE), min(len(lignes), fin + VOISINAGE))
               if any(n in lignes[i] for n in noms)]
    if proches:
        return "confirmer", "la ligne ne nomme pas la cible, mais elle apparaît à proximité (ligne %d)" % proches[0]
    implicite = (lien["type"] in TYPES_IMPLICITES or lien.get("indirect") or lien.get("motif")
                 or lien.get("produit_a_l_execution") or lien.get("hors_depot"))
    ailleurs = [i + 1 for i, l in enumerate(lignes) if any(n in l for n in noms)]
    suite = " ; nom trouvé ailleurs dans le fichier, lignes " + ", ".join(map(str, ailleurs[:5])) if ailleurs else ""
    if implicite:
        return "confirmer", "la ligne ne nomme pas la cible en toutes lettres (lien %s)%s" % (lien["type"], suite)
    return "revoir", "la ligne de preuve ne nomme plus la cible" + suite


def compter_lignes(racine, chemin):
    try:
        with open(os.path.join(racine, chemin), "rb") as f:
            brut = f.read()
    except OSError:
        return None
    return {len(brut.decode("utf-8", "replace").splitlines()), brut.count(b"\n")}


def exclu(chemin, motifs):
    for m in motifs:
        if m.endswith("/") and (chemin + "/").startswith(m):
            return True
        if fnmatch.fnmatch(chemin, m) or fnmatch.fnmatch(os.path.basename(chemin), m):
            return True
    return False


def fichiers_suivis(racine):
    try:
        out = subprocess.run(["git", "ls-files", "-z"], cwd=racine, capture_output=True, check=True)
    except (OSError, subprocess.CalledProcessError):
        return None
    return [p for p in out.stdout.decode("utf-8", "replace").split("\0") if p]


def main():
    ap = argparse.ArgumentParser(description="Vérifie la fraîcheur d'une carte de dépôt (lecture seule).")
    ap.add_argument("carte")
    ap.add_argument("racine")
    ap.add_argument("--ignorer", action="append", default=[], metavar="PREFIXE",
                    help="ne pas signaler les fichiers sans fiche sous ce préfixe (répétable)")
    ap.add_argument("--tout", action="store_true", help="détailler aussi les liens à confirmer à la main")
    args = ap.parse_args()

    with open(args.carte, encoding="utf-8") as f:
        carte = json.load(f)
    racine = args.racine
    cache = {}
    liens = carte.get("liens", [])
    fiches = carte.get("fichiers", [])
    meta = carte.get("meta", {})

    par_fichier = defaultdict(list)       # fichier -> [(ligne texte)]
    compte = {"ok": 0, "confirmer": 0, "revoir": 0}
    a_confirmer = defaultdict(list)
    modifies = set()
    for fi in fiches:
        possibles = compter_lignes(racine, fi["chemin"])
        if possibles is not None and fi.get("lignes") is not None and fi["lignes"] not in possibles:
            modifies.add(fi["chemin"])
    for l in liens:
        statut, detail = verifier_lien(l, racine, cache)
        if statut == "confirmer" and l["de"] in modifies:
            statut, detail = "revoir", "fichier modifié depuis la carte et la ligne ne nomme pas la cible (%s)" % detail
        compte[statut] += 1
        cible = "%s -> %s (%s)" % (l["type"], l["vers"], l.get("preuve", ""))
        if statut == "revoir":
            par_fichier[l["de"]].append("lien %s : %s" % (cible, detail))
        elif statut == "confirmer":
            a_confirmer[l["de"]].append("lien %s : %s" % (cible, detail))

    fiches_absentes = fiches_changees = 0
    for fi in fiches:
        chemin = fi["chemin"]
        possibles = compter_lignes(racine, chemin)
        if possibles is None:
            fiches_absentes += 1
            par_fichier[chemin].append("fiche : le fichier n'existe plus")
        elif fi.get("lignes") is not None and fi["lignes"] not in possibles:
            fiches_changees += 1
            par_fichier[chemin].append("fiche : %s lignes dans la carte, %s maintenant" % (fi["lignes"], max(possibles)))

    suivis = fichiers_suivis(racine)
    sans_fiche = []
    note_git = ""
    if suivis is None:
        note_git = "git indisponible ou dossier hors dépôt git : fichiers sans fiche non vérifiés."
    else:
        connus = {fi["chemin"] for fi in fiches}
        motifs = list(meta.get("fichiers_exclus", []))
        for p in suivis:
            if p in connus or exclu(p, motifs):
                continue
            if any(p.startswith(pre) for pre in args.ignorer):
                continue
            sans_fiche.append(p)
            par_fichier[p].append("sans fiche : suivi par git mais absent de la carte")

    a_revoir = compte["revoir"] + fiches_absentes + fiches_changees + len(sans_fiche)

    print("Carte : %s (dépôt %s, commit %s, générée le %s)" % (args.carte, meta.get("depot", "?"), meta.get("commit", "?"), meta.get("genere_le", "?")))
    print("Racine vérifiée : %s" % os.path.abspath(racine))
    print()
    print("Résumé")
    print("  liens vérifiés            : %d" % len(liens))
    print("    à jour                  : %d" % compte["ok"])
    print("    à confirmer à la main   : %d" % compte["confirmer"])
    print("    à revoir                : %d" % compte["revoir"])
    print("  fiches vérifiées          : %d" % len(fiches))
    print("    fichier disparu         : %d" % fiches_absentes)
    print("    nombre de lignes changé : %d" % fiches_changees)
    print("  fichiers suivis sans fiche: %d%s" % (len(sans_fiche), "" if not note_git else "  (" + note_git + ")"))
    print()
    if par_fichier:
        print("À revoir (%d) — trié par fichier" % a_revoir)
        for chemin in sorted(par_fichier):
            print("  %s" % chemin)
            for ligne in par_fichier[chemin]:
                print("    - %s" % ligne)
        print()
    if args.tout and a_confirmer:
        print("À confirmer à la main (%d) — trié par fichier" % compte["confirmer"])
        for chemin in sorted(a_confirmer):
            print("  %s" % chemin)
            for ligne in a_confirmer[chemin]:
                print("    - %s" % ligne)
        print()
    elif compte["confirmer"]:
        print("(%d liens à confirmer à la main ne sont pas détaillés : ajouter --tout pour les voir.)" % compte["confirmer"])
    print("Résultat : %s" % ("tout tient" if a_revoir == 0 else "%d point(s) à revoir" % a_revoir))
    return 0 if a_revoir == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
