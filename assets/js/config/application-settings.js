(function () {
  'use strict';

  function parseValue(value) {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (error) { return value; }
  }

  function requireImage(value, key) {
    var result = parseValue(value);
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Supabase application setting "' + key + '" is missing or invalid.');
    }
    if (!result.url || typeof result.url !== 'string') {
      throw new Error('Supabase application setting "' + key + '" has no image URL.');
    }
    if (!result.width || !result.height) {
      throw new Error('Supabase application setting "' + key + '" is missing image dimensions.');
    }
    return {
      path: String(result.path || ''),
      url: String(result.url),
      width: String(result.width),
      height: String(result.height)
    };
  }

  function optionalImage(value) {
    if (!value) return null;
    var result = parseValue(value);
    if (!result || typeof result !== 'object' || Array.isArray(result) || !result.url) return null;
    return {path:String(result.path || ''), url:String(result.url), width:String(result.width || '32px'), height:String(result.height || '32px')};
  }

  function normalizeSettings(raw) {
    raw = raw || {};
    var currencyOptions = raw.currency_options || raw.currencyOptions;
    var displayCurrency = raw.display_currency || raw.displayCurrency;
    var defaultLanguage = raw.default_language || raw.defaultLanguage;
    var websiteName = raw.website_name || raw.websiteName;
    var contactPhone = raw.contact_phone || raw.contactPhone;

    if (!currencyOptions || typeof currencyOptions !== 'object') {
      throw new Error('Supabase application setting "currency_options" is missing or invalid.');
    }
    if (!displayCurrency) throw new Error('Supabase application setting "display_currency" is missing.');
    if (!defaultLanguage) throw new Error('Supabase application setting "default_language" is missing.');
    if (!websiteName || typeof websiteName !== 'string' || !websiteName.trim()) throw new Error('Supabase application setting "website_name" is missing.');
    if (!contactPhone) throw new Error('Supabase application setting "contact_phone" is missing.');

    return {
      display_currency: String(displayCurrency).toUpperCase(),
      currency_options: currencyOptions,
      default_language: String(defaultLanguage).toLowerCase(),
      website_name: String(websiteName).trim(),
      contact_phone: String(contactPhone).trim(),
      header_image: requireImage(raw.header_image || raw.headerImage, 'header_image'),
      banner_image: requireImage(raw.banner_image || raw.bannerImage, 'banner_image'),
      favicon_image: optionalImage(raw.favicon_image || raw.faviconImage),
      who_we_are_image_1: optionalImage(raw.who_we_are_image_1),
      who_we_are_image_2: optionalImage(raw.who_we_are_image_2),
      who_we_are_image_3: optionalImage(raw.who_we_are_image_3),
      homepage_hero_image: optionalImage(raw.homepage_hero_image),
      services_section_image: optionalImage(raw.services_section_image),
      contact_section_image: optionalImage(raw.contact_section_image)
    };
  }

  async function loadFromSupabase() {
    if (!window.salonSupabase) throw new Error('Supabase client is not available.');
    var result = await window.salonSupabase
      .from('application_settings')
      .select('setting_key, setting_value')
      .eq('active', true);
    if (result.error) throw result.error;

    var settings = {};
    (result.data || []).forEach(function (row) {
      settings[row.setting_key] = parseValue(row.setting_value);
    });
    var normalized = normalizeSettings(settings);
    normalized.__social = {};
    (result.data || []).forEach(function(row){
      if (String(row.setting_key || '').indexOf('social_') === 0) {
        normalized.__social[row.setting_key] = {setting_value: parseValue(row.setting_value), active: row.active !== false};
      }
    });
    return normalized;
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clearBranding() {
    document.querySelectorAll('.brand-desktop img, .rd-navbar-brand img').forEach(function (img) {
      img.removeAttribute('src');
      img.hidden = true;
    });
    document.querySelectorAll('.page-title').forEach(function (banner) {
      banner.style.backgroundImage = 'none';
    });
    var oldFavicon = document.querySelector('link[data-supabase-favicon]');
    if (oldFavicon) oldFavicon.remove();
  }

  function applySocialLinks(settings) {
    var social = {};
    Object.keys(settings || {}).forEach(function(key) {
      if (key.indexOf('social_') !== 0) return;
      var slug = key.slice(7);
      if (['whatsapp','facebook','instagram'].indexOf(slug) === -1) return;
      var row = settings[key];
      if (!row || row.active === false) return;
      var value = parseValue(row.setting_value);
      if (!value || !String(value.url || '').trim()) {
        console.warn('[Application settings] ' + slug + ' is active but has no public URL; the channel will remain hidden.');
        return;
      }
      social[slug] = {url:String(value.url).trim()};
    });
    document.querySelectorAll('.site-social-link[data-social]').forEach(function(link) {
      var slug = link.getAttribute('data-social');
      var item = social[slug];
      var visible = !!item;
      var li = link.closest('li');
      if (li) {
        li.hidden = !visible;
        li.style.display = visible ? '' : 'none';
        li.classList.toggle('site-social-hidden', !visible);
      }
      link.hidden = !visible;
      link.style.display = visible ? '' : 'none';
      link.classList.toggle('site-social-hidden', !visible);
      if (!visible) {
        link.removeAttribute('href');
        link.removeAttribute('target');
        link.removeAttribute('rel');
        return;
      }
      link.href = String(item.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  function optionalWebsiteImage(settings, key) {
    var value = settings && settings[key];
    if (!value || typeof value !== 'object' || !value.url) return null;
    return {
      url: String(value.url),
      width: String(value.width || 'auto'),
      height: String(value.height || 'auto')
    };
  }

  function applyWebsiteImages(settings) {
    var imageKeys = ['who_we_are_image_1','who_we_are_image_2','who_we_are_image_3'];
    imageKeys.forEach(function(key, index){
      var image = optionalWebsiteImage(settings, key);
      document.querySelectorAll('[data-site-image="who-we-are-' + (index + 1) + '"]').forEach(function(img){
        if (!image) {
          img.removeAttribute('src');
          img.hidden = true;
          return;
        }
        img.src = image.url;
        if (image.width !== 'auto') img.style.width = image.width;
        if (image.height !== 'auto') img.style.height = image.height;
        img.hidden = false;
      });
    });

    var hero = optionalWebsiteImage(settings, 'homepage_hero_image');
    document.querySelectorAll('[data-site-background="homepage-hero"]').forEach(function(el){
      el.style.backgroundImage = hero ? 'url("' + hero.url.replace(/"/g, '\\"') + '")' : 'none';
    });

    var services = optionalWebsiteImage(settings, 'services_section_image');
    document.querySelectorAll('[data-site-background="services-section"]').forEach(function(el){
      el.style.backgroundImage = services ? 'url("' + services.url.replace(/"/g, '\\"') + '")' : 'none';
    });

    var contact = optionalWebsiteImage(settings, 'contact_section_image');
    document.querySelectorAll('[data-site-background="contact-section"]').forEach(function(el){
      el.style.backgroundImage = contact ? 'url("' + contact.url.replace(/"/g, '\\"') + '")' : 'none';
    });
  }

  function applyBranding(settings) {
    document.title = settings.website_name;
    var favicon = settings.favicon_image;
    var oldFavicon = document.querySelector('link[data-supabase-favicon]');
    if (oldFavicon) oldFavicon.remove();
    if (favicon && favicon.url) {
      var link = document.createElement('link');
      link.rel = 'icon';
      link.href = favicon.url;
      link.dataset.supabaseFavicon = 'true';
      document.head.appendChild(link);
    }
    document.querySelectorAll('[data-website-name]').forEach(function (el) {
      el.textContent = settings.website_name;
      el.setAttribute('aria-label', settings.website_name);
    });

    // Keep SEO/social metadata in sync with the CRM website name. The SEO
    // fragment is injected dynamically by site-loader.js, so this is safe to
    // run whenever branding is applied or re-applied.
    var websiteName = settings.website_name;
    var titleSuffix = ' – Luxury Hair & Beauty Salon';
    document.querySelectorAll('meta[data-website-meta="description"]').forEach(function (meta) {
      meta.setAttribute('content', websiteName + ' – Professional hair, beauty, styling and salon services.');
    });
    document.querySelectorAll('meta[data-website-meta="keywords"]').forEach(function (meta) {
      var content = meta.getAttribute('content') || '';
      var keywordList = content.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
      if (keywordList.map(function (item) { return item.toLowerCase(); }).indexOf(websiteName.toLowerCase()) === -1) {
        keywordList.splice(2, 0, websiteName);
      }
      meta.setAttribute('content', keywordList.join(', '));
    });
    document.querySelectorAll('meta[data-website-meta="og-title"]').forEach(function (meta) {
      meta.setAttribute('content', websiteName + titleSuffix);
    });
    document.querySelectorAll('meta[data-website-meta="og-description"]').forEach(function (meta) {
      meta.setAttribute('content', websiteName + ' offers professional hair, beauty, styling and salon services.');
    });
    document.querySelectorAll('meta[data-website-meta="og-site-name"]').forEach(function (meta) {
      meta.setAttribute('content', websiteName);
    });
    document.querySelectorAll('meta[data-website-meta="item-name"]').forEach(function (meta) {
      meta.setAttribute('content', websiteName + ' – Hair & Beauty Salon');
    });
    var header = settings.header_image;
    var bannerImage = settings.banner_image;

    document.querySelectorAll('.brand-desktop img, .rd-navbar-brand img').forEach(function (img) {
      img.src = header.url;
      img.width = parseInt(header.width, 10) || 0;
      img.height = parseInt(header.height, 10) || 0;
      img.style.width = header.width;
      img.style.height = header.height;
      img.style.objectFit = 'contain';
      img.hidden = false;
    });

    document.querySelectorAll('.page-title').forEach(function (banner) {
      banner.style.backgroundImage = 'url("' + bannerImage.url.replace(/"/g, '\\"') + '")';
      banner.style.width = bannerImage.width;
      banner.style.minHeight = bannerImage.height;
    });
  }

  window.applyApplicationBranding = applyBranding;
  window.applyWebsiteImages = applyWebsiteImages;
  window.applySocialLinks = applySocialLinks;

  window.applicationSettingsReady = (async function () {
    clearBranding();
    try {
      var settings = await loadFromSupabase();
      applyBranding(settings);
      applyWebsiteImages(settings);
      applySocialLinks(settings.__social || {});
      document.dispatchEvent(new CustomEvent('applicationSettingsLoaded', { detail: settings }));
      console.info('[Application settings] Loaded from Supabase.', settings.website_name, settings.header_image.url, settings.banner_image.url);
      return settings;
    } catch (error) {
      clearBranding();
      document.dispatchEvent(new CustomEvent('applicationSettingsError', { detail: error }));
      console.error('[Application settings] Supabase branding load failed. No local image fallback is used.', error);
      throw error;
    }
  })();

  window.getApplicationSettings = function () {
    return window.applicationSettingsReady;
  };
})();
