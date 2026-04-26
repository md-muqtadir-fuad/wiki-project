(function ($, mw) {
    'use strict';

    var STORAGE_KEY = 'bnwiki-redlinks-remove-list';

//ইংরেজি সংখ্যাকে বাংলা করবে
    function convert(str) {
        var mystr = str.toString();
        var outj; // javascript escaped hex
        var outj1;
    var be = new Array();
    be['1'] = "\u09E7";
    be['2'] = "\u09E8";
    be['3'] = "\u09E9";
    be['4'] = "\u09EA";
    be['5'] = "\u09EB";
    be['6'] = "\u09EC";
    be['7'] = "\u09ED";
    be['8'] = "\u09EE";
    be['9'] = "\u09EF";
    be['0'] = "\u09E6";
    be[' '] = '';
    be['-'] = '-';
    outj1 = "";
    for (var i = 0; i < mystr.length; i++) {
        var ch = mystr.substr(i, 1);
        outj = be[ch];
        outj1 += outj;
        }
    return outj1;

    }

    function quoteRegExp(str) {
        return str.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&');
    }

    function extractTitleFromHref(href) {
        var match = href.match(/[?&]title=([^&]+)/);
        var title = match ? match[1] : null;

        if (!title) {
            match = href.match(/\/wiki\/([^#?]+)/);
            title = match ? match[1] : null;
        }

        if (!title) {
            return null;
        }

        title = title.replace(/_/g, ' ');
        try {
            title = decodeURIComponent(title);
        } catch (e) {}

        return title;
    }

    function getCategoryPrefixes() {
        var prefixes = ['Category'];
        var formattedNamespaces = mw.config.get('wgFormattedNamespaces') || {};

        if (formattedNamespaces[14]) {
            prefixes.push(formattedNamespaces[14]);
        }

        return prefixes;
    }

    function isCategoryTitle(title) {
        var prefixes = getCategoryPrefixes();
        var i;

        for (i = 0; i < prefixes.length; i++) {
            if (title.indexOf(prefixes[i] + ':') === 0) {
                return true;
            }
        }

        return false;
    }

    function getRedlinksOnPage() {
        var redlinks = [];
        var seen = {};

        $('a.new').each(function () {
            var title = extractTitleFromHref(this.href);

            if (title && !seen[title]) {
                seen[title] = true;
                redlinks.push(title);
            }
        });

        return redlinks;
    }

    function cleanTemplateTags(text) {
        text = text.replace(/\{\{[Cc]leanup-?\s*[Rr]ed\s*[Ll]inks?[^\}]*\}\}\r?\n?/g, '');
        text = text.replace(/\{\{[Rr]ed\s*links?[^\}]*\}\}\r?\n?/g, '');
        text = text.replace(/\{\{[Tt]oo many red links[^\}]*\}\}\r?\n?/g, '');
        return text;
    }

    function redlinksRemoveAll() {
        var wpTextbox1 = document.getElementById('wpTextbox1');
        var summaryBox = document.getElementById('wpSummary');
        var saved = localStorage.getItem(STORAGE_KEY);
        var redlinks, i, totalRedlinks, title, reglink1, reglink2, reglink3;

        if (!wpTextbox1 || !saved) {
            return;
        }

        try {
            redlinks = JSON.parse(saved);
        } catch (e) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        if (!redlinks || !redlinks.length) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        totalRedlinks = 0;

        for (i = 0; i < redlinks.length; i++) {
            title = redlinks[i];

            reglink1 = new RegExp(
                '\\[\\[\\s*(' + quoteRegExp(title).replace(/\s/g, '[\\s_]*') + ')\\s*\\|\\s*([^\\]]*)\\s*\\]\\]',
                'gi'
            );
            reglink2 = new RegExp(
                '\\[\\[\\s*(' + quoteRegExp(title).replace(/\s/g, '[\\s_]*') + ')\\s*\\]\\]',
                'gi'
            );

            if (wpTextbox1.value.match(reglink1) !== null) {
                totalRedlinks += wpTextbox1.value.match(reglink1).length;
            }
            if (wpTextbox1.value.match(reglink2) !== null) {
                totalRedlinks += wpTextbox1.value.match(reglink2).length;
            }

            if (isCategoryTitle(title)) {
                reglink3 = new RegExp(
                    '\\[\\[\\s*(' + quoteRegExp(title).replace(/\s/g, '[\\s_]*') + ')(\\s*\\|[^\\]]*)?\\s*\\]\\]\\r?\\n?',
                    'gi'
                );
                wpTextbox1.value = wpTextbox1.value.replace(reglink3, '');
            }

            wpTextbox1.value = wpTextbox1.value.replace(reglink1, '$2');
            wpTextbox1.value = wpTextbox1.value.replace(reglink2, '$1');
        }

        wpTextbox1.value = cleanTemplateTags(wpTextbox1.value);

        if (totalRedlinks > 0) {
            if (summaryBox) {
                if (summaryBox.value && !/\s$/.test(summaryBox.value)) {
                    summaryBox.value += ' ';
                }
                summaryBox.value += convert(totalRedlinks) + 'টি লাল সংযোগ স্ক্রিপ্টের মাধ্যমে অপসারণ';
            }

            alert(convert(totalRedlinks) + 'টি লাল সংযোগ স্বয়ংক্রিয়ভাবে অপসারণ করা হয়েছে!');
        } else {
            alert('পাতার উইকিকোডে কোনো লাল সংযোগ পাওয়া যায়নি।');
        }

        localStorage.removeItem(STORAGE_KEY);
    }

    $(function () {
        redlinksRemoveAll();

        mw.loader.using(['mediawiki.util']).then(function () {
            var link = mw.util.addPortletLink(
                'p-tb',
                '#',
                'লাল লিঙ্ক মুছুন',
                't-remove-redlinks',
                'পাতা থেকে লাল সংযোগ অপসারণ করুন'
            );

            if (!link) {
                return;
            }

            $(link).on('click', function (e) {
                var redlinks = getRedlinksOnPage();

                e.preventDefault();

                if (!redlinks.length) {
                    alert('কোনো লাল সংযোগ নেই!');
                    return;
                }

                localStorage.setItem(STORAGE_KEY, JSON.stringify(redlinks));

                if (document.getElementById('wpTextbox1') || /[?&]action=edit\b/.test(window.location.href)) {
                    redlinksRemoveAll();
                } else {
                    window.location.href = mw.util.getUrl(mw.config.get('wgPageName'), { action: 'edit' });
                }
            });
        });
    });
}(jQuery, mediaWiki));