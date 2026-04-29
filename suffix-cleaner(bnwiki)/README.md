# প্রত্যয় পরিষ্কারক / Suffix Cleaner

A small user script for Bengali Wikipedia (`bn.wikipedia.org`) that cleans common hyphenated Bengali suffix forms in source editing mode.

The script is designed for wiki source text. It adds a sidebar/toolbox button named **প্রত্যয় পরিষ্কারক**. When clicked, it processes either the selected text or, after confirmation, the whole edit box.

## Purpose

Bengali Wikipedia articles sometimes contain suffixes written with unnecessary hyphens, especially after Bengali words, numbers, and wiki links. This script helps convert those forms into cleaner Bengali spelling while avoiding unsafe wikitext areas.

Example:

```txt
বাংলা-এর → বাংলার
দেশ-এর → দেশের
বই-তে → বইতে
১৯৩২-এর → ১৯৩২ এর
[[আমেরিকান এক্সপেরিয়েন্স]]-এর → [[আমেরিকান এক্সপেরিয়েন্স|আমেরিকান এক্সপেরিয়েন্সের]]
```

## Main Features

### 1. Bengali word suffix cleanup

The script handles common Bengali suffixes:

```txt
-এর
-র
-কে
-তে
-এ
```

Examples:

```txt
বাংলা-এর → বাংলার
দেশ-এর → দেশের
বই-তে → বইতে
দেশ-এ → দেশে
বাংলা-এ → বাংলায়
ডিকশনারি-এ → ডিকশনারিতে
```

### 2. Special handling for `-এর`

For words ending in selected Bengali letters, the script uses `য়ের` instead of simply adding `ের`.

Handled endings include:

```txt
ং, ঙ, ই, ঈ, অ, আ, উ, ঊ, ঋ, এ, ঐ, ও, ঔ
```

Examples:

```txt
চ্যাং-এর → চ্যাংয়ের
এআই-এর → এআইয়ের
বই-এর → বইয়ের
```

### 3. Special handling for `-এ`

The script also handles location/case suffix `-এ` with context-based output.

Examples:

```txt
দেশ-এ → দেশে
বাংলা-এ → বাংলায়
ডিকশনারি-এ → ডিকশনারিতে
নদী-এ → নদীতে
এআই-এ → এআইয়ে
চ্যাং-এ → চ্যাংয়ে
```

### 4. Number suffix cleanup

For numbers, the script keeps a space instead of joining the suffix directly.

Examples:

```txt
১৯৩২-এর → ১৯৩২ এর
২-এর → ২ এর
''২''-এর → ২ এর
```

### 5. Wiki link suffix cleanup

The script converts suffixes after wiki links into piped links so the original link target is preserved.

Examples:

```txt
[[লাইসিডাস]]-এর
→ [[লাইসিডাস|লাইসিডাসের]]

"[[লাইসিডাস]]"-এর
→ "[[লাইসিডাস|লাইসিডাসের]]"

''[[লাইসিডাস]]''-এর
→ ''[[লাইসিডাস|লাইসিডাসের]]''

[[ডিকশনারি]]'-এ
→ [[ডিকশনারি|ডিকশনারিতে]]'
```

If the link already has a pipe, the script updates the display text while keeping the target unchanged.

Example:

```txt
[[Target|বাংলা]]-এর
→ [[Target|বাংলার]]
```

## Safety Behavior

The script avoids changing unsafe or sensitive wikitext areas, including:

```txt
Templates: {{...}}
Comments: <!-- ... -->
Nowiki/pre/code/math/source/syntaxhighlight blocks
External links
Category links
File/Image links
Template/Module/Special/Help/Wikipedia/User/Talk namespace links
Already protected wiki-link targets
```

This helps reduce accidental damage to templates, categories, file links, and technical markup.

## Interface Behavior

The script adds only one sidebar/toolbox link:

```txt
প্রত্যয় পরিষ্কারক
```

It does not add floating buttons or extra inline buttons.

When clicked in source edit mode, it cleans the selected text. If no text is selected, it asks for confirmation before processing the full edit box.

When clicked outside source edit mode or in visual editing mode, it shows a message and offers to open source edit mode.

## Edit Summary

When changes are made, the script appends this Bengali edit summary:

```txt
প্রত্যয় পরিষ্কারক: বাংলা হাইফেনযুক্ত প্রত্যয় সংশোধন
```

If the summary is already present, it will not duplicate it.

## Recent Changes Helper

The script also includes an optional Recent Changes helper. It can create a sidebar link for filtered recent changes using these parameters:

```txt
hidebots=1
hidecategorization=1
hideWikibase=1
hideWikifunctions=1
```

By default, automatic redirection is disabled:

```js
autoForceRecentChangesFilters: false
```

## Installation

Add the script to your Bengali Wikipedia user JavaScript page, for example:

```txt
Special:MyPage/common.js
```

or skin-specific JavaScript page such as:

```txt
Special:MyPage/vector.js
```

After saving, hard refresh the page:

```txt
Ctrl + F5
```

For debugging, you may open a page once with:

```txt
?debug=true
```

## Usage

1. Open a Bengali Wikipedia article in source edit mode.
2. Select the text you want to clean, or leave nothing selected to process the full page.
3. Click **প্রত্যয় পরিষ্কারক** from the sidebar/toolbox.
4. Review all changes carefully before publishing.
5. Save only after confirming the cleanup is correct.

## Important Notes

This script is a helper, not a replacement for human review. Bengali suffix usage can depend on grammar, pronunciation, context, and established article style. Always review the diff before publishing.

The script intentionally keeps number suffixes separated, for example:

```txt
১৯৩২-এর → ১৯৩২ এর
```

This avoids creating unnatural joined numeric forms.

## Known Limitations

Nested templates are protected using repeated regex passes, not a full wikitext parser. Very complex template structures may still need manual review.

The suffix rules are conservative and rule-based. Some uncommon Bengali forms may require manual correction.

Only Bengali Wikipedia is targeted. The script checks the wiki database name and exits outside `bnwiki`.

## Development Notes

Main functions:

```txt
cleanWikitext()
cleanWikiLinkSuffixes()
cleanNumericSuffixes()
cleanBengaliWordSuffixes()
appendSuffix()
appendErSuffix()
appendESuffix()
runCleaner()
```

The script exposes a small debug object in the browser console:

```js
window.bnwikiSuffixCleaner
```

Example console test:

```js
bnwikiSuffixCleaner.cleanWikitext('[[লাইসিডাস]]-এর').text
```

Expected output:

```txt
[[লাইসিডাস|লাইসিডাসের]]
```

## Suggested Test Cases

Before using widely, test these in a sandbox page:

```txt
বাংলা-এর
দেশ-এর
বই-এর
চ্যাং-এর
এআই-এর
দেশ-এ
বাংলা-এ
ডিকশনারি-এ
নদী-এ
১৯৩২-এর
''২''-এর
[[লাইসিডাস]]-এর
"[[লাইসিডাস]]"-এর
''[[লাইসিডাস]]''-এর
[[ডিকশনারি]]'-এ
[[Category:বাংলা]]-এর
{{lang|bn|বাংলা-এর}}
<nowiki>বাংলা-এর</nowiki>
```

Expected behavior: normal text and safe wiki-link display text should be cleaned; categories, templates, and nowiki content should remain unchanged.

## License

Use, modify, and improve as needed for Bengali Wikipedia cleanup work.