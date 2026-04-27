#!/usr/bin/env python3
"""
Clean Bengali Wikipedia ns0 title list.

Input:
    One title per line from bnwiki-latest-all-titles-in-ns0

Output:
    A cleaned, deduplicated Bengali title list.

Main features:
    - Unicode normalization
    - Removes hidden/control characters
    - Converts underscores to spaces
    - Optionally removes final disambiguation brackets
    - Removes pure English / non-Bengali / symbol-only titles
    - Removes date-only titles such as "১০ মার্চ", "৯ পৌষ"
    - Removes namespace-like noisy titles
    - Gives detailed rejection statistics
    - Optional rejected-title TSV log for debugging
"""

import argparse
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Optional, Tuple


# =========================
# Default file paths
# =========================

DEFAULT_INPUT_FILE = Path("./new-project/title-files/bnwiki-latest-all-titles-in-ns0")
DEFAULT_OUTPUT_FILE = Path("./new-project/title-files/bnwiki-clean-titles.txt")


# =========================
# Bengali month names
# =========================

BN_MONTHS = (
    "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
    "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
    "বৈশাখ", "জ্যৈষ্ঠ", "আষাঢ়", "শ্রাবণ", "ভাদ্র", "আশ্বিন",
    "কার্তিক", "অগ্রহায়ণ", "পৌষ", "মাঘ", "ফাল্গুন", "চৈত্র",
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

BENGALI_DIGITS = "০১২৩৪৫৬৭৮৯"
ASCII_DIGITS = "0123456789"
DIGIT_CLASS = r"0-9\u09E6-\u09EF"

MONTH_ALT = "|".join(
    re.escape(month)
    for month in sorted(BN_MONTHS, key=len, reverse=True)
)

# Reject examples:
#   ১০ মার্চ
#   ১০-মার্চ
#   ১০ মার্চ ১৯৭১
#   মার্চ ১০
#   মার্চ ১০, ১৯৭১
DATE_TITLE_PATTERNS = (
    re.compile(
        rf"^[{DIGIT_CLASS}]{{1,4}}\s*[-–—/]?\s*(?:{MONTH_ALT})(?:\s+[{DIGIT_CLASS}]{{1,4}})?$",
        re.UNICODE,
    ),
    re.compile(
        rf"^(?:{MONTH_ALT})\s+[{DIGIT_CLASS}]{{1,4}}(?:,?\s+[{DIGIT_CLASS}]{{1,4}})?$",
        re.UNICODE,
    ),
)

# Removes final disambiguation suffix:
#   ঢাকা (শহর) -> ঢাকা
#   জাভা_(প্রোগ্রামিং_ভাষা) -> জাভা
DISAMBIG_SUFFIX_RE = re.compile(r"\s*[\(\[\{][^)\]\}]{1,100}[\)\]\}]\s*$")


# =========================
# Text normalization helpers
# =========================

def normalize_spaces(text: str) -> str:
    """
    Collapse all whitespace characters into single normal spaces.
    """
    return re.sub(r"\s+", " ", text, flags=re.UNICODE).strip()


def remove_control_chars(text: str) -> str:
    """
    Remove hidden/control characters.

    This removes:
        - BOM
        - ZWJ/ZWNJ
        - bidi marks
        - other invisible Unicode control/format characters
    """
    return "".join(
        ch for ch in text
        if not unicodedata.category(ch).startswith("C")
    )


def clean_title_text(raw_title: str, drop_disambiguation: bool = True) -> str:
    """
    Clean the raw title text before validation.

    This function only normalizes the text.
    It does not decide whether the title should be kept or removed.
    """
    title = unicodedata.normalize("NFC", raw_title)
    title = title.replace("_", " ")
    title = remove_control_chars(title)
    title = normalize_spaces(title)

    if drop_disambiguation:
        title = DISAMBIG_SUFFIX_RE.sub("", title)
        title = normalize_spaces(title)

    return title


# =========================
# Character detection helpers
# =========================

def is_latin_letter(ch: str) -> bool:
    """
    Detect Latin letters, including accented Latin characters.

    Examples:
        A, z, é, ñ -> True
    """
    if not unicodedata.category(ch).startswith("L"):
        return False

    try:
        return "LATIN" in unicodedata.name(ch)
    except ValueError:
        return False


def contains_latin_letter(text: str) -> bool:
    return any(is_latin_letter(ch) for ch in text)


def is_bengali_letter(ch: str) -> bool:
    """
    True only for Bengali letters.

    Bengali digits, vowel signs, punctuation, etc. are not counted as letters.
    """
    return "\u0980" <= ch <= "\u09FF" and unicodedata.category(ch).startswith("L")


def contains_bengali_letter(text: str) -> bool:
    return any(is_bengali_letter(ch) for ch in text)


# =========================
# Filtering helpers
# =========================

def is_namespace_like(title: str) -> bool:
    """
    Reject namespace-style titles.
    """
    folded = title.casefold()
    bad_prefixes_folded = tuple(prefix.casefold() for prefix in BAD_PREFIXES)
    return folded.startswith(bad_prefixes_folded)


def is_date_title(title: str) -> bool:
    """
    Reject date-only titles such as:
        ১০ মার্চ
        ৯ পৌষ
        মার্চ ১০, ১৯৭১
    """
    return any(pattern.fullmatch(title) for pattern in DATE_TITLE_PATTERNS)


def starts_with_bad_symbol(title: str) -> bool:
    """
    Reject titles that begin with punctuation or symbols.

    Examples rejected:
        −১
        ≠মি
        (কিছু)

    Examples allowed:
        বাংলা
        ১৯৭১
        ২১ ফেব্রুয়ারি
    """
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
    """
    Estimate whether a title is mostly real text or mostly symbols.

    Spaces are ignored.
    Letters and numbers are considered useful.
    Some title-friendly punctuation is also considered useful.
    """
    chars = [ch for ch in title if not ch.isspace()]

    if not chars:
        return 0.0

    useful = 0

    for ch in chars:
        category = unicodedata.category(ch)

        if category.startswith("L") or category.startswith("N"):
            useful += 1
        elif ch in {"-", "–", "—", "'", "’", "।"}:
            useful += 1

    return useful / len(chars)


def validate_title(
    title: str,
    strict_no_english: bool = True,
    min_chars: int = 2,
    max_chars: int = 150,
    min_useful_ratio: float = 0.55,
) -> Tuple[bool, str]:
    """
    Validate a cleaned title.

    Returns:
        (True, "kept")
        (False, rejection_reason)
    """

    if not title:
        return False, "empty_after_cleaning"

    if len(title) < min_chars:
        return False, "too_short"

    if len(title) > max_chars:
        return False, "too_long"

    # Must contain something from Bengali Unicode block.
    # This removes pure English, Arabic, Hindi, number-only, symbol-only titles, etc.
    if not BENGALI_BLOCK_RE.search(title):
        return False, "no_bengali_unicode"

    # Must contain at least one Bengali letter, not only Bengali digits/signs.
    if not contains_bengali_letter(title):
        return False, "no_bengali_letter"

    # Strict mode removes mixed Bengali-English titles.
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
# Main processing function
# =========================

def process_file(
    input_file: Path,
    output_file: Path,
    strict_no_english: bool = True,
    drop_disambiguation: bool = True,
    sort_output: bool = True,
    rejected_log: Optional[Path] = None,
) -> None:
    """
    Read input file, clean titles, validate, deduplicate, and write output.
    """

    if not input_file.exists():
        raise FileNotFoundError(f"Input file not found: {input_file}")

    output_file.parent.mkdir(parents=True, exist_ok=True)

    seen = set()
    kept_titles = []
    stats = Counter()
    rejected_rows = []

    with input_file.open("r", encoding="utf-8", errors="replace") as f:
        for line_no, line in enumerate(f, start=1):
            stats["total"] += 1

            raw = line.rstrip("\n\r")
            cleaned = clean_title_text(
                raw,
                drop_disambiguation=drop_disambiguation,
            )

            is_valid, reason = validate_title(
                cleaned,
                strict_no_english=strict_no_english,
            )

            if not is_valid:
                stats[f"rejected:{reason}"] += 1

                if rejected_log is not None:
                    rejected_rows.append((line_no, reason, raw, cleaned))

                continue

            if cleaned in seen:
                stats["duplicate"] += 1
                continue

            seen.add(cleaned)
            kept_titles.append(cleaned)
            stats["kept"] += 1

    if sort_output:
        kept_titles.sort()

    with output_file.open("w", encoding="utf-8", newline="\n") as f:
        for title in kept_titles:
            f.write(title + "\n")

    if rejected_log is not None:
        rejected_log.parent.mkdir(parents=True, exist_ok=True)

        with rejected_log.open("w", encoding="utf-8", newline="\n") as f:
            f.write("line_no\treason\traw_title\tcleaned_title\n")

            for line_no, reason, raw, cleaned in rejected_rows:
                raw_safe = raw.replace("\t", " ").replace("\n", " ")
                cleaned_safe = cleaned.replace("\t", " ").replace("\n", " ")
                f.write(f"{line_no}\t{reason}\t{raw_safe}\t{cleaned_safe}\n")

    print("\n" + "=" * 45)
    print("BENGALI WIKIPEDIA TITLE CLEANING REPORT")
    print("=" * 45)
    print(f"Input file        : {input_file}")
    print(f"Output file       : {output_file}")
    print(f"Strict no English : {strict_no_english}")
    print(f"Drop disambig     : {drop_disambiguation}")
    print(f"Sorted output     : {sort_output}")
    print("-" * 45)
    print(f"Total lines       : {stats['total']:,}")
    print(f"Kept unique       : {stats['kept']:,}")
    print(f"Duplicates        : {stats['duplicate']:,}")

    rejected_total = sum(
        count for key, count in stats.items()
        if key.startswith("rejected:")
    )

    print(f"Rejected total    : {rejected_total:,}")

    print("\nRejected by reason:")

    rejection_items = sorted(
        (
            (key.replace("rejected:", ""), count)
            for key, count in stats.items()
            if key.startswith("rejected:")
        ),
        key=lambda item: item[1],
        reverse=True,
    )

    for reason, count in rejection_items:
        print(f"  {reason:<24} {count:,}")

    if rejected_log is not None:
        print(f"\nRejected log      : {rejected_log}")

    print("=" * 45)


# =========================
# CLI
# =========================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean Bengali Wikipedia ns0 title list."
    )

    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT_FILE,
        help=f"Input title file. Default: {DEFAULT_INPUT_FILE}",
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_FILE,
        help=f"Output clean title file. Default: {DEFAULT_OUTPUT_FILE}",
    )

    parser.add_argument(
        "--allow-english",
        action="store_true",
        help="Allow mixed Bengali-English titles. By default, Latin letters are rejected.",
    )

    parser.add_argument(
        "--keep-disambiguation",
        action="store_true",
        help="Keep final bracketed text, e.g. 'ঢাকা (শহর)'.",
    )

    parser.add_argument(
        "--preserve-order",
        action="store_true",
        help="Preserve first-seen order instead of sorting output alphabetically.",
    )

    parser.add_argument(
        "--write-rejected",
        type=Path,
        default=None,
        help="Optional TSV file path to save rejected titles with reasons.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    process_file(
        input_file=args.input,
        output_file=args.output,
        strict_no_english=not args.allow_english,
        drop_disambiguation=not args.keep_disambiguation,
        sort_output=not args.preserve_order,
        rejected_log=args.write_rejected,
    )


if __name__ == "__main__":
    main()