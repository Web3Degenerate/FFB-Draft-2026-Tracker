"""Model B + PAVA isotonic blend -> 2026 expected prices."""
import json, sys, numpy as np, pandas as pd
CODEX="/Users/orchestrator/Documents/FFB/FFB-2026-Codex-Version"
SKILL=["QB","RB","WR","TE"]

df=pd.DataFrame(json.load(open(sys.argv[1])))
m=(~df.is_keeper)&(df.price>=2)&df.fi_posrank.notna()&df.pos.isin(SKILL)
g=df[m].copy()

# ---- Model B: shared slope, per-position intercept ----
X=[np.log(g.fi_posrank.astype(float)).values]
for p in SKILL: X.append((g.pos==p).astype(float).values)
X=np.column_stack(X); yv=np.log(g.price.astype(float)).values
beta,*_=np.linalg.lstsq(X,yv,rcond=None)
slope=beta[0]; ints=dict(zip(SKILL,beta[1:]))
def model_b(pos,r): return float(np.exp(ints[pos]+slope*np.log(r)))

# ---- PAVA isotonic (decreasing) on observed data, per position ----
def pava_decreasing(x,y,w):
    """Pool-adjacent-violators for a non-increasing fit, x sorted ascending."""
    vals=list(y); wts=list(w); idx=[[i] for i in range(len(y))]
    i=0
    while i < len(vals)-1:
        if vals[i] < vals[i+1] - 1e-12:      # violation of non-increasing
            tw=wts[i]+wts[i+1]
            vals[i]=(vals[i]*wts[i]+vals[i+1]*wts[i+1])/tw
            wts[i]=tw; idx[i]=idx[i]+idx[i+1]
            del vals[i+1]; del wts[i+1]; del idx[i+1]
            if i>0: i-=1
        else: i+=1
    out=np.empty(len(y))
    for v,ii in zip(vals,idx): out[list(ii)]=v
    return out

iso={}
for p in SKILL:
    gp=g[g.pos==p].groupby('fi_posrank').price.agg(['mean','size']).reset_index().sort_values('fi_posrank')
    fit=pava_decreasing(gp.fi_posrank.values, gp['mean'].values, gp['size'].values.astype(float))
    iso[p]=(gp.fi_posrank.values, fit)

def iso_pred(pos,r):
    xs,ys=iso[pos]
    return float(np.interp(r, xs, ys))   # flat outside observed range

CAP={p: float(g[g.pos==p].price.max()) for p in SKILL}

print("=== Model B coefficients ===")
print(f"  shared slope on ln(positional rank): {slope:+.3f}")
for p in SKILL: print(f"  intercept {p}: {ints[p]:+.3f}   observed max price ${CAP[p]:.0f}")

print("\n=== where the log-linear model breaks: predicted vs actual at the top ===")
print(f"{'pos':4s} {'rank':>4s} {'modelB':>8s} {'isotonic':>9s} {'actual(mean)':>13s} {'n':>3s}")
for p in SKILL:
    gp=g[g.pos==p].groupby('fi_posrank').price.agg(['mean','size']).reset_index().sort_values('fi_posrank')
    for _,r in gp.head(4).iterrows():
        print(f"{p:4s} {int(r.fi_posrank):4d} {model_b(p,r.fi_posrank):8.0f} {iso_pred(p,r.fi_posrank):9.0f} {r['mean']:13.0f} {int(r['size']):3d}")

# ---- out-of-sample: fit 2024, predict 2025, both methods ----
print("\n=== out-of-sample (fit 2024 -> predict 2025) ===")
tr=g[g.year==2024]; te=g[g.year==2025]
Xt=[np.log(tr.fi_posrank.astype(float)).values]
for p in SKILL: Xt.append((tr.pos==p).astype(float).values)
bt,*_=np.linalg.lstsq(np.column_stack(Xt),np.log(tr.price.astype(float)).values,rcond=None)
st=bt[0]; it=dict(zip(SKILL,bt[1:]))
iso_t={}
for p in SKILL:
    gp=tr[tr.pos==p].groupby('fi_posrank').price.agg(['mean','size']).reset_index().sort_values('fi_posrank')
    iso_t[p]=(gp.fi_posrank.values, pava_decreasing(gp.fi_posrank.values,gp['mean'].values,gp['size'].values.astype(float)))
capt={p: float(tr[tr.pos==p].price.max()) for p in SKILL}
pb=[];pi=[]
for _,r in te.iterrows():
    pb.append(min(np.exp(it[r.pos]+st*np.log(r.fi_posrank)), capt[r.pos]))
    xs,ys=iso_t[r.pos]; pi.append(float(np.interp(r.fi_posrank,xs,ys)))
for nm,pred in (("Model B (capped)",np.array(pb)),("Isotonic",np.array(pi))):
    e=np.abs(pred-te.price.values)/te.price.values
    print(f"  {nm:18s} median abs err {100*np.median(e):5.1f}%   within +/-50%: {100*(e<=.5).mean():.0f}%   total$ {pred.sum():.0f} vs {te.price.sum():.0f}")

json.dump(dict(slope=slope,ints=ints,cap=CAP,
               iso={p:[list(map(float,iso[p][0])),list(map(float,iso[p][1]))] for p in SKILL}),
          open(sys.argv[2],"w"))
