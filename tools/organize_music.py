import csv
import os
import pathlib
import re
import shutil
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "musicup"

AUDIO_EXTS = {".webm", ".mp3", ".m4a", ".wav", ".ogg", ".flac"}

GENRES = [
    "country",
    "rock",
    "pop",
    "hiphop",
    "alternative",
    "electronic",
    "christian",
    "general",
    "unsorted",
]

# Strong artist-based rules. Add to these over time.
ARTIST_GENRES = {
    "coldplay": "alternative",
    "linkin park": "rock",
    "red hot chili peppers": "rock",
    "green day": "rock",
    "hoobastank": "rock",
    "u2": "rock",
    "the killers": "rock",
    "kings of leon": "rock",
    "snow patrol": "alternative",
    "of monsters and men": "alternative",
    "fun.": "alternative",
    "walk the moon": "alternative",
    "twenty one pilots": "alternative",
    "imagine dragons": "alternative",
    "mumford & sons": "alternative",
    "mumford and sons": "alternative",
    "kaleo": "alternative",

    "pitbull": "pop",
    "katy perry": "pop",
    "maroon 5": "pop",
    "christina perri": "pop",
    "miley cyrus": "pop",
    "bruno mars": "pop",
    "one republic": "pop",
    "onerepublic": "pop",
    "harry styles": "pop",
    "sam smith": "pop",
    "myles smith": "pop",
    "lewis capaldi": "pop",
    "phillip phillips": "pop",
    "taio cruz": "pop",
    "american authors": "pop",
    "clean bandit": "pop",
    "owl city": "pop",
    "backstreet boys": "pop",

    "flo rida": "hiphop",
    "b.o.b": "hiphop",
    "macklemore": "hiphop",
    "nelly": "hiphop",
    "timbaland": "hiphop",
    "iyaz": "hiphop",

    "avicii": "electronic",
    "david guetta": "electronic",
    "the chainsmokers": "electronic",
    "marshmello": "electronic",
    "seeb": "electronic",

    "artists of then, now & forever": "country",
    "artists of then, now & forever - forever country": "country",
    "forever country": "country",
    "zac brown band": "country",
    "luke combs": "country",
    "morgan wallen": "country",
    "jason aldean": "country",
    "thomas rhett": "country",
    "blake shelton": "country",
    "sam hunt": "country",
    "chris stapleton": "country",
    "george strait": "country",
    "alan jackson": "country",
    "tim mcgraw": "country",
    "kenny chesney": "country",
    "carrie underwood": "country",
    "jelly roll": "country",
    "country roads": "country",

    "phil collins": "rock",
    "bryan adams": "rock",
    "aerosmith": "rock",
    "creed": "rock",
    "limp bizkit": "rock",
}

# Title/filename keyword scoring
KEYWORD_GENRES = {
    "country": {
        "country": 6,
        "forever country": 10,
        "truck": 2,
        "whiskey": 2,
        "small town": 2,
        "hick": 2,
        "cowboy": 2,
        "boots": 2,
    },
    "rock": {
        "remastered": 1,
        "classic": 2,
        "guitar": 1,
        "black parade": 5,
        "in the air tonight": 4,
        "use somebody": 4,
        "under the bridge": 4,
        "one last breath": 4,
        "behind blue eyes": 4,
        "september ends": 4,
        "welcome to the black parade": 8,
    },
    "pop": {
        "official audio": 1,
        "lyrics": 1,
        "lyric video": 1,
        "sign of the times": 4,
        "a thousand years": 4,
        "party in the u.s.a": 4,
        "daylight": 3,
        "counting stars": 3,
        "i lived": 3,
        "secrets": 3,
        "safe and sound": 3,
    },
    "hiphop": {
        "feat.": 1,
        "ft.": 1,
        "low": 3,
        "my house": 3,
        "can't hold us": 4,
        "nothin' on you": 4,
        "just a dream": 4,
        "dj got us fallin' in love": 3,
    },
    "alternative": {
        "demons": 3,
        "radioactive": 3,
        "little talks": 3,
        "wake me up when september ends": 3,
        "some nights": 3,
        "we are young": 3,
        "ride": 3,
        "the scientist": 3,
        "paradise": 3,
        "yellow": 3,
        "sky full of stars": 3,
    },
    "electronic": {
        "remix": 4,
        "edm": 4,
        "closer": 2,
        "something just like this": 2,
        "happier": 2,
        "without you": 2,
        "i'm good": 2,
    },
    "christian": {
        "worship": 5,
        "hillsong": 6,
        "mercyme": 6,
        "casting crowns": 6,
        "for king & country": 6,
        "christian": 5,
        "gospel": 5,
    },
}

# If these words appear, confidence gets reduced a bit because it may be noisy metadata
NOISE_WORDS = [
    "official video",
    "official audio",
    "lyrics",
    "lyric video",
    "audio",
    "hq",
    "hd",
]

def clean_text(s: str) -> str:
    s = s.replace("_", " ")
    s = s.replace("：", ":")
    s = s.replace("｜", "|")
    s = s.replace("＂", '"')
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def strip_extension(filename: str) -> str:
    return os.path.splitext(filename)[0]

