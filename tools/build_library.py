import os, json, pathlib, re, hashlib, time

ROOT = pathlib.Path(__file__).resolve().parents[1]  # repo root
MUSIC_DIR = ROOT / "musicup"
OUT_FILE = MUSIC_DIR / "library.json"

AUDIO_EXTS = {".webm", ".mp3", ".m4a", ".wav", ".ogg", ".flac"}

def nice_title_from_filename(name: str) -> str:
  # Strip extension, replace underscores, collapse spaces
  base = os.path.splitext(name)[0]
  base = base.replace("_", " ").strip()
  base = re.sub(r"\s+", " ", base)
  return base

def stable_id(rel_path: str) -> str:
  # stable-ish id based on path (so it doesn't change every run)
  h = hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:12]
  return f"t_{h}"

def main():
  if not MUSIC_DIR.exists():
    raise SystemExit(f"Missing folder: {MUSIC_DIR}")

  tracks = []
  for p in sorted(MUSIC_DIR.rglob("*")):
    if p.is_dir():
      continue
    if p.suffix.lower() not in AUDIO_EXTS:
      continue
    if p.name.lower() == "library.json":
      continue

    rel = p.relative_to(ROOT).as_posix()
    url = f"./{rel}"  # works on GitHub Pages from site root

    title = nice_title_from_filename(p.name)

    tracks.append({
      "id": stable_id(rel),
      "title": title,
      "artist": "Unknown",
      "album": "",
      "url": url,
      "artwork": "",
      "youtube": ""
    })

  payload = {
    "version": 1,
    "generatedAt": int(time.time()),
    "tracks": tracks
  }

  OUT_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
  print(f"Wrote {OUT_FILE} with {len(tracks)} tracks")

if __name__ == "__main__":
  main()
