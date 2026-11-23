# Builds the animated previews (animated WebP) from the motion frames shot by shoot.mjs.
# Run from the repo root:  python -I design/motion/src/anim.py
import os
from PIL import Image
HERE = os.path.join("design", "motion")
FR = os.path.join(HERE, "screens", "frames")
OUT = os.path.join(HERE, "video")
os.makedirs(OUT, exist_ok=True)
# frame time in ms; D3 is an 8 s loop (40 frames), D1 an intro, D2 a scroll (ping-pong)
SPEC = {"d1": (60, False, 1400), "d2": (110, True, 900), "d3": (200, False, 0)}
for name in sorted(os.listdir(FR)):
    key, view = name.split("-")
    ms, pingpong, hold = SPEC[key]
    files = sorted(f for f in os.listdir(os.path.join(FR, name)) if f.endswith(".png"))
    w = 390 if view == "phone" else 960
    ims = []
    for f in files:
        im = Image.open(os.path.join(FR, name, f)).convert("RGB")
        ims.append(im.resize((w, round(im.height * w / im.width)), Image.LANCZOS))
    durs = [ms] * len(ims)
    if pingpong:
        ims += ims[-2:0:-1]; durs += [ms] * (len(ims) - len(durs))
    if hold: durs[-1 if not pingpong else len(files) - 1] = hold
    if key == "d1": ims.insert(0, ims[0]); durs.insert(0, 500)
    path = os.path.join(OUT, f"{key}-{view}.webp")
    ims[0].save(path, save_all=True, append_images=ims[1:], duration=durs, loop=0, quality=78, method=4)
    print(path, len(ims), os.path.getsize(path) // 1024, "KB")
