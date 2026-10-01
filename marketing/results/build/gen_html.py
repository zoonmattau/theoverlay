import json, base64, datetime as dt, html
from build import rows, result, TAG

def profit(x):
    res = result(x); p = float(x['market_price']); k = float(x['stake'])
    if res == 'Win': return (p - 1) * k if x['side'] == 'back' else k
    if res == 'Loss': return -k if x['side'] == 'back' else -(p - 1) * k
    if res == 'Void': return 0.0
    return None

def risk(x):
    if result(x) not in ('Win', 'Loss'): return 0.0
    k = float(x['stake']); return k if x['side'] == 'back' else (float(x['market_price']) - 1) * k

for x in rows:
    x['_res'] = result(x); x['_p'] = profit(x); x['_r'] = risk(x)
    x['_call'] = 'Bet' if x['side'] == 'back' else 'Lay'; x['_tag'] = TAG.get(x['tag'], x['tag'])

# The ledger's own units must agree with the formula the sheet uses.
for x in rows:
    if x['settled_at']: assert abs(x['_p'] - float(x['units'])) < 0.011, x

def stats(sub):
    c = lambda r: sum(1 for x in sub if x['_res'] == r)
    w, l = c('Win'), c('Loss'); p = sum(x['_p'] or 0 for x in sub); rk = sum(x['_r'] for x in sub)
    return dict(calls=len(sub), won=w, lost=l, void=c('Void'), pending=c('Pending'),
                strike=w / (w + l) if w + l else None, profit=p, risk=rk, roi=p / rk if rk else None)

def sgn(v, d=2): return f'{v:+.{d}f}' if abs(v) >= 0.005 else f'{0:.{d}f}'
def cls(v): return 'pos' if v > 0.005 else 'neg' if v < -0.005 else ''

def stat_table(groups, first='', fmt=lambda k: k):
    out = [f'<div class="scroll"><table class="stats"><thead><tr><th>{first}</th><th>Calls</th><th>Won</th><th>Lost</th><th>Void</th><th>Pending</th><th>Strike</th><th>Profit (u)</th><th>At risk (u)</th><th>ROI</th></tr></thead><tbody>']
    for k, sub in groups:
        s = stats(sub)
        out.append(f'<tr><th>{fmt(k)}</th><td>{s["calls"]}</td><td>{s["won"]}</td><td>{s["lost"]}</td><td>{s["void"]}</td><td>{s["pending"]}</td>'
                   f'<td>{"" if s["strike"] is None else f"{s["strike"]:.1%}"}</td><td class="{cls(s["profit"])}">{sgn(s["profit"])}</td>'
                   f'<td>{s["risk"]:.2f}</td><td class="{cls(s["roi"] or 0)}">{"" if s["roi"] is None else f"{s["roi"]*100:+.1f}%"}</td></tr>')
    out.append('</tbody></table></div>')
    return ''.join(out)

bets = [x for x in rows if x['side'] == 'back']; lays = [x for x in rows if x['side'] == 'lay']
S_all, S_b, S_l = stats(rows), stats(bets), stats(lays)
dates = sorted({x['date'] for x in rows})
d0, d1 = dt.date.fromisoformat(dates[0]), dt.date.fromisoformat(dates[-1])

tags = ['Prime', 'Bet', 'Way', 'Lay']
weeks = []
mon = d0 - dt.timedelta(days=d0.weekday())
while mon <= d1:
    weeks.append((mon, [x for x in rows if mon <= dt.date.fromisoformat(x['date']) < mon + dt.timedelta(days=7)]))
    mon += dt.timedelta(days=7)

# Daily running line
daily = []; run = 0.0
for d in dates:
    sub = [x for x in rows if x['date'] == d and x['_res'] != 'Pending']
    b = sum(x['_p'] for x in sub if x['side'] == 'back'); l = sum(x['_p'] for x in sub if x['side'] == 'lay')
    rb = sum(x['_p'] for x in sub if x['side'] == 'back')
    run += b + l
    daily.append((dt.date.fromisoformat(d), len(sub), b, l, b + l, run))

# Running lines for bets and lays separately too
rb = rl = 0.0; lines = []
for (d, n, b, l, t, r) in daily:
    rb += b; rl += l; lines.append((d, r, rb, rl))

