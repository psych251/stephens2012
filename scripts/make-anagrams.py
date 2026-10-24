"""Build the backup anagram set for the Stephens et al. (2012) Study 3 replication.

Every solution word comes from Gilhooly (1978, Behavior Research Methods & Instrumentation,
10, 389-392), a list of 205 five-letter words with single-solution anagrams (originally from
Olson & Schwartz, 1967). BR is that paper's bigram-rank difficulty score (lower = easier;
list mean 52, SD 32), transcribed from its Appendix. Each word is also checked against the
macOS dictionary for other solutions. That dictionary lacks plurals and past tenses, so
those were checked by hand.

Scramble rules (bigram cues and starting letter predict difficulty; Gilhooly & Johnson, 1978):
no letter stays in its original position, the scramble does not start with the answer's
first letter, it keeps none of the answer's letter pairs, and it is not itself a word.

Run: python3 scripts/make-anagrams.py > materials/anagrams-backup.csv
     python3 scripts/make-anagrams.py --harder > materials/anagrams-harder.csv
     python3 scripts/make-anagrams.py --moderate > materials/anagrams-moderate.csv

--moderate: the current set with four easy words that every pilot participant solved swapped
for hard ones (PLANT -> ORBIT, TRUCK -> TEMPO, JUICE -> OPERA, MOUTH -> UNCLE): 4 easy (BR < 30),
8 medium (30-90) and 8 hard (> 90) items, mean BR 73 (current set: 56). Kept words keep their scrambles; the new words use the same
scrambles as in the --harder set.

--harder: a harder candidate set after the two pilots (6 completers solved 77% of the current
items, vs roughly 35-45% in the original). It keeps the 8 current words that pilot participants
found hard (solved by 4 or fewer of 6), with the same scrambles, and replaces the other 12 with
high-BR Gilhooly words. MEDAL was left out: "lamed" (past tense of lame) is a second answer.
"""
import csv
import itertools
import random
import sys
from collections import defaultdict

BR = {  # Gilhooly (1978), Appendix
    "world": 2, "woman": 12, "plant": 13, "truck": 16, "juice": 18, "lunch": 23,
    "mouth": 25, "glove": 27, "honey": 30, "judge": 44, "doubt": 47, "cabin": 62,
    "pilot": 74, "fruit": 75, "virus": 84, "lyric": 85, "tulip": 98,
    "knife": 112, "album": 120, "apron": 149,
    # spares
    "crumb": 28, "thumb": 33, "rhyme": 105, "venom": 114, "orbit": 124,
    # harder set (new words and its spares)
    "ankle": 129, "demon": 128, "input": 120, "hyena": 111, "tempo": 110, "opera": 98,
    "visor": 97, "uncle": 91, "entry": 91, "limbo": 96, "pylon": 104, "drawl": 87, "viper": 84,
    "craze": 82,
}
MAIN = ["world", "woman", "plant", "truck", "juice", "lunch", "mouth", "glove", "honey", "judge",
        "doubt", "cabin", "pilot", "fruit", "virus", "lyric", "tulip", "knife", "album", "apron"]
SPARES = ["crumb", "thumb", "rhyme", "venom", "orbit"]
HARDER_KEPT = ["world", "glove", "honey", "virus", "lyric", "knife", "album", "apron"]
HARDER_NEW = ["ankle", "demon", "orbit", "input", "venom", "hyena", "tempo", "rhyme",
              "opera", "visor", "uncle", "entry"]
HARDER_SPARES = ["limbo", "pylon", "drawl", "viper", "craze"]
MODERATE_SWAPS = {"plant": "orbit", "truck": "tempo", "juice": "opera", "mouth": "uncle"}

words = set()
for path in ["/usr/share/dict/web2", "/usr/share/dict/web2a"]:
    for w in open(path):
        w = w.strip().lower()
        if w.isalpha():
            words.add(w)  # proper nouns included: a scramble should not be any word or name
by_key = defaultdict(set)
for w in words:
    if len(w) == 5:
        by_key["".join(sorted(w))].add(w)


def bigrams(s):
    return {s[i:i + 2] for i in range(len(s) - 1)}


def ok(scr, sol):
    return (all(a != b for a, b in zip(scr, sol))
            and scr[0] != sol[0]
            and not (bigrams(scr) & bigrams(sol))
            and scr not in words and scr[:-1] not in words)


def build(groups, rng):
    rows = []
    for kind, lst in groups:
        for sol in lst:
            good = sorted({"".join(p) for p in itertools.permutations(sol) if ok("".join(p), sol)})
            rows.append(dict(set=kind, solution=sol, anagram=rng.choice(good).upper(), gilhooly_br=BR[sol],
                             other_solutions_in_dictionary=";".join(sorted(by_key["".join(sorted(sol))] - {sol})) or "none"))
    return rows


rows = build((("main", MAIN), ("spare", SPARES)), random.Random(2012))  # current set, unchanged
if "--moderate" in sys.argv:
    harder_new = {r["solution"]: r["anagram"] for r in
                  build((("main", HARDER_NEW), ("spare", HARDER_SPARES)), random.Random(2026))}
    out_rows = []
    for r in rows:
        if r["set"] != "main":
            continue
        w = MODERATE_SWAPS.get(r["solution"], r["solution"])
        out_rows.append(dict(set="main", solution=w,
                             anagram=r["anagram"] if w == r["solution"] else harder_new[w],
                             gilhooly_br=BR[w],
                             other_solutions_in_dictionary=";".join(sorted(by_key["".join(sorted(w))] - {w})) or "none",
                             source="kept" if w == r["solution"] else f"new (replaces {r['solution']})"))
    rows = sorted(out_rows, key=lambda r: r["gilhooly_br"]) + \
           [dict(r, source="spare") for r in rows if r["set"] == "spare" and r["solution"] not in MODERATE_SWAPS.values()]
elif "--harder" in sys.argv:
    current = {r["solution"]: r["anagram"] for r in rows}
    new = build((("main", HARDER_NEW), ("spare", HARDER_SPARES)), random.Random(2026))
    kept = [dict(set="main", solution=w, anagram=current[w], gilhooly_br=BR[w],
                 other_solutions_in_dictionary=";".join(sorted(by_key["".join(sorted(w))] - {w})) or "none")
            for w in HARDER_KEPT]
    for r in kept:
        r["source"] = "kept (hard in pilots)"
    for r in new:
        r["source"] = "new" if r["set"] == "main" else "spare"
    rows = sorted(kept + [r for r in new if r["set"] == "main"], key=lambda r: r["gilhooly_br"]) + \
           [r for r in new if r["set"] == "spare"]
out = csv.DictWriter(sys.stdout, fieldnames=list(rows[0]))
out.writeheader()
out.writerows(rows)
