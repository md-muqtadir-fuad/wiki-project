#!/usr/bin/env python3
"""
Robust Bengali Wikipedia ns0 title cleaner + browser-safe title-list generator.

This is designed for the bnwiki internal-link helper workflow.

It can create two outputs:
  1) bnwiki-clean-titles-full.txt         -> cleaned full title list
  2) bnwiki-clean-titles.txt    -> smaller browser-safe list for JS matching

Why the second file matters:
  Loading one huge title list in a browser userscript can freeze the edit page.
  The 2-to-5-word browser list removes 1-word titles and long titles, then writes
  token-normalized Bengali phrase titles. That makes the frontend much lighter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Dict, Iterable, List, Optional, TextIO, Tuple


# =========================
# Default file paths
# =========================

DEFAULT_INPUT_FILE = Path("./bnwiki-internal-links/title-files/bnwiki-latest-all-titles-in-ns0")
DEFAULT_OUTPUT_DIR = Path("./bnwiki-internal-links/title-files")
DEFAULT_OUTPUT_ALL = DEFAULT_OUTPUT_DIR / "bnwiki-clean-titles-full.txt"
DEFAULT_OUTPUT_BROWSER = DEFAULT_OUTPUT_DIR / "bnwiki-clean-titles.txt" # 2-5
DEFAULT_MANIFEST = DEFAULT_OUTPUT_DIR / "bnwiki-title-manifest.json"
DEFAULT_SHARD_DIR = DEFAULT_OUTPUT_DIR / "title-shards"


# =========================
# Bengali month names
# =========================

BN_MONTHS = (
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
    "বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন",
    "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র",
)

EN_MONTHS = (
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
)


# =========================
# Namespace-like noisy prefixes
# =========================

BAD_PREFIXES = (
    "চিত্র:", "ফাইল:", "বিষয়শ্রেণী:", "বিষয়শ্রেণী:", "ব্যবহারকারী:",
    "আলাপ:", "উইকিপিডিয়া:", "উইকিপিডিয়া:", "প্রবেশদ্বার:",
    "টেমপ্লেট:", "মডিউল:", "সহায়তা:", "সাহায্য:",
    "media:", "special:", "file:", "category:", "user:", "talk:",
    "wikipedia:", "portal:", "template:", "module:", "help:",
)


# =========================
# Regex patterns
# =========================

BENGALI_BLOCK_RE = re.compile(r"[\u0980-\u09FF]")
BN_TOKEN_RE = re.compile(r"[\u0980-\u09FF]+")

BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯"
ASCII_DIGITS = "0123456789"
DIGIT_CLASS = r"0-9\u09E6-\u09EF"

MONTH_ALT = "|".join(re.escape(month) for month in sorted(BN_MONTHS, key=len, reverse=True))
EN_MONTH_ALT = "|".join(re.escape(month) for month in sorted(EN_MONTHS, key=len, reverse=True))

# Reject examples:
#   ১০ মার্চ
#   ১০-মার্চ
#   ১০ মার্চ ১৯৭১
#   মার্চ ১০
#   মার্চ ১০, ১৯৭১
#   10 March
DATE_TITLE_PATTERNS = (
    re.compile(rf"^[{DIGIT_CLASS}]{{1,4}}\s*[-–—/]?\s*(?:{MONTH_ALT})(?:\s+[{DIGIT_CLASS}]{{1,4}})?$", re.UNICODE),
    re.compile(rf"^(?:{MONTH_ALT})\s+[{DIGIT_CLASS}]{{1,4}}(?:,?\s+[{DIGIT_CLASS}]{{1,4}})?$", re.UNICODE),
    re.compile(rf"^[0-9]{{1,4}}\s*[-–—/]?\s*(?:{EN_MONTH_ALT})(?:\s+[0-9]{{1,4}})?$", re.IGNORECASE),
    re.compile(rf"^(?:{EN_MONTH_ALT})\s+[0-9]{{1,4}}(?:,?\s+[0-9]{{1,4}})?$", re.IGNORECASE),
)

# Removes final disambiguation suffix:
#   ঢাকা (শহর) -> ঢাকা
#   জাভা_(প্রোগ্রামিং_ভাষা) -> জাভা
DISAMBIG_SUFFIX_RE = re.compile(r"\s*[\(\[\{][^)\]\}]{1,100}[\)\]\}]\s*$")

# A title that is only punctuation/symbols around Bengali digits/marks is not useful.
TITLE_FRIENDLY_PUNCT = {"-", "–", "—", "'", "’", "।", ".", ",", ":", ";", "/"}


# =========================
# Text normalization helpers
# =========================

def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text, flags=re.UNICODE).strip()


def remove_control_chars(text: str, keep_joiners: bool = False) -> str:
    """Remove invisible/control characters.

    By default, this removes BOM, ZWJ/ZWNJ, bidi marks, and other Unicode C* chars.
    If keep_joiners=True, ZWJ/ZWNJ are preserved.
    """
    out = []
    for ch in text:
        if keep_joiners and ch in {"\u200c", "\u200d"}:
            out.append(ch)
            continue
        if not unicodedata.category(ch).startswith("C"):
            out.append(ch)
    return "".join(out)


def clean_title_text(raw_title: str, drop_disambiguation: bool = True, keep_joiners: bool = False) -> str:
    title = unicodedata.normalize("NFC", raw_title)
    title = title.replace("_", " ")
    title = remove_control_chars(title, keep_joiners=keep_joiners)
    title = normalize_spaces(title)

    if drop_disambiguation:
        title = DISAMBIG_SUFFIX_RE.sub("", title)
        title = normalize_spaces(title)

    return title


# =========================
# Character detection helpers
# =========================

def is_latin_letter(ch: str) -> bool:
    if not unicodedata.category(ch).startswith("L"):
        return False
    try:
        return "LATIN" in unicodedata.name(ch)
    except ValueError:
        return False


def contains_latin_letter(text: str) -> bool:
    return any(is_latin_letter(ch) for ch in text)


def is_bengali_letter(ch: str) -> bool:
    return "\u0980" <= ch <= "\u09FF" and unicodedata.category(ch).startswith("L")


def contains_bengali_letter(text: str) -> bool:
    return any(is_bengali_letter(ch) for ch in text)


# =========================
# Filtering helpers
# =========================

def is_namespace_like(title: str) -> bool:
    folded = title.casefold()
    return folded.startswith(tuple(prefix.casefold() for prefix in BAD_PREFIXES))


def is_date_title(title: str) -> bool:
    return any(pattern.fullmatch(title) for pattern in DATE_TITLE_PATTERNS)


def starts_with_bad_symbol(title: str) -> bool:
    if not title:
        return True

    first = title[0]

    if is_bengali_letter(first):
        return False
    if first in BENGALI_DIGITS or first in ASCII_DIGITS:
        return False
    if is_latin_letter(first):
        return False

    return unicodedata.category(first)[0] in {"P", "S"}


def useful_char_ratio(title: str) -> float:
    chars = [ch for ch in title if not ch.isspace()]
    if not chars:
        return 0.0

    useful = 0
    for ch in chars:
        category = unicodedata.category(ch)
        if category.startswith("L") or category.startswith("N"):
            useful += 1
        elif ch in TITLE_FRIENDLY_PUNCT:
            useful += 1

    return useful / len(chars)


def split_bengali_tokens(title: str) -> list[str]:
    """Match the browser script's logic: only Bengali Unicode-block token runs.

    Example:
        "হিন্দি ভাষা" -> ["হিন্দি", "ভাষা"]
        "C programming ভাষা" -> ["ভাষা"]
    """
    tokens = []
    for match in BN_TOKEN_RE.finditer(normalize_spaces(title)):
        token = match.group(0).strip()
        if contains_bengali_letter(token):
            tokens.append(token)
    return tokens


# =========================
# Browser shard helpers
# =========================

def fnv1a_32(text: str) -> int:
    """Return FNV-1a 32-bit hash.

    This is intentionally simple to mirror in JavaScript. Bengali characters are
    in the BMP, so ord(ch) here matches charCodeAt(i) for normal Bengali text.
    """
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def shard_id_for_browser_title(title: str, shard_count: int) -> int:
    """Shard by first Bengali token.

    The userscript can inspect article phrases, take their first Bengali token,
    calculate the same shard id, and fetch only those shard files.
    """
    tokens = split_bengali_tokens(title)
    if not tokens:
        return 0
    return fnv1a_32(tokens[0]) % shard_count


def write_title_shards(
    titles: Iterable[str],
    shard_dir: Path,
    shard_count: int,
    sort_output: bool = True,
) -> Tuple[List[dict], Dict[int, int]]:
    """Write browser titles into deterministic shard files.

    Returns:
        (shard_files_metadata, shard_title_counts)
    """
    if shard_count < 1:
        raise ValueError("shard_count must be at least 1")

    shard_dir.mkdir(parents=True, exist_ok=True)
    shards: Dict[int, List[str]] = {i: [] for i in range(shard_count)}

    for title in titles:
        sid = shard_id_for_browser_title(title, shard_count)
        shards[sid].append(title)

    shard_files: List[dict] = []
    shard_stats: Dict[int, int] = {}

    for sid in range(shard_count):
        filename = f"shard-{sid:02d}.txt"
        path = shard_dir / filename
        lines = shards[sid]

        if sort_output:
            lines.sort()

        atomic_write_lines(path, lines)
        shard_stats[sid] = len(lines)
        shard_files.append({
            "id": sid,
            "file": filename,
            "titles": len(lines),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        })

    return shard_files, shard_stats


def validate_title(
    title: str,
    strict_no_english: bool = True,
    min_chars: int = 2,
    max_chars: int = 150,
    min_useful_ratio: float = 0.55,
) -> Tuple[bool, str]:
    if not title:
        return False, "empty_after_cleaning"
    if len(title) < min_chars:
        return False, "too_short"
    if len(title) > max_chars:
        return False, "too_long"
    if not BENGALI_BLOCK_RE.search(title):
        return False, "no_bengali_unicode"
    if not contains_bengali_letter(title):
        return False, "no_bengali_letter"
    if strict_no_english and contains_latin_letter(title):
        return False, "contains_latin_letter"
    if is_namespace_like(title):
        return False, "namespace_prefix"
    if is_date_title(title):
        return False, "date_title"
    if starts_with_bad_symbol(title):
        return False, "starts_with_symbol"
    if useful_char_ratio(title) < min_useful_ratio:
        return False, "mostly_symbols"

    return True, "kept"


# =========================
# File helpers
# =========================

def atomic_write_lines(path: Path, lines: Iterable[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(path.name + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
        for line in lines:
            f.write(line)
            f.write("\n")
    tmp_path.replace(path)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def file_info(path: Optional[Path]) -> Optional[dict]:
    if path is None or not path.exists():
        return None
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def open_rejected_log(path: Optional[Path]) -> Optional[TextIO]:
    if path is None:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)
    f = path.open("w", encoding="utf-8", newline="\n")
    f.write("line_no\treason\traw_title\tcleaned_title\n")
    return f


def write_rejected_row(f: TextIO, line_no: int, reason: str, raw: str, cleaned: str) -> None:
    raw_safe = raw.replace("\t", " ").replace("\r", " ").replace("\n", " ")
    cleaned_safe = cleaned.replace("\t", " ").replace("\r", " ").replace("\n", " ")
    f.write(f"{line_no}\t{reason}\t{raw_safe}\t{cleaned_safe}\n")


# =========================
# Main processing function
# =========================

def process_file(
    input_file: Path,
    output_all: Optional[Path],
    output_browser: Optional[Path],
    strict_no_english: bool = True,
    drop_disambiguation: bool = True,
    sort_output: bool = True,
    rejected_log: Optional[Path] = None,
    manifest_path: Optional[Path] = None,
    shard_dir: Optional[Path] = None,
    shard_count: int = 64,
    browser_min_words: int = 2,
    browser_max_words: int = 5,
    min_chars: int = 2,
    max_chars: int = 150,
    min_useful_ratio: float = 0.55,
    keep_joiners: bool = False,
    progress_every: int = 100_000,
    dry_run: bool = False,
) -> Counter:
    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")
    if browser_min_words < 1:
        raise ValueError("browser_min_words must be at least 1")
    if browser_max_words < browser_min_words:
        raise ValueError("browser_max_words must be >= browser_min_words")
    if shard_count < 1:
        raise ValueError("shard_count must be at least 1")

    started = time.time()
    stats: Counter = Counter()
    all_seen: set[str] = set()
    browser_seen: set[str] = set()
    all_titles: list[str] = []
    browser_titles: list[str] = []

    rejected_f = open_rejected_log(rejected_log)

    try:
        with input_file.open("r", encoding="utf-8", errors="replace") as f:
            for line_no, line in enumerate(f, start=1):
                stats["total"] += 1
                raw = line.rstrip("\n\r")

                cleaned = clean_title_text(
                    raw,
                    drop_disambiguation=drop_disambiguation,
                    keep_joiners=keep_joiners,
                )

                is_valid, reason = validate_title(
                    cleaned,
                    strict_no_english=strict_no_english,
                    min_chars=min_chars,
                    max_chars=max_chars,
                    min_useful_ratio=min_useful_ratio,
                )

                if not is_valid:
                    stats[f"rejected:{reason}"] += 1
                    if rejected_f is not None:
                        write_rejected_row(rejected_f, line_no, reason, raw, cleaned)
                    continue

                if cleaned in all_seen:
                    stats["duplicate_all"] += 1
                else:
                    all_seen.add(cleaned)
                    all_titles.append(cleaned)
                    stats["kept_all_unique"] += 1

                tokens = split_bengali_tokens(cleaned)
                browser_title = " ".join(tokens)
                token_count = len(tokens)

                if token_count < browser_min_words:
                    stats["browser_skipped_too_short"] += 1
                elif token_count > browser_max_words:
                    stats["browser_skipped_too_long"] += 1
                elif not browser_title:
                    stats["browser_skipped_empty"] += 1
                elif browser_title in browser_seen:
                    stats["duplicate_browser"] += 1
                else:
                    browser_seen.add(browser_title)
                    browser_titles.append(browser_title)
                    stats["kept_browser_unique"] += 1

                if progress_every > 0 and stats["total"] % progress_every == 0:
                    print(
                        f"Processed {stats['total']:,} lines | "
                        f"all kept {stats['kept_all_unique']:,} | "
                        f"browser kept {stats['kept_browser_unique']:,}",
                        file=sys.stderr,
                    )
    finally:
        if rejected_f is not None:
            rejected_f.close()

    if sort_output:
        all_titles.sort()
        browser_titles.sort()

    shard_files: List[dict] = []
    shard_stats: Dict[int, int] = {}

    if not dry_run:
        if output_all is not None:
            atomic_write_lines(output_all, all_titles)
        if output_browser is not None:
            atomic_write_lines(output_browser, browser_titles)
        if shard_dir is not None:
            shard_files, shard_stats = write_title_shards(
                browser_titles,
                shard_dir=shard_dir,
                shard_count=shard_count,
                sort_output=sort_output,
            )

    elapsed = time.time() - started
    stats["elapsed_seconds"] = round(elapsed, 3)

    if manifest_path is not None and not dry_run:
        manifest = {
            "input": str(input_file),
            "settings": {
                "strict_no_english": strict_no_english,
                "drop_disambiguation": drop_disambiguation,
                "sort_output": sort_output,
                "browser_min_words": browser_min_words,
                "browser_max_words": browser_max_words,
                "min_chars": min_chars,
                "max_chars": max_chars,
                "min_useful_ratio": min_useful_ratio,
                "keep_joiners": keep_joiners,
                "shards_enabled": shard_dir is not None,
                "shard_count": shard_count,
                "shard_algorithm": "fnv1a32(first_bengali_token) % shard_count",
            },
            "stats": dict(stats),
            "outputs": {
                "all": file_info(output_all),
                "browser": file_info(output_browser),
                "rejected_log": file_info(rejected_log),
                "shard_dir": str(shard_dir) if shard_dir is not None else None,
                "shards": shard_files,
            },
        }
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_manifest = manifest_path.with_name(manifest_path.name + ".tmp")
        tmp_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_manifest.replace(manifest_path)

    print_report(
        stats=stats,
        input_file=input_file,
        output_all=output_all,
        output_browser=output_browser,
        rejected_log=rejected_log,
        manifest_path=manifest_path,
        strict_no_english=strict_no_english,
        drop_disambiguation=drop_disambiguation,
        sort_output=sort_output,
        browser_min_words=browser_min_words,
        browser_max_words=browser_max_words,
        shard_dir=shard_dir,
        shard_count=shard_count,
        shard_stats=shard_stats,
        dry_run=dry_run,
    )

    return stats


# =========================
# Reporting
# =========================

def print_report(
    stats: Counter,
    input_file: Path,
    output_all: Optional[Path],
    output_browser: Optional[Path],
    rejected_log: Optional[Path],
    manifest_path: Optional[Path],
    strict_no_english: bool,
    drop_disambiguation: bool,
    sort_output: bool,
    browser_min_words: int,
    browser_max_words: int,
    shard_dir: Optional[Path],
    shard_count: int,
    shard_stats: Optional[Dict[int, int]],
    dry_run: bool,
) -> None:
    rejected_total = sum(count for key, count in stats.items() if key.startswith("rejected:"))
    rejection_items = sorted(
        ((key.replace("rejected:", ""), count) for key, count in stats.items() if key.startswith("rejected:")),
        key=lambda item: item[1],
        reverse=True,
    )

    print("\n" + "=" * 58)
    print("BENGALI WIKIPEDIA TITLE CLEANING REPORT")
    print("=" * 58)
    print(f"Input file             : {input_file}")
    print(f"Output all titles      : {output_all if output_all else 'disabled'}")
    print(f"Output browser titles  : {output_browser if output_browser else 'disabled'}")
    print(f"Browser word range     : {browser_min_words}-{browser_max_words}")
    print(f"Shard dir              : {shard_dir if shard_dir else 'disabled'}")
    print(f"Shard count            : {shard_count}")
    print(f"Rejected log           : {rejected_log if rejected_log else 'disabled'}")
    print(f"Manifest               : {manifest_path if manifest_path else 'disabled'}")
    print(f"Strict no English      : {strict_no_english}")
    print(f"Drop disambiguation    : {drop_disambiguation}")
    print(f"Sorted output          : {sort_output}")
    print(f"Dry run                : {dry_run}")
    print("-" * 58)
    print(f"Total lines            : {stats['total']:,}")
    print(f"Kept all unique        : {stats['kept_all_unique']:,}")
    print(f"Duplicate all          : {stats['duplicate_all']:,}")
    print(f"Kept browser unique    : {stats['kept_browser_unique']:,}")
    print(f"Duplicate browser      : {stats['duplicate_browser']:,}")
    print(f"Browser skipped short  : {stats['browser_skipped_too_short']:,}")
    print(f"Browser skipped long   : {stats['browser_skipped_too_long']:,}")
    print(f"Rejected total         : {rejected_total:,}")
    print(f"Elapsed seconds        : {stats['elapsed_seconds']}")

    if shard_stats:
        shard_counts = list(shard_stats.values())
        print(f"Shard title count avg  : {sum(shard_counts) / len(shard_counts):,.1f}")
        print(f"Shard title count min  : {min(shard_counts):,}")
        print(f"Shard title count max  : {max(shard_counts):,}")

    if rejection_items:
        print("\nRejected by reason:")
        for reason, count in rejection_items:
            print(f"  {reason:<26} {count:,}")

    print("=" * 58)


# =========================
# CLI
# =========================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean Bengali Wikipedia ns0 titles and create a browser-safe 2-to-5-word title list."
    )

    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_FILE, help=f"Input title file. Default: {DEFAULT_INPUT_FILE}")
    parser.add_argument("--output-all", type=Path, default=DEFAULT_OUTPUT_ALL, help=f"Full cleaned title output. Default: {DEFAULT_OUTPUT_ALL}")
    parser.add_argument("--output-browser", type=Path, default=DEFAULT_OUTPUT_BROWSER, help=f"Browser-safe title output. Default: {DEFAULT_OUTPUT_BROWSER}")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST, help=f"JSON manifest output. Default: {DEFAULT_MANIFEST}")
    parser.add_argument("--shard-dir", type=Path, default=DEFAULT_SHARD_DIR, help=f"Directory for browser title shards. Default: {DEFAULT_SHARD_DIR}")
    parser.add_argument("--shard-count", type=int, default=64, help="Number of shard files to generate. Default: 64")
    parser.add_argument("--write-rejected", type=Path, default=None, help="Optional TSV file path to save rejected titles with reasons.")

    parser.add_argument("--allow-english", action="store_true", help="Allow mixed Bengali-English titles. Default rejects Latin letters.")
    parser.add_argument("--keep-disambiguation", action="store_true", help="Keep final bracketed text, e.g. 'ঢাকা (শহর)'.")
    parser.add_argument("--preserve-order", action="store_true", help="Preserve first-seen order instead of sorting output.")
    parser.add_argument("--keep-joiners", action="store_true", help="Keep ZWJ/ZWNJ instead of removing all Unicode format controls.")

    parser.add_argument("--browser-min-words", type=int, default=2, help="Minimum Bengali-token count for browser list. Default: 2")
    parser.add_argument("--browser-max-words", type=int, default=5, help="Maximum Bengali-token count for browser list. Default: 5")
    parser.add_argument("--min-chars", type=int, default=2, help="Minimum cleaned title length. Default: 2")
    parser.add_argument("--max-chars", type=int, default=150, help="Maximum cleaned title length. Default: 150")
    parser.add_argument("--min-useful-ratio", type=float, default=0.55, help="Minimum useful character ratio. Default: 0.55")
    parser.add_argument("--progress-every", type=int, default=100_000, help="Print progress every N lines. Use 0 to disable. Default: 100000")

    parser.add_argument("--no-output-all", action="store_true", help="Do not write the full cleaned title file.")
    parser.add_argument("--no-output-browser", action="store_true", help="Do not write the browser-safe title file.")
    parser.add_argument("--no-manifest", action="store_true", help="Do not write JSON manifest.")
    parser.add_argument("--no-shards", action="store_true", help="Do not write browser shard files.")
    parser.add_argument("--dry-run", action="store_true", help="Process and report only; do not write outputs.")

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    output_all = None if args.no_output_all else args.output_all
    output_browser = None if args.no_output_browser else args.output_browser
    manifest = None if args.no_manifest else args.manifest
    shard_dir = None if args.no_shards else args.shard_dir

    process_file(
        input_file=args.input,
        output_all=output_all,
        output_browser=output_browser,
        strict_no_english=not args.allow_english,
        drop_disambiguation=not args.keep_disambiguation,
        sort_output=not args.preserve_order,
        rejected_log=args.write_rejected,
        manifest_path=manifest,
        shard_dir=shard_dir,
        shard_count=args.shard_count,
        browser_min_words=args.browser_min_words,
        browser_max_words=args.browser_max_words,
        min_chars=args.min_chars,
        max_chars=args.max_chars,
        min_useful_ratio=args.min_useful_ratio,
        keep_joiners=args.keep_joiners,
        progress_every=args.progress_every,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()