// <nowiki>
/*
 * suffix-cleaner.js
 * Bengali hyphenated suffix cleanup for bn.wikipedia.org source editor.
 *
 * What it safely handles:
 *   1) Bengali words:  বাংলা-এর → বাংলার, দেশ-এর → দেশের, বই-তে → বইতে
 *   2) Numbers:        ১৯৩২-এর → ১৯৩২ এর, ''২''-এর → ২ এর
 *   3) Wiki links:     [[আমেরিকান এক্সপেরিয়েন্স]]-এর
 *                      → [[আমেরিকান এক্সপেরিয়েন্স|আমেরিকান এক্সপেরিয়েন্সের]]
 *
 * It avoids editing templates, categories, files, comments, nowiki/pre/code blocks,
 * external links, and already-existing wiki-link targets.
 */
(function () {
  'use strict';

  mw.loader.using(['mediawiki.util']).then(function () {
    var CONFIG = {
      editSummaryNote: 'suffix-cleaner: Bengali hyphenated suffix cleanup',
      askBeforeFullPageClean: true,
      autoForceRecentChangesFilters: false,
      editButtonId: 'bnwiki-suffix-cleaner-edit-button',
      editButtonBoxId: 'bnwiki-suffix-cleaner-edit-button-box',
      portletLinkId: 't-bnwiki-suffix-cleaner',
      recentChangesLinkId: 't-bnwiki-filtered-rc',
      floatingButtonId: 'bnwiki-suffix-cleaner-floating-button',
      requiredRecentChangesParams: {
        hidebots: '1',
        hidecategorization: '1',
        hideWikibase: '1',
        hideWikifunctions: '1'
      }
    };

    var PLACEHOLDER_PREFIX = '\uE000BN_SUFFIX_CLEANER_';
    var PLACEHOLDER_SUFFIX = '_\uE001';
    var BN_CHAR = '[\\u0980-\\u09FF]';
    var BN_WORD = '[\\u0980-\\u09FF]+';
    var DIGIT = '[0-9۰-০-৯]+';
    var SUFFIX_RE_PART = '(এর|র|কে|তে)';

    function isBnWiki() {
      var dbName = mw.config.get('wgDBname');
      return !dbName || dbName === 'bnwiki';
    }

    function isEditPage() {
      var action = mw.config.get('wgAction');
      return action === 'edit' || action === 'submit';
    }

    function getEditBox() {
      return document.getElementById('wpTextbox1');
    }

    function escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function hasBengali(text) {
      return new RegExp(BN_CHAR).test(text || '');
    }

    function endsWithAny(text, chars) {
      if (!text) {
        return false;
      }
      return chars.indexOf(text.charAt(text.length - 1)) !== -1;
    }

    function appendErSuffix(base) {
      if (!base) {
        return base;
      }

      // Words already ending with Bengali vowel signs usually take only র:
      // বাংলা-এর → বাংলার, নদী-এর → নদীর
      if (endsWithAny(base, 'ািীুূৃেৈোৌ')) {
        return base + 'র';
      }

      // Common independent-vowel endings: বই-এর should not become বইের.
      // Conservative output keeps the natural য়ের form.
      if (endsWithAny(base, 'ইঈউঊএঐওঔ')) {
        return base + 'য়ের';
      }

      return base + 'ের';
    }

    function appendSuffix(base, suffix) {
      if (!base || !suffix) {
        return base;
      }

      if (suffix === 'এর') {
        return appendErSuffix(base);
      }

      return base + suffix;
    }

    function splitWikiLinkContent(content) {
      var pipeIndex = content.indexOf('|');

      if (pipeIndex === -1) {
        return {
          target: content,
          label: '',
          hasPipe: false
        };
      }

      return {
        target: content.slice(0, pipeIndex),
        label: content.slice(pipeIndex + 1),
        hasPipe: true
      };
    }

    function getDisplayTextForLink(content) {
      var parsed = splitWikiLinkContent(content);
      return parsed.label || parsed.target;
    }

    function isUnsafeLinkTarget(target) {
      var cleanTarget = String(target || '').trim();
      var normalized = cleanTarget.replace(/_/g, ' ');
      var colonIndex = normalized.indexOf(':');

      if (colonIndex === -1) {
        return false;
      }

      var namespace = normalized.slice(0, colonIndex).toLowerCase();

      return [
        'category', 'বিষয়শ্রেণী',
        'file', 'image', 'চিত্র',
        'template', 'টেমপ্লেট',
        'module', 'মডিউল',
        'special', 'বিশেষ',
        'help', 'সাহায্য',
        'wikipedia', 'উইকিপিডিয়া',
        'mediawiki', 'মিডিয়াউইকি',
        'user', 'ব্যবহারকারী',
        'user talk', 'ব্যবহারকারী আলাপ',
        'talk', 'আলাপ'
      ].indexOf(namespace) !== -1;
    }

    function protectByRegex(text, regex, store) {
      return text.replace(regex, function (match) {
        var token = PLACEHOLDER_PREFIX + store.length + PLACEHOLDER_SUFFIX;
        store.push(match);
        return token;
      });
    }

    function restoreProtected(text, store) {
      for (var i = store.length - 1; i >= 0; i--) {
        text = text.replace(
          new RegExp(escapeRegExp(PLACEHOLDER_PREFIX + i + PLACEHOLDER_SUFFIX), 'g'),
          store[i]
        );
      }
      return text;
    }

    function protectUnsafeAreas(text, store) {
      var protectedText = text;

      protectedText = protectByRegex(protectedText, /<!--[\s\S]*?-->/g, store);

      protectedText = protectByRegex(
        protectedText,
        /<(nowiki|pre|syntaxhighlight|source|code|math|score|chem|hiero|timeline|gallery)\b[\s\S]*?<\/\1\s*>/gi,
        store
      );

      for (var i = 0; i < 6; i++) {
        protectedText = protectByRegex(protectedText, /\{\{[^{}]*\}\}/g, store);
      }

      protectedText = protectByRegex(protectedText, /\[(?:https?:)?\/\/[^\]\n]+\]/gi, store);
      protectedText = protectByRegex(protectedText, /\bhttps?:\/\/[^\s<>{}\[\]|]+/gi, store);

      protectedText = protectByRegex(
        protectedText,
        /\[\[(?:Category|বিষয়শ্রেণী|File|Image|চিত্র|Template|টেমপ্লেট|Module|মডিউল|Special|বিশেষ|Help|সাহায্য|Wikipedia|উইকিপিডিয়া|MediaWiki|মিডিয়াউইকি|User|ব্যবহারকারী|User talk|ব্যবহারকারী আলাপ|Talk|আলাপ):[^\]]+\]\]/gi,
        store
      );

      return protectedText;
    }

    function cleanWikiLinkSuffixes(text) {
      var linkSuffixRegex = new RegExp('\\[\\[([^\\]\\n]+?)\\]\\]\\s*-\\s*' + SUFFIX_RE_PART, 'g');

      return text.replace(linkSuffixRegex, function (match, content, suffix) {
        var parsed = splitWikiLinkContent(content);

        if (isUnsafeLinkTarget(parsed.target)) {
          return match;
        }

        var displayText = getDisplayTextForLink(content);

        if (!hasBengali(displayText)) {
          return match;
        }

        var newDisplayText = appendSuffix(displayText, suffix);

        if (parsed.hasPipe) {
          return '[[' + parsed.target + '|' + newDisplayText + ']]';
        }

        if (newDisplayText === parsed.target) {
          return '[[' + parsed.target + ']]';
        }

        return '[[' + parsed.target + '|' + newDisplayText + ']]';
      });
    }

    function protectRemainingWikiLinks(text, store) {
      return protectByRegex(text, /\[\[[^\]\n]+\]\]/g, store);
    }

    function cleanNumericSuffixes(text) {
      var italicNumberRegex = new RegExp("''(" + DIGIT + ")''\\s*-\\s*" + SUFFIX_RE_PART, 'g');
      var numberRegex = new RegExp('(' + DIGIT + ')\\s*-\\s*' + SUFFIX_RE_PART, 'g');

      text = text.replace(italicNumberRegex, function (match, number, suffix) {
        return number + ' ' + suffix;
      });

      text = text.replace(numberRegex, function (match, number, suffix) {
        return number + ' ' + suffix;
      });

      return text;
    }

    function cleanBengaliWordSuffixes(text) {
      var wordRegex = new RegExp('(' + BN_WORD + ')\\s*-\\s*' + SUFFIX_RE_PART, 'g');

      return text.replace(wordRegex, function (match, word, suffix) {
        return appendSuffix(word, suffix);
      });
    }

    function cleanWikitext(wikitext) {
      var original = String(wikitext || '');
      var protectedStore = [];
      var text = original;

      text = protectUnsafeAreas(text, protectedStore);
      text = cleanWikiLinkSuffixes(text);
      text = protectRemainingWikiLinks(text, protectedStore);
      text = cleanNumericSuffixes(text);
      text = cleanBengaliWordSuffixes(text);
      text = restoreProtected(text, protectedStore);

      return {
        text: text,
        changed: text !== original
      };
    }
        function appendEditSummary() {
      var summary = document.getElementById('wpSummary');

      if (!summary) {
        return;
      }

      if (summary.value.indexOf(CONFIG.editSummaryNote) !== -1) {
        return;
      }

      summary.value = summary.value
        ? summary.value + '; ' + CONFIG.editSummaryNote
        : CONFIG.editSummaryNote;
    }

    function notify(message, type) {
      if (mw.notify) {
        mw.notify(message, { type: type || 'info' });
      }
    }

    function runCleaner() {
      var textarea = getEditBox();

      if (!textarea) {
        notify('প্রত্যয় পরিষ্কারক: উৎস সম্পাদনা বক্স পাওয়া যায়নি।', 'warn');
        return;
      }

      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      var hasSelection = typeof start === 'number' && typeof end === 'number' && start !== end;

      if (!hasSelection && CONFIG.askBeforeFullPageClean) {
        var ok = window.confirm('কোনো টেক্সট নির্বাচন করা হয়নি। পুরো সম্পাদনাতেই প্রত্যয় পরিষ্কারক চালাবেন?');
        if (!ok) {
          return;
        }
      }

      var original = hasSelection
        ? textarea.value.slice(start, end)
        : textarea.value;

      var result = cleanWikitext(original);

      if (!result.changed) {
        notify('প্রত্যয় পরিষ্কারক: পরিবর্তন করার দরকার নেই।', 'info');
        return;
      }

      if (hasSelection) {
        textarea.value = textarea.value.slice(0, start) + result.text + textarea.value.slice(end);
        textarea.selectionStart = start;
        textarea.selectionEnd = start + result.text.length;
      } else {
        textarea.value = result.text;
      }

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      appendEditSummary();
      notify('প্রত্যয় পরিষ্কারক: পরিষ্কার করা হয়েছে। সংরক্ষণের আগে পরিবর্তনগুলো দেখে নিন।', 'success');
    }

    function addPortletButton() {
      if (document.getElementById(CONFIG.portletLinkId)) {
        return;
      }

      var portletIds = ['p-tb', 'p-cactions', 'p-personal'];
      var added = null;

      for (var i = 0; i < portletIds.length; i++) {
        if (document.getElementById(portletIds[i])) {
          added = mw.util.addPortletLink(
            portletIds[i],
            '#',
            'প্রত্যয় পরিষ্কারক',
            CONFIG.portletLinkId,
            'উৎস সম্পাদনা মোডে বাংলা হাইফেন-যুক্ত প্রত্যয় পরিষ্কার করে'
          );
          break;
        }
      }

      var link = document.getElementById(CONFIG.portletLinkId) || added;
      if (link) {
        link.addEventListener('click', function (event) {
          event.preventDefault();
          runCleaner();
        });
      }
    }

    function makeCleanerButton(id) {
      var button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.className = 'mw-ui-button mw-ui-progressive';
      button.textContent = 'প্রত্যয় পরিষ্কারক';
      button.title = 'বাংলা হাইফেন-যুক্ত প্রত্যয় পরিষ্কার করুন';

      button.addEventListener('click', function () {
        runCleaner();
      });

      return button;
    }

    function addInlineEditButton() {
      var textarea = getEditBox();

      if (!textarea || document.getElementById(CONFIG.editButtonId)) {
        return;
      }

      var box = document.createElement('div');
      box.id = CONFIG.editButtonBoxId;
      box.style.margin = '6px 0';

      box.appendChild(makeCleanerButton(CONFIG.editButtonId));
      textarea.parentNode.insertBefore(box, textarea);
    }

    function addFloatingEditButton() {
      if (document.getElementById(CONFIG.floatingButtonId)) {
        return;
      }

      var button = makeCleanerButton(CONFIG.floatingButtonId);
      button.style.position = 'fixed';
      button.style.right = '16px';
      button.style.bottom = '16px';
      button.style.zIndex = '9999';
      button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';

      document.body.appendChild(button);
    }

    var addButtonsRetryCount = 0;

    function addCleanerButtons() {
      if (!isEditPage()) {
        return;
      }

      if (!getEditBox()) {
        if (addButtonsRetryCount < 20) {
          addButtonsRetryCount++;
          window.setTimeout(addCleanerButtons, 250);
        }
        return;
      }

      addPortletButton();
      addInlineEditButton();
      addFloatingEditButton();
    }

    function isRecentChangesPage() {
      var special = mw.config.get('wgCanonicalSpecialPageName');
      var pageName = mw.config.get('wgPageName') || '';

      return special === 'Recentchanges' ||
        special === 'RecentChanges' ||
        pageName.indexOf('বিশেষ:সাম্প্রতিক_পরিবর্তনসমূহ') === 0 ||
        pageName.indexOf('Special:RecentChanges') === 0;
    }

    function makeFilteredRecentChangesUrl() {
      var url = new URL(window.location.href);
      var changed = false;

      Object.keys(CONFIG.requiredRecentChangesParams).forEach(function (key) {
        var requiredValue = CONFIG.requiredRecentChangesParams[key];

        if (url.searchParams.get(key) !== requiredValue) {
          url.searchParams.set(key, requiredValue);
          changed = true;
        }
      });

      return {
        url: url,
        changed: changed
      };
    }

    function handleRecentChangesFilters() {
      if (!isRecentChangesPage()) {
        return;
      }

      var filtered = makeFilteredRecentChangesUrl();

      if (CONFIG.autoForceRecentChangesFilters && filtered.changed) {
        window.location.replace(filtered.url.toString());
        return;
      }

      if (!filtered.changed || document.getElementById(CONFIG.recentChangesLinkId)) {
        return;
      }

      mw.util.addPortletLink(
        'p-tb',
        filtered.url.toString(),
        'Filtered recent changes',
        CONFIG.recentChangesLinkId,
        'Open recent changes with bots, categorization, Wikibase, and Wikifunctions hidden'
      );
    }

    function init() {
      if (!isBnWiki()) {
        return;
      }

      addCleanerButtons();
      handleRecentChangesFilters();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }

    window.bnwikiSuffixCleaner = {
      cleanWikitext: cleanWikitext,
      runCleaner: runCleaner,
      appendSuffix: appendSuffix
    };
  });
}());
// </nowiki>