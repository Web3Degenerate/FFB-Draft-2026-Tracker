"""Phase 0: build one tidy pick table from ESPN draft detail + FI rankings."""
import json, glob, re, unicodedata, sys, os
from collections import defaultdict

ROOT = "/Users/orchestrator/Documents/FFB/FFB-2026-Model"
CODEX = "/Users/orchestrator/Documents/FFB/FFB-2026-Codex-Version"
YEARS = [2024, 2025]

ESPN_POS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST"}
FI_POS = {"QB": "QB", "RB": "RB", "WR": "WR", "TE": "TE", "PK": "K", "ST": "DST"}

CITY_TO_NICK = {
    "arizona": "cardinals", "atlanta": "falcons", "baltimore": "ravens", "buffalo": "bills",
    "carolina": "panthers", "chicago": "bears", "cincinnati": "bengals", "cleveland": "browns",
    "dallas": "cowboys", "denver": "broncos", "detroit": "lions", "green bay": "packers",
    "houston": "texans", "indianapolis": "colts", "jacksonville": "jaguars", "kansas city": "chiefs",
    "las vegas": "raiders", "la chargers": "chargers", "la rams": "rams", "miami": "dolphins",
    "minnesota": "vikings", "new england": "patriots", "new orleans": "saints",
    "ny giants": "giants", "ny jets": "jets", "philadelphia": "eagles", "pittsburgh": "steelers",
    "san francisco": "ers", "seattle": "seahawks", "tampa bay": "buccaneers",
    "tennessee": "titans", "washington": "commanders",
}
ALIAS = {"hollywood brown": "marquise brown", "chigoziem okonkwo": "chig okonkwo"}

SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b\.?", re.I)
def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode()
    s = s.lower().replace("&", "and")
    s = SUFFIX.sub(" ", s)
    s = re.sub(r"[^a-z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

# ---- FI history -------------------------------------------------------------
fi_raw = json.load(open(f"{CODEX}/data/fantasy-index-history.json"))
fi = {}
for season in fi_raw["seasons"]:
    y = season["year"]
    fi[y] = {}
    for r in season["rankings"]:
        pos = FI_POS[r["position"]]
        key = norm(r["name"])
        fi[y][key] = dict(overall=r["overallRank"], posrank=r["positionalRank"],
                          pos=pos, pts=r["projectedPoints"], name=r["name"])
    # FI names D/ST by city ("Denver"); ESPN by nickname ("Broncos D/ST").
    for r in season["rankings"]:
        if FI_POS[r["position"]] == "DST":
            nick = CITY_TO_NICK.get(norm(r["name"]))
            if nick:
                fi[y].setdefault(nick, fi[y][norm(r["name"])])
    # squashed-space fallback: "DeVon Achane" vs "De'Von Achane"
    for k in list(fi[y]):
        fi[y].setdefault(k.replace(" ", ""), fi[y][k])

# ---- ESPN player directory --------------------------------------------------
def espn_players(year):
    out = {}
    for f in glob.glob(f"{ROOT}/data/raw/espn/{year}/kona_player_info_*.json"):
        d = json.load(open(f))
        for entry in (d.get("players") or []):
            p = entry.get("player", entry)
            if not p.get("id"): continue
            out[p["id"]] = dict(name=p.get("fullName", ""),
                                pos=ESPN_POS.get(p.get("defaultPositionId")),
                                proTeam=p.get("proTeamId"))
    return out

# ---- owners -----------------------------------------------------------------
def owners(year):
    t = json.load(open(f"{ROOT}/data/raw/espn/{year}/mTeam.json"))
    out = {}
    for tm in t.get("teams", []):
        o = tm.get("owners") or []
        name = tm.get("name") or f"{tm.get('location','')} {tm.get('nickname','')}".strip()
        out[tm["id"]] = dict(guid=(o[0] if o else None), name=name, abbrev=tm.get("abbrev", ""))
    return out

# ---- settings ---------------------------------------------------------------
def settings(year):
    s = json.load(open(f"{ROOT}/data/raw/espn/{year}/mSettings.json"))
    st = s.get("settings", s)
    dr = st.get("draftSettings", {})
    rs = st.get("rosterSettings", {})
    return dict(budget=dr.get("auctionBudget"),
                lineup=rs.get("lineupSlotCounts"),
                scoring_id=st.get("scoringSettings", {}).get("scoringType"))

rows, diag = [], {}
for y in YEARS:
    pl = espn_players(y); ow = owners(y)
    picks = json.load(open(f"{ROOT}/data/raw/espn/{y}/mDraftDetail.json"))
    picks = picks.get("draftDetail", picks).get("picks", [])
    spent = defaultdict(int); count = defaultdict(int)
    matched = unmatched = 0; miss = []
    for p in sorted(picks, key=lambda x: x["overallPickNumber"]):
        tid = p["teamId"]; info = pl.get(p["playerId"], {})
        nm = info.get("name", f"#{p['playerId']}")
        key = norm(nm)
        key = ALIAS.get(key, key)
        if key.endswith(" d st"): key = key[:-5].split()[-1]
        f = fi[y].get(key) or fi[y].get(key.replace(" ", ""))
        if f: matched += 1
        else:
            unmatched += 1
            miss.append((nm, info.get("pos")))
        spent[tid] += p["bidAmount"]; count[tid] += 1
        rows.append(dict(
            year=y, team_id=tid, owner=(ow.get(tid) or {}).get("guid"),
            team_name=(ow.get(tid) or {}).get("name"), abbrev=(ow.get(tid) or {}).get("abbrev"),
            overall_pick=p["overallPickNumber"], nominating_team=p.get("nominatingTeamId"),
            player_id=p["playerId"], player=nm,
            pos=info.get("pos") or (f or {}).get("pos"),
            is_keeper=bool(p.get("keeper")), price=p["bidAmount"],
            fi_overall=(f or {}).get("overall"), fi_posrank=(f or {}).get("posrank"),
            fi_pts=(f or {}).get("pts"),
            spent_before=spent[tid] - p["bidAmount"], slots_after=14 - count[tid],
        ))
    diag[y] = dict(picks=len(picks), matched=matched, unmatched=unmatched,
                   miss=miss, settings=settings(y))

os.makedirs(os.path.dirname(sys.argv[1]), exist_ok=True)
json.dump(rows, open(sys.argv[1], "w"))

for y in YEARS:
    d = diag[y]
    rate = 100 * d["matched"] / d["picks"]
    print(f"=== {y}: {d['picks']} picks | FI matched {d['matched']} ({rate:.1f}%) | unmatched {d['unmatched']}")
    print(f"    settings: budget={d['settings']['budget']} scoringType={d['settings']['scoring_id']}")
    print(f"    lineup: {d['settings']['lineup']}")
    bypos = defaultdict(int)
    for nm, pos in d["miss"]: bypos[pos] += 1
    print(f"    unmatched by pos: {dict(bypos)}")
    print(f"    unmatched sample: {[m[0] for m in d['miss'][:14]]}")
    print()