W, H, PL, PR, PT, PB = 720, 260, 44, 64, 16, 28
vals = [v for _, a, b, c in lines for v in (a, b, c)] + [0]
lo, hi = min(vals), max(vals)
step = 10
lo = (int(lo // step)) * step; hi = (int(-(-hi // step))) * step
X = lambda i: PL + i * (W - PL - PR) / max(1, len(lines) - 1)
Y = lambda v: PT + (hi - v) * (H - PT - PB) / (hi - lo)
grid = ''.join(f'<line x1="{PL}" x2="{W-PR}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" class="{"zero" if v == 0 else "grid"}"/><text x="{PL-8}" y="{Y(v)+4:.1f}" class="axis" text-anchor="end">{v:+d}</text>'.replace('+0<', '0<') for v in range(lo, hi + 1, step))
xt = ''.join(f'<text x="{X(i):.1f}" y="{H-8}" class="axis" text-anchor="middle">{d.day} {d:%b}</text>' for i, (d, *_ ) in enumerate(lines) if i % 3 == 0 or i == len(lines) - 1)
def path(j, c):
    pts = ' '.join(f'{X(i):.1f},{Y(l[j]):.1f}' for i, l in enumerate(lines))
    e = lines[-1][j]
    return f'<polyline points="{pts}" class="{c}"/><circle cx="{X(len(lines)-1):.1f}" cy="{Y(e):.1f}" r="3.5" class="dot {c}"/><text x="{X(len(lines)-1)+8:.1f}" y="{Y(e)+4:.1f}" class="end {c}">{sgn(e,1)}</text>'
chart = f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Running profit in units by day">{grid}{xt}{path(2,"lb")}{path(3,"ll")}{path(1,"la")}</svg>'

def day_table():
    out = ['<div class="scroll"><table class="stats"><thead><tr><th>Date</th><th>Settled</th><th>Bets (u)</th><th>Lays (u)</th><th>Day (u)</th><th>Running (u)</th></tr></thead><tbody>']
    for d, n, b, l, t, r in daily:
        out.append(f'<tr><th>{d:%a} {d.day} {d:%b}</th><td>{n}</td><td class="{cls(b)}">{sgn(b)}</td><td class="{cls(l)}">{sgn(l)}</td><td class="{cls(t)}">{sgn(t)}</td><td class="{cls(r)}">{sgn(r)}</td></tr>')
    out.append('</tbody></table></div>')
    return ''.join(out)

def ledger(sub):
    out = ['<div class="scroll ledger"><table><thead><tr><th>Date</th><th>Track</th><th>R</th><th>No.</th><th>Horse</th><th>Call</th><th>Tag</th><th>Rated</th><th>Price</th><th>Edge</th><th>Stake</th><th>Finish</th><th>Result</th><th>Profit (u)</th></tr></thead><tbody>']
    for x in sub:
        d = dt.date.fromisoformat(x['date']); f = x['finish_position']
        fin = '' if f is None else ('Unpl' if f == 0 else f)
        p = x['_p']
        tagc = {'Prime': 'prime', 'Way': 'way', 'Lay': 'lay'}.get(x['_tag'], 'bet')
        out.append(f'<tr class="r-{x["_res"].lower()}"><td>{d.day} {d:%b}</td><td>{html.escape(x["track"])}</td><td>{x["race_number"]}</td><td>{x["tab_number"]}</td><td class="horse">{html.escape(x["horse_name"])}</td>'
                   f'<td>{x["_call"]}</td><td><span class="tag {tagc}">{x["_tag"]}</span></td><td>${float(x["rated_price"]):.2f}</td><td>${float(x["market_price"]):.2f}</td>'
                   f'<td>{"" if x["edge"] is None else f"{float(x["edge"]):.1%}"}</td><td>{float(x["stake"]):g}</td><td>{fin}</td><td><span class="res">{x["_res"]}</span></td>'
                   f'<td class="{cls(p or 0)}">{"" if p is None else sgn(p)}</td></tr>')
    out.append('</tbody></table></div>')
    return ''.join(out)

def sheet_head(s, label):
    return (f'<div class="sumline"><span><b>{s["calls"]}</b> {label}</span><span><b>{s["won"]}</b> won</span><span><b>{s["lost"]}</b> lost</span>'
            f'<span><b>{s["void"]}</b> void</span><span><b>{s["pending"]}</b> pending</span><span class="{cls(s["profit"])}"><b>{sgn(s["profit"])}u</b> profit</span>'
            f'<span><b>{s["roi"]*100:+.1f}%</b> ROI</span></div>')

xlsx = base64.b64encode(open('../Overlay results.xlsx', 'rb').read()).decode()
tpl = open('page.tpl.html', encoding='utf-8').read()
reps = {
    '{{PERIOD}}': f'{d0.day} {d0:%B} to {d1.day} {d1:%B %Y}',
    '{{ALL_P}}': sgn(S_all['profit'], 1), '{{ALL_C}}': cls(S_all['profit']),
    '{{B_P}}': sgn(S_b['profit'], 1), '{{B_C}}': cls(S_b['profit']), '{{B_ROI}}': f'{S_b["roi"]*100:+.1f}%', '{{B_N}}': str(S_b['won'] + S_b['lost']), '{{B_SR}}': f'{S_b["strike"]:.0%}',
    '{{L_P}}': sgn(S_l['profit'], 1), '{{L_C}}': cls(S_l['profit']), '{{L_ROI}}': f'{S_l["roi"]*100:+.1f}%', '{{L_N}}': str(S_l['won'] + S_l['lost']), '{{L_SR}}': f'{S_l["strike"]:.0%}',
    '{{N_ALL}}': str(S_all['won'] + S_all['lost']),
    '{{CHART}}': chart,
    '{{BY_CALL}}': stat_table([('All calls', rows), ('Bets', bets), ('Lays', lays)]),
    '{{BY_TAG}}': stat_table([(t, [x for x in rows if x['_tag'] == t]) for t in tags], 'Tag'),
    '{{BY_WEEK}}': stat_table(weeks, 'Week of', lambda m: f'{m.day} {m:%b}'),
    '{{BY_DAY}}': day_table(),
    '{{H_ALL}}': sheet_head(S_all, 'calls'), '{{H_B}}': sheet_head(S_b, 'bets'), '{{H_L}}': sheet_head(S_l, 'lays'),
    '{{T_ALL}}': ledger(rows), '{{T_B}}': ledger(bets), '{{T_L}}': ledger(lays),
    '{{N_ALL_ROWS}}': str(len(rows)), '{{N_B_ROWS}}': str(len(bets)), '{{N_L_ROWS}}': str(len(lays)),
    '{{XLSX}}': xlsx,
}
for k, v in reps.items(): tpl = tpl.replace(k, v)
open('../overlay-results.html', 'w', encoding='utf-8').write(tpl)
print('all', S_all, '\nbets', S_b, '\nlays', S_l)
print(len(tpl) // 1024, 'KB')
