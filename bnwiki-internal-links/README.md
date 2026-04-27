# Bengali Wikipedia Internal Link Helper

A dual-component project designed to automate and assist with adding internal wikilinks to Bengali Wikipedia articles. This repository contains a MediaWiki User Script (JavaScript) for the Wikipedia editing interface and a Title Cleaner (Python) for generating the required dataset.

## Features

* **Smart Wikilinking:** Automatically finds 1–5 word Bengali phrases in unlinked text and converts them into internal links if they match an existing Wikipedia article.
* **Pipe-Link Support:** Intelligently handles suffix removals and morphological changes (e.g., `উত্তরপ্রদেশের` → `[[উত্তরপ্রদেশ|উত্তরপ্রদেশের]]`).
* **Frequency Control:** Links only low-frequency words (e.g., 1 to 3 occurrences) to prevent Wikipedia overlinking.
* **Syntax Protection:** Safely ignores existing links, templates, tables, HTML comments, and special tags (`<nowiki>`, `<ref>`, etc.).
* **Stopword Filtering:** Built-in comprehensive Bengali stopword list to prevent linking common grammatical words.
* **Title Data Processing:** Includes a Python pipeline to strip unwanted titles, disambiguation pages, and non-Bengali titles from Wikipedia dumps.

---

## Component 1: Python Title Cleaner

The `title-cleaner.py` script processes raw Bengali Wikipedia article titles and generates a clean, plain-text list (`bnwiki-clean-titles.txt`) used by the JavaScript linker.

### Usage

**Run normally:**
Filters out non-Bengali characters, disambiguation pages, and invalid titles.
```bash
python bnwiki-internal-links/title-cleaner.py
```

**Run with rejected-title debug log:**
Saves a TSV file of all the titles that were filtered out, along with the reason for rejection.
```bash
python bnwiki-internal-links/title-cleaner.py --write-rejected ./new-project/title-files/bnwiki-rejected-titles.tsv
```

**Allow mixed Bengali-English titles:**
```bash
python bnwiki-internal-links/title-cleaner.py --allow-english
```

**Keep disambiguation pages:**
```bash
python bnwiki-internal-links/title-cleaner.py --keep-disambiguation
```

---

## Component 2: MediaWiki User Script

The JavaScript file adds a sidebar/toolbox link named **"অভ্যন্তরীণ লিঙ্ক যোগ করুন"** (Add Internal Links) to the Bengali Wikipedia interface.

### Installation

1. Go to your Bengali Wikipedia common.js page:[Special:MyPage/common.js](https://bn.wikipedia.org/wiki/Special:MyPage/common.js)
2. Add the following line: `mw.loader.load('/w/index.php?title=ব্যবহারকারী:Md._Muqtadir_Fuad/bnwiki-internal-links.js&action=raw&ctype=text/javascript');`<br>
If the script does not update after editing, use a version number to bypass cache:
```mw.loader.load('/w/index.php?title=ব্যবহারকারী:Md._Muqtadir_Fuad/bnwiki-internal-links.js&action=raw&ctype=text/javascript&v=1');```
3. **Optional:** You may update the `CONFIG.titleListUrl` variable in the script to point to the raw GitHub URL of your generated `bnwiki-clean-titles.txt` file.
   ```javascript
   titleListUrl: "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/bnwiki-internal-links/title-files/bnwiki-clean-titles.txt",
   ```
4. Then hard refresh the browser: ```Ctrl + Shift + R```

### How to Use
1. Go to any Bengali Wikipedia article and click **Edit** (Source mode).
2. Look at the left sidebar (Toolbox/Tools) and click **"অভ্যন্তরীণ লিঙ্ক যোগ করুন"**.
3. A prompt will ask for the maximum frequency threshold (default is 3).
4. The script will analyze the text, show a preview of proposed links, and automatically apply them to the edit box.
5. **Always review the changes** before hitting "Publish changes".

---

## 📚 Acknowledgements & Stopword Sources

To prevent the script from linking common everyday words, the internal stopword engine was compiled using resources from the following excellent datasets and repositories:

* [Bengali StopWords - Ranks NL](https://www.ranks.nl/stopwords/bengali)

* [bengali stop words.txt by qwertyz15](https://github.com/qwertyz15/Data-Set/blob/master/bengali%20stop%20words.txt)
* [Bangla StopWords (700+) Dataset by shohanursobuj (Kaggle)](https://www.kaggle.com/datasets/shohanursobuj/bangla-stopwords)
* [stopwords-bn by stopwords-iso](https://github.com/stopwords-iso/stopwords-bn)
* [extra-stopwords by Xangis](https://github.com/Xangis/extra-stopwords)

---

## ⚠️ Disclaimer

This script modifies text directly in the browser's edit box. It does **not** automatically save the page. Approximately **15–25% of generated links may be false positives**, depending on the article and the text structure. Before publishing any edit made with this script, you must manually review the full diff and remove any incorrect or unnecessary links.

The user is entirely responsible for reviewing the generated diffs to ensure no formatting or syntax errors are introduced into live Wikipedia articles.