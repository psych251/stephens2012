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
}
MAIN = ["world", "woman", "plant", "truck", "juice", "lunch", "mouth", "glove", "honey", "judge",
        "doubt", "cabin", "pilot", "fruit", "virus", "lyric", "tulip", "knife", "album", "apron"]
SPARES = ["crumb", "thumb", "rhyme", "venom", "orbit"]

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


rng = random.Random(2012)
rows = []
for kind, lst in (("main", MAIN), ("spare", SPARES)):
    for sol in lst:
        good = sorted({"".join(p) for p in itertools.permutations(sol) if ok("".join(p), sol)})
        rows.append(dict(set=kind, solution=sol, anagram=rng.choice(good).upper(), gilhooly_br=BR[sol],
                         other_solutions_in_dictionary=";".join(sorted(by_key["".join(sorted(sol))] - {sol})) or "none"))
out = csv.DictWriter(sys.stdout, fieldnames=list(rows[0]))
out.writeheader()
out.writerows(rows)
