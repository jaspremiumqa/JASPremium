(function () {
  const currentPage = window.location.pathname.split("/").pop() || 'index.html';

  // Booking selections are transient. Never leave service/voucher/date/time
  // selections behind in localStorage when the visitor leaves the booking flow.
  const BOOKING_LOCAL_KEYS = [
    'salonBookingDraft',
    'bookingServiceSku',
    'bookingVoucher',
    'service',
    'selectedDates'
  ];

  function clearBookingStorage() {
    BOOKING_LOCAL_KEYS.forEach(function (key) {
      try { localStorage.removeItem(key); } catch (e) {}
    });
    try { sessionStorage.removeItem('bookingHandoff'); } catch (e) {}
  }

  // The booking page owns its state. Any other page is a clean entry point.
  if (currentPage !== 'booking.html') {
    clearBookingStorage();
  }


  async function loadVouchers() {
    const container = document.getElementById('vouchers-grid');
    if (!container) return;

    try {
        if (!window.salonDatabase || typeof window.salonDatabase.getVouchers !== 'function') {
            throw new Error('Supabase voucher catalogue is not available.');
        }

        const rows = await window.salonDatabase.getVouchers();

        container.innerHTML = rows.map(v => {
            const titleEn = v.title_en || v.title || 'Voucher';
            const titleAr = v.title_ar || titleEn;
            const image = window.salonDatabase.getVoucherImageUrl(v.image_path || v.image || '');
            const payload = JSON.stringify({
                id: v.id,
                sku: v.sku || ('V-' + String(v.id).padStart(3, '0')),
                title: titleEn,
                titleEn: titleEn,
                titleAr: titleAr,
                image: image,
                durationMinutes: Number(v.duration_minutes || 30),
                price: v.price_usd == null || v.price_usd === '' ? null : Number(v.price_usd),
                priceQar: v.price_qar == null || v.price_qar === '' ? null : Number(v.price_qar),
                active: v.active !== false
            }).replace(/"/g, '&quot;');

            return `
                <a href="booking.html"
                   class="voucher-card"
                   data-voucher='${payload}'
                   aria-label="Book ${String(titleEn).replace(/"/g, '&quot;')}">
                    ${image ? `<img src="${image}" alt="${String(titleEn).replace(/"/g, '&quot;')}">` : '<div class="voucher-card-placeholder">Voucher</div>'}
                </a>`;
        }).join('');

        container.querySelectorAll('[data-voucher]').forEach(card => {
            card.addEventListener('click', function () {
                try {
                    const voucher = JSON.parse(card.getAttribute('data-voucher'));
                    // Pass the voucher only for this navigation. It is not
                    // persisted in localStorage.
                    sessionStorage.setItem('bookingHandoff', JSON.stringify({
                        type: 'voucher',
                        voucher: voucher
                    }));
                } catch (e) {
                    console.error('Could not prepare voucher booking:', e);
                }
            });
        });
    } catch (err) {
        console.error('[Vouchers] Could not load vouchers from Supabase:', err);
        container.innerHTML = '';
    }
}

  fetch("seo-head.html")
    .then(response => response.text())
    .then(data => {
      var temp = document.createElement('div');
      temp.innerHTML = data;
      Array.from(temp.childNodes).forEach(function (node) {
        document.head.appendChild(node.cloneNode(true));
      });
      if (window.getApplicationSettings && window.applyApplicationBranding) {
        window.getApplicationSettings().then(function (settings) {
          window.applyApplicationBranding(settings);
        }).catch(function () {});
      }
    })
    .catch(error => console.error("Error loading seo head:", error));

  fetch("site-footer.html")
    .then(response => response.text())
    .then(data => {
      document.getElementById("footer-placeholder").innerHTML = data;
      if (window.getApplicationSettings && window.applySocialLinks) {
        window.getApplicationSettings().then(function(settings){
          // The footer fragment is inserted after application-settings.js has
          // already run once. Re-apply branding now so the CRM-managed footer
          // logo is populated into the newly inserted DOM.
          if (window.applyApplicationBranding) window.applyApplicationBranding(settings);
          if (window.applyWebsiteImages) window.applyWebsiteImages(settings);
          if (window.applyLandscapeImages) window.applyLandscapeImages(settings);
          window.applySocialLinks(settings.__social || {});
        }).catch(function(){});
      }
    })
    .catch(error => console.error("Error loading footer:", error));

  if (currentPage !== "index.html") {

    // ✅ header first, then navbar
    fetch("site-header.html")
      .then(response => response.text())
      .then(data => {
        document.getElementById("page-header").innerHTML = data;

        // application-settings.js loads before site-loader.js. Re-apply the
        // branding after dynamic header injection so any future header image
        // setting is reflected immediately on every non-homepage page.
        if (window.getApplicationSettings && window.applyApplicationBranding) {
          window.getApplicationSettings().then(function (settings) {
            window.applyApplicationBranding(settings);
          }).catch(function () {});
        }

        return fetch("site-navigation.html");
      })
      .then(response => response.text())
      .then(data => {
        document.getElementById("rdNavBar").innerHTML = data;
        if (window.getApplicationSettings && window.applySocialLinks) {
          window.getApplicationSettings().then(function(settings){
            if (window.applyApplicationBranding) window.applyApplicationBranding(settings);
            if (window.applyWebsiteImages) window.applyWebsiteImages(settings);
            window.applySocialLinks(settings.__social || {});
          }).catch(function(){});
        }

        // Set active nav link
        document.querySelectorAll('#rdNavBar .rd-navbar-nav a').forEach(function (link) {
          link.parentElement.classList.remove('active');
          if (link.getAttribute('href') === currentPage) {
            link.parentElement.classList.add('active');
          }
        });

        // Reinitialize RD Navbar plugin
        var $nav = $('.rd-navbar');
        if ($nav.length && typeof $nav.RDNavbar === 'function') {
          $nav.RDNavbar();
        }

        // Reinit perspective menu
        var nav = $('.rd-navbar-wrap');
        var perspective = $('#perspective');

        if (perspectiveMenu.length) {
          $('#perspective-open-menu').on('click', function () {
            nav.addClass('active');
            perspective.addClass('active modalView');
          });
          $('#perspective-content-overlay').on('click', function () {
            nav.removeClass('active');
            perspective.removeClass('active');
            setTimeout(function () {
              perspective.removeClass('modalView');
            }, 400);
          });
        }

        // ✅ Notify language.js only after both are done
        document.dispatchEvent(new CustomEvent('navbarLoaded'));
      })
      .catch(error => console.error("Error loading header/navbar:", error));
  }

  if (currentPage === "index.html" || currentPage === "vouchers.html") {
    loadVouchers();
  }
})();

