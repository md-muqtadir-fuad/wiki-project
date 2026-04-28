# Bengali Wikipedia Internal Link Helper

A Bengali Wikipedia userscript workflow for safely suggesting and inserting internal wikilinks in source-edit mode. The project currently has two parts:

1. `bnwiki-internal-links.js` — a MediaWiki userscript that analyzes the current article text, validates possible Bengali article titles through the Bengali Wikipedia API, and inserts selected internal links into the edit box.
2. `title-cleaner.py` — a Python utility for cleaning Bengali Wikipedia namespace-0 title dumps and generating clean title-list artifacts for dataset maintenance, testing, and future browser/list-based workflows.

The JavaScript script does **not** publish edits automatically. It only modifies the edit box and edit summary. Every generated change must be reviewed manually before publishing.

---

## Current JavaScript behavior

The updated JavaScript uses **MediaWiki API title lookup mode** by default:

```javascript
useMediaWikiApiTitleLookup: true
```

This means the userscript no longer needs to download a full GitHub title list in the browser. Instead, it generates possible title candidates from the current article text and asks the Bengali Wikipedia API which of those pages actually exist.

Important note: `CONFIG.titleListUrl` still exists in the configuration, but the current script does not use full title-list loading when `useMediaWikiApiTitleLookup` is `true`. Keep API lookup enabled for the current version.

---

## Main features

### Safe internal-link insertion

The script adds a toolbox/sidebar action named:

```text
অভ্যন্তরীণ লিঙ্ক যোগ করুন
```

When clicked, it scans the editable wikitext and inserts internal links only into safe, unprotected text areas.

### MediaWiki API validation

Instead of trusting a local title list, the script checks candidate titles against Bengali Wikipedia itself by using `mw.Api()`.

Relevant settings:

```javascript
useMediaWikiApiTitleLookup: true,
apiTitleBatchSize: 50,
maxApiCandidateTitles: 3000
```

The API request uses batches of candidate titles and accepts only existing namespace-0 pages.

### Longest-first phrase priority

Exact phrase matching currently prioritizes longer Bengali phrases first:

```javascript
phrasePriority: [5, 4, 3, 2]
```

Single-word exact linking is intentionally disabled:

```javascript
enableSingleWordLinks: false
```

This reduces false positives from common Bengali words.

### Pipe-link support

The script supports conservative suffix-based pipe links.

Example:

```wikitext
উত্তরপ্রদেশের → [[উত্তরপ্রদেশ|উত্তরপ্রদেশের]]
বাংলা ভাষার → [[বাংলা ভাষা|বাংলা ভাষার]]
```

Relevant settings:

```javascript
enablePipeLinks: true,
enableSuffixPipeLinks: true,
enableSimilarityPipeLinks: false,
pipeMatchMinSimilarity: 0.78,
pipePhrasePriority: [5, 4, 3, 2],
enableSingleWordPipeLinks: true,
allowSingleWordSimilarityPipeLinks: false
```

Current safety rule: suffix-based pipe matching is enabled, but general fuzzy/similarity pipe matching is disabled by default.

### Bengali suffix handling

The script can strip conservative Bengali suffixes only for checking whether the base form is a real title.

Examples of configured suffixes include:

```javascript
"গুলোর", "গুলিতে", "গুলোকে", "গুলো",
"গুলির", "গুলিকে", "গুলি",
"দেরকে", "দের",
"টির", "টিতে", "টিকে", "টি",
"ের", "কে", "তে", "য়", "য়ে", "য়", "ে", "র"
```

For multi-word phrases, the script normally strips only the last token. This avoids unsafe transformations inside names.

### Frequency control

Before linking, the script asks for a maximum frequency threshold. The default range is:

```javascript
minFrequency: 1,
maxFrequency: 3,
maxAllowedFrequency: 5
```

This means the script focuses on low-frequency article-specific words or phrases and avoids overlinking repeated terms.

### Maximum links per run

The script limits the number of links inserted in one run:

```javascript
maxLinksPerRun: 100
```

If more possible links are found, the script selects the safest top candidates based on phrase priority, method priority, similarity score, and occurrence order.

### First occurrence only

By default, each matched target title is linked only once:

