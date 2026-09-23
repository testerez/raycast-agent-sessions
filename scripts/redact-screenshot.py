from PIL import Image, ImageDraw, ImageFont

"""
Replaces the personal session titles, project names and branches in a Raycast screenshot of
this extension with the sample data from scripts/make-sample-data.mjs, then re-frames the
window on a clean backdrop (the original capture showed a sliver of the desktop behind it).

Usage: python3 scripts/redact-screenshot.py <original.png> [out-dir]
Coordinates are tied to that one capture; re-measure them if the window size changes.
"""
import sys

SRC = sys.argv[1]
OUT_DIR = (sys.argv[2].rstrip("/") + "/") if len(sys.argv) > 2 else ""
OUT = OUT_DIR + "screenshot-redacted.png"
FONT = "/System/Library/Fonts/SFNS.ttf"

def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f

TITLE = font(28, b"Semibold")
SECONDARY = font(28, b"Regular")
SECTION = font(24, b"Regular")

im = Image.open(SRC).convert("RGB")
L = im.convert("L").load()

def ink_bbox(text, f):
    """Bbox of the rendered ink relative to the draw origin."""
    probe = Image.new("L", (2200, 120), 0)
    ImageDraw.Draw(probe).text((50, 40), text, font=f, fill=255)
    m = probe.point(lambda v: 255 if v > 110 else 0).getbbox()
    return (m[0] - 50, m[1] - 40, m[2] - 50, m[3] - 40)

def origin_for(old, f, x_ink, y_ink):
    """Draw origin that puts `old`'s ink bbox top-left at (x_ink, y_ink)."""
    b = ink_bbox(old, f)
    return (x_ink - b[0], y_ink - b[1])

def width(text, f):
    b = ink_bbox(text, f)
    return b[2] - b[0]

def clear(box, color):
    ImageDraw.Draw(im).rectangle(box, fill=color)

def draw(xy, text, f, fill):
    ImageDraw.Draw(im).text(xy, text, font=f, fill=fill)

def ellipsize(text, f, max_w):
    if width(text, f) <= max_w:
        return text
    while text and width(text.rstrip() + "…", f) > max_w:
        text = text[:-1]
    return text.rstrip() + "…"

WHITE = (255, 255, 255)
GREY = (163, 163, 163)
BG = (26, 26, 26)
BG_SELECTED = (48, 48, 48)

# ---- section headers (title + item count) ----
def section(old, new, count, x_ink, y_ink, count_x, y0, y1, x_end):
    gap = count_x - x_end
    clear((x_ink - 4, y0, count_x + 40, y1), BG)
    ox, oy = origin_for(old, SECTION, x_ink, y_ink)
    draw((ox, oy), new, SECTION, GREY)
    draw((ox + (ink_bbox(new, SECTION)[2] - ink_bbox(new, SECTION)[0]) + gap, oy), count, SECTION, GREY)

section("scratch-2026-09-11-385b9f", "dotfiles", "3", 37, 151, 360, 144, 174, 332)
section("ZapriteApp/ZapriteP2P", "meridian/payments", "9", 37, 443, 303, 436, 470, 276)

# ---- search bar placeholder: neutral issue key instead of a real workspace prefix ----
PLACEHOLDER = font(40, b"Regular")
clear((100, 50, 1140, 100), BG)
po = origin_for("Search sessions: PR 832, ZAP-1793, branch, file, or any text…", PLACEHOLDER, 106, 58)
draw(po, "Search sessions: PR 832, ENG-1793, branch, file, or any text…", PLACEHOLDER, (118, 118, 118))

# ---- list rows: title (+ optional branch after it) ----
def row(old_title, new_title, y_ink, x_ink, title_end, bg,
        old_branch=None, new_branch=None, branch_x=None, right=1375):
    clear((x_ink - 4, y_ink - 16, right + 8, y_ink + 44), bg)
    ox, oy = origin_for(old_title, TITLE, x_ink, y_ink)
    new_title = ellipsize(new_title, TITLE, right - x_ink)
    draw((ox, oy), new_title, TITLE, WHITE)
    if new_branch:
        gap = branch_x - title_end
        bx = x_ink + width(new_title, TITLE) + gap
        b_old = origin_for(old_branch, SECONDARY, bx, y_ink)
        draw((b_old[0], b_old[1]), new_branch, SECONDARY, GREY)

