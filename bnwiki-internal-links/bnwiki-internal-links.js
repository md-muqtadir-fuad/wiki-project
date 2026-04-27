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
         * Robust mode:
         * Do not download the whole title list in browser.
         * Generate possible phrases from current article, then ask bnwiki API
         * which pages actually exist.
         */
        useMediaWikiApiTitleLookup: true,
        apiTitleBatchSize: 50,
        maxApiCandidateTitles: 3000,

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
         * Disable exact 1-word linking for safer edits.
         * Later this can be enabled with stronger filters.
         */
        enableSingleWordLinks: false,

        /**
         * Pipe-link support.
         *
         * Example:
         *   article text: উত্তরপ্রদেশের
         *   title list  : উত্তরপ্রদেশ
         *   output      : [[উত্তরপ্রদেশ|উত্তরপ্রদেশের]]
         *
         * Safety rule:
         *   - 2/3/5-word phrase pipe matching is enabled.
         *   - 1-word exact linking is still disabled.
         *   - 1-word pipe linking is suffix-only; general fuzzy 1-word linking is disabled.
         */
        enablePipeLinks: true,
        enableSuffixPipeLinks: true,
        enableSimilarityPipeLinks: false,
        pipeMatchMinSimilarity: 0.78,
        pipePhrasePriority: [5, 4, 3, 2],
        enableSingleWordPipeLinks: true,
        allowSingleWordSimilarityPipeLinks: false,
        maxPipeBucketScan: 300,

        /**
         * Conservative Bengali suffixes for pipe links.
         * These are stripped only to test whether the base form is a real title.
         */
        pipeSuffixes: [
            "গুলোর", "গুলিতে", "গুলোকে", "গুলো",
            "গুলির", "গুলিতে", "গুলিকে", "গুলি",
            "দেরকে", "দের",
            "টির", "টিতে", "টিকে", "টি",
            "ের", "কে", "তে", "য়", "য়ে", "য়", "ে", "র"
        ],

        /**
         * Debug pipe-link candidates separately.
         */
        debugPipeCandidates: false,

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
        debug: false,

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
অবশ্য
অনেক
অনেকে
অনেকেই
অন্তত
অথবা
অথচ
অর্থাত
অন্য
আজ
আছে
আপনার
আপনি
আবার
আমরা
আমাকে
আমাদের
আমার
আমি
আরও
আর
আগে
আগেই
আই
অতএব
আগামী
অবধি
অনুযায়ী
আদ্যভাগে
এই
একই
একে
একটি
এখন
এখনও
এখানে
এখানেই
এটি
এটা
এটাই
এতটাই
এবং
একবার
এবার
এদের
এঁদের
এমন
এমনকী
এল
এর
এরা
এঁরা
এস
এত
এতে
এসে
এ
ঐ
ই
ইহা
ইত্যাদি
উনি
উপর
উপরে
উচিত
ও
ওই
ওর
ওরা
ওঁর
ওঁরা
ওকে
ওদের
ওঁদের
ওখানে
কত
কবে
করতে
কয়েক
কয়েকটি
করবে
করলেন
করার
কারও
করা
করি
করিয়ে
করাই
করলে
করিতে
করিয়া
করেছিলেন
করছে
করছেন
করেছেন
করেছে
করেন
করবেন
করায়
করে
করেই
কাছ
কাছে
কাজে
কারণ
কিছু
কিছুই
কিন্তু
কিংবা
কি
কী
কেউ
কেউই
কাউকে
কেন
কে
কোনও
কোনো
কোন
কখনও
ক্ষেত্রে
খুব
গুলি
গিয়ে
গিয়েছে
গেছে
গেল
গেলে
গোটা
চলে
ছাড়া
ছাড়াও
ছিলেন
ছিল
জন্য
জানা
ঠিক
তিনি
তিনঐ
তিনিও
তখন
তবে
তবু
তাঁদের
তাঁাহারা
তাঁরা
তাঁর
তাঁকে
তাই
তেমন
তাকে
তাহা
তাহাতে
তাহার
তাদের
তারপর
তারা
তারৈ
তার
তাহলে
তা
তাও
তাতে
তো
তত
তুমি
তোমার
তথা
থাকে
থাকা
থাকায়
থেকে
থেকেও
থাকবে
থাকেন
থাকবেন
থেকেই
দিকে
দিতে
দিয়ে
দিয়েছে
দিয়েছেন
দিলেন
দু
দুটি
দুটো
দেয়
দেওয়া
দেওয়ার
দেখা
দেখে
দেখতে
দ্বারা
ধরে
ধরা
নয়
নানা
না
নাকি
নাগাদ
নিতে
নিজে
নিজেই
নিজের
নিজেদের
নিয়ে
নেওয়া
নেওয়ার
নেই
নাই
পক্ষে
পর্যন্ত
পাওয়া
পারেন
পারি
পারে
পরে
পরেই
পরেও
পর
পেয়ে
প্রতি
প্রভৃতি
প্রায়
ফের
ফলে
ফিরে
ব্যবহার
বলতে
বললেন
বলেছেন
বলল
বলা
বলেন
বলে
বহু
বসে
বার
বা
বিনা
বরং
বদলে
বাদে
বিশেষ
বিভিন্ন
বিষয়টি
ব্যাপারে
ভাবে
ভাবেই
মধ্যে
মধ্যেই
মধ্যেও
মধ্যভাগে
মাধ্যমে
মাত্র
মতো
মতোই
মোটেই
যখন
যদি
যদিও
যাবে
যায়
যাকে
যাওয়া
যাওয়ার
যত
যতটা
যা
যার
যারা
যাঁর
যাঁরা
যাদের
যান
যাচ্ছে
যেতে
যাতে
যেন
যেমন
যেখানে
যিনি
যে
রেখে
রাখা
রয়েছে
রকম
শুধু
সঙ্গে
সঙ্গেও
সমস্ত
সব
সবার
সহ
সুতরাং
সহিত
সেই
সেটা
সেটি
সেটাই
সেটাও
সম্প্রতি
সেখান
সেখানে
সে
স্পষ্ট
স্বয়ং
হইতে
হইবে
হৈলে
হইয়া
হচ্ছে
হত
হতে
হতেই
হবে
হবেন
হয়েছিল
হয়েছে
হয়েছেন
হয়ে
হয়নি
হয়
হয়েই
হয়তো
হল
হলে
হলেই
হলেও
হলো
হিসাবে
হওয়া
হওয়ার
হওয়ায়
হন
হোক
জন
জনকে
জনের
জানতে
জানায়
জানিয়ে
জানানো
জানিয়েছে
জন্যওজে
জে
বেশ
দেন
তুলে
চান
চায়
চেয়ে
মোট
যথেষ্ট
টি
উত্তর
এক্
এব
এমনি
কমনে
কাজ
কেখা
কোটি
চার
চালু
চেষ্টা
জ্নজন
দিন
দুই
ধামার
নতুন
পাচ
পি
পেয়্র্
প্রথম
প্রযন্ত
প্রাথমিক
বক্তব্য
বন
বি
বেশি
মনে
র
লক্ষ
শুরু
সাধারণ
সামনে
সি
হাজার
হিসেবে
অই
অগত্যা
অত:
অধিক
অধীনে
অধ্যায়
অনুগ্রহ
অনুভূত
অনুরূপ
অনুসন্ধান
অনুসরণ
অনুসারে
অনুসৃত
অন্যত্র
অন্যভাবে
অন্যান্য
অপেক্ষাকৃতভাবে
অবশ্যই
অবস্থা
অবিলম্বে
অভ্যন্তরস্থ
অর্জিত
অসদৃশ
অসম্ভাব্য
আইন
আউট
আক্রান্ত
আগ্রহী
আট
আদেশ
আন্দাজ
আমাদিগের
আশি
আশু
আসা
আসে
ইচ্ছা
ইচ্ছাপূর্বক
ইতিমধ্যে
ইতোমধ্যে
ইশারা
ইহাতে
উক্তি
উচ্চ
উঠা
উত্তম
উপলব্ধ
উপায়
উভয়
উল্লেখ
উল্লেখযোগ্যভাবে
উহার
ঊর্ধ্বতন
এপর্যন্ত
এইগুলো
এইভাবে
এক
একদা
একভাবে
একরকম
একসঙ্গে
একা
এখনো
এছাড়াও
এতদ্বারা
এদিকে
এমনকি
এরকম
এলাকায়
এলাকার
ওহে
কক্ষ
কখন
কম
করলো
করাত
করেছিল
কর্তব্য
কাছাকাছি
কারণসমূহ
কারো
কিছুটা
কিছুনা
কিনা
কিভাবে
কূপ
কেউনা
কেবল
কেবা
কেস
কেহ
কোথা
কোথাও
কোথায়
ক্রম
খুঁজছেন
খোলা
খোলে
গড়
গত
গিয়েছিলাম
গুরুত্ব
গোষ্ঠীবদ্ধ
গ্রহণ
গ্রুপ
ঘর
ঘোষণা
চালা
চালান
চেয়েছিলেন
ছয়
ছাড়াছাড়ি
ছোট
জনাব
জনাবা
জানতাম
জানে
জায়গা
জিজ্ঞাসা
জিজ্ঞেস
জিনিস
টা
ঠিকআছে
ডগা
তত্কারণে
তত্প্রতি
তদনুসারে
তদ্ব্যতীত
তন্নতন্ন
তরুণ
তাঁহারা
তারপরেও
তারিখ
তাহাদিগকে
তাহাদেরই
তিন
তীক্ষ্ন
তৈরীর
তোলে
দরকারী
দলবদ্ধ
দান
দূরে
দেখাচ্ছে
দেখিয়েছেন
দেখেন
দ্বিগুণ
দ্বিতীয়
দ্য
নব্বই
নাম
নিচে
নিছক
নিজেকে
নিজেদেরকে
নিদিষ্ট
নিম্নাভিমুখে
নির্দিষ্ট
নির্বিশেষে
নিশ্চিত
নেয়ার
পক্ষই
পঞ্চম
পড়া
পণ্য
পথ
পয়েন্ট
পরন্তু
পরবর্তী
পরিণত
পরিবর্তে
পর্যাপ্ত
পাঁচ
পায়
পারা
পারিনি
পালা
পাশ
পাশে
পিছনে
পিঠের
পুরোনো
পুরোপুরি
পূর্বে
পৃষ্ঠা
পৃষ্ঠাগুলি
পেছনে
পেয়েছেন
প্রকৃতপক্ষে
প্রণীত
প্রদত্ত
প্রদর্শনী
প্রদর্শিত
প্রধানত
প্রবলভাবে
প্রমাণীকরণ
প্রয়োজন
প্রয়োজনীয়
প্রসূত
প্রাক্তন
প্রাথমিকভাবে
প্রান্ত
প্রাপ্ত
প্রায়ই
ফলাফল
ফিক্স
বছর
বড়
বন্ধ
বরাবর
বর্ণন
বর্তমান
বাঁক
বাইরে
বাকি
বাড়ি
বাতিক
বাদ
বাহিরে
বিন্দু
বিশেষণ
বিশেষত
বিশেষভাবে
বিশ্ব
বুঝিয়ে
বৃহত্তর
বের
বেশী
ব্যতীত
ব্যবহারসমূহ
ব্যবহৃত
ব্যাক
ব্যাপকভাবে
ভবিষ্যতে
ভান
ভাল
ভিতরে
ভিন্ন
ভিন্নভাবে
মত
মস্ত
মহান
মাধ্যম
মান
মানানসই
মানুষ
মানে
মামলা
মিলিয়ন
মুখ
মূলত
যখনই
যথা
যথাক্রমে
যন্ত্রাংশ
যাই
যাহার
যাহোক
যেখানেই
যেটি
যেহেতু
যোগ
রাখে
রাজী
রাজ্যের
লাইন
লাল
শত
শব্দ
শীঘ্র
শীঘ্রই
শুরুতে
শূন্য
শেষ
সংক্রান্ত
সংক্ষিপ্ত
সংক্ষেপে
সংখ্যা
সংখ্যার
সংশ্লিষ্ট
সক্ষম
সত্য
সত্যিই
সদয়
সদস্য
সদস্যদের
সফলভাবে
সবচেয়ে
সবাই
সময়
সমান
সম্পন্ন
সম্ভব
সম্ভবত
সম্ভাব্য
সরাইয়া
সর্বত্র
সর্বদা
সর্বস্বান্ত
সাত
সাধারণত
সাব
সাবেক
সামগ্রিক
সামান্য
সাম্প্রতিক
সুত্র
সূচক
সেকেন্ড
সেগুলো
সেরা
স্টপ
স্থাপিত
স্পষ্টত
স্পষ্টতই
স্ব
স্বাগত
স্বাভাবিকভাবে
স্বার্থ
হায়
হারানো
অংশ
ভাইরাসে
করোনা
করোনাভাইরাসের
করোনাভাইরাসে
মুহূর্তে
ভাইরাসটি
বিশ্ববিদ্যালয়ের
বৃহস্পতিবার
মঙ্গলবার
শুক্রবার
দাঁড়িয়েছে
অনুষ্ঠানে
চট্টগ্রাম
এক্ষেত্রে
ময়মনসিংহ
ধানমন্ডিতে
প্রাইভেট
ধানমন্ডি
বায়ুদূষণ
ভিয়েতনাম
ঢাকেশ্বরী
আগামীকাল
বাংলাদেশিকে
বাংলাদেশকে
সিঙ্গাপুরে
শিক্ষার্থীদের
বাংলাদেশিদের
জানিয়েছেন
বাংলাদেশে
বাংলাদেশ
বাংলাদেশি
বাংলাদেশের
বর্তমানে
জাহাঙ্গীর
অতিরিক্ত
ইতিমধ্যেই
জায়গায়
সেন্টারে
ব্যবহারের
নম্বরগুলো
যোগের
বলেছিলেন
মোহাম্মদ
একটা
দুইটা
দুইটি
তিনটা
তিনটি
চারটা
চারটি
পাঁচটা
পাঁচটি
ছয়টা
ছয়টি
সাতটা
সাতটি
আটটা
আটটি
নয়টা
নয়টি
দশটা
দশটি
এগারোটা
এগারোটি
বারোটা
বারোটি
তেরোটা
তেরোটি
চৌদ্দটা
চৌদ্দটি
পনেরোটা
পনেরোটি
ষোলটা
ষোলটি
সতেরোটা
সতেরোটি
আঠারোটা
আঠারোটি
উনিশটা
উনিশটি
বিশটা
বিশটি
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

    /**
     * Returns true if a phrase length is allowed for pipe-link matching.
     * Exact 1-word linking can stay disabled while suffix-only 1-word pipe
     * linking remains available for cases such as উত্তরপ্রদেশের → উত্তরপ্রদেশ.
     */
    function isPipeLengthAllowed(wordCount) {
        if (!CONFIG.enablePipeLinks) {
            return false;
        }

        if (wordCount === 1) {
            return !!CONFIG.enableSingleWordPipeLinks;
        }

        var priority = Array.isArray(CONFIG.pipePhrasePriority) ? CONFIG.pipePhrasePriority : [5, 3, 2];

        return priority.indexOf(wordCount) !== -1;
    }

    function getEffectivePipePriority() {
        if (!CONFIG.enablePipeLinks) {
            return [];
        }

        var maxPhraseWords = Math.max(1, Math.min(5, CONFIG.maxPhraseWords || 5));
        var source = Array.isArray(CONFIG.pipePhrasePriority) ? CONFIG.pipePhrasePriority : [5, 3, 2];
        var seen = new Set();
        var result = [];

        source.forEach(function (value) {
            var n = parseInt(value, 10);

            if (!Number.isFinite(n) || n < 2 || n > maxPhraseWords) {
                return;
            }

            if (!seen.has(n)) {
                seen.add(n);
                result.push(n);
            }
        });

        if (CONFIG.enableSingleWordPipeLinks && maxPhraseWords >= 1 && !seen.has(1)) {
            result.push(1);
        }

        return result;
    }

    function getCombinedScanPriority() {
        var seen = new Set();
        var result = [];

        getEffectivePhrasePriority().concat(getEffectivePipePriority()).forEach(function (n) {
            if (!seen.has(n)) {
                seen.add(n);
                result.push(n);
            }
        });

        return result;
    }

    function getMaxFromArray(values) {
        if (!values.length) {
            return 0;
        }

        return Math.max.apply(null, values);
    }

    /**
     * Remove only conservative Bengali suffixes and return possible base forms.
     * The base form is accepted only if it exists in the title list.
     */
    function getSuffixBaseForms(word) {
        var normalized = normalizeTitle(word);
        var forms = new Set();
        var suffixes = Array.isArray(CONFIG.pipeSuffixes) ? CONFIG.pipeSuffixes : [];

        suffixes.forEach(function (suffix) {
            suffix = normalizeTitle(suffix);

            if (!suffix || normalized.length <= suffix.length + 1) {
                return;
            }

            if (normalized.endsWith(suffix)) {
                var base = normalized.slice(0, normalized.length - suffix.length);

                if (base.length >= 2 && hasBengaliLetter(base)) {
                    forms.add(base);
                }
            }
        });

        return Array.from(forms);
    }

    function getFirstWordVariants(word) {
        var variants = [normalizeTitle(word)];

        getSuffixBaseForms(word).forEach(function (base) {
            if (variants.indexOf(base) === -1) {
                variants.push(base);
            }
        });

        return variants;
    }

    /**
     * Build conservative suffix-based target-title candidates.
     *
     * Main Bengali use-case:
     *   বাংলা ভাষার     -> বাংলা ভাষা
     *   উত্তরপ্রদেশের  -> উত্তরপ্রদেশ
     *
     * For multi-word phrases, only the last token is stripped by default.
     * This avoids broad unsafe transformations inside names.
     */
    function buildSuffixPipeTargetCandidates(phraseWords) {
        var candidates = [];
        var displayPhrase = phraseWords.join(" ");
        var lastIndex = phraseWords.length - 1;
        var lastWord = phraseWords[lastIndex];

        getSuffixBaseForms(lastWord).forEach(function (base) {
            var copy = phraseWords.slice();
            copy[lastIndex] = base;

            var candidate = copy.join(" ");

            if (candidate !== displayPhrase && candidates.indexOf(candidate) === -1) {
                candidates.push(candidate);
            }
        });

        return candidates;
    }

    function levenshteinDistance(a, b) {
        a = String(a || "");
        b = String(b || "");

        var aLen = a.length;
        var bLen = b.length;

        if (aLen === 0) {
            return bLen;
        }
        if (bLen === 0) {
            return aLen;
        }

        var previous = new Array(bLen + 1);
        var current = new Array(bLen + 1);
        var i;
        var j;

        for (j = 0; j <= bLen; j++) {
            previous[j] = j;
        }

        for (i = 1; i <= aLen; i++) {
            current[0] = i;

            for (j = 1; j <= bLen; j++) {
                var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;

                current[j] = Math.min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + cost
                );
            }

            var temp = previous;
            previous = current;
            current = temp;
        }

        return previous[bLen];
    }

    function normalizedSimilarity(a, b) {
        a = normalizeTitle(a);
        b = normalizeTitle(b);

        var maxLen = Math.max(a.length, b.length);

        if (maxLen === 0) {
            return 1;
        }

        return 1 - (levenshteinDistance(a, b) / maxLen);
    }

    function getLengthRatioOk(a, b) {
        var minLen = Math.min(a.length, b.length);
        var maxLen = Math.max(a.length, b.length);

        if (maxLen === 0) {
            return false;
        }

        return minLen / maxLen >= 0.70;
    }

    /**
     * Finds a safe pipe target for a display phrase.
     *
     * Matching order:
     *   1. Suffix-base title lookup, e.g. ভাষার -> ভাষা.
     *   2. Similarity scan inside same first-word bucket only.
     *
     * General similarity is disabled for 1-word phrases by default.
     */
    function findPipeTargetForDisplayPhrase(titleData, phraseWords, wordCount) {
        if (!CONFIG.enablePipeLinks || !isPipeLengthAllowed(wordCount)) {
            return null;
        }

        var displayPhrase = phraseWords.join(" ");

        if (titleData.set.has(displayPhrase)) {
            return null;
        }

        if (CONFIG.enableSuffixPipeLinks) {
            var suffixCandidates = buildSuffixPipeTargetCandidates(phraseWords);

            for (var i = 0; i < suffixCandidates.length; i++) {
                var target = suffixCandidates[i];

                if (titleData.set.has(target) && splitTitleWords(target).length === wordCount) {
                    return {
                        title: target,
                        method: "suffix",
                        similarity: normalizedSimilarity(displayPhrase, target)
                    };
                }
            }
        }

        if (!CONFIG.enableSimilarityPipeLinks) {
            return null;
        }

        if (wordCount === 1 && !CONFIG.allowSingleWordSimilarityPipeLinks) {
            return null;
        }

        var minScore = Number(CONFIG.pipeMatchMinSimilarity) || 0.78;
        var maxScan = parseInt(CONFIG.maxPipeBucketScan, 10);

        if (!Number.isFinite(maxScan) || maxScan < 1) {
            maxScan = 300;
        }

        var firstWordVariants = getFirstWordVariants(phraseWords[0]);
        var best = null;

        firstWordVariants.forEach(function (firstWord) {
            var bucket = titleData.byFirstWord.get(firstWord);

            if (!bucket || !bucket.byLength.has(wordCount)) {
                return;
            }

            var titleSet = bucket.byLength.get(wordCount);

            if (titleSet.size > maxScan) {
                debugLog(
                    "[bn-internal-linker] Skipped large pipe bucket:",
                    firstWord,
                    "wordCount=",
                    wordCount,
                    "size=",
                    titleSet.size
                );
                return;
            }

            titleSet.forEach(function (title) {
                if (title === displayPhrase) {
                    return;
                }

                if (!getLengthRatioOk(displayPhrase, title)) {
                    return;
                }

                var score = normalizedSimilarity(displayPhrase, title);

                if (score >= minScore && (!best || score > best.similarity)) {
                    best = {
                        title: title,
                        method: "similarity",
                        similarity: score
                    };
                }
            });
        });

        return best;
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
    // ============================================================
    // MEDIAWIKI API TITLE LOOKUP
    // ============================================================

    function uniqueArray(values) {
        var seen = new Set();
        var result = [];

        values.forEach(function (value) {
            value = normalizeTitle(value);

            if (!value || seen.has(value)) {
                return;
            }

            seen.add(value);
            result.push(value);
        });

        return result;
    }

    function chunkArray(values, size) {
        var chunks = [];
        var i;

        size = Math.max(1, parseInt(size, 10) || 50);

        for (i = 0; i < values.length; i += size) {
            chunks.push(values.slice(i, i + size));
        }

        return chunks;
    }

    function addApiCandidateTitle(candidateSet, title) {
        title = normalizeTitle(title);

        if (!title || !hasBengaliLetter(title)) {
            return;
        }

        if (title.indexOf("|") !== -1) {
            return;
        }

        var words = splitTitleWords(title);

        if (!words.length) {
            return;
        }

        if (words.length > Math.max(1, Math.min(5, CONFIG.maxPhraseWords || 5))) {
            return;
        }

        if (words.length === 1 && !CONFIG.enableSingleWordLinks && !CONFIG.enableSingleWordPipeLinks) {
            return;
        }

        candidateSet.add(words.join(" "));
    }

    /**
     * Generate only the titles that could actually appear in this article.
     * This avoids loading the full 8MB+ GitHub title file.
     */
    function collectApiCandidateTitlesFromSegments(segments) {
        var candidateSet = new Set();
        var exactAllowedLengths = getAllowedPhraseLengthSet();
        var pipeAllowedLengths = new Set(getEffectivePipePriority());
        var scanPriority = getCombinedScanPriority();

        segments.forEach(function (segment) {
            if (segment.protected) {
                return;
            }

            var segmentText = segment.text;
            var tokens = collectBengaliTokens(segmentText);

            for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
                scanPriority.forEach(function (wordCount) {
                    var phraseInfo = buildPhraseFromTokens(segmentText, tokens, tokenIndex, wordCount);

                    if (!phraseInfo) {
                        return;
                    }

                    if (exactAllowedLengths.has(wordCount)) {
                        if (wordCount > 1 || isUsefulBengaliToken(phraseInfo.phrase)) {
                            addApiCandidateTitle(candidateSet, phraseInfo.phrase);
                        }
                    }

                    if (CONFIG.enablePipeLinks && CONFIG.enableSuffixPipeLinks && pipeAllowedLengths.has(wordCount)) {
                        buildSuffixPipeTargetCandidates(phraseInfo.words).forEach(function (target) {
                            addApiCandidateTitle(candidateSet, target);
                        });
                    }
                });
            }
        });

        if (CONFIG.debugTestTitles && CONFIG.debugTestTitles.length) {
            CONFIG.debugTestTitles.forEach(function (title) {
                addApiCandidateTitle(candidateSet, title);
            });
        }

        var candidates = Array.from(candidateSet).sort(function (a, b) {
            var aw = splitTitleWords(a).length;
            var bw = splitTitleWords(b).length;

            return bw - aw || a.localeCompare(b);
        });

        var maxCandidates = parseInt(CONFIG.maxApiCandidateTitles, 10);

        if (Number.isFinite(maxCandidates) && maxCandidates > 0 && candidates.length > maxCandidates) {
            debugWarn(
                "[bn-internal-linker] API candidate title limit reached:",
                candidates.length,
                "->",
                maxCandidates
            );

            candidates = candidates.slice(0, maxCandidates);
        }

        debugLog("[bn-internal-linker] API candidate titles:", candidates.length);

        return candidates;
    }

    function queryExistingTitlesWithMediaWikiApi(candidateTitles) {
        candidateTitles = uniqueArray(candidateTitles);

        if (!candidateTitles.length) {
            return Promise.resolve([]);
        }

        if (!mw.Api) {
            return Promise.reject(new Error("mediawiki.api module is not loaded."));
        }

        var api = new mw.Api();
        var batchSize = Math.max(1, Math.min(50, parseInt(CONFIG.apiTitleBatchSize, 10) || 50));
        var batches = chunkArray(candidateTitles, batchSize);
        var existing = new Set();
        var batchIndex = 0;

        function runNextBatch() {
            if (batchIndex >= batches.length) {
                return Promise.resolve(Array.from(existing));
            }

            var currentBatchNumber = batchIndex + 1;
            var batch = batches[batchIndex];

            batchIndex++;

            setStatus(
                "সম্ভাব্য শিরোনাম যাচাই হচ্ছে: " +
                convert(currentBatchNumber) +
                "/" +
                convert(batches.length) +
                " ব্যাচ…"
            );

            return api.post({
                action: "query",
                format: "json",
                formatversion: 2,
                redirects: 1,
                titles: batch.join("|")
            }).then(function (data) {
                var pages = data && data.query && data.query.pages ? data.query.pages : [];

                pages.forEach(function (page) {
                    if (!page || page.missing || page.invalid) {
                        return;
                    }

                    if (typeof page.ns === "number" && page.ns !== 0) {
                        return;
                    }

                    addApiCandidateTitle(existing, page.title);
                });
            }).then(runNextBatch);
        }

        return runNextBatch();
    }

    function buildTitleDataFromExistingTitles(existingTitles) {
        var data = makeEmptyTitleData();

        existingTitles.forEach(function (title) {
            data.stats.rawLines++;
            addTitleToIndex(data, title);
        });

        if (data.set.size === 0) {
            throw new Error("No valid existing Bengali article titles were found from API candidates.");
        }

        debugLog("[bn-internal-linker] API title data loaded:", data.stats);
        debugLog("[bn-internal-linker] Title Set size:", data.set.size);
        debugLog("[bn-internal-linker] Indexed first-word buckets:", data.byFirstWord.size);

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

            debugTable("[bn-internal-linker] Debug test titles in API title data", testRows);
        }

        return data;
    }

    function loadTitleDataForSegments(segments) {
        if (!CONFIG.useMediaWikiApiTitleLookup) {
            return loadTitleData();
        }

        var candidateTitles = collectApiCandidateTitlesFromSegments(segments);

        return queryExistingTitlesWithMediaWikiApi(candidateTitles)
            .then(buildTitleDataFromExistingTitles);
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
    function isAdjacentWordCharacter(ch) {
        if (!ch) {
            return false;
        }

        // Prevent linking inside mixed words like বাংলা2024, abcবাংলা, বাংলা_test.
        return /[A-Za-z0-9_\u0980-\u09FF'’]/.test(ch);
    }

    function hasSafeTokenBoundary(text, start, end) {
        var before = start > 0 ? text.charAt(start - 1) : "";
        var after = end < text.length ? text.charAt(end) : "";

        return !isAdjacentWordCharacter(before) && !isAdjacentWordCharacter(after);
    }

    function collectBengaliTokens(text) {
        var tokens = [];
        var match;

        BN_TOKEN_RE.lastIndex = 0;

        while ((match = BN_TOKEN_RE.exec(text)) !== null) {
            var raw = match[0];
            var start = match.index;
            var end = match.index + raw.length;
            var normalized = normalizeTitle(raw);

            if (!hasBengaliLetter(normalized)) {
                continue;
            }

            if (!hasSafeTokenBoundary(text, start, end)) {
                continue;
            }

            tokens.push({
                raw: raw,
                word: normalized,
                start: start,
                end: end
            });
        }

        return tokens;
    }

    function canJoinTokensByWhitespace(text, leftToken, rightToken) {
        var between = text.slice(leftToken.end, rightToken.start);

        // Only allow same-line spaces/tabs between words.
        // Do not link phrases across newlines, because that can accidentally join
        // separate sentences or paragraph fragments.
        return /^[ \t\u00A0]+$/.test(between);
    }

    /**
     * Returns the exact phrase lengths this run is allowed to link.
     *
     * Current safe default:
     *   5-word titles first, then 3-word titles, then 2-word titles.
     *
     * 1-word exact titles are excluded unless CONFIG.enableSingleWordLinks is true.
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
        var exactPriority = getEffectivePhrasePriority();
        var exactIndex = exactPriority.indexOf(wordCount);

        if (exactIndex !== -1) {
            return exactIndex;
        }

        var pipePriority = getEffectivePipePriority();
        var pipeIndex = pipePriority.indexOf(wordCount);

        return pipeIndex === -1 ? 999 : pipeIndex;
    }

    function getMaxLinksPerRun() {
        var n = parseInt(CONFIG.maxLinksPerRun, 10);

        if (!Number.isFinite(n) || n < 1) {
            return 100;
        }

        return n;
    }

    /**
     * Count exact and pipe-title candidate frequency.
     *
     * Exact matching:
     *   Uses CONFIG.phrasePriority.
     *
     * Pipe matching:
     *   Uses CONFIG.pipePhrasePriority plus suffix-only single-word pipe links
     *   when CONFIG.enableSingleWordPipeLinks is true.
     */
    function countTitleCandidateFrequencies(segments, titleData) {
        var freq = new Map();
        var debugCandidates = [];
        var phrasePriority = getEffectivePhrasePriority();
        var allowedLengths = new Set(phrasePriority);
        var pipePriority = getEffectivePipePriority();
        var pipeAllowedLengths = new Set(pipePriority);
        var scanPriority = getCombinedScanPriority();
        var maxPhraseWords = getMaxFromArray(scanPriority);

        if (!scanPriority.length) {
            debugLog("[bn-internal-linker] No phrase lengths enabled. Check CONFIG.phrasePriority / CONFIG.pipePhrasePriority.");
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
                var maxN = Math.min(maxPhraseWords, tokens.length - i);
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

                    var phrase = phraseWords.join(" ");
                    var exactCounted = false;

                    if (allowedLengths.has(n)) {
                        var titleSetForLength = bucket && bucket.byLength ? bucket.byLength.get(n) : null;
                        var exactTitleExists = titleSetForLength ? titleSetForLength.has(phrase) : titleData.set.has(phrase);

                        if (n === 1 && !isUsefulBengaliToken(phrase)) {
                            pushDebugRow(debugCandidates, {
                                candidate: phrase,
                                wordCount: n,
                                segment: segmentIndex,
                                reason: "single_word_stopword_or_too_short"
                            });
                        } else if (exactTitleExists) {
                            freq.set(phrase, (freq.get(phrase) || 0) + 1);
                            exactCounted = true;

                            pushDebugRow(debugCandidates, {
                                candidate: phrase,
                                target: phrase,
                                wordCount: n,
                                segment: segmentIndex,
                                reason: "exact_title_candidate_counted"
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

                    if (!exactCounted && pipeAllowedLengths.has(n)) {
                        var pipeMatch = findPipeTargetForDisplayPhrase(titleData, phraseWords, n);

                        if (pipeMatch) {
                            freq.set(pipeMatch.title, (freq.get(pipeMatch.title) || 0) + 1);

                            pushDebugRow(debugCandidates, {
                                candidate: phrase,
                                target: pipeMatch.title,
                                wordCount: n,
                                segment: segmentIndex,
                                reason: "pipe_title_candidate_counted_" + pipeMatch.method,
                                similarity: Math.round(pipeMatch.similarity * 1000) / 1000
                            });
                        } else if (CONFIG.debugPipeCandidates && CONFIG.debugNonMatchCandidates) {
                            pushDebugRow(debugCandidates, {
                                candidate: phrase,
                                wordCount: n,
                                segment: segmentIndex,
                                reason: "pipe_candidate_no_safe_target"
                            });
                        }
                    }
                }
            }
        });

        debugTable("[bn-internal-linker] Raw title candidates scanned", debugCandidates);

        debugLog("[bn-internal-linker] Candidate frequency map size:", freq.size);
        debugLog("[bn-internal-linker] Effective exact phrase priority:", phrasePriority);
        debugLog("[bn-internal-linker] Effective pipe phrase priority:", pipePriority);
        debugLog("[bn-internal-linker] Title list size:", titleData.set.size);

        return freq;
    }

    function getLowFrequencyTitleMatches(freq, titleData, threshold) {
        var matches = new Set();
        var acceptedRows = [];
        var rejectedRows = [];
        var currentTitle = normalizeTitle(mw.config.get("wgTitle"));
        var exactAllowedLengths = getAllowedPhraseLengthSet();
        var pipeAllowedLengths = new Set(getEffectivePipePriority());

        freq.forEach(function (count, title) {
            var words = splitTitleWords(title);
            var wordCount = words.length;
            var exactLengthAllowed = exactAllowedLengths.has(wordCount);
            var pipeLengthAllowed = pipeAllowedLengths.has(wordCount);

            /*
             * Important:
             *   A suffix pipe candidate such as উত্তরপ্রদেশের -> উত্তরপ্রদেশ
             *   may have a 1-word target title.
             *
             *   Exact 1-word linking can still be disabled, but the candidate
             *   should not be rejected here if it entered freq through the
             *   pipe-matching path.
             */
            if (!exactLengthAllowed && !pipeLengthAllowed) {
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
                    exactLengthAllowed: exactLengthAllowed,
                    pipeLengthAllowed: pipeLengthAllowed,
                    reason: "accepted"
                });
            }
        });

        debugTable("[bn-internal-linker] Accepted low-frequency title matches", acceptedRows);
        debugTable("[bn-internal-linker] Rejected title candidates", rejectedRows);

        return matches;
    }

    // ============================================================
    // LINK CANDIDATE BUILDING AND APPLICATION
    // ============================================================

    /**
     * Builds a phrase object from consecutive Bengali tokens.
     *
     * The phrase is valid only when tokens are separated by whitespace.
     * This prevents linking across punctuation, brackets, commas, table syntax,
     * pipes, etc.
     */
    function buildPhraseFromTokens(segmentText, tokens, tokenIndex, wordCount) {
        if (tokenIndex + wordCount > tokens.length) {
            return null;
        }

        var words = [];

        for (var i = 0; i < wordCount; i++) {
            var token = tokens[tokenIndex + i];

            if (i > 0) {
                var previousToken = tokens[tokenIndex + i - 1];

                if (!canJoinTokensByWhitespace(segmentText, previousToken, token)) {
                    return null;
                }
            }

            words.push(token.word);
        }

        var firstToken = tokens[tokenIndex];
        var lastToken = tokens[tokenIndex + wordCount - 1];

        return {
            words: words,
            phrase: words.join(" "),
            displayText: segmentText.slice(firstToken.start, lastToken.end),
            start: firstToken.start,
            end: lastToken.end
        };
    }

    function makeWikilink(targetTitle, displayText, method) {
        displayText = String(displayText || targetTitle);

        // If the article text exactly matches the target title, no pipe is needed.
        if (method === "exact" && displayText === targetTitle) {
            return "[[" + targetTitle + "]]";
        }

        // If spacing or visible text differs, preserve the article text with pipe syntax.
        return "[[" + targetTitle + "|" + displayText + "]]";
    }

    function getCandidateMethodRank(method) {
        if (method === "exact") {
            return 0;
        }

        if (method === "suffix") {
            return 1;
        }

        if (method === "similarity") {
            return 2;
        }

        return 9;
    }

    /**
     * Build one possible link candidate from a token position and phrase length.
     *
     * Priority:
     *   1. Exact title match.
     *   2. Safe pipe-link match.
     *
     * Example pipe-link:
     *   display text: উত্তরপ্রদেশের
     *   target title : উত্তরপ্রদেশ
     *   output       : [[উত্তরপ্রদেশ|উত্তরপ্রদেশের]]
     */
    function buildLinkCandidateAtPosition(
        titleData,
        segmentText,
        tokens,
        tokenIndex,
        wordCount,
        matches,
        exactAllowedLengths,
        pipeAllowedLengths,
        segmentIndex,
        occurrenceOrder
    ) {
        var phraseInfo = buildPhraseFromTokens(segmentText, tokens, tokenIndex, wordCount);

        if (!phraseInfo) {
            return null;
        }

        var phrase = phraseInfo.phrase;

        if (
            exactAllowedLengths.has(wordCount) &&
            matches.has(phrase) &&
            titleData.set.has(phrase)
        ) {
            return {
                segmentIndex: segmentIndex,
                start: phraseInfo.start,
                end: phraseInfo.end,
                targetTitle: phrase,
                displayText: phraseInfo.displayText,
                replacement: makeWikilink(phrase, phraseInfo.displayText, "exact"),
                wordCount: wordCount,
                method: "exact",
                similarity: 1,
                priorityRank: getPhrasePriorityRank(wordCount),
                occurrenceOrder: occurrenceOrder
            };
        }

        if (
            CONFIG.enablePipeLinks &&
            pipeAllowedLengths.has(wordCount)
        ) {
            var pipeMatch = findPipeTargetForDisplayPhrase(titleData, phraseInfo.words, wordCount);

            if (
                pipeMatch &&
                pipeMatch.title &&
                pipeMatch.title !== phrase &&
                matches.has(pipeMatch.title) &&
                titleData.set.has(pipeMatch.title)
            ) {
                return {
                    segmentIndex: segmentIndex,
                    start: phraseInfo.start,
                    end: phraseInfo.end,
                    targetTitle: pipeMatch.title,
                    displayText: phraseInfo.displayText,
                    replacement: makeWikilink(pipeMatch.title, phraseInfo.displayText, pipeMatch.method),
                    wordCount: wordCount,
                    method: pipeMatch.method,
                    similarity: pipeMatch.similarity || normalizedSimilarity(phrase, pipeMatch.title),
                    priorityRank: getPhrasePriorityRank(wordCount),
                    occurrenceOrder: occurrenceOrder
                };
            }
        }

        return null;
    }

    /**
     * Collect all possible exact and pipe-link candidates from editable segments.
     *
     * This does not apply links yet.
     * First we collect candidates, then sort and select the safest top candidates.
     */
    function collectLinkCandidates(segments, titleData, matches) {
        var candidates = [];
        var scanPriority = getCombinedScanPriority();
        var exactAllowedLengths = getAllowedPhraseLengthSet();
        var pipeAllowedLengths = new Set(getEffectivePipePriority());
        var occurrenceOrder = 0;

        segments.forEach(function (segment, segmentIndex) {
            if (segment.protected) {
                return;
            }

            var segmentText = segment.text;
            var tokens = collectBengaliTokens(segmentText);

            for (var tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
                scanPriority.forEach(function (wordCount) {
                    if (tokenIndex + wordCount > tokens.length) {
                        return;
                    }

                    var candidate = buildLinkCandidateAtPosition(
                        titleData,
                        segmentText,
                        tokens,
                        tokenIndex,
                        wordCount,
                        matches,
                        exactAllowedLengths,
                        pipeAllowedLengths,
                        segmentIndex,
                        occurrenceOrder++
                    );

                    if (candidate) {
                        candidates.push(candidate);
                    }
                });
            }
        });

        if (CONFIG.debug) {
            debugTable(
                "[bn-internal-linker] All possible link candidates before selection",
                candidates.map(function (candidate) {
                    return {
                        targetTitle: candidate.targetTitle,
                        displayText: candidate.displayText,
                        wordCount: candidate.wordCount,
                        method: candidate.method,
                        similarity: Math.round(candidate.similarity * 1000) / 1000,
                        segmentIndex: candidate.segmentIndex,
                        start: candidate.start,
                        end: candidate.end,
                        priorityRank: candidate.priorityRank
                    };
                })
            );
        }

        return candidates;
    }

    function rangesOverlap(a, b) {
        return a.start < b.end && b.start < a.end;
    }

    /**
     * Sort candidates so the safest links are selected first.
     *
     * Current safety order:
     *   1. Phrase priority: 5-word, then 3-word, then 2-word, then 1-word suffix pipe.
     *   2. Exact links before suffix pipe links.
     *   3. Suffix pipe links before similarity pipe links.
     *   4. Higher similarity first.
     *   5. Earlier occurrence if all else is equal.
     */
    function sortLinkCandidates(candidates) {
        return candidates.slice().sort(function (a, b) {
            if (a.priorityRank !== b.priorityRank) {
                return a.priorityRank - b.priorityRank;
            }

            var methodRankA = getCandidateMethodRank(a.method);
            var methodRankB = getCandidateMethodRank(b.method);

            if (methodRankA !== methodRankB) {
                return methodRankA - methodRankB;
            }

            if (a.wordCount !== b.wordCount) {
                return b.wordCount - a.wordCount;
            }

            if (a.similarity !== b.similarity) {
                return b.similarity - a.similarity;
            }

            return a.occurrenceOrder - b.occurrenceOrder;
        });
    }

    /**
     * Select final link candidates.
     *
     * Rules:
     *   - No overlapping links.
     *   - Respect CONFIG.maxLinksPerRun.
     *   - If CONFIG.linkOnlyFirstOccurrence is true, link each target title once.
     */
    function selectTopLinkCandidates(candidates) {
        var sorted = sortLinkCandidates(candidates);
        var selected = [];
        var selectedRangesBySegment = new Map();
        var linkedTargetTitles = new Set();
        var maxLinks = getMaxLinksPerRun();

        sorted.forEach(function (candidate) {
            if (selected.length >= maxLinks) {
                return;
            }

            if (CONFIG.linkOnlyFirstOccurrence && linkedTargetTitles.has(candidate.targetTitle)) {
                return;
            }

            if (!selectedRangesBySegment.has(candidate.segmentIndex)) {
                selectedRangesBySegment.set(candidate.segmentIndex, []);
            }

            var existingRanges = selectedRangesBySegment.get(candidate.segmentIndex);
            var overlaps = existingRanges.some(function (range) {
                return rangesOverlap(candidate, range);
            });

            if (overlaps) {
                return;
            }

            selected.push(candidate);
            existingRanges.push({
                start: candidate.start,
                end: candidate.end
            });
            linkedTargetTitles.add(candidate.targetTitle);
        });

        if (CONFIG.debug) {
            debugTable(
                "[bn-internal-linker] Final selected link candidates",
                selected.map(function (candidate) {
                    return {
                        targetTitle: candidate.targetTitle,
                        displayText: candidate.displayText,
                        replacement: candidate.replacement,
                        wordCount: candidate.wordCount,
                        method: candidate.method,
                        similarity: Math.round(candidate.similarity * 1000) / 1000,
                        segmentIndex: candidate.segmentIndex,
                        start: candidate.start,
                        end: candidate.end
                    };
                })
            );

            debugLog(
                "[bn-internal-linker] Candidate count:",
                candidates.length,
                "Selected:",
                selected.length,
                "Limit:",
                maxLinks
            );
        }

        return selected;
    }

    function groupSelectedCandidatesBySegment(selectedCandidates) {
        var grouped = new Map();

        selectedCandidates.forEach(function (candidate) {
            if (!grouped.has(candidate.segmentIndex)) {
                grouped.set(candidate.segmentIndex, []);
            }

            grouped.get(candidate.segmentIndex).push(candidate);
        });

        grouped.forEach(function (candidates) {
            candidates.sort(function (a, b) {
                return b.start - a.start;
            });
        });

        return grouped;
    }

    /**
     * Applies selected link candidates to the original editable segments.
     *
     * Replacement is done from right to left inside each segment so earlier
     * indexes remain valid.
     */
    function applySelectedCandidatesToSegments(segments, selectedCandidates) {
        var grouped = groupSelectedCandidatesBySegment(selectedCandidates);

        return segments.map(function (segment, segmentIndex) {
            if (segment.protected) {
                return segment.text;
            }

            var text = segment.text;
            var candidates = grouped.get(segmentIndex) || [];

            candidates.forEach(function (candidate) {
                text =
                    text.slice(0, candidate.start) +
                    candidate.replacement +
                    text.slice(candidate.end);
            });

            return text;
        }).join("");
    }

    /**
     * Main link-application function.
     *
     * It receives accepted target titles, finds exact/pipe occurrences in the
     * current article text, selects the safest candidates, and applies them.
     */
    function applyLinksToSegments(segments, titleData, matches) {
        var allCandidates = collectLinkCandidates(segments, titleData, matches);
        var selectedCandidates = selectTopLinkCandidates(allCandidates);
        var newText = applySelectedCandidatesToSegments(segments, selectedCandidates);

        var linkedTitleSet = new Set();

        selectedCandidates.forEach(function (candidate) {
            linkedTitleSet.add(candidate.targetTitle);
        });

        return {
            text: newText,
            addedLinks: selectedCandidates.length,
            linkedTitles: Array.from(linkedTitleSet).sort(),
            candidatesFound: allCandidates.length,
            selectedCandidates: selectedCandidates,
            limitReached: allCandidates.length > selectedCandidates.length && selectedCandidates.length >= getMaxLinksPerRun()
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

        console.log("[bn-internal-linker]", message);

        if (mw.notify) {
            mw.notify(message, {
                type: type,
                tag: "bn-internal-linker-status",
                autoHide: type !== "error"
            });
            return;
        }

        if (type === "error") {
            window.alert(message);
        }
    }

    function askThreshold() {
        if (!CONFIG.askFrequencyThreshold) {
            return CONFIG.maxFrequency;
        }

        var defaultValue = String(CONFIG.maxFrequency);

        var answer = window.prompt(
            "যে শিরোনাম/টার্গেটগুলো ১ থেকে কতবার এসেছে, সেগুলো পরীক্ষা করা হবে?\n" +
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

    function formatCandidateForPreview(candidate) {
        if (candidate.method === "exact") {
            return "• " + candidate.displayText + " → [[" + candidate.targetTitle + "]]";
        }

        return (
            "• " +
            candidate.displayText +
            " → [[" +
            candidate.targetTitle +
            "|" +
            candidate.displayText +
            "]]" +
            " (" +
            candidate.method +
            ")"
        );
    }

    function confirmPreview(result, matchedTitleCount, threshold) {
        if (!CONFIG.previewBeforeApply) {
            return true;
        }

        var selected = result.selectedCandidates || [];

        var list = selected
            .slice(0, CONFIG.previewListLimit)
            .map(formatCandidateForPreview)
            .join("\n");

        var remaining = selected.length - CONFIG.previewListLimit;

        if (remaining > 0) {
            list += "\n... আরও " + convert(remaining) + "টি";
        }

        var exactCount = selected.filter(function (candidate) {
            return candidate.method === "exact";
        }).length;

        var pipeCount = selected.filter(function (candidate) {
            return candidate.method !== "exact";
        }).length;

        var limitLine = result.limitReached
            ? "\nলিমিট প্রয়োগ হয়েছে: সর্বোচ্চ " + convert(getMaxLinksPerRun()) + "টি লিঙ্ক নেওয়া হয়েছে।"
            : "";

        var message =
            "অভ্যন্তরীণ লিঙ্ক প্রিভিউ\n\n" +
            "ফ্রিকোয়েন্সি সীমা: ১–" + convert(threshold) + "\n" +
            "ম্যাচ করা টার্গেট শিরোনাম: " + convert(matchedTitleCount) + "টি\n" +
            "মোট সম্ভাব্য লিঙ্ক: " + convert(result.candidatesFound || 0) + "টি\n" +
            "প্রয়োগ হবে: " + convert(result.addedLinks) + "টি\n" +
            "সরাসরি লিঙ্ক: " + convert(exactCount) + "টি\n" +
            "পাইপ লিঙ্ক: " + convert(pipeCount) + "টি" +
            limitLine +
            "\n\nনমুনা:\n" +
            (list || "কোনোটি নেই") +
            "\n\nএগুলো edit box-এ প্রয়োগ করবেন?";

        return window.confirm(message);
    }


    // ============================================================
    // MAIN WORKFLOW
    // ============================================================

    function redirectToEditMode() {
        var pageName = mw.config.get("wgPageName");
        var params = {
            action: "edit"
        };

        params[CONFIG.autoRunParam] = "1";

        var editUrl = mw.util.getUrl(pageName, params);

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

        setStatus("নিবন্ধের টেক্সট প্রস্তুত করা হচ্ছে…");

        var protectedRanges = getProtectedRanges(originalText);
        var segments = splitByProtectedRanges(originalText, protectedRanges);

        debugLog("[bn-internal-linker] Protected ranges:", protectedRanges.length);
        debugLog("[bn-internal-linker] Segments:", segments.length);

        setStatus(
            CONFIG.useMediaWikiApiTitleLookup
                ? "সম্ভাব্য শিরোনাম যাচাই হচ্ছে…"
                : "শিরোনাম তালিকা লোড হচ্ছে…"
        );

        loadTitleDataForSegments(segments)
            .then(function (titleData) {
                setStatus("নিবন্ধের টেক্সট বিশ্লেষণ করা হচ্ছে…");

                var freq = countTitleCandidateFrequencies(segments, titleData);
                var matches = getLowFrequencyTitleMatches(freq, titleData, threshold);

                if (matches.size === 0) {
                    setStatus(
                        "ম্যাচ করা কোনো নিরাপদ কম-ফ্রিকোয়েন্সি শিরোনাম পাওয়া যায়নি। Console debug দেখুন।",
                        "warn"
                    );
                    return;
                }

                setStatus("ম্যাচ পাওয়া গেছে। লিঙ্ক প্রস্তাব তৈরি হচ্ছে…");

                var result = applyLinksToSegments(segments, titleData, matches);

                if (result.addedLinks === 0 || result.text === originalText) {
                    setStatus(
                        "নতুন কোনো লিঙ্ক যোগ করার মতো নিরাপদ স্থান পাওয়া যায়নি। Console debug দেখুন।",
                        "warn"
                    );
                    return;
                }

                if (!confirmPreview(result, matches.size, threshold)) {
                    setStatus("প্রিভিউ দেখে পরিবর্তন বাতিল করা হয়েছে।", "warn");
                    return;
                }

                $textbox.val(result.text);
                appendEditSummary(result.addedLinks);

                setStatus(
                    convert(result.addedLinks) +
                    "টি অভ্যন্তরীণ সংযোগ edit box-এ যোগ করা হয়েছে। সংরক্ষণের আগে দয়া করে পরিবর্তন পরীক্ষা করুন।",
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

    // ============================================================
    // PORTLET LINK INSTALLATION
    // ============================================================

    function bindInternalLinkerClick($link) {
        $link.off("click.bnInternalLinker").on("click.bnInternalLinker", function (event) {
            event.preventDefault();
            runInternalLinker();
        });
    }

    function addPortletLink() {
        var linkId = "t-bn-internal-linker";

        // Avoid duplicate links if script is loaded more than once.
        $("#" + linkId).remove();

        var tooltip = "কম-ফ্রিকোয়েন্সি বাংলা শব্দ/শব্দগুচ্ছ থেকে অভ্যন্তরীণ লিঙ্ক যোগ করুন";

        /*
         * First try normal MediaWiki portlets.
         * Vector 2022 sometimes does not expose p-tb in the expected way,
         * so we try multiple safe locations.
         */
        var portletCandidates = [
            CONFIG.portletId,
            "p-tb",
            "p-cactions",
            "p-navigation",
            "p-personal"
        ];

        for (var i = 0; i < portletCandidates.length; i++) {
            var portletId = portletCandidates[i];

            try {
                var link = mw.util.addPortletLink(
                    portletId,
                    "#",
                    CONFIG.portletLabel,
                    linkId,
                    tooltip
                );

                if (link) {
                    bindInternalLinkerClick($(link));
                    debugLog("[bn-internal-linker] Portlet link added to:", portletId);
                    return;
                }
            } catch (e) {
                debugWarn("[bn-internal-linker] Failed to add link to portlet:", portletId, e);
            }
        }

        /*
         * Fallback for Vector 2022 page-tools menu.
         * This manually appends a normal-looking menu item into any available
         * Vector menu list.
         */
        var $menuList = $(
            "#p-tb ul, " +
            "#p-cactions ul, " +
            "#p-navigation ul, " +
            "#p-personal ul, " +
            "#vector-page-tools .vector-menu-content-list, " +
            ".vector-page-tools .vector-menu-content-list, " +
            ".vector-menu-content-list"
        ).first();

        if ($menuList.length) {
            var $item = $("<li>", {
                id: linkId,
                "class": "mw-list-item"
            });

            var $a = $("<a>", {
                href: "#",
                title: tooltip
            });

            $("<span>").text(CONFIG.portletLabel).appendTo($a);
            $a.appendTo($item);
            $item.appendTo($menuList);

            bindInternalLinkerClick($a);

            debugLog("[bn-internal-linker] Portlet fallback link added manually.");
            return;
        }

        /*
         * Final emergency fallback:
         * Add a small fixed button at bottom-right so the tool is still usable
         * even if the current skin/sidebar structure changes.
         */
        var $button = $("<button>", {
            id: linkId,
            type: "button",
            text: CONFIG.portletLabel,
            title: tooltip
        }).css({
            position: "fixed",
            right: "16px",
            bottom: "16px",
            zIndex: 9999,
            padding: "8px 12px",
            border: "1px solid #36c",
            borderRadius: "4px",
            background: "#fff",
            color: "#36c",
            cursor: "pointer",
            fontSize: "14px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
        });

        $("body").append($button);
        bindInternalLinkerClick($button);

        debugWarn("[bn-internal-linker] Normal portlet not found. Emergency floating button added.");
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

    /// MediaWiki user scripts should load required modules before using mw.util.
    mw.loader.using(["mediawiki.util", "mediawiki.api"]).done(function () {
        console.log("[bn-internal-linker] mediawiki.util loaded. Initializing...");
        $(init);
    }).fail(function (error) {
        console.error("[bn-internal-linker] Failed to load mediawiki.util:", error);
    });

})(mw, jQuery);
// </nowiki>