```javascript
linkOnlyFirstOccurrence: true
```

This follows normal Wikipedia style and reduces repeated overlinking.

### Protected wikitext areas

The script avoids editing unsafe regions, including:

- Existing wikilinks
- Templates, including nested templates
- HTML comments
- External links and bare URLs
- `<nowiki>`, `<pre>`, `<source>`, `<syntaxhighlight>`, `<code>`, `<math>`, `<chem>`, `<gallery>`, `<poem>`, `<timeline>`, `<mapframe>`, and `<maplink>` blocks
- `<ref>...</ref>` and self-closing `<ref />` references
- Wiki tables
- Section headings

### Preview before applying

Before changing the edit box, the script shows a confirmation preview with:

- Frequency threshold
- Number of matched target titles
- Number of total possible links
- Number of links that will be applied
- Exact-link count
- Pipe-link count
- A sample list of proposed links

Relevant settings:

```javascript
previewBeforeApply: true,
previewListLimit: 40
```

### Edit summary

After applying links, the script appends a Bengali edit summary such as:

```text
৫টি অভ্যন্তরীণ সংযোগ যোগ করা হয়েছে
```

It avoids adding the same summary repeatedly.

### Source-edit mode support

If the user clicks the tool outside edit mode, the script redirects to source-edit mode with an auto-run query parameter:

```javascript
autoRunParam: "bnInternalLinker"
```

The script requires the normal source edit box `#wpTextbox1`. It is not designed for VisualEditor.

### UI placement and fallbacks

The script first tries to add the tool into normal MediaWiki portlets such as:

```javascript
p-tb, p-cactions, p-navigation, p-personal
```

If the current skin does not expose those areas normally, it tries Vector 2022 menu fallbacks. If all portlet insertion methods fail, it creates a small emergency floating button at the bottom-right of the page.

---

## Installation

Open your Bengali Wikipedia common.js page:

```text
https://bn.wikipedia.org/wiki/Special:MyPage/common.js
```

Add this line:

```javascript
mw.loader.load('/w/index.php?title=ব্যবহারকারী:Md._Muqtadir_Fuad/bnwiki-internal-links.js&action=raw&ctype=text/javascript');
```

If the script does not update after editing because of cache, add or update a version parameter:

```javascript
mw.loader.load('/w/index.php?title=ব্যবহারকারী:Md._Muqtadir_Fuad/bnwiki-internal-links.js&action=raw&ctype=text/javascript&v=2');
```

Then hard refresh the browser:

```text
Ctrl + Shift + R
```

The script loads these MediaWiki modules before initialization:

```javascript
mediawiki.util
mediawiki.api
```

---

## How to use the userscript

1. Open a Bengali Wikipedia article.
2. Use source edit mode, not VisualEditor.
3. Click **অভ্যন্তরীণ লিঙ্ক যোগ করুন** from the toolbox/sidebar/tools area.
4. Enter the maximum frequency threshold when prompted. The default is usually `3`.
5. Review the preview confirmation carefully.
6. Confirm only if the suggestions look reasonable.
7. Review the full edit diff before publishing.

The script never clicks publish/save by itself.

---

## Important configuration options

```javascript
maxPhraseWords: 5,
phrasePriority: [5, 4, 3, 2],
enableSingleWordLinks: false,

enablePipeLinks: true,
enableSuffixPipeLinks: true,
enableSimilarityPipeLinks: false,
pipeMatchMinSimilarity: 0.78,
pipePhrasePriority: [5, 4, 3, 2],
enableSingleWordPipeLinks: true,
allowSingleWordSimilarityPipeLinks: false,
maxPipeBucketScan: 300,

minFrequency: 1,
maxFrequency: 3,
askFrequencyThreshold: true,
maxAllowedFrequency: 5,

maxLinksPerRun: 100,
linkOnlyFirstOccurrence: true,
skipCurrentPageTitle: true,
previewBeforeApply: true,
previewListLimit: 40,

debug: false,
debugPipeCandidates: false,
debugNonMatchCandidates: false,
debugTestTitles: []
```

---

## Python title cleaner

`title-cleaner.py` cleans a raw Bengali Wikipedia namespace-0 title file and can create:

