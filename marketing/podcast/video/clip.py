# Cuts an episode's Instagram Reels (1080x1920) from <ep>/video/clips.json. Each clip: the stretches of
# episode/final-v3.wav, a hook for the first two seconds, then one beat per point being made: the point as a headline
# (the claim) over its proof, a phone-width shot of the real site with the thing ringed (proof-shots.mjs makes them),
# which slides in and pushes in slowly. Under it the words as spoken, a phrase at a time, then a call to action.
# python -P marketing/podcast/video/clip.py marketing/podcast/ep1 [name]
#
# clips.json: { "clips": [{ "name", "pieces": [[start, end] on the v3 timeline], "hook": [small, big], "tone",
#   "beats": [{ "at", "k" (kicker), "t" (claim, *word* lit), "tone"?, "shot" (relative to video/), "crop"?: [x0,y0,x1,y1] }],
#   "cta" }] }
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
PROOF = (1000, 760, 540)  # the proof's box: max width, max height, top
TAIL = 2.2  # the call to action holds this long after the last word
video = f"{ep}/video"
cfg = json.load(open(f"{video}/clips.json", encoding="utf-8"))
words = [(w["w"].strip(), w["s"], w["e"]) for r in json.load(open(f"{ep}/transcripts/v3-transcript.json", encoding="utf-8")) for w in r["words"]]
speakers = json.load(open(f"{ep}/build/v3-speakers.json"))
crowd = "marketing/podcast/sfx/horse-race-crowd.mp3"
out_dir = f"{ep}/clips"
work = f"{out_dir}/_work"
os.makedirs(work, exist_ok=True)
page = Path("marketing/podcast/video/vertical.html").resolve().as_uri()
avatar = Path(f"{video}/stablemate.png").resolve().as_uri()
SMALL = {"the", "a", "an", "on", "with", "to", "of", "and", "in", "at", "for", "his", "is", "but", "or", "i", "he's", "that", "we", "you", "he", "by", "from", "as", "if", "you're", "it's", "there's", "i've", "that's", "we're", "be", "was", "really"}


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


