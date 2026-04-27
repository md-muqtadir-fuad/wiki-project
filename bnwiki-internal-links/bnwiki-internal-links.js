// <nowiki>
/**
 * Bengali Wikipedia Internal Link Helper
 *
 * Purpose:
 *   Adds a sidebar/toolbox link named "অভ্যন্তরীণ লিঙ্ক যোগ করুন".
 *   When clicked in edit mode, it analyzes the wikitext, finds low-frequency
 *   Bengali words, checks them against a cleaned Bengali Wikipedia title list,
 *   and converts exact standalone matches into internal wikilinks.
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
        titleListUrl: "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/bnwiki-clean-titles.txt",

        /**
         * Default frequency range.
         *
         * A word must appear at least minFrequency times and at most
         * maxFrequency times in the editable article text.
         */
        minFrequency: 1,
        maxFrequency: 3,

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

    var STOPWORDS = new Set([
        "এই", "ওই", "সে", "তিনি", "তারা", "তাহারা", "আমি", "আমরা", "তুমি", "আপনি",
        "এ", "ও", "তা", "তাই", "যে", "যা", "যার", "যাকে", "যেখানে", "যখন",
        "এবং", "ও", "বা", "অথবা", "কিন্তু", "তবে", "কারণ", "যদিও",
        "এক", "একটি", "একজন", "কোন", "কোনো", "কিছু", "সব", "সকল",
        "হয়", "হয়", "হয়ে", "হয়ে", "হয়েছিল", "হয়েছিল", "হয়েছে", "হয়েছে",
        "করেন", "করে", "করা", "করেছে", "করেছিলেন",
        "থেকে", "পর্যন্ত", "জন্য", "সঙ্গে", "মধ্যে", "উপর", "নিচে", "পরে", "আগে",
        "এর", "এরপর", "তার", "তাদের", "নিজ", "নিজের",
        "না", "নয়", "নয়", "আর", "প্রায়", "প্রায়", "মতো", "অনুযায়ী", "অনুযায়ী"
    ]);


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
    // TITLE LIST LOADING
    // ============================================================

    var titleSetPromise = null;

    /**
     * Loads the cleaned title list and stores it in a Set for O(1) lookup.
     *
     * For 100k+ titles, Set lookup is much faster than repeated array search.
     */
    function loadTitleSet() {
        if (titleSetPromise) {
            return titleSetPromise;
        }

        titleSetPromise = fetch(CONFIG.titleListUrl, {
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
                var set = new Set();

                text.split(/\r?\n/).forEach(function (line) {
                    var title = normalizeTitle(line);

                    if (title && hasBengaliLetter(title)) {
                        set.add(title);
                    }
                });

                if (set.size === 0) {
                    throw new Error("Title list loaded, but no valid titles were found.");
                }

                return set;
            });

        return titleSetPromise;
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
        var regex = /\{\|[\s\S]*?\n\|\}/g;
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
    // WORD FREQUENCY ANALYSIS
    // ============================================================

    function countWordFrequencies(segments) {
        var freq = new Map();

        segments.forEach(function (segment) {
            if (segment.protected) {
                return;
            }

            var match;
            var text = segment.text;

            BN_TOKEN_RE.lastIndex = 0;

            while ((match = BN_TOKEN_RE.exec(text)) !== null) {
                var token = normalizeTitle(match[0]);

                if (!isUsefulBengaliToken(token)) {
                    continue;
                }

                freq.set(token, (freq.get(token) || 0) + 1);
            }
        });

        return freq;
    }

    function getLowFrequencyTitleMatches(freq, titleSet, threshold) {
        var matches = new Set();
        var currentTitle = normalizeTitle(mw.config.get("wgTitle"));

        freq.forEach(function (count, word) {
            if (count < CONFIG.minFrequency || count > threshold) {
                return;
            }

            if (CONFIG.skipCurrentPageTitle && word === currentTitle) {
                return;
            }

            if (titleSet.has(word)) {
                matches.add(word);
            }
        });

        return matches;
    }


    // ============================================================
    // LINK APPLICATION
    // ============================================================

    function linkSegmentText(segmentText, matches, linkedOnce) {
        return segmentText.replace(BN_TOKEN_RE, function (token) {
            var word = normalizeTitle(token);

            if (!matches.has(word)) {
                return token;
            }

            if (CONFIG.linkOnlyFirstOccurrence && linkedOnce.has(word)) {
                return token;
            }

            linkedOnce.add(word);

            // The token itself is used as both title and display text.
            // Since the match is exact, [[word]] is enough.
            return "[[" + token + "]]";
        });
    }

    function applyLinksToSegments(segments, matches) {
        var linkedOnce = new Set();
        var addedLinks = 0;
        var linkedTitles = new Set();

        var newText = segments.map(function (segment) {
            if (segment.protected) {
                return segment.text;
            }

            var before = segment.text;

            var after = linkSegmentText(before, matches, linkedOnce);

            if (after !== before) {
                // Count added links in this segment.
                var beforeCount = countLiteral(before, "[[");
                var afterCount = countLiteral(after, "[[");
                addedLinks += Math.max(0, afterCount - beforeCount);

                linkedOnce.forEach(function (title) {
                    linkedTitles.add(title);
                });
            }

            return after;
        }).join("");

        return {
            text: newText,
            addedLinks: addedLinks,
            linkedTitles: Array.from(linkedTitles).sort()
        };
    }

    function countLiteral(text, literal) {
        var count = 0;
        var index = 0;

        while ((index = text.indexOf(literal, index)) !== -1) {
            count++;
            index += literal.length;
        }

        return count;
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
        var oldSummary = $summary.val().trim();

        if (!oldSummary) {
            $summary.val(newSummary);
            return;
        }

        // Avoid adding the same summary repeatedly.
        if (oldSummary.indexOf(newSummary) !== -1) {
            return;
        }

        $summary.val(oldSummary + "; " + newSummary);
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
            "যে শব্দগুলো ১ থেকে কতবার এসেছে, সেগুলো পরীক্ষা করা হবে?\n" +
            "সাধারণত ৩ ভালো। সর্বোচ্চ " + convert(CONFIG.maxAllowedFrequency) + " দিন।",
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

    function confirmPreview(result, matchedWordCount, threshold) {
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
            "ম্যাচ করা শব্দ: " + convert(matchedWordCount) + "টি\n" +
            "যোগ হবে এমন লিঙ্ক: " + convert(result.addedLinks) + "টি\n\n" +
            "নমুনা:\n" + (list || "কোনোটি নেই") + "\n\n" +
            "এগুলো edit box-এ প্রয়োগ করবেন?";

        return window.confirm(message);
    }


    // ============================================================
    // MAIN WORKFLOW
    // ============================================================

    function redirectToEditMode() {
        var pageName = mw.config.get("wgPageName");

        var editUrl = mw.util.getUrl(pageName, {
            action: "edit",
            [CONFIG.autoRunParam]: "1"
        });

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

        var originalText = $textbox.val();

        if (!originalText || !originalText.trim()) {
            setStatus("সম্পাদনা বাক্স খালি।", "error");
            return;
        }

        setStatus("শিরোনাম তালিকা লোড হচ্ছে…");

        loadTitleSet()
            .then(function (titleSet) {
                setStatus("নিবন্ধের শব্দ বিশ্লেষণ করা হচ্ছে…");

                var protectedRanges = getProtectedRanges(originalText);
                var segments = splitByProtectedRanges(originalText, protectedRanges);
                var freq = countWordFrequencies(segments);
                var matches = getLowFrequencyTitleMatches(freq, titleSet, threshold);

                if (matches.size === 0) {
                    setStatus("ম্যাচ করা কোনো কম-ফ্রিকোয়েন্সি শিরোনাম পাওয়া যায়নি।", "warn");
                    return;
                }

                setStatus("ম্যাচ পাওয়া গেছে। লিঙ্ক প্রস্তাব তৈরি হচ্ছে…");

                var result = applyLinksToSegments(segments, matches);

                if (result.addedLinks === 0 || result.text === originalText) {
                    setStatus("নতুন কোনো লিঙ্ক যোগ করার মতো নিরাপদ স্থান পাওয়া যায়নি।", "warn");
                    return;
                }

                if (!confirmPreview(result, matches.size, threshold)) {
                    setStatus("প্রিভিউ দেখে পরিবর্তন বাতিল করা হয়েছে।", "warn");
                    return;
                }

                $textbox.val(result.text);
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
            "কম-ফ্রিকোয়েন্সি বাংলা শব্দ থেকে অভ্যন্তরীণ লিঙ্ক যোগ করুন"
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
    mw.loader.using(["mediawiki.util"]).then(function () {
        $(init);
    });

})(mediaWiki, jQuery);
// </nowiki>