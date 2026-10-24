"""Fusionne les fiches des sous-agents en analysis/carte.json, dédoublonne les liens,
vérifie les chemins, puis calcule liens inverses et classements (analysis/classements.json).

Usage : python3 analysis/build_carte.py <parts_dir> [<parts_dir> ...]
"""
import datetime
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "analysis", "carte.json")
RANK = os.path.join(ROOT, "analysis", "classements.json")
EXCLUS = ["images/", "*.png", "*.svg", "*.lock", "uv.lock", "bun.lock"]
LINK_TYPES = {"importe", "appelle", "lit", "ecrit", "lance", "charge_extension",
              "rend_prompt", "configure", "decrit", "copie"}


def tracked():
    out = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True)
    return set(out.stdout.split())


def main(dirs):
    files, links = {}, {}
    for d in dirs:
        for p in sorted(glob.glob(os.path.join(d, "*.json"))):
            data = json.load(open(p))
            for f in data.get("fichiers", []):
                files[f["chemin"]] = f
            for l in data.get("liens", []):
                key = (l["de"], l["vers"], l["type"])
                if key in links:
                    prev = links[key]
                    prev["occurrences"] = prev.get("occurrences", 1) + l.get("occurrences", 1)
                else:
                    links[key] = dict(l)

    git_files = tracked()
    problems = []
    for (de, vers, typ), l in links.items():
        if typ not in LINK_TYPES:
            problems.append(f"type inconnu {typ}: {de} -> {vers}")
        for end in (de, vers):
            special = l.get("motif") or l.get("hors_depot") or l.get("produit_a_l_execution")
            if end not in git_files and not special:
                is_dir = any(g.startswith(end.rstrip("/") + "/") for g in git_files)
                if not is_dir:
                    problems.append(f"chemin introuvable non marqué: {end} ({de} -> {vers}, {typ})")
        src = l["preuve"].rsplit(":", 1)[0]
        if src not in git_files:
            problems.append(f"preuve hors dépôt: {l['preuve']}")

    carte = {
        "meta": {
            "depot": "disler/inkwell-agent-sandboxes-and-software-factory",
            "commit": "92f1701",
            "genere_le": datetime.date.today().isoformat(),
            "fichiers_couverts": len(files),
            "fichiers_exclus": EXCLUS,
        },
        "fichiers": sorted(files.values(), key=lambda f: f["chemin"]),
        "liens": sorted(links.values(), key=lambda l: (l["de"], l["type"], l["vers"])),
    }
    json.dump(carte, open(OUT, "w"), ensure_ascii=False, indent=2)

    out_deg, in_deg = {}, {}
    inverse = {}
    for l in carte["liens"]:
        out_deg[l["de"]] = out_deg.get(l["de"], 0) + 1
        in_deg[l["vers"]] = in_deg.get(l["vers"], 0) + 1
        inverse.setdefault(l["vers"], []).append({"de": l["de"], "type": l["type"], "preuve": l["preuve"]})
    nodes = set(out_deg) | set(in_deg)
    top = sorted(nodes, key=lambda n: (-(out_deg.get(n, 0) + in_deg.get(n, 0)), n))[:10]
    json.dump({
        "top10_relies": [{"chemin": n, "entrants": in_deg.get(n, 0), "sortants": out_deg.get(n, 0),
                          "total": in_deg.get(n, 0) + out_deg.get(n, 0)} for n in top],
        "liens_inverses": dict(sorted(inverse.items())),
    }, open(RANK, "w"), ensure_ascii=False, indent=2)

    print(f"fichiers={len(files)} liens={len(links)} problemes={len(problems)}")
    for p in problems:
        print("  -", p)


if __name__ == "__main__":
    main(sys.argv[1:])