def phrases(pieces):
    """The captions: sentence by sentence (never across a cut). A sentence up to 40 letters is one caption; a longer
    one is cut into even parts of about 36 letters, each cut moved to a comma nearby and never left on a small word."""
    caps = []
    for _, _, inside in pieces:
        sentences, cur = [], []
        for w in inside:
            cur.append(w)
            if w[0][-1:] in ".?!":
                sentences.append(cur)
                cur = []
        if cur:
            sentences.append(cur)
        for sen in sentences:
            length = lambda ws: len(" ".join(x[0] for x in ws))
            if length(sen) <= 40 or len(sen) <= 3:
                caps.append(sen)
                continue
            n = -(-length(sen) // 36)
            target = length(sen) / n
            cuts, run = [], 0
            for i, w in enumerate(sen[:-1]):
                run += len(w[0]) + 1
                if run >= target * (len(cuts) + 1) and len(cuts) < n - 1:
                    cuts.append(i + 1)
            fixed = []
            for c in cuts:
                # A comma within two words wins; then step back off a small word.
                near = [j for j in range(max(1, c - 2), min(len(sen) - 1, c + 2) + 1) if sen[j - 1][0].endswith(",")]
                if near:
                    c = min(near, key=lambda j: abs(j - c))
                while c > 1 and sen[c - 1][0].lower().strip(".,?!") in SMALL:
                    c -= 1
                if (not fixed or c > fixed[-1] + 1) and c < len(sen):
                    fixed.append(c)
            prev = 0
            for c in fixed + [len(sen)]:
                if c > prev:
                    caps.append(sen[prev:c])
                prev = c
    return caps


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
        for w in (w for w in words if a - 0.05 <= w[1] <= b):
            # The transcriber hands "$1.65" over as "$1" and ".65", "one-size" as "one" "-size": join them back up.
            if inside and re.match(r"^[.%]\d|^%|^-\w", w[0]):
                inside[-1] = (inside[-1][0] + w[0], inside[-1][1], w[2])
            else:
                inside.append(w)
        # The tail stops short of the next word, so a cut word ("on the Betfair...") isn't half heard.
        after = next((w[1] for w in words if w[1] >= inside[-1][2] and w[1] > inside[-1][1]), inside[-1][2] + 1)
        pieces.append((inside[0][1] - 0.12, min(inside[-1][2] + 0.18, after - 0.02), inside))
    clock = lambda t: next(sum(p[1] - p[0] for p in pieces[:i]) + (t - pieces[i][0]) for i in range(len(pieces)) if pieces[i][0] <= t <= pieces[i][1] + 0.01)
    speech = sum(b - a for a, b, _ in pieces)
    total = speech + TAIL
    at_ = lambda t: clock(min(max(t, pieces[0][0]), pieces[-1][1]))
    tone = clip.get("tone", "")

    shots = [[f"{work}/base.png", {"layer": "base"}], [f"{work}/on-m.png", {"layer": "on-m"}],
             [f"{work}/on-a.png", {"layer": "on-a", "avatar": avatar}],
             [f"{work}/hook.png", {"layer": "hook", "a": clip["hook"][0], "b": clip["hook"][1], "tone": tone, "long": "1" if len(clip["hook"][1]) > 12 else ""}],
             [f"{work}/end.png", {"layer": "end", "t": clip["cta"], "tone": tone}]]
    caps = phrases(pieces)
    capframes = []
    for i, c in enumerate(caps):
        text = " ".join(x[0] for x in c).rstrip(",")
        # "fix": [[heard, said]] puts mishearings right (Bodmin Moore, Saitley Dancer), word for word.
        for heard, said in clip.get("fix", []):
            fixed = text.replace(heard, said)
            if len(fixed.split(" ")) == len(text.split(" ")):
                text = fixed
            elif heard in text:
                print("   fix changes the word count, skipped:", heard)
        for j, w in enumerate(c):
            path = f"{work}/cap-{i:03d}-{j}.png"
            shots.append([path, {"layer": "cap", "t": text, "on": str(j)}])
            capframes.append((clock(w[1]), path))
    beats = clip["beats"]
    for k, bt in enumerate(beats):
        shots.append([f"{work}/claim-{k}.png", {"layer": "claim", "k": bt["k"], "t": bt["t"], "tone": bt.get("tone", tone)}])
    shoot(shots)
    clear = f"{work}/clear.png"
    subprocess.run([FF, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black@0:s={W}x{H},format=rgba", "-frames:v", "1", clear], check=True)

    # Tracks that simply cut: captions (word to word, then the call to action) and who is talking.
    track = ([(clear, capframes[0][0])] if capframes[0][0] > 0.01 else []) + [(p, (capframes[i + 1][0] if i + 1 < len(capframes) else speech) - t) for i, (t, p) in enumerate(capframes)]
    track.append((f"{work}/end.png", TAIL))
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

    # Beats: the hook holds the claim slot for the first 2.3s, then each beat's claim; a proof stays up (no new
    # slide) while consecutive beats share it.
    hook_end = 2.3
    starts = [max(at_(bt["at"]), 0.0) for bt in beats]
    moving = [(f"{work}/hook.png", 0.0, hook_end, 0, 0, -160, False)]
    for k, bt in enumerate(beats):
        a = max(starts[k], hook_end) if k == 0 else starts[k]
        b = starts[k + 1] if k + 1 < len(beats) else total
        if b > a:
            moving.append((f"{work}/claim-{k}.png", a, b, 0, 0, -60, False))
    runs = []
    for k, bt in enumerate(beats):
        key = (bt["shot"], tuple(bt.get("crop", [])))
        b = starts[k + 1] if k + 1 < len(beats) else total
        if runs and runs[-1][0] == key:
            runs[-1][2] = b
        else:
            runs.append([key, starts[k], b, bt])
    for n, (key, a, b, bt) in enumerate(runs):
        img = f"{work}/proof-{n}.png"
        src = f"{video}/{bt['shot']}"
        w0, h0 = size(src)
        x0, y0, x1, y1 = bt.get("crop", [0, 0, 1, 1])
        cw, ch = w0 * (x1 - x0), h0 * (y1 - y0)
        s = min(PROOF[0] / cw, PROOF[1] / ch)
        dw, dh = int(cw * s) // 2 * 2, int(ch * s) // 2 * 2
        cut = f"crop={int(cw)}:{int(ch)}:{int(w0 * x0)}:{int(h0 * y0)}," if bt.get("crop") else ""
        subprocess.run([FF, "-v", "error", "-y", "-i", src, "-vf", f"{cut}scale={dw}:{dh}:flags=lanczos,pad={dw + 8}:{dh + 8}:4:4:color=0x3a3f47", img], check=True)
        moving.append((img, a, b, (W - dw - 8) // 2, PROOF[2] + (PROOF[1] - dh) // 2, 90, True))

    # The graph: audio (voice pieces, then the tail, plus a low crowd), base, every moving layer, captions, who, progress bar.
    inputs = ["-i", f"{ep}/episode/final-v3.wav", "-stream_loop", "-1", "-i", crowd,
              "-loop", "1", "-framerate", str(FPS), "-t", f"{total:.3f}", "-i", f"{work}/base.png",
              "-f", "concat", "-safe", "0", "-i", f"{work}/caps.txt", "-f", "concat", "-safe", "0", "-i", f"{work}/who.txt",
              "-f", "lavfi", "-i", f"color=c=0xc6f24e:s={W}x8:r={FPS}:d={total:.3f}"]
    graph = [";".join(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st={b - a - 0.015:.3f}:d=0.015[p{i}]" for i, (a, b, _) in enumerate(pieces)),
             "".join(f"[p{i}]" for i in range(len(pieces))) + f"concat=n={len(pieces)}:v=0:a=1,apad=whole_dur={total:.3f}[voice]",
             f"[1:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume=0.07,afade=t=in:d=1,afade=t=out:st={total - 1.5:.3f}:d=1.5[bed]",
             "[voice][bed]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[aud]"]
    last = "2:v"
    for n, (img, a, b, x0, y0, slide, push) in enumerate(moving):
        k = 6 + n
        inputs += ["-itsoffset", f"{a:.3f}", "-loop", "1", "-framerate", str(FPS), "-t", f"{b - a:.3f}", "-i", img]
        chain = f"[{k}:v]format=rgba"
        if push:
            # A slow push-in across the proof's time on screen, 1.00 to 1.04.
            w, h = size(img)
            frames = max(2, int((b - a) * FPS))
            chain += f",zoompan=z='1+0.04*on/{frames}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS},setpts=PTS+{a:.3f}/TB,format=rgba"
        chain += f",fade=t=in:st={a:.3f}:d=0.2:alpha=1"
        if b < total - 0.05:
            chain += f",fade=t=out:st={max(a, b - 0.15):.3f}:d=0.15:alpha=1"
        graph.append(chain + f"[m{n}]")
        x = f"{x0}+{slide}*max(0\\,1-(t-{a:.3f})/0.25)" if slide else str(x0)
        graph.append(f"[{last}][m{n}]overlay=x='{x}':y={y0}:eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[s{n}]")
        last = f"s{n}"
    graph.append(f"[{last}][3:v]overlay=format=auto[c1]")
    graph.append("[c1][4:v]overlay=format=auto[c2]")
    graph.append(f"[c2][5:v]overlay=x='-{W}+{W}*t/{total:.3f}':y=1488,format=yuv420p[v]")
    Path(f"{work}/graph.txt").write_text(";\n".join(graph), encoding="utf-8")
    out = f"{out_dir}/{name}.mp4"
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *inputs, "-filter_complex_script", f"{work}/graph.txt",
                    "-map", "[v]", "-map", "[aud]", "-r", str(FPS), "-t", f"{total:.3f}",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", str(R), out], check=True)
    print(f"{out}: {total:.1f}s, {len(caps)} captions, {len(beats)} beats, {len(runs)} proofs")
    for c in caps:
        print("   ", " ".join(x[0] for x in c))
