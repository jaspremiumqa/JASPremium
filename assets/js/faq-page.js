(function () {
    'use strict';

    var faqItems = [];
  var uiTranslations = {};

    function currentLang() {
        var lang = document.documentElement.getAttribute('lang')
            || localStorage.getItem('siteLang')
            || 'en';
        return String(lang).toLowerCase() === 'ar' ? 'ar' : 'en';
    }

    function uiText(key, lang) {
    var row = uiTranslations[key] || {};
    return row[lang] || row.en || '';
  }

  function renderFaq(lang) {
        lang = (String(lang).toLowerCase() === 'ar') ? 'ar' : 'en';

        var title = uiText('faq.pageTitle', lang);
        var titleEls = document.querySelectorAll('[data-faq-page-title]');
        titleEls.forEach(function (el) { el.textContent = title || uiText('nav.faq', lang); });

        var descEl = document.getElementById('faq-description');
        if (descEl) {
            descEl.textContent = uiText('faq.pageDescription', lang);
        }

        var faqList = document.getElementById('faq-list');
        if (!faqList) return;

        faqList.innerHTML = '';

        if (!faqItems.length) {
            var empty = document.createElement('p');
            empty.className = 'big';
            empty.textContent = uiText('faq.empty', lang);
            faqList.appendChild(empty);
            return;
        }

        faqItems.forEach(function (item) {
            var dt = document.createElement('dt');
            dt.textContent =
                item['question_' + lang] ||
                item.question_en ||
                '';

            var dd = document.createElement('dd');
            dd.textContent =
                item['answer_' + lang] ||
                item.answer_en ||
                '';

            faqList.appendChild(dt);
            faqList.appendChild(dd);
        });
    }

    async function loadFaq() {
        if (!window.salonDatabase || !window.salonDatabase.isConfigured) {
            throw new Error('The website data service is not configured.');
        }

        faqItems = await window.salonDatabase.getFaqs();

        // Compatibility for installations that have not run the FAQ-to-
        // translations migration yet. Once the new keys exist, the FAQ page
        // uses only the unified translation catalogue.
        if (!uiTranslations['faq.pageTitle'] || !uiTranslations['faq.pageDescription']) {
            try {
                var legacy = await window.salonDatabase.getFaqSettings();
                if (legacy) {
                    if (!uiTranslations['faq.pageTitle']) uiTranslations['faq.pageTitle'] = { en: legacy.title_en || '', ar: legacy.title_ar || '' };
                    if (!uiTranslations['faq.pageDescription']) uiTranslations['faq.pageDescription'] = { en: legacy.description_en || '', ar: legacy.description_ar || '' };
                }
            } catch (_) {}
        }

        renderFaq(currentLang());
    }

    document.addEventListener('DOMContentLoaded', function () {
        var translationPromise = window.salonDatabase && window.salonDatabase.getTranslations
            ? window.salonDatabase.getTranslations()
            : Promise.resolve([]);

        translationPromise.then(function (rows) {
            (rows || []).forEach(function (row) {
                if (row && row.key) uiTranslations[row.key] = { en: row.en || '', ar: row.ar || '' };
            });
            return loadFaq();
        }).catch(function (err) {
            console.error('[FAQ] Could not load FAQ:', err);

            var faqList = document.getElementById('faq-list');
            if (faqList) {
                faqList.innerHTML = '';

                var message = document.createElement('p');
                message.className = 'big';
                message.textContent = uiText('faq.error', currentLang());
                faqList.appendChild(message);
            }
        });
    });

    document.addEventListener('langChanged', function (e) {
        renderFaq(e && e.detail ? e.detail.lang : currentLang());
    });
})();
