from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
WORK = ROOT / "work"
SCENES = WORK / "scenes"
CLIPS = WORK / "clips"
VOICE = WORK / "voice"
CAPTIONS = WORK / "captions"

SOURCE_DIR = Path(os.environ.get("SCAMSHIELD_VIDEO_SOURCE_DIR", str(ROOT / "source")))
RECORDING = SOURCE_DIR / "ScreenRecording_09-06-2026 07-05-45_1.mp4"
SCREENSHOTS = {
    "dhl": SOURCE_DIR / "IMG_1847.jpeg",
    "ebay": SOURCE_DIR / "IMG_1848.jpeg",
    "ebay_sms": SOURCE_DIR / "IMG_1849.jpeg",
    "docusign": SOURCE_DIR / "IMG_1850.jpeg",
    "unknown": SOURCE_DIR / "IMG_1851.jpeg",
    "urgency": SOURCE_DIR / "IMG_1852.jpeg",
    "domain": SOURCE_DIR / "IMG_1853.jpeg",
    "apple": SOURCE_DIR / "IMG_1854.jpeg",
}
ICON = ROOT.parent.parent / "public" / "icon-512.png"
FFMPEG = Path(os.environ.get("SCAMSHIELD_FFMPEG", shutil.which("ffmpeg") or "ffmpeg"))

W, H, FPS = 1920, 1080, 30
TOTAL_DURATION = 120.0
TRANSITION = 0.45

NAVY = "#071C35"
NAVY_2 = "#0A315B"
TEAL = "#0B6E69"
TEAL_DARK = "#075451"
MINT = "#EEF8F6"
MINT_2 = "#DFF3F0"
INK = "#17312F"
MUTED = "#5F7773"
AMBER = "#FFBC2E"
AMBER_DARK = "#A66A0B"
DANGER = "#B42318"
WHITE = "#FFFFFF"

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_SEMIBOLD = Path(r"C:\Windows\Fonts\seguisb.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")


def run(command: list[str]) -> None:
    print("RUN", " ".join(command[:8]), "..." if len(command) > 8 else "")
    subprocess.run(command, check=True)


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    path = {"regular": FONT_REGULAR, "semibold": FONT_SEMIBOLD, "bold": FONT_BOLD}[weight]
    return ImageFont.truetype(str(path), size=size)


def rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def gradient(top: str, bottom: str) -> Image.Image:
    a = np.array(rgb(top), dtype=np.float32)
    b = np.array(rgb(bottom), dtype=np.float32)
    mix = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    data = a[None, None, :] * (1 - mix) + b[None, None, :] * mix
    data = np.repeat(data, W, axis=1).astype(np.uint8)
    return Image.fromarray(data, "RGB").convert("RGBA")


