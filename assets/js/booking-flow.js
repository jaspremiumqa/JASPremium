(function(){
  'use strict';

  const state = {
    services: [],
    categories: [],
    bookings: [],
    schedule: null,
    selected: [],
    voucher: null,
    date: null,
    start: null,
    step: 1,
    config: null,
    initialized: false,
    viewYear: null,
    viewMonth: null,
    lang: document.documentElement.getAttribute('lang') || localStorage.getItem('siteLang') || 'en',
    currency: 'USD'
  };

  const $ = id => document.getElementById(id);
  const t = (en, ar) => state.lang === 'ar' ? ar : en;

  const BOOKING_LOCAL_KEYS = [
    'salonBookingDraft',
    'bookingServiceSku',
    'bookingVoucher',
    'service',
    'selectedDates'
  ];

  function clearBookingLocalStorage(){
    BOOKING_LOCAL_KEYS.forEach(function(key){
      try { localStorage.removeItem(key); } catch(e) {}
    });
  }

  function readBookingHandoff(){
    try{
      const raw=sessionStorage.getItem('bookingHandoff');
      sessionStorage.removeItem('bookingHandoff');
      return raw ? JSON.parse(raw) : null;
    }catch(e){
      try { sessionStorage.removeItem('bookingHandoff'); } catch(ignore){}
      return null;
    }
  }

  function money(value){
    if (value === null || value === undefined || value === '') return '—';
    const symbol = (state.config && state.config.currencyOptions && state.config.currencyOptions[state.currency])
      ? state.config.currencyOptions[state.currency][state.lang] : (state.currency === 'QAR' ? (state.lang==='ar'?'ريال':'QAR') : '$');
    return state.lang === 'ar' ? `${value} ${symbol}` : `${value} ${symbol}`;
  }

  function price(service){
    if(service.prices && service.prices[state.currency] != null) return Number(service.prices[state.currency]);
    if(service.price != null) return Number(service.price);
    return null;
  }

  function duration(service){
    const value = Number(service && service.durationMinutes);
    return Number.isFinite(value) && value > 0 ? value : 30;
  }

  function durationLabel(service){
    const value = duration(service);
    return value == null ? '—' : `${value} ${t('min','دقيقة')}`;
  }

  async function loadBookingConfiguration(){
    if(!window.salonDatabase || !window.salonDatabase.getBookingConfiguration){
      throw new Error('Supabase booking configuration is not available.');
    }

    const fallback = {
      settings: {
        slot_minutes: 30,
        opening_time: '09:00',
        closing_time: '18:00',
        weekday_slot_minutes: 30,
        weekday_opening_time: '09:00',
        weekday_closing_time: '18:00',
        weekend_slot_minutes: 30,
        weekend_opening_time: '10:00',
        weekend_closing_time: '16:00',
        advance_months: 3,
      },
      schedule: []
    };

    let result;
    try {
      result = await window.salonDatabase.getBookingConfiguration();
    } catch (error) {
      console.warn('[Booking] Supabase booking configuration unavailable; using built-in defaults.', error);
      result = fallback;
    }

    const settings = result && result.settings ? result.settings : fallback.settings;

    const weekday = {
      slotMinutes: Number(settings.weekday_slot_minutes || settings.slot_minutes || 30),
      opening: String(settings.weekday_opening_time || settings.opening_time || '09:00').slice(0,5),
      closing: String(settings.weekday_closing_time || settings.closing_time || '18:00').slice(0,5)
    };

    const weekend = {
      slotMinutes: Number(settings.weekend_slot_minutes || 30),
      opening: String(settings.weekend_opening_time || '10:00').slice(0,5),
      closing: String(settings.weekend_closing_time || '16:00').slice(0,5)
    };

    function buildSlots(schedule){
      const slots = [];
      const step = Math.max(1, Number(schedule.slotMinutes || 30));
      const opening = toMin(schedule.opening);
      const closing = toMin(schedule.closing);

      for(let cursor = opening; cursor < closing; cursor += step){
        slots.push(minutesToTime(cursor));
      }
      return slots;
    }

    return {
      config: {
        months: {
          en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
          ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
        },
        days: {
          en: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
          ar: ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت']
        },
        weekdaySchedule: {
          slotMinutes: weekday.slotMinutes,
          opening: weekday.opening,
          closing: weekday.closing,
          timeSlots: buildSlots(weekday)
        },
        weekendSchedule: {
          slotMinutes: weekend.slotMinutes,
          opening: weekend.opening,
          closing: weekend.closing,
          timeSlots: buildSlots(weekend)
        },
        // Legacy properties retained for any code that still reads them.
        timeSlots: buildSlots(weekday),
        slotMinutes: weekday.slotMinutes,
        advanceMonths: Number(settings.advance_months || 3),
      },
      scheduleRules: Array.isArray(result && result.schedule) ? result.schedule : []
    };
  }

  function getScheduleForDate(iso){
    const fallback = {
      slotMinutes: 30,
      opening: '09:00',
      closing: '18:00',
      timeSlots: []
    };
    if(!iso || !state.config) return fallback;

    // JavaScript: Sunday = 0, Saturday = 6.
    const day = new Date(`${iso}T12:00:00`).getDay();
    return (day === 0 || day === 6)
      ? (state.config.weekendSchedule || fallback)
      : (state.config.weekdaySchedule || fallback);
  }

  function getTimeSlotsForDate(iso){
    return getScheduleForDate(iso).timeSlots || [];
  }

  async function loadBookingSlots(){
    const data = await loadDatabaseBookingSlots();
    return {
      source: 'supabase',
      data: Array.isArray(data) ? data : []
    };
  }

  async function loadDatabaseBookingSlots(){
    if(!window.salonSupabase || !window.salonSupabase.rpc) return null;

    const from = new Date();
    from.setHours(0,0,0,0);
    const to = new Date(from);
    to.setDate(to.getDate()+370);

    const result = await window.salonSupabase.rpc('get_booked_slots',{
      p_from: isoDate(from),
      p_to: isoDate(to)
    });

    if(result.error) throw result.error;

    // Only CONFIRMED bookings block public availability. Pending requests are
    // intentionally ignored so an abandoned/unconfirmed request never locks
    // a slot for other customers.
    const grouped={};
    (result.data||[]).forEach(row=>{
      if(String(row.status || '').toLowerCase() !== 'confirmed') return;
      const id=String(row.booking_id);
      if(!grouped[id]) grouped[id]={
        id,
        date:row.booking_date,
        status:'confirmed',
        items:[]
      };
      grouped[id].items.push({
        serviceSku:row.service_sku || '',
        start:String(row.start_time).slice(0,5),
        end:String(row.end_time).slice(0,5)
      });
    });

    return Object.values(grouped);
  }

  async function createDatabaseBooking({id,date,status,customer,items,total,currency}){
    if(!window.salonSupabase || !window.salonSupabase.rpc){
      throw new Error('Supabase booking service is not available.');
    }
    const result=await window.salonSupabase.rpc('create_public_booking',{
      p_id:id,
      p_booking_date:date,
      p_status:status,
      p_customer_name:customer.name,
      p_customer_phone:customer.phone,
      p_customer_email:customer.email || null,
      p_customer_notes:customer.notes || null,
      p_items:items,
      p_total:Number(total||0),
      p_currency:currency
    });
    if(result.error) throw result.error;
    return result.data;
  }

  function convertSupabaseServices(categories, services){
    return {
      displayCurrency: 'USD',
      categories: (categories || []).map(category => ({
        id: category.id,
        'name-en': category.name_en,
        'name-ar': category.name_ar,
        src: category.image_url || '',
        width: category.image_width || 70,
        height: category.image_height || 62,
        sortOrder: category.sort_order || 0,
        active: category.active !== false,
        services: (services || [])
          .filter(service =>
            service.category_id === category.id &&
            service.active !== false
          )
          .map(service => ({
            id: service.id,
            sku: service.sku,
            'name-en': service.name_en,
            'name-ar': service.name_ar,
            'description-en': service.description_en || '',
            'description-ar': service.description_ar || '',
            prices: {
              USD: service.price_usd,
              QAR: service.price_qar
            },
            durationMinutes: Number(service.duration_minutes || 30),
            active: service.active !== false,
            sortOrder: service.sort_order || 0
          }))
          .sort((a,b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
      }))
      .filter(category => category.active)
      .sort((a,b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    };
  }

  function normalizeJSONServices(raw){
    raw = raw || {};

    return {
      categories: (raw.categories || [])
        .filter(category => category.active !== false)
        .sort((a,b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
        .map(category => ({
          sku: category.sku,
          'name-en': category['name-en'] || '',
          'name-ar': category['name-ar'] || '',
          src: category.src || '',
          width: category.width || 70,
          height: category.height || 62,
          sortOrder: category.sortOrder || 0,
          active: category.active !== false,
          services: (category.services || [])
            .filter(service => service.active !== false)
            .sort((a,b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
            .map(service => ({
              sku: service.sku,
              'name-en': service['name-en'] || '',
              'name-ar': service['name-ar'] || '',
              'description-en': service['description-en'] || '',
              'description-ar': service['description-ar'] || '',
              prices: service.prices || {},
              // Keep the same 30-minute default used by Supabase data.
              durationMinutes: Number(service.durationMinutes || 30),
              active: service.active !== false,
              sortOrder: service.sortOrder || 0
            }))
        }))
    };
  }

  async function loadServicesFromSupabase(){
    if(!window.salonSupabase){
      throw new Error('Supabase client is not available.');
    }

    const categoryResult = await window.salonSupabase
      .from('service_categories')
      .select('*')
      .eq('active', true)
      .order('sort_order', {ascending:true});

    if(categoryResult.error) throw categoryResult.error;

    const serviceResult = await window.salonSupabase
      .from('services')
      .select('*')
      .eq('active', true)
      .order('sort_order', {ascending:true});

    if(serviceResult.error) throw serviceResult.error;

    return convertSupabaseServices(
      categoryResult.data,
      serviceResult.data
    );
  }

  async function loadSalonServices(){
    try {
      const services = await loadServicesFromSupabase();
      console.info('[Booking] Loaded services from Supabase:', 
        services.categories.reduce((total, category) => total + (category.services || []).length, 0)
      );
      return { source: 'supabase', data: services };
    } catch (databaseError) {
      console.error(
        '[Booking] Supabase service catalogue unavailable.',
        databaseError
      );
      throw databaseError;
    }
  }

  async function loadVouchersFromSupabase(){
    if(!window.salonSupabase){
      console.warn('[Booking] Supabase voucher catalogue is not available.');
      return [];
    }

    const result=await window.salonSupabase
      .from('vouchers')
      .select('*')
      .eq('active', true)
      .order('sort_order', {ascending:true})
      .order('created_at', {ascending:false});

    if(result.error) throw result.error;

    return (result.data || []).map(v => ({
      id:v.id,
      sku:v.sku || ('V-'+String(v.id).padStart(3,'0')),
      title:v.title_en || v.title || 'Voucher',
      titleEn:v.title_en || v.title || 'Voucher',
      titleAr:v.title_ar || v.title_en || v.title || 'Voucher',
      image:v.image_path && window.salonDatabase && window.salonDatabase.getVoucherImageUrl
        ? window.salonDatabase.getVoucherImageUrl(v.image_path)
        : '',
      durationMinutes:Number(v.duration_minutes || 30),
      price:v.price_usd == null ? null : Number(v.price_usd),
      priceQar:v.price_qar == null ? null : Number(v.price_qar),
      active:v.active !== false
    }));
  }

  async function init(){
    try{
      // A booking is intentionally session-only. Clear any legacy/stale
      // localStorage values before building the new booking state.
      const handoff = readBookingHandoff();
      clearBookingLocalStorage();
      await loadTranslations();

      const [serviceResult, bookingConfig, vouchers, appSettings] = await Promise.all([
        loadSalonServices(),
        loadBookingConfiguration(),
        loadVouchersFromSupabase().catch(e => {
          console.warn('[Booking] Could not load vouchers from Supabase; using the selected voucher payload if available.', e);
          return [];
        }),
        window.getApplicationSettings ? window.getApplicationSettings() : Promise.resolve(null)
      ]);
      let bookingResult;
      try {
        bookingResult = await loadBookingSlots();
      } catch(bookingError) {
        console.warn(
          '[Booking] Could not load booking slots from Supabase; starting with no remote bookings.',
          bookingError
        );
        bookingResult = { source: 'none', data: [] };
      }

      const services = serviceResult.data || { categories: [] };

      const config = bookingConfig.config;
      state.config=Object.assign({}, config, {
        currencyOptions: (appSettings && appSettings.currency_options) || {},
        displayCurrency: (appSettings && appSettings.display_currency) || 'USD'
      });
      state.currency=(appSettings && appSettings.display_currency) || 'USD';
      state.scheduleRules=bookingConfig.scheduleRules || [];
      state.categories=services.categories || [];
      state.services=state.categories.flatMap(c => (c.services||[]).filter(s=>s.active).map(s=>({...s,category:c})));

      // Supabase is the source of truth for services.
      // A missing/invalid service duration defaults to 30 minutes.
      console.info('[Booking] Service source:', serviceResult.source, '-', state.services.length, 'services');

      // A voucher is represented as a normal booking item so the existing
      // date/time, availability, review, local-booking and Formspree logic
      // can be reused without creating a second booking flow.
      let pendingVoucher=null;
      if(handoff && handoff.type === 'voucher' && handoff.voucher){
        try {
          const parsed=handoff.voucher;
          const source=(Array.isArray(vouchers)?vouchers:[]).find(v =>
            String(v.id)===String(parsed.id) ||
            String(v.sku||'')===String(parsed.sku||'')
          ) || parsed;
          if(source && source.active !== false){
            pendingVoucher={
              id:source.id,
              sku:source.sku || ('V-'+String(source.id).padStart(3,'0')),
              'name-en':source.titleEn || source.title || 'Voucher',
              'name-ar':source.titleAr || source.titleEn || source.title || 'Voucher',
              'description-en':'Voucher',
              'description-ar':'قسيمة',
              prices:{
                USD: source.price == null ? null : Number(source.price),
                QAR: source.priceQar == null ? null : Number(source.priceQar)
              },
              durationMinutes:Number(source.durationMinutes || 30),
              image:source.image || '',
              active:true,
              isVoucher:true,
              voucherId:source.id,
              category:{id:'voucher', 'name-en':'Voucher', 'name-ar':'قسيمة'}
            };
          }
        } catch(e) {
          console.warn('Could not read booking voucher handoff:',e);
        }
      }

      state.selected=state.selected.filter(sku=>state.services.some(s=>s.sku===sku && duration(s)!=null));
      state.bookings=bookingResult.data || [];

      console.info(
        '[Booking] Booking availability source:',
        bookingResult.source,
        '-',
        state.bookings.length,
        'bookings'
      );

      if(pendingVoucher){
        // Voucher bookings are standalone: exactly one voucher can be active.
        state.voucher=pendingVoucher;
        state.services.push(pendingVoucher);
        state.selected=[pendingVoucher.sku];
        state.date=null;
        state.start=null;
      } else if(handoff && handoff.type === 'service'){
        const found=state.services.find(s =>
          (handoff.serviceSku && s.sku===handoff.serviceSku) ||
          (handoff.serviceName && (s['name-en']===handoff.serviceName || s['name-ar']===handoff.serviceName))
        );
        if(found && duration(found)!=null){
          state.selected=[found.sku];
          state.date=null;
          state.start=null;
        }
      }

      const initialView = state.date ? new Date(state.date+'T12:00:00') : new Date();
      setViewMonth(initialView.getFullYear(), initialView.getMonth());
      state.initialized=true;
      render();
      showStep(state.voucher ? 2 : 1);
      document.body.classList.add('booking-ready');
    }catch(e){
      console.error(e);
      $('booking-app').innerHTML='<div class="booking-error">Unable to load booking information. Please try again.</div>';
    }
  }

  function saveDraft(){
    // Booking state lives in memory while booking.html is open.
    // Deliberately do not persist service/date/time selections in localStorage.
  }

  function getService(sku){ return state.services.find(s=>s.sku===sku); }
  function selectedServices(){ return state.selected.map(getService).filter(Boolean); }
  function total(){ return selectedServices().reduce((a,s)=>a+(price(s)||0),0); }
  function totalMinutes(){
    return selectedServices().reduce((a,s)=>{
      const value=duration(s);
      return a+(value == null ? 0 : value);
    },0);
  }

  function hasValidSelectedDurations(){
    return selectedServices().every(s=>duration(s) != null);
  }

  function render(){
    renderServices();
    renderCalendar();
    renderTimeSlots();
    renderSummaries();
    bindEvents();
    applyTranslations();
  }

  function renderServices(){
    const wrap=$('booking-service-categories'); if(!wrap) return;
    wrap.innerHTML='';

    if(state.voucher){
      const s=state.voucher;
      const section=document.createElement('section');
      section.className='booking-category booking-voucher-category';
      section.innerHTML=`<div class="booking-category-head"><div><span class="category-kicker">${esc(t('VOUCHER','قسيمة'))}</span><h2>${esc(s['name-'+state.lang]||s['name-en'])}</h2></div><span class="category-count">1</span></div>`;
      const grid=document.createElement('div'); grid.className='booking-service-grid';
      const card=document.createElement('button');
      card.type='button';
      card.className='booking-service-card is-selected';
      card.setAttribute('aria-pressed','true');
      card.innerHTML=`<span class="service-check">✓</span><span class="service-card-content"><strong>${esc(s['name-'+state.lang]||s['name-en'])}</strong><small>${durationLabel(s)}</small></span><span class="service-price">${price(s)==null ? t('Voucher','قسيمة') : money(price(s))}</span>`;
      card.onclick=()=>{ state.selected=[s.sku]; state.date=null; state.start=null; saveDraft(); render(); showStep(2); };
      grid.appendChild(card);
      section.appendChild(grid);
      wrap.appendChild(section);
      return;
    }

    state.categories.filter(c=>c.active!==false).forEach(cat=>{
      const active=(cat.services||[]).filter(s=>s.active);
      if(!active.length) return;
      const section=document.createElement('section'); section.className='booking-category';
      section.innerHTML=`<div class="booking-category-head"><div><span class="category-kicker">${esc(cat['name-en']||'')}</span><h2>${esc(cat['name-'+state.lang]||cat['name-en'])}</h2></div><span class="category-count">${active.length}</span></div>`;
      const grid=document.createElement('div'); grid.className='booking-service-grid';
      active.forEach(s=>{
        const selected=state.selected.includes(s.sku);
        const hasDuration=duration(s) != null;
        const card=document.createElement('button');
        card.type='button';
        card.className='booking-service-card '+(selected?'is-selected':'');
        card.disabled=!hasDuration;
        card.setAttribute('aria-pressed',selected);
        if(!hasDuration) card.setAttribute('title',t('Duration is not configured for this service.','مدة هذه الخدمة غير محددة.'));
        card.innerHTML=`<span class="service-check">${selected?'✓':'+'}</span><span class="service-card-content"><strong>${esc(s['name-'+state.lang]||s['name-en'])}</strong><small>${durationLabel(s)}</small></span><span class="service-price">${money(price(s))}</span>`;
        card.onclick=()=>toggleService(s.sku);
        grid.appendChild(card);
      });
      section.appendChild(grid); wrap.appendChild(section);
    });
  }

  function toggleService(sku){
    if(state.voucher) return;
    const service=getService(sku);
    if(!service || duration(service)==null) return;
    if(state.selected.includes(sku)) state.selected=state.selected.filter(x=>x!==sku);
    else state.selected.push(sku);
    state.date=null; state.start=null; saveDraft(); render();
    showStep(1);
  }

  function setViewMonth(year, month){
    state.viewYear = year;
    state.viewMonth = month;
  }

  function getViewDate(){
    if(Number.isInteger(state.viewYear) && Number.isInteger(state.viewMonth)){
      return new Date(state.viewYear, state.viewMonth, 1);
    }
    if(state.date) return new Date(state.date+'T12:00:00');
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }

  function renderCalendar(){
    const wrap=$('booking-calendar'); if(!wrap || !state.config) return;
    const today=new Date(); today.setHours(0,0,0,0);
    const view=getViewDate();
    renderCalendarView(view);
  }

  function localDateTime(iso, time){
    return new Date(`${iso}T${String(time || '00:00').slice(0,5)}:00`);
  }

  function parseStoredBlackoutLocal(value){
    if(!value) return null;
    const raw=String(value).trim().replace(' ','T');
    const match=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/);
    if(!match) return null;
    const d=new Date(`${match[1]}T${match[2]}:${match[3] || '00'}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function blackoutOverlaps(iso, start, end){
    const from = localDateTime(iso, start);
    const to = localDateTime(iso, end);
    const blackouts = Array.isArray(state.scheduleRules) ? state.scheduleRules : [];

    return blackouts.some(rule => {
      if(!rule || !rule.starts_at || !rule.ends_at) return false;
      const blockedFrom = parseStoredBlackoutLocal(rule.starts_at);
      const blockedTo = parseStoredBlackoutLocal(rule.ends_at);
      if(!blockedFrom || !blockedTo || blockedTo <= blockedFrom) return false;
      return from < blockedTo && to > blockedFrom;
    });
  }

  function slotClosed(iso,start){
    const end=minutesToTime(toMin(start)+totalMinutes());
    return blackoutOverlaps(iso,start,end);
  }

  function isBooked(iso, start, end){
    // IMPORTANT: only confirmed bookings reserve a slot.
    return state.bookings.some(b=>{
      if(b.date!==iso || String(b.status || '').toLowerCase() !== 'confirmed') return false;
      return (b.items||[]).some(i=>overlap(start,end,i.start,i.end));
    });
  }

  function overlap(a,b,c,d){return toMin(a)<toMin(d)&&toMin(b)>toMin(c);}
  function toMin(x){const p=x.split(':').map(Number);return p[0]*60+p[1];}

  function validStart(iso,start){
    const schedule=getScheduleForDate(iso);
    if(slotClosed(iso,start)) return false;

    const end=minutesToTime(toMin(start)+totalMinutes());
    if(isBooked(iso,start,end)) return false;

    // The selected service must fit completely inside that day's
    // weekday/weekend opening window.
    if(toMin(start) < toMin(schedule.opening)) return false;
    if(toMin(end) > toMin(schedule.closing)) return false;

    // A start time must belong to the configured interval for this day.
    const slots=schedule.timeSlots || [];
    if(slots.indexOf(start) === -1) return false;

    return true;
  }

  function hasAnyAvailability(iso){
    if(!state.selected.length) return true;
    return getTimeSlotsForDate(iso).some(s=>validStart(iso,s));
  }

  function renderTimeSlots(){
    const wrap=$('booking-times'); if(!wrap || !state.config)return;
    wrap.innerHTML='';
    if(!state.date){wrap.innerHTML=`<div class="booking-empty">${t('Choose a date above to see available times.','اختاري التاريخ أعلاه لرؤية الأوقات المتاحة.')}</div>`;return;}
    const slots=getTimeSlotsForDate(state.date);
    const fragment=document.createDocumentFragment();
    slots.forEach(start=>{
      const end=minutesToTime(toMin(start)+totalMinutes());
      const b=document.createElement('button');b.type='button';b.className='time-slot';
      const available=validStart(state.date,start);
      b.disabled=!available;b.classList.toggle('is-selected',start===state.start);
      b.innerHTML=`<strong>${formatTime(start)}</strong><small>${available?formatTime(end):t('Unavailable','غير متاح')}</small>`;
      b.onclick=()=>{state.start=start;saveDraft();renderTimeSlots();renderSummaries();};
      fragment.appendChild(b);
    });
    wrap.appendChild(fragment);
    $('selected-date-label').textContent=formatDate(state.date);
  }

  function renderSummaries(){
    const count=$('selected-count'), totalEl=$('selected-total');
    if(count) count.textContent=`${state.selected.length} ${t(state.selected.length===1?'service':'services',state.selected.length===1?'خدمة':'خدمات')}`;
    if(totalEl) totalEl.textContent=money(total());

    // Keep navigation buttons in sync with the current booking state.
    // These buttons must NOT remain disabled from a static HTML attribute.
    const continueServices = $('continue-services');
    if (continueServices) {
      continueServices.disabled = state.selected.length === 0 || !hasValidSelectedDurations();
      continueServices.setAttribute('aria-disabled', String(continueServices.disabled));
    }

    const continueDate = $('continue-date');
    if (continueDate) {
      const dateReady = !!state.date && !!state.start && validStart(state.date, state.start);
      continueDate.disabled = !dateReady;
      continueDate.setAttribute('aria-disabled', String(continueDate.disabled));
    }

    const ds=$('date-service-summary');
    if(ds) ds.innerHTML=`<strong>${state.selected.length} ${t('services','خدمات')}</strong><span>${totalMinutes()} ${t('min','دقيقة')} · ${money(total())}</span>`;

    const selectedNames = selectedServices().map(s => esc(s['name-'+state.lang] || s['name-en'])).join(' · ');
    const dateNames = $('date-selected-services');
    if(dateNames) dateNames.innerHTML = selectedNames
      ? `<span>${t('Selected services','الخدمات المختارة')}</span><strong>${selectedNames}</strong>`
      : '';

    const detailsNames = $('details-selected-services');
    if(detailsNames) detailsNames.innerHTML = selectedNames
      ? `<span>${t('Selected services','الخدمات المختارة')}</span><strong>${selectedNames}</strong>`
      : '';

    const rs=$('review-services'), rt=$('review-timeline'), reviewTotal=$('review-total');
    if(rs){
      rs.innerHTML=selectedServices().map(s=>`<div class="review-service"><span>${esc(s['name-'+state.lang]||s['name-en'])}<small>${durationLabel(s)}</small></span><strong>${money(price(s))}</strong></div>`).join('');
    }
    if(reviewTotal) reviewTotal.textContent=money(total());

    if(rt){
      if(state.date && state.start){
        let cur=toMin(state.start);
        rt.innerHTML=selectedServices().map(s=>{
          const st=minutesToTime(cur),en=minutesToTime(cur+duration(s));
          cur+=duration(s);
          return `<div class="timeline-item"><span class="timeline-time">${formatTime(st)}<br><small>${formatTime(en)}</small></span><span class="timeline-dot"></span><span class="timeline-service"><strong>${esc(s['name-'+state.lang]||s['name-en'])}</strong><small>${durationLabel(s)}</small></span></div>`;
        }).join('');
      } else {
        rt.innerHTML=`<div class="booking-empty">${t('Select a date and time to see your appointment.','اختاري التاريخ والوقت لرؤية تفاصيل موعدك.')}</div>`;
      }
    }

    const final=$('final-summary');
    if(final){
      if(state.date && state.start){
        final.innerHTML=`<div><span>${formatDate(state.date)}</span><strong>${formatTime(state.start)} – ${formatTime(minutesToTime(toMin(state.start)+totalMinutes()))}</strong></div><div class="final-services-row"><span>${t('Services','الخدمات')}</span><strong>${selectedNames || state.selected.length}</strong></div><div class="final-total"><span>${t('Total','الإجمالي')}</span><strong>${money(total())}</strong></div>`;
      } else {
        final.innerHTML=`<div><span>${t('Appointment','الموعد')}</span><strong>${t('Choose a date and time','اختاري التاريخ والوقت')}</strong></div><div><span>${t('Services','الخدمات')}</span><strong>${state.selected.length}</strong></div><div class="final-total"><span>${t('Total','الإجمالي')}</span><strong>${money(total())}</strong></div>`;
      }
    }

    const success=$('success-summary');
    if(success && state.date && state.start){
      success.innerHTML=`<p><strong>${formatDate(state.date)}</strong></p><p>${formatTime(state.start)} – ${formatTime(minutesToTime(toMin(state.start)+totalMinutes()))}</p><p>${selectedServices().map(s=>esc(s['name-'+state.lang]||s['name-en'])).join(' · ')}</p><strong>${money(total())}</strong>`;
    }
  }

  function showStep(n){
    state.step=n;
    document.querySelectorAll('.booking-step').forEach(s=>s.classList.toggle('is-active',Number(s.dataset.step)===n));

    // Refresh navigation state whenever the user changes steps.
    const continueServices = $('continue-services');
    if (continueServices) {
      continueServices.disabled = state.selected.length === 0;
    }
    const continueDate = $('continue-date');
    if (continueDate) {
      continueDate.disabled = !(state.date && state.start && validStart(state.date, state.start));
    }
    document.querySelectorAll('.booking-progress span').forEach((s,i)=>{
      s.classList.toggle('is-active',i<n);
      s.classList.toggle('is-done',i<n-1);
    });

    document.querySelectorAll('.booking-flow-step').forEach((el)=>{
      const stepNo = Number(el.getAttribute('data-flow-step'));
      el.classList.toggle('is-current', stepNo === Math.min(n,4));
      el.classList.toggle('is-done', stepNo < n && n < 5);
    });
    document.querySelectorAll('.booking-flow-indicator > i').forEach((el,i)=>{
      el.classList.toggle('is-done', i < Math.max(0, Math.min(n,4)-1));
    });

    const label=$('booking-step-label');
    if(label) label.textContent=n<5?t(`Step ${n} of 4`,`الخطوة ${n} من 4`):t('Complete','تم');
    if(n===2){ renderCalendar(); renderTimeSlots(); }
    if(n===3 || n===4) renderSummaries();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function setClick(id, handler){
    const el=$(id);
    if(el) el.onclick=handler;
  }

  function bindEvents(){
    setClick('continue-services',()=>{ if(state.selected.length) showStep(2); });
    setClick('back-to-services',()=>showStep(1));
    setClick('continue-date',()=>{ if(state.date&&state.start) showStep(3); });
    setClick('back-to-date',()=>showStep(2));
    setClick('continue-review',()=>showStep(4));
    setClick('edit-date',()=>showStep(2));
    setClick('edit-services',()=>showStep(1));
    setClick('prev-month',()=>changeMonth(-1));
    setClick('next-month',()=>changeMonth(1));
    const form=$('booking-form');
    if(form) form.onsubmit=submitBooking;
  }

  function changeMonth(delta){
    if(!state.config) return;
    const current=getViewDate();
    const ref=new Date(current.getFullYear(),current.getMonth()+delta,1);
    const today=new Date(); today.setHours(0,0,0,0);
    const minMonth=new Date(today.getFullYear(),today.getMonth(),1);
    const maxMonths=Math.max(0,Number(state.config.advanceMonths||3)-1);
    const maxMonth=new Date(minMonth.getFullYear(),minMonth.getMonth()+maxMonths,1);

    if(ref<minMonth || ref>maxMonth) return;
    setViewMonth(ref.getFullYear(),ref.getMonth());
    renderCalendarView(ref);
  }

  function renderCalendarView(ref){
    const wrap=$('booking-calendar'); if(!wrap || !state.config)return;
    const today=new Date();today.setHours(0,0,0,0);
    const y=ref.getFullYear(),m=ref.getMonth();
    setViewMonth(y,m);
    const days=state.config.days[state.lang]||state.config.days.en;
    const months=state.config.months[state.lang]||state.config.months.en;
    const monthEl=$('calendar-month');
    if(monthEl) monthEl.textContent=`${months[m]} ${y}`;
    wrap.innerHTML='';
    days.forEach(d=>{const h=document.createElement('div');h.className='calendar-weekday';h.textContent=d;wrap.appendChild(h);});
    for(let i=0;i<new Date(y,m,1).getDay();i++){const e=document.createElement('div');e.className='calendar-empty';wrap.appendChild(e);}
    const last=new Date(y,m+1,0).getDate();
    for(let day=1;day<=last;day++){
      const d=new Date(y,m,day),iso=isoDate(d),b=document.createElement('button');
      b.type='button';b.className='calendar-day';
      if(d<today || !hasAnyAvailability(iso))b.disabled=true;
      if(iso===state.date)b.classList.add('is-selected');
      if(iso===isoDate(today))b.classList.add('is-today');
      b.innerHTML=`<span>${day}</span>${iso===isoDate(today)?'<small>'+t('Today','اليوم')+'</small>':''}`;
      b.onclick=()=>{
        state.date=iso;
        state.start=null;
        setViewMonth(d.getFullYear(),d.getMonth());
        saveDraft();
        renderCalendarView(d);
        renderTimeSlots();
        renderSummaries();
      };
      wrap.appendChild(b);
    }

    const prev=$('prev-month'),next=$('next-month');
    if(prev){
      const minMonth=new Date(today.getFullYear(),today.getMonth(),1);
      prev.disabled=ref<=minMonth;
    }
    if(next){
      const maxMonths=Math.max(0,Number(state.config.advanceMonths||3)-1);
      const maxMonth=new Date(today.getFullYear(),today.getMonth()+maxMonths,1);
      next.disabled=ref>=maxMonth;
    }
  }

  // Keep the new booking flow/local test booking AND the previous Formspree
  // notification. The booking is stored first so an email provider problem
  // never loses the customer's appointment request.
  const BOOKING_FORMSPREE_ENDPOINT = 'https://formspree.io/f/xppzwzda';

  function submitBookingToFormspreeFallback({id,name,phone,email,notes,items}){
    const form = document.getElementById('booking-form');
    if(!form) throw new Error('Booking form not found');

    const serviceNames = selectedServices()
      .map(s => s['name-'+state.lang] || s['name-en'])
      .join(', ');
    const start = state.start;
    const end = minutesToTime(toMin(start) + totalMinutes());

    // Native form submission is deliberately used as a fallback.
    // Unlike fetch(), it is not affected by browser CORS handling.
    const fields = {
      // '_subject': `New salon booking ${id}`,
      // 'booking_reference': id,
      'name': name,
      'phone': phone,
      'email': email || '',
      // '_replyto': email || '',
      'notes': notes || '',
      'appointment_date': state.date,
      'appointment_time': `${formatTime(start)} - ${formatTime(end)}`,
      'services': serviceNames,
      'total': `${total()} ${state.currency}`,
      'duration': `${totalMinutes()} minutes`,
      // 'status': 'Booking request received'
    };

    Object.keys(fields).forEach(function(key){
      let input = form.querySelector(`input[data-formspree-field="${CSS.escape(key)}"]`);
      if(!input){
        input = document.createElement('input');
        input.type = 'hidden';
        input.setAttribute('data-formspree-field', key);
        input.name = key;
        form.appendChild(input);
      }
      input.value = fields[key];
    });

    form.action = BOOKING_FORMSPREE_ENDPOINT;
    form.method = 'POST';
    form.target = 'booking-formspree-frame';
    form.dataset.formspreeFallback = 'true';

    // Do not trigger the form's onsubmit handler again.
    HTMLFormElement.prototype.submit.call(form);
    return true;
  }

  async function sendBookingNotification({id,name,phone,email,notes,items}){
    const serviceNames = selectedServices()
      .map(s => s['name-'+state.lang] || s['name-en'])
      .join(', ');
    const start = state.start;
    const end = minutesToTime(toMin(start) + totalMinutes());

    const payload = new URLSearchParams();
    // payload.set('_subject', `New salon booking ${id}`);
    // payload.set('booking_reference', id);
    payload.set('name', name);
    payload.set('phone', phone);
    if(email) {
      payload.set('email', email);
      // payload.set('_replyto', email);
    }
    if(notes) payload.set('notes', notes);
    payload.set('appointment_date', state.date);
    payload.set('appointment_time', `${formatTime(start)} - ${formatTime(end)}`);
    payload.set('services', serviceNames);
    payload.set('total', `${total()} ${state.currency}`);
    payload.set('duration', `${totalMinutes()} minutes`);
    // payload.set('status', 'Booking request received');

    try {
      const response = await fetch(BOOKING_FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: payload.toString()
      });

      if(!response.ok){
        let detail = '';
        try {
          const data = await response.json();
          detail = data && data.errors
            ? data.errors.map(x => x.message).join(', ')
            : (data && data.error) || '';
        } catch(e) {}

        const error = new Error(detail || `Formspree returned ${response.status}`);
        error.status = response.status;
        throw error;
      }

      return true;
    } catch(error) {
      // If fetch itself is blocked (commonly a CORS/network issue), use the
      // same native POST mechanism as the original Formspree implementation.
      // Do NOT do this for a real Formspree response such as 429, because that
      // would simply submit the same rate-limited request again.
      if(!error.status){
        console.warn('Formspree AJAX request failed; using native form fallback.', error);
        try {
          return submitBookingToFormspreeFallback({id,name,phone,email,notes,items});
        } catch(fallbackError) {
          fallbackError.status = error.status || 0;
          throw fallbackError;
        }
      }
      throw error;
    }
  }

  async function submitBooking(e){
    e.preventDefault();
    const name=$('customer-name').value.trim(),phone=$('customer-phone').value.trim(),email=$('customer-email').value.trim(),notes=$('customer-notes').value.trim(),err=$('booking-error');
    const submitButton = e.submitter || document.querySelector('.booking-submit');
    err.textContent='';
    if(!name||!phone){err.textContent=t('Please enter your name and WhatsApp/mobile number.','يرجى إدخال الاسم ورقم الواتساب/الهاتف.');return;}
    if(!state.date||!state.start){err.textContent=t('Please select a date and time.','يرجى اختيار التاريخ والوقت.');return;}
    if(!validStart(state.date,state.start)){err.textContent=t('That time is no longer available. Please choose another time.','هذا الوقت لم يعد متاحاً. يرجى اختيار وقت آخر.');showStep(2);return;}

    const id='SAL-'+Date.now().toString().slice(-6);
    let cur=toMin(state.start);
    const items=selectedServices().map(s=>{
      const st=minutesToTime(cur),en=minutesToTime(cur+duration(s));
      cur+=duration(s);
      return {serviceSku:s.sku,start:st,end:en};
    });
    const customer={name,phone,email,notes};

    if(submitButton){
      submitButton.disabled=true;
      submitButton.dataset.originalText=submitButton.textContent;
      submitButton.textContent=t('Checking availability…','جارٍ التحقق من التوفر…');
    }

    // Supabase is now the shared source of truth. The database function also
    // performs the overlap check inside the transaction, so two customers
    // cannot successfully reserve the same time at the same moment.
    let databaseBooking=null;
    try {
      databaseBooking=await createDatabaseBooking({
        id,date:state.date,status:'pending',customer,items,total:total(),currency:state.currency
      });
    } catch(e) {
      console.error('Could not create Supabase booking:',e);
      const unavailable=/TIME_SLOT_UNAVAILABLE|overlap|already booked|not available/i.test(String(e.message||''));
      err.textContent=unavailable
        ? t('That time was just booked. Please choose another time.','تم حجز هذا الوقت للتو. يرجى اختيار وقت آخر.')
        : t('We could not save your booking. Please try again.','تعذر حفظ الحجز. يرجى المحاولة مرة أخرى.');
      if(unavailable) showStep(2);
      if(submitButton){
        submitButton.disabled=false;
        submitButton.textContent=submitButton.dataset.originalText || t('Request appointment','إرسال طلب الحجز');
      }
      // Refresh slots after a race/conflict.
      if(unavailable){
        try { state.bookings=await loadDatabaseBookingSlots() || state.bookings; renderCalendar(); renderTimeSlots(); } catch(refreshError){}
      }
      return;
    }

    if(submitButton){
      submitButton.textContent=t('Sending request…','جارٍ إرسال الطلب…');
    }

    let emailSent=false;
    let emailError=null;
    try {
      await sendBookingNotification({id,name,phone,email,notes,items});
      emailSent=true;
    } catch(e) {
      emailError=e;
      console.warn('Booking email notification failed:',e);
    }

    $('success-reference').textContent=id;
    renderSummaries();

    const success = $('success-summary');
    if(success){
      const notification = emailSent
        ? t('Booking notification sent to the salon.','تم إرسال إشعار الحجز إلى الصالون.')
        : (emailError && emailError.status === 429
          ? t('Your booking was saved, but the email service is temporarily rate-limited. The salon can still see the booking in the CRM.','تم حفظ الحجز، لكن خدمة البريد وصلت مؤقتاً إلى حد الإرسال. يمكن للصالون رؤية الحجز في نظام إدارة الحجوزات.')
          : t('Your booking was saved. The email notification could not be sent right now.','تم حفظ الحجز، لكن تعذر إرسال إشعار البريد الإلكتروني حالياً.'));
      success.innerHTML += `<p class="booking-notification-status ${emailSent?'is-sent':'is-warning'}">${esc(notification)}</p>`;
    }

    clearBookingLocalStorage();
    state.bookings=state.bookings.filter(b=>String(b.id)!==String(id));
    state.bookings.push({
      id,date:state.date,status:'pending',items,customer,total:total(),currency:state.currency
    });

    if(submitButton){
      submitButton.disabled=false;
      submitButton.textContent=submitButton.dataset.originalText || t('Request appointment','إرسال طلب الحجز');
    }
    showStep(5);
  }

  function applyTranslations(){
    document.querySelectorAll('[data-i18n]').forEach(el=>{
      const key=el.getAttribute('data-i18n'), val=translations[state.lang]&&translations[state.lang][key];
      if(val)el.textContent=val;
    });
  }

  let translations = {};

  async function loadTranslations() {
    if (!window.salonDatabase || !window.salonDatabase.getTranslations) {
      throw new Error('Translation database client is not available.');
    }
    const rows = await window.salonDatabase.getTranslations();
    translations = {};
    (rows || []).forEach(row => {
      if (!row || !row.key) return;
      translations[row.key] = {
        en: row.en == null ? '' : String(row.en),
        ar: row.ar == null ? '' : String(row.ar)
      };
    });
  }


  function isoDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function minutesToTime(n){return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
  function formatTime(v){const [h,m]=v.split(':').map(Number);const ap=h>=12?'PM':'AM';const hh=h%12||12;return `${hh}:${String(m).padStart(2,'0')} ${ap}`;}
  function formatDate(iso){if(!iso)return '';const d=new Date(iso+'T12:00:00');const months=state.config.months[state.lang]||state.config.months.en;return state.lang==='ar'?`${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`:`${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  // Backward compatibility: services page can still call chooseService().
  window.chooseService=function(serviceName,displayName,categoryName,categoryDisplayName){
    const found=state.services.find(s=>s['name-en']===serviceName||s['name-ar']===displayName);
    if(found && duration(found)!=null){state.selected=[found.sku];state.date=null;state.start=null;saveDraft();}
    else {
      sessionStorage.setItem('bookingHandoff', JSON.stringify({
        type: 'service',
        serviceName: serviceName || '',
        serviceSku: ''
      }));
    }
    window.location.href='booking.html';
  };

  document.addEventListener('langChanged',function(e){
    state.lang=e.detail.lang;
    if(!state.initialized) return;
    render();
    showStep(state.step);
  });
  document.addEventListener('DOMContentLoaded',init);
})();