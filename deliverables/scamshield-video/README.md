# ScamShield product intro video

This folder preserves the source and small sidecars for the 120-second ScamShield
product introduction. The video shows the product at the time it was recorded;
current UI, AI availability and acceptance status are documented in
[`docs/public-beta-readiness.md`](../../docs/public-beta-readiness.md).

- `ScamShield_Product_Intro.mp4` — local final 1920×1080 H.264/AAC video (ignored)
- `ScamShield_Product_Intro_Poster.jpg` — cover image
- `ScamShield_Product_Intro_Script.txt` — narration transcript
- `ScamShield_Product_Intro_Captions.srt` — synchronized captions
- `voiceover.json` — timed narration source
- `render_voiceover.ps1` — local Windows narration renderer
- `build_video.py` — deterministic visual/audio composition script

Git tracks the README, scripts, narration JSON, transcript, SRT and small poster.
The final MP4, generated WAV files, `work/`, `__pycache__/` and source media remain
local and are ignored. `.vercelignore` excludes this entire folder from web
deployments. No Release upload or Git LFS migration has been performed.

To rebuild on Windows, install Python with NumPy and Pillow, Windows SAPI's
Microsoft Zira Desktop voice, and FFmpeg with the `h264_mf` encoder. The scripts
use Windows Segoe UI fonts. Set `SCAMSHIELD_VIDEO_SOURCE_DIR` to your original
media folder and optionally `SCAMSHIELD_FFMPEG` to the FFmpeg executable; otherwise
the script uses a local `source/` folder and FFmpeg from PATH. Expected source
filenames are listed in `build_video.py`. Original media are read without changes.

```powershell
$env:SCAMSHIELD_VIDEO_SOURCE_DIR = 'D:\media\scamshield'
$env:SCAMSHIELD_FFMPEG = 'C:\tools\ffmpeg\bin\ffmpeg.exe'
powershell.exe -File .\deliverables\scamshield-video\render_voiceover.ps1
python .\deliverables\scamshield-video\build_video.py
```

Rendering overwrites the local generated video, audio, poster and sidecars.
The 2026-10-02 repository cleanup preserved the existing renders without rerendering.