def add_glow(canvas: Image.Image, box: tuple[int, int, int, int], color: str, blur: int, alpha: int) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.ellipse(box, fill=(*rgb(color), alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(layer)


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def text_block(
    canvas: Image.Image,
    text: str,
    xy: tuple[int, int],
    fnt: ImageFont.FreeTypeFont,
    fill: str,
    max_width: int,
    spacing: int = 12,
    align: str = "left",
) -> int:
    draw = ImageDraw.Draw(canvas)
    lines = wrap_lines(draw, text, fnt, max_width)
    y = xy[1]
    line_height = int(fnt.size * 1.18)
    for line in lines:
        width = draw.textbbox((0, 0), line, font=fnt)[2]
        x = xy[0]
        if align == "center":
            x += (max_width - width) // 2
        elif align == "right":
            x += max_width - width
        draw.text((x, y), line, font=fnt, fill=fill)
        y += line_height + spacing
    return y


def eyebrow(canvas: Image.Image, text: str, xy: tuple[int, int], dark: bool = False) -> None:
    draw = ImageDraw.Draw(canvas)
    fnt = font(23, "bold")
    color = AMBER if dark else TEAL
    draw.rounded_rectangle((xy[0], xy[1], xy[0] + 18, xy[1] + 18), radius=5, fill=color)
    draw.text((xy[0] + 34, xy[1] - 6), text.upper(), font=fnt, fill=(220, 242, 239) if dark else TEAL)


def rounded_photo(path: Path, size: tuple[int, int], radius: int = 30, contain: bool = False, bg: str = "#FFFFFF") -> Image.Image:
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if contain:
        out = Image.new("RGB", size, rgb(bg))
        im.thumbnail(size, Image.Resampling.LANCZOS)
        out.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    else:
        out = ImageOps.fit(im, size, method=Image.Resampling.LANCZOS, centering=(0.5, 0.42))
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    rgba = out.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def card(
    canvas: Image.Image,
    path: Path,
    box: tuple[int, int, int, int],
    radius: int = 30,
    contain: bool = False,
    shadow: int = 24,
    border: str | None = None,
    opacity: float = 1.0,
) -> None:
    x, y, w, h = box
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle((x + 10, y + 16, x + w + 10, y + h + 16), radius=radius, fill=(0, 0, 0, 105))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(shadow))
    canvas.alpha_composite(shadow_layer)
    photo = rounded_photo(path, (w, h), radius=radius, contain=contain)
    if opacity < 1:
        photo.putalpha(photo.getchannel("A").point(lambda a: int(a * opacity)))
    canvas.alpha_composite(photo, (x, y))
    if border:
        ImageDraw.Draw(canvas).rounded_rectangle((x, y, x + w, y + h), radius=radius, outline=border, width=3)


def pill(canvas: Image.Image, text: str, xy: tuple[int, int], fg: str, bg: str, icon_text: str | None = None) -> None:
    draw = ImageDraw.Draw(canvas)
    fnt = font(25, "bold")
    text_width = draw.textbbox((0, 0), text, font=fnt)[2]
    icon_width = 34 if icon_text else 0
    width = text_width + icon_width + 46
    draw.rounded_rectangle((xy[0], xy[1], xy[0] + width, xy[1] + 54), radius=27, fill=bg)
    if icon_text:
        draw.text((xy[0] + 16, xy[1] + 8), icon_text, font=fnt, fill=fg)
    draw.text((xy[0] + 22 + icon_width, xy[1] + 8), text, font=fnt, fill=fg)


def check_chip(canvas: Image.Image, xy: tuple[int, int], text: str, active: bool = True) -> None:
    draw = ImageDraw.Draw(canvas)
    fill = TEAL if active else "#D8E9E6"
    fg = WHITE if active else MUTED
    draw.ellipse((xy[0], xy[1], xy[0] + 46, xy[1] + 46), fill=fill)
    draw.text((xy[0] + 12, xy[1] + 5), "✓", font=font(26, "bold"), fill=fg)
    draw.text((xy[0] + 66, xy[1] + 3), text, font=font(28, "semibold"), fill=INK)


def base_dark() -> Image.Image:
    canvas = gradient(NAVY, "#030D18")
    add_glow(canvas, (1220, -380, 2190, 590), TEAL, 130, 75)
    add_glow(canvas, (-300, 760, 600, 1500), DANGER, 150, 45)
    return canvas


def base_light() -> Image.Image:
    canvas = gradient("#F8FCFB", MINT_2)
    add_glow(canvas, (1280, -380, 2260, 570), "#84D8CE", 140, 70)
    add_glow(canvas, (-420, 720, 520, 1600), AMBER, 170, 28)
    return canvas


def save_scene(name: str, canvas: Image.Image) -> Path:
    path = SCENES / f"{name}.png"
    canvas.convert("RGB").save(path, quality=95)
    return path


def scene_opening() -> Path:
    c = base_dark()
    card(c, SCREENSHOTS["urgency"], (1240, 90, 470, 1020), radius=42, contain=True, opacity=0.9)
    card(c, SCREENSHOTS["docusign"], (1000, 650, 660, 350), radius=34, contain=False, opacity=0.88)
    overlay = Image.new("RGBA", c.size, (3, 13, 24, 80))
    c.alpha_composite(overlay)
    eyebrow(c, "The problem", (120, 142), dark=True)
    text_block(c, "Scams move\nfast.", (120, 220), font(112, "bold"), WHITE, 900, spacing=0)
    text_block(c, "The message wants an answer\nbefore you have time to think.", (128, 518), font(42), "#D9ECE9", 760, spacing=6)
    pill(c, "Pause before the tap", (128, 752), NAVY, AMBER, "!")
    return save_scene("00_opening", c)


def scene_montage() -> Path:
    c = base_dark()
    positions = [
        (60, 68, 430, 410, "dhl", True),
        (520, 68, 400, 410, "ebay_sms", True),
        (950, 68, 430, 410, "docusign", True),
        (1410, 68, 450, 410, "apple", True),
        (70, 540, 420, 470, "unknown", True),
        (525, 540, 420, 470, "urgency", True),
        (980, 540, 420, 470, "domain", True),
        (1435, 540, 410, 470, "ebay", True),
    ]
    for x, y, w, h, key, contain in positions:
        card(c, SCREENSHOTS[key], (x, y, w, h), radius=28, contain=contain, shadow=16, opacity=0.82)
    shade = Image.new("RGBA", c.size, (4, 16, 30, 88))
    c.alpha_composite(shade)
    draw = ImageDraw.Draw(c)
    draw.rounded_rectangle((108, 352, 1020, 746), radius=48, fill=(7, 28, 53, 225), outline=(255, 255, 255, 34), width=2)
    eyebrow(c, "Many disguises", (168, 410), dark=True)
    text_block(c, "Different message.\nSame pressure.", (168, 478), font(78, "bold"), WHITE, 780, spacing=0)
    text_block(c, "Delivery. Refund. Document. Account.", (172, 674), font(30), "#C9E5E1", 760)
    return save_scene("01_montage", c)


def scene_pause() -> Path:
    c = base_light()
    eyebrow(c, "A safer reflex", (130, 156))
    text_block(c, "Pause before\nyou tap.", (130, 246), font(104, "bold"), INK, 850, spacing=0)
    text_block(c, "A few seconds of checking can prevent\na much longer recovery.", (138, 522), font(39), MUTED, 770, spacing=5)
    pill(c, "Look for the signal", (138, 710), WHITE, TEAL, "→")
    card(c, SCREENSHOTS["urgency"], (1270, 78, 470, 1020), radius=48, contain=True, shadow=34, border="#A7D2CD")
    draw = ImageDraw.Draw(c)
    draw.rounded_rectangle((1170, 588, 1810, 770), radius=32, fill=(180, 35, 24, 235))
    draw.text((1210, 618), "12 HOURS", font=font(53, "bold"), fill=WHITE)
    draw.text((1212, 692), "Urgency is the hook.", font=font(29, "semibold"), fill="#FFE5E1")
    return save_scene("02_pause", c)


def signal_scene(index: str, title: str, body: str, path: Path, accent: str, evidence: str, contain: bool = True) -> Path:
    c = base_dark()
    draw = ImageDraw.Draw(c)
    draw.text((118, 98), index, font=font(96, "bold"), fill=accent)
    eyebrow(c, "Common scam signal", (128, 240), dark=True)
    text_block(c, title, (128, 320), font(78, "bold"), WHITE, 760, spacing=0)
    text_block(c, body, (132, 520), font(36), "#CFE7E4", 770, spacing=5)
    pill(c, evidence, (132, 764), NAVY, accent, "!")
    card(c, path, (1050, 82, 730, 920), radius=46, contain=contain, shadow=36, border=accent)
    return save_scene(f"signal_{index}", c)


def scene_impersonation() -> Path:
    c = base_light()
    eyebrow(c, "Common scam signal 04", (118, 105))
    text_block(c, "Brand\nimpersonation", (118, 190), font(86, "bold"), INK, 720, spacing=0)
    text_block(c, "A familiar logo is not proof.\nCheck the sender and destination.", (126, 455), font(37), MUTED, 720, spacing=5)
    pill(c, "Trust the source — not the styling", (126, 676), WHITE, TEAL, "!")
    card(c, SCREENSHOTS["dhl"], (890, 90, 860, 410), radius=36, contain=True, shadow=28)
    card(c, SCREENSHOTS["docusign"], (840, 566, 620, 408), radius=36, contain=False, shadow=28)
    card(c, SCREENSHOTS["apple"], (1390, 550, 450, 430), radius=36, contain=False, shadow=28)
    return save_scene("signal_04", c)


def scene_intro() -> Path:
    c = base_light()
    icon = Image.open(ICON).convert("RGBA").resize((360, 360), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", c.size, (0, 0, 0, 0))
    shadow.alpha_composite(icon, (210, 234))
    shadow = shadow.filter(ImageFilter.GaussianBlur(30))
    shadow.putalpha(shadow.getchannel("A").point(lambda x: int(x * 0.26)))
    c.alpha_composite(shadow)
    c.alpha_composite(icon, (210, 206))
    eyebrow(c, "Introducing", (700, 172))
    text_block(c, "ScamShield", (700, 238), font(104, "bold"), INK, 1020, spacing=0)
    text_block(c, "A mobile-first PWA for the moment\nbefore the click.", (708, 390), font(45), MUTED, 970, spacing=4)
    check_chip(c, (710, 586), "Choose a suspicious screenshot")
    check_chip(c, (710, 670), "Get AI-assisted risk guidance")
    check_chip(c, (710, 754), "Take a safer next step")
    draw = ImageDraw.Draw(c)
    draw.text((710, 898), "No link click required.", font=font(29, "bold"), fill=TEAL_DARK)
    return save_scene("03_intro", c)


PHONE_SCREEN = (270, 84, 420, 912)


def make_phone_frame() -> Path:
    frame = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)
    outer = (244, 42, 716, 1032)
    inner = (270, 84, 690, 996)
    draw.rounded_rectangle(outer, radius=72, fill=(7, 12, 17, 255), outline=(255, 255, 255, 55), width=3)
    draw.rounded_rectangle(inner, radius=46, fill=(0, 0, 0, 0))
    draw.rounded_rectangle((391, 56, 568, 74), radius=9, fill=(26, 33, 38, 255))
    path = WORK / "phone_frame.png"
    frame.save(path)
    return path


def demo_background(active_step: int, title: str, body: str) -> Path:
    c = base_light()
    draw = ImageDraw.Draw(c)
    # Soft phone shadow; actual video is composited into this opening later.
    phone_shadow = Image.new("RGBA", c.size, (0, 0, 0, 0))
    ImageDraw.Draw(phone_shadow).rounded_rectangle((234, 36, 730, 1040), radius=82, fill=(7, 28, 53, 95))
    phone_shadow = phone_shadow.filter(ImageFilter.GaussianBlur(36))
    c.alpha_composite(phone_shadow)
    draw.rounded_rectangle((244, 42, 716, 1032), radius=72, fill="#071016")
    eyebrow(c, "Real product demo", (860, 132))
    text_block(c, title, (860, 210), font(72, "bold"), INK, 860, spacing=0)
    text_block(c, body, (868, 400), font(34), MUTED, 780, spacing=4)
    steps = ["Choose a screenshot", "Start AI analysis", "See risk and guidance"]
    y = 632
    for i, label in enumerate(steps, start=1):
        active = i == active_step
        fill = TEAL if active else "#D8E8E5"
        fg = WHITE if active else MUTED
        draw.ellipse((868, y, 928, y + 60), fill=fill)
        number_width = draw.textbbox((0, 0), str(i), font=font(27, "bold"))[2]
        draw.text((898 - number_width // 2, y + 11), str(i), font=font(27, "bold"), fill=fg)
        draw.text((958, y + 9), label, font=font(31, "semibold"), fill=INK if active else MUTED)
        y += 104
    pill(c, "Recorded on the live mobile flow", (866, 944), TEAL_DARK, "#D7EEEB", "●")
    return save_scene(f"demo_{active_step}", c)


def embed_demo_frame(background: Path, frame_path: Path, phone_frame: Path) -> Path:
    c = Image.open(background).convert("RGBA")
    screen = ImageOps.fit(Image.open(frame_path).convert("RGB"), (PHONE_SCREEN[2], PHONE_SCREEN[3]), method=Image.Resampling.LANCZOS)
    c.alpha_composite(screen.convert("RGBA"), (PHONE_SCREEN[0], PHONE_SCREEN[1]))
    c.alpha_composite(Image.open(phone_frame).convert("RGBA"))
    return save_scene("demo_3_final", c)


def scene_risk(frame_path: Path, phone_frame: Path) -> Path:
    c = base_dark()
    eyebrow(c, "Clear at a glance", (124, 120), dark=True)
    text_block(c, "Know the risk\nbefore you act.", (124, 208), font(82, "bold"), WHITE, 760, spacing=0)
    text_block(c, "A prominent risk level helps turn\nuncertainty into a deliberate choice.", (132, 452), font(36), "#CFE7E4", 760, spacing=5)
    draw = ImageDraw.Draw(c)
    draw.rounded_rectangle((130, 676, 770, 904), radius=40, fill=(180, 35, 24, 245))
    draw.text((178, 714), "HIGH RISK", font=font(30, "bold"), fill="#FFD9D5")
    draw.text((174, 766), "88", font=font(92, "bold"), fill=WHITE)
    draw.text((318, 826), "/ 100", font=font(30, "semibold"), fill="#FFD9D5")
    screen = rounded_photo(frame_path, (PHONE_SCREEN[2], PHONE_SCREEN[3]), radius=46)
    c.alpha_composite(screen, (1190, 84))
    # A compact dark bezel around the moved result screen.
    draw.rounded_rectangle((1166, 42, 1638, 1032), radius=72, outline=(255, 255, 255, 65), width=18)
    return save_scene("04_risk", c)


def info_card(canvas: Image.Image, box: tuple[int, int, int, int], number: str, title: str, body: str, accent: str) -> None:
    x, y, w, h = box
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x + 8, y + 14, x + w + 8, y + h + 14), radius=38, fill=(7, 48, 45, 48))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    canvas.alpha_composite(shadow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((x, y, x + w, y + h), radius=38, fill=WHITE, outline="#CFE3E0", width=2)
    draw.ellipse((x + 34, y + 34, x + 94, y + 94), fill=accent)
    nwidth = draw.textbbox((0, 0), number, font=font(27, "bold"))[2]
    draw.text((x + 64 - nwidth // 2, y + 44), number, font=font(27, "bold"), fill=WHITE)
    draw.text((x + 124, y + 34), title, font=font(32, "bold"), fill=INK)
    text_block(canvas, body, (x + 124, y + 88), font(25), MUTED, w - 158, spacing=2)


def scene_signals_value() -> Path:
    c = base_light()
    eyebrow(c, "Explain the why", (122, 98))
    text_block(c, "Signals you can understand.", (122, 166), font(72, "bold"), INK, 1500, spacing=0)
    text_block(c, "Not just a score — the reasons that deserve your attention.", (128, 268), font(34), MUTED, 1350)
    info_card(c, (126, 410, 540, 410), "1", "Sender mismatch", "The display name and the real sender do not line up.", DANGER)
    info_card(c, (690, 410, 540, 410), "2", "Time pressure", "The message pushes you to act before you can verify.", AMBER_DARK)
    info_card(c, (1254, 410, 540, 410), "3", "Link or payment", "The next step leads away from a trusted channel.", TEAL)
    pill(c, "Plain language. Actionable context.", (664, 918), WHITE, TEAL, "✓")
    return save_scene("05_signals_value", c)


def scene_actions() -> Path:
    c = base_light()
    eyebrow(c, "Safer next steps", (122, 92))
    text_block(c, "Guidance that helps you move forward.", (122, 160), font(68, "bold"), INK, 1550, spacing=0)
    rows = [
        ("01", "Do not tap the link in the message", "Open the service through a trusted bookmark, app, or search."),
        ("02", "Never share passwords or one-time codes", "Legitimate support should not ask for secrets by message."),
        ("03", "Verify through the official channel", "Contact the organization using details you find independently."),
    ]
    y = 344
    draw = ImageDraw.Draw(c)
    for number, title, body in rows:
        draw.rounded_rectangle((122, y, 1780, y + 184), radius=36, fill=WHITE, outline="#CDE2DF", width=2)
        draw.rounded_rectangle((154, y + 40, 264, y + 144), radius=26, fill=TEAL)
        draw.text((180, y + 65), number, font=font(30, "bold"), fill=WHITE)
        draw.text((310, y + 34), title, font=font(34, "bold"), fill=INK)
        draw.text((312, y + 98), body, font=font(27), fill=MUTED)
        y += 214
    return save_scene("06_actions", c)


def scene_disclaimer() -> Path:
    c = base_light()
    icon = Image.open(ICON).convert("RGBA").resize((176, 176), Image.Resampling.LANCZOS)
    c.alpha_composite(icon, (872, 130))
    text_block(c, "Guidance, not a guarantee.", (350, 360), font(74, "bold"), INK, 1220, align="center", spacing=0)
    text_block(c, "ScamShield supports your judgment. When in doubt, stop and verify independently.", (450, 494), font(35), MUTED, 1020, align="center", spacing=4)
    pill(c, "Low risk never means zero risk", (682, 720), WHITE, TEAL_DARK, "i")
    return save_scene("07_disclaimer", c)


def scene_end() -> Path:
    c = gradient(NAVY_2, NAVY)
    add_glow(c, (560, -340, 1360, 460), TEAL, 145, 80)
    icon = Image.open(ICON).convert("RGBA").resize((210, 210), Image.Resampling.LANCZOS)
    c.alpha_composite(icon, (855, 142))
    draw = ImageDraw.Draw(c)
    title = "ScamShield"
    tw = draw.textbbox((0, 0), title, font=font(82, "bold"))[2]
    draw.text(((W - tw) // 2, 400), title, font=font(82, "bold"), fill=WHITE)
    line = "Check before you trust."
    lw = draw.textbbox((0, 0), line, font=font(52, "semibold"))[2]
    draw.text(((W - lw) // 2, 528), line, font=font(52, "semibold"), fill="#C7EAE6")
    draw.rounded_rectangle((774, 650, 1146, 718), radius=34, fill=AMBER)
    action = "PAUSE  •  CHECK  •  PROTECT"
    aw = draw.textbbox((0, 0), action, font=font(24, "bold"))[2]
    draw.text(((W - aw) // 2, 669), action, font=font(24, "bold"), fill=NAVY)
    footer = "MOBILE-FIRST  •  AI-ASSISTED"
    fw = draw.textbbox((0, 0), footer, font=font(23, "semibold"))[2]
    draw.text(((W - fw) // 2, 886), footer, font=font(23, "semibold"), fill=(181, 214, 210))
    return save_scene("08_end", c)


def extract_final_demo_frame() -> Path:
    output = WORK / "demo-final-frame.png"
    run([
        str(FFMPEG), "-y", "-hide_banner", "-loglevel", "warning",
        "-ss", "14.9", "-i", str(RECORDING), "-frames:v", "1", str(output),
    ])
    return output


def read_voice_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wav:
        return wav.getnframes() / wav.getframerate()


def mix_narration(segments: list[dict]) -> list[dict]:
    first = VOICE / "voice-00.wav"
    with wave.open(str(first), "rb") as wav:
        rate = wav.getframerate()
        channels = wav.getnchannels()
        width = wav.getsampwidth()
    if width != 2:
        raise RuntimeError("Expected 16-bit narration WAV files")
    out = np.zeros(int(TOTAL_DURATION * rate), dtype=np.float32)
    enriched: list[dict] = []
    for i, item in enumerate(segments):
        path = VOICE / f"voice-{i:02d}.wav"
        with wave.open(str(path), "rb") as wav:
            if wav.getframerate() != rate or wav.getsampwidth() != width:
                raise RuntimeError(f"Unexpected narration format in {path}")
            audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
            if wav.getnchannels() > 1:
                audio = audio.reshape(-1, wav.getnchannels()).mean(axis=1)
        fade = min(int(rate * 0.03), len(audio) // 3)
        if fade:
            audio[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
            audio[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
        start = int(float(item["start"]) * rate)
        end = min(start + len(audio), len(out))
        out[start:end] += audio[: end - start]
        actual_duration = len(audio) / rate
        enriched.append({**item, "duration": actual_duration, "end": min(TOTAL_DURATION, float(item["start"]) + actual_duration)})
    peak = float(np.max(np.abs(out))) or 1.0
    out = out * min(0.92 / peak, 1.25)
    narration = ROOT / "narration.wav"
    with wave.open(str(narration), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
    return enriched


def create_music(sample_rate: int) -> Path:
    n = int(TOTAL_DURATION * sample_rate)
    t = np.arange(n, dtype=np.float32) / sample_rate
    left = np.zeros(n, dtype=np.float32)
    right = np.zeros(n, dtype=np.float32)
    sections = [
        (0.0, 34.0, [73.42, 110.00, 146.83]),
        (32.0, 64.0, [65.41, 98.00, 130.81, 196.00]),
        (62.0, 88.0, [82.41, 123.47, 164.81, 246.94]),
        (86.0, 112.0, [87.31, 130.81, 174.61, 261.63]),
        (110.0, 120.0, [65.41, 130.81, 164.81, 196.00]),
    ]
    for start, end, freqs in sections:
        a, b = int(start * sample_rate), int(end * sample_rate)
        local = t[a:b] - start
        env = np.minimum(np.minimum(local / 2.2, (end - start - local) / 2.2), 1.0)
        env = np.clip(env, 0, 1).astype(np.float32)
        for j, frequency in enumerate(freqs):
            amp = 0.055 / (1 + j * 0.28)
            shimmer = 0.09 * np.sin(2 * np.pi * (0.035 + j * 0.009) * local)
            left[a:b] += amp * env * np.sin(2 * np.pi * frequency * local + shimmer)
            right[a:b] += amp * env * np.sin(2 * np.pi * frequency * local + 0.45 + shimmer)
    # A restrained pulse provides tension in the opening, then fades away.
    for start in np.arange(0.4, 34.0, 1.55):
        a = int(start * sample_rate)
        length = int(0.42 * sample_rate)
        local = np.arange(length, dtype=np.float32) / sample_rate
        pulse = 0.11 * np.exp(-7.2 * local) * np.sin(2 * np.pi * 55 * local)
        b = min(a + length, n)
        left[a:b] += pulse[: b - a]
        right[a:b] += pulse[: b - a]
    # Soft high notes suggest forward motion during the product and guidance sections.
    notes = [261.63, 329.63, 392.00, 523.25]
    for idx, start in enumerate(np.arange(36.0, 114.0, 2.5)):
        a = int(start * sample_rate)
        length = int(1.15 * sample_rate)
        local = np.arange(length, dtype=np.float32) / sample_rate
        env = np.exp(-3.2 * local)
        note = notes[idx % len(notes)]
        chime_l = 0.028 * env * np.sin(2 * np.pi * note * local)
        chime_r = 0.028 * env * np.sin(2 * np.pi * note * local + 0.25)
        b = min(a + length, n)
        left[a:b] += chime_l[: b - a]
        right[a:b] += chime_r[: b - a]
    stereo = np.stack([left, right], axis=1)
    peak = float(np.max(np.abs(stereo))) or 1.0
    stereo *= min(0.82 / peak, 1.0)
    path = ROOT / "original-score.wav"
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes((np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes())
    return path


def make_caption(index: int, text: str) -> Path:
    c = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(c)
    fnt = font(32, "semibold")
    lines = wrap_lines(draw, text, fnt, 1240)
    line_height = 43
    box_h = len(lines) * line_height + 34
    x1, x2 = 300, 1620
    y1 = 1034 - box_h
    draw.rounded_rectangle((x1, y1, x2, 1034), radius=22, fill=(5, 19, 31, 210), outline=(255, 255, 255, 38), width=1)
    y = y1 + 16
    for line in lines:
        width = draw.textbbox((0, 0), line, font=fnt)[2]
        draw.text(((W - width) // 2, y), line, font=fnt, fill=WHITE)
        y += line_height
    path = CAPTIONS / f"caption-{index:02d}.png"
    c.save(path)
    return path


def timestamp(seconds: float) -> str:
    ms_total = int(round(seconds * 1000))
    hours, rem = divmod(ms_total, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def write_transcript(segments: list[dict]) -> None:
    srt: list[str] = []
    transcript: list[str] = ["SCAMSHIELD PRODUCT INTRO — NARRATION", ""]
    for i, item in enumerate(segments, start=1):
        end = min(float(item["end"]) + 0.15, TOTAL_DURATION)
        srt.extend([str(i), f"{timestamp(float(item['start']))} --> {timestamp(end)}", item["text"], ""])
        transcript.append(f"{timestamp(float(item['start']))[:-4]}  {item['text']}")
    (ROOT / "ScamShield_Product_Intro_Captions.srt").write_text("\n".join(srt), encoding="utf-8")
    (ROOT / "ScamShield_Product_Intro_Script.txt").write_text("\n".join(transcript) + "\n", encoding="utf-8")


def still_clip(scene: Path, duration: float, output: Path, drift: int) -> None:
    zoom = "min(zoom+0.00010,1.025)" if drift % 2 == 0 else "min(zoom+0.00008,1.020)"
    x_expr = "iw/2-(iw/zoom/2)" if drift % 3 else "iw/2-(iw/zoom/2)+6*sin(on/70)"
    y_expr = "ih/2-(ih/zoom/2)" if drift % 2 else "ih/2-(ih/zoom/2)+4*cos(on/65)"
    vf = f"zoompan=z='{zoom}':x='{x_expr}':y='{y_expr}':d=1:s={W}x{H}:fps={FPS},format=yuv420p"
    run([
        str(FFMPEG), "-y", "-hide_banner", "-loglevel", "warning",
        "-loop", "1", "-framerate", str(FPS), "-i", str(scene),
        "-t", f"{duration:.3f}", "-vf", vf,
        "-an", "-c:v", "h264_mf", "-b:v", "8000k", "-pix_fmt", "yuv420p", str(output),
    ])


def demo_clip(background: Path, phone_frame: Path, start: float, source_duration: float, output_duration: float, output: Path) -> None:
    speed = output_duration / source_duration
    filters = (
        f"[0:v]setpts={speed:.8f}*PTS,scale={PHONE_SCREEN[2]}:{PHONE_SCREEN[3]},format=yuv420p[screen];"
        f"[1:v][screen]overlay={PHONE_SCREEN[0]}:{PHONE_SCREEN[1]}:shortest=1[tmp];"
        f"[tmp][2:v]overlay=0:0:shortest=1,format=yuv420p[out]"
    )
    run([
        str(FFMPEG), "-y", "-hide_banner", "-loglevel", "warning",
        "-ss", f"{start:.3f}", "-t", f"{source_duration:.3f}", "-i", str(RECORDING),
        "-loop", "1", "-framerate", str(FPS), "-i", str(background),
        "-loop", "1", "-framerate", str(FPS), "-i", str(phone_frame),
        "-filter_complex", filters, "-map", "[out]", "-t", f"{output_duration:.3f}",
        "-an", "-c:v", "h264_mf", "-b:v", "8000k", "-pix_fmt", "yuv420p", str(output),
    ])


def crossfade(clips: list[Path], nominal_durations: list[float]) -> Path:
    output = WORK / "visual-master.mp4"
    command = [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "warning"]
    for clip in clips:
        command.extend(["-i", str(clip)])
    filters: list[str] = []
    for i in range(len(clips)):
        filters.append(f"[{i}:v]fps={FPS},format=yuv420p,settb=AVTB[v{i}]")
    current = "v0"
    offset = nominal_durations[0]
    transitions = ["fade", "smoothleft", "fade", "wipeleft"]
    for i in range(1, len(clips)):
        out = f"x{i}"
        transition = transitions[(i - 1) % len(transitions)]
        filters.append(
            f"[{current}][v{i}]xfade=transition={transition}:duration={TRANSITION:.3f}:offset={offset:.3f}[{out}]"
        )
        current = out
        offset += nominal_durations[i]
    command.extend([
        "-filter_complex", ";".join(filters), "-map", f"[{current}]", "-t", f"{TOTAL_DURATION:.3f}",
        "-an", "-c:v", "h264_mf", "-b:v", "10000k", "-pix_fmt", "yuv420p", str(output),
    ])
    run(command)
    return output


def finish_video(visual: Path, narration: Path, music: Path) -> Path:
    output = ROOT / "ScamShield_Product_Intro.mp4"
    command = [
        str(FFMPEG), "-y", "-hide_banner", "-loglevel", "warning",
        "-i", str(visual), "-i", str(narration), "-i", str(music),
    ]
    filters: list[str] = [
        "[1:a]highpass=f=80,acompressor=threshold=0.12:ratio=2.5:attack=8:release=130,volume=1.05,pan=stereo|c0=c0|c1=c0[narr]",
        "[2:a]volume=0.24[music]",
        "[narr][music]amix=inputs=2:duration=longest:dropout_transition=2,loudnorm=I=-16:LRA=9:TP=-1.5[aout]",
    ]
    command.extend([
        "-filter_complex", ";".join(filters), "-map", "0:v", "-map", "[aout]",
        "-t", f"{TOTAL_DURATION:.3f}", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-movflags", "+faststart", str(output),
    ])
    run(command)
    return output


def create_poster(final_video: Path) -> Path:
    output = ROOT / "ScamShield_Product_Intro_Poster.jpg"
    run([
        str(FFMPEG), "-y", "-hide_banner", "-loglevel", "warning", "-ss", "115.0", "-i", str(final_video),
        "-frames:v", "1", "-q:v", "2", str(output),
    ])
    return output


def main() -> None:
    for directory in (WORK, SCENES, CLIPS, VOICE, CAPTIONS):
        directory.mkdir(parents=True, exist_ok=True)
    if not FFMPEG.exists():
        raise FileNotFoundError(FFMPEG)
    for path in [RECORDING, ICON, *SCREENSHOTS.values()]:
        if not path.exists():
            raise FileNotFoundError(path)

    # The PowerShell narration renderer is run first; use those files to build the timeline.
    segments = json.loads((ROOT / "voiceover.json").read_text(encoding="utf-8"))
    missing = [VOICE / f"voice-{i:02d}.wav" for i in range(len(segments)) if not (VOICE / f"voice-{i:02d}.wav").exists()]
    if missing:
        raise RuntimeError("Narration files are missing. Run render_voiceover.ps1 first.")

    final_frame = extract_final_demo_frame()
    phone_frame = make_phone_frame()

    scenes: list[Path] = [
        scene_opening(),
        scene_montage(),
        scene_pause(),
        signal_scene("01", "Urgency", "A deadline is used to replace careful thinking with immediate action.", SCREENSHOTS["urgency"], AMBER, "Act within 12 hours", True),
        signal_scene("02", "Unknown senders", "An unexpected number or sender asks you to trust the message first.", SCREENSHOTS["unknown"], "#9D7CFF", "Unfamiliar international number", True),
        signal_scene("03", "Suspicious domains", "Look-alike links borrow trusted words while pointing somewhere else.", SCREENSHOTS["domain"], "#FF6B5E", "A brand name hidden inside another domain", True),
        scene_impersonation(),
        scene_intro(),
        demo_background(1, "Choose a screenshot", "Start with the message you already received. No need to open its link."),
        demo_background(2, "Start the analysis", "One clear action sends the screenshot for AI-assisted review."),
        demo_background(3, "Get useful guidance", "See the level of risk, the reasons behind it, and what to do next."),
        scene_risk(final_frame, phone_frame),
        scene_signals_value(),
        scene_actions(),
        scene_disclaimer(),
        scene_end(),
    ]
    # Replace the third demo background with a true result frame for the held result shot.
    scenes[10] = embed_demo_frame(scenes[10], final_frame, phone_frame)

    nominal = [4, 9, 5, 4, 4, 4, 4, 9, 11, 10, 14, 8, 10, 10, 6, 8]
    assert math.isclose(sum(nominal), TOTAL_DURATION)
    clips: list[Path] = []
    for i, (scene, duration) in enumerate(zip(scenes, nominal)):
        ext = duration + (TRANSITION if i < len(scenes) - 1 else 0)
        output = CLIPS / f"clip-{i:02d}.mp4"
        if i == 8:
            demo_clip(scene, phone_frame, 0.0, 7.333, ext, output)
        elif i == 9:
            demo_clip(scene, phone_frame, 7.333, 7.817, ext, output)
        else:
            still_clip(scene, ext, output, i)
        clips.append(output)

    visual = crossfade(clips, nominal)
    enriched = mix_narration(segments)
    with wave.open(str(ROOT / "narration.wav"), "rb") as wav:
        sample_rate = wav.getframerate()
    music = create_music(sample_rate)
    write_transcript(enriched)

    # Captions are delivered as a synchronized SRT sidecar so the video remains
    # clean, player-selectable, and fast to export at full 1080p quality.
    final_video = finish_video(visual, ROOT / "narration.wav", music)
    poster = create_poster(final_video)
    print(f"FINAL_VIDEO={final_video}")
    print(f"POSTER={poster}")
    for i, item in enumerate(enriched):
        next_start = float(enriched[i + 1]["start"]) if i + 1 < len(enriched) else TOTAL_DURATION
        status = "OK" if float(item["end"]) <= next_start else "OVERLAP"
        print(f"VOICE {i:02d} {item['start']:6.2f}-{item['end']:6.2f} {status}")


if __name__ == "__main__":
    main()
