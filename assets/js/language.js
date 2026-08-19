(function () {
  var html = document.documentElement;
  function getLangLabels() {
    return document.querySelectorAll('.lang-switcher .lang-label');
  }
  var currentLang = localStorage.getItem('siteLang') || 'en';

  Promise.all([
    window.getApplicationSettings ? window.getApplicationSettings() : Promise.resolve(null),
    window.salonDatabase && window.salonDatabase.getBookingConfiguration
      ? window.salonDatabase.getBookingConfiguration().catch(function () { return null; })
      : Promise.resolve(null),
    window.salonDatabase && window.salonDatabase.getTranslations
      ? window.salonDatabase.getTranslations().catch(function () { return []; })
      : Promise.resolve([]),
    window.salonDatabase && window.salonDatabase.getServiceCategories
      ? window.salonDatabase.getServiceCategories().catch(function () { return []; })
      : Promise.resolve([]),
    window.salonDatabase && window.salonDatabase.getServices
      ? window.salonDatabase.getServices().catch(function () { return []; })
      : Promise.resolve([])
  ]).then(function (results) {
    var appSettings = results[0];
    var bookingConfiguration = results[1];
    var translationRows = results[2] || [];
    var serviceCategories = results[3] || [];
    var activeServices = results[4] || [];
    var translations = {};

    translationRows.forEach(function (row) {
      if (!row || !row.key) return;
      translations[row.key] = {
        en: row.en == null ? '' : String(row.en),
        ar: row.ar == null ? '' : String(row.ar)
      };
    });

    if (!localStorage.getItem('siteLang') && appSettings && appSettings.default_language) {
      currentLang = String(appSettings.default_language).toLowerCase();
      if (currentLang !== 'ar' && currentLang !== 'en') currentLang = 'en';
    }

    if (appSettings && appSettings.contact_phone) {
      var contactPhone = String(appSettings.contact_phone).trim();
      translations['common.phone'] = { en: contactPhone, ar: contactPhone };
    }

    if (bookingConfiguration && bookingConfiguration.settings) {
      var hoursSettings = bookingConfiguration.settings;
      var weekdayOpening = String(hoursSettings.weekday_opening_time || hoursSettings.opening_time || '09:00').slice(0, 5);
      var weekdayClosing = String(hoursSettings.weekday_closing_time || hoursSettings.closing_time || '18:00').slice(0, 5);
      var weekendOpening = String(hoursSettings.weekend_opening_time || '10:00').slice(0, 5);
      var weekendClosing = String(hoursSettings.weekend_closing_time || '16:00').slice(0, 5);

      function formatOpeningHour(value, lang) {
        var parts = String(value || '').split(':').map(Number);
        var h = parts[0] || 0;
        var m = parts[1] || 0;
        var hour = h % 12 || 12;
        var minute = m ? ':' + String(m).padStart(2, '0') : '';
        if (lang === 'ar') return hour + minute + (h >= 12 ? ' م' : ' ص');
        return hour + minute + (h >= 12 ? 'pm' : 'am');
      }

      translations['openingHours.days.hours-1'] = {
        en: formatOpeningHour(weekdayOpening, 'en') + ' - ' + formatOpeningHour(weekdayClosing, 'en'),
        ar: formatOpeningHour(weekdayOpening, 'ar') + ' - ' + formatOpeningHour(weekdayClosing, 'ar')
      };
      translations['openingHours.days.hours-2'] = {
        en: formatOpeningHour(weekendOpening, 'en') + ' - ' + formatOpeningHour(weekendClosing, 'en'),
        ar: formatOpeningHour(weekendOpening, 'ar') + ' - ' + formatOpeningHour(weekendClosing, 'ar')
      };
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function serviceCategoryImageUrl(category) {
      var src = category && category.image_url ? String(category.image_url).trim() : '';
      if (!src) return '';
      if (/^(https?:|data:|blob:)/i.test(src)) return src;
      return 'assets/images/' + src.replace(/^\/+/, '');
    }

    function renderServiceItems() {
      var grid = document.getElementById('services-grid');
      if (!grid) return;

      var categories = (serviceCategories || [])
        .filter(function(category) {
          return category && category.active !== false && activeServices.some(function(service) {
            return service && service.active !== false && String(service.category_id) === String(category.id);
          });
        })
        .sort(function(a, b) { return Number(a.sort_order || 0) - Number(b.sort_order || 0); })
        .slice(0, 4);

      grid.innerHTML = categories.map(function(category) {
        var title = category.name_en || '';
        var description = category.description_en || '';
        var src = serviceCategoryImageUrl(category);
        var width = category.image_width || 150;
        var height = category.image_height || 90;
        var imgHtml = src
          ? '<figure class=\"box-icon-image\"><img src=\"' + escapeHtml(src) + '\" alt=\"' + escapeHtml(title) + '\" width=\"' + escapeHtml(width) + '\" height=\"' + escapeHtml(height) + '\" loading=\"lazy\" /></figure>'
          : '';

        return '<div class=\"cell-xs-6\">'
          + '<article class=\"box-icon\">'
          + imgHtml
          + '<p class=\"box-icon-header\"><a class=\"link-underlined\" href=\"booking.html\">' + escapeHtml(title) + '</a></p>'
          + '<p class=\"box-icon-text\">' + escapeHtml(description) + '</p>'
          + '</article>'
          + '</div>';
      }).join('');

      if (!categories.length) {
        grid.innerHTML = '<div class=\"cell-xs-12\"><p class=\"box-icon-text\">No services are available yet.</p></div>';
      }
    }

    function applyLang(lang, isInitial) {
      if (!isInitial) document.body.classList.add('lang-transitioning');

      function doApply() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
          var key = el.getAttribute('data-i18n');
          var data = translations[key];
          if (!data) return;

          var text = data[lang] || data.en;
          if (text == null || text === '') return;

          var attrConfig = el.getAttribute('data-i18n-attr');
          if (attrConfig) {
            var parts = attrConfig.split('-');
            var attrName = parts[0];
            var prefix = parts[1] || '';
            el.setAttribute(attrName, prefix + text);
            if (el.tagName.toLowerCase() !== 'img') el.textContent = text;
            return;
          }

          if (text.indexOf('<') !== -1) el.innerHTML = text;
          else el.textContent = text;
        });

        if (translations['nav.langSwitcherLabel']) {
          getLangLabels().forEach(function (el) {
            el.textContent = translations['nav.langSwitcherLabel'][lang] || '';
          });
        }

        localStorage.setItem('siteLang', lang);
        currentLang = lang;
        html.setAttribute('lang', lang);
        html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        document.body.classList.remove('lang-transitioning');

        var antiFlash = document.getElementById('anti-flash');
        if (antiFlash) antiFlash.parentNode.removeChild(antiFlash);

        document.dispatchEvent(new CustomEvent('langChanged', { detail: { lang: lang } }));
      }

      if (isInitial) {
        doApply();
        renderServiceItems();
      } else {
        setTimeout(function () {
          doApply();
          renderServiceItems();
        }, 150);
      }
    }

    applyLang(currentLang, true);

    document.addEventListener('navbarLoaded', function () {
      applyLang(currentLang, true);
    });

    document.addEventListener('click', function (e) {
      var anchor = e.target.closest('.lang-switcher');
      if (!anchor) return;
      e.preventDefault();
      var newLang = currentLang === 'en' ? 'ar' : 'en';
      localStorage.setItem('siteLang', newLang);
      location.reload();
    });
  }).catch(function (err) {
    console.error('[i18n] Failed to load translations from Supabase:', err);
    var antiFlash = document.getElementById('anti-flash');
    if (antiFlash) antiFlash.parentNode.removeChild(antiFlash);
  });
})();