row("Activity report", "Zsh startup takes 400ms", 213, 104, 279, BG_SELECTED)
row("Activity report", "Fzf keybinding for switching branches", 289, 104, 279, BG)
row("Activity report", "Move Homebrew casks into the Brewfile", 365, 104, 279, BG)
row("Will Cole's Strike account webhook issue (fork)", "Refund webhook fires twice (fork)", 580, 104, 690, BG,
    "claude/optimistic-morse-4b9b8a", "claude/refund-dupe-fork-4b9b8a", 719)
row("Will Cole's Strike account webhook issue", "Refund webhook fires twice", 647, 104, 615, BG,
    "indeterminate-payment-outcome", "fix/refund-idempotency", 642)
row("search slack and meeting transacripts on drive. I wan to know why people are using Lexe. What mak…",
    "go through the sentry issues from last night's deploy and tell me which ones are ours and which come from the payment provider. skip the…",
    733, 105, 1375, BG)
row("Prevent secret screenshots in silent…", "Stop logging raw card data in staging", 809, 106, 568, BG,
    "codex/zap-1982-safe-shake-diagnostics", "codex/pay-1982-log-redaction", 596)

# ---- last row: half-hidden behind the footer and faded out towards the window edge ----
# Only the slice between the two footer pills is visible, and it dims line by line, so the
# replacement is drawn through the original's per-line brightness profile and per-column
# background instead of flat colours.
X0, X1, Y0, Y1 = 389, 901, 876, 918
px = im.load()
profile = {y: max((max(L[x, y] for x in range(X0, X1)), 26)) for y in range(Y0, Y1)}
column_bg = {x: im.getpixel((x, 872)) for x in range(X0, X1)}

faded_title = ellipsize("Require a second approval for payouts over the daily cap", TITLE, 522)
faded_branch = "codex/pay-1981-payout-approval"
mask = Image.new("L", im.size, 0)
md = ImageDraw.Draw(mask)
md.text(origin_for("Will Cole's Strike account webhook issue", TITLE, 104, 885), faded_title, font=TITLE, fill=255)
md.text(
    origin_for("codex/zap-1981-pay", SECONDARY, 104 + width(faded_title, TITLE) + 29, 885),
    faded_branch,
    font=SECONDARY,
    fill=255,
)
mpx = mask.load()
for y in range(Y0, Y1):
    level = profile[y]
    for x in range(X0, X1):
        a = mpx[x, y] / 255
        base = column_bg[x]
        if a:
            v = int(base[0] + a * (level - base[0]))
            px[x, y] = (v, v, v)
        else:
            px[x, y] = base

im.save(OUT)
print(OUT, im.size)

# ---- strip everything behind the Raycast window (a sliver of the real desktop) ----
px = im.load()

def is_window(c):
    r, g, b = c
    return abs(r - g) <= 1 and abs(g - b) <= 1 and abs(r - 26) <= 3

mid_y = im.size[1] // 2
xs = [x for x in range(im.size[0]) if is_window(px[x, mid_y])]
wx0, wx1 = min(xs), max(xs)
mid_x = (wx0 + wx1) // 2
ys = [y for y in range(im.size[1]) if is_window(px[mid_x, y])]
wy0, wy1 = min(ys), max(ys)
# grow by the window's 1px border
wx0, wy0 = max(wx0 - 2, 0), max(wy0 - 2, 0)
wx1, wy1 = min(wx1 + 2, im.size[0] - 1), min(wy1 + 2, im.size[1] - 1)
window = im.crop((wx0, wy0, wx1 + 1, wy1 + 1))

# Raycast's window corners are rounded; mask them so no desktop pixels survive in the corners.
RADIUS = 50
corner = Image.new("L", window.size, 0)
ImageDraw.Draw(corner).rounded_rectangle((0, 0, window.size[0] - 1, window.size[1] - 1), RADIUS, fill=255)

BACKDROP = (18, 18, 20)
flat = Image.new("RGB", im.size, BACKDROP)
flat.paste(window, (wx0, wy0), corner)
flat.save(OUT)

# Raycast Store format: 2000x1250, window pasted 1:1 so the text stays crisp
store = Image.new("RGB", (2000, 1250), BACKDROP)
store.paste(window, ((2000 - window.size[0]) // 2, (1250 - window.size[1]) // 2), corner)
store.save(OUT_DIR + "agent-sessions-search-1.png")
print("window", (wx0, wy0, wx1, wy1), window.size)
