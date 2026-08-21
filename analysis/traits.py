import json, sys, numpy as np, pandas as pd
pd.set_option('display.width', 200)


def _rank(v):
    import numpy as np
    order = np.argsort(np.argsort(v, kind="mergesort"), kind="mergesort").astype(float)
    # average ties
    out = order.copy()
    s = np.sort(v)
    for val in set(v.tolist()):
        idx = np.where(v == val)[0]
        if len(idx) > 1: out[idx] = out[idx].mean()
    return out

def spearman_perm(x, y, iters=20000, seed=0):
    """Spearman rho + two-sided permutation p-value. n is tiny, so permute."""
    import numpy as np
    rng = np.random.default_rng(seed)
    rx, ry = _rank(np.asarray(x, float)), _rank(np.asarray(y, float))
    def r(a, b):
        a = a - a.mean(); b = b - b.mean()
        d = np.sqrt((a*a).sum() * (b*b).sum())
        return float((a*b).sum()/d) if d else 0.0
    obs = r(rx, ry)
    null = np.array([r(rx, rng.permutation(ry)) for _ in range(iters)])
    return obs, float((np.abs(null) >= abs(obs) - 1e-12).mean())

df = pd.DataFrame(json.load(open(sys.argv[1])))
BUDGET = 200
SKILL = ["QB", "RB", "WR", "TE"]

# ---- Phase 1: market curve, fit PER YEAR on contested skill-position buys ----
df["expected"] = np.nan
fits = {}
for y, g in df.groupby("year"):
    m = (~g.is_keeper) & (g.price >= 2) & g.fi_overall.notna() & g.pos.isin(SKILL)
    x = np.log(g.loc[m, "fi_overall"].astype(float)); yv = np.log(g.loc[m, "price"].astype(float))
    b, a = np.polyfit(x, yv, 1)
    fits[y] = (a, b, m.sum())
    idx = g.index[g.fi_overall.notna() & g.pos.isin(SKILL)]
    df.loc[idx, "expected"] = np.exp(a + b*np.log(df.loc[idx, "fi_overall"].astype(float)))
df["ratio"] = df.price / df.expected

# residual sample = contested, non-keeper, skill only
res = df[(~df.is_keeper) & (df.price >= 2) & df.ratio.notna()].copy()
res["lr"] = np.log(res.ratio)

# ---- owner identity ----
own = df.groupby("owner").agg(years=("year", "nunique")).reset_index()
label = {}
for o, g in df.groupby("owner"):
    last = g[g.year == g.year.max()].iloc[0]
    label[o] = f"{last.abbrev} · {last.team_name}"[:34]

# ---- Phase 2: traits per manager-year ----
rows = []
for (y, o), g in df.groupby(["year", "owner"]):
    tid = g.team_id.iloc[0]
    tot = g.price.sum()
    nk = g[~g.is_keeper]
    r = res[(res.year == y) & (res.owner == o)]
    noms = df[(df.year == y) & (df.nominating_team == tid)]
    big = g.nlargest(3, "price").price.sum()
    # pacing: share of own budget committed by overall pick 60
    early = g[g.overall_pick <= 60].price.sum()
    rows.append(dict(
        year=y, owner=o, team=label[o],
        spend_QB=g[g.pos == "QB"].price.sum(), spend_RB=g[g.pos == "RB"].price.sum(),
        spend_WR=g[g.pos == "WR"].price.sum(), spend_TE=g[g.pos == "TE"].price.sum(),
        aggression=np.exp(r.lr.median()) if len(r) >= 4 else np.nan,
        n_contested=len(r),
        top3_share=big/BUDGET, early_share=early/BUDGET,
        dollar_pct=(nk.price == 1).mean(), keepers=int(g.is_keeper.sum()),
        nom_n=len(noms), nom_win=(noms.team_id == tid).mean() if len(noms) else np.nan,
    ))
T = pd.DataFrame(rows)
for p in SKILL: T[f"share_{p}"] = T[f"spend_{p}"]/BUDGET

print("=== market curve (fit per year, non-keeper, price>=2, QB/RB/WR/TE) ===")
for y,(a,b,n) in fits.items():
    print(f"  {y}: expected$ = exp({a:.3f} {b:+.3f}*ln(FIrank))   n={n}")
print("  K and D/ST excluded — FI gives them no overall rank and they are forced ~$1-3 buys.\n")

# ---- Phase 3: stability gate, 2024 -> 2025 ----
NEW_OWNER = df.groupby("owner").year.nunique()
both = [o for o in T.owner.unique() if NEW_OWNER[o] == 2]
print(f"=== stability gate: {len(both)} managers with both years "
      f"({len(T.owner.unique())-len(both)} excluded — appears in only one year) ===\n")

TRAITS = ["share_RB","share_WR","share_QB","share_TE","aggression","top3_share",
          "early_share","dollar_pct","keepers","nom_win"]
a = T[(T.year==2024) & T.owner.isin(both)].set_index("owner")
b = T[(T.year==2025) & T.owner.isin(both)].set_index("owner").loc[a.index]
out=[]
for t in TRAITS:
    x, y = a[t].astype(float), b[t].astype(float)
    ok = x.notna() & y.notna()
    if ok.sum() < 6: out.append((t, ok.sum(), np.nan, np.nan, np.nan)); continue
    rho, p = spearman_perm(x[ok].values, y[ok].values)
    out.append((t, ok.sum(), rho, p, y[ok].std()))
S = pd.DataFrame(out, columns=["trait","n","spearman_rho","p_value","sd_2025"]).sort_values("spearman_rho", ascending=False)
S["verdict"] = np.where(S.p_value < .05, "SURVIVES", np.where(S.p_value < .20, "weak/unclear", "no signal"))
print(S.to_string(index=False, float_format=lambda v: f"{v:.3f}"))

T.to_json(sys.argv[2], orient="records")
print("\n=== per-manager traits (both years) ===")
show = T[T.owner.isin(both)].sort_values(["team","year"])
cols=["team","year","share_RB","share_WR","share_QB","share_TE","aggression","n_contested","top3_share","dollar_pct","keepers","nom_win"]
print(show[cols].to_string(index=False, float_format=lambda v: f"{v:.2f}"))
