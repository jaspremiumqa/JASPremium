(function () {
  'use strict';

  var passwordSetupMode = 'invite';
  var state = { authStatuses: {}, customers: [], editingCustomerId: null, selectedCustomerId: null, categories: [], services: [], vouchers: [], users: [], roles: [], permissions: [], access: {}, rolePermissions: [], appSettings: [], bookings: [], bookingFilter: 'all', bookingDateFilter: 'all', bookingSearch: '', bookingVouchers: [], bookingView: 'list', scheduleDate: new Date(), customerLoyaltyFilter: 'all', userSearch: '', userRoleFilter: 'all', userStatusFilter: 'all', roleSearch: '', roleTypeFilter: 'all', editingServiceId: null, editingCategoryId: null, editingVoucherId: null, editingUserId: null, editingFaqId: null, faqs: [], translations: [], editingTranslationKey: null, contactMessages: [], chartOfAccounts: [], chartAccountSearch: '', chartStatementFilter: 'all', chartTypeFilter: 'all', editingChartAccountCode: null, financialStatements: [], financialStatementSearch: '', financialStatementFilter: 'all', editingJournalEntryId:null, statementMappings:[], editingMappingId:null, accountingPeriods:[], editingPeriodId:null, contactMessageSearch: '', contactMessageStatusFilter: 'all', currentView: 'dashboard', currentRole: null, currentUserId: null, mustChangePassword: false };
  var CRM_INVITE_REDIRECT = window.location.origin + window.location.pathname + '?invite=1';

  function $(id) { return document.getElementById(id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  var crmToastTimer = null;
  function getToast() {
    var toast = $('crm-toast');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = 'crm-toast';
    toast.className = 'crm-toast';
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    document.body.appendChild(toast);
    return toast;
  }
  function message(text, type) {
    var toast = getToast();
    var kind = type || 'success';
    var safeText = escapeHtml(text == null ? '' : text);
    var icon = kind === 'error' ? '!' : '✓';
    var label = kind === 'error' ? 'Error' : 'Success';
    var duration = kind === 'error' ? 6500 : 4000;
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.innerHTML = '<button type="button" class="crm-toast-close" aria-label="Dismiss notification">×</button>' +
      '<div class="crm-toast-icon" aria-hidden="true">' + icon + '</div>' +
      '<div class="crm-toast-content"><strong>' + label + '</strong><span>' + safeText + '</span></div>' +
      '<div class="crm-toast-progress" aria-hidden="true"></div>';
    toast.className = 'crm-toast show ' + kind;
    toast.style.setProperty('--crm-toast-duration', duration + 'ms');
    toast.querySelector('.crm-toast-close').addEventListener('click', clearMessage);
    if (crmToastTimer) clearTimeout(crmToastTimer);
    crmToastTimer = setTimeout(clearMessage, duration);
  }
  function clearMessage() {
    if (crmToastTimer) { clearTimeout(crmToastTimer); crmToastTimer = null; }
    var toast = $('crm-toast');
    if (toast) { toast.classList.remove('show'); }
    ['app-message','login-message'].forEach(function(id){ var el=$(id); if(el){el.textContent='';el.className='crm-message';} });
  }
  async function getCurrentRole() {
    var sessionResult = await window.salonSupabase.auth.getSession();
    if (!sessionResult.data.session) return null;
    var result = await window.salonSupabase
      .from('admin_users')
      .select('role_id,active')
      .eq('user_id', sessionResult.data.session.user.id)
      .maybeSingle();
    if (result.error || !result.data || result.data.active === false) return null;
    if (!result.data.role_id) return null;
    var roleResult = await window.salonSupabase
      .from('crm_roles')
      .select('name')
      .eq('id', result.data.role_id)
      .maybeSingle();
    if (roleResult.error || !roleResult.data) return null;
    return roleResult.data.name;
  }

  async function requireAdmin() {
    // Use the same security-definer access function as the rest of the CRM.
    // Do not query crm_roles directly here: RLS on the role catalogue can
    // legitimately hide the row even though the authenticated user is allowed
    // to access the CRM. The previous implementation treated that as an
    // unauthorized login and immediately signed the user out.
    try {
      var result = await window.salonSupabase.rpc('crm_get_my_access');
      if (result.error) throw result.error;
      var access = result.data;
      if (!access || !access.user_id || !access.role) return false;
      state.currentRole = access.role;
      state.currentUserId = access.user_id;
      state.mustChangePassword = access.must_change_password === true;
      return true;
    } catch (err) {
      console.error('CRM authorization check failed:', err);
      message('Could not verify your CRM access. Please try again.', 'error');
      return false;
    }
  }

  async function loadAccess() {
    var result = await window.salonSupabase.rpc('crm_get_my_access');
    if (result.error) throw result.error;
    var access = result.data || {};
    state.currentRole = access.role || state.currentRole;
    state.currentUserId = access.user_id || state.currentUserId;
    state.mustChangePassword = access.must_change_password === true;
    state.access = {};
    (access.permissions || []).forEach(function(permission){
      if (typeof permission === 'string') {
        state.access[permission] = true;
      } else if (permission && permission.section && permission.action) {
        state.access[permission.section + '.' + permission.action] = true;
      }
    });
    applyRoleVisibility();
  }
  function can(section, action) {
    // Chart of Accounts is a read-only reference catalogue for administrators.
    // Keep it visible to administrators even on deployments that predate its
    // permission rows; the migration still adds the full permission set for roles.
    if (['chart-of-accounts','financial-statements'].indexOf(section)>=0 && state.currentRole && ['admin','administrator'].indexOf(String(state.currentRole).toLowerCase()) >= 0) return true;
    return !!state.access[section + '.' + action];
  }
  function requirePermission(section, action, messageText) {
    if (can(section, action)) return true;
    message(messageText || ('You do not have permission to ' + action + ' ' + section + '.'), 'error');
    return false;
  }
  var ROLE_PERMISSION_SECTIONS = [
    ['dashboard','Dashboard'],['services','Services'],['vouchers','Vouchers'],['faqs','FAQs'],['chart-of-accounts','Chart of Accounts'],['journal-entries','Journal Entries'],['general-ledger','General Ledger'],['trial-balance','Trial Balance'],['financial-statements','Financial Statements'],['statement-mapping','Statement Mapping'],['accounting-periods','Accounting Periods'],
    ['bookings','Bookings'],['booking-config','Booking Setup'],['contact-messages','Contact Us'],['customers','Customers'],
    ['settings','Settings'],['translations','Translation'],['users','Users & Access'],['roles','Roles & Permissions']
  ];
  var ROLE_ACTIONS = ['read','create','update','delete','post'];

  // CRM table lists use descending order by default: newest/highest first.
  function crmDesc(a, b) {
    var av = a == null ? '' : String(a);
    var bv = b == null ? '' : String(b);
    return bv.localeCompare(av, undefined, {numeric:true, sensitivity:'base'});
  }
  function crmIdDesc(a, b) { return Number(b || 0) - Number(a || 0); }
  function crmDateDesc(a, b) { return String(b || '').localeCompare(String(a || '')); }
  function crmSkuDesc(a, b) {
    var am = String(a && a.sku || '').match(/-(\d+)$/);
    var bm = String(b && b.sku || '').match(/-(\d+)$/);
    var an = am ? Number(am[1]) : -1;
    var bn = bm ? Number(bm[1]) : -1;
    if (bn !== an) return bn - an;
    return crmDesc(a && a.sku, b && b.sku);
  }

  async function loadRoles() {
    if (!can('roles','read')) { state.roles=[]; state.permissions=[]; state.rolePermissions=[]; return; }
    var results = await Promise.all([
      window.salonSupabase.from('crm_roles').select('id,name,description,is_system,created_at,updated_at').order('created_at',{ascending:false}).order('name',{ascending:false}),
      window.salonSupabase.from('crm_permissions').select('id,section,action,description').order('section',{ascending:true}).order('action',{ascending:true}),
      window.salonSupabase.from('crm_role_permissions').select('role_id,permission_id')
    ]);
    if (results[0].error) throw results[0].error;
    if (results[1].error) throw results[1].error;
    if (results[2].error) throw results[2].error;
    state.roles=results[0].data||[];
    state.permissions=results[1].data||[];
    state.rolePermissions=results[2].data||[];
    syncUserRoleFilter();
    renderRoles();
    renderRolePermissionEditor();
    populateRoleSelects();
    // Roles load after users on older sessions; refresh the user table so
    // role_id values are rendered using the role catalogue instead of the
    // legacy fallback label.
    if (state.users && state.users.length) renderUsers();
  }

  function roleNameById(id, legacyRole) {
    var role = state.roles.find(function(r){ return String(r.id) === String(id); });
    if (role) return role.name;
    if (legacyRole) return String(legacyRole).replace(/[-_]+/g,' ').replace(/\b\w/g,function(ch){return ch.toUpperCase();});
    return 'Unassigned';
  }

  function populateRoleSelects(){
    var selects=[$('user-role'),$('edit-user-role')].filter(Boolean);
    selects.forEach(function(select){
      var current=select.value;
      select.innerHTML=state.roles.map(function(r){
        return '<option value="'+escapeHtml(r.id)+'">'+escapeHtml(r.name)+'</option>';
      }).join('');
      if(current && state.roles.some(function(r){return String(r.id)===String(current);})){ select.value=current; }
      else {
        var preferred=state.roles.find(function(r){return String(r.name).toLowerCase()==='staff';}) || state.roles[0];
        if(preferred) select.value=preferred.id;
      }
    });
  }

  function renderRoles(){
    var body=$('roles-table-body'); if(!body)return;
    var q=String(($('role-search')&&$('role-search').value)||state.roleSearch||'').trim().toLowerCase();
    var type=String(($('role-type-filter')&&$('role-type-filter').value)||state.roleTypeFilter||'all');
    var rows=state.roles.filter(function(r){
      var matchesQuery=!q || [r.name,r.description].join(' ').toLowerCase().indexOf(q)!==-1;
      var matchesType=type==='all' || (type==='system' ? !!r.is_system : !r.is_system);
      return matchesQuery && matchesType;
    }).sort(function(a,b){ return crmDateDesc(a.created_at,b.created_at) || crmDesc(a.name,b.name); });
    body.innerHTML=rows.map(function(r){
      var count=state.rolePermissions.filter(function(x){return String(x.role_id)===String(r.id);}).length;
      return '<tr><td><strong>'+escapeHtml(r.name)+'</strong></td>'+
        '<td>'+escapeHtml(r.description||'—')+'</td>'+
        '<td>'+(r.is_system?'<span class="crm-role-badge">System</span>':'<span class="crm-role-badge">Custom</span>')+'</td>'+
        '<td>'+count+' permissions</td><td><div class="crm-actions-inline">'+
        (can('roles','update')?'<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-edit-role="'+escapeHtml(r.id)+'">Edit</button>':'')+
        (r.is_system?'':' '+(can('roles','delete')?'<button type="button" class="crm-btn crm-btn-danger crm-btn-small" data-delete-role="'+escapeHtml(r.id)+'">Delete</button>':''))+ 
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="crm-empty">No roles found.</td></tr>';
  }

  function renderRolePermissionEditor(selected){
    var grid=$('role-permissions-grid'); if(!grid)return;
    var selectedKeys=selected || [];
    var available = {};
    state.permissions.forEach(function(p){ available[p.section+'.'+p.action] = p.id; });
    var sections = ROLE_PERMISSION_SECTIONS.filter(function(pair){
      return state.permissions.some(function(p){ return p.section === pair[0]; });
    });
    grid.innerHTML=sections.map(function(pair){
      var section=pair[0], label=pair[1];
      var writeChecked=['create','update','delete'].every(function(action){return selectedKeys.indexOf(section+'.'+action)!==-1;});
      return '<div class="crm-role-permission-card"><h4>'+escapeHtml(label)+'</h4><div class="crm-role-permission-actions">'+
        '<label><input type="checkbox" data-role-write="'+escapeHtml(section)+'" '+(writeChecked?'checked':'')+'> Write</label>'+ 
        ROLE_ACTIONS.filter(function(action){return available[section+'.'+action] != null;}).map(function(action){
          var key=section+'.'+action, checked=selectedKeys.indexOf(key)!==-1;
          return '<label><input type="checkbox" data-role-permission="'+escapeHtml(key)+'" '+(checked?'checked':'')+'> '+action.charAt(0).toUpperCase()+action.slice(1)+'</label>';
        }).join('')+'</div></div>';
    }).join('');
    var all=$('role-select-all');
    if(all){
      var allKeys=Object.keys(available);
      all.checked=allKeys.length>0 && allKeys.every(function(key){return selectedKeys.indexOf(key)!==-1;});
    }
    grid.querySelectorAll('[data-role-write]').forEach(function(box){box.addEventListener('change',function(){
      var section=box.getAttribute('data-role-write');
      ['create','update','delete'].forEach(function(action){var el=grid.querySelector('[data-role-permission="'+section+'.'+action+'"]');if(el)el.checked=box.checked;});
    });});
  }

  function startRoleCreate(){
    if(!can('roles','create')){message('You do not have permission to create roles.','error');return;}
    state.editingRoleId=null; $('role-form').reset(); $('role-form-title').textContent='Create role'; $('role-save').textContent='Create role'; $('role-name').disabled=false; renderRolePermissionEditor([]); $('role-form-card').classList.remove('crm-hidden'); $('role-name').focus();
  }

  function editRole(id){
    if(!requirePermission('roles','update','You do not have permission to update roles.'))return;
    var role=state.roles.find(function(r){return String(r.id)===String(id);}); if(!role)return;
    state.editingRoleId=role.id;
    $('role-name').value=role.name;
    $('role-description').value=role.description||'';
    $('role-name').disabled=role.is_system===true;
    $('role-form-title').textContent='Edit role';
    $('role-save').textContent='Save role';
    var keys=state.rolePermissions.filter(function(x){return String(x.role_id)===String(role.id);}).map(function(x){
      var p=state.permissions.find(function(permission){return String(permission.id)===String(x.permission_id);});
      return p ? p.section+'.'+p.action : null;
    }).filter(Boolean);
    renderRolePermissionEditor(keys); $('role-form-card').classList.remove('crm-hidden'); $('role-name').focus();
  }

  async function saveRole(e){
    e.preventDefault(); clearMessage();
    var action=state.editingRoleId?'update':'create';
    if(!requirePermission('roles',action)) return;
    var name=$('role-name').value.trim(), description=$('role-description').value.trim()||null;
    if(!name){message('Please enter a role name.','error');return;}

    var result;
    if(state.editingRoleId){
      result=await window.salonSupabase.from('crm_roles').update({name:name,description:description}).eq('id',state.editingRoleId).select().maybeSingle();
    } else {
      result=await window.salonSupabase.from('crm_roles').insert({name:name,description:description,is_system:false}).select().single();
    }
    if(result.error){message(result.error.message,'error');return;}
    var role=result.data;
    if(!role){message('The role was not returned after saving.','error');return;}

    var selected=[];
    document.querySelectorAll('[data-role-permission]:checked').forEach(function(el){
      var key=el.getAttribute('data-role-permission');
      var permission=state.permissions.find(function(p){return p.section+'.'+p.action===key;});
      if(permission) selected.push(permission.id);
    });

    var clearResult=await window.salonSupabase.from('crm_role_permissions').delete().eq('role_id',role.id);
    if(clearResult.error){message(clearResult.error.message,'error');return;}
    if(selected.length){
      var ins=await window.salonSupabase.from('crm_role_permissions').insert(selected.map(function(permissionId){return {role_id:role.id,permission_id:permissionId};}));
      if(ins.error){message(ins.error.message,'error');return;}
    }
    $('role-form-card').classList.add('crm-hidden'); state.editingRoleId=null; await loadRoles(); await loadAccess(); message('Role saved successfully.','success');
  }

  async function deleteRole(id){
    if(!requirePermission('roles','delete','You do not have permission to delete roles.'))return;
    var role=state.roles.find(function(r){return String(r.id)===String(id);}); if(!role || role.is_system)return;
    if(!window.confirm('Delete the role "'+(role.name||'this role')+'"? Users using it must be reassigned first.'))return;
    var usersUsing=await window.salonSupabase.from('admin_users').select('user_id',{count:'exact',head:true}).eq('role_id',role.id);
    if(usersUsing.error){message(usersUsing.error.message,'error');return;}
    if(usersUsing.count){message('This role is assigned to '+usersUsing.count+' user(s). Reassign them before deleting the role.','error');return;}
    var result=await window.salonSupabase.from('crm_roles').delete().eq('id',role.id);
    if(result.error){message(result.error.message,'error');return;}
    await loadRoles(); message('Role deleted.','success');
  }

  async function loadCustomers() {
    var result = await window.salonSupabase
      .from('customers')
      .select('id,name,phone,email,notes,created_at,is_deleted,loyalty_points,loyalty_lifetime_points,loyalty_tier')
      .eq('is_deleted', false)
      .order('id', {ascending:false});
    if (result.error) throw result.error;
    state.customers = result.data || [];
    renderCustomers();
    $('stat-customers') && ($('stat-customers').textContent=String(state.customers.length));
  }

  function renderCustomers() {
    var tbody = $('customers-table-body');
    if (!tbody) return;
    var q = (($('customer-search') && $('customer-search').value) || '').trim().toLowerCase();
    var loyalty = String(($('customer-loyalty-filter') && $('customer-loyalty-filter').value) || state.customerLoyaltyFilter || 'all');
    var rows = state.customers.filter(function(c) {
      var matchesQuery=!q ||
        String(c.name||'').toLowerCase().includes(q) ||
        String(c.phone||'').toLowerCase().includes(q) ||
        String(c.email||'').toLowerCase().includes(q);
      var tier=String(c.loyalty_tier||'Member');
      return matchesQuery && (loyalty==='all' || tier===loyalty);
    }).sort(function(a,b){ return crmIdDesc(a.id,b.id); });

    tbody.innerHTML = rows.map(function(c) {
      return '<tr>' +
        '<td><strong>'+escapeHtml(c.name||'—')+'</strong></td>' +
        '<td>'+escapeHtml(c.phone||'—')+'</td>' +
        '<td>'+escapeHtml(c.email||'—')+'</td>' +
        '<td><span class="crm-role-badge">'+escapeHtml(c.loyalty_tier||'Member')+'</span> <strong>'+Number(c.loyalty_points||0)+' pts</strong></td>' +
        '<td>'+escapeHtml(c.notes||'—')+'</td>' +
        '<td><button type="button" class="crm-btn crm-btn-secondary crm-btn-sm" onclick="viewCustomer('+Number(c.id)+')">View</button> ' +
        (can('customers','update') ? '<button type="button" class="crm-btn crm-btn-secondary crm-btn-sm" onclick="editCustomer('+Number(c.id)+')">Edit</button>' : '') +
        (can('customers','delete') ? ' <button type="button" class="crm-btn crm-btn-danger crm-btn-sm" onclick="deleteCustomer('+Number(c.id)+')">Delete</button>' : '') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="6" class="crm-empty">No customers found.</td></tr>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[ch];
    });
  }

  function startCustomerCreate() {
    state.editingCustomerId = null;
    $('customer-form').reset();
    $('customer-form-title').textContent = 'Add customer';
    $('customer-form-card').classList.remove('crm-hidden');
    $('customer-name').focus();
  }

  function editCustomer(id) {
    var c = state.customers.find(function(x){ return String(x.id) === String(id); });
    if (!c) return;
    state.editingCustomerId = c.id;
    $('customer-name').value = c.name || '';
    $('customer-phone').value = c.phone || '';
    $('customer-email').value = c.email || '';
    $('customer-notes').value = c.notes || '';
    $('customer-form-title').textContent = 'Edit customer';
    $('customer-form-card').classList.remove('crm-hidden');
    $('customer-name').focus();
  }

  async function saveCustomer(e) {
    if(!requirePermission('customers', state.editingCustomerId?'update':'create')) return;
    e.preventDefault();
    clearMessage();
    var payload = {
      name: $('customer-name').value.trim(),
      phone: $('customer-phone').value.trim() || null,
      email: $('customer-email').value.trim() || null,
      notes: state.editingCustomerId ? ($('customer-notes').value.trim() || null) : null
    };
    if (!payload.name) {
      message('Please enter the customer name.','error');
      return;
    }
    if (payload.phone && !/^\+?[0-9]+$/.test(payload.phone)) {
      message('Phone can contain only numbers, with an optional + at the beginning.','error');
      return;
    }

    var result;
    if (state.editingCustomerId) {
      result = await window.salonSupabase.from('customers')
        .update(payload).eq('id', state.editingCustomerId);
    } else {
      result = await window.salonSupabase.from('customers').insert(payload);
    }
    if (result.error) {
      message(result.error.message,'error');
      return;
    }
    message(state.editingCustomerId ? 'Customer updated.' : 'Customer added.','success');
    state.editingCustomerId = null;
    $('customer-form-card').classList.add('crm-hidden');
    await loadCustomers();
  }

  async function deleteCustomer(id) {
    if (!requirePermission('customers','delete','You do not have permission to delete customers.')) return;
    var customer = state.customers.find(function(x){ return String(x.id) === String(id); });
    if (!customer) return;
    if (!window.confirm('Delete ' + (customer.name || 'this customer') + '? The customer will be hidden from the CRM, but their booking history will be preserved.')) return;
    var result = await window.salonSupabase.rpc('crm_delete_customer', { p_id: Number(id) });
    if (result.error) { message(result.error.message || 'Could not delete customer.','error'); return; }
    if (state.selectedCustomerId && String(state.selectedCustomerId) === String(id)) closeCustomerDetails();
    message('Customer deleted. Their booking history was preserved.','success');
    await loadCustomers();
  }

  function cancelCustomerEdit() {
    state.editingCustomerId = null;
    $('customer-form-card').classList.add('crm-hidden');
  }

  async function viewCustomer(id) {
    var c = state.customers.find(function(x){ return String(x.id) === String(id); });
    if (!c) return;
    state.selectedCustomerId = c.id;
    $('customer-detail-name').textContent = c.name || 'Customer';
    $('customer-detail-contact').textContent = [c.phone, c.email].filter(Boolean).join(' • ') || 'No contact information';
    $('customer-detail-notes').textContent = c.notes || 'No notes.';
    renderCustomerLoyalty(c);
    $('customer-detail-card').classList.remove('crm-hidden');

    var results = await Promise.all([
      window.salonSupabase
        .from('bookings')
        .select('id,booking_date,start_time,end_time,status,total_price,total_duration_minutes,customer_notes')
        .eq('customer_id', c.id)
        .order('booking_date', {ascending:false})
        .order('start_time', {ascending:false}),
      window.salonSupabase
        .from('booking_services')
        .select('id,booking_id,service_id,start_time,end_time,price,duration_minutes,voucher_id')
        .order('start_time', {ascending:true}),
      window.salonSupabase
        .from('customer_loyalty_transactions')
        .select('id,points,transaction_type,description,source_booking_id,created_at')
        .eq('customer_id', c.id)
        .order('created_at', {ascending:false})
    ]);

    if (results[0].error) {
      message(results[0].error.message,'error');
      return;
    }
    if (results[1].error) {
      message(results[1].error.message,'error');
      return;
    }
    if (results[2].error) {
      message(results[2].error.message,'error');
      return;
    }

    var bookings = results[0].data || [];
    var bookingServices = results[1].data || [];
    var loyaltyTransactions = results[2].data || [];
    var servicesById = {};
    state.services.forEach(function(service){ servicesById[String(service.id)] = service; });
    var vouchersById = {};
    state.vouchers.forEach(function(voucher){ vouchersById[String(voucher.id)] = voucher; });
    var itemsByBooking = {};

    bookingServices.forEach(function(bs) {
      var key = String(bs.booking_id);
      if (!itemsByBooking[key]) itemsByBooking[key] = [];
      itemsByBooking[key].push(bs);
    });

    $('customer-booking-count').textContent = bookings.length;
    var total = bookings.reduce(function(sum,b){ return sum + Number(b.total_price||0); },0);
    $('customer-total-spent').textContent = total.toFixed(2);

    $('customer-booking-history').innerHTML = bookings.map(function(b){
      var names=(itemsByBooking[String(b.id)]||[]).map(function(bs){
        if (bs.voucher_id != null) {
          var voucher = vouchersById[String(bs.voucher_id)];
          return voucher ? (voucher.title_en || voucher.title || 'Voucher') : 'Voucher';
        }
        var service = bs.service_id != null ? servicesById[String(bs.service_id)] : null;
        return service ? (service.name_en || service.name || 'Service') : 'Service';
      }).join(', ');

      return '<tr><td>'+escapeHtml(b.booking_date||'—')+'</td><td>'+escapeHtml((b.start_time||'')+' – '+(b.end_time||''))+'</td><td>'+escapeHtml(names||'—')+'</td><td>'+escapeHtml(b.status||'—')+'</td><td>'+Number(b.total_price||0).toFixed(2)+'</td></tr>';
    }).join('') || '<tr><td colspan="5" class="crm-empty">No bookings yet.</td></tr>';

    var runningBalance = Number(c.loyalty_points || 0);
    $('customer-loyalty-history').innerHTML = loyaltyTransactions.map(function(tx){
      var afterBalance = runningBalance;
      var points = Number(tx.points || 0);
      runningBalance -= points;
      var typeLabel = tx.transaction_type === 'reward_redeemed' ? 'Reward redeemed' : (tx.transaction_type === 'booking_earned' ? 'Points earned' : 'Manual adjustment');
      var pointsLabel = (points > 0 ? '+' : '') + points + ' pts';
      var date = tx.created_at ? new Date(tx.created_at).toLocaleString() : '—';
      var rowClass = tx.transaction_type === 'reward_redeemed' ? ' class="crm-loyalty-redeemed"' : '';
      return '<tr'+rowClass+'><td>'+escapeHtml(date)+'</td><td><strong>'+escapeHtml(typeLabel)+'</strong><div class="crm-small">'+escapeHtml(tx.description || '—')+'</div></td><td><strong>'+escapeHtml(pointsLabel)+'</strong></td><td>'+escapeHtml(String(afterBalance))+' pts</td></tr>';
    }).join('') || '<tr><td colspan="4" class="crm-empty">No loyalty activity yet.</td></tr>';
  }

  function closeCustomerDetails() {
    state.selectedCustomerId = null;
    $('customer-detail-card').classList.add('crm-hidden');
  }

  function renderCustomerLoyalty(c) {
    var points = Number(c.loyalty_points || 0);
    var tier = c.loyalty_tier || 'Member';
    $('customer-loyalty-points').textContent = String(points);
    $('customer-loyalty-tier').textContent = tier + ' • ' + Number(c.loyalty_lifetime_points || 0) + ' lifetime pts';
    $('customer-loyalty-badge').textContent = tier;
    renderCustomerLoyaltyRewards(points);
  }

  async function changeCustomerLoyalty(points, description, type) {
    if (!state.selectedCustomerId) return;
    if (!requirePermission('customers','update','You do not have permission to manage customer loyalty.')) return;
    var result = await window.salonSupabase.rpc('crm_adjust_customer_loyalty', {
      p_customer_id: Number(state.selectedCustomerId),
      p_points: Number(points),
      p_description: description,
      p_transaction_type: type || 'manual_adjustment'
    });
    if (result.error) { message(result.error.message || 'Could not update loyalty points.','error'); return; }
    var data = result.data || {};
    var c = state.customers.find(function(x){ return String(x.id) === String(state.selectedCustomerId); });
    if (c) {
      c.loyalty_points = Number(data.points || 0);
      c.loyalty_lifetime_points = Number(data.lifetime_points || c.loyalty_lifetime_points || 0);
      c.loyalty_tier = data.tier || c.loyalty_tier || 'Member';
      renderCustomerLoyalty(c); renderCustomers();
      viewCustomer(c.id);
    }
    message(description + '.','success');
  }


  function settingValue(key, fallback) {
    var row = state.appSettings.find(function(x){ return x.setting_key === key && x.active !== false; });
    if (!row) return fallback;
    return row.setting_value;
  }

  function normalizeBrandingImage(value, key) {
    var result = value;
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch (e) { result = null; }
    }
    if (!result || typeof result !== 'object' || Array.isArray(result) || !result.url || !result.width || !result.height) {
      throw new Error('Application setting "' + key + '" is missing or invalid.');
    }
    return {
      path: String(result.path || ''),
      url: String(result.url),
      width: String(result.width),
      height: String(result.height)
    };
  }

  function imageSettingPayload(key) {
    var value = settingValue(key, null);
    return normalizeBrandingImage(value, key);
  }

  function optionalImageSettingPayload(key) {
    var value = settingValue(key, null);
    if (!value) return null;
    try {
      var parsed = normalizeBrandingImage(value, key);
      return parsed.url ? parsed : null;
    } catch (e) { return null; }
  }

  var WEBSITE_IMAGE_SLOTS = [
    {key:'who_we_are_image_1', inputId:'who-we-are-image-1-file', previewId:'who-we-are-image-1-preview', uploadId:'upload-who-we-are-image-1', label:'Who We Are image 1'},
    {key:'who_we_are_image_2', inputId:'who-we-are-image-2-file', previewId:'who-we-are-image-2-preview', uploadId:'upload-who-we-are-image-2', label:'Who We Are image 2'},
    {key:'who_we_are_image_3', inputId:'who-we-are-image-3-file', previewId:'who-we-are-image-3-preview', uploadId:'upload-who-we-are-image-3', label:'Who We Are image 3'},
    {key:'homepage_hero_image', inputId:'homepage-hero-image-file', previewId:'homepage-hero-image-preview', uploadId:'upload-homepage-hero-image', label:'Homepage hero'},
    {key:'services_section_image', inputId:'services-section-image-file', previewId:'services-section-image-preview', uploadId:'upload-services-section-image', label:'Services section'},
    {key:'contact_section_image', inputId:'contact-section-image-file', previewId:'contact-section-image-preview', uploadId:'upload-contact-section-image', label:'Contact section'}
  ];

  function websiteImagePayload(slot) {
    var value = settingValue(slot.key, null);
    if (!value) return {path:'',url:'',width:'100%',height:'auto'};
    try { return normalizeBrandingImage(value, slot.key); }
    catch (e) { return {path:'',url:'',width:'100%',height:'auto'}; }
  }

  function renderWebsiteImages() {
    WEBSITE_IMAGE_SLOTS.forEach(function(slot){
      var payload = websiteImagePayload(slot);
      var preview = $(slot.previewId);
      if (preview) {
        if (payload.url) {
          preview.src = payload.url;
          preview.hidden = false;
          preview.onerror = function(){ preview.removeAttribute('src'); preview.hidden = true; };
        } else {
          preview.removeAttribute('src');
          preview.hidden = true;
        }
      }
    });
  }

  async function uploadWebsiteImage(slot) {
    if (!requirePermission('settings','update')) return;
    var input = $(slot.inputId);
    var file = input && input.files ? input.files[0] : null;
    if (!file) { message('Choose an image first.','error'); return; }
    if (!/^image\//i.test(file.type)) { message('Please choose an image file.','error'); return; }
    if (file.size > 5 * 1024 * 1024) { message('Image must be 5 MB or smaller.','error'); return; }

    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    if (!/^(jpg|jpeg|png|webp|gif|ico)$/.test(ext)) ext = 'jpg';
    var path = 'website/' + slot.key + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.' + ext;
    var old = websiteImagePayload(slot);
    var upload = await window.salonSupabase.storage.from('site-assets').upload(path, file, {upsert:false, contentType:file.type || undefined});
    if (upload.error) throw upload.error;
    var publicUrlResult = window.salonSupabase.storage.from('site-assets').getPublicUrl(path);
    var publicUrl = publicUrlResult && publicUrlResult.data ? publicUrlResult.data.publicUrl : '';
    if (!publicUrl) throw new Error('Could not create a public URL for the uploaded image.');

    try {
      var result = await window.salonSupabase.from('application_settings').upsert({
        setting_key:slot.key,
        setting_value:{path:path,url:publicUrl,width:old.width || '100%',height:old.height || 'auto'},
        description:slot.label + ' used by the public website.',
        active:true,
        updated_at:new Date().toISOString()
      }, {onConflict:'setting_key'});
      if (result.error) throw result.error;
      await loadApplicationSettings();
    } catch (err) {
      await window.salonSupabase.storage.from('site-assets').remove([path]);
      throw err;
    }
    if (old.path && old.path.indexOf('website/') === 0) await window.salonSupabase.storage.from('site-assets').remove([old.path]);
    if (input) input.value = '';
    message(slot.label + ' uploaded.','success');
  }


  function brandingDefaultPayload(key) {
    var defaultKey = key + '_default';
    var row = state.appSettings.find(function(x){ return x.setting_key === defaultKey; });
    if (!row) throw new Error('Application setting "' + defaultKey + '" is missing.');
    return normalizeBrandingImage(row.setting_value, defaultKey);
  }

  function renderBrandingSettings() {
    var header = imageSettingPayload('header_image');
    var banner = imageSettingPayload('banner_image');
    var favicon = optionalImageSettingPayload('favicon_image');
    var headerPreview = $('header-image-preview');
    var sidebarLogo = $('crm-sidebar-logo');
    if (sidebarLogo) {
      sidebarLogo.src = header.url;
      sidebarLogo.hidden = false;
      sidebarLogo.style.objectFit = 'contain';
      sidebarLogo.onerror = function(){ sidebarLogo.removeAttribute('src'); sidebarLogo.hidden = true; };
    }
    if (headerPreview) {
      headerPreview.src = header.url;
      headerPreview.style.width = header.width;
      headerPreview.style.height = header.height;
      headerPreview.onerror = function(){ headerPreview.removeAttribute('src'); headerPreview.hidden = true; };
    }
    var bannerPreview = $('banner-image-preview');
    if (bannerPreview) {
      bannerPreview.style.backgroundImage = 'url("' + String(banner.url).replace(/"/g, '\\"') + '")';
      bannerPreview.style.width = banner.width;
      bannerPreview.style.minHeight = banner.height;
    }
    if ($('header-image-width')) $('header-image-width').value = header.width;
    if ($('header-image-height')) $('header-image-height').value = header.height;
    if ($('banner-image-width')) $('banner-image-width').value = banner.width;
    if ($('banner-image-height')) $('banner-image-height').value = banner.height;
    var faviconPreview = $('favicon-image-preview');
    if (faviconPreview) {
      if (favicon && favicon.url) { faviconPreview.src = favicon.url; faviconPreview.hidden = false; }
      else { faviconPreview.removeAttribute('src'); faviconPreview.hidden = true; }
      faviconPreview.onerror = function(){ faviconPreview.removeAttribute('src'); faviconPreview.hidden = true; };
    }
    renderWebsiteImages();
    document.querySelectorAll('.crm-welcome').forEach(function(hero){
      hero.style.backgroundImage = 'linear-gradient(120deg, rgba(48,40,36,.82), rgba(87,70,62,.72)), url("' + String(banner.url).replace(/"/g, '\\"') + '")';
      hero.style.backgroundSize = 'cover';
      hero.style.backgroundPosition = 'center';
    });
  }

  function validateCssSize(value, label, fallback) {
    value = String(value || '').trim();
    if (!value) return fallback;
    if (!/^(?:\d+(?:\.\d+)?)(?:px|%|vw|vh|rem|em|auto)$/.test(value)) {
      throw new Error(label + ' must be a valid CSS size such as 125px, 100%, or 20.833vw.');
    }
    return value;
  }

  async function persistBrandingSetting(key, payload) {
    var result = await window.salonSupabase.from('application_settings').upsert({
      setting_key: key,
      setting_value: payload,
      description: key === 'header_image' ? 'Website header image and display dimensions.' : 'Website page banner image and display dimensions.',
      active: true,
      updated_at: new Date().toISOString()
    }, {onConflict:'setting_key'});
    if (result.error) throw result.error;
    await loadApplicationSettings();
  }

  async function uploadBrandingImage(key, fileInputId, maxMb) {
    if (!requirePermission('settings','update')) return;
    var input = $(fileInputId);
    var file = input && input.files ? input.files[0] : null;
    if (!file) { message('Choose an image first.','error'); return; }
    if (!/^image\//i.test(file.type)) { message('Please choose an image file.','error'); return; }
    maxMb = Number(maxMb || 5);
    if (file.size > maxMb * 1024 * 1024) { message('Image must be ' + maxMb + ' MB or smaller.','error'); return; }

    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    if (!/^(jpg|jpeg|png|webp|gif|ico)$/.test(ext)) ext = 'jpg';
    var path = 'branding/' + key.replace('_image','') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.' + ext;
    var old = key === 'favicon_image' ? (optionalImageSettingPayload(key) || {path:'',url:'',width:'32px',height:'32px'}) : imageSettingPayload(key);
    var upload = await window.salonSupabase.storage.from('site-assets').upload(path, file, {upsert:false, contentType:file.type || undefined});
    if (upload.error) throw upload.error;
    var publicUrlResult = window.salonSupabase.storage.from('site-assets').getPublicUrl(path);
    var publicUrl = publicUrlResult && publicUrlResult.data ? publicUrlResult.data.publicUrl : '';
    if (!publicUrl) throw new Error('Could not create a public URL for the uploaded image.');

    try {
      await persistBrandingSetting(key, {path:path, url:publicUrl, width:old.width, height:old.height});
    } catch (err) {
      await window.salonSupabase.storage.from('site-assets').remove([path]);
      throw err;
    }
    if (old.path && old.path.indexOf('branding/') === 0) {
      await window.salonSupabase.storage.from('site-assets').remove([old.path]);
    }
    if (input) input.value = '';
    message(key === 'header_image' ? 'Header image uploaded.' : (key === 'banner_image' ? 'Page banner image uploaded.' : 'Favicon uploaded.'),'success');
  }

  async function deleteBrandingImage(key) {
    if (!requirePermission('settings','update')) return;
    var current = key === 'favicon_image' ? (optionalImageSettingPayload(key) || {path:'',url:'',width:'32px',height:'32px'}) : imageSettingPayload(key);
    if (current.path && current.path.indexOf('branding/') === 0) {
      var remove = await window.salonSupabase.storage.from('site-assets').remove([current.path]);
      if (remove.error) throw remove.error;
    }
    if (key === 'favicon_image') {
      await persistBrandingSetting(key, {path:'',url:'',width:'32px',height:'32px'});
      message('Favicon deleted.','success');
      return;
    }
    await persistBrandingSetting(key, brandingDefaultPayload(key));
    message((key === 'header_image' ? 'Header image' : 'Page banner image') + ' restored to the default image.','success');
  }


  function normalizeCurrencyOptions(value) {
    var options = value;
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch (e) { options = {}; }
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) options = {};
    return options;
  }

  function currencyOptionRows() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-currency-row]'));
  }

  function renderCurrencyOptions(options) {
    options = normalizeCurrencyOptions(options);
    var container = $('currency-options-list');
    if (!container) return;

    var codes = Object.keys(options);
    if (!codes.length) {
      container.innerHTML = '<div class="crm-settings-empty">No currencies configured yet. Add one below.</div>';
      return;
    }

    container.innerHTML = codes.map(function(code) {
      var item = options[code] || {};
      var safeCode = escapeHtml(String(code).toUpperCase());
      return '<div class="crm-currency-row" data-currency-row data-code="'+safeCode+'">'+
        '<div class="crm-currency-code">'+
          '<span class="crm-currency-symbol">'+escapeHtml((item.en || item.ar || String(code).charAt(0)).toString().slice(0,2))+'</span>'+
          '<div><strong>'+safeCode+'</strong><small>Currency code</small></div>'+
        '</div>'+
        '<div class="crm-field">'+
          '<label>English label</label>'+
          '<input type="text" data-currency-en value="'+escapeHtml(item.en || '')+'" placeholder="$ or USD">'+
        '</div>'+
        '<div class="crm-field">'+
          '<label>Arabic label</label>'+
          '<input type="text" data-currency-ar value="'+escapeHtml(item.ar || '')+'" placeholder="ريال or $">'+
        '</div>'+
        '<button type="button" class="crm-icon-btn crm-remove-currency" title="Remove '+safeCode+'" aria-label="Remove '+safeCode+'">×</button>'+
      '</div>';
    }).join('');

    bindCurrencyRowEvents();
  }

  function bindCurrencyRowEvents() {
    currencyOptionRows().forEach(function(row) {
      var remove = row.querySelector('.crm-remove-currency');
      if (remove) {
        remove.addEventListener('click', function() {
          var rows = currencyOptionRows();
          if (rows.length <= 1) {
            message('Keep at least one currency configured.','error');
            return;
          }
          row.remove();
        });
      }
    });
  }

  function addCurrencyOption() {
    var container = $('currency-options-list');
    if (!container) return;
    if (container.querySelector('.crm-settings-empty')) container.innerHTML = '';

    var existingCodes = currencyOptionRows().map(function(row) {
      return row.getAttribute('data-code') || '';
    });
    var code = 'NEW';
    var n = 1;
    while (existingCodes.indexOf(code) !== -1) {
      code = 'NEW' + n++;
    }

    var row = document.createElement('div');
    row.className = 'crm-currency-row';
    row.setAttribute('data-currency-row', '');
    row.setAttribute('data-code', code);
    row.innerHTML =
      '<div class="crm-currency-code crm-currency-code-edit">'+
        '<input type="text" data-currency-code value="'+code+'" maxlength="5" aria-label="Currency code" placeholder="USD">'+
        '<small>3-letter code</small>'+
      '</div>'+
      '<div class="crm-field">'+
        '<label>English label</label>'+
        '<input type="text" data-currency-en placeholder="$ or USD">'+
      '</div>'+
      '<div class="crm-field">'+
        '<label>Arabic label</label>'+
        '<input type="text" data-currency-ar placeholder="ريال or $">'+
      '</div>'+
      '<button type="button" class="crm-icon-btn crm-remove-currency" title="Remove currency" aria-label="Remove currency">×</button>';

    container.appendChild(row);
    bindCurrencyRowEvents();
    var codeInput = row.querySelector('[data-currency-code]');
    if (codeInput) {
      codeInput.focus();
      codeInput.select();
      codeInput.addEventListener('input', function() {
        row.setAttribute('data-code', codeInput.value.trim().toUpperCase());
      });
    }
  }

  function collectCurrencyOptions() {
    var options = {};
    var rows = currencyOptionRows();

    rows.forEach(function(row) {
      var codeInput = row.querySelector('[data-currency-code]');
      var code = codeInput
        ? codeInput.value.trim().toUpperCase()
        : String(row.getAttribute('data-code') || '').trim().toUpperCase();
      var en = row.querySelector('[data-currency-en]').value.trim();
      var ar = row.querySelector('[data-currency-ar]').value.trim();

      if (!code) throw new Error('Every currency needs a currency code.');
      if (!/^[A-Z]{3,5}$/.test(code)) throw new Error('Currency code "'+code+'" must use 3–5 letters.');
      if (!en || !ar) throw new Error('Please enter both English and Arabic labels for '+code+'.');
      if (options[code]) throw new Error('Currency '+code+' is listed more than once.');

      options[code] = {en: en, ar: ar};
    });

    return options;
  }

  function applyCrmFavicon() {
    var favicon = optionalImageSettingPayload('favicon_image');
    var old = document.querySelector('link[data-crm-favicon]');
    if (old) old.remove();

    // Keep the bootstrap icon in the document head so Chrome does not fall back
    // to requesting /favicon.ico while the CRM settings are loading.
    var bootstrap = document.querySelector('link[data-favicon-bootstrap]');
    if (!favicon || !favicon.url) return;

    var link = document.createElement('link');
    link.rel = 'icon';
    link.href = favicon.url + (favicon.url.indexOf('?') === -1 ? '?crm-favicon=' + Date.now() : '&crm-favicon=' + Date.now());
    link.dataset.crmFavicon = 'true';
    document.head.appendChild(link);

    // Remove the bootstrap data URI once the real favicon is installed.
    if (bootstrap) bootstrap.remove();
  }

  async function loadApplicationSettings(ensureSocial) {
    var result = await window.salonSupabase
      .from('application_settings')
      .select('id,setting_key,setting_value,description,active,created_at,updated_at')
      .order('setting_key', {ascending:false});
    if (result.error) throw result.error;
    state.appSettings = result.data || [];
    deactivateLegacySocialSettings();
    applyCrmFavicon();
    renderApplicationSettings();
  }

  function applyCrmWebsiteName(websiteName) {
    var name = String(websiteName || '').trim();
    if (!name) return;
    var brand = $('crm-sidebar-website-name');
    if (brand) brand.textContent = name;
    document.title = name + ' — CRM';
  }

  var SOCIAL_DEFAULTS = [
    {key:'social_whatsapp', slug:'whatsapp', label:'WhatsApp'},
    {key:'social_facebook', slug:'facebook', label:'Facebook'},
    {key:'social_instagram', slug:'instagram', label:'Instagram'}
  ];

  function parseSettingPayload(value) {
    if (typeof value === 'string') { try { return JSON.parse(value); } catch (e) { return {}; } }
    return value && typeof value === 'object' ? value : {};
  }

  function socialRow(key) {
    return state.appSettings.find(function(x){ return x.setting_key === key; }) || null;
  }

  function socialPayloadFor(meta) {
    var row = socialRow(meta.key);
    var payload = parseSettingPayload(row && row.setting_value);
    return {url: String(payload.url || '')};
  }

  function renderSocialSettings() {
    var container = $('social-settings-list');
    if (!container) return;
    container.innerHTML = SOCIAL_DEFAULTS.map(function(meta){
      var row = socialRow(meta.key);
      var payload = socialPayloadFor(meta);
      var active = row ? row.active !== false : false;
      var iconClass = 'fa-' + meta.slug;
      return '<div class="crm-social-row" data-social-row="'+escapeHtml(meta.key)+'">'+
        '<div class="crm-social-icon-preview '+escapeHtml(iconClass)+'" aria-hidden="true"></div>'+
        '<div class="crm-social-name"><strong>'+escapeHtml(meta.label)+'</strong><small>'+escapeHtml(meta.slug)+'</small></div>'+
        '<div class="crm-social-field crm-social-field-url"><label for="social-url-'+escapeHtml(meta.slug)+'">Public URL</label><input id="social-url-'+escapeHtml(meta.slug)+'" type="url" data-social-url="'+escapeHtml(meta.key)+'" value="'+escapeHtml(payload.url)+'" placeholder="https://..."></div>'+
        '<div class="crm-social-status"><label><input type="checkbox" data-social-active="'+escapeHtml(meta.key)+'" '+(active?'checked':'')+'> Active — show on website</label></div>'+
      '</div>';
    }).join('');
  }

  function deactivateLegacySocialSettings() {
    ['social_tiktok','social_youtube','social_snapchat','social_x'].forEach(function(key){
      var row=socialRow(key);
      if (row && row.active !== false) row.active=false;
    });
  }

  var DEFAULT_LOYALTY_REWARDS = [
    {points:100, reward:'$10 reward'},
    {points:250, reward:'$30 reward'},
    {points:500, reward:'$70 reward'}
  ];

  function normalizeLoyaltyRewards(value) {
    var parsed = value;
    if (typeof parsed === 'string') {
      try { parsed = JSON.parse(parsed); } catch (e) { parsed = []; }
    }
    if (!Array.isArray(parsed)) parsed = [];
    var cleaned = parsed.map(function(item){
      return {points:Number(item && item.points), reward:String(item && item.reward || '').trim()};
    }).filter(function(item){
      return Number.isInteger(item.points) && item.points > 0 && item.reward;
    });
    return cleaned.length ? cleaned : DEFAULT_LOYALTY_REWARDS.map(function(item){ return {points:item.points,reward:item.reward}; });
  }

  function loyaltyRewardsSetting() {
    return settingValue('loyalty_rewards', DEFAULT_LOYALTY_REWARDS);
  }

  function renderLoyaltyRewardSettings() {
    var container = $('loyalty-reward-settings-list');
    if (!container) return;
    var rewards = normalizeLoyaltyRewards(loyaltyRewardsSetting());
    container.innerHTML = rewards.map(function(item,index){
      return '<div class="crm-loyalty-reward-setting-row" data-loyalty-reward-row>'+
        '<div class="crm-field"><label>Points to redeem</label><input type="number" min="1" step="1" data-loyalty-reward-points value="'+escapeHtml(String(item.points))+'" placeholder="100"></div>'+
        '<div class="crm-field"><label>Reward</label><input type="text" maxlength="120" data-loyalty-reward-label value="'+escapeHtml(item.reward)+'" placeholder="$10 reward or Free haircut"></div>'+
        '<button type="button" class="crm-btn crm-btn-secondary crm-btn-small crm-loyalty-remove-reward" data-remove-loyalty-reward aria-label="Remove reward '+(index+1)+'">Remove</button>'+
      '</div>';
    }).join('');
  }

  function collectLoyaltyRewards() {
    var rows = Array.prototype.slice.call(document.querySelectorAll('[data-loyalty-reward-row]'));
    var seen = {};
    var rewards = [];
    rows.forEach(function(row){
      var points = Number(row.querySelector('[data-loyalty-reward-points]') && row.querySelector('[data-loyalty-reward-points]').value);
      var reward = String((row.querySelector('[data-loyalty-reward-label]') && row.querySelector('[data-loyalty-reward-label]').value) || '').trim();
      if (!Number.isInteger(points) || points <= 0) throw new Error('Each loyalty reward must have a whole number of points greater than 0.');
      if (!reward) throw new Error('Each loyalty reward must have a reward description.');
      if (seen[points]) throw new Error('Each loyalty reward must use a different points value.');
      seen[points] = true;
      rewards.push({points:points,reward:reward});
    });
    if (!rewards.length) throw new Error('Add at least one loyalty reward, or keep the default rewards.');
    rewards.sort(function(a,b){ return b.points-a.points; });
    return rewards;
  }

  function renderCustomerLoyaltyRewards(points) {
    var container = $('customer-loyalty-rewards');
    if (!container) return;
    var rewards = normalizeLoyaltyRewards(loyaltyRewardsSetting());
    container.innerHTML = rewards.map(function(item){
      var disabled = points < item.points ? ' disabled' : '';
      var title = points < item.points ? 'Not enough points' : 'Redeem this reward';
      return '<button type="button" class="crm-btn crm-btn-secondary crm-reward-btn" data-reward-points="'+item.points+'" data-reward-label="'+escapeHtml(item.reward)+'" title="'+escapeHtml(title)+'"'+disabled+'>Redeem '+item.points+' pts → '+escapeHtml(item.reward)+'</button>';
    }).join('');
  }

  function renderApplicationSettings() {
    var currency = settingValue('display_currency', 'USD');
    var options = normalizeCurrencyOptions(settingValue('currency_options', {
      USD: {en:'$', ar:'$'},
      QAR: {en:'QAR', ar:'ريال'}
    }));
    var language = settingValue('default_language', 'en');
    var websiteName = settingValue('website_name', '');
    var contactPhone = settingValue('contact_phone', '+1 234 567 890');

    var currencySelect = $('app-setting-currency');
    var languageSelect = $('app-setting-language');
    if (currencySelect) {
      var codes = Object.keys(options);
      currencySelect.innerHTML = codes.map(function(code) {
        var item = options[code] || {};
        return '<option value="'+escapeHtml(code)+'">'+escapeHtml(code)+' — '+escapeHtml(item.en || item.ar || '')+'</option>';
      }).join('');
      currencySelect.value = String(currency || 'USD').toUpperCase();
      if (!currencySelect.value && codes.length) currencySelect.value = codes[0];
    }
    if (languageSelect) languageSelect.value = String(language || 'en').toLowerCase();
    var websiteNameInput = $('app-setting-website-name');
    if (websiteNameInput) websiteNameInput.value = String(websiteName || '').trim();
    applyCrmWebsiteName(websiteName);
    var phoneInput = $('app-setting-contact-phone');
    if (phoneInput) phoneInput.value = String(contactPhone || '').trim();

    renderCurrencyOptions(options);
    renderBrandingSettings();
    renderSocialSettings();
    renderLoyaltyRewardSettings();

    var status = $('app-settings-status');
    if (status) status.textContent = 'Settings synced';
  }

  async function saveApplicationSettings(e) {
    if(!requirePermission('settings','update')) return;
    e.preventDefault();
    clearMessage();
    if (!can('users','read')) {
      message('Only administrators can manage application settings.','error');
      return;
    }

    var currency = $('app-setting-currency').value.trim().toUpperCase();
    var language = $('app-setting-language').value.trim().toLowerCase();
    var websiteName = $('app-setting-website-name').value.trim();
    var contactPhone = $('app-setting-contact-phone').value.trim();
    var options;
    var headerImage;
    var bannerImage;
    var faviconImage;

    try {
      headerImage = imageSettingPayload('header_image');
      bannerImage = imageSettingPayload('banner_image');
      faviconImage = optionalImageSettingPayload('favicon_image') || {path:'',url:'',width:'32px',height:'32px'};
      headerImage.width = validateCssSize($('header-image-width').value, 'Header width', headerImage.width);
      headerImage.height = validateCssSize($('header-image-height').value, 'Header height', headerImage.height);
      bannerImage.width = validateCssSize($('banner-image-width').value, 'Banner width', bannerImage.width);
      bannerImage.height = validateCssSize($('banner-image-height').value, 'Banner height', bannerImage.height);
    } catch (err) {
      message(err.message,'error');
      return;
    }

    if (!currency || !language || !websiteName || !contactPhone) {
      message('Please complete the website name, currency, language and contact phone settings.','error');
      return;
    }
    if (language !== 'en' && language !== 'ar') {
      message('Default language must be English or Arabic.','error');
      return;
    }

    try {
      options = collectCurrencyOptions();
    } catch (err) {
      message(err.message,'error');
      return;
    }

    if (!options[currency]) {
      message('The display currency must be one of the configured currencies.','error');
      return;
    }

    var socialSettings;
    try {
      socialSettings = SOCIAL_DEFAULTS.map(function(meta){
        var payload = socialPayloadFor(meta);
        var urlInput = document.querySelector('[data-social-url="'+meta.key+'"]');
        var activeInput = document.querySelector('[data-social-active="'+meta.key+'"]');
        payload.url = urlInput ? urlInput.value.trim() : payload.url;
        var active = !!(activeInput && activeInput.checked);

        // An active social channel must have a real public URL. Without this,
        // the public website intentionally hides the channel, which previously
        // made the CRM checkbox look like it was working when nothing appeared.
        if (active && !payload.url) {
          throw new Error(meta.label + ' is marked active, but its Public URL is empty. Enter the public URL or turn off “Active — show on website”.');
        }
        if (active && !/^https?:\/\//i.test(payload.url)) {
          throw new Error(meta.label + ' must use a public URL beginning with https:// or http://.');
        }

        return {key:meta.key,value:{url:payload.url},description:meta.label+' social link.',active:active};
      });
    } catch (err) {
      message(err.message,'error');
      return;
    }

    var loyaltyRewards;
    try {
      loyaltyRewards = collectLoyaltyRewards();
    } catch (err) {
      message(err.message,'error');
      return;
    }

    var settings = [
      {key:'website_name', value:websiteName, description:'Public website name used across the website and browser title.'},
      {key:'display_currency', value:currency, description:'Default website display currency.'},
      {key:'currency_options', value:options, description:'Currency labels by currency and language.'},
      {key:'default_language', value:language, description:'Default website language for new visitors.'},
      {key:'contact_phone', value:contactPhone, description:'Public contact phone number used across the website.'},
      {key:'header_image', value:headerImage, description:'Website header image and display dimensions.'},
      {key:'banner_image', value:bannerImage, description:'Website page banner image and display dimensions.'},
      {key:'favicon_image', value:faviconImage, description:'Website favicon shown in the browser tab.'},
      {key:'loyalty_rewards', value:loyaltyRewards, description:'Customer loyalty reward redemption rules: points required and reward description.'}
    ].concat(socialSettings);

    var button = $('save-application-settings');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }

    try {
      for (var i=0; i<settings.length; i++) {
        var s = settings[i];
        var result = await window.salonSupabase
          .from('application_settings')
          .upsert({
            setting_key: s.key,
            setting_value: s.value,
            description: s.description,
            active: s.active !== undefined ? s.active : true,
            updated_at: new Date().toISOString()
          }, {onConflict:'setting_key'});
        if (result.error) {
          message(result.error.message,'error');
          return;
        }
      }

      message('Application settings saved.','success');
      await loadApplicationSettings();
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Save Settings'; }
    }
  }


  async function loadFaqs() {
    if (!can('faqs','read')) {
      state.faqs = [];
      return;
    }
    var faqResult = await window.salonSupabase
      .from('faqs')
      .select('*')
      .order('sort_order', {ascending:false})
      .order('id', {ascending:false});
    if (faqResult.error) throw faqResult.error;

    state.faqs = faqResult.data || [];
    renderFaqs();
  }

  function renderFaqs() {
    var tbody = $('faq-table-body');
    if (!tbody) return;
    var rows = state.faqs.slice().sort(function(a,b){ return Number(b.sort_order||0)-Number(a.sort_order||0) || crmIdDesc(a.id,b.id); });
    tbody.innerHTML = rows.map(function(f) {
      var answer = String(f.answer_en || '');
      if (answer.length > 150) answer = answer.slice(0,147) + '…';
      return '<tr>' +
        '<td><strong>'+escapeHtml(f.question_en || '—')+'</strong><br><span class="crm-small" dir="rtl">'+escapeHtml(f.question_ar || '')+'</span></td>' +
        '<td>'+escapeHtml(answer || '—')+'</td>' +
        '<td>'+Number(f.sort_order || 0)+'</td>' +
        '<td>'+(f.active ? '<span class="crm-badge active">Active</span>' : '<span class="crm-badge inactive">Inactive</span>')+'</td>' +
        '<td><button type="button" class="crm-btn crm-btn-secondary crm-btn-sm" data-edit-faq="'+f.id+'">Edit</button> ' +
        '<button type="button" class="crm-btn crm-btn-danger crm-btn-sm" data-delete-faq="'+f.id+'">Delete</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="5" class="crm-empty">No FAQs found.</td></tr>';
  }

  function resetFaqForm() {
    state.editingFaqId = null;
    if (!$('faq-form')) return;
    $('faq-form').reset();
    $('faq-form-title').textContent = 'Add FAQ';
    $('faq-sort-order').value = state.faqs.length ? String(Math.max.apply(null, state.faqs.map(function(f){ return Number(f.sort_order)||0; })) + 1) : '1';
    $('faq-active').checked = true;
    $('faq-form-card').classList.add('crm-hidden');
  }

  function startFaqCreate() {
    resetFaqForm();
    $('faq-form-card').classList.remove('crm-hidden');
    $('faq-form-card').scrollIntoView({behavior:'smooth', block:'center'});
    window.setTimeout(function(){ $('faq-question-en').focus(); }, 350);
  }

  function editFaq(id) {
    var f = state.faqs.find(function(x){ return String(x.id) === String(id); });
    if (!f) return;
    state.editingFaqId = f.id;
    $('faq-question-en').value = f.question_en || '';
    $('faq-question-ar').value = f.question_ar || '';
    $('faq-answer-en').value = f.answer_en || '';
    $('faq-answer-ar').value = f.answer_ar || '';
    $('faq-sort-order').value = Number(f.sort_order || 0);
    $('faq-active').checked = f.active !== false;
    $('faq-form-title').textContent = 'Edit FAQ';
    $('faq-form-card').classList.remove('crm-hidden');
    $('faq-form-card').scrollIntoView({behavior:'smooth', block:'center'});
    window.setTimeout(function(){ $('faq-question-en').focus(); }, 350);
  }

  async function saveFaq(e) {
    if(!requirePermission('faqs', state.editingFaqId?'update':'create')) return;
    e.preventDefault();
    clearMessage();
    var payload = {
      question_en: $('faq-question-en').value.trim(),
      question_ar: $('faq-question-ar').value.trim() || null,
      answer_en: $('faq-answer-en').value.trim(),
      answer_ar: $('faq-answer-ar').value.trim() || null,
      sort_order: Math.max(0, parseInt($('faq-sort-order').value,10) || 0),
      active: $('faq-active').checked
    };
    if (!payload.question_en || !payload.answer_en) {
      message('English question and answer are required.','error');
      return;
    }
    var result;
    if (state.editingFaqId) {
      result = await window.salonSupabase.from('faqs')
        .update(payload)
        .eq('id', state.editingFaqId)
        .select()
        .maybeSingle();
    } else {
      result = await window.salonSupabase.from('faqs')
        .insert(payload)
        .select()
        .maybeSingle();
    }
    if (result.error) {
      message(result.error.message,'error');
      return;
    }
    if (!result.data) {
      message('FAQ could not be saved. Check that your CRM account is an admin and that FAQ RLS policies are installed.','error');
      return;
    }
    message(state.editingFaqId ? 'FAQ updated.' : 'FAQ added.','success');
    resetFaqForm();
    await loadFaqs();
  }

  async function deleteFaq(id) {
    if(!requirePermission('faqs','delete')) return;
    var f = state.faqs.find(function(x){ return String(x.id) === String(id); });
    if (!f || !window.confirm('Delete this FAQ? This cannot be undone.')) return;
    var result = await window.salonSupabase.from('faqs').delete().eq('id', id);
    if (result.error) {
      message(result.error.message,'error');
      return;
    }
    message('FAQ deleted.','success');
    await loadFaqs();
  }

  async function loadData() {
    if (can('services','read')) {
      var cats = await window.salonSupabase.from('service_categories').select('*').order('sort_order',{ascending:false}).order('id',{ascending:false});
      if (cats.error) throw cats.error;
      var services = await window.salonSupabase.from('services').select('*').order('sort_order',{ascending:false}).order('id',{ascending:false});
      if (services.error) throw services.error;
      state.categories=cats.data||[]; state.services=services.data||[];
    } else { state.categories=[]; state.services=[]; }
    if (can('vouchers','read')) {
      var vouchers = await window.salonSupabase.from('vouchers').select('*');
      if (vouchers.error) throw vouchers.error;
      state.vouchers=(vouchers.data||[]).slice().sort(function(a,b){
        var am=String(a.sku||'').match(/-(\d+)$/), bm=String(b.sku||'').match(/-(\d+)$/);
        var an=am?Number(am[1]):-1, bn=bm?Number(bm[1]):-1;
        if(an!==bn) return bn-an;
        return String(b.sku||'').localeCompare(String(a.sku||''));
      });
    } else state.vouchers=[];
    state.bookingVouchers=state.vouchers.slice();
    renderCategories(); renderServices(); renderVouchers(); populateCategorySelect(); syncServiceCategoryFilter(); if(!state.editingServiceId) generateServiceSku(); updateDashboard();
  }
  async function loadUsers() {
    if (!can('users','read')) {
      state.users = [];
      $('stat-users') && ($('stat-users').textContent='—');
      return;
    }
    var result = await window.salonSupabase.from('admin_users').select('*').order('created_at',{ascending:false});
    if (result.error) throw result.error;
    state.users=result.data||[];
    syncUserRoleFilter();
    state.authStatuses={};
    try {
      var authResult=await window.salonSupabase.functions.invoke('get-crm-user-statuses',{body:{}});
      if(authResult.error) throw new Error((authResult.data&&authResult.data.error)||authResult.error.message||'Could not load authentication status.');
      (authResult.data&&authResult.data.users||[]).forEach(function(item){state.authStatuses[String(item.user_id)]=item;});
    } catch(statusError) { console.warn('Could not load authentication statuses:',statusError); }
    renderUsers();
    $('stat-users') && ($('stat-users').textContent=state.users.length);
    $('stat-bookings') && ($('stat-bookings').textContent=state.bookings.length);
  }
  function categoryName(id) { var c=state.categories.find(function(x){return String(x.id)===String(id);}); return c?c.name_en:'—'; }

  function syncServiceCategoryFilter() {
    var select = $('service-category-filter');
    if (!select) return;
    var current = select.value || 'all';
    select.innerHTML = '<option value="all">All categories</option>' + state.categories.slice().sort(function(a,b){ return crmDesc(a.name_en,b.name_en); }).map(function(c){
      return '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name_en)+'</option>';
    }).join('');
    if (current !== 'all' && state.categories.some(function(c){return String(c.id)===String(current);})){
      select.value = current;
    } else {
      select.value = 'all';
    }
  }

  function renderCategories() {
    var body=$('category-table-body'); if(!body)return;
    var query=String(($('category-search')&&$('category-search').value)||'').trim().toLowerCase();
    var status=String(($('category-status-filter')&&$('category-status-filter').value)||'all');
    var rows=state.categories.filter(function(c){
      var matchesQuery=!query || [c.name_en,c.name_ar,c.description_en,c.description_ar].join(' ').toLowerCase().indexOf(query)!==-1;
      var matchesStatus=status==='all' || (status==='active' ? c.active!==false : c.active===false);
      return matchesQuery && matchesStatus;
    }).sort(function(a,b){ return Number(b.sort_order||0)-Number(a.sort_order||0) || crmIdDesc(a.id,b.id); });
    body.innerHTML=rows.map(function(c){
      var image=c.image_url||'';
      var imageHtml=image?'<div class="crm-category-thumb"><img src="'+escapeHtml(image)+'" alt="'+escapeHtml(c.name_en||'Category')+'" onerror="this.parentNode.style.display=&quot;none&quot;"></div>':'<span class="crm-small">No image</span>';
      return '<tr><td><strong>'+escapeHtml(c.name_en)+'</strong><br><span class="crm-small">'+escapeHtml(c.name_ar)+'</span></td>'+
      '<td>'+imageHtml+'</td><td>'+escapeHtml(c.image_width||'')+' × '+escapeHtml(c.image_height||'')+'</td>'+
      '<td>'+(c.active?'<span class="crm-badge active">Active</span>':'<span class="crm-badge inactive">Inactive</span>')+'</td>'+
      '<td><div class="crm-row-actions">'+
      (can('services','update')?'<button class="crm-btn crm-btn-secondary" data-edit-category="'+c.id+'">Edit</button>':'')+
      (can('services','delete')?'<button class="crm-btn crm-btn-danger crm-btn-small" data-delete-category="'+c.id+'">Delete</button>':'')+
      '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="crm-empty">No categories found.</td></tr>';
  }

  function renderServices() {
    var body=$('service-table-body'); if(!body)return;
    var query=String(($('service-search')&&$('service-search').value)||'').trim().toLowerCase();
    var category=String(($('service-category-filter')&&$('service-category-filter').value)||'all');
    var status=String(($('service-status-filter')&&$('service-status-filter').value)||'all');
    var rows=state.services.filter(function(s){
      var matchesQuery=!query || [s.sku,s.name_en,s.name_ar,categoryName(s.category_id)].join(' ').toLowerCase().indexOf(query)!==-1;
      var matchesCategory=category==='all' || String(s.category_id)===category;
      var matchesStatus=status==='all' || (status==='active' ? s.active!==false : s.active===false);
      return matchesQuery && matchesCategory && matchesStatus;
    }).sort(crmSkuDesc);
    body.innerHTML=rows.map(function(s){
      return '<tr><td>'+escapeHtml(s.sku||'')+'</td><td><strong>'+escapeHtml(s.name_en)+'</strong><br><span class="crm-small">'+escapeHtml(s.name_ar)+'</span></td>'+
      '<td>'+escapeHtml(categoryName(s.category_id))+'</td><td class="crm-price">$'+escapeHtml(s.price_usd==null?'':s.price_usd)+'<br><span class="crm-price-muted">'+(s.price_qar==null?'—':escapeHtml(s.price_qar)+' QAR')+'</span></td>'+
      '<td>'+(s.duration_minutes==null?'—':escapeHtml(s.duration_minutes)+' min')+'</td><td>'+(s.active?'<span class="crm-badge active">Active</span>':'<span class="crm-badge inactive">Inactive</span>')+'</td>'+
      '<td><div class="crm-row-actions">'+
      (can('services','update')?'<button class="crm-btn crm-btn-secondary" data-edit-service="'+s.id+'">Edit</button>':'')+
      (can('services','delete')?'<button class="crm-btn crm-btn-danger crm-btn-small" data-delete-service="'+s.id+'">Delete</button>':'')+
      '</div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="crm-empty">No services found.</td></tr>';
  }
  function voucherImageUrl(v) {
    if (!v || !v.image_path) return '';
    if (/^https?:\/\//i.test(String(v.image_path))) return String(v.image_path);
    if (window.salonDatabase && typeof window.salonDatabase.getVoucherImageUrl === 'function') {
      return window.salonDatabase.getVoucherImageUrl(v.image_path);
    }
    return '';
  }

  function renderVouchers() {
    var tbody = $('voucher-table-body');
    if (!tbody) return;

    var query = String(($('voucher-search') && $('voucher-search').value) || '').trim().toLowerCase();
    var status = String(($('voucher-status-filter') && $('voucher-status-filter').value) || 'all');
    var rows = state.vouchers.filter(function(v) {
      var title = v.title_en || v.title || '';
      var matchesQuery = !query || [v.sku, title, v.title_ar].join(' ').toLowerCase().indexOf(query) !== -1;
      var matchesStatus = status === 'all' || (status === 'active' ? v.active !== false : v.active === false);
      return matchesQuery && matchesStatus;
    }).sort(function(a,b){
      var an = Number((String(a.sku||'').match(/-(\d+)$/)||[])[1] || 0);
      var bn = Number((String(b.sku||'').match(/-(\d+)$/)||[])[1] || 0);
      if (bn !== an) return bn - an;
      return String(b.created_at||'').localeCompare(String(a.created_at||''));
    });

    tbody.innerHTML = rows.map(function(v) {
      var image = voucherImageUrl(v);
      var title = v.title_en || v.title || 'Voucher';
      var arabic = v.title_ar || '';
      var prices = [];
      if (v.price_usd != null) prices.push('$' + v.price_usd);
      if (v.price_qar != null) prices.push(v.price_qar + ' QAR');

      return '<tr>' +
        '<td><div class="crm-voucher-thumb">' +
          (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(title) + '">' : '<span>◇</span>') +
        '</div></td>' +
        '<td><strong>' + escapeHtml(v.sku || '') + '</strong></td>' +
        '<td><strong>' + escapeHtml(title) + '</strong>' +
          (arabic ? '<br><span class="crm-small">' + escapeHtml(arabic) + '</span>' : '') +
        '</td>' +
        '<td>' + escapeHtml(prices.join(' · ') || '—') + '</td>' +
        '<td>' + escapeHtml(v.duration_minutes || 30) + ' min</td>' +
        '<td>' + (v.active !== false ? '<span class="crm-badge active">Active</span>' : '<span class="crm-badge inactive">Inactive</span>') + '</td>' +
        '<td><div class="crm-actions-inline">' +
          (can('vouchers','update') ? '<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-edit-voucher="' + escapeHtml(v.id) + '">Edit</button>' : '') +
          (can('vouchers','delete') ? '<button type="button" class="crm-btn crm-btn-danger crm-btn-small" data-delete-voucher="' + escapeHtml(v.id) + '">Delete</button>' : '') +
        '</div></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="7" class="crm-empty">No vouchers found.</td></tr>';
  }

  function nextVoucherSequence() {
    var max=0;
    state.vouchers.forEach(function(v){
      var match=String(v.sku||'').match(/-(\d+)$/);
      if(match) max=Math.max(max,Number(match[1])||0);
    });
    return max+1;
  }
  function generateVoucherSku() {
    if(state.editingVoucherId) return;
    var seq=nextVoucherSequence();
    var sku='V-'+String(seq).padStart(3,'0');
    var used=state.vouchers.some(function(v){return String(v.sku||'').toLowerCase()===sku.toLowerCase();});
    while(used){seq++;sku='V-'+String(seq).padStart(3,'0');used=state.vouchers.some(function(v){return String(v.sku||'').toLowerCase()===sku.toLowerCase();});}
    $('voucher-sku').value=sku;
  }

  function resetVoucherForm() {
    state.editingVoucherId = null;
    var form = $('voucher-form');
    if (form) form.reset();
    $('voucher-form-title').textContent = 'Add Voucher';
    $('voucher-save').textContent = 'Add Voucher';
    $('voucher-active').checked = true;
    $('voucher-duration').value = 30;
    $('voucher-sku').readOnly = true;
    generateVoucherSku();
    $('voucher-current-image').innerHTML = '<div class="crm-image-empty">No image uploaded</div>';
    $('voucher-image-file').value = '';
    $('voucher-image-delete').classList.add('crm-hidden');
  }

  function editVoucher(id) {
    var v = state.vouchers.find(function(x){ return String(x.id) === String(id); });
    if (!v) return;

    state.editingVoucherId = v.id;
    $('voucher-form-title').textContent = 'Edit Voucher';
    $('voucher-save').textContent = 'Save Changes';
    $('voucher-sku').value = v.sku || ''; $('voucher-sku').readOnly = true;
    $('voucher-title-en').value = v.title_en || v.title || '';
    $('voucher-title-ar').value = v.title_ar || '';
    $('voucher-price-usd').value = v.price_usd == null ? '' : v.price_usd;
    $('voucher-price-qar').value = v.price_qar == null ? '' : v.price_qar;
    $('voucher-duration').value = v.duration_minutes || 30;
    $('voucher-active').checked = v.active !== false;
    $('voucher-image-file').value = '';

    var image = voucherImageUrl(v);
    $('voucher-current-image').innerHTML = image
      ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(v.title_en || 'Voucher') + '"><span>Current image</span>'
      : '<div class="crm-image-empty">No image uploaded</div>';
    $('voucher-image-delete').classList.toggle('crm-hidden', !v.image_path);

    $('voucher-form-card').classList.remove('crm-hidden');
    $('voucher-title-en').focus();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function getVoucherFileExtension(file) {
    var name = file && file.name ? file.name : '';
    var match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    var ext = match ? match[1] : 'jpg';
    return ['jpg','jpeg','png','webp','gif','avif'].indexOf(ext) >= 0 ? ext : 'jpg';
  }

  async function uploadVoucherImage(voucherId, file) {
    if (!file) return null;
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type || '')) {
      throw new Error('Please choose a JPG, PNG, WebP, GIF or AVIF image.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Voucher images must be 5 MB or smaller.');
    }

    var ext = getVoucherFileExtension(file);
    var token = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    var path = String(voucherId) + '/' + token + '.' + ext;

    var upload = await window.salonSupabase.storage
      .from('vouchers')
      .upload(path, file, {upsert:false, contentType:file.type || 'image/jpeg', cacheControl:'3600'});
    if (upload.error) throw upload.error;

    return path;
  }

  async function deleteVoucherStorageImage(imagePath) {
    if (!imagePath || /^https?:\/\//i.test(String(imagePath)) || /^assets\//i.test(String(imagePath))) return;
    var result = await window.salonSupabase.storage.from('vouchers').remove([String(imagePath)]);
    if (result.error) throw result.error;
  }

  function previewVoucherImageFile() {
    var file = $('voucher-image-file').files[0];
    var preview = $('voucher-current-image');
    if (!file) return;

    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type || '')) {
      preview.innerHTML = '<div class="crm-image-empty">Unsupported image type</div>';
      return;
    }

    var url = URL.createObjectURL(file);
    preview.innerHTML = '<img src="' + escapeHtml(url) + '" alt="New voucher image"><span>New image</span>';
  }

  async function saveVoucher(e) {
    if(!requirePermission('vouchers', state.editingVoucherId?'update':'create')) return;
    e.preventDefault();
    clearMessage();

    var payload = {
      sku: $('voucher-sku').value.trim(),
      title_en: $('voucher-title-en').value.trim(),
      title_ar: $('voucher-title-ar').value.trim() || null,
      price_usd: $('voucher-price-usd').value === '' ? null : Number($('voucher-price-usd').value),
      price_qar: $('voucher-price-qar').value === '' ? null : Number($('voucher-price-qar').value),
      duration_minutes: Math.max(1, Number($('voucher-duration').value || 30)),
      active: $('voucher-active').checked
    };

    if (!payload.sku || !payload.title_en) {
      message('Please enter the voucher SKU and English title.', 'error');
      return;
    }

    var file = $('voucher-image-file').files[0] || null;
    var existing = state.editingVoucherId
      ? state.vouchers.find(function(v){ return String(v.id) === String(state.editingVoucherId); })
      : null;

    var button = $('voucher-save');
    button.disabled = true;
    button.textContent = 'Saving…';

    try {
      var saved;

      if (state.editingVoucherId) {
        /*
         * Do not rely on UPDATE ... SELECT returning the row.
         * PostgREST can legally return an empty representation even when the
         * UPDATE itself succeeded (especially with an older/legacy table and
         * multiple RLS SELECT policies). We have already verified admin access
         * separately, so perform the write first and then read the row back.
         */
        // Voucher edits go through a dedicated, authorization-checked RPC.
        // This keeps the CRM edit path deterministic and avoids relying on a
        // browser PATCH being evaluated by a stale/mismatched RLS policy.
        var updateResult = await window.salonSupabase.rpc('crm_update_voucher', {
          p_id: state.editingVoucherId,
          p_sku: payload.sku,
          p_title_en: payload.title_en,
          p_title_ar: payload.title_ar,
          p_price_usd: payload.price_usd,
          p_price_qar: payload.price_qar,
          p_duration_minutes: payload.duration_minutes,
          p_active: payload.active
        });

        if (updateResult.error) throw updateResult.error;
        if (!Array.isArray(updateResult.data) || !updateResult.data.length) {
          throw new Error('The voucher could not be updated. The voucher may no longer exist or your CRM account is not authorized.');
        }

        saved = updateResult.data[0];
      } else {
        // Voucher creation goes through the same permission-checked RPC path
        // as edits/deletes. This avoids relying on a browser INSERT RLS policy
        // and keeps custom CRM roles working correctly.
        var insertResult = await window.salonSupabase.rpc('crm_create_voucher', {
          p_sku: payload.sku,
          p_title_en: payload.title_en,
          p_title_ar: payload.title_ar,
          p_price_usd: payload.price_usd,
          p_price_qar: payload.price_qar,
          p_duration_minutes: payload.duration_minutes,
          p_active: payload.active
        });

        if (insertResult.error) throw insertResult.error;
        if (!Array.isArray(insertResult.data) || !insertResult.data.length) {
          throw new Error('The voucher could not be created.');
        }

        saved = insertResult.data[0];
      }
      var oldImage = existing && existing.image_path ? existing.image_path : null;

      if (file) {
        // Storage upload and the database reference are two separate writes.
        // PostgREST can return no error when an UPDATE matches zero rows, so
        // request the updated row and verify that the image_path was actually
        // written before reporting success.
        var newPath = await uploadVoucherImage(saved.id, file);
        var imageUpdate = await window.salonSupabase.rpc('crm_set_voucher_image_path', {
          p_id: saved.id,
          p_image_path: newPath
        });

        if (imageUpdate.error) {
          try { await deleteVoucherStorageImage(newPath); } catch (_) {}
          throw imageUpdate.error;
        }

        if (!Array.isArray(imageUpdate.data) || !imageUpdate.data.length || imageUpdate.data[0].image_path !== newPath) {
          try { await deleteVoucherStorageImage(newPath); } catch (_) {}
          throw new Error(
            'The image was uploaded, but the voucher record could not be updated. Check the voucher permissions.'
          );
        }

        if (oldImage && oldImage !== newPath) {
          try {
            await deleteVoucherStorageImage(oldImage);
          } catch (cleanupError) {
            console.warn('Could not delete previous voucher image:', cleanupError);
          }
        }

        // Keep the local object consistent until loadVouchers() refreshes it.
        saved.image_path = newPath;
      }

      state.editingVoucherId = null;
      $('voucher-form-card').classList.add('crm-hidden');
      await loadVouchers();
      message('Voucher saved successfully.', 'success');
    } catch (err) {
      console.error('Could not save voucher:', err);
      message(err.message || 'Could not save voucher.', 'error');
    } finally {
      button.disabled = false;
      button.textContent = state.editingVoucherId ? 'Save Changes' : 'Add Voucher';
    }
  }

  async function loadVouchers() {
    // The CRM must see both active and inactive vouchers. The public website
    // intentionally sees only active vouchers, so the CRM uses a dedicated
    // permission-checked RPC instead of the public/RLS SELECT path.
    var result = await window.salonSupabase.rpc('crm_list_vouchers');

    if (result.error) throw result.error;

    state.vouchers = (result.data || []).slice().sort(crmSkuDesc);
    state.bookingVouchers = state.vouchers.slice();
    renderVouchers();
    updateDashboard();
  }

  async function deleteVoucherImage() {
    if (!state.editingVoucherId) return;
    var voucher = state.vouchers.find(function(v){ return String(v.id) === String(state.editingVoucherId); });
    if (!voucher || !voucher.image_path) return;

    if (!window.confirm('Remove this voucher image?')) return;

    try {
      var imagePath = voucher.image_path;

      // Clear the database reference first. Only remove the storage object
      // after the row has been updated successfully.
      var result = await window.salonSupabase.rpc('crm_set_voucher_image_path', {
        p_id: voucher.id,
        p_image_path: null
      });

      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || !result.data.length || result.data[0].image_path !== null) {
        throw new Error(
          'The voucher image could not be removed from the database. Check the vouchers UPDATE RLS policy.'
        );
      }

      try {
        await deleteVoucherStorageImage(imagePath);
      } catch (storageError) {
        // The database is already correct; keep the warning visible in the
        // console so an orphaned object can be cleaned up later if necessary.
        console.warn('Voucher image record cleared, but storage cleanup failed:', storageError);
      }

      await loadVouchers();
      editVoucher(voucher.id);
      message('Voucher image removed.', 'success');
    } catch (err) {
      console.error('Could not remove voucher image:', err);
      message(err.message || 'Could not remove voucher image.', 'error');
    }
  }

  async function deleteVoucher(id) {
    if(!requirePermission('vouchers','delete')) return;
    var voucher = state.vouchers.find(function(v){ return String(v.id) === String(id); });
    if (!voucher) return;

    var title = voucher.title_en || voucher.title || voucher.sku || 'this voucher';
    if (!window.confirm('Delete "' + title + '"? This cannot be undone.')) return;

    try {
      if (voucher.image_path) {
        try { await deleteVoucherStorageImage(voucher.image_path); }
        catch (imageError) { console.warn('Could not delete voucher image:', imageError); }
      }

      var result = await window.salonSupabase.rpc('crm_delete_voucher', {
        p_id: id
      });
      if (result.error) throw result.error;
      if (!Array.isArray(result.data) || !result.data.length) {
        throw new Error('The voucher could not be deleted. It may no longer exist.');
      }

      await loadVouchers();
      $('voucher-form-card').classList.add('crm-hidden');
      message('Voucher deleted.', 'success');
    } catch (err) {
      console.error('Could not delete voucher:', err);
      message(err.message || 'Could not delete voucher.', 'error');
    }
  }

  function syncUserRoleFilter(){
    var select=$('user-role-filter'); if(!select)return;
    var current=select.value||state.userRoleFilter||'all';
    select.innerHTML='<option value="all">All roles</option>'+state.roles.slice().sort(function(a,b){ return crmDesc(a.name,b.name); }).map(function(r){return '<option value="'+escapeHtml(r.id)+'">'+escapeHtml(r.name)+'</option>';}).join('');
    select.value=(current==='all'||state.roles.some(function(r){return String(r.id)===String(current);}))?current:'all';
  }
  function renderUsers() {
    var body=$('users-table-body'); if(!body)return;
    var q=String(($('user-search')&&$('user-search').value)||state.userSearch||'').trim().toLowerCase();
    var role=String(($('user-role-filter')&&$('user-role-filter').value)||state.userRoleFilter||'all');
    var statusFilter=String(($('user-status-filter')&&$('user-status-filter').value)||state.userStatusFilter||'all');
    var rows=state.users.filter(function(u){
      var roleName=roleNameById(u.role_id,u.role);
      var matchesQuery=!q || [u.full_name,u.email,roleName].join(' ').toLowerCase().indexOf(q)!==-1;
      var matchesRole=role==='all' || String(u.role_id)===role;
      var active=u.active!==false;
      var matchesStatus=statusFilter==='all' || (statusFilter==='active'?active:!active);
      return matchesQuery && matchesRole && matchesStatus;
    }).sort(function(a,b){ return crmDateDesc(a.created_at,b.created_at) || crmDesc(a.full_name,b.full_name); });
    body.innerHTML=rows.map(function(u){
      var roleName=roleNameById(u.role_id, u.role);
      var status=u.active!==false;
      var isSelf=state.currentUserId && String(u.user_id)===String(state.currentUserId);
      var auth=state.authStatuses[String(u.user_id)]||{};
      var verified=!!auth.email_confirmed_at;
      var loggedIn=!!auth.last_sign_in_at;
      var verificationHtml=verified ? '<span class="crm-badge active">Verified</span>' : '<span class="crm-badge inactive">Not verified</span>';
      var loginHtml=loggedIn ? '<span class="crm-small">Last login: '+escapeHtml(new Date(auth.last_sign_in_at).toLocaleString())+'</span>' : '<span class="crm-small">Never logged in</span>';
      return '<tr><td><strong>'+escapeHtml(u.full_name||'CRM user')+'</strong><br><span class="crm-small">'+(isSelf?'You':'CRM team member')+'</span></td><td>'+escapeHtml(u.email||'—')+'</td>'+
      '<td><span class="crm-role-badge">'+escapeHtml(roleName)+'</span></td>'+
      '<td>'+(status?'<span class="crm-badge active">Active</span>':'<span class="crm-badge inactive">Inactive</span>')+'<br>'+verificationHtml+'<br>'+loginHtml+'</td>'+
      '<td>'+escapeHtml(u.created_at?new Date(u.created_at).toLocaleDateString():'—')+'</td><td><div class="crm-actions-inline"><button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-edit-user="'+escapeHtml(u.user_id)+'">Edit</button>'+
      (isSelf?'':'<button type="button" class="crm-btn '+(status?'crm-btn-danger':'crm-btn-secondary')+' crm-btn-small" data-toggle-user="'+escapeHtml(u.user_id)+'">'+(status?'Deactivate':'Activate')+'</button>')+
      (!isSelf && can('users','update') ? '<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-reset-password="'+escapeHtml(u.user_id)+'">Reset password</button>' : '')+
      (can('users','delete') && !isSelf ? '<button type="button" class="crm-btn crm-btn-danger crm-btn-small" data-delete-user="'+escapeHtml(u.user_id)+'">Delete</button>' : '')+
      '</div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="crm-empty">No CRM users found.</td></tr>';
  }
  async function updateDashboard() {
    var active=state.services.filter(function(s){return s.active!==false;}).length;
    $('stat-services').textContent=active;
    $('stat-categories').textContent=state.categories.filter(function(c){return c.active!==false;}).length+' categories';
    $('stat-vouchers') && ($('stat-vouchers').textContent=state.vouchers.filter(function(v){return v.active!==false;}).length);
    $('stat-users') && ($('stat-users').textContent=state.users.length);
    $('stat-bookings') && ($('stat-bookings').textContent=state.bookings.length);

    // Keep the dashboard count independent from whether the customer page
    // has been opened first.
    var customerStat=$('stat-customers');
    if(customerStat && can('customers','read')){
      try{
        var customerResult=await window.salonSupabase
          .from('customers')
          .select('id',{count:'exact',head:true})
          .eq('is_deleted', false);
        if(customerResult.error) throw customerResult.error;
        customerStat.textContent=String(customerResult.count||0);
      }catch(e){
        // If the count request fails, use already-loaded customer records
        // when available rather than replacing the card with an error.
        customerStat.textContent=String(state.customers.length||0);
        console.warn('Could not load customer count for dashboard:',e);
      }
    }
  }
  function populateCategorySelect() {
    $('service-category').innerHTML=state.categories.map(function(c){return '<option value="'+c.id+'">'+escapeHtml(c.name_en)+'</option>';}).join('');
  }
  function serviceSkuPrefix(categoryName) {
    var words=String(categoryName||'').trim().match(/[A-Za-z0-9]+/g)||[];
    if(!words.length) return '';
    if(words.length===1) return words[0].charAt(0).toUpperCase();
    return words.map(function(word){return word.charAt(0).toUpperCase();}).join('');
  }
  function nextServiceSequence(categoryId) {
    var category=state.categories.find(function(c){return String(c.id)===String(categoryId);});
    var prefix=serviceSkuPrefix(category && category.name_en);
    var max=0;
    state.services.forEach(function(s){
      if(String(s.category_id)!==String(categoryId)) return;
      var match=String(s.sku||'').match(/^([A-Z0-9]+)-(\d+)$/i);
      if(!match || String(match[1]).toUpperCase()!==String(prefix).toUpperCase()) return;
      max=Math.max(max,Number(match[2])||0);
    });
    return max+1;
  }
  function generateServiceSku() {
    if(state.editingServiceId) return;
    var categoryId=$('service-category').value;
    var category=state.categories.find(function(c){return String(c.id)===String(categoryId);});
    var prefix=serviceSkuPrefix(category && category.name_en);
    if(!categoryId || !prefix){
      $('service-sku').value='';
      return;
    }
    var sequence=nextServiceSequence(categoryId);
    var sku=prefix+'-'+String(sequence).padStart(3,'0');
    var existing=state.services.some(function(s){return String(s.category_id)===String(categoryId) && String(s.sku||'').toLowerCase()===sku.toLowerCase();});
    while(existing){sequence++;sku=prefix+'-'+String(sequence).padStart(3,'0');existing=state.services.some(function(s){return String(s.category_id)===String(categoryId) && String(s.sku||'').toLowerCase()===sku.toLowerCase();});}
    $('service-sku').value=sku;
  }
  function resetServiceForm(){
    applyRoleVisibility();state.editingServiceId=null;$('service-form').reset();$('service-form-title').textContent='Add Service';$('service-save').textContent='Add Service';populateCategorySelect();$('service-sku').readOnly=true;generateServiceSku();}
  function editService(id){
    var s=state.services.find(function(x){return String(x.id)===String(id);}); if(!s)return;
    state.editingServiceId=s.id; applyRoleVisibility(); $('service-form-title').textContent='Edit Service';$('service-save').textContent='Save Changes';$('service-sku').readOnly=true;
    $('service-category').value=s.category_id||'';$('service-sku').value=s.sku||'';$('service-name-en').value=s.name_en||'';$('service-name-ar').value=s.name_ar||'';
    $('service-description-en').value=s.description_en||'';$('service-description-ar').value=s.description_ar||'';
    $('service-price-usd').value=s.price_usd==null?'':s.price_usd;$('service-price-qar').value=s.price_qar==null?'':s.price_qar;
    $('service-duration').value=s.duration_minutes==null?30:s.duration_minutes;$('service-sort').value=s.sort_order||0;$('service-active').checked=s.active!==false;
    showView('services'); window.scrollTo({top:0,behavior:'smooth'});
  }
  async function saveService(e){
    if(!requirePermission('services', state.editingServiceId?'update':'create')) return;
    e.preventDefault(); clearMessage();
    var usd=$('service-price-usd').value;
    if(!state.editingServiceId) generateServiceSku();
    var sku=$('service-sku').value.trim();
    var qar=$('service-price-qar').value;
    var payload={category_id:Number($('service-category').value),sku:sku,name_en:$('service-name-en').value.trim(),name_ar:$('service-name-ar').value.trim(),
      description_en:$('service-description-en').value.trim()||null,description_ar:$('service-description-ar').value.trim()||null,price:usd===''?(qar===''?0:Number(qar)):Number(usd),
      price_usd:usd===''?null:Number(usd),price_qar:qar===''?null:Number(qar),
      duration_minutes:$('service-duration').value===''?30:Number($('service-duration').value),sort_order:Number($('service-sort').value||0),active:$('service-active').checked};
    if(!sku||!payload.name_en||!payload.name_ar||!payload.category_id){message('Please enter the SKU, English name, Arabic name and category.','error');return;}
    if(usd==='' && qar===''){message('Enter at least one price: USD or QAR.','error');return;}
    var duplicate=state.services.some(function(existing){return String(existing.id)!==String(state.editingServiceId||'') && String(existing.category_id)===String(payload.category_id) && String(existing.sku||'').trim().toLowerCase()===sku.toLowerCase();});
    if(duplicate){message('This service SKU already exists in this category.','error');return;}
    var result=state.editingServiceId?await window.salonSupabase.from('services').update(payload).eq('id',state.editingServiceId):await window.salonSupabase.from('services').insert(payload);
    if(result.error){
      var msg=result.error.message||'Could not save service.';
      if(result.error.code==='23505') msg='This service SKU already exists in this category.';
      if(result.error.code==='23514') msg='Enter at least one price: USD or QAR.';
      message(msg,'error');return;
    } message(state.editingServiceId?'Service updated.':'Service added.','success');resetServiceForm();await loadData();
  }
  function renderCategoryImagePreview(url) {
    var wrap=$('category-image-preview-wrap');
    var img=$('category-image-preview');
    if(!wrap||!img)return;
    if(url){
      img.src=url; img.hidden=false;
      img.onerror=function(){img.removeAttribute('src');img.hidden=true;};
    }else{
      img.removeAttribute('src'); img.hidden=true;
    }
  }

  function categoryStoragePathFromUrl(url) {
    if(!url || !/^https?:\/\//i.test(String(url))) return '';
    try {
      var parsed=new URL(String(url));
      var marker='/storage/v1/object/public/site-assets/';
      var index=parsed.pathname.indexOf(marker);
      return index===0 ? decodeURIComponent(parsed.pathname.slice(marker.length)) : '';
    } catch(e) { return ''; }
  }

  async function uploadCategoryImage(file) {
    if(!file) return null;
    if(!/^image\//i.test(file.type)) throw new Error('Please choose an image file.');
    if(file.size>5*1024*1024) throw new Error('Category image must be 5 MB or smaller.');
    var ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!/^(jpg|jpeg|png|webp|gif|avif)$/.test(ext)) ext='jpg';
    var path='categories/category-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
    var upload=await window.salonSupabase.storage.from('site-assets').upload(path,file,{upsert:false,contentType:file.type||undefined});
    if(upload.error) throw upload.error;
    var publicUrlResult=window.salonSupabase.storage.from('site-assets').getPublicUrl(path);
    var publicUrl=publicUrlResult&&publicUrlResult.data?publicUrlResult.data.publicUrl:'';
    if(!publicUrl){
      await window.salonSupabase.storage.from('site-assets').remove([path]);
      throw new Error('Could not create a public URL for the category image.');
    }
    return {path:path,url:publicUrl};
  }

  function editCategory(id){
    var c=state.categories.find(function(x){return String(x.id)===String(id);});if(!c)return;
    state.editingCategoryId=c.id; applyRoleVisibility();$('category-form-title').textContent='Edit Category';$('category-save').textContent='Save Changes';
    $('category-name-en').value=c.name_en||'';$('category-name-ar').value=c.name_ar||'';$('category-description-en').value=c.description_en||'';$('category-description-ar').value=c.description_ar||'';
    $('category-image-file').value='';renderCategoryImagePreview(c.image_url||'');$('category-width').value=c.image_width==null?'':c.image_width;$('category-height').value=c.image_height==null?'':c.image_height;$('category-sort').value=c.sort_order||0;$('category-active').checked=c.active!==false;
    showView('services');window.scrollTo({top:0,behavior:'smooth'});
  }
  async function deleteService(id){
    if(!requirePermission('services','delete')) return;
    var s=state.services.find(function(x){return String(x.id)===String(id);});
    if(!s) return;
    if(!window.confirm('Delete service "'+(s.name_en||s.sku||'this service')+'"? This cannot be undone.')) return;
    try{
      var refs=await window.salonSupabase.from('booking_services').select('id',{count:'exact',head:true}).eq('service_id',id);
      if(refs.error) throw refs.error;
      if((refs.count||0)>0){message('This service is already used in bookings. Delete is blocked; deactivate the service instead.','error');return;}
      var result=await window.salonSupabase.from('services').delete().eq('id',id);
      if(result.error) throw result.error;
      message('Service deleted.','success');
      await loadData();
    }catch(err){
      console.error('Could not delete service:',err);
      message(err.message||'Could not delete service.','error');
    }
  }

  async function deleteCategory(id){
    if(!requirePermission('services','delete')) return;
    var c=state.categories.find(function(x){return String(x.id)===String(id);});
    if(!c) return;
    if(!window.confirm('Delete category "'+(c.name_en||'this category')+'"? You must delete all services in this category first.')) return;
    try{
      var refs=await window.salonSupabase.from('services').select('id',{count:'exact',head:true}).eq('category_id',id);
      if(refs.error) throw refs.error;
      if((refs.count||0)>0){message('This category still contains services. Delete those services first, then delete the category.','error');return;}
      var result=await window.salonSupabase.from('service_categories').delete().eq('id',id);
      if(result.error) throw result.error;
      message('Category deleted.','success');
      await loadData();
    }catch(err){
      console.error('Could not delete category:',err);
      message(err.message||'Could not delete category.','error');
    }
  }

  function resetCategoryForm(){
    applyRoleVisibility();state.editingCategoryId=null;$('category-form').reset();$('category-form-title').textContent='Add Category';$('category-save').textContent='Add Category';$('category-active').checked=true;renderCategoryImagePreview('');
  }
  async function saveCategory(e){
    if(!requirePermission('services', state.editingCategoryId?'update':'create')) return;
    e.preventDefault();clearMessage();
    var editing=state.editingCategoryId?state.categories.find(function(x){return String(x.id)===String(state.editingCategoryId);}):null;
    var fileInput=$('category-image-file');
    var file=fileInput&&fileInput.files?fileInput.files[0]:null;
    var payload={name_en:$('category-name-en').value.trim(),name_ar:$('category-name-ar').value.trim(),description_en:$('category-description-en').value.trim()||null,description_ar:$('category-description-ar').value.trim()||null,
      image_url:editing&&editing.image_url?editing.image_url:null,image_width:$('category-width').value===''?null:Number($('category-width').value),image_height:$('category-height').value===''?null:Number($('category-height').value),sort_order:Number($('category-sort').value||0),active:$('category-active').checked};
    if(!payload.name_en||!payload.name_ar){message('Please enter the English and Arabic category names.','error');return;}

    var uploaded=null;
    try {
      if(file) uploaded=await uploadCategoryImage(file);
      if(uploaded) payload.image_url=uploaded.url;

      var result=state.editingCategoryId
        ? await window.salonSupabase.from('service_categories').update(payload).eq('id',state.editingCategoryId)
        : await window.salonSupabase.from('service_categories').insert(payload);
      if(result.error) throw result.error;
    } catch(err) {
      if(uploaded&&uploaded.path) await window.salonSupabase.storage.from('site-assets').remove([uploaded.path]);
      message(err.message||'Could not save category.','error');
      return;
    }

    if(uploaded&&editing&&editing.image_url){
      var oldPath=categoryStoragePathFromUrl(editing.image_url);
      if(oldPath){
        var cleanup=await window.salonSupabase.storage.from('site-assets').remove([oldPath]);
        if(cleanup.error) console.warn('Category saved, but the old category image could not be removed:',cleanup.error);
      }
    }
    message(state.editingCategoryId?'Category updated.':'Category added.','success');
    resetCategoryForm();
    await loadData();
  }


  function bookingStore() {
    try {
      var raw = localStorage.getItem('salonTestBookings');
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  async function loadBookings() {
    /*
     * Current booking schema:
     *   bookings      -> customer_id, total_price, total_duration_minutes
     *   customers     -> name, phone, email, notes
     *   booking_services -> one row per booked item, with either service_id
     *                        or voucher_id
     *
     * Do not query the old JSON/items/customer_name columns here.
     */
    var dbBookings = null;
    try {
      var results = await Promise.all([
        window.salonSupabase
          .from('bookings')
          .select('id,booking_date,start_time,end_time,status,total_price,total_duration_minutes,customer_id,customer_notes,created_at,public_reference')
          .order('created_at',{ascending:false}),
        window.salonSupabase
          .from('customers')
          .select('id,name,phone,email,notes'),
        window.salonSupabase
          .from('booking_services')
          .select('id,booking_id,service_id,staff_id,start_time,end_time,price,duration_minutes,voucher_id')
          .order('start_time',{ascending:true})
      ]);

      var bookingsResult = results[0];
      var customersResult = results[1];
      var bookingServicesResult = results[2];

      if (bookingsResult.error) throw bookingsResult.error;
      if (customersResult.error) throw customersResult.error;
      if (bookingServicesResult.error) throw bookingServicesResult.error;

      var customersById = {};
      (customersResult.data || []).forEach(function(customer) {
        customersById[String(customer.id)] = customer;
      });

      var servicesById = {};
      state.services.forEach(function(service) {
        servicesById[String(service.id)] = service;
      });

      var vouchersById = {};
      state.vouchers.forEach(function(voucher) {
        vouchersById[String(voucher.id)] = voucher;
      });

      var itemsByBooking = {};
      (bookingServicesResult.data || []).forEach(function(row) {
        var service = row.service_id != null ? servicesById[String(row.service_id)] : null;
        var voucher = row.voucher_id != null ? vouchersById[String(row.voucher_id)] : null;

        var item = {
          id: row.id,
          serviceId: row.service_id,
          voucherId: row.voucher_id,
          serviceSku: service ? (service.sku || '') : '',
          voucherSku: voucher ? (voucher.sku || '') : '',
          start: String(row.start_time || '').slice(0,5),
          end: String(row.end_time || '').slice(0,5),
          price: row.price,
          duration_minutes: row.duration_minutes,
          serviceName: service ? (service.name_en || service.name || '') : '',
          voucherName: voucher ? (voucher.title_en || voucher.title || '') : ''
        };

        if (!itemsByBooking[String(row.booking_id)]) itemsByBooking[String(row.booking_id)] = [];
        itemsByBooking[String(row.booking_id)].push(item);
      });

      dbBookings = (bookingsResult.data || []).map(function(row) {
        var customer = row.customer_id != null
          ? (customersById[String(row.customer_id)] || null)
          : null;

        var items = itemsByBooking[String(row.id)] || [];
        items.sort(function(a,b) {
          return a.start.localeCompare(b.start);
        });

        return {
          id: String(row.id),
          databaseId: row.id,
          publicReference: row.public_reference || '',
          date: row.booking_date,
          start_time: row.start_time,
          end_time: row.end_time,
          status: String(row.status || 'pending').toLowerCase(),
          total: row.total_price,
          total_duration_minutes: row.total_duration_minutes,
          currency: 'USD',
          customer: {
            id: row.customer_id,
            name: customer ? (customer.name || 'Customer') : 'Customer',
            phone: customer ? (customer.phone || '') : '',
            email: customer ? (customer.email || '') : '',
            // Keep the public end-user booking comment separate from the
            // customer's internal CRM notes.
            notes: customer ? (customer.notes || '') : '',
            bookingComment: row.customer_notes || ''
          },
          items: items,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      });
    } catch (e) {
      console.warn('Could not load bookings; using browser-local cache only.', e);
      dbBookings = null;
    }

    var local = bookingStore();
    state.bookingVouchers = state.vouchers.slice();
    var source = dbBookings !== null ? dbBookings : local;
    state.bookings = source.slice().sort(function(a,b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    renderBookings();
    updateBookingDashboardStat();
  }

  function bookingStatus(b) {
    return String(b.status || 'pending').toLowerCase();
  }

  function bookingStart(b) {
    return b.items && b.items[0] ? b.items[0].start : '';
  }

  function bookingEnd(b) {
    if (!b.items || !b.items.length) return '';
    return b.items[b.items.length - 1].end || '';
  }

  function bookingDateTime(b) {
    var date = b.date || '';
    var start = bookingStart(b);
    return date ? new Date(date + 'T' + (start || '00:00') + ':00') : null;
  }

  function bookingCustomer(b) {
    return b.customer || { name: b.name || 'Customer', phone: b.phone || '', email: b.email || '', notes: b.notes || '' };
  }

  function serviceForBookingItem(item) {
    var voucher = item && item.voucherId != null
      ? state.bookingVouchers.find(function(v){ return String(v.id) === String(item.voucherId); })
      : null;
    if (!voucher && item && item.voucherSku) {
      voucher = state.bookingVouchers.find(function(v){ return String(v.sku || '') === String(item.voucherSku); });
    }
    if (voucher) return {
      name: voucher.title_en || voucher.title || item.voucherSku || 'Voucher',
      duration: voucher.duration_minutes || voucher.durationMinutes || item.duration_minutes || 30,
      price: voucher.price_usd != null ? voucher.price_usd : (voucher.price != null ? voucher.price : item.price),
      voucher: true
    };

    var found = item && item.serviceId != null
      ? state.services.find(function(s){ return String(s.id) === String(item.serviceId); })
      : null;
    if (!found && item && item.serviceSku) {
      found = state.services.find(function(s){ return String(s.sku || '') === String(item.serviceSku); });
    }
    if (found) return {
      name: found.name_en || found.name || item.serviceSku || 'Service',
      duration: found.duration_minutes || item.duration_minutes,
      price: found.price_usd != null ? found.price_usd : (found.price != null ? found.price : item.price)
    };

    return { name: (item && (item.voucherName || item.serviceName || item.voucherSku || item.serviceSku)) || 'Service', duration: item ? item.duration_minutes : null, price: item ? item.price : null };
  }

  function bookingServiceNames(b) {
    return (b.items || []).map(function(item){ return serviceForBookingItem(item).name; });
  }

  function bookingMoney(b) {
    if (b.total == null || b.total === '') return '—';
    return escapeHtml(String(b.total)) + ' ' + escapeHtml(b.currency === 'QAR' ? 'QAR' : '$');
  }

  function statusLabel(status) {
    var s = bookingStatus({status: status});
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function bookingMatches(b) {
    var status = bookingStatus(b);
    var selectedStatus = state.bookingFilter;
    if (selectedStatus !== 'all' && status !== selectedStatus) return false;
    var now = new Date(); now.setHours(0,0,0,0);
    var d = b.date ? new Date(b.date + 'T12:00:00') : null;
    if (state.bookingDateFilter === 'today' && (!d || d.toDateString() !== now.toDateString())) return false;
    if (state.bookingDateFilter === 'upcoming' && (!d || d < now)) return false;
    if (state.bookingDateFilter === 'past' && (!d || d >= now)) return false;
    var q = state.bookingSearch.trim().toLowerCase();
    if (q) {
      var c = bookingCustomer(b);
      var hay = [b.id, c.name, c.phone, c.email].concat(bookingServiceNames(b)).join(' ').toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }


  function pad2(n){ return String(n).padStart(2,'0'); }
  function dateKey(d){ return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
  function parseTimeMinutes(t){
    if(!t) return null;
    var p=String(t).split(':'); var h=Number(p[0]), m=Number(p[1]||0);
    return isNaN(h)||isNaN(m)?null:h*60+m;
  }
  function formatTime12(t){
    var mins=parseTimeMinutes(t); if(mins==null)return '—';
    var h=Math.floor(mins/60), m=mins%60, ap=h>=12?'PM':'AM', hh=h%12||12;
    return hh+':'+pad2(m)+' '+ap;
  }
  function startOfWeek(d){
    var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    var day=x.getDay(); x.setDate(x.getDate()-day); return x;
  }
  function sameDay(a,b){ return dateKey(a)===dateKey(b); }

  function scheduleVisibleBookings(){
    return state.bookings.filter(bookingMatches).filter(function(b){ return !!b.date && !!bookingStart(b); });
  }


  function bookingRange(b) {
    var start = parseTimeMinutes(bookingStart(b));
    var end = parseTimeMinutes(bookingEnd(b));
    if (start == null) return null;
    if (end == null || end <= start) end = start + 30;
    return {start:start,end:end};
  }

  function isBlockingStatus(b) {
    // Only confirmed appointments reserve time on the public calendar.
    // Pending requests are requests, not reservations.
    return bookingStatus(b) === 'confirmed';
  }

  function overlaps(a,b) {
    return a && b && a.start < b.end && b.start < a.end;
  }

  function dayBookings(date) {
    return state.bookings.filter(function(b){
      return b.date === date && !!bookingRange(b) && bookingStatus(b) !== 'cancelled';
    }).sort(function(a,b){ return bookingRange(a).start - bookingRange(b).start; });
  }

  function hasBlockingOverlap(candidate, ignoreId) {
    var range = bookingRange(candidate);
    if (!range) return null;
    return state.bookings.find(function(b){
      if (ignoreId != null && String(b.id) === String(ignoreId)) return false;
      if (b.date !== candidate.date || !isBlockingStatus(b)) return false;
      return overlaps(range, bookingRange(b));
    }) || null;
  }

  function freeIntervalsForDay(date, hourStart, hourEnd) {
    var booked = dayBookings(date).filter(function(b){ return isBlockingStatus(b); })
      .map(bookingRange).sort(function(a,b){ return a.start-b.start; });
    var result = [], cursor = hourStart * 60;
    booked.forEach(function(r){
      var start = Math.max(r.start, hourStart*60);
      var end = Math.min(r.end, hourEnd*60);
      if (end <= hourStart*60 || start >= hourEnd*60) return;
      if (start > cursor) result.push({start:cursor,end:start});
      cursor = Math.max(cursor,end);
    });
    if (cursor < hourEnd*60) result.push({start:cursor,end:hourEnd*60});
    return result;
  }

  function freeIntervalLabel(r) {
    return formatTime12(pad2(Math.floor(r.start/60))+':'+pad2(r.start%60)) + ' – ' +
           formatTime12(pad2(Math.floor(r.end/60))+':'+pad2(r.end%60));
  }

  function renderSchedule(){
    var grid=$('booking-schedule-grid'); if(!grid)return;
    var weekStart=startOfWeek(state.scheduleDate), days=[];
    for(var i=0;i<7;i++){var d=new Date(weekStart);d.setDate(weekStart.getDate()+i);days.push(d);}
    var visible=scheduleVisibleBookings(), hourStart=8, hourEnd=20, rowH=64, labelW=74;
    var cols='74px repeat(7,minmax(150px,1fr))';
    grid.style.setProperty('--schedule-cols',cols);

    // Flag overlaps for the current view.
    visible.forEach(function(b){
      var r=bookingRange(b);
      b.__crmOverlap=!!r && state.bookings.some(function(other){
        if(String(other.id)===String(b.id) || other.date!==b.date || bookingStatus(other)==='cancelled') return false;
        return overlaps(r,bookingRange(other));
      });
    });

    var head='<div class="crm-schedule-corner"><span>Time</span></div>';
    days.forEach(function(d){
      var key=dateKey(d), count=visible.filter(function(b){return b.date===key;}).length;
      var free=freeIntervalsForDay(key,hourStart,hourEnd);
      var today=sameDay(d,new Date());
      head+='<div class="crm-schedule-day-head '+(today?'is-today':'')+'">'+
        '<span>'+d.toLocaleDateString(undefined,{weekday:'short'})+'</span>'+
        '<strong>'+d.getDate()+'</strong>'+
        '<small>'+count+' '+(count===1?'booking':'bookings')+' · '+(free.length?free.length+' free':'fully booked')+'</small>'+
      '</div>';
    });

    var body='';
    for(var h=hourStart;h<hourEnd;h++){
      body+='<div class="crm-schedule-time">'+formatTime12(pad2(h)+':00')+'</div>';
      days.forEach(function(d){body+='<div class="crm-schedule-cell" data-schedule-date="'+dateKey(d)+'" style="height:'+rowH+'px"></div>';});
    }
    grid.innerHTML='<div class="crm-schedule-head" style="grid-template-columns:'+cols+'">'+head+'</div>'+
      '<div class="crm-schedule-body" style="grid-template-columns:'+cols+'">'+body+'</div>';

    var bodyEl=grid.querySelector('.crm-schedule-body');

    // Exact free windows are shown behind bookings.
    days.forEach(function(d,dayIndex){
      freeIntervalsForDay(dateKey(d),hourStart,hourEnd).forEach(function(r){
        var el=document.createElement('div');
        el.className='crm-schedule-free';
        el.style.left='calc('+labelW+'px + '+dayIndex+' * ((100% - '+labelW+'px) / 7) + 4px)';
        el.style.width='calc((100% - '+labelW+'px) / 7 - 8px)';
        el.style.top=((r.start-hourStart*60)/60*rowH)+'px';
        el.style.height=Math.max(22,(r.end-r.start)/60*rowH-4)+'px';
        el.innerHTML='<span>Available</span><small>'+escapeHtml(freeIntervalLabel(r))+'</small>';
        bodyEl.appendChild(el);
      });
    });

    visible.forEach(function(b){
      var dayIndex=days.findIndex(function(d){return b.date===dateKey(d);});
      if(dayIndex<0)return;
      var range=bookingRange(b); if(!range)return;
      var clampedStart=Math.max(range.start,hourStart*60);
      var clampedEnd=Math.min(Math.max(range.end,range.start+15),hourEnd*60);
      if(clampedEnd<=hourStart*60 || clampedStart>=hourEnd*60)return;
      var card=document.createElement('button'), c=bookingCustomer(b), names=bookingServiceNames(b), status=bookingStatus(b);
      card.type='button';
      card.className='crm-schedule-booking status-'+status+(b.__crmOverlap?' has-overlap':'');
      card.style.left='calc('+labelW+'px + '+dayIndex+' * ((100% - '+labelW+'px) / 7) + 4px)';
      card.style.width='calc((100% - '+labelW+'px) / 7 - 8px)';
      card.style.top=((clampedStart-hourStart*60)/60*rowH)+'px';
      card.style.height=Math.max(38,(clampedEnd-clampedStart)/60*rowH-4)+'px';
      card.setAttribute('data-view-booking',b.id||'');
      card.title=b.__crmOverlap?'Overlap detected — review this booking':'Open booking details';
      card.innerHTML='<span class="crm-schedule-time">'+escapeHtml(formatTime12(bookingStart(b)))+' – '+escapeHtml(formatTime12(bookingEnd(b)))+'</span>'+
        '<strong>'+escapeHtml(c.name||'Customer')+'</strong><span>'+escapeHtml(names.join(', ')||'Booking')+'</span>'+
        (b.__crmOverlap?'<em class="crm-overlap-flag">Overlap</em>':'');
      bodyEl.appendChild(card);
    });

    $('schedule-range-label').textContent=days[0].toLocaleDateString(undefined,{month:'long',day:'numeric'})+' – '+days[6].toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'});
    var conflicts=visible.filter(function(b){return b.__crmOverlap;}).length;
    $('schedule-summary').textContent=visible.length+' '+(visible.length===1?'booking':'bookings')+' this week'+(conflicts?' · '+conflicts+' overlap'+(conflicts===1?'':'s')+' to review':'');
  }

  function setBookingView(view){
    state.bookingView=view==='list'?'list':'schedule';
    document.querySelectorAll('[data-booking-view]').forEach(function(b){b.classList.toggle('is-active',b.getAttribute('data-booking-view')===state.bookingView);});
    var sched=$('booking-schedule'), list=$('booking-list');
    if(sched)sched.classList.toggle('crm-hidden',state.bookingView!=='schedule');
    if(list)list.classList.toggle('crm-hidden',state.bookingView!=='list');
    if(state.bookingView==='schedule')renderSchedule();
  }

  function renderBookings() {
    var body = $('bookings-table-body');
    if (!body) return;
    var visible = state.bookings.filter(bookingMatches);
    body.innerHTML = visible.map(function(b) {
      var c = bookingCustomer(b);
      var names = bookingServiceNames(b);
      var first = bookingStart(b), last = bookingEnd(b);
      var dateText = b.date ? new Date(b.date + 'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '—';
      var timeText = first ? first + (last ? ' – ' + last : '') : '—';
      var status = bookingStatus(b);
      var badgeClass = status === 'confirmed' ? 'active' : (status === 'cancelled' ? 'inactive' : 'crm-booking-status-' + status);
      return '<tr class="crm-booking-row" data-booking-id="' + escapeHtml(b.id || '') + '">' +
        '<td><strong>' + escapeHtml(dateText) + '</strong><br><span class="crm-small">' + escapeHtml(timeText) + '</span></td>' +
        '<td><strong>' + escapeHtml(c.name || 'Customer') + '</strong><br><span class="crm-small">' + escapeHtml(b.id || 'No reference') + '</span></td>' +
        '<td><strong>' + escapeHtml(names.join(', ') || '—') + '</strong><br><span class="crm-small">' + (b.items ? b.items.length : 0) + ' service' + ((b.items && b.items.length === 1) ? '' : 's') + '</span></td>' +
        '<td>' + escapeHtml(c.phone || '—') + '<br><span class="crm-small">' + escapeHtml(c.email || 'No email') + '</span></td>' +
        '<td class="crm-price">' + bookingMoney(b) + '</td>' +
        '<td><span class="crm-badge ' + badgeClass + '">' + escapeHtml(statusLabel(status)) + '</span></td>' +
        '<td><button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-view-booking="' + escapeHtml(b.id || '') + '">View</button></td>' +
      '</tr>';
    }).join('');
    $('bookings-empty').classList.toggle('crm-hidden', visible.length !== 0);
    updateBookingCounts();
    if(state.bookingView==='schedule') renderSchedule();
  }

  function updateBookingCounts() {
    var counts = {all:state.bookings.length,pending:0,confirmed:0,completed:0,cancelled:0};
    state.bookings.forEach(function(b){ var s=bookingStatus(b); if (counts[s] != null) counts[s]++; });
    Object.keys(counts).forEach(function(k){ var el=$('booking-count-'+k); if(el) el.textContent=counts[k]; });
    document.querySelectorAll('[data-booking-filter]').forEach(function(b){ b.classList.toggle('is-active', b.getAttribute('data-booking-filter') === state.bookingFilter); });
  }

  function updateBookingDashboardStat() {
    var el = $('stat-bookings');
    if (el) el.textContent = state.bookings.length;
  }

  function persistBookings() {
    localStorage.setItem('salonTestBookings', JSON.stringify(state.bookings));
  }

  async function updateBookingStatusInDatabase(id,status){
    var result=await window.salonSupabase.from('bookings').update({
      status:status
    }).eq('id',id);
    if(result.error) throw result.error;
  }

  function shiftBookingItems(items, newStart) {
    var source = Array.isArray(items) ? items : [];
    if (!source.length) return [];
    var firstStart = parseTimeMinutes(source[0].start);
    var targetStart = parseTimeMinutes(newStart);
    if (firstStart == null || targetStart == null) throw new Error('Invalid appointment time.');

    var delta = targetStart - firstStart;
    function clock(total){
      if(total < 0 || total >= 24*60) throw new Error('The appointment cannot extend past midnight.');
      return pad2(Math.floor(total/60))+':'+pad2(total%60);
    }
    return source.map(function(item){
      var start = parseTimeMinutes(item.start);
      var end = parseTimeMinutes(item.end);
      if (start == null || end == null || end <= start) throw new Error('Invalid appointment time.');
      return Object.assign({}, item, {
        start: clock(start + delta),
        end: clock(end + delta)
      });
    });
  }

  async function updateBookingAppointmentInDatabase(id, date, items){
    var result=await window.salonSupabase.from('bookings').update({
      booking_date:date
    }).eq('id',id);
    if(result.error) throw result.error;

    var source = Array.isArray(items) ? items : [];
    await Promise.all(source.filter(function(item){ return item && item.id != null; }).map(function(item){
      return window.salonSupabase.from('booking_services').update({
        start_time:item.start,
        end_time:item.end
      }).eq('id',item.id).eq('booking_id',id).then(function(r){
        if(r.error) throw r.error;
        return r;
      });
    }));
  }

  function findBooking(id) {
    return state.bookings.find(function(b){ return String(b.id) === String(id); });
  }

  function renderBookingDetail(id) {
    var b = findBooking(id); if (!b) return;
    var c = bookingCustomer(b), status = bookingStatus(b);
    var dateText = b.date ? new Date(b.date+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}) : '—';
    var items = (b.items || []).map(function(item) {
      var s = serviceForBookingItem(item);
      return '<div class="crm-detail-item"><div><strong>' + escapeHtml(s.name) + '</strong><span>' + escapeHtml(item.start || '') + (item.end ? ' – ' + escapeHtml(item.end) : '') + '</span></div><strong>' + (s.price == null ? '—' : escapeHtml(String(s.price)) + ' ' + (b.currency === 'QAR' ? 'QAR' : '$')) + '</strong></div>';
    }).join('');
    var nextStatuses = ['pending','confirmed','completed','cancelled'].filter(function(s){return s!==status;}).map(function(s){
      return '<button type="button" class="crm-btn ' + (s==='cancelled'?'crm-btn-danger':'crm-btn-secondary') + '" data-booking-status="' + s + '" data-booking-id="' + escapeHtml(b.id) + '">' + statusLabel(s) + '</button>';
    }).join('');
    $('booking-detail-content').innerHTML =
      '<div class="crm-detail-status"><span class="crm-badge ' + (status==='confirmed'?'active':status==='cancelled'?'inactive':'crm-booking-status-'+status) + '">' + escapeHtml(statusLabel(status)) + '</span><span class="crm-small">' + escapeHtml(b.id || '') + '</span></div>' +
      '<div class="crm-detail-grid">' +
        '<div><span class="crm-detail-label">Customer</span><strong>' + escapeHtml(c.name || '—') + '</strong></div>' +
        '<div><span class="crm-detail-label">Phone / WhatsApp</span><strong>' + escapeHtml(c.phone || '—') + '</strong></div>' +
        '<div><span class="crm-detail-label">Email</span><strong>' + escapeHtml(c.email || '—') + '</strong></div>' +
        '<div><span class="crm-detail-label">Appointment</span><strong>' + escapeHtml(dateText) + '</strong><span>' + escapeHtml(bookingStart(b) || '—') + (bookingEnd(b) ? ' – ' + escapeHtml(bookingEnd(b)) : '') + '</span></div>' +
      '</div>' +
      '<div class="crm-detail-section crm-booking-edit-section">' +
        '<div class="crm-section-label">Adjust appointment</div>' +
        '<div class="crm-form-grid">' +
          '<div class="crm-field"><label for="crm-edit-booking-date">Date</label><input id="crm-edit-booking-date" type="date" value="' + escapeHtml(b.date || '') + '"></div>' +
          '<div class="crm-field"><label for="crm-edit-booking-start">Start time</label><input id="crm-edit-booking-start" type="time" value="' + escapeHtml(bookingStart(b) || '') + '"></div>' +
        '</div>' +
        '<div class="crm-small crm-booking-edit-help">Changing the start time moves the entire appointment by the same amount and keeps each service duration. Pending requests do not block other customers.</div>' +
        '<button type="button" class="crm-btn crm-btn-secondary" data-save-booking-appointment="' + escapeHtml(b.id) + '">Save date & time</button>' +
        '<span id="crm-edit-booking-message" class="crm-small"></span>' +
      '</div>' +
      '<div class="crm-detail-section"><div class="crm-section-label">Services</div>' + items + '</div>' +
      '<div class="crm-detail-total"><span>Total</span><strong>' + bookingMoney(b) + '</strong></div>' +
      (b.bookingComment ? '<div class="crm-detail-section"><div class="crm-section-label">Customer comment</div><p class="crm-detail-notes">' + escapeHtml(b.bookingComment) + '</p></div>' : '') +
      (c.notes ? '<div class="crm-detail-section"><div class="crm-section-label">Internal CRM notes</div><p class="crm-detail-notes">' + escapeHtml(c.notes) + '</p></div>' : '') +
      '<div class="crm-detail-actions">' + nextStatuses + '</div>';
    $('booking-detail-modal').classList.remove('crm-hidden');
    $('booking-detail-modal').setAttribute('aria-hidden','false');
  }

  async function saveBookingAppointment(id) {
    if(!requirePermission('bookings','update')) return;
    var b = findBooking(id);
    if (!b) return;
    var dateInput = $('crm-edit-booking-date');
    var startInput = $('crm-edit-booking-start');
    var messageEl = $('crm-edit-booking-message');
    if (!dateInput || !startInput) return;

    var date = dateInput.value;
    var start = startInput.value;
    if (!date || !start) {
      if (messageEl) messageEl.textContent = 'Please choose a date and start time.';
      return;
    }

    var items;
    try {
      items = shiftBookingItems(b.items, start);
    } catch (e) {
      if (messageEl) messageEl.textContent = e.message || 'Invalid appointment time.';
      return;
    }

    // Only confirmed appointments are hard reservations. A pending request
    // may be moved freely; when the admin confirms it, the overlap check
    // below is performed against other confirmed appointments.
    if (bookingStatus(b) === 'confirmed') {
      var candidate = Object.assign({}, b, {date:date, items:items});
      var conflict = hasBlockingOverlap(candidate, id);
      if (conflict) {
        var cc = bookingCustomer(conflict);
        if (messageEl) messageEl.textContent =
          'This time overlaps confirmed booking ' + (cc.name || conflict.id) + '.';
        return;
      }
    }

    var button = document.querySelector('[data-save-booking-appointment="' + CSS.escape(String(id)) + '"]');
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = 'Saving…';
    }

    try {
      await updateBookingAppointmentInDatabase(b.databaseId || id, date, items);
      b.date = date;
      b.items = items;
      b.updated_at = new Date().toISOString();
      persistBookings();
      renderBookings();
      renderBookingDetail(id);
      message('Appointment date/time updated.', 'success');
    } catch (e) {
      console.error('Could not update booking appointment:', e);
      if (messageEl) messageEl.textContent = 'Could not save the appointment: ' + (e.message || 'Unknown error');
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Save date & time';
      }
    }
  }

  function closeBookingDetail() {
    $('booking-detail-modal').classList.add('crm-hidden');
    $('booking-detail-modal').setAttribute('aria-hidden','true');
  }

  async function updateBookingStatus(id, status) {
    if(!requirePermission('bookings','update')) return;
    var b = findBooking(id); if (!b) return;
    status = String(status || 'pending').toLowerCase();

    if (status === 'pending' || status === 'confirmed') {
      var conflict = hasBlockingOverlap(b, id);
      if (conflict) {
        var cc = bookingCustomer(conflict);
        message('Cannot mark this booking ' + statusLabel(status).toLowerCase() +
          '. It overlaps ' + (cc.name || 'another booking') + ' (' + conflict.id + ').', 'error');
        renderBookingDetail(id);
        return;
      }
    }

    try {
      await updateBookingStatusInDatabase(id,status);
    } catch(e) {
      message('Could not update the booking: '+(e.message||'Unknown error'),'error');
      return;
    }

    b.status = status;
    persistBookings();
    renderBookings();
    updateBookingDashboardStat();
    renderBookingDetail(id);
    message('Booking ' + id + ' marked as ' + statusLabel(status) + '.', 'success');
  }


  async function loadChartOfAccounts(){
    if(!can('chart-of-accounts','read')) { state.chartOfAccounts=[]; renderChartOfAccounts(); return; }
    var body=$('chart-of-accounts-table-body');
    if(body) body.innerHTML='<tr><td colspan="7" class="crm-empty">Loading chart of accounts…</td></tr>';
    try {
      var result=await window.salonSupabase.from('chart_of_accounts')
        .select('account_code,major_account,account_name,account_type,financial_statement,typical_balance,notes,active')
        .order('account_code',{ascending:false});
      if(result.error) throw result.error;
      state.chartOfAccounts=result.data||[];
      syncChartOfAccountsFilters();
      renderChartOfAccounts();
    } catch(e) {
      state.chartOfAccounts=[];
      if(body) body.innerHTML='<tr><td colspan="7" class="crm-empty">Could not load chart of accounts. Check the Supabase migration and permissions.</td></tr>';
      throw e;
    }
  }

  function syncChartOfAccountsFilters(){
    var statements={}, types={};
    state.chartOfAccounts.forEach(function(a){ if(a.financial_statement) statements[a.financial_statement]=true; if(a.account_type) types[a.account_type]=true; });
    var sf=$('chart-statement-filter'), tf=$('chart-type-filter');
    if(sf){ var sv=state.chartStatementFilter||'all'; sf.innerHTML='<option value="all">All statements</option>'+Object.keys(statements).sort().map(function(x){return '<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>';}).join(''); sf.value=statements[sv]?sv:'all'; }
    if(tf){ var tv=state.chartTypeFilter||'all'; tf.innerHTML='<option value="all">All account types</option>'+Object.keys(types).sort().map(function(x){return '<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>';}).join(''); tf.value=types[tv]?tv:'all'; }
  }

  function renderChartOfAccounts(){
    var body=$('chart-of-accounts-table-body'); if(!body)return;
    var q=String(($('chart-account-search')&&$('chart-account-search').value)||state.chartAccountSearch||'').trim().toLowerCase();
    var statement=String(($('chart-statement-filter')&&$('chart-statement-filter').value)||state.chartStatementFilter||'all');
    var type=String(($('chart-type-filter')&&$('chart-type-filter').value)||state.chartTypeFilter||'all');
    var rows=state.chartOfAccounts.filter(function(a){
      var hay=[a.account_code,a.major_account,a.account_name,a.account_type,a.financial_statement,a.typical_balance,a.notes].join(' ').toLowerCase();
      return (!q || hay.indexOf(q)!==-1) && (statement==='all'||a.financial_statement===statement) && (type==='all'||a.account_type===type);
    }).sort(function(a,b){ return crmDesc(a.account_code,b.account_code); });
    body.innerHTML=rows.map(function(a){
      var name=a.account_name || a.major_account || '—';
      var isHeader=a.account_type==='Header';
      var actions='';
      if(can('chart-of-accounts','update')) actions+='<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-edit-chart-account="'+escapeHtml(a.account_code)+'">Edit</button>';
      if(can('chart-of-accounts','delete')) actions+='<button type="button" class="crm-btn crm-btn-danger crm-btn-small" data-delete-chart-account="'+escapeHtml(a.account_code)+'">Delete</button>';
      return '<tr class="'+(isHeader?'crm-account-header-row':'')+'"><td><strong>'+escapeHtml(a.account_code||'')+'</strong></td><td><strong>'+escapeHtml(name)+'</strong>'+(a.major_account && a.account_name?'<br><span class="crm-small">'+escapeHtml(a.major_account)+'</span>':'')+'</td><td>'+escapeHtml(a.account_type||'—')+'</td><td>'+escapeHtml(a.financial_statement||'—')+'</td><td>'+escapeHtml(a.typical_balance||'—')+'</td><td>'+escapeHtml(a.notes||'—')+'</td><td><div class="crm-actions-inline">'+actions+'</div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="crm-empty">No accounts found.</td></tr>';
  }

  function resetChartAccountForm(){
    state.editingChartAccountCode=null;
    var form=$('chart-account-form'); if(form) form.reset();
    if($('chart-account-form-title')) $('chart-account-form-title').textContent='Add account';
    if($('chart-account-save')) $('chart-account-save').textContent='Add account';
    if($('chart-account-active')) $('chart-account-active').checked=true;
    if($('chart-account-form-card')) $('chart-account-form-card').classList.add('crm-hidden');
  }
  function openChartAccountForm(code){
    if(code && !requirePermission('chart-of-accounts','update')) return;
    if(!code && !requirePermission('chart-of-accounts','create')) return;
    var a=code ? state.chartOfAccounts.find(function(x){return String(x.account_code)===String(code);}) : null;
    if(code && !a) return;
    state.editingChartAccountCode=a ? a.account_code : null;
    if($('chart-account-form-title')) $('chart-account-form-title').textContent=a?'Edit account':'Add account';
    if($('chart-account-save')) $('chart-account-save').textContent=a?'Save changes':'Add account';
    if($('chart-account-code')) $('chart-account-code').value=a ? (a.account_code||'') : '';
    if($('chart-account-major')) $('chart-account-major').value=a ? (a.major_account||'') : '';
    if($('chart-account-name')) $('chart-account-name').value=a ? (a.account_name||'') : '';
    if($('chart-account-type')) $('chart-account-type').value=a ? (a.account_type||'') : '';
    if($('chart-account-financial-statement')) $('chart-account-financial-statement').value=a ? (a.financial_statement||'') : '';
    if($('chart-account-balance')) $('chart-account-balance').value=a ? (a.typical_balance||'') : '';
    if($('chart-account-notes')) $('chart-account-notes').value=a ? (a.notes||'') : '';
    if($('chart-account-active')) $('chart-account-active').checked=!a || a.active!==false;
    if($('chart-account-form-card')) $('chart-account-form-card').classList.remove('crm-hidden');
    showView('chart-of-accounts');
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function saveChartAccount(e){
    e.preventDefault();
    var editing=state.editingChartAccountCode;
    if(!requirePermission('chart-of-accounts',editing?'update':'create')) return;
    var code=$('chart-account-code').value.trim();
    var payload={account_code:code,major_account:$('chart-account-major').value.trim()||null,account_name:$('chart-account-name').value.trim()||null,account_type:$('chart-account-type').value.trim(),financial_statement:$('chart-account-financial-statement').value.trim(),typical_balance:$('chart-account-balance').value.trim()||null,notes:$('chart-account-notes').value.trim()||null,active:$('chart-account-active').checked};
    if(!code||!payload.account_type||!payload.financial_statement||( !payload.account_name && !payload.major_account)){message('Enter an account code, type, financial statement, and account name or major account.','error');return;}
    var result=editing
      ? await window.salonSupabase.from('chart_of_accounts').update(payload).eq('account_code',editing)
      : await window.salonSupabase.from('chart_of_accounts').insert(payload);
    if(result.error){message(result.error.code==='23505'?'That account code already exists.':result.error.message,'error');return;}
    resetChartAccountForm(); await loadChartOfAccounts(); message(editing?'Account updated.':'Account created.','success');
  }
  async function deleteChartAccount(code){
    if(!requirePermission('chart-of-accounts','delete')) return;
    var a=state.chartOfAccounts.find(function(x){return String(x.account_code)===String(code);});
    if(!a || !window.confirm('Delete account '+code+'? This cannot be undone.')) return;
    var result=await window.salonSupabase.from('chart_of_accounts').delete().eq('account_code',code);
    if(result.error){message(result.error.message,'error');return;}
    await loadChartOfAccounts(); message('Account deleted.','success');
  }

  async function loadFinancialStatements(){
    if(!can('financial-statements','read')) { state.financialStatements=[]; renderFinancialStatements(); return; }
    var body=$('financial-statements-table-body');
    if(body) body.innerHTML='<tr><td colspan="6" class="crm-empty">Loading financial statements…</td></tr>';
    try{
      var result=await window.salonSupabase.from('financial_statements').select('id,statement,account_code,account_name,classification_line,normal_balance,notes,active').eq('active',true).order('id',{ascending:false});
      if(result.error) throw result.error;
      state.financialStatements=result.data||[];
      syncFinancialStatementFilter(); renderFinancialStatements();
    }catch(e){
      state.financialStatements=[];
      if(body) body.innerHTML='<tr><td colspan="6" class="crm-empty">Could not load financial statements. Run the finance migration in Supabase.</td></tr>';
      throw e;
    }
  }
  function syncFinancialStatementFilter(){
    var values={}; state.financialStatements.forEach(function(x){if(x.statement)values[x.statement]=true;});
    var select=$('financial-statement-filter'); if(!select)return;
    var current=state.financialStatementFilter||'all';
    select.innerHTML='<option value="all">All statements</option>'+Object.keys(values).sort().map(function(x){return '<option value="'+escapeHtml(x)+'">'+escapeHtml(x)+'</option>';}).join('');
    select.value=values[current]?current:'all';
  }
  function renderFinancialStatements(){
    var body=$('financial-statements-table-body'); if(!body)return;
    var q=String(($('financial-statement-search')&&$('financial-statement-search').value)||state.financialStatementSearch||'').trim().toLowerCase();
    var statement=String(($('financial-statement-filter')&&$('financial-statement-filter').value)||state.financialStatementFilter||'all');
    var rows=state.financialStatements.filter(function(x){
      var hay=[x.statement,x.account_code,x.account_name,x.classification_line,x.normal_balance,x.notes].join(' ').toLowerCase();
      return (!q||hay.indexOf(q)!==-1)&&(statement==='all'||x.statement===statement);
    }).sort(function(a,b){return crmIdDesc(a.id,b.id);});
    body.innerHTML=rows.map(function(x){return '<tr><td><strong>'+escapeHtml(x.statement||'—')+'</strong></td><td>'+escapeHtml(x.account_code||'—')+'</td><td>'+escapeHtml(x.account_name||'—')+'</td><td>'+escapeHtml(x.classification_line||'—')+'</td><td>'+escapeHtml(x.normal_balance||'—')+'</td><td>'+escapeHtml(x.notes||'—')+'</td></tr>';}).join('')||'<tr><td colspan="6" class="crm-empty">No financial statement lines found.</td></tr>';
  }

  async function loadContactMessages() {
    if(!can('contact-messages','read')) { state.contactMessages=[]; return; }
    var result=await window.salonSupabase.from('contact_messages')
      .select('id,name,phone,status,created_at')
      .order('created_at',{ascending:false});
    if(result.error) throw result.error;
    state.contactMessages=result.data||[];
    renderContactMessages();
  }

  function renderContactMessages() {
    var body=$('contact-messages-table-body'); if(!body)return;
    var query=String(state.contactMessageSearch||'').trim().toLowerCase();
    var status=String(state.contactMessageStatusFilter||'all');
    var rows=state.contactMessages.filter(function(item){
      var matchesQuery=!query || [item.name,item.phone].join(' ').toLowerCase().indexOf(query)!==-1;
      var matchesStatus=status==='all' || String(item.status||'new')===status;
      return matchesQuery && matchesStatus;
    }).sort(function(a,b){ return crmDateDesc(a.created_at,b.created_at) || crmIdDesc(a.id,b.id); });
    body.innerHTML=rows.map(function(item){
      var itemStatus=String(item.status||'new');
      var badge=itemStatus==='contacted'?'active':'crm-booking-status-pending';
      var action=itemStatus==='contacted'
        ? '<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-contact-status="new" data-contact-id="'+escapeHtml(item.id)+'">Mark new</button>'
        : '<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-contact-status="contacted" data-contact-id="'+escapeHtml(item.id)+'">Mark contacted</button>';
      return '<tr>'+
        '<td>'+escapeHtml(item.created_at?new Date(item.created_at).toLocaleString():'—')+'</td>'+
        '<td><strong>'+escapeHtml(item.name||'—')+'</strong></td>'+
        '<td>'+escapeHtml(item.phone||'—')+'</td>'+
        '<td><span class="crm-badge '+badge+'">'+escapeHtml(itemStatus==='contacted'?'Contacted':'New')+'</span></td>'+
        '<td><div class="crm-actions-inline">'+action+
        (can('contact-messages','delete')?'<button type="button" class="crm-btn crm-btn-danger crm-btn-small" data-delete-contact="'+escapeHtml(item.id)+'">Delete</button>':'')+
        '</div></td></tr>';
    }).join('') || '<tr><td colspan="5" class="crm-empty">No contact requests found.</td></tr>';
  }

  async function updateContactMessageStatus(status,id) {
    if(!requirePermission('contact-messages','update')) return;
    var result=await window.salonSupabase.from('contact_messages').update({status:status}).eq('id',id);
    if(result.error){message(result.error.message,'error');return;}
    var item=state.contactMessages.find(function(x){return String(x.id)===String(id);});
    if(item)item.status=status;
    renderContactMessages();
    message('Contact request updated.','success');
  }

  async function deleteContactMessage(id) {
    if(!requirePermission('contact-messages','delete')) return;
    if(!window.confirm('Delete this contact request? This cannot be undone.')) return;
    var result=await window.salonSupabase.from('contact_messages').delete().eq('id',id);
    if(result.error){message(result.error.message,'error');return;}
    await loadContactMessages();
    message('Contact request deleted.','success');
  }

  async function loadTranslations() {
    if (!can('translations','read')) { state.translations = []; return; }
    if (!window.salonDatabase || !window.salonDatabase.getTranslations) throw new Error('Translation database is not available.');
    state.translations = await window.salonDatabase.getTranslations();
    // Backward-compatible fallback: if the legacy FAQ settings table still
    // contains values and the new translation keys have not been migrated yet,
    // expose them in the same Key / English / Arabic catalogue.
    var keys=state.translations.map(function(row){return row.key;});
    if(keys.indexOf('faq.pageTitle')===-1 || keys.indexOf('faq.pageDescription')===-1){
      var settingsResult=await window.salonSupabase.from('faq_settings').select('*').eq('id',1).maybeSingle();
      if(!settingsResult.error && settingsResult.data){
        var fs=settingsResult.data;
        if(keys.indexOf('faq.pageTitle')===-1) state.translations.push({key:'faq.pageTitle',en:fs.title_en||'',ar:fs.title_ar||''});
        if(keys.indexOf('faq.pageDescription')===-1) state.translations.push({key:'faq.pageDescription',en:fs.description_en||'',ar:fs.description_ar||''});
      }
    }
    renderTranslations();
  }

  function renderTranslations() {
    var body = $('translation-table-body');
    if (!body) return;
    var query = String(($('translation-search') && $('translation-search').value) || '').trim().toLowerCase();
    var rows = (state.translations || []).filter(function(row) {
      if (!query) return true;
      return [row.key, row.en, row.ar].some(function(value) {
        return String(value || '').toLowerCase().indexOf(query) !== -1;
      });
    });

    rows.sort(function(a,b){ return crmDesc(a.key,b.key); });
    body.innerHTML = rows.map(function(row) {
      return '<tr>' +
        '<td><code>' + escapeHtml(row.key) + '</code></td>' +
        '<td>' + escapeHtml(row.en || '') + '</td>' +
        '<td dir="rtl">' + escapeHtml(row.ar || '') + '</td>' +
        '<td><div class="crm-actions-inline">' +
          (can('translations','update') ? '<button type="button" class="crm-btn crm-btn-secondary crm-btn-small" data-edit-translation="' + escapeHtml(row.key) + '">Edit</button>' : '') +
        '</div></td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="4" class="crm-empty">No translations found.</td></tr>';
  }

  function openTranslationForm(key) {
    var row = (state.translations || []).find(function(item) { return item.key === key; });
    state.editingTranslationKey = row ? row.key : null;
    $('translation-form-card').classList.remove('crm-hidden');
    $('translation-key').value = row ? row.key : '';
    $('translation-key').readOnly = !!row;
    $('translation-en').value = row ? (row.en || '') : '';
    $('translation-ar').value = row ? (row.ar || '') : '';
    $('translation-en').focus();
  }

  function closeTranslationForm() {
    state.editingTranslationKey = null;
    var card = $('translation-form-card');
    if (card) card.classList.add('crm-hidden');
    if ($('translation-key')) $('translation-key').readOnly = false;
  }

  async function saveTranslation(e) {
    e.preventDefault();
    var isEdit = !!state.editingTranslationKey;
    var action = isEdit ? 'update' : 'create';
    if (!can('translations', action)) {
      message('You do not have permission to change translations.', 'error');
      return;
    }

    var key = String($('translation-key').value || '').trim();
    var en = $('translation-en').value;
    var ar = $('translation-ar').value;
    if (!key || !en.trim() || !ar.trim()) {
      message('Key, English and Arabic are required.', 'error');
      return;
    }

    try {
      await window.salonDatabase.saveTranslation(key, en, ar);
      closeTranslationForm();
      await loadTranslations();
      message('Translation saved.', 'success');
    } catch (err) {
      console.error(err);
      message(err.message || 'Could not save translation.', 'error');
    }
  }

  function viewStorageKey(userId) { return userId ? 'crm-current-view:' + String(userId) : null; }
  function restoreLastView() {
    var key = viewStorageKey(state.currentUserId);
    var saved = key ? sessionStorage.getItem(key) : null;
    if (saved && (saved === 'dashboard' || can(saved,'read'))) showView(saved, true);
    else showView('dashboard', true);
  }


  // ---------------- Finance module ----------------
  function financeMoney(n){ return Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function financeToday(){ return new Date().toISOString().slice(0,10); }
  function financeAccountLabel(a){ return (a.account_code||'')+' — '+(a.account_name||a.major_account||''); }

  async function loadFinanceAccounts(){
    if(!state.chartOfAccounts.length) await loadChartOfAccounts();
    var opts='<option value="">Select account</option>'+state.chartOfAccounts.filter(function(a){return a.active!==false;}).map(function(a){return '<option value="'+escapeHtml(a.account_code)+'">'+escapeHtml(financeAccountLabel(a))+'</option>';}).join('');
    ['map-account'].forEach(function(id){var el=$(id);if(el){var v=el.value;el.innerHTML=opts; if(v)el.value=v;}});
  }

  function journalLineHtml(line){
    var opts='<option value="">Select account</option>'+state.chartOfAccounts.filter(function(a){return a.active!==false;}).map(function(a){return '<option value="'+escapeHtml(a.account_code)+'" '+(String(a.account_code)===String(line&&line.account_code||'')?'selected':'')+'>'+escapeHtml(financeAccountLabel(a))+'</option>';}).join('');
    return '<tr data-journal-line><td><select data-line-account required>'+opts+'</select></td><td><input data-line-description maxlength="255" value="'+escapeHtml(line&&line.description||'')+'"></td><td><input data-line-debit type="number" min="0" step="0.01" value="'+(line&&line.debit||'')+'"></td><td><input data-line-credit type="number" min="0" step="0.01" value="'+(line&&line.credit||'')+'"></td><td><button type="button" class="crm-btn crm-btn-danger crm-btn-small" data-remove-journal-line>×</button></td></tr>';
  }
  function addJournalLine(line){ var b=$('journal-lines-body');if(b){b.insertAdjacentHTML('beforeend',journalLineHtml(line||{}));updateJournalBalance();} }
  function updateJournalBalance(){
    var d=0,c=0; document.querySelectorAll('#journal-lines-body [data-journal-line]').forEach(function(r){d+=Number(r.querySelector('[data-line-debit]')?.value||0);c+=Number(r.querySelector('[data-line-credit]')?.value||0);});
    var el=$('journal-balance-summary');if(el)el.textContent='Debits: '+financeMoney(d)+' · Credits: '+financeMoney(c)+' · Difference: '+financeMoney(Math.abs(d-c));
    var post=$('journal-entry-post');if(post)post.disabled=d<=0||Math.abs(d-c)>0.005;
  }
  function resetJournalForm(){
    state.editingJournalEntryId=null; var f=$('journal-entry-form');if(f)f.reset();
    if($('journal-entry-date'))$('journal-entry-date').value=financeToday();
    if($('journal-lines-body'))$('journal-lines-body').innerHTML='';
    addJournalLine({});addJournalLine({});
    if($('journal-entry-form-card'))$('journal-entry-form-card').classList.add('crm-hidden');
  }
  async function openJournalForm(id){
    if(!requirePermission('journal-entries',id?'update':'create'))return;
    await loadFinanceAccounts();
    state.editingJournalEntryId=id||null;
    if($('journal-entry-form-title'))$('journal-entry-form-title').textContent=id?'Edit draft':'New journal entry';
    if(id){
      var r=await window.salonSupabase.from('journal_entries').select('id,entry_no,entry_date,reference,description,status').eq('id',id).single();
      if(r.error){message(r.error.message,'error');return;}
      if(r.data.status!=='draft'){message('Only draft journal entries can be edited.','error');return;}
      var l=await window.salonSupabase.from('journal_entry_lines').select('account_code,description,debit,credit').eq('journal_entry_id',id).order('line_no',{ascending:true});
      if(l.error){message(l.error.message,'error');return;}
      $('journal-entry-date').value=r.data.entry_date||financeToday();$('journal-entry-reference').value=r.data.reference||'';$('journal-entry-description').value=r.data.description||'';
      $('journal-lines-body').innerHTML='';(l.data||[]).forEach(addJournalLine);
    }else resetJournalForm();
    $('journal-entry-form-card').classList.remove('crm-hidden');
  }
  function journalFormData(){
    var lines=[];document.querySelectorAll('#journal-lines-body [data-journal-line]').forEach(function(r,i){lines.push({line_no:i+1,account_code:r.querySelector('[data-line-account]').value,description:r.querySelector('[data-line-description]').value.trim()||null,debit:Number(r.querySelector('[data-line-debit]').value||0),credit:Number(r.querySelector('[data-line-credit]').value||0)});});
    return {entry_date:$('journal-entry-date').value,reference:$('journal-entry-reference').value.trim()||null,description:$('journal-entry-description').value.trim(),lines:lines};
  }
  async function saveJournalEntry(e,postIt){
    e&&e.preventDefault(); if(!requirePermission('journal-entries',state.editingJournalEntryId?'update':'create'))return;
    var data=journalFormData(), totalD=data.lines.reduce(function(x,l){return x+l.debit;},0),totalC=data.lines.reduce(function(x,l){return x+l.credit;},0);
    if(!data.entry_date||!data.description||data.lines.length<2||data.lines.some(function(l){return !l.account_code||l.debit<0||l.credit<0||l.debit>0&&l.credit>0;})||totalD<=0||Math.abs(totalD-totalC)>0.005){message('A journal entry needs at least two valid lines and balanced debits and credits.','error');return;}
    var entryId=state.editingJournalEntryId;
    if(entryId){
      var up=await window.salonSupabase.from('journal_entries').update({entry_date:data.entry_date,reference:data.reference,description:data.description}).eq('id',entryId).eq('status','draft');
      if(up.error){message(up.error.message,'error');return;}
      var dl=await window.salonSupabase.from('journal_entry_lines').delete().eq('journal_entry_id',entryId);if(dl.error){message(dl.error.message,'error');return;}
    }else{
      var ins=await window.salonSupabase.from('journal_entries').insert({entry_date:data.entry_date,reference:data.reference,description:data.description,status:'draft'}).select('id').single();
      if(ins.error){message(ins.error.message,'error');return;} entryId=ins.data.id;
    }
    var li=await window.salonSupabase.from('journal_entry_lines').insert(data.lines.map(function(l){return Object.assign({},l,{journal_entry_id:entryId});}));
    if(li.error){message(li.error.message,'error');return;}
    if(postIt){
      var posted=await window.salonSupabase.rpc('post_journal_entry',{p_entry_id:entryId});
      if(posted.error){message(posted.error.message,'error');return;}
    }
    resetJournalForm();await loadJournalEntries();message(postIt?'Journal entry posted.':'Journal draft saved.','success');
  }
  async function loadJournalEntries(){
    if(!can('journal-entries','read'))return;
    var q=String(($('journal-search')&&$('journal-search').value)||'').trim().toLowerCase(), st=($('journal-status-filter')||{}).value||'all', from=($('journal-date-from')||{}).value||'', to=($('journal-date-to')||{}).value||'';
    var r=await window.salonSupabase.from('journal_entries').select('id,entry_no,entry_date,reference,description,status,total_debit,total_credit').order('id',{ascending:false});
    if(r.error){message(r.error.message,'error');return;}
    var rows=(r.data||[]).filter(function(x){var h=[x.entry_no,x.reference,x.description].join(' ').toLowerCase();return(!q||h.includes(q))&&(st==='all'||x.status===st)&&(!from||x.entry_date>=from)&&(!to||x.entry_date<=to);});
    var body=$('journal-entries-body');if(!body)return;
    body.innerHTML=rows.map(function(x){var acts='';if(x.status==='draft'&&can('journal-entries','update'))acts+='<button class="crm-btn crm-btn-secondary crm-btn-small" data-edit-journal="'+x.id+'">Edit</button> ';if(x.status==='draft'&&can('journal-entries','delete'))acts+='<button class="crm-btn crm-btn-danger crm-btn-small" data-delete-journal="'+x.id+'">Delete</button> ';if(x.status==='draft'&&can('journal-entries','post'))acts+='<button class="crm-btn crm-btn-primary crm-btn-small" data-post-journal="'+x.id+'">Post</button>';return '<tr><td><strong>'+escapeHtml(x.entry_no||('JE-'+x.id))+'</strong></td><td>'+escapeHtml(x.entry_date||'')+'</td><td>'+escapeHtml(x.reference||'—')+'</td><td>'+escapeHtml(x.description||'')+'</td><td>'+financeMoney(x.total_debit)+'</td><td>'+escapeHtml(x.status||'')+'</td><td>'+acts+'</td></tr>';}).join('')||'<tr><td colspan="7" class="crm-empty">No journal entries found.</td></tr>';
  }
  async function deleteJournal(id){if(!requirePermission('journal-entries','delete'))return;if(!confirm('Delete this draft journal entry?'))return;var r=await window.salonSupabase.from('journal_entries').delete().eq('id',id).eq('status','draft');if(r.error)message(r.error.message,'error');else{await loadJournalEntries();message('Draft deleted.','success');}}
  async function postJournal(id){if(!requirePermission('journal-entries','post'))return;if(!confirm('Post this journal entry? Posted entries cannot be edited.'))return;var r=await window.salonSupabase.rpc('post_journal_entry',{p_entry_id:id});if(r.error)message(r.error.message,'error');else{await loadJournalEntries();message('Journal entry posted.','success');}}

  async function loadGeneralLedger(){
    if(!can('general-ledger','read'))return;
    var r=await window.salonSupabase.from('journal_entry_lines').select('id,journal_entry_id,line_no,account_code,description,debit,credit,journal_entries!inner(entry_no,entry_date,description,status)').eq('journal_entries.status','posted').order('journal_entry_id',{ascending:false}).order('line_no',{ascending:true});
    if(r.error){message(r.error.message,'error');return;}
    var q=String(($('ledger-search')||{}).value||'').toLowerCase(), acc=($('ledger-account-filter')||{}).value||'all', from=($('ledger-date-from')||{}).value||'',to=($('ledger-date-to')||{}).value||'', balance={};
    var af=$('ledger-account-filter'); if(af){var cur=acc; af.innerHTML='<option value="all">All accounts</option>'+state.chartOfAccounts.filter(function(a){return a.active!==false;}).map(function(a){return '<option value="'+escapeHtml(a.account_code)+'">'+escapeHtml(financeAccountLabel(a))+'</option>';}).join('');af.value=state.chartOfAccounts.some(function(a){return a.account_code===cur;})?cur:'all';}
    var rows=(r.data||[]).filter(function(x){var je=x.journal_entries||{};var h=[x.account_code,x.description,je.entry_no,je.description].join(' ').toLowerCase();return(!q||h.includes(q))&&(acc==='all'||x.account_code===acc)&&(!from||je.entry_date>=from)&&(!to||je.entry_date<=to);}).sort(function(a,b){return String((b.journal_entries||{}).entry_date||'').localeCompare(String((a.journal_entries||{}).entry_date||''))||Number(b.journal_entry_id)-Number(a.journal_entry_id);});
    var body=$('general-ledger-body');if(!body)return;
    body.innerHTML=rows.map(function(x){var prev=balance[x.account_code]||0;var net=prev+Number(x.debit||0)-Number(x.credit||0);balance[x.account_code]=net;var a=state.chartOfAccounts.find(function(y){return y.account_code===x.account_code;});return '<tr><td>'+escapeHtml(x.journal_entries.entry_date||'')+'</td><td>'+escapeHtml(x.journal_entries.entry_no||'')+'</td><td>'+escapeHtml(x.account_code+' — '+(a?(a.account_name||a.major_account||''):'Unknown'))+'</td><td>'+escapeHtml(x.description||x.journal_entries.description||'')+'</td><td>'+financeMoney(x.debit)+'</td><td>'+financeMoney(x.credit)+'</td><td>'+financeMoney(net)+'</td></tr>';}).join('')||'<tr><td colspan="7" class="crm-empty">No posted transactions found.</td></tr>';
  }
  async function loadTrialBalance(){
    if(!can('trial-balance','read'))return;
    var from=($('trial-date-from')||{}).value||'',to=($('trial-date-to')||{}).value||'';
    var r=await window.salonSupabase.from('journal_entry_lines').select('account_code,debit,credit,journal_entries!inner(entry_date,status)').eq('journal_entries.status','posted');if(r.error){message(r.error.message,'error');return;}
    var sums={};(r.data||[]).filter(function(x){var d=x.journal_entries.entry_date;return(!from||d>=from)&&(!to||d<=to);}).forEach(function(x){sums[x.account_code]=sums[x.account_code]||{d:0,c:0};sums[x.account_code].d+=Number(x.debit||0);sums[x.account_code].c+=Number(x.credit||0);});
    var rows=state.chartOfAccounts.filter(function(a){return sums[a.account_code];}).map(function(a){var s=sums[a.account_code];return {a:a,d:s.d,c:s.c,n:s.d-s.c};}).sort(function(x,y){return crmDesc(x.a.account_code,y.a.account_code);});
    var td=rows.reduce(function(n,x){return n+x.d;},0),tc=rows.reduce(function(n,x){return n+x.c;},0);var st=$('trial-balance-status');if(st)st.textContent='Total debits: '+financeMoney(td)+' · Total credits: '+financeMoney(tc)+' · '+(Math.abs(td-tc)<0.005?'Balanced ✓':'Difference: '+financeMoney(Math.abs(td-tc)));
    var body=$('trial-balance-body');if(body)body.innerHTML=rows.map(function(x){return '<tr><td>'+escapeHtml(x.a.account_code)+'</td><td>'+escapeHtml(x.a.account_name||x.a.major_account||'')+'</td><td>'+escapeHtml(x.a.account_type||'')+'</td><td>'+financeMoney(x.d)+'</td><td>'+financeMoney(x.c)+'</td><td>'+financeMoney(x.n)+'</td></tr>';}).join('')||'<tr><td colspan="6" class="crm-empty">No posted transactions in this period.</td></tr>';
  }

  async function loadStatementMappings(){
    if(!can('statement-mapping','read'))return;
    var r=await window.salonSupabase.from('financial_statement_mappings').select('id,statement,account_code,section_line,display_order,active').order('statement').order('display_order').order('account_code',{ascending:false});if(r.error){message(r.message||r.error.message,'error');return;}
    state.statementMappings=r.data||[];renderStatementMappings();
    await loadFinanceAccounts();
  }
  function renderStatementMappings(){
    var body=$('statement-map-body');if(!body)return;var q=String(($('statement-map-search')||{}).value||'').toLowerCase(),st=($('statement-map-filter')||{}).value||'all';
    var rows=state.statementMappings.filter(function(x){var h=[x.statement,x.account_code,x.section_line].join(' ').toLowerCase();return(!q||h.includes(q))&&(st==='all'||x.statement===st);});
    var fs=$('statement-map-filter');if(fs){var vals=[...new Set(state.statementMappings.map(function(x){return x.statement;}).filter(Boolean))];var cur=st;fs.innerHTML='<option value="all">All statements</option>'+vals.map(function(x){return '<option>'+escapeHtml(x)+'</option>';}).join('');fs.value=vals.includes(cur)?cur:'all';}
    body.innerHTML=rows.map(function(x){var acts='';if(can('statement-mapping','update'))acts+='<button class="crm-btn crm-btn-secondary crm-btn-small" data-edit-map="'+x.id+'">Edit</button> ';if(can('statement-mapping','delete'))acts+='<button class="crm-btn crm-btn-danger crm-btn-small" data-delete-map="'+x.id+'">Delete</button>';return '<tr><td>'+escapeHtml(x.statement)+'</td><td>'+escapeHtml(x.account_code)+'</td><td>'+escapeHtml(x.section_line)+'</td><td>'+x.display_order+'</td><td>'+(x.active?'Yes':'No')+'</td><td>'+acts+'</td></tr>';}).join('')||'<tr><td colspan="6" class="crm-empty">No mappings found.</td></tr>';
  }
  function openMappingForm(id){
    var x=id&&state.statementMappings.find(function(y){return String(y.id)===String(id);});state.editingMappingId=x?x.id:null;
    $('statement-map-form-card').classList.remove('crm-hidden');$('map-statement').value=x?x.statement:'Profit & Loss';$('map-account').value=x?x.account_code:'';$('map-section').value=x?x.section_line:'';$('map-order').value=x?x.display_order:1;$('map-active').checked=x?x.active:true;
  }
  async function saveMapping(e){e.preventDefault();var id=state.editingMappingId;if(!requirePermission('statement-mapping',id?'update':'create'))return;var payload={statement:$('map-statement').value,account_code:$('map-account').value,section_line:$('map-section').value.trim(),display_order:Number($('map-order').value||1),active:$('map-active').checked};var r=id?await window.salonSupabase.from('financial_statement_mappings').update(payload).eq('id',id):await window.salonSupabase.from('financial_statement_mappings').insert(payload);if(r.error){message(r.error.message,'error');return;}$('statement-map-form-card').classList.add('crm-hidden');await loadStatementMappings();message('Statement mapping saved.','success');}
  async function deleteMapping(id){if(!requirePermission('statement-mapping','delete'))return;if(!confirm('Delete this statement mapping?'))return;var r=await window.salonSupabase.from('financial_statement_mappings').delete().eq('id',id);if(r.error)message(r.error.message,'error');else{await loadStatementMappings();message('Mapping deleted.','success');}}

  async function loadFinancialReport(){
    if(!can('financial-statements','read'))return;
    var statement=($('report-statement-select')||{}).value||'Profit & Loss',from=($('report-date-from')||{}).value||'',to=($('report-date-to')||{}).value||'';
    var q=await window.salonSupabase.from('journal_entry_lines').select('account_code,debit,credit,journal_entries!inner(entry_date,status)').eq('journal_entries.status','posted');if(q.error){message(q.error.message,'error');return;}
    var sums={};(q.data||[]).filter(function(x){var d=x.journal_entries.entry_date;return(!from||d>=from)&&(!to||d<=to);}).forEach(function(x){sums[x.account_code]=sums[x.account_code]||{d:0,c:0};sums[x.account_code].d+=Number(x.debit||0);sums[x.account_code].c+=Number(x.credit||0);});
    var m=await window.salonSupabase.from('financial_statement_mappings').select('statement,account_code,section_line,display_order').eq('statement',statement).eq('active',true).order('display_order');if(m.error){message(m.error.message,'error');return;}
    var rows=(m.data||[]).map(function(x){var a=state.chartOfAccounts.find(function(y){return y.account_code===x.account_code;})||{};var ss=sums[x.account_code]||{d:0,c:0};return {m:x,a:a,d:ss.d,c:ss.c,n:ss.d-ss.c};});
    var total=rows.reduce(function(n,x){return n+x.n;},0);var sum=$('financial-report-summary');if(sum)sum.textContent=statement+' · '+(from||'Beginning')+' to '+(to||'Today')+' · Net '+financeMoney(total);
    var body=$('financial-report-body');if(body)body.innerHTML=rows.map(function(x){return '<tr><td><strong>'+escapeHtml(x.m.section_line)+'</strong></td><td>'+escapeHtml(x.a.account_code||x.m.account_code)+' — '+escapeHtml(x.a.account_name||x.a.major_account||'')+'</td><td>'+financeMoney(x.d)+'</td><td>'+financeMoney(x.c)+'</td><td>'+financeMoney(x.n)+'</td></tr>';}).join('')||'<tr><td colspan="5" class="crm-empty">No mapped accounts or posted transactions found.</td></tr>';
  }

  async function loadAccountingPeriods(){
    if(!can('accounting-periods','read'))return;var r=await window.salonSupabase.from('accounting_periods').select('id,name,start_date,end_date,status').order('start_date',{ascending:false});if(r.error){message(r.error.message,'error');return;}state.accountingPeriods=r.data||[];var b=$('periods-body');if(b)b.innerHTML=state.accountingPeriods.map(function(x){var a='';if(can('accounting-periods','update'))a+='<button class="crm-btn crm-btn-secondary crm-btn-small" data-edit-period="'+x.id+'">Edit</button> ';if(can('accounting-periods','delete'))a+='<button class="crm-btn crm-btn-danger crm-btn-small" data-delete-period="'+x.id+'">Delete</button>';return '<tr><td>'+escapeHtml(x.name)+'</td><td>'+x.start_date+'</td><td>'+x.end_date+'</td><td>'+escapeHtml(x.status)+'</td><td>'+a+'</td></tr>';}).join('')||'<tr><td colspan="5" class="crm-empty">No accounting periods configured.</td></tr>';}
  function openPeriodForm(id){var x=id&&state.accountingPeriods.find(function(y){return String(y.id)===String(id);});state.editingPeriodId=x?x.id:null;$('period-form-card').classList.remove('crm-hidden');$('period-name').value=x?x.name:'';$('period-start').value=x?x.start_date:financeToday();$('period-end').value=x?x.end_date:financeToday();$('period-status').value=x?x.status:'open';}
  async function savePeriod(e){e.preventDefault();var id=state.editingPeriodId;if(!requirePermission('accounting-periods',id?'update':'create'))return;var payload={name:$('period-name').value.trim(),start_date:$('period-start').value,end_date:$('period-end').value,status:$('period-status').value};if(payload.end_date<payload.start_date){message('End date must be after start date.','error');return;}var r=id?await window.salonSupabase.from('accounting_periods').update(payload).eq('id',id):await window.salonSupabase.from('accounting_periods').insert(payload);if(r.error){message(r.error.message,'error');return;}$('period-form-card').classList.add('crm-hidden');await loadAccountingPeriods();message('Accounting period saved.','success');}
  async function deletePeriod(id){if(!requirePermission('accounting-periods','delete'))return;if(!confirm('Delete this accounting period?'))return;var r=await window.salonSupabase.from('accounting_periods').delete().eq('id',id);if(r.error)message(r.error.message,'error');else{await loadAccountingPeriods();message('Period deleted.','success');}}

  function showView(view, restoring){
    if(view!=='dashboard' && !can(view,'read')){
      message('You do not have permission to view this section.','error');
      return;
    }
    state.currentView=view;
    if (!restoring) { var key = viewStorageKey(state.currentUserId); if (key) sessionStorage.setItem(key, view); }
    document.querySelectorAll('.crm-view').forEach(function(el){el.classList.add('crm-hidden');});
    var target=$('view-'+view); if(target)target.classList.remove('crm-hidden');
    document.querySelectorAll('.crm-nav-item').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-view')===view);});
    var titles={dashboard:['Overview','Dashboard'],services:['Catalog','Services'],users:['Access control','Users & Access'],vouchers:['Catalog','Vouchers'],faqs:['Content','FAQs'],bookings:['Appointments','Bookings'],customers:['Customers','Customers'],'booking-config':['Booking','Booking Setup'],settings:['Configuration','Application Settings'],translations:['Content','Translation'],'contact-messages':['Website enquiries','Contact Us'],roles:['Access control','Roles & Permissions'],'chart-of-accounts':['Finance','Chart of Accounts'],'journal-entries':['Finance','Journal Entries'],'general-ledger':['Finance','General Ledger'],'trial-balance':['Finance','Trial Balance'],'financial-statements':['Finance','Financial Statements'],'statement-mapping':['Finance','Statement Mapping'],'accounting-periods':['Finance','Accounting Periods']};
    var t=titles[view]||titles.dashboard;
    var eyebrow=$('view-eyebrow');
    var title=$('view-title');
    if(eyebrow) eyebrow.textContent=t[0];
    if(title) title.textContent=t[1];
    if(view==='users') loadUsers().catch(function(e){message(e.message,'error');});
    if(view==='roles') loadRoles().catch(function(e){message(e.message,'error');});
    if(view==='chart-of-accounts') loadChartOfAccounts().catch(function(e){console.error('Chart of Accounts load failed:',e);message(e.message||'Could not load chart of accounts.','error');});
    if(view==='financial-statements') loadFinancialReport().catch(function(e){console.error('Financial Statements load failed:',e);message(e.message||'Could not load financial statements.','error');});
    if(view==='journal-entries') { loadFinanceAccounts().then(loadJournalEntries).catch(function(e){message(e.message||'Could not load journal entries.','error');}); }
    if(view==='general-ledger') { loadFinanceAccounts().then(loadGeneralLedger).catch(function(e){message(e.message||'Could not load general ledger.','error');}); }
    if(view==='trial-balance') { loadFinanceAccounts().then(loadTrialBalance).catch(function(e){message(e.message||'Could not load trial balance.','error');}); }
    if(view==='statement-mapping') loadStatementMappings().catch(function(e){message(e.message||'Could not load statement mappings.','error');});
    if(view==='accounting-periods') loadAccountingPeriods().catch(function(e){message(e.message||'Could not load accounting periods.','error');});
    if(view==='settings') loadApplicationSettings().catch(function(e){message(e.message,'error');});
    if(view==='vouchers') loadVouchers().catch(function(e){message(e.message,'error');});
    if(view==='bookings') loadBookings().catch(function(e){message(e.message,'error');});
    if(view==='dashboard') updateDashboard();
    if(view==='customers') loadCustomers().catch(function(e){message(e.message,'error');});
    if(view==='booking-config') loadBookingConfig().catch(function(e){message(e.message||'Could not load booking configuration.','error');});
    if(view==='translations') loadTranslations().catch(function(e){message(e.message||'Could not load translations.','error');});
    $('crm-sidebar').classList.remove('open');
  }

  async function inviteUser(e){
    e.preventDefault();clearMessage();
    if(!can('users','create')){message('You do not have permission to invite CRM users.','error');return;}
    var payload={email:$('user-email').value.trim(),full_name:$('user-name').value.trim(),role_id:Number($('user-role').value),redirect_to:CRM_INVITE_REDIRECT};
    if(!payload.email||!payload.full_name){message('Please enter a name and email.','error');return;}
    var button=e.submitter || $('user-form').querySelector('button[type="submit"]');
    if(button){button.disabled=true;button.textContent='Sending…';}
    try{
      var result=await window.salonSupabase.functions.invoke('invite-crm-user',{body:payload});
      if(result.error){
        var detail=(result.data&&result.data.error)||result.error.message||'Could not send invitation.';
        message(detail,'error');return;
      }
      message('Invitation sent to '+payload.email+'.','success');$('user-form').reset();$('user-form-card').classList.add('crm-hidden');await loadUsers();
    } finally {
      if(button){button.disabled=false;button.textContent='Send invitation';}
    }
  }
  function editUser(id){
    if(!can('users','update')) return;
    var u=state.users.find(function(x){return String(x.user_id)===String(id);}); if(!u)return;
    state.editingUserId=u.user_id; applyRoleVisibility();
    $('edit-user-name').value=u.full_name||'';
    $('edit-user-role').value=String(u.role_id || (state.roles.find(function(r){return String(r.name).toLowerCase()===String(u.role||'staff').toLowerCase();})||{}).id || '');
    $('edit-user-active').checked=u.active!==false;
    $('user-edit-email').textContent=u.email||'';
    $('user-edit-card').classList.remove('crm-hidden');
    $('user-form-card').classList.add('crm-hidden');
    var tempCard=$('temporary-password-card');
    if(tempCard) tempCard.classList.toggle('crm-hidden', !(state.currentRole === 'admin' && String(state.editingUserId)!==String(state.currentUserId)));
    if($('temporary-password')) $('temporary-password').value='';
    if($('temporary-password-confirm')) $('temporary-password-confirm').value='';
    if($('temporary-password-message')) { $('temporary-password-message').textContent=''; $('temporary-password-message').className='crm-message'; }
    $('edit-user-name').focus();
  }
  function generateTemporaryPassword(){
    var chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    var values=new Uint32Array(14);
    if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(values);
    else for(var i=0;i<values.length;i++) values[i]=Math.floor(Math.random()*chars.length);
    var password='';
    for(var j=0;j<values.length;j++) password+=chars[values[j]%chars.length];
    $('temporary-password').value=password;
    $('temporary-password-confirm').value=password;
    $('temporary-password').type='text';
    setTimeout(function(){if($('temporary-password')) $('temporary-password').type='password';},3000);
  }
  async function setTemporaryPassword(){
    if(state.currentRole !== 'admin'){message('Only administrators can set temporary passwords.','error');return;}
    if(!state.editingUserId || String(state.editingUserId)===String(state.currentUserId)){message('You cannot set a temporary password for your own account.','error');return;}
    var password=$('temporary-password').value;
    var confirm=$('temporary-password-confirm').value;
    var msg=$('temporary-password-message');
    if(password.length<8){if(msg){msg.textContent='Temporary password must be at least 8 characters.';msg.className='crm-message show error';}return;}
    if(password!==confirm){if(msg){msg.textContent='The passwords do not match.';msg.className='crm-message show error';}return;}
    var button=$('set-temporary-password');
    if(button){button.disabled=true;button.textContent='Setting password…';}
    try{
      var result=await window.salonSupabase.functions.invoke('set-crm-temp-password',{body:{user_id:state.editingUserId,password:password}});
      if(result.error){throw new Error((result.data&&result.data.error)||result.error.message||'Could not set temporary password.');}
      if(msg){msg.textContent='Temporary password set. The user must change it before entering the CRM.';msg.className='crm-message show success';}
      $('temporary-password').value='';$('temporary-password-confirm').value='';
      await loadUsers();
    }catch(err){
      if(msg){msg.textContent=err.message||'Could not set temporary password.';msg.className='crm-message show error';}
    }finally{
      if(button){button.disabled=false;button.textContent='Set temporary password';}
    }
  }
    async function saveUser(e){
    e.preventDefault();clearMessage();
    if(!can('users','update') || !state.editingUserId) return;
    if(String(state.editingUserId)===String(state.currentUserId) && !$('edit-user-active').checked){
      message('You cannot deactivate your own administrator account.','error');return;
    }
    var payload={full_name:$('edit-user-name').value.trim(),role_id:Number($('edit-user-role').value),active:$('edit-user-active').checked};
    if(!payload.full_name){message('Please enter a display name.','error');return;}
    var result=await window.salonSupabase.from('admin_users').update(payload).eq('user_id',state.editingUserId);
    if(result.error){message(result.error.message,'error');return;}
    message('User updated.','success');state.editingUserId=null;$('user-edit-card').classList.add('crm-hidden');await loadUsers();
  }
  async function toggleUser(id){
    if(!can('users','update')) return;
    if(String(id)===String(state.currentUserId)){message('You cannot deactivate your own administrator account.','error');return;}
    var u=state.users.find(function(x){return String(x.user_id)===String(id);});if(!u)return;
    var next=u.active===false;
    var result=await window.salonSupabase.from('admin_users').update({active:next}).eq('user_id',id);
    if(result.error){message(result.error.message,'error');return;}
    message(next?'User activated.':'User deactivated.','success');await loadUsers();
  }

  async function resetUserPassword(id){
    if(!can('users','update')){message('You do not have permission to reset CRM user passwords.','error');return;}
    if(String(id)===String(state.currentUserId)){message('Use the normal forgot-password flow to reset your own password.','error');return;}
    var u=state.users.find(function(x){return String(x.user_id)===String(id);}); if(!u)return;
    if(u.active===false){message('Activate the CRM user before sending a password reset.','error');return;}
    if(!window.confirm('Send a password reset email to '+(u.email||'this user')+'?'))return;
    try{
      var redirectTo=window.location.origin+window.location.pathname;
      var result=await window.salonSupabase.functions.invoke('reset-crm-user-password',{body:{user_id:id,redirect_to:redirectTo}});
      if(result.error)throw new Error((result.data&&result.data.error)||result.error.message||'Could not send password reset email.');
      if(!result.data||result.data.ok!==true)throw new Error((result.data&&result.data.error)||'Could not send password reset email.');
      message('Password reset email sent to '+(u.email||'the user')+'.','success');
    }catch(err){console.error('Could not send CRM password reset:',err);message(err.message||'Could not send password reset email.','error');}
  }
  async function deleteUser(id){
    if(!can('users','delete')){
      message('You do not have permission to delete CRM users.','error');
      return;
    }
    if(String(id)===String(state.currentUserId)){
      message('You cannot delete your own CRM account.','error');
      return;
    }

    var u=state.users.find(function(x){return String(x.user_id)===String(id);});
    if(!u) return;

    var displayName=u.full_name || u.email || 'this user';
    var confirmed=window.confirm(
      'Delete "'+displayName+'" permanently?\n\n'+
      'This permanently removes the user account and CRM access.'
    );
    if(!confirmed) return;

    try{
      var result=await window.salonSupabase.functions.invoke('delete-crm-user',{
        body:{user_id:id}
      });

      if(result.error){
        throw new Error(
          (result.data && result.data.error) ||
          result.error.message ||
          'Could not delete the CRM user.'
        );
      }

      if(!result.data || result.data.ok!==true){
        throw new Error(
          (result.data && result.data.error) ||
          'Could not delete the CRM user.'
        );
      }

      state.editingUserId=null;
      var editCard=$('user-edit-card');
      if(editCard) editCard.classList.add('crm-hidden');

      message('CRM user deleted successfully.','success');
      await loadUsers();
    }catch(err){
      console.error('Could not delete CRM user:',err);
      message(err.message || 'Could not delete the CRM user.','error');
    }
  }
  function isInviteSetup(){
    return new URLSearchParams(window.location.search).get('invite')==='1';
  }
  function isPasswordRecovery(){
    return new URLSearchParams(window.location.search).get('recovery')==='1';
  }

  // Supabase can receive an invitation while another CRM user is already
  // signed in in the same browser.  The invitation must take ownership of
  // the browser session before we allow password setup; otherwise the old
  // user's session can be mistaken for the invited user's session.
  function getInviteArtifact(){
    var params = new URLSearchParams(window.location.search);
    var hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    return {
      code: params.get('code'),
      accessToken: hash.get('access_token'),
      refreshToken: hash.get('refresh_token'),
      type: hash.get('type'),
      hasHashAuth: !!(hash.get('access_token') || hash.get('refresh_token') || hash.get('type')),
      hasAuthArtifact: !!(params.get('code') || hash.get('access_token') || hash.get('refresh_token'))
    };
  }

  function decodeJwtPayload(token){
    try{
      var part=String(token||'').split('.')[1];
      if(!part) return null;
      var base64=part.replace(/-/g,'+').replace(/_/g,'/');
      while(base64.length%4) base64+='=';
      return JSON.parse(atob(base64));
    }catch(_){ return null; }
  }

  function inviteMarkerKey(){
    return 'salon_crm_invite_user_id';
  }

  function getInviteMarker(){
    try{return sessionStorage.getItem(inviteMarkerKey())||'';}catch(_){return '';}
  }

  function setInviteMarker(userId){
    try{sessionStorage.setItem(inviteMarkerKey(),String(userId||''));}catch(_){}
  }

  function clearInviteMarker(){
    try{sessionStorage.removeItem(inviteMarkerKey());}catch(_){}
  }

  async function waitForAuthSession(timeoutMs){
    var deadline=Date.now()+(timeoutMs||5000);
    var last=null;
    while(Date.now()<deadline){
      try{
        var result=await window.salonSupabase.auth.getSession();
        last=result&&result.data?result.data.session:null;
        if(last) return last;
      }catch(_){}
      await new Promise(function(resolve){setTimeout(resolve,100);});
    }
    return last;
  }

  async function establishInviteSession(){
    var artifact=getInviteArtifact();
    var existing=(await window.salonSupabase.auth.getSession()).data.session;

    // If this is a real invitation artifact, do not let a previously logged-in
    // CRM account win the race.  Explicitly sign it out before applying the
    // invitation token/code.
    if(artifact.hasAuthArtifact){
      // createClient() may already have consumed the invite URL by the time
      // this function runs. Reuse that session when it is demonstrably the
      // invitation session instead of signing it out and trying to exchange a
      // one-time PKCE code a second time.
      if(existing && artifact.accessToken){
        var existingPayload=decodeJwtPayload(artifact.accessToken);
        if(!existingPayload || !existingPayload.sub || String(existingPayload.sub)===String(existing.user.id)){
          setInviteMarker(existing.user.id);
          return existing;
        }
      }
      if(existing && artifact.code){
        // A PKCE invitation code is one-time-use. If Supabase has already
        // exchanged it, getSession() is the authoritative result.
        setInviteMarker(existing.user.id);
        return existing;
      }

      if(existing) {
        try{ await window.salonSupabase.auth.signOut({scope:'local'}); }catch(_){}
      }

      if(artifact.accessToken && artifact.refreshToken){
        var setResult=await window.salonSupabase.auth.setSession({
          access_token:artifact.accessToken,
          refresh_token:artifact.refreshToken
        });
        if(setResult.error) throw setResult.error;
      } else if(artifact.code){
        var exchangeResult=await window.salonSupabase.auth.exchangeCodeForSession(artifact.code);
        if(exchangeResult.error) throw exchangeResult.error;
      }

      var invitedSession=await waitForAuthSession(5000);
      if(!invitedSession) throw new Error('This invitation could not be activated. Please open the latest invitation email again.');

      // If an implicit-flow access token is available, verify the session is
      // the user encoded in that token. This prevents an old browser session
      // from ever reaching the password form.
      if(artifact.accessToken){
        var payload=decodeJwtPayload(artifact.accessToken);
        if(payload && payload.sub && String(payload.sub)!==String(invitedSession.user.id)){
          await window.salonSupabase.auth.signOut({scope:'local'});
          throw new Error('The invitation session could not be verified. Please open the latest invitation email again.');
        }
      }

      setInviteMarker(invitedSession.user.id);
      return invitedSession;
    }

    // On refresh after Supabase has consumed the invite URL, the marker tells
    // us which authenticated user is allowed to remain on the password form.
    var marker=getInviteMarker();
    if(!marker) return null;
    var session=await waitForAuthSession(2500);
    if(!session || String(session.user.id)!==String(marker)){
      clearInviteMarker();
      return null;
    }
    return session;
  }
  function showPasswordSetup(mode){
    passwordSetupMode = mode || 'invite';
    $('crm-login').classList.add('crm-hidden');
    $('crm-app').classList.add('crm-hidden');
    $('crm-password-setup').classList.remove('crm-hidden');
    var title = $('password-setup-title');
    var subtitle = $('password-setup-subtitle');
    var button = $('password-setup-submit');
    if (passwordSetupMode === 'forced') {
      if (title) title.textContent = 'Change your temporary password';
      if (subtitle) subtitle.textContent = 'An administrator set a temporary password for this account. You must choose a new password before you can enter the CRM.';
      if (button) button.innerHTML = 'Change password <span>→</span>';
    } else if (passwordSetupMode === 'recovery') {
      if (title) title.textContent = 'Reset your password';
      if (subtitle) subtitle.textContent = 'Choose a new password to regain access to your salon CRM account.';
      if (button) button.innerHTML = 'Set new password <span>→</span>';
    } else {
      if (title) title.textContent = 'Create your password';
      if (subtitle) subtitle.textContent = 'Your invitation is confirmed. Choose a password to finish setting up your CRM account.';
      if (button) button.innerHTML = 'Create password <span>→</span>';
    }
    $('setup-password').focus();
  }
  function passwordSetupMessage(text,type){
    message(text, type || 'success');
  }
  async function finishPasswordSetup(e){
    e.preventDefault();
    var password=$('setup-password').value, confirm=$('setup-password-confirm').value;
    if(password.length<8){passwordSetupMessage('Password must be at least 8 characters.','error');return;}
    if(password!==confirm){passwordSetupMessage('The passwords do not match.','error');return;}
    var button=e.submitter;
    if(button){button.disabled=true;button.textContent='Saving…';}
    try{
      if (passwordSetupMode === 'invite') {
        var setupSessionResult=await window.salonSupabase.auth.getSession();
        var setupSession=setupSessionResult.data&&setupSessionResult.data.session;
        var invitedUserId=getInviteMarker();
        if(!setupSession || !invitedUserId || String(setupSession.user.id)!==String(invitedUserId)){
          passwordSetupMessage('Your invitation session is no longer active. Please open the latest invitation email again.','error');
          return;
        }
      }
      var result;
      if (passwordSetupMode === 'forced') {
        result = await window.salonSupabase.functions.invoke('complete-crm-password-change', {body:{password:password}});
        if(result.error){
          var detail=(result.data&&result.data.error)||result.error.message||'Could not change the password.';
          passwordSetupMessage(detail,'error');return;
        }
        state.mustChangePassword=false;
      } else {
        result=await window.salonSupabase.auth.updateUser({password:password});
        if(result.error){passwordSetupMessage(result.error.message,'error');return;}
      }
      clearInviteMarker();
      history.replaceState({},document.title,window.location.pathname);
      if (window.location.hash) history.replaceState({},document.title,window.location.pathname);
      $('crm-password-setup').classList.add('crm-hidden');
      if(!(await requireAdmin())){await window.salonSupabase.auth.signOut();showLogin();message('This account is not authorized for the salon CRM.','error');return;}
      var sessionNow=await window.salonSupabase.auth.getSession();
      state.currentUserId=sessionNow.data.session&&sessionNow.data.session.user?sessionNow.data.session.user.id:state.currentUserId;
      showApp();
      $('current-user-email').textContent=(sessionNow.data.session&&sessionNow.data.session.user&&sessionNow.data.session.user.email)||'CRM user';
      await loadAccess();
      await loadRoles();
      await loadData();
      await loadUsers();
      if(can('settings','read')) await loadApplicationSettings();
      if(can('faqs','read')) await loadFaqs();
      if(can('bookings','read')) await loadBookings();
    if(can('contact-messages','read')) await loadContactMessages();
      message(passwordSetupMode === 'forced' ? 'Password changed successfully. Welcome back to the salon CRM.' : 'Password created. Welcome to the salon CRM.','success');
    } finally {
      if(button){button.disabled=false;button.textContent='Create password →';}
    }
  }
  function clearCrmSessionState() {
    state.customers=[]; state.categories=[]; state.services=[]; state.vouchers=[]; state.users=[]; state.roles=[]; state.permissions=[]; state.access={}; state.rolePermissions=[]; state.bookings=[]; state.faqs=[]; state.translations=[]; state.contactMessages=[]; state.contactMessageSearch=''; state.contactMessageStatusFilter='all'; state.currentRole=null; state.currentUserId=null; state.currentView='dashboard'; state.mustChangePassword=false;
    document.querySelectorAll('.crm-view').forEach(function(el){ el.classList.add('crm-hidden'); });
    var dashboard=$('view-dashboard'); if(dashboard) dashboard.classList.remove('crm-hidden');
    document.querySelectorAll('.crm-nav-item').forEach(function(el){ el.classList.remove('active'); });
    var dashNav=document.querySelector('.crm-nav-item[data-view="dashboard"]'); if(dashNav) dashNav.classList.add('active');
  }
  function showLogin(){ clearCrmSessionState(); $('crm-login').classList.remove('crm-hidden'); $('crm-app').classList.add('crm-hidden'); $('crm-password-setup').classList.add('crm-hidden'); }
  async function signOut(){
    var oldUserId=state.currentUserId;
    if(oldUserId) sessionStorage.removeItem(viewStorageKey(oldUserId));
    try { await window.salonSupabase.auth.signOut({scope:'global'}); } finally { window.location.replace(window.location.pathname); }
  }
  async function login(e){
    e.preventDefault();clearMessage();
    clearInviteMarker();
    var result=await window.salonSupabase.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
    if(result.error){message(result.error.message,'error');return;}

    // Authentication succeeded. Now load the authorization record through the
    // security-definer access RPC. This also gives us must_change_password.
    // Never sign the user out merely because a direct crm_roles SELECT is
    // blocked by RLS.
    state.currentUserId=result.data.user.id;
    try {
      await loadAccess();
    } catch (err) {
      console.error('CRM access load failed after login:', err);
      message('You signed in, but the CRM could not load your access permissions. Please try again.', 'error');
      return;
    }

    if(!state.currentRole){
      await window.salonSupabase.auth.signOut();
      message('This account is not authorized to access the salon CRM.','error');
      return;
    }

    if(state.mustChangePassword){ showPasswordSetup('forced'); return; }
    $('current-user-email').textContent=result.data.user.email||'CRM user';
    await loadRoles();
    await loadData();
    await loadUsers();
    if(can('settings','read')) await loadApplicationSettings();
    if(can('faqs','read')) await loadFaqs();
    if(can('bookings','read')) await loadBookings();
    if(can('contact-messages','read')) await loadContactMessages();
    // Restore the user's last authorized view before the app becomes visible.
    restoreLastView();
    showApp();
  }
  function applyRoleVisibility(){
    // Navigation visibility is permission-based, but content visibility is
    // view-state-based. Do not unhide every permitted view when refreshing
    // permissions or opening an editor. Only the active view is displayed.
    document.querySelectorAll('.crm-nav-item[data-view]').forEach(function(el){
      var view=el.getAttribute('data-view');
      var allowed = view === 'dashboard' || can(view,'read');
      el.classList.toggle('crm-hidden', !allowed);
      if (!allowed && view === state.currentView) state.currentView = 'dashboard';
    });
    document.querySelectorAll('.crm-view[id^="view-"]').forEach(function(el){
      var view=el.id.replace(/^view-/,'');
      var allowed = view === 'dashboard' || can(view,'read');
      var active = view === state.currentView;
      el.classList.toggle('crm-hidden', !(allowed && active));
    });
    var actionMap={
      'new-category-top':['services','create'],'new-voucher-top':['vouchers','create'],'new-faq-top':['faqs','create'],
      'invite-user-btn':['users','create'],'new-role-top':['roles','create'],
      'service-save':['services',state.editingServiceId?'update':'create'],'category-save':['services',state.editingCategoryId?'update':'create'],
      'voucher-save':['vouchers',state.editingVoucherId?'update':'create'],'faq-save':['faqs',state.editingFaqId?'update':'create'],
      'role-save':['roles',state.editingRoleId?'update':'create'],'application-settings-save':['settings','update'],'journal-entry-save':['journal-entries','create'],'journal-entry-post':['journal-entries','post'],'statement-map-add':['statement-mapping','create'],'period-add':['accounting-periods','create']
    };
    Object.keys(actionMap).forEach(function(id){var el=$(id),rule=actionMap[id];if(el)el.disabled=!can(rule[0],rule[1]);});
  }
  function showApp(){$('crm-login').classList.add('crm-hidden');$('crm-app').classList.remove('crm-hidden');applyRoleVisibility();}

  document.addEventListener('DOMContentLoaded',async function(){
    $('login-form').addEventListener('submit',login);$('faq-form').addEventListener('submit',saveFaq);$('faq-cancel').addEventListener('click',resetFaqForm);$('new-faq-top').addEventListener('click',startFaqCreate);$('faqs-refresh').addEventListener('click',function(){loadFaqs().catch(function(e){message(e.message,'error');});});$('faq-table-body').addEventListener('click',function(e){var edit=e.target.closest('[data-edit-faq]');if(edit)editFaq(edit.getAttribute('data-edit-faq'));var del=e.target.closest('[data-delete-faq]');if(del)deleteFaq(del.getAttribute('data-delete-faq'));});$('service-form').addEventListener('submit',saveService);$('category-form').addEventListener('submit',saveCategory);$('customer-form').addEventListener('submit',saveCustomer);$('customer-search').addEventListener('input',renderCustomers);if($('customer-loyalty-filter')) $('customer-loyalty-filter').addEventListener('change',function(e){state.customerLoyaltyFilter=e.target.value;renderCustomers();});$('customer-phone').addEventListener('input',function(){var v=this.value.replace(/[^0-9+]/g,'');if(v.indexOf('+')>0)v='+'+v.replace(/\+/g,'');if(v.charAt(0)!=='+')v=v.replace(/\+/g,'');this.value=v;});$('customer-cancel').addEventListener('click',cancelCustomerEdit);$('customer-detail-close').addEventListener('click',closeCustomerDetails);$('customer-loyalty-rewards').addEventListener('click',function(e){var btn=e.target.closest('.crm-reward-btn');if(!btn||btn.disabled)return;var cost=Number(btn.getAttribute('data-reward-points'));var label=btn.getAttribute('data-reward-label')||'Reward';if(!window.confirm('Redeem '+cost+' points for '+label+'?'))return;changeCustomerLoyalty(-cost,'Redeemed '+label,'reward_redeemed');});$('add-loyalty-reward').addEventListener('click',function(){var container=$('loyalty-reward-settings-list');if(!container)return;var row=document.createElement('div');row.className='crm-loyalty-reward-setting-row';row.setAttribute('data-loyalty-reward-row','');row.innerHTML='<div class="crm-field"><label>Points to redeem</label><input type="number" min="1" step="1" data-loyalty-reward-points placeholder="100"></div><div class="crm-field"><label>Reward</label><input type="text" maxlength="120" data-loyalty-reward-label placeholder="$10 reward or Free haircut"></div><button type="button" class="crm-btn crm-btn-secondary crm-btn-small crm-loyalty-remove-reward" data-remove-loyalty-reward>Remove</button>';container.appendChild(row);row.querySelector('[data-loyalty-reward-points]').focus();});$('loyalty-reward-settings-list').addEventListener('click',function(e){var btn=e.target.closest('[data-remove-loyalty-reward]');if(!btn)return;var rows=document.querySelectorAll('[data-loyalty-reward-row]');if(rows.length<=1){message('Keep at least one loyalty reward.','error');return;}btn.closest('[data-loyalty-reward-row]').remove();});$('customer-loyalty-adjust-form').addEventListener('submit',function(e){e.preventDefault();var pts=Number($('customer-loyalty-adjust-points').value);var note=$('customer-loyalty-adjust-note').value.trim();if(!Number.isInteger(pts)||pts===0){message('Enter a non-zero whole number of points.','error');return;}if(!note){message('Enter a reason for the adjustment.','error');return;}changeCustomerLoyalty(pts,note,'manual_adjustment').then(function(){$('customer-loyalty-adjust-form').reset();});});$('application-settings-form').addEventListener('submit',saveApplicationSettings);$('add-currency-option').addEventListener('click',addCurrencyOption);$('upload-header-image').addEventListener('click',function(){uploadBrandingImage('header_image','header-image-file').catch(function(e){message(e.message,'error');});});$('delete-header-image').addEventListener('click',function(){deleteBrandingImage('header_image').catch(function(e){message(e.message,'error');});});$('upload-banner-image').addEventListener('click',function(){uploadBrandingImage('banner_image','banner-image-file').catch(function(e){message(e.message,'error');});});$('delete-banner-image').addEventListener('click',function(){deleteBrandingImage('banner_image').catch(function(e){message(e.message,'error');});});$('upload-favicon-image').addEventListener('click',function(){uploadBrandingImage('favicon_image','favicon-image-file',2).catch(function(e){message(e.message,'error');});});$('delete-favicon-image').addEventListener('click',function(){deleteBrandingImage('favicon_image').catch(function(e){message(e.message,'error');});});
    WEBSITE_IMAGE_SLOTS.forEach(function(slot){
      var uploadButton = $(slot.uploadId);
      if (uploadButton) uploadButton.addEventListener('click',function(){uploadWebsiteImage(slot).catch(function(e){message(e.message,'error');});});
    });
    $('user-form').addEventListener('submit',inviteUser);$('user-cancel').addEventListener('click',function(){$('user-form-card').classList.add('crm-hidden');});
    $('user-edit-form').addEventListener('submit',saveUser);
    if($('user-search')) $('user-search').addEventListener('input',function(e){state.userSearch=e.target.value;renderUsers();});
    if($('user-role-filter')) $('user-role-filter').addEventListener('change',function(e){state.userRoleFilter=e.target.value;renderUsers();});
    if($('user-status-filter')) $('user-status-filter').addEventListener('change',function(e){state.userStatusFilter=e.target.value;renderUsers();});
    if($('role-search')) $('role-search').addEventListener('input',function(e){state.roleSearch=e.target.value;renderRoles();});
    if($('role-type-filter')) $('role-type-filter').addEventListener('change',function(e){state.roleTypeFilter=e.target.value;renderRoles();});$('user-edit-cancel').addEventListener('click',function(){$('user-edit-card').classList.add('crm-hidden');state.editingUserId=null;});
    var tempGenerate=$('generate-temporary-password'); if(tempGenerate) tempGenerate.addEventListener('click',generateTemporaryPassword); var tempSet=$('set-temporary-password'); if(tempSet) tempSet.addEventListener('click',setTemporaryPassword);
    var roleForm=$('role-form'); if(roleForm) roleForm.addEventListener('submit',saveRole); var roleCancel=$('role-cancel'); if(roleCancel) roleCancel.addEventListener('click',function(){$('role-form-card').classList.add('crm-hidden');state.editingRoleId=null;}); var newRoleTop=$('new-role-top'); if(newRoleTop) newRoleTop.addEventListener('click',startRoleCreate); var rolesTableBody=$('roles-table-body'); if(rolesTableBody) rolesTableBody.addEventListener('click',function(e){var edit=e.target.closest('[data-edit-role]');if(edit)editRole(edit.getAttribute('data-edit-role'));var del=e.target.closest('[data-delete-role]');if(del)deleteRole(del.getAttribute('data-delete-role'));}); var roleSelectAll=$('role-select-all'); if(roleSelectAll) roleSelectAll.addEventListener('change',function(e){document.querySelectorAll('[data-role-permission]').forEach(function(c){c.checked=e.target.checked;});});
    $('password-setup-form').addEventListener('submit',finishPasswordSetup);
    $('invite-user-btn').addEventListener('click',function(){$('user-form-card').classList.remove('crm-hidden');$('user-name').focus();});
    $('service-reset').addEventListener('click',resetServiceForm);$('category-reset').addEventListener('click',resetCategoryForm);
    $('category-image-file').addEventListener('change',function(){
      var file=this.files&&this.files[0];
      if(!file){ renderCategoryImagePreview(''); return; }
      if(!/^image\//i.test(file.type)){ message('Please choose an image file.','error'); this.value=''; renderCategoryImagePreview(''); return; }
      var previewUrl=URL.createObjectURL(file);
      renderCategoryImagePreview(previewUrl);
    });
    $('logout').addEventListener('click',signOut);
    document.querySelectorAll('.crm-nav-item').forEach(function(b){b.addEventListener('click',function(){showView(b.getAttribute('data-view'));});});
    if($('category-search')) $('category-search').addEventListener('input',renderCategories);
    if($('category-status-filter')) $('category-status-filter').addEventListener('change',renderCategories);
    if($('service-search')) $('service-search').addEventListener('input',renderServices);
    if($('service-category-filter')) $('service-category-filter').addEventListener('change',renderServices);
    if($('service-status-filter')) $('service-status-filter').addEventListener('change',renderServices);
    if($('service-category')) $('service-category').addEventListener('change',generateServiceSku);
    if($('voucher-search')) $('voucher-search').addEventListener('input',renderVouchers);
    if($('voucher-status-filter')) $('voucher-status-filter').addEventListener('change',renderVouchers);

    document.querySelectorAll('[data-view-target]').forEach(function(b){b.addEventListener('click',function(){showView(b.getAttribute('data-view-target'));});});
    $('mobile-menu').addEventListener('click',function(){$('crm-sidebar').classList.toggle('open');});
    $('bookings-refresh').addEventListener('click',function(){loadBookings().catch(function(e){message(e.message,'error');});});
    if($('chart-account-search')) $('chart-account-search').addEventListener('input',function(e){state.chartAccountSearch=e.target.value;renderChartOfAccounts();});
    if($('chart-statement-filter')) $('chart-statement-filter').addEventListener('change',function(e){state.chartStatementFilter=e.target.value;renderChartOfAccounts();});
    if($('chart-type-filter')) $('chart-type-filter').addEventListener('change',function(e){state.chartTypeFilter=e.target.value;renderChartOfAccounts();});
    if($('chart-account-add')) $('chart-account-add').addEventListener('click',function(){openChartAccountForm(null);});
    if($('chart-account-cancel-2')) $('chart-account-cancel-2').addEventListener('click',resetChartAccountForm);
    if($('chart-account-form')) $('chart-account-form').addEventListener('submit',saveChartAccount);
    if($('chart-of-accounts-table-body')) $('chart-of-accounts-table-body').addEventListener('click',function(e){var edit=e.target.closest('[data-edit-chart-account]'); if(edit){openChartAccountForm(edit.getAttribute('data-edit-chart-account'));return;} var del=e.target.closest('[data-delete-chart-account]'); if(del) deleteChartAccount(del.getAttribute('data-delete-chart-account'));});
    if($('financial-statement-search')) $('financial-statement-search').addEventListener('input',function(e){state.financialStatementSearch=e.target.value;renderFinancialStatements();});
    if($('financial-statement-filter')) $('financial-statement-filter').addEventListener('change',function(e){state.financialStatementFilter=e.target.value;renderFinancialStatements();});
    if($('chart-statement-filter')) $('chart-statement-filter').addEventListener('change',function(e){state.chartStatementFilter=e.target.value;renderChartOfAccounts();});
    if($('chart-type-filter')) $('chart-type-filter').addEventListener('change',function(e){state.chartTypeFilter=e.target.value;renderChartOfAccounts();});
    if($('contact-messages-refresh')) $('contact-messages-refresh').addEventListener('click',function(){loadContactMessages().catch(function(e){message(e.message,'error');});});
    if($('contact-message-search')) $('contact-message-search').addEventListener('input',function(e){state.contactMessageSearch=e.target.value;renderContactMessages();});
    if($('contact-message-status-filter')) $('contact-message-status-filter').addEventListener('change',function(e){state.contactMessageStatusFilter=e.target.value;renderContactMessages();});
    if($('contact-messages-table-body')) $('contact-messages-table-body').addEventListener('click',function(e){
      var button=e.target.closest('[data-contact-status]');
      if(button) updateContactMessageStatus(button.getAttribute('data-contact-status'), button.getAttribute('data-contact-id'));
      var del=e.target.closest('[data-delete-contact]');
      if(del) deleteContactMessage(del.getAttribute('data-delete-contact'));
    });
    $('booking-search').addEventListener('input',function(e){state.bookingSearch=e.target.value;renderBookings();});
    $('booking-date-filter').addEventListener('change',function(e){state.bookingDateFilter=e.target.value;renderBookings();});
    if($('booking-status-filter')) $('booking-status-filter').addEventListener('change',function(e){state.bookingFilter=e.target.value;renderBookings();});
    document.querySelectorAll('[data-booking-filter]').forEach(function(b){b.addEventListener('click',function(){state.bookingFilter=b.getAttribute('data-booking-filter');if($('booking-status-filter'))$('booking-status-filter').value=state.bookingFilter;renderBookings();});});
    $('bookings-table-body').addEventListener('click',function(e){var b=e.target.closest('[data-view-booking]');if(b)renderBookingDetail(b.getAttribute('data-view-booking'));});
    document.querySelectorAll('[data-close-booking]').forEach(function(el){el.addEventListener('click',closeBookingDetail);});
    $('booking-detail-content').addEventListener('click',function(e){
      var statusButton=e.target.closest('[data-booking-status]');
      if(statusButton) updateBookingStatus(statusButton.getAttribute('data-booking-id'),statusButton.getAttribute('data-booking-status'));
      var saveButton=e.target.closest('[data-save-booking-appointment]');
      if(saveButton) saveBookingAppointment(saveButton.getAttribute('data-save-booking-appointment'));
    });
    document.querySelectorAll('[data-booking-view]').forEach(function(b){b.addEventListener('click',function(){setBookingView(b.getAttribute('data-booking-view'));});});
    $('schedule-prev').addEventListener('click',function(){state.scheduleDate.setDate(state.scheduleDate.getDate()-7);renderSchedule();});
    $('schedule-next').addEventListener('click',function(){state.scheduleDate.setDate(state.scheduleDate.getDate()+7);renderSchedule();});
    $('schedule-today').addEventListener('click',function(){state.scheduleDate=new Date();renderSchedule();});
    $('booking-schedule-grid').addEventListener('click',function(e){var b=e.target.closest('[data-view-booking]');if(b)renderBookingDetail(b.getAttribute('data-view-booking'));});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeBookingDetail();});

    $('service-table-body').addEventListener('click',function(e){var b=e.target.closest('[data-edit-service]');if(b)editService(b.getAttribute('data-edit-service'));var d=e.target.closest('[data-delete-service]');if(d)deleteService(d.getAttribute('data-delete-service'));});
    $('category-table-body').addEventListener('click',function(e){var b=e.target.closest('[data-edit-category]');if(b)editCategory(b.getAttribute('data-edit-category'));var d=e.target.closest('[data-delete-category]');if(d)deleteCategory(d.getAttribute('data-delete-category'));}); $('users-table-body').addEventListener('click',function(e){var edit=e.target.closest('[data-edit-user]');if(edit){editUser(edit.getAttribute('data-edit-user'));return;}var toggle=e.target.closest('[data-toggle-user]');if(toggle){toggleUser(toggle.getAttribute('data-toggle-user'));return;}var reset=e.target.closest('[data-reset-password]');if(reset){resetUserPassword(reset.getAttribute('data-reset-password'));return;}var del=e.target.closest('[data-delete-user]');if(del)deleteUser(del.getAttribute('data-delete-user'));});
    $('voucher-form').addEventListener('submit',saveVoucher);
    $('voucher-reset').addEventListener('click',resetVoucherForm);
    $('voucher-cancel').addEventListener('click',function(){$('voucher-form-card').classList.add('crm-hidden');state.editingVoucherId=null;});
    $('new-voucher-top').addEventListener('click',function(){resetVoucherForm();$('voucher-form-card').classList.remove('crm-hidden');$('voucher-sku').focus();window.scrollTo({top:0,behavior:'smooth'});});
    $('vouchers-refresh').addEventListener('click',function(){loadVouchers().catch(function(e){message(e.message,'error');});});
    $('voucher-image-delete').addEventListener('click',deleteVoucherImage);    $('voucher-image-file').addEventListener('change',previewVoucherImageFile);
    $('voucher-table-body').addEventListener('click',function(e){
      var edit=e.target.closest('[data-edit-voucher]');
      if(edit) editVoucher(edit.getAttribute('data-edit-voucher'));
      var del=e.target.closest('[data-delete-voucher]');
      if(del) deleteVoucher(del.getAttribute('data-delete-voucher'));
    });
    try{
      var sessionResult=await window.salonSupabase.auth.getSession();
      var session=sessionResult.data.session;

      if(isPasswordRecovery()){
        try{ await window.salonSupabase.auth.signOut({scope:'local'}); }catch(_){}
        var recoveryArtifact=getInviteArtifact();
        if(recoveryArtifact.code){
          var recoveryExchange=await window.salonSupabase.auth.exchangeCodeForSession(recoveryArtifact.code);
          if(recoveryExchange.error) throw recoveryExchange.error;
        }
        var recoverySession=await waitForAuthSession(5000);
        if(!recoverySession){showLogin();message('This password reset link is missing or has expired. Please request a new reset email.','error');return;}
        state.currentUserId=recoverySession.user.id;
        showPasswordSetup('recovery');
        return;
      }

      if(isInviteSetup()){
        // Invitation flow has priority over normal CRM authorization.  This is
        // critical when a different CRM user was already logged into this
        // browser: the invite session must be established first.
        var inviteSession=await establishInviteSession();
        if(inviteSession){
          state.currentUserId=inviteSession.user.id;
          showPasswordSetup('invite');
          return;
        }

        // Never fall through to the normal CRM login with an unrelated old
        // session when an invitation URL is present. That old session would
        // make the invitation appear to work for the wrong account.
        try{ await window.salonSupabase.auth.signOut({scope:'local'}); }catch(_){}
        showLogin();
        message('This invitation link is missing or has expired. Please open the latest invitation email again.','error');
        return;
      }

      if(await requireAdmin()){
        session=(await window.salonSupabase.auth.getSession()).data.session;
        state.currentUserId=session&&session.user?session.user.id:null;
        await loadAccess();
        if(state.mustChangePassword){ showPasswordSetup('forced'); return; }
        $('current-user-email').textContent=session&&session.user?session.user.email:'CRM user';
        await loadRoles();
        await loadData();
        await loadUsers();
        if(can('settings','read')) await loadApplicationSettings();
        if(can('faqs','read')) await loadFaqs();
        if(can('bookings','read')) await loadBookings();
    if(can('contact-messages','read')) await loadContactMessages();
        // Restore the user's last authorized view BEFORE revealing the CRM.
        // This prevents a refresh from briefly showing the dashboard.
        restoreLastView();
        showApp();
      } else showLogin();
    } catch(e){console.error(e);showLogin();message(e&&e.message?e.message:'Could not initialize CRM authentication.','error');}
    finally {
      document.documentElement.classList.remove('crm-auth-pending');
    }

    // Customer actions are called from admin.html inline handlers, so expose them
    // only after the customer functions have been created inside this scope.
    window.viewCustomer = viewCustomer;
    window.editCustomer = editCustomer;
    window.startCustomerCreate = startCustomerCreate;
    window.deleteCustomer = deleteCustomer;
  });
  var bookingConfigState = { settings: null, rules: [], editingRuleId: null };

  // Booking blackout timestamps are treated as local wall-clock values.
  // We encode them with a Z suffix when writing so the same clock components
  // survive whether the Supabase column is timestamptz or timestamp without
  // time zone. We never let the browser convert the stored wall-clock value
  // between time zones when putting it back into the datetime-local input.
  function formatBlackoutDateTime(value) {
    if(!value) return '—';
    var raw=String(value).trim().replace(' ','T');
    var match=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if(!match) return String(value);
    var d=new Date(match[1]+'T'+match[2]+':00');
    if(Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function bookingRuleLabel(r) {
    return formatBlackoutDateTime(r.starts_at)+' → '+formatBlackoutDateTime(r.ends_at);
  }

  function renderBookingRules() {
    var body=$('booking-rules-body'); if(!body)return;
    var rows=bookingConfigState.rules.slice().sort(function(a,b){
      return String(b.starts_at||'').localeCompare(String(a.starts_at||''));
    });
    if(!rows.length){
      body.innerHTML='<tr><td colspan="2" class="crm-empty">No booking blocks configured.</td></tr>';
      return;
    }
    body.innerHTML=rows.map(function(r){
      return '<tr>'+
        '<td><strong>'+escapeHtml(bookingRuleLabel(r))+'</strong></td>'+
        '<td><div class="crm-row-actions"><button type="button" class="crm-btn crm-btn-secondary edit-booking-rule" data-id="'+r.id+'">Edit</button><button type="button" class="crm-btn crm-btn-danger delete-booking-rule" data-id="'+r.id+'">Delete</button></div></td>'+
      '</tr>';
    }).join('');
    body.querySelectorAll('.edit-booking-rule').forEach(function(b){
      b.addEventListener('click',function(){openBookingRuleForm(Number(b.dataset.id));});
    });
    body.querySelectorAll('.delete-booking-rule').forEach(function(b){
      b.addEventListener('click',async function(){
        if(!confirm('Delete this booking block?'))return;
        try{
          await window.salonDatabase.deleteBookingScheduleRule(Number(b.dataset.id));
          await loadBookingConfig();
          message('Booking block deleted.','success');
        }catch(e){
          console.error(e);
          message(e.message||'Could not delete booking block.','error');
        }
      });
    });
  }

  function toLocalDateTimeInput(value) {
    if(!value) return '';
    var raw=String(value).trim().replace(' ','T');
    var match=raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    return match ? match[1]+'T'+match[2] : '';
  }

  function localInputToStorage(value) {
    // Preserve the exact local clock selected in datetime-local.
    // The Z suffix is intentional: it makes the stored clock components
    // stable and prevents Supabase timestamptz from shifting them.
    return value + ':00Z';
  }

  function openBookingRuleForm(id) {
    bookingConfigState.editingRuleId=id||null;
    var r=id?bookingConfigState.rules.find(function(x){return Number(x.id)===Number(id);}):null;
    $('booking-rule-form-title').textContent=r?'Edit booking block':'Add booking block';
    $('booking-rule-start').value=r?toLocalDateTimeInput(r.starts_at):'';
    $('booking-rule-end').value=r?toLocalDateTimeInput(r.ends_at):'';
    $('booking-rule-form-card').classList.remove('crm-hidden');
    $('booking-rule-form-card').scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function loadBookingConfig() {
    var cfg=await window.salonDatabase.getBookingConfiguration();
    bookingConfigState.settings=cfg.settings||{};
    bookingConfigState.rules=cfg.schedule||[];
    var s=bookingConfigState.settings;
    var weekdaySlot=$('booking-weekday-slot-minutes'); if(weekdaySlot) weekdaySlot.value=s.weekday_slot_minutes ?? s.slot_minutes ?? 30;
    var weekdayOpening=$('booking-weekday-opening-time'); if(weekdayOpening) weekdayOpening.value=String(s.weekday_opening_time||s.opening_time||'09:00').slice(0,5);
    var weekdayClosing=$('booking-weekday-closing-time'); if(weekdayClosing) weekdayClosing.value=String(s.weekday_closing_time||s.closing_time||'18:00').slice(0,5);
    var weekendSlot=$('booking-weekend-slot-minutes'); if(weekendSlot) weekendSlot.value=s.weekend_slot_minutes ?? 30;
    var weekendOpening=$('booking-weekend-opening-time'); if(weekendOpening) weekendOpening.value=String(s.weekend_opening_time||'10:00').slice(0,5);
    var weekendClosing=$('booking-weekend-closing-time'); if(weekendClosing) weekendClosing.value=String(s.weekend_closing_time||'16:00').slice(0,5);
    var advance=$('booking-advance-months'); if(advance) advance.value=s.advance_months??3;
    renderBookingRules();
  }

  async function saveBookingSettings(e) {
    e.preventDefault();
    try {
      var weekdaySlot=Number($('booking-weekday-slot-minutes').value);
      var weekdayOpening=$('booking-weekday-opening-time').value;
      var weekdayClosing=$('booking-weekday-closing-time').value;
      var weekendSlot=Number($('booking-weekend-slot-minutes').value);
      var weekendOpening=$('booking-weekend-opening-time').value;
      var weekendClosing=$('booking-weekend-closing-time').value;

      if(!weekdaySlot || !weekendSlot || !weekdayOpening || !weekdayClosing || !weekendOpening || !weekendClosing){
        throw new Error('Please complete both weekday and weekend schedule settings.');
      }
      if(weekdayClosing <= weekdayOpening){
        throw new Error('Weekday closing time must be after the weekday opening time.');
      }
      if(weekendClosing <= weekendOpening){
        throw new Error('Weekend closing time must be after the weekend opening time.');
      }

      await window.salonDatabase.updateBookingSettings({
        // Keep the legacy fields aligned with Monday-Friday for older integrations.
        slot_minutes:weekdaySlot,
        opening_time:weekdayOpening,
        closing_time:weekdayClosing,
        weekday_slot_minutes:weekdaySlot,
        weekday_opening_time:weekdayOpening,
        weekday_closing_time:weekdayClosing,
        weekend_slot_minutes:weekendSlot,
        weekend_opening_time:weekendOpening,
        weekend_closing_time:weekendClosing,
        advance_months:Number($('booking-advance-months').value)
      });
      await loadBookingConfig(); message('Booking settings saved.','success');
    } catch(err){ console.error(err); message(err.message||'Could not save booking settings.','error'); }
  }


  async function saveBookingRule(e) {
    e.preventDefault();
    var start=$('booking-rule-start').value;
    var end=$('booking-rule-end').value;
    if(!start || !end){message('Please choose both a start and end date/time.','error');return;}
    // datetime-local values are local wall-clock values. Compare their
    // components directly, then store the exact same components.
    if(end <= start){
      message('The end date/time must be after the start date/time.','error');return;
    }
    var payload={
      starts_at:localInputToStorage(start),
      ends_at:localInputToStorage(end)
    };
    try {
      if(bookingConfigState.editingRuleId) await window.salonDatabase.updateBookingScheduleRule(bookingConfigState.editingRuleId,payload);
      else await window.salonDatabase.createBookingScheduleRule(payload);
      $('booking-rule-form-card').classList.add('crm-hidden');
      bookingConfigState.editingRuleId=null;
      await loadBookingConfig(); message('Booking block saved.','success');
    } catch(err){console.error(err);message(err.message||'Could not save booking block.','error');}
  }


  document.addEventListener('DOMContentLoaded', function(){
    var save=$('booking-settings-form'); if(save)save.addEventListener('submit',saveBookingSettings);
    var refresh=$('booking-config-refresh'); if(refresh)refresh.addEventListener('click',function(){loadBookingConfig().catch(function(e){message(e.message||'Could not load booking configuration.','error');});});
    var add=$('new-booking-rule'); if(add)add.addEventListener('click',function(){openBookingRuleForm(null);});
    var cancel=$('cancel-booking-rule'); if(cancel)cancel.addEventListener('click',function(){$('booking-rule-form-card').classList.add('crm-hidden');bookingConfigState.editingRuleId=null;});
    var form=$('booking-rule-form'); if(form)form.addEventListener('submit',saveBookingRule);
    var translationForm=$('translation-form'); if(translationForm)translationForm.addEventListener('submit',saveTranslation);
    var translationAdd=$('translation-add-btn'); if(translationAdd)translationAdd.addEventListener('click',function(){ if(can('translations','create')) openTranslationForm(null); else message('You do not have permission to create translations.','error'); });
    var translationCancel=$('translation-cancel-btn'); if(translationCancel)translationCancel.addEventListener('click',closeTranslationForm);
    var translationSearch=$('translation-search'); if(translationSearch)translationSearch.addEventListener('input',renderTranslations);
    var translationBody=$('translation-table-body'); if(translationBody)translationBody.addEventListener('click',function(e){
      var button=e.target.closest('[data-edit-translation]');
      if(button) openTranslationForm(button.getAttribute('data-edit-translation'));
    });
    var startInput=$('booking-rule-start');
    var endInput=$('booking-rule-end');
    if(startInput && endInput){
      startInput.addEventListener('change',function(){
        if(startInput.value) endInput.min=startInput.value;
        if(endInput.value && endInput.value<=startInput.value) endInput.value='';
      });
    }
    document.querySelectorAll('[data-view="booking-config"]').forEach(function(btn){btn.addEventListener('click',function(){loadBookingConfig().catch(function(e){console.error(e);message(e.message||'Could not load booking configuration.','error');});});});
    if($('journal-entry-add')) $('journal-entry-add').addEventListener('click',function(){openJournalForm(null);});
    if($('journal-entry-cancel')) $('journal-entry-cancel').addEventListener('click',resetJournalForm);
    if($('journal-line-add')) $('journal-line-add').addEventListener('click',function(){addJournalLine({});});
    if($('journal-entry-form')) $('journal-entry-form').addEventListener('submit',function(e){saveJournalEntry(e,false);});
    if($('journal-entry-post')) $('journal-entry-post').addEventListener('click',function(e){saveJournalEntry(e,true);});
    if($('journal-lines-body')) $('journal-lines-body').addEventListener('input',updateJournalBalance);
    if($('journal-lines-body')) $('journal-lines-body').addEventListener('click',function(e){var b=e.target.closest('[data-remove-journal-line]');if(b){b.closest('[data-journal-line]').remove();updateJournalBalance();}});
    if($('journal-entries-body')) $('journal-entries-body').addEventListener('click',function(e){var x=e.target.closest('[data-edit-journal]');if(x)openJournalForm(x.dataset.editJournal);var d=e.target.closest('[data-delete-journal]');if(d)deleteJournal(d.dataset.deleteJournal);var p=e.target.closest('[data-post-journal]');if(p)postJournal(p.dataset.postJournal);});
    ['journal-search','journal-status-filter','journal-date-from','journal-date-to'].forEach(function(id){var el=$(id);if(el)el.addEventListener(el.tagName==='INPUT'?'input':'change',loadJournalEntries);});
    ['ledger-search','ledger-account-filter','ledger-date-from','ledger-date-to'].forEach(function(id){var el=$(id);if(el)el.addEventListener(el.tagName==='INPUT'?'input':'change',loadGeneralLedger);});
    ['trial-date-from','trial-date-to'].forEach(function(id){var el=$(id);if(el)el.addEventListener('change',loadTrialBalance);});
    if($('trial-refresh')) $('trial-refresh').addEventListener('click',loadTrialBalance);
    if($('statement-map-add')) $('statement-map-add').addEventListener('click',function(){openMappingForm(null);});
    if($('statement-map-cancel')) $('statement-map-cancel').addEventListener('click',function(){$('statement-map-form-card').classList.add('crm-hidden');});
    if($('statement-map-form')) $('statement-map-form').addEventListener('submit',saveMapping);
    if($('statement-map-search')) $('statement-map-search').addEventListener('input',renderStatementMappings);
    if($('statement-map-filter')) $('statement-map-filter').addEventListener('change',renderStatementMappings);
    if($('statement-map-body')) $('statement-map-body').addEventListener('click',function(e){var x=e.target.closest('[data-edit-map]');if(x)openMappingForm(x.dataset.editMap);var d=e.target.closest('[data-delete-map]');if(d)deleteMapping(d.dataset.deleteMap);});
    if($('report-refresh')) $('report-refresh').addEventListener('click',loadFinancialReport);
    if($('report-statement-select')) $('report-statement-select').addEventListener('change',loadFinancialReport);
    if($('report-date-from')) $('report-date-from').addEventListener('change',loadFinancialReport);
    if($('report-date-to')) $('report-date-to').addEventListener('change',loadFinancialReport);
    if($('period-add')) $('period-add').addEventListener('click',function(){openPeriodForm(null);});
    if($('period-cancel')) $('period-cancel').addEventListener('click',function(){$('period-form-card').classList.add('crm-hidden');});
    if($('period-form')) $('period-form').addEventListener('submit',savePeriod);
    if($('periods-body')) $('periods-body').addEventListener('click',function(e){var x=e.target.closest('[data-edit-period]');if(x)openPeriodForm(x.dataset.editPeriod);var d=e.target.closest('[data-delete-period]');if(d)deletePeriod(d.dataset.deletePeriod);});

  });

})();