def strip_youtube_id(name: str) -> str:
    # Remove trailing [abcdefghijk] style id
    return re.sub(r"\s*\[[^\]]+\]\s*$", "", name).strip()

def strip_common_noise(name: str) -> str:
    out = name
    out = re.sub(r"\((official|audio|lyrics?|lyric video|official video|hq|hd)[^)]*\)", "", out, flags=re.I)
    out = re.sub(r"\[(official|audio|lyrics?|lyric video|official video|hq|hd)[^\]]*\]", "", out, flags=re.I)
    out = re.sub(r"\s+", " ", out).strip(" -")
    return out

def parse_artist_title(filename: str):
    base = strip_extension(filename)
    base = strip_youtube_id(base)
    base = strip_common_noise(base)
    base = clean_text(base)

    # Common "Artist - Title"
    parts = re.split(r"\s[-–—]\s", base, maxsplit=1)
    if len(parts) == 2:
        artist = parts[0].strip()
        title = parts[1].strip()
        if artist and title:
            return artist, title

    return "", base

def score_track(filename: str):
    artist, title = parse_artist_title(filename)
    full = clean_text(strip_common_noise(strip_youtube_id(strip_extension(filename))))
    scores = defaultdict(int)
    reasons = []

    # Strong artist match
    for known_artist, genre in ARTIST_GENRES.items():
        ka = clean_text(known_artist)
        if artist == ka or ka in full:
            scores[genre] += 10
            reasons.append(f"artist:{known_artist}->{genre}")

    # Keyword scoring
    hay = f"{artist} {title} {full}".strip()
    for genre, kws in KEYWORD_GENRES.items():
        for kw, pts in kws.items():
            if clean_text(kw) in hay:
                scores[genre] += pts
                reasons.append(f"kw:{kw}+{pts}->{genre}")

    # Reduce confidence slightly for noisy titles
    for nw in NOISE_WORDS:
        if nw in hay:
            for g in list(scores.keys()):
                if scores[g] > 0:
                    scores[g] -= 0.2

    # If nothing hit, general or unsorted depending on certainty
    if not scores:
        return {
            "genre": "unsorted",
            "confidence": 0.0,
            "artist": artist or "Unknown",
            "title": title or strip_extension(filename),
            "reasons": ["no strong match"]
        }

    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    best_genre, best_score = sorted_scores[0]
    second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0

    confidence = round(best_score - second_score, 2)

    # If too weak or ambiguous, shove to unsorted
    if best_score < 3 or confidence < 1.5:
        return {
            "genre": "unsorted",
            "confidence": confidence,
            "artist": artist or "Unknown",
            "title": title or strip_extension(filename),
            "reasons": reasons or ["weak match"]
        }

    return {
        "genre": best_genre,
        "confidence": confidence,
        "artist": artist or "Unknown",
        "title": title or strip_extension(filename),
        "reasons": reasons
    }

def ensure_genre_dirs():
    for genre in GENRES:
        (MUSIC_DIR / genre).mkdir(exist_ok=True)

def is_already_in_genre_folder(path_obj: pathlib.Path) -> bool:
    rel = path_obj.relative_to(MUSIC_DIR)
    parts = rel.parts
    return len(parts) >= 2 and parts[0].lower() in GENRES

def move_file(src: pathlib.Path, genre: str):
    dest_dir = MUSIC_DIR / genre
    dest = dest_dir / src.name

    # Avoid overwrite
    if dest.exists():
        stem = dest.stem
        suffix = dest.suffix
        i = 1
        while True:
            alt = dest_dir / f"{stem} ({i}){suffix}"
            if not alt.exists():
                dest = alt
                break
            i += 1

    shutil.move(str(src), str(dest))
    return dest

def main():
    if not MUSIC_DIR.exists():
        raise SystemExit(f"Missing folder: {MUSIC_DIR}")

    ensure_genre_dirs()

    review_rows = []
    moved = 0
    skipped = 0

    for p in sorted(MUSIC_DIR.rglob("*")):
        if p.is_dir():
            continue
        if p.suffix.lower() not in AUDIO_EXTS:
            continue
        if p.name.lower() == "library.json":
            continue
        if is_already_in_genre_folder(p):
            skipped += 1
            continue

        result = score_track(p.name)
        genre = result["genre"]
        dest = move_file(p, genre)
        moved += 1

        review_rows.append({
            "original_name": p.name,
            "artist_guess": result["artist"],
            "title_guess": result["title"],
            "assigned_genre": genre,
            "confidence": result["confidence"],
            "new_path": str(dest.relative_to(ROOT)).replace("\\", "/"),
            "reasons": " | ".join(result["reasons"])
        })

    review_csv = ROOT / "genre_review.csv"
    with review_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "original_name",
                "artist_guess",
                "title_guess",
                "assigned_genre",
                "confidence",
                "new_path",
                "reasons"
            ]
        )
        writer.writeheader()
        writer.writerows(review_rows)

    print(f"Moved: {moved}")
    print(f"Skipped already organized: {skipped}")
    print(f"Review file: {review_csv}")

if __name__ == "__main__":
    main()