(function () {
    'use strict';

    var faqSettings = null;
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

        var descEl = document.getElementById('faq-description');
        if (descEl && faqSettings) {
            descEl.textContent =
                faqSettings['description_' + lang] ||
                faqSettings.description_en ||
                '';
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
            throw new Error('Supabase is not configured.');
        }

        var results = await Promise.all([
            window.salonDatabase.getFaqSettings(),
            window.salonDatabase.getFaqs()
        ]);

        faqSettings = results[0];
        faqItems = results[1] || [];

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
            console.error('[FAQ] Could not load FAQ from Supabase:', err);

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