1. A full cleaned title list
2. A browser-safe 2-to-5-word title list
3. A JSON manifest
4. Deterministic title shards
5. An optional rejected-title TSV log

Default paths:

```python
DEFAULT_INPUT_FILE = Path("./bnwiki-internal-links/title-files/bnwiki-latest-all-titles-in-ns0")
DEFAULT_OUTPUT_DIR = Path("./bnwiki-internal-links/title-files")
DEFAULT_OUTPUT_ALL = DEFAULT_OUTPUT_DIR / "bnwiki-clean-titles-full.txt"
DEFAULT_OUTPUT_BROWSER = DEFAULT_OUTPUT_DIR / "bnwiki-clean-titles.txt"
DEFAULT_MANIFEST = DEFAULT_OUTPUT_DIR / "bnwiki-title-manifest.json"
DEFAULT_SHARD_DIR = DEFAULT_OUTPUT_DIR / "title-shards"
```

The current JavaScript API mode does not require this browser title file to run. The Python output is still useful for maintaining a clean title dataset, debugging title availability, publishing title artifacts, and supporting future optimized title-list or shard-based browser workflows.

---

## Python cleaner behavior

The cleaner normalizes and filters raw titles by applying these rules:

- Normalizes Unicode text with NFC
- Converts underscores to spaces
- Removes or preserves ZWJ/ZWNJ depending on `--keep-joiners`
- Removes control characters
- Optionally removes final disambiguation text such as `ঢাকা (শহর)` → `ঢাকা`
- Requires Bengali Unicode and at least one Bengali letter
- Rejects Latin letters by default
- Rejects namespace-like prefixes such as `ফাইল:`, `বিষয়শ্রেণী:`, `টেমপ্লেট:`, `Module:`, `Category:`, etc.
- Rejects date-like titles such as Bengali or English month-date titles
- Rejects titles starting with unsafe symbols
- Rejects mostly-symbol titles using a useful-character ratio
- De-duplicates full and browser outputs separately
- Sorts output by default

The browser-safe output is token-normalized and keeps only titles within the configured Bengali token range:

```text
2 to 5 Bengali tokens by default
```

---

## Python usage

Run with default paths:

```bash
python bnwiki-internal-links/title-cleaner.py
```

Run with explicit paths:

```bash
python bnwiki-internal-links/title-cleaner.py \
  --input "bnwiki-internal-links/title-files/bnwiki-latest-all-titles-in-ns0" \
  --output-all "bnwiki-internal-links/title-files/bnwiki-clean-titles-full.txt" \
  --output-browser "bnwiki-internal-links/title-files/bnwiki-clean-titles.txt" \
  --manifest "bnwiki-internal-links/title-files/bnwiki-title-manifest.json" \
  --shard-dir "bnwiki-internal-links/title-files/title-shards" \
  --shard-count 64 \
  --write-rejected "bnwiki-internal-links/title-files/rejected-titles.tsv"
```

On Windows CMD, use one line or replace the line-continuation style:

```cmd
python bnwiki-internal-links\title-cleaner.py --input "bnwiki-internal-links\title-files\bnwiki-latest-all-titles-in-ns0" --output-all "bnwiki-internal-links\title-files\bnwiki-clean-titles-full.txt" --output-browser "bnwiki-internal-links\title-files\bnwiki-clean-titles.txt" --manifest "bnwiki-internal-links\title-files\bnwiki-title-manifest.json" --shard-dir "bnwiki-internal-links\title-files\title-shards" --shard-count 64 --write-rejected "bnwiki-internal-links\title-files\rejected-titles.tsv"
```

---

## Useful Python options

Allow mixed Bengali-English titles:

```bash
python bnwiki-internal-links/title-cleaner.py --allow-english
```

Keep final disambiguation suffixes:

```bash
python bnwiki-internal-links/title-cleaner.py --keep-disambiguation
```

Preserve first-seen input order instead of sorting:

```bash
python bnwiki-internal-links/title-cleaner.py --preserve-order
```

Keep ZWJ/ZWNJ characters:

```bash
python bnwiki-internal-links/title-cleaner.py --keep-joiners
```

Change browser title word range:

