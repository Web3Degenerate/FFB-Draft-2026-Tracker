import json, numpy as np, pandas as pd, sys
df = pd.DataFrame(json.load(open(sys.argv[1])))
print("rows", len(df), "| years", sorted(df.year.unique()))
print("\n=== price distribution by year (all picks) ===")
print(df.groupby('year').price.describe()[['count','mean','50%','max']].round(1))
print("\n=== keeper vs auction ===")
print(df.groupby(['year','is_keeper']).price.agg(['count','sum','mean']).round(1))
print("\n=== $1 mass among non-keeper picks ===")
nk = df[~df.is_keeper]
for y,g in nk.groupby('year'):
    print(f"  {y}: n={len(g)}  price==1: {(g.price==1).sum()} ({100*(g.price==1).mean():.0f}%)  price>=2: {(g.price>=2).sum()}")
print("\n=== shape check: log(price) vs log(fi_overall), non-keeper price>=2 ===")
fit = nk[(nk.price>=2) & nk.fi_overall.notna()].copy()
for y,g in fit.groupby('year'):
    x=np.log(g.fi_overall.astype(float)); yv=np.log(g.price.astype(float))
    b,a=np.polyfit(x,yv,1); pred=a+b*x
    r2=1-((yv-pred)**2).sum()/((yv-yv.mean())**2).sum()
    print(f"  {y}: n={len(g)}  log(price) = {a:.2f} {b:+.3f}*log(rank)   R2={r2:.3f}")
print("\n=== does position add anything? (pooled, with year + position dummies) ===")
g=fit.copy()
X=[np.ones(len(g)), np.log(g.fi_overall.astype(float))]
names=['const','log_rank']
for y in sorted(g.year.unique())[1:]:
    X.append((g.year==y).astype(float).values); names.append(f'year_{y}')
for p in sorted(g.pos.dropna().unique())[1:]:
    X.append((g.pos==p).astype(float).values); names.append(f'pos_{p}')
X=np.column_stack(X); yv=np.log(g.price.astype(float)).values
beta,*_=np.linalg.lstsq(X,yv,rcond=None); pred=X@beta
r2=1-((yv-pred)**2).sum()/((yv-yv.mean())**2).sum()
print("  R2 =",round(r2,3))
for n,b in zip(names,beta): print(f"    {n:12s} {b:+.3f}")
