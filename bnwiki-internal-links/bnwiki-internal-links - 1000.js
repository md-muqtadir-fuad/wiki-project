// <nowiki>
/**
 * Bengali Wikipedia Internal Link Helper
 *
 * Purpose:
 *   Adds a sidebar/toolbox link named "অভ্যন্তরীণ লিঙ্ক যোগ করুন".
 *   When clicked in edit mode, it analyzes the wikitext, finds low-frequency
 *   Bengali words/phrases, checks them against a cleaned Bengali Wikipedia title list,
 *   and converts exact standalone 1–5 word matches into internal wikilinks.
 *
 * Intended site:
 *   https://bn.wikipedia.org
 *
 * Recommended installation:
 *   Put this script in your personal common.js:
 *   https://bn.wikipedia.org/wiki/Special:MyPage/common.js
 *
 * Important:
 *   This script does NOT automatically save the page.
 *   It modifies the edit box and edit summary only.
 *
 * Required:
 *   Replace CONFIG.titleListUrl with your own raw GitHub URL or another
 *   readable plain-text URL containing one clean title per line.
 */

(function (mw, $) {
    "use strict";

    // ============================================================
    // CONFIGURATION
    // ============================================================

    var CONFIG = {
        /**
         * Put your real raw title-list URL here.
         *
         * Example GitHub raw URL:
         *   https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/bnwiki-clean-titles.txt
         *
         * The file must contain:
         *   one Bengali Wikipedia title per line
         *   spaces instead of underscores
         */
        titleListUrl: "https://raw.githubusercontent.com/md-muqtadir-fuad/wiki-project/master/bnwiki-internal-links/title-files/bnwiki-clean-titles.txt",

        /**
         * Default frequency range.
         *
         * A word must appear at least minFrequency times and at most
         * maxFrequency times in the editable article text.
         */
        minFrequency: 1,
        maxFrequency: 3,

        /**
         * Maximum number of consecutive Bengali words to match as a title.
         *
         * Example:
         *   1 = বাংলাদেশ
         *   2 = বাংলা ভাষা
         *   3 = রবীন্দ্রনাথ ঠাকুর বিশ্ববিদ্যালয়
         *   4/5 = longer article titles
         */
        maxPhraseWords: 5,

        /**
         * Phrase matching priority.
         *
         * The script will try these phrase lengths in this exact order.
         * Single-word linking is intentionally disabled for now because
         * it creates too many false positives.
         */
        phrasePriority: [5, 4, 3, 2],

        /**
         * Disable 1-word linking for safer edits.
         * Later this can be enabled with stronger filters.
         */
        enableSingleWordLinks: false,

        /**
         * Maximum number of internal links added in one run.
         * If more matches are found, only the safest top matches are applied.
         */
        maxLinksPerRun: 100,

        /**
         * Debug mode.
         *
         * Keep true while testing. It prints useful information in the
         * browser console without changing the article. After the script
         * works as expected, set this to false.
         */
        debug: true,

        /**
         * Maximum rows to print in console debug tables.
         */
        debugPreviewLimit: 80,

        /**
        * Maximum raw debug candidate rows stored in memory.
        * Without this, large articles can create too many console rows.
        */
        debugCandidateRowLimit: 500,

        /**
         * If true, also log phrase candidates that share the same first word
         * but are not exact titles. Keep false for normal testing.
         */
        debugNonMatchCandidates: false,

        /**
         * Optional exact titles to test against the loaded title list and
         * current article text. Useful for checking why a 2–5 word title
         * is not being linked.
         */
        debugTestTitles: [
            "হিন্দি ভাষা",
            "উর্দু ভাষা",
            "উত্তর প্রদেশ",
            "মুন্সি প্রেমচাঁদ"
        ],

        /**
         * Allow user to change max frequency at runtime.
         * Example: 1 to 5.
         */
        askFrequencyThreshold: true,
        maxAllowedFrequency: 5,

        /**
         * Link only the first occurrence of each matched word.
         *
         * Recommended true, because overlinking the same word many times
         * is usually not desirable in Wikipedia articles.
         */
        linkOnlyFirstOccurrence: true,

        /**
         * Skip linking the current article title to itself.
         */
        skipCurrentPageTitle: true,

        /**
         * Show confirmation preview before applying changes.
         */
        previewBeforeApply: true,

        /**
         * Maximum matched words shown in the preview confirmation.
         */
        previewListLimit: 40,

        /**
         * Stopwords are ignored even if they appear in the title list.
         * Keep this list conservative.
         */
        enableStopwords: true,

        /**
         * Portlet location.
         *
         * p-tb = toolbox/sidebar area in most skins.
         * Other possible values: p-cactions, p-personal, p-navigation.
         */
        portletId: "p-tb",

        /**
         * Link label shown in the sidebar/toolbox.
         */
        portletLabel: "অভ্যন্তরীণ লিঙ্ক যোগ করুন",

        /**
         * Query parameter used for auto-running after redirecting to edit mode.
         */
        autoRunParam: "bnInternalLinker"
    };


    // ============================================================
    // BENGALI NUMBER CONVERSION
    // ============================================================

    /**
     * Converts English/Arabic numerals into Bengali numerals.
     *
     * Example:
     *   convert(123) -> "১২৩"
     */
    function convert(input) {
        var map = {
            "0": "০",
            "1": "১",
            "2": "২",
            "3": "৩",
            "4": "৪",
            "5": "৫",
            "6": "৬",
            "7": "৭",
            "8": "৮",
            "9": "৯"
        };

        return String(input).replace(/[0-9]/g, function (digit) {
            return map[digit];
        });
    }


    // ============================================================
    // STOPWORDS
    // ============================================================

    var STOPWORDS = new Set();

    `
    STOP WORD LIST GOES HERE
        `
        .split(/\n+/)
        .map(function (word) {
            return word.normalize("NFC").trim();
        })
        .filter(Boolean)
        .forEach(function (word) {
            STOPWORDS.add(word);
        });


    // ============================================================
    // REGEX AND BASIC TEXT HELPERS
    // ============================================================

    /**
     * Bengali block based token matcher.
     *
     * This catches Bengali letters and dependent vowel signs together.
     * It may also catch Bengali digits, so later we verify that the token
     * contains at least one Bengali letter.
     */
    var BN_TOKEN_RE = /[\u0980-\u09FF]+/g;

    /**
     * Detects at least one Bengali letter.
     *
     * Bengali Unicode block:
     *   U+0980 to U+09FF
     *
     * Bengali letters approximately:
     *   U+0985 to U+09B9
     *   U+09CE
     *   U+09DC to U+09DF
     */
    function hasBengaliLetter(text) {
        return /[\u0985-\u09B9\u09CE\u09DC-\u09DF]/.test(text);
    }

    /**
     * Normalizes a title or token for exact matching.
     */
    function normalizeTitle(text) {
        return String(text || "")
            .normalize("NFC")
            .replace(/_/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    /**
     * Checks whether a Bengali token is suitable for counting/linking.
     */
    function isUsefulBengaliToken(token) {
        if (!token) {
            return false;
        }

        if (!hasBengaliLetter(token)) {
            return false;
        }

        if (CONFIG.enableStopwords && STOPWORDS.has(token)) {
            return false;
        }

        // Avoid extremely short particles.
        if (token.length < 2) {
            return false;
        }

        return true;
    }


    // ============================================================
    // DEBUG HELPERS
    // ============================================================

    function debugLog() {
        if (!CONFIG.debug || !window.console) {
            return;
        }

        console.log.apply(console, arguments);
    }

    function debugWarn() {
        if (!CONFIG.debug || !window.console) {
            return;
        }

        console.warn.apply(console, arguments);
    }

    function debugTable(label, rows) {
        if (!CONFIG.debug || !window.console) {
            return;
        }

        console.groupCollapsed(label + " (" + rows.length + ")");
        console.table(rows.slice(0, CONFIG.debugPreviewLimit));
        if (rows.length > CONFIG.debugPreviewLimit) {
            console.log("Showing first", CONFIG.debugPreviewLimit, "of", rows.length, "rows.");
        }
        console.groupEnd();
    }

        function pushDebugRow(rows, row) {
        if (!CONFIG.debug) {
            return;
        }

        var limit = CONFIG.debugCandidateRowLimit || 500;

        if (rows.length < limit) {
            rows.push(row);
        }
    }

    // ============================================================
    // TITLE LIST LOADING AND TITLE INDEXING
    // ============================================================

    var titleDataPromise = null;

    /**
     * Splits a normalized title into Bengali word tokens.
     *
     * Important:
     *   This script intentionally matches only clean phrase titles where the
     *   article text contains the exact same Bengali words separated by normal
     *   whitespace. It does not perform stemming.
     *
     * Example:
     *   "হিন্দি ভাষা" -> ["হিন্দি", "ভাষা"]
     *   "ভাষার" will NOT match title "ভাষা" because that would require
     *   morphological analysis/stemming and could create wrong links.
     */
    function splitTitleWords(title) {
        var words = [];
        var match;
        var normalized = normalizeTitle(title);

        BN_TOKEN_RE.lastIndex = 0;

        while ((match = BN_TOKEN_RE.exec(normalized)) !== null) {
            var word = normalizeTitle(match[0]);

            if (hasBengaliLetter(word)) {
                words.push(word);
            }
        }

        return words;
    }

    function makeEmptyTitleData() {
        return {
            set: new Set(),
            byFirstWord: new Map(),
            maxWords: 1,
            stats: {
                rawLines: 0,
                indexedTitles: 0,
                skippedTooLong: 0,
                skippedNoBengali: 0,
                multiWordTitles: 0
            }
        };
    }

    /**
     * Builds an index for fast 1–5 word title matching.
     *
     * Structure:
     *   byFirstWord.get("উত্তর").byLength.get(2).has("উত্তর প্রদেশ")
     *
     * This is faster and more reliable than generating every possible n-gram
     * and then searching the whole 100k+ title Set repeatedly.
     */
    function addTitleToIndex(data, title) {
        var words = splitTitleWords(title);
        var maxPhraseWords = Math.max(1, Math.min(5, CONFIG.maxPhraseWords || 5));

        if (!words.length) {
            data.stats.skippedNoBengali++;
            return;
        }

        if (words.length > maxPhraseWords) {
            data.stats.skippedTooLong++;
            return;
        }

        var normalizedTitle = words.join(" ");
        var firstWord = words[0];
        var wordCount = words.length;

        data.set.add(normalizedTitle);

        if (!data.byFirstWord.has(firstWord)) {
            data.byFirstWord.set(firstWord, {
                maxLength: 1,
                byLength: new Map()
            });
        }

        var bucket = data.byFirstWord.get(firstWord);
        bucket.maxLength = Math.max(bucket.maxLength, wordCount);
        data.maxWords = Math.max(data.maxWords, wordCount);

        if (!bucket.byLength.has(wordCount)) {
            bucket.byLength.set(wordCount, new Set());
        }

        bucket.byLength.get(wordCount).add(normalizedTitle);
        data.stats.indexedTitles++;

        if (wordCount > 1) {
            data.stats.multiWordTitles++;
        }
    }

    /**
     * Loads the cleaned title list and builds both:
     *   1. titleData.set         -> O(1) exact lookup
     *   2. titleData.byFirstWord -> fast phrase matching, longest-first
     */
    function loadTitleData() {
        if (titleDataPromise) {
            return titleDataPromise;
        }

        titleDataPromise = fetch(CONFIG.titleListUrl, {
            method: "GET",
            cache: "force-cache",
            credentials: sameOrigin(CONFIG.titleListUrl) ? "same-origin" : "omit"
        })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Title list load failed: HTTP " + response.status);
                }
                return response.text();
            })
            .then(function (text) {
                var data = makeEmptyTitleData();

                text.split(/\r?\n/).forEach(function (line) {
                    data.stats.rawLines++;

                    var title = normalizeTitle(line);

                    if (!title) {
                        return;
                    }
                    if (!hasBengaliLetter(title)) {
                        data.stats.skippedNoBengali++;
                        return;
                    }

                    addTitleToIndex(data, title);
                });

                if (data.set.size === 0) {
                    throw new Error("Title list loaded, but no valid titles were found.");
                }

                debugLog("[bn-internal-linker] Title data loaded:", data.stats);
                debugLog("[bn-internal-linker] Title Set size:", data.set.size);
                debugLog("[bn-internal-linker] Indexed first-word buckets:", data.byFirstWord.size);
                debugLog("[bn-internal-linker] Max indexed title words:", data.maxWords);

                if (CONFIG.debugTestTitles && CONFIG.debugTestTitles.length) {
                    var testRows = CONFIG.debugTestTitles.map(function (title) {
                        var normalized = normalizeTitle(title);
                        var words = splitTitleWords(normalized);
                        return {
                            title: normalized,
                            words: words.join(" | "),
                            wordCount: words.length,
                            inTitleList: data.set.has(words.join(" ")),
                            firstWordBucketExists: words.length ? data.byFirstWord.has(words[0]) : false
                        };
                    });

                    debugTable("[bn-internal-linker] Debug test titles in loaded title list", testRows);
                }

                return data;
            });

        return titleDataPromise;
    }

    function sameOrigin(url) {
        try {
            return new URL(url, location.href).origin === location.origin;
        } catch (e) {
            return false;
        }
    }


    // ============================================================
    // WIKITEXT PROTECTION
    // ============================================================

    /**
     * This script should not link inside:
     *   - existing wikilinks
     *   - templates
     *   - categories/files already inside wikilinks
     *   - external links
     *   - comments
     *   - nowiki/source/code/ref/gallery/math/pre blocks
     *   - tables
     *   - headings
     *
     * We mark such regions as protected ranges and only process the remaining text.
     */

    function addRegexRanges(text, ranges, regex) {
        var match;

        regex.lastIndex = 0;

        while ((match = regex.exec(text)) !== null) {
            ranges.push({
                start: match.index,
                end: match.index + match[0].length
            });

            // Safety against zero-length regex loops.
            if (match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
        }
    }

    /**
     * Finds nested template ranges: {{ ... }}.
     *
     * Regex alone is not reliable for nested templates, so this uses a simple
     * brace-depth scanner.
     */
    function addTemplateRanges(text, ranges) {
        var stack = [];
        var i = 0;

        while (i < text.length - 1) {
            var two = text.slice(i, i + 2);

            if (two === "{{") {
                stack.push(i);
                i += 2;
                continue;
            }

            if (two === "}}" && stack.length > 0) {
                var start = stack.pop();

                if (stack.length === 0) {
                    ranges.push({
                        start: start,
                        end: i + 2
                    });
                }

                i += 2;
                continue;
            }

            i++;
        }
    }

    /**
     * Protect heading lines:
     *
     *   == ইতিহাস ==
     *
     * Linking inside section headings is usually undesirable.
     */
    function addHeadingRanges(text, ranges) {
        var regex = /^={2,6}[^=\n].*?={2,6}\s*$/gm;
        addRegexRanges(text, ranges, regex);
    }

    /**
     * Protect table blocks:
     *
     *   {| class="wikitable"
     *   ...
     *   |}
     */
        function addTableRanges(text, ranges) {
        /*
         * Protect wiki table blocks:
         *
         * {| class="wikitable"
         * ...
         * |}
         *
         * The older regex required "\n|}" exactly.
         * This version also handles spaces before |}.
         */
        var regex = /^\s*\{\|[\s\S]*?^\s*\|\}\s*$/gm;
        addRegexRanges(text, ranges, regex);
    }

    /**
     * Merge overlapping or adjacent ranges.
     */
    function mergeRanges(ranges) {
        if (!ranges.length) {
            return [];
        }

        ranges.sort(function (a, b) {
            return a.start - b.start || a.end - b.end;
        });

        var merged = [ranges[0]];

        for (var i = 1; i < ranges.length; i++) {
            var last = merged[merged.length - 1];
            var current = ranges[i];

            if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end);
            } else {
                merged.push(current);
            }
        }

        return merged;
    }

    function getProtectedRanges(text) {
        var ranges = [];

        // HTML comments
        addRegexRanges(text, ranges, /<!--[\s\S]*?-->/g);

        // Existing wikilinks, including categories/files because they are also wikilinks.
        addRegexRanges(text, ranges, /\[\[[\s\S]*?\]\]/g);

        // External bracket links: [https://example.com label]
        addRegexRanges(text, ranges, /\[[a-z][a-z0-9+.-]*:\/\/[^\]\n]+?\]/gi);

        // Bare URLs
        addRegexRanges(text, ranges, /https?:\/\/[^\s<>{}\[\]|]+/gi);

        // Common non-linkable tags.
        addRegexRanges(
            text,
            ranges,
            /<\s*(nowiki|pre|source|syntaxhighlight|code|math|chem|score|gallery|poem|timeline|mapframe|maplink)\b[\s\S]*?<\s*\/\s*\1\s*>/gi
        );

        // References. Usually we should not alter references automatically.
        addRegexRanges(
            text,
            ranges,
            /<\s*ref\b[\s\S]*?(?:<\s*\/\s*ref\s*>|\/\s*>)/gi
        );

        addTemplateRanges(text, ranges);
        addTableRanges(text, ranges);
        addHeadingRanges(text, ranges);

        return mergeRanges(ranges);
    }

    /**
     * Splits text into protected and editable segments.
     */
    function splitByProtectedRanges(text, ranges) {
        var segments = [];
        var cursor = 0;

        ranges.forEach(function (range) {
            if (cursor < range.start) {
                segments.push({
                    text: text.slice(cursor, range.start),
                    protected: false
                });
            }

            segments.push({
                text: text.slice(range.start, range.end),
                protected: true
            });

            cursor = range.end;
        });

        if (cursor < text.length) {
            segments.push({
                text: text.slice(cursor),
                protected: false
            });
        }

        return segments;
    }


    // ============================================================
    // TOKEN COLLECTION AND PHRASE MATCHING
    // ============================================================

    /**
     * Collect Bengali token positions from an editable segment.
     *
     * Each token keeps:
     *   raw   -> original surface text
     *   word  -> normalized word
     *   start -> start index inside segment text
     *   end   -> end index inside segment text
     */
    function collectBengaliTokens(text) {
        var tokens = [];
        var match;

        BN_TOKEN_RE.lastIndex = 0;

        while ((match = BN_TOKEN_RE.exec(text)) !== null) {
            var raw = match[0];
            var normalized = normalizeTitle(raw);

            if (!hasBengaliLetter(normalized)) {
                continue;
            }

            tokens.push({
                raw: raw,
                word: normalized,
                start: match.index,
                end: match.index + raw.length
            });
        }

        return tokens;
    }

    function canJoinTokensByWhitespace(text, leftToken, rightToken) {
        var between = text.slice(leftToken.end, rightToken.start);

        // Phrase matching should only cross normal whitespace.
        // It should NOT cross punctuation, commas, full stops, pipes, brackets, etc.
        return /^\s+$/.test(between);
    }

    /**
     * Count exact title candidate frequency.
     *
     * Instead of counting every possible n-gram, this function checks only
     * candidates that can exist according to the first-word title index.
     */
    // ============================================================
    // ============================================================
    // PHRASE PRIORITY HELPERS
    // ============================================================

    /**
     * Returns the exact phrase lengths this run is allowed to link.
     *
     * Current safe default:
     *   5-word titles first, then 3-word titles, then 2-word titles.
     *
     * 1-word titles are excluded unless CONFIG.enableSingleWordLinks is true.
     */
    function getEffectivePhrasePriority() {
        var maxPhraseWords = Math.max(1, Math.min(5, CONFIG.maxPhraseWords || 5));
        var source = Array.isArray(CONFIG.phrasePriority) ? CONFIG.phrasePriority : [5, 3, 2];
        var seen = new Set();
        var result = [];

        source.forEach(function (value) {
            var n = parseInt(value, 10);

            if (!Number.isFinite(n) || n < 1 || n > maxPhraseWords) {
                return;
            }

            if (n === 1 && !CONFIG.enableSingleWordLinks) {
                return;
            }

            if (!seen.has(n)) {
                seen.add(n);
                result.push(n);
            }
        });

        // If single-word linking is intentionally enabled later, keep it last.
        if (CONFIG.enableSingleWordLinks && maxPhraseWords >= 1 && !seen.has(1)) {
            result.push(1);
        }

        return result;
    }

    function getAllowedPhraseLengthSet() {
        return new Set(getEffectivePhrasePriority());
    }

    function getPhrasePriorityRank(wordCount) {
        var priority = getEffectivePhrasePriority();
        var index = priority.indexOf(wordCount);

        return index === -1 ? 999 : index;
    }

    function getMaxLinksPerRun() {
        var n = parseInt(CONFIG.maxLinksPerRun, 10);

        if (!Number.isFinite(n) || n < 1) {
            return 100;
        }

        return n;
    }

    /**
     * Count exact title candidate frequency.
     *
     * Important change:
     *   This now counts ONLY the configured phrase lengths.
     *   With the current config, that means 5-word, 3-word and 2-word titles.
     *   It does not count 4-word titles or 1-word titles unless enabled in CONFIG.
     */
        function countTitleCandidateFrequencies(segments, titleData) {
        var freq = new Map();
        var debugCandidates = [];
        var phrasePriority = getEffectivePhrasePriority();
        var allowedLengths = new Set(phrasePriority);
        var maxPhraseWords = phrasePriority.length ? Math.max.apply(null, phrasePriority) : 0;

        if (!phrasePriority.length) {
            debugLog("[bn-internal-linker] No phrase lengths enabled. Check CONFIG.phrasePriority.");
            return freq;
        }

        segments.forEach(function (segment, segmentIndex) {
            if (segment.protected) {
                return;
            }

            var text = segment.text;
            var tokens = collectBengaliTokens(text);

            for (var i = 0; i < tokens.length; i++) {
                var firstWord = tokens[i].word;
                var bucket = titleData.byFirstWord.get(firstWord);

                if (!bucket) {
                    continue;
                }

                var maxN = Math.min(maxPhraseWords, bucket.maxLength, tokens.length - i);
                var phraseWords = [];

                for (var n = 1; n <= maxN; n++) {
                    var currentToken = tokens[i + n - 1];

                    if (n > 1) {
                        var previousToken = tokens[i + n - 2];

                        if (!canJoinTokensByWhitespace(text, previousToken, currentToken)) {
                            break;
                        }
                    }

                    phraseWords.push(currentToken.word);

                    if (!allowedLengths.has(n)) {
                        continue;
                    }

                    var titleSetForLength = bucket.byLength.get(n);

                    if (!titleSetForLength) {
                        continue;
                    }

                    var phrase = phraseWords.join(" ");

                    if (n === 1 && !isUsefulBengaliToken(phrase)) {
                        pushDebugRow(debugCandidates, {
                            candidate: phrase,
                            wordCount: n,
                            segment: segmentIndex,
                            reason: "single_word_stopword_or_too_short"
                        });
                        continue;
                    }

                    if (titleSetForLength.has(phrase)) {
                        freq.set(phrase, (freq.get(phrase) || 0) + 1);

                        pushDebugRow(debugCandidates, {
                            candidate: phrase,
                            wordCount: n,
                            segment: segmentIndex,
                            reason: "title_candidate_counted"
                        });
                    } else if (CONFIG.debugNonMatchCandidates) {
                        pushDebugRow(debugCandidates, {
                            candidate: phrase,
                            wordCount: n,
                            segment: segmentIndex,
                            reason: "same_first_word_but_not_exact_title"
                        });
                    }
                }
            }
        });

        debugTable("[bn-internal-linker] Raw title candidates scanned", debugCandidates);

        debugLog("[bn-internal-linker] Candidate frequency map size:", freq.size);
        debugLog("[bn-internal-linker] Effective phrase priority:", phrasePriority);
        debugLog("[bn-internal-linker] Title list size:", titleData.set.size);

        return freq;
    }

    function getLowFrequencyTitleMatches(freq, titleData, threshold) {
        var matches = new Set();
        var acceptedRows = [];
        var rejectedRows = [];
        var currentTitle = normalizeTitle(mw.config.get("wgTitle"));
        var allowedLengths = getAllowedPhraseLengthSet();

        freq.forEach(function (count, title) {
            var words = splitTitleWords(title);
            var wordCount = words.length;

            if (!allowedLengths.has(wordCount)) {
                if (CONFIG.debug) {
                    rejectedRows.push({
                        title: title,
                        count: count,
                        wordCount: wordCount,
                        reason: "phrase_length_not_allowed"
                    });
                }
                return;
            }

            if (count < CONFIG.minFrequency || count > threshold) {
                if (CONFIG.debug) {
                    rejectedRows.push({
                        title: title,
                        count: count,
                        wordCount: wordCount,
                        reason: "frequency_out_of_range"
                    });
                }
                return;
            }

            if (CONFIG.skipCurrentPageTitle && title === currentTitle) {
                if (CONFIG.debug) {
                    rejectedRows.push({
                        title: title,
                        count: count,
                        wordCount: wordCount,
                        reason: "current_page_title"
                    });
                }
                return;
            }

            if (!titleData.set.has(title)) {
                if (CONFIG.debug) {
                    rejectedRows.push({
                        title: title,
                        count: count,
                        wordCount: wordCount,
                        reason: "not_in_title_set"
                    });
                }
                return;
            }

            matches.add(title);

            if (CONFIG.debug) {
                acceptedRows.push({
                    title: title,
                    count: count,
                    wordCount: wordCount,
                    priorityRank: getPhrasePriorityRank(wordCount),
                    reason: "accepted"
                });
            }
        });

        debugTable("[bn-internal-linker] Accepted low-frequency title matches", acceptedRows);
        debugTable("[bn-internal-linker] Rejected title candidates", rejectedRows);

        return matches;
    }

    // ============================================================
    // LINK APPLICATION
    // ============================================================

    function makeWikiLink(targetTitle, displayText) {
        var normalizedDisplay = normalizeTitle(displayText);

        if (normalizedDisplay === targetTitle) {
            return "[[" + targetTitle + "]]";
        }

        return "[[" + targetTitle + "|" + displayText + "]]";
    }

    /**
     * Finds the highest-priority phrase match starting at one token.
     *
     * Current order:
     *   5-word phrase -> 3-word phrase -> 2-word phrase
     *
     * This intentionally avoids 1-word links unless CONFIG.enableSingleWordLinks
     * is set to true.
     */
    function findPriorityPhraseAtStart(text, tokens, startIndex, matches) {
        var priority = getEffectivePhrasePriority();

        for (var p = 0; p < priority.length; p++) {
            var n = priority[p];

            if (startIndex + n > tokens.length) {
                continue;
            }

            var phraseWords = [];
            var canJoin = true;

            for (var j = 0; j < n; j++) {
                var currentToken = tokens[startIndex + j];

                if (j > 0) {
                    var previousToken = tokens[startIndex + j - 1];

                    if (!canJoinTokensByWhitespace(text, previousToken, currentToken)) {
                        canJoin = false;
                        break;
                    }
                }

                phraseWords.push(currentToken.word);
            }

            if (!canJoin) {
                continue;
            }

            var phrase = phraseWords.join(" ");

            if (matches.has(phrase)) {
                return {
                    title: phrase,
                    start: tokens[startIndex].start,
                    end: tokens[startIndex + n - 1].end,
                    tokenCount: n,
                    priorityRank: p
                };
            }
        }

        return null;
    }

    /**
     * Collect all possible link insertions from editable segments.
     *
     * This does not modify text yet. We first collect candidates, then choose
     * the top safest candidates globally, so a 100-link limit does not simply
     * mean "first 100 from the top of the article".
     */
    function collectLinkCandidates(segments, matches, freq) {
        var candidates = [];
        var globalOffset = 0;

        segments.forEach(function (segment, segmentIndex) {
            if (!segment.protected) {
                var text = segment.text;
                var tokens = collectBengaliTokens(text);

                for (var i = 0; i < tokens.length; i++) {
                    var best = findPriorityPhraseAtStart(text, tokens, i, matches);

                    if (!best) {
                        continue;
                    }

                    var displayText = text.slice(best.start, best.end);

                    candidates.push({
                        title: best.title,
                        displayText: displayText,
                        segmentIndex: segmentIndex,
                        start: best.start,
                        end: best.end,
                        globalStart: globalOffset + best.start,
                        globalEnd: globalOffset + best.end,
                        tokenCount: best.tokenCount,
                        priorityRank: best.priorityRank,
                        frequency: freq && freq.get(best.title) ? freq.get(best.title) : 0,
                        sourceOrder: candidates.length
                    });
                }
            }

            globalOffset += segment.text.length;
        });

        return candidates;
    }

    function rangesOverlap(a, b) {
        return a.globalStart < b.globalEnd && b.globalStart < a.globalEnd;
    }

    /**
     * Select the safest candidates under CONFIG.maxLinksPerRun.
     *
     * Ranking logic:
     *   1. Phrase priority: 5-word first, then 3-word, then 2-word.
     *   2. Lower frequency first: rarer title candidates are usually safer.
     *   3. Longer title text first.
     *   4. Earlier source order as final tie-breaker.
     */
    function selectTopSafeCandidates(candidates) {
        var maxLinks = getMaxLinksPerRun();
        var sorted = candidates.slice().sort(function (a, b) {
            return (a.priorityRank - b.priorityRank) ||
                (a.frequency - b.frequency) ||
                (b.tokenCount - a.tokenCount) ||
                (b.title.length - a.title.length) ||
                (a.sourceOrder - b.sourceOrder);
        });

        var selected = [];
        var selectedTitles = new Set();

        sorted.forEach(function (candidate) {
            if (selected.length >= maxLinks) {
                return;
            }

            if (CONFIG.linkOnlyFirstOccurrence && selectedTitles.has(candidate.title)) {
                return;
            }

            for (var i = 0; i < selected.length; i++) {
                if (rangesOverlap(candidate, selected[i])) {
                    return;
                }
            }

            selected.push(candidate);
            selectedTitles.add(candidate.title);
        });

        // Apply changes from left to right so character offsets remain valid.
        selected.sort(function (a, b) {
            return a.globalStart - b.globalStart;
        });

        return selected;
    }

    function applySelectedCandidatesToSegments(segments, selectedCandidates) {
        var bySegment = new Map();

        selectedCandidates.forEach(function (candidate) {
            if (!bySegment.has(candidate.segmentIndex)) {
                bySegment.set(candidate.segmentIndex, []);
            }

            bySegment.get(candidate.segmentIndex).push(candidate);
        });

        return segments.map(function (segment, segmentIndex) {
            if (segment.protected || !bySegment.has(segmentIndex)) {
                return segment.text;
            }

            var candidates = bySegment.get(segmentIndex).sort(function (a, b) {
                return a.start - b.start;
            });

            var output = "";
            var cursor = 0;

            candidates.forEach(function (candidate) {
                if (candidate.start < cursor) {
                    return;
                }

                var displayText = segment.text.slice(candidate.start, candidate.end);

                output += segment.text.slice(cursor, candidate.start);
                output += makeWikiLink(candidate.title, displayText);
                cursor = candidate.end;
            });

            output += segment.text.slice(cursor);

            return output;
        }).join("");
    }

    function applyLinksToSegments(segments, matches, freq) {
        var candidates = collectLinkCandidates(segments, matches, freq);
        var selectedCandidates = selectTopSafeCandidates(candidates);
        var linkedTitles = new Set();

        selectedCandidates.forEach(function (candidate) {
            linkedTitles.add(candidate.title);
        });

        if (CONFIG.debug) {
            debugTable("[bn-internal-linker] All possible link candidates", candidates.map(function (candidate) {
                return {
                    title: candidate.title,
                    displayText: candidate.displayText,
                    wordCount: candidate.tokenCount,
                    frequency: candidate.frequency,
                    priorityRank: candidate.priorityRank,
                    segment: candidate.segmentIndex,
                    globalStart: candidate.globalStart
                };
            }));

            debugTable("[bn-internal-linker] Selected safe link candidates", selectedCandidates.map(function (candidate) {
                return {
                    title: candidate.title,
                    displayText: candidate.displayText,
                    wordCount: candidate.tokenCount,
                    frequency: candidate.frequency,
                    priorityRank: candidate.priorityRank,
                    segment: candidate.segmentIndex,
                    globalStart: candidate.globalStart,
                    reason: "selected_for_insertion"
                };
            }));
        }

        return {
            text: applySelectedCandidatesToSegments(segments, selectedCandidates),
            addedLinks: selectedCandidates.length,
            linkedTitles: Array.from(linkedTitles).sort(),
            totalCandidates: candidates.length,
            maxLinks: getMaxLinksPerRun(),
            limited: candidates.length > selectedCandidates.length
        };
    }

    // ============================================================
    // EDIT SUMMARY AND UI HELPERS
    // ============================================================

    function appendEditSummary(addedLinks) {
        var $summary = $("#wpSummary");

        if (!$summary.length) {
            return;
        }

        var newSummary = convert(addedLinks) + "টি অভ্যন্তরীণ সংযোগ যোগ করা হয়েছে";
        var oldSummary = String($summary.val() || "").trim();

        if (!oldSummary) {
            $summary.val(newSummary).trigger("input").trigger("change");
            return;
        }

        // Avoid adding the same summary repeatedly.
        if (oldSummary.indexOf(newSummary) !== -1) {
            return;
        }

        $summary.val(oldSummary + "; " + newSummary).trigger("input").trigger("change");
    }

    function setStatus(message, type) {
        type = type || "notice";

        mw.notify(message, {
            type: type,
            tag: "bn-internal-linker-status",
            autoHide: type !== "error"
        });
    }

    function askThreshold() {
        if (!CONFIG.askFrequencyThreshold) {
            return CONFIG.maxFrequency;
        }

        var defaultValue = String(CONFIG.maxFrequency);

                var answer = window.prompt(
            "যে শিরোনাম/phrase ১ থেকে কতবার এসেছে, সেগুলো পরীক্ষা করা হবে?\n" +
            "সাধারণত ৩ ভালো। টেস্টের জন্য ৫ ব্যবহার করতে পারেন। সর্বোচ্চ " + convert(CONFIG.maxAllowedFrequency) + " দিন।",
            defaultValue
        );

        if (answer === null) {
            return null;
        }

        var parsed = parseInt(answer, 10);

        if (!Number.isFinite(parsed)) {
            parsed = CONFIG.maxFrequency;
        }

        parsed = Math.max(1, Math.min(CONFIG.maxAllowedFrequency, parsed));

        return parsed;
    }

    function confirmPreview(result, matchedTitleCount, threshold) {
        if (!CONFIG.previewBeforeApply) {
            return true;
        }

        var list = result.linkedTitles
            .slice(0, CONFIG.previewListLimit)
            .map(function (title) {
                return "• " + title;
            })
            .join("\n");

        var remaining = result.linkedTitles.length - CONFIG.previewListLimit;

        if (remaining > 0) {
            list += "\n... আরও " + convert(remaining) + "টি";
        }

        var message =
            "অভ্যন্তরীণ লিঙ্ক প্রিভিউ\n\n" +
            "ফ্রিকোয়েন্সি সীমা: ১–" + convert(threshold) + "\n" +
            "ম্যাচ করা শিরোনাম: " + convert(matchedTitleCount) + "টি\n" +
            "যোগ হবে এমন লিঙ্ক: " + convert(result.addedLinks) + "টি\n\n" +
            "নমুনা:\n" + (list || "কোনোটি নেই") + "\n\n" +
            "এগুলো edit box-এ প্রয়োগ করবেন?";

        return window.confirm(message);
    }


    // ============================================================
    // EDITOR READ/WRITE HELPERS
    // ============================================================

    /**
     * Safely reads the active MediaWiki source editor.
     *
     * Direct textarea .val() does not always sync correctly when WikiEditor
     * or CodeMirror/syntax highlighter is active. jquery.textSelection is
     * safer for MediaWiki user scripts.
     */
    function getEditorText($textbox) {
        try {
            if ($.fn.textSelection) {
                return $textbox.textSelection("getContents");
            }
        } catch (e) {
            debugWarn("[bn-internal-linker] textSelection getContents failed, falling back to val()", e);
        }

        return $textbox.val();
    }

    /**
     * Safely writes text back into the active MediaWiki source editor.
     */
    function setEditorText($textbox, text) {
        try {
            if ($.fn.textSelection) {
                $textbox.textSelection("setContents", text);
                $textbox.trigger("input").trigger("change");
                return true;
            }
        } catch (e) {
            debugWarn("[bn-internal-linker] textSelection setContents failed, falling back to val()", e);
        }

        $textbox.val(text).trigger("input").trigger("change");
        return true;
    }


    // ============================================================
    // MAIN WORKFLOW
    // ============================================================

    function redirectToEditMode() {
        var pageName = mw.config.get("wgPageName");

        var query = {
            action: "edit"
        };

        query[CONFIG.autoRunParam] = "1";

        var editUrl = mw.util.getUrl(pageName, query);

        window.location.href = editUrl;
    }

    function isEditMode() {
        var action = mw.config.get("wgAction");

        // action=submit can happen after preview/show changes.
        return action === "edit" || action === "submit";
    }

    function runInternalLinker() {
        if (!isEditMode()) {
            redirectToEditMode();
            return;
        }

        var $textbox = $("#wpTextbox1");

        if (!$textbox.length) {
            setStatus("সম্পাদনা বাক্স পাওয়া যায়নি। VisualEditor নয়, source edit mode ব্যবহার করুন।", "error");
            return;
        }

        var threshold = askThreshold();

        if (threshold === null) {
            setStatus("অভ্যন্তরীণ লিঙ্ক যোগ করা বাতিল করা হয়েছে।", "warn");
            return;
        }

        var originalText = getEditorText($textbox);

        if (!originalText || !originalText.trim()) {
            setStatus("সম্পাদনা বাক্স খালি।", "error");
            return;
        }

        setStatus("শিরোনাম তালিকা লোড হচ্ছে…");

        loadTitleData()
            .then(function (titleData) {
                setStatus("নিবন্ধের ৫-শব্দ, ৩-শব্দ ও ২-শব্দের শিরোনাম বিশ্লেষণ করা হচ্ছে…");

                var protectedRanges = getProtectedRanges(originalText);
                var segments = splitByProtectedRanges(originalText, protectedRanges);

                debugLog("[bn-internal-linker] Protected ranges:", protectedRanges.length);
                debugLog("[bn-internal-linker] Segments:", segments.length);

                var freq = countTitleCandidateFrequencies(segments, titleData);
                var matches = getLowFrequencyTitleMatches(freq, titleData, threshold);

                if (CONFIG.debugTestTitles && CONFIG.debugTestTitles.length) {
                    var testRows = CONFIG.debugTestTitles.map(function (title) {
                        var normalized = normalizeTitle(title);
                        var words = splitTitleWords(normalized);
                        var cleanTitle = words.join(" ");

                        return {
                            title: cleanTitle,
                            inTitleList: titleData.set.has(cleanTitle),
                            foundInArticleFrequency: freq.get(cleanTitle) || 0,
                            acceptedAsMatch: matches.has(cleanTitle),
                            note: titleData.set.has(cleanTitle) ?
                                "title exists in list" :
                                "title missing from cleaned title list"
                        };
                    });

                    debugTable("[bn-internal-linker] Debug test titles in current article", testRows);
                }

                if (matches.size === 0) {
                    setStatus("ম্যাচ করা কোনো কম-ফ্রিকোয়েন্সি শিরোনাম পাওয়া যায়নি। Console debug দেখুন।", "warn");
                    return;
                }

                setStatus("ম্যাচ পাওয়া গেছে। লিঙ্ক প্রস্তাব তৈরি হচ্ছে…");

                var result = applyLinksToSegments(segments, matches, freq);

                if (result.addedLinks === 0 || result.text === originalText) {
                    setStatus("নতুন কোনো লিঙ্ক যোগ করার মতো নিরাপদ স্থান পাওয়া যায়নি। Console debug দেখুন।", "warn");
                    return;
                }

                if (!confirmPreview(result, matches.size, threshold)) {
                    setStatus("প্রিভিউ দেখে পরিবর্তন বাতিল করা হয়েছে।", "warn");
                    return;
                }

                setEditorText($textbox, result.text);

                var syncedText = getEditorText($textbox);

                if (syncedText !== result.text) {
                    setStatus(
                        "লিঙ্ক তৈরি হয়েছে, কিন্তু editor sync সমস্যা হয়েছে। Syntax highlighter/CodeMirror বন্ধ করে আবার চেষ্টা করুন।",
                        "error"
                    );
                    debugWarn("[bn-internal-linker] Editor sync failed after setEditorText().");
                    return;
                }

                appendEditSummary(result.addedLinks);

                setStatus(
                    convert(result.addedLinks) + "টি অভ্যন্তরীণ সংযোগ edit box-এ যোগ করা হয়েছে। সংরক্ষণের আগে দয়া করে পরিবর্তন পরীক্ষা করুন।",
                    "success"
                );

                window.alert(
                    convert(result.addedLinks) +
                    "টি অভ্যন্তরীণ সংযোগ যোগ করা হয়েছে।\n\n" +
                    "সংরক্ষণের আগে পরিবর্তনগুলো একবার দেখে নিন।"
                );
            })
            .catch(function (error) {
                console.error("[bn-internal-linker]", error);
                setStatus("ত্রুটি: " + error.message, "error");
            });
    }


    // ============================================================
    // PORTLET LINK INSTALLATION
    // ============================================================

    function addPortletLink() {
        var link = mw.util.addPortletLink(
            CONFIG.portletId,
            "#",
            CONFIG.portletLabel,
            "t-bn-internal-linker",
            "কম-ফ্রিকোয়েন্সি বাংলা শব্দ/শিরোনাম থেকে অভ্যন্তরীণ লিঙ্ক যোগ করুন"
        );

        if (!link) {
            return;
        }

        $(link).on("click", function (event) {
            event.preventDefault();
            runInternalLinker();
        });
    }

    function shouldAutoRun() {
        var params = new URLSearchParams(window.location.search);
        return params.get(CONFIG.autoRunParam) === "1";
    }

    function init() {
        addPortletLink();

        if (shouldAutoRun()) {
            runInternalLinker();
        }
    }

    // MediaWiki user scripts should load required modules before using mw.util.
    // jquery.textSelection is required for safer editor read/write with WikiEditor/CodeMirror.
    mw.loader.using(["mediawiki.util", "jquery.textSelection"]).then(function () {
        $(init);
    });

})(mediaWiki, jQuery);
// </nowiki>