```bash
python bnwiki-internal-links/title-cleaner.py --browser-min-words 2 --browser-max-words 5
```

Disable shard output:

```bash
python bnwiki-internal-links/title-cleaner.py --no-shards
```

Disable manifest output:

```bash
python bnwiki-internal-links/title-cleaner.py --no-manifest
```

Run without writing files:

```bash
python bnwiki-internal-links/title-cleaner.py --dry-run
```

Write rejected-title debug log:

```bash
python bnwiki-internal-links/title-cleaner.py --write-rejected "bnwiki-internal-links/title-files/rejected-titles.tsv"
```

---

## Generated files

Typical output structure:

```text
bnwiki-internal-links/
  bnwiki-internal-links.js
  title-cleaner.py
  title-files/
    bnwiki-latest-all-titles-in-ns0
    bnwiki-clean-titles-full.txt
    bnwiki-clean-titles.txt
    bnwiki-title-manifest.json
    rejected-titles.tsv
    title-shards/
      shard-00.txt
      shard-01.txt
      ...
      shard-63.txt
```

### `bnwiki-clean-titles-full.txt`

Full cleaned title list after validation and de-duplication.

### `bnwiki-clean-titles.txt`

Browser-safe title list containing only token-normalized Bengali titles within the selected word range. Default range: 2–5 words.

### `bnwiki-title-manifest.json`

Metadata about settings, stats, output file paths, byte sizes, SHA-256 hashes, and shard information.

### `title-shards/`

Deterministic shard files created from browser-safe titles. The shard algorithm is:

```text
fnv1a32(first_bengali_token) % shard_count
```

Default shard count:

```text
64
```

### `rejected-titles.tsv`

Optional debug file containing:

```text
line_no    reason    raw_title    cleaned_title
```

---

## Safety model

The project is intentionally conservative.

The script tries to reduce false positives by:

- Prioritizing longer phrases before shorter phrases
- Disabling exact single-word linking
- Validating candidate titles through the Bengali Wikipedia API
- Applying frequency thresholds
- Linking only the first occurrence of each target by default
- Avoiding protected wikitext regions
- Showing a confirmation preview before editing the textbox
- Limiting each run to a maximum number of inserted links
- Requiring manual review before publishing

Even with these protections, generated links can still be wrong. Always inspect the diff.

---

## Debugging

For browser-side debugging, enable:

```javascript
debug: true
```

Optional debug settings:

```javascript
debugPipeCandidates: true,
debugNonMatchCandidates: true,
debugTestTitles: ["বাংলা ভাষা", "উত্তরপ্রদেশ"]
```

Then open the browser console before running the tool.

Common debugging checks:

- Confirm the script loaded successfully in `common.js`
- Confirm source edit mode is being used
- Check whether the toolbox/sidebar link appears
- Check whether the emergency floating button appears
- Check browser console messages from `[bn-internal-linker]`
- Test a known title through `debugTestTitles`
- Confirm the frequency threshold is not too low
- Confirm the candidate is not inside a protected region such as a template, table, reference, heading, existing link, or URL

---

## Known limitations

- The script is for Bengali Wikipedia source-edit mode only.
- It does not support VisualEditor.
- It does not publish or save edits automatically.
- Exact single-word linking is disabled by design.
- General similarity-based fuzzy pipe linking is disabled by default.
- Suffix-based pipe links are conservative and may miss valid grammatical forms.
- Some false positives are still possible and must be removed manually before publishing.
- Very large articles can produce many candidates; the script caps API candidates and final inserted links for safety.

---

## Stopword sources

The internal stopword list was compiled from Bengali stopword resources including:

- Bengali StopWords — Ranks NL
- `bengali stop words.txt` by qwertyz15
- Bangla StopWords dataset by shohanursobuj
- `stopwords-bn` by stopwords-iso
- `extra-stopwords` by Xangis

The stopword list should remain conservative. Over-aggressive stopword filtering may prevent useful article links.

---

## Disclaimer

This tool directly modifies the browser edit box. It does not save the page, but it can still introduce incorrect links, unwanted pipe links, or formatting problems if suggestions are accepted without review.

Before publishing, always review the full Wikipedia diff and remove any incorrect, unnecessary, or style-violating links.