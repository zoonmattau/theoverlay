# Cuts an episode's Instagram Reels (1080x1920) from <ep>/video/clips.json. Each clip: the stretches of
# episode/final-v3.wav, a hook banner for the first two seconds, the visuals (race page screenshots or the episode's
# stage cards) pushing in slowly and sliding in on cue, the reasons building up as they're said, who is talking,
# captions with the spoken word lit, a progress bar, and a low racecourse crowd under the voice.
# python -P marketing/podcast/video/clip.py marketing/podcast/ep1 [name]
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ep = sys.argv[1].rstrip("/")
only = sys.argv[2] if len(sys.argv) > 2 else None
FF = os.path.abspath("node_modules/ffmpeg-static/ffmpeg.exe")
FPS, R, W, H = 30, 48000, 1080, 1920
BOX = (1000, 730, 280)  # the visual's box: width, height, top
video = f"{ep}/video"
cfg = json.load(open(f"{video}/clips.json", encoding="utf-8"))
words = [(w["w"].strip(), w["s"], w["e"]) for r in json.load(open(f"{ep}/transcripts/v3-transcript.json", encoding="utf-8")) for w in r["words"]]
speakers = json.load(open(f"{ep}/build/v3-speakers.json"))
cues = json.load(open(f"{video}/cues-v3.json", encoding="utf-8"))["cues"]
crowd = "marketing/podcast/sfx/horse-race-crowd.mp3"
out_dir = f"{ep}/clips"
work = f"{out_dir}/_work"
os.makedirs(work, exist_ok=True)
page = Path("marketing/podcast/video/vertical.html").resolve().as_uri()
avatar = Path(f"{video}/stablemate.png").resolve().as_uri()
SMALL = {"the", "a", "an", "on", "with", "to", "of", "and", "in", "at", "for", "his", "is", "but", "or"}


def shoot(shots):
    """Draws vertical.html layers, [(png path, params)], in one page: window.draw swaps each in without a reload."""
    script = f"""
import {{ chromium }} from "playwright-core";
const shots = {json.dumps(shots)};
const b = await chromium.launch({{ channel: "chrome" }});
const p = await b.newPage({{ viewport: {{ width: {W}, height: {H} }} }});
await p.goto("{page}", {{ waitUntil: "networkidle" }});
await p.waitForFunction(() => document.body.dataset.ready === "1");
for (const [path, q] of shots) {{
  await p.evaluate((q) => window.draw(q), q);
  await p.screenshot({{ path, omitBackground: q.layer !== "base" }});
}}
await b.close();
"""
    Path(f"{work}/_shoot.mts").write_text(script, encoding="utf-8")
    subprocess.run(["npx.cmd" if os.name == "nt" else "npx", "tsx", f"{work}/_shoot.mts"], check=True)


def concat(path, pieces):
    with open(path, "w") as f:
        f.write("ffconcat version 1.0\n")
        for img, d in pieces:
            f.write(f"file '{Path(img).resolve().as_posix()}'\nduration {d:.3f}\n")
        f.write(f"file '{Path(pieces[-1][0]).resolve().as_posix()}'\n")


def size(png):
    out = subprocess.run([FF, "-hide_banner", "-i", png], capture_output=True, text=True).stderr
    w, h = re.search(r"(\d{2,5})x(\d{2,5})", out.split("Video:")[1]).groups()
    return int(w), int(h)


for clip in cfg["clips"]:
    if only and clip["name"] != only:
        continue
    name = clip["name"]
    for old in Path(work).glob("*.png"):
        old.unlink()
    # Snap each piece to whole words, so nothing starts or ends mid-word.
    pieces = []
    for a, b in clip["pieces"]:
        inside = []
        for w in (w for w in words if w[1] >= a - 0.3 and w[2] <= b + 0.3):
            # The transcriber hands "$1.65" over as "$1" and ".65": join a piece that starts with . or % to the one before.
            if inside and re.match(r"^[.%]\d|^%", w[0]):
                inside[-1] = (inside[-1][0] + w[0], inside[-1][1], w[2])
            else:
                inside.append(w)
        pieces.append((inside[0][1] - 0.12, inside[-1][2] + 0.18, inside))
    clock = lambda t: next(sum(p[1] - p[0] for p in pieces[:i]) + (t - pieces[i][0]) for i in range(len(pieces)) if pieces[i][0] <= t <= pieces[i][1] + 0.01)
    total = sum(b - a for a, b, _ in pieces)
    at_ = lambda t: clock(min(max(t, pieces[0][0]), pieces[-1][1]))

    shots = [[f"{work}/base.png", {"layer": "base", "cta": clip["cta"]}], [f"{work}/on-m.png", {"layer": "on-m"}],
             [f"{work}/on-a.png", {"layer": "on-a", "avatar": avatar}],
             [f"{work}/hook.png", {"layer": "hook", "a": clip["hook"][0], "b": clip["hook"][1], "tone": clip.get("tone", "")}]]
    # Captions: two to four words at a time, never ending on a small word; one picture per word, that word lit.
    caps, cur = [], []
    for a, b, inside in pieces:
        for w in inside:
            cur.append(w)
            small = w[0].lower().strip(".,?!") in SMALL
            if not small and (len(cur) >= 4 or (len(cur) >= 2 and w[0][-1:] in ".,?!") or sum(len(x[0]) + 1 for x in cur) > 20) or len(cur) >= 6:
                caps.append(cur); cur = []
        if cur:
            caps.append(cur); cur = []
    capframes = []
    for i, c in enumerate(caps):
        text = " ".join(x[0] for x in c).rstrip(",")
        for j, w in enumerate(c):
            path = f"{work}/cap-{i:03d}-{j}.png"
            shots.append([path, {"layer": "cap", "t": text, "on": str(j)}])
            capframes.append((clock(w[1]), path))
    # The reasons: the title, then each row twice (lit while it's the newest, plain after).
    why = clip["why"]
    items = "|".join(x["text"] for x in why["items"])
    shots.append([f"{work}/why-0.png", {"layer": "why", "k": why["title"], "tone": why.get("tone", ""), "items": items, "row": "0"}])
    for k in range(1, len(why["items"]) + 1):
        for lit in ("1", "0"):
            shots.append([f"{work}/why-{k}-{lit}.png", {"layer": "why", "k": why["title"], "tone": why.get("tone", ""), "items": items, "row": str(k), "new": lit}])
    # Play cards are drawn for the phone (vertical.html's play layer), not cut down from the episode's 16:9 card.
    for k, c in enumerate(clip["cards"]):
        for layer in ("play", "stat"):
            if c.get(layer):
                shots.append([f"{work}/play-{k}.png", {"layer": layer, **c[layer]}])
    shoot(shots)
    clear = f"{work}/clear.png"
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black@0:s={W}x{H},format=rgba", "-frames:v", "1", clear], check=True)

    # Tracks that simply cut: captions (word to word) and who is talking.
    track = ([(clear, capframes[0][0])] if capframes[0][0] > 0.01 else []) + [(p, (capframes[i + 1][0] if i + 1 < len(capframes) else total) - t) for i, (t, p) in enumerate(capframes)]
    concat(f"{work}/caps.txt", [x for x in track if x[1] > 0.005])
    who, at = [], 0.0
    for a, b, _ in pieces:
        for s in speakers:
            lo, hi = max(a, s["start"]), min(b, s["end"])
            if hi > lo:
                lo, hi = clock(lo), clock(hi)
                if lo > at:
                    who.append((clear, lo - at))
                who.append((f"{work}/on-{s['who'].lower()}.png", hi - max(lo, at)))
                at = hi
    if at < total:
        who.append((clear, total - at))
    concat(f"{work}/who.txt", [x for x in who if x[1] > 0.01])

    # Layers that move: (png, start, end, x0, y0, slide px, push-in) overlaid in order.
    moving = []
    vis = []
    for k, c in enumerate(clip["cards"]):
        img = f"{work}/vis-{k}.png"
        fit = f"scale={BOX[0]}:{BOX[1]}:force_original_aspect_ratio=decrease"
        if c.get("play") or c.get("stat"):
            subprocess.run([FF, "-v", "error", "-y", "-i", f"{work}/play-{k}.png", "-vf", f"crop={BOX[0]}:{BOX[1]}:40:{BOX[2]}", img], check=True)
        elif c.get("shot"):
            # "crop": [x0, y0, x1, y1] as fractions zooms in on the part that matters (a speed map's front half).
            x0, y0, x1, y1 = c.get("crop", [0, 0, 1, 1])
            cut = f"crop=iw*{x1 - x0}:ih*{y1 - y0}:iw*{x0}:ih*{y0}," if c.get("crop") else ""
            subprocess.run([FF, "-v", "error", "-y", "-i", f"{video}/{c['shot']}", "-vf", cut + fit, img], check=True)
        else:
            n = next(i for i, q in enumerate(cues) if c["card"] in (q.get("t"), q.get("k")))
            subprocess.run([FF, "-v", "error", "-y", "-i", f"{video}/layers/base.png", "-i", f"{video}/layers/stage-{n:02d}.png",
                            "-filter_complex", f"[0][1]overlay,crop=1760:590:80:140,{fit}", img], check=True)
        vis.append((at_(c["at"]), img))
    for k, (t, img) in enumerate(vis):
        w, h = size(img)
        end = vis[k + 1][0] if k + 1 < len(vis) else total
        moving.append((img, t, end, (W - w) // 2, BOX[2] + (BOX[1] - h) // 2, 90, True))
    moving.append((f"{work}/hook.png", 0.0, 2.3, 0, 0, -160, False))
    rows = [at_(x["at"]) for x in why["items"]]
    if rows:
        moving.append((f"{work}/why-0.png", rows[0], total, 0, 0, 0, False))
    for k, t in enumerate(rows, 1):
        nxt = rows[k] if k < len(rows) else total
        moving.append((f"{work}/why-{k}-1.png", t, nxt, 0, 0, -70, False))
        if nxt < total:
            moving.append((f"{work}/why-{k}-0.png", nxt, total, 0, 0, 0, False))

    # The graph: audio (voice pieces plus a low crowd), base, then every moving layer, captions, who, progress bar.
    inputs = ["-i", f"{ep}/episode/final-v3.wav", "-stream_loop", "-1", "-i", crowd,
              "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", f"{work}/base.png",
              "-f", "concat", "-safe", "0", "-i", f"{work}/caps.txt", "-f", "concat", "-safe", "0", "-i", f"{work}/who.txt",
              "-f", "lavfi", "-i", f"color=c=0xc6f24e:s={W}x10:r={FPS}:d={total:.3f}"]
    graph = [";".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st={b - a - 0.015:.3f}:d=0.015[p{i}]" for i, (a, b, _) in enumerate(pieces)),
             "".join(f"[p{i}]" for i in range(len(pieces))) + f"concat=n={len(pieces)}:v=0:a=1[voice]",
             f"[1:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume=0.07,afade=t=in:d=1,afade=t=out:st={total - 1.5:.3f}:d=1.5[bed]",
             "[voice][bed]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aud]"]
    last = "2:v"
    for n, (img, a, b, x0, y0, slide, push) in enumerate(moving):
        k = 6 + n
        inputs += ["-itsoffset", f"{a:.3f}", "-loop", "1", "-framerate", str(FPS), "-t", f"{b - a:.3f}", "-i", img]
        chain = f"[{k}:v]format=rgba"
        if push:
            # A slow push-in across the visual's time on screen, 1.00 to 1.05.
            w, h = size(img)
            frames = max(2, int((b - a) * FPS))
            chain += f",zoompan=z='1+0.05*on/{frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS},setpts=PTS+{a:.3f}/TB,format=rgba"
        chain += f",fade=t=in:st={a:.3f}:d=0.22:alpha=1"
        if b < total - 0.05 and not push:
            chain += f",fade=t=out:st={max(a, b - 0.2):.3f}:d=0.2:alpha=1"
        graph.append(chain + f"[m{n}]")
        x = f"{x0}+{slide}*max(0\\,1-(t-{a:.3f})/0.25)" if slide else str(x0)
        graph.append(f"[{last}][m{n}]overlay=x='{x}':y={y0}:eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[s{n}]")
        last = f"s{n}"
    graph.append(f"[{last}][3:v]overlay=format=auto[c1]")
    graph.append("[c1][4:v]overlay=format=auto[c2]")
    graph.append(f"[c2][5:v]overlay=x='-{W}+{W}*t/{total:.3f}':y=0,format=yuv420p[v]")
    Path(f"{work}/graph.txt").write_text(";\n".join(graph), encoding="utf-8")
    out = f"{out_dir}/{name}.mp4"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex_script", f"{work}/graph.txt",
                    "-map", "[v]", "-map", "[aud]", "-r", str(FPS), "-t", f"{total:.3f}",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", str(R), out], check=True)
    print(f"{out}: {total:.1f}s, {len(caps)} captions, {len(vis)} visuals, {len(why['items'])} reasons")
