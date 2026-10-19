// Bunnieschi Shop - Cute Cafe Multi-Tenant Client Application Logic

let AUTH_TOKEN = localStorage.getItem('bunnieschi_token') || '';
let currentShop = null;
let currentAccounts = [];
let availableApps = [];
let currentFilterApp = 'all';
let currentFilterDuration = 'all';
let currentSearchTerm = '';
let activeTargetAccountId = null;
let targetAutoRefreshTimer = null;

// Multi-select state for Create Account modal
let createSelectedApps = new Set(['Netflix']);
let createSelectedDuration = '1_day';

// DOM Elements - Auth & Nav
const loginSection = document.getElementById('loginSection');
const mainApp = document.getElementById('mainApp');
const loginForm = document.getElementById('loginForm');
const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const loginError = document.getElementById('loginError');
const loginErrorText = document.getElementById('loginErrorText');
const btnLogout = document.getElementById('btnLogout');
const navTabAccounts = document.getElementById('navTabAccounts');
const navTabUniversal = document.getElementById('navTabUniversal');
const viewAccounts = document.getElementById('viewAccounts');
const viewUniversal = document.getElementById('viewUniversal');
const headerShopName = document.getElementById('headerShopName');
const heroShopName = document.getElementById('heroShopName');

// DOM Elements - Dashboard Stats & Breakdown
const statTotal = document.getElementById('statTotal');
const statNetflix = document.getElementById('statNetflix');
const statSpotify = document.getElementById('statSpotify');
const statCanva = document.getElementById('statCanva');
const statYoutube = document.getElementById('statYoutube');
const statOther = document.getElementById('statOther');

const durationBreakdownCard = document.getElementById('durationBreakdownCard');
const breakdownAppName = document.getElementById('breakdownAppName');
const breakdownAppTotal = document.getElementById('breakdownAppTotal');
const breakdownDay1 = document.getElementById('breakdownDay1');
const breakdownDay7 = document.getElementById('breakdownDay7');
const breakdownDay30 = document.getElementById('breakdownDay30');
const breakdownDayOther = document.getElementById('breakdownDayOther');

// Filter & Table
const accountSearchInput = document.getElementById('accountSearchInput');
const durationFilterSelect = document.getElementById('durationFilterSelect');
const appFilterChipsList = document.getElementById('appFilterChipsList');
const accountsTableBody = document.getElementById('accountsTableBody');
const btnOpenCreateModal = document.getElementById('btnOpenCreateModal');

// Create Account Modal
const modalCreateAccount = document.getElementById('modalCreateAccount');
const btnCloseCreateModal = document.getElementById('btnCloseCreateModal');
const createAccountForm = document.getElementById('createAccountForm');
const inputEmailPrefix = document.getElementById('inputEmailPrefix');
const inputAccountPassword = document.getElementById('inputAccountPassword');
const inputAccountNote = document.getElementById('inputAccountNote');
const btnRandomPrefix = document.getElementById('btnRandomPrefix');
const btnRandomPassword = document.getElementById('btnRandomPassword');
const durationOptionsContainer = document.getElementById('durationOptionsContainer');
const customDurationInputBox = document.getElementById('customDurationInputBox');
const inputCustomDuration = document.getElementById('inputCustomDuration');
const multiAppSelectorList = document.getElementById('multiAppSelectorList');
const btnOpenAddCustomApp = document.getElementById('btnOpenAddCustomApp');

// Add Custom App Modal
const modalAddApp = document.getElementById('modalAddApp');
const btnCloseAddApp = document.getElementById('btnCloseAddApp');
const addAppForm = document.getElementById('addAppForm');
const inputNewAppName = document.getElementById('inputNewAppName');

// Targeted OTP Modal
const modalTargetedOtp = document.getElementById('modalTargetedOtp');
const btnCloseTargetedOtp = document.getElementById('btnCloseTargetedOtp');
const targetEmailTitle = document.getElementById('targetEmailTitle');
const targetAppTag = document.getElementById('targetAppTag');
const targetOtpLoading = document.getElementById('targetOtpLoading');
const targetOtpResult = document.getElementById('targetOtpResult');
const targetOtpEmpty = document.getElementById('targetOtpEmpty');
const targetEmptyMessage = document.getElementById('targetEmptyMessage');
const targetOtpValue = document.getElementById('targetOtpValue');
const btnCopyTargetOtp = document.getElementById('btnCopyTargetOtp');
const targetCopyBtnText = document.getElementById('targetCopyBtnText');
const targetEmailDetails = document.getElementById('targetEmailDetails');
const targetSubject = document.getElementById('targetSubject');
const targetFrom = document.getElementById('targetFrom');
const targetDate = document.getElementById('targetDate');
const btnRetryTargetOtp = document.getElementById('btnRetryTargetOtp');
const chkTargetAutoRefresh = document.getElementById('chkTargetAutoRefresh');

// Domain Settings Modal
const modalDomainSettings = document.getElementById('modalDomainSettings');
const btnOpenDomainSettings = document.getElementById('btnOpenDomainSettings');
const btnCloseDomainSettings = document.getElementById('btnCloseDomainSettings');
const domainSettingsForm = document.getElementById('domainSettingsForm');
const setImapHost = document.getElementById('setImapHost');
const setImapPort = document.getElementById('setImapPort');
const setUseCatchAll = document.getElementById('setUseCatchAll');
const catchAllInputs = document.getElementById('catchAllInputs');
const setCatchAllEmail = document.getElementById('setCatchAllEmail');
const setCatchAllPassword = document.getElementById('setCatchAllPassword');

// Change Password Modal
const modalChangePass = document.getElementById('modalChangePass');
const btnOpenChangePass = document.getElementById('btnOpenChangePass');
const btnCloseChangePass = document.getElementById('btnCloseChangePass');
const changePassForm = document.getElementById('changePassForm');
const chgCurrentPass = document.getElementById('chgCurrentPass');
const chgNewUser = document.getElementById('chgNewUser');
const chgNewPass = document.getElementById('chgNewPass');
const toastContainer = document.getElementById('toastContainer');

// Universal Tab Elements
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const filterQuery = document.getElementById('filterQuery');
const btnFetchLatest = document.getElementById('btnFetchLatest');
const fetchIcon = document.getElementById('fetchIcon');
const fetchBtnText = document.getElementById('fetchBtnText');
const otpPlaceholder = document.getElementById('otpPlaceholder');
const otpFoundBox = document.getElementById('otpFoundBox');
const otpCode = document.getElementById('otpCode');
const btnCopyOtp = document.getElementById('btnCopyOtp');
const copyBtnText = document.getElementById('copyBtnText');
const emailMetaSection = document.getElementById('emailMetaSection');
const emailSubject = document.getElementById('emailSubject');
const emailFrom = document.getElementById('emailFrom');
const emailDate = document.getElementById('emailDate');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) lucide.createIcons();
  setupEventListeners();
  await checkAuth();
});

function setupEventListeners() {
  loginForm.addEventListener('submit', handleLogin);
  btnLogout.addEventListener('click', handleLogout);

  navTabAccounts.addEventListener('click', () => switchTab('accounts'));
  navTabUniversal.addEventListener('click', () => switchTab('universal'));

  // Search input
  let searchTimeout = null;
  accountSearchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentSearchTerm = e.target.value.trim();
      renderAccountsTable();
    }, 200);
  });

  // Duration Filter
  durationFilterSelect.addEventListener('change', (e) => {
    currentFilterDuration = e.target.value;
    renderAccountsTable();
  });

  // Create Modal
  btnOpenCreateModal.addEventListener('click', () => {
    modalCreateAccount.classList.remove('hidden');
    inputEmailPrefix.focus();
  });
  btnCloseCreateModal.addEventListener('click', () => modalCreateAccount.classList.add('hidden'));
  modalCreateAccount.addEventListener('click', (e) => {
    if (e.target === modalCreateAccount) modalCreateAccount.classList.add('hidden');
  });

  btnRandomPrefix.addEventListener('click', () => {
    const prefixes = ['netflix_th', 'spotify_vip', 'canva_pro', 'yt_premium', 'chatgpt_user', 'bunnies_acc', 'plus_th'];
    inputEmailPrefix.value = prefixes[Math.floor(Math.random() * prefixes.length)] + Math.floor(100 + Math.random() * 900);
  });

  btnRandomPassword.addEventListener('click', () => {
    inputAccountPassword.value = generateStrongPassword();
    showToast('สุ่มรหัสผ่านปลอดภัยเรียบร้อย', 'info');
  });

  // Duration Selector in Create Modal
  durationOptionsContainer.querySelectorAll('.duration-card').forEach(card => {
    card.addEventListener('click', () => {
      durationOptionsContainer.querySelectorAll('.duration-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      createSelectedDuration = card.getAttribute('data-duration');
      customDurationInputBox.classList.toggle('hidden', createSelectedDuration !== 'other');
      if (createSelectedDuration === 'other') {
        inputCustomDuration.focus();
      }
    });
  });

  // Add Custom App modal
  btnOpenAddCustomApp.addEventListener('click', () => {
    modalAddApp.classList.remove('hidden');
    inputNewAppName.focus();
  });
  btnCloseAddApp.addEventListener('click', () => modalAddApp.classList.add('hidden'));
  modalAddApp.addEventListener('click', (e) => {
    if (e.target === modalAddApp) modalAddApp.classList.add('hidden');
  });
  addAppForm.addEventListener('submit', handleAddCustomApp);

  createAccountForm.addEventListener('submit', handleCreateAccount);

  // Targeted OTP modal
  btnCloseTargetedOtp.addEventListener('click', closeTargetedOtpModal);
  modalTargetedOtp.addEventListener('click', (e) => {
    if (e.target === modalTargetedOtp) closeTargetedOtpModal();
  });
  btnRetryTargetOtp.addEventListener('click', () => {
    if (activeTargetAccountId) fetchTargetedOtp(activeTargetAccountId);
  });
  btnCopyTargetOtp.addEventListener('click', () => {
    copyToClipboard(targetOtpValue.textContent.trim(), 'คัดลอกรหัส OTP เรียบร้อย');
  });
  chkTargetAutoRefresh.addEventListener('change', (e) => {
    if (e.target.checked) startTargetAutoRefresh();
    else stopTargetAutoRefresh();
  });

  // Domain Settings
  btnOpenDomainSettings.addEventListener('click', openDomainSettingsModal);
  btnCloseDomainSettings.addEventListener('click', () => modalDomainSettings.classList.add('hidden'));
  modalDomainSettings.addEventListener('click', (e) => {
    if (e.target === modalDomainSettings) modalDomainSettings.classList.add('hidden');
  });
  setUseCatchAll.addEventListener('change', (e) => {
    catchAllInputs.classList.toggle('hidden', !e.target.checked);
  });
  domainSettingsForm.addEventListener('submit', handleSaveSettings);

  // Change Password
  btnOpenChangePass.addEventListener('click', () => modalChangePass.classList.remove('hidden'));
  btnCloseChangePass.addEventListener('click', () => modalChangePass.classList.add('hidden'));
  modalChangePass.addEventListener('click', (e) => {
    if (e.target === modalChangePass) modalChangePass.classList.add('hidden');
  });
  changePassForm.addEventListener('submit', handleChangePassword);

  // Universal OTP Fetch
  btnFetchLatest.addEventListener('click', fetchUniversalLatest);
  btnCopyOtp.addEventListener('click', () => {
    copyToClipboard(otpCode.textContent.trim(), 'คัดลอกรหัส OTP เรียบร้อย');
  });
}

function generateStrongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let pass = '';
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}

function switchTab(tab) {
  if (tab === 'accounts') {
    navTabAccounts.className = 'px-3.5 py-1.5 rounded-xl bg-[#7B4B27] text-white text-xs font-bold flex items-center gap-1.5 transition-all';
    navTabUniversal.className = 'px-3.5 py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#F3ECE2] text-[#7B4B27] text-xs font-semibold flex items-center gap-1.5 transition-all border border-[#EADBC8]';
    viewAccounts.classList.remove('hidden');
    viewUniversal.classList.add('hidden');
    loadAccounts();
  } else {
    navTabUniversal.className = 'px-3.5 py-1.5 rounded-xl bg-[#7B4B27] text-white text-xs font-bold flex items-center gap-1.5 transition-all';
    navTabAccounts.className = 'px-3.5 py-1.5 rounded-xl bg-[#FAF6F0] hover:bg-[#F3ECE2] text-[#7B4B27] text-xs font-semibold flex items-center gap-1.5 transition-all border border-[#EADBC8]';
    viewUniversal.classList.remove('hidden');
    viewAccounts.classList.add('hidden');
  }
  if (window.lucide) lucide.createIcons();
}

// ==========================================
// AUTHENTICATION LOGIC (Multi-Tenant)
// ==========================================

async function checkAuth() {
  if (!AUTH_TOKEN) {
    showLoginView();
    return;
  }

  try {
    const res = await fetch('/api/auth/check', {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (data.authenticated && data.shop) {
      currentShop = data.shop;
      applyShopBranding(data.shop);
      showDashboardView();
      await loadAppPresets();
      await loadAccounts();
    } else {
      showLoginView();
    }
  } catch (err) {
    showLoginView();
  }
}

function applyShopBranding(shop) {
  if (shop && shop.shopName) {
    headerShopName.textContent = shop.shopName;
    heroShopName.textContent = shop.shopName;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  loginError.classList.add('hidden');

  const username = loginUser.value.trim();
  const password = loginPass.value.trim();

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }

    AUTH_TOKEN = data.token;
    localStorage.setItem('bunnieschi_token', AUTH_TOKEN);
    currentShop = data.shop;
    applyShopBranding(data.shop);
    showDashboardView();
    await loadAppPresets();
    await loadAccounts();
    showToast(`เข้าสู่ระบบร้าน "${data.shop.shopName}" สำเร็จ`, 'success');
  } catch (err) {
    loginErrorText.textContent = err.message;
    loginError.classList.remove('hidden');
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
  } catch (e) {}

  AUTH_TOKEN = '';
  currentShop = null;
  localStorage.removeItem('bunnieschi_token');
  showLoginView();
  showToast('ออกจากระบบเรียบร้อย', 'info');
}

function showLoginView() {
  loginSection.classList.remove('hidden');
  mainApp.classList.add('hidden');
  loginPass.value = '';
}

function showDashboardView() {
  loginSection.classList.add('hidden');
  mainApp.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = chgCurrentPass.value.trim();
  const newUsername = chgNewUser.value.trim();
  const newPassword = chgNewPass.value.trim();

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ currentPassword, newUsername, newPassword })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'เปลี่ยนรหัสผ่านไม่สำเร็จ');

    showToast('เปลี่ยนรหัสผ่านสำเร็จแล้ว', 'success');
    modalChangePass.classList.add('hidden');
    changePassForm.reset();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// APP PRESETS & MULTI-SELECT SETUP
// ==========================================

async function loadAppPresets() {
  try {
    const res = await fetch('/api/app-presets', {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    availableApps = data.apps || ['Netflix', 'Spotify', 'Canva Pro', 'YouTube Premium'];
    renderFilterChips();
    renderMultiAppSelector();
  } catch (e) {
    availableApps = ['Netflix', 'Spotify', 'Canva Pro', 'YouTube Premium'];
  }
}

function renderFilterChips() {
  appFilterChipsList.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `app-chip px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all border-2 ${
    currentFilterApp === 'all'
      ? 'bg-[#7B4B27] text-white border-[#7B4B27]'
      : 'bg-white text-[#7B4B27] border-[#EADBC8] hover:border-[#F4ACB7]'
  }`;
  allBtn.textContent = 'ทั้งหมด';
  allBtn.addEventListener('click', () => {
    currentFilterApp = 'all';
    durationBreakdownCard.classList.add('hidden');
    renderFilterChips();
    renderAccountsTable();
  });
  appFilterChipsList.appendChild(allBtn);

  availableApps.forEach(appName => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = currentFilterApp.toLowerCase() === appName.toLowerCase();
    btn.className = `app-chip px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border-2 ${
      isSelected
        ? 'bg-[#F4ACB7] text-[#583116] border-[#D88390] font-bold'
        : 'bg-white text-[#4A3525] border-[#EADBC8] hover:border-[#F4ACB7]'
    }`;
    btn.textContent = appName;
    btn.addEventListener('click', () => {
      currentFilterApp = appName;
      updateDurationBreakdown(appName);
      renderFilterChips();
      renderAccountsTable();
    });
    appFilterChipsList.appendChild(btn);
  });
}

function renderMultiAppSelector() {
  multiAppSelectorList.innerHTML = '';
  availableApps.forEach(appName => {
    const isChecked = createSelectedApps.has(appName);
    const badge = document.createElement('div');
    badge.className = `app-select-badge px-2.5 py-1 text-xs flex items-center gap-1.5 ${
      isChecked ? 'selected' : 'text-[#4A3525]'
    }`;
    badge.innerHTML = `
      <i data-lucide="${isChecked ? 'check-square' : 'square'}" class="w-3.5 h-3.5 ${isChecked ? 'text-[#7B4B27]' : 'text-[#8C7A6B]'}"></i>
      <span>${escapeHtml(appName)}</span>
    `;

    badge.addEventListener('click', () => {
      if (createSelectedApps.has(appName)) {
        createSelectedApps.delete(appName);
      } else {
        createSelectedApps.add(appName);
      }
      renderMultiAppSelector();
    });

    multiAppSelectorList.appendChild(badge);
  });

  if (window.lucide) lucide.createIcons();
}

async function handleAddCustomApp(e) {
  e.preventDefault();
  const newName = inputNewAppName.value.trim();
  if (!newName) return;

  try {
    const res = await fetch('/api/app-presets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'เพิ่มแอปไม่สำเร็จ');

    availableApps = data.apps;
    createSelectedApps.add(newName);
    renderFilterChips();
    renderMultiAppSelector();
    modalAddApp.classList.add('hidden');
    addAppForm.reset();
    showToast(`เพิ่มแอป "${newName}" เรียบร้อย`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// ACCOUNTS CRUD & DURATION BREAKDOWN STATS
// ==========================================

async function loadAccounts() {
  try {
    const res = await fetch('/api/accounts', {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    if (res.status === 401) {
      showLoginView();
      return;
    }
    const data = await res.json();
    currentAccounts = data.accounts || [];
    updateStatistics();
    if (currentFilterApp !== 'all') {
      updateDurationBreakdown(currentFilterApp);
    }
    renderAccountsTable();
  } catch (err) {
    console.error('Failed to load accounts:', err);
  }
}

function updateStatistics() {
  statTotal.textContent = currentAccounts.length;

  const countForApp = (term) => currentAccounts.filter(a => {
    const appsList = Array.isArray(a.apps) ? a.apps : [a.app || ''];
    return appsList.some(app => app.toLowerCase().includes(term.toLowerCase()));
  }).length;

  statNetflix.textContent = countForApp('netflix');
  statSpotify.textContent = countForApp('spotify');
  statCanva.textContent = countForApp('canva');
  statYoutube.textContent = countForApp('youtube');

  statOther.textContent = currentAccounts.filter(a => {
    const appsList = Array.isArray(a.apps) ? a.apps : [a.app || ''];
    return !appsList.some(app => {
      const lower = app.toLowerCase();
      return lower.includes('netflix') || lower.includes('spotify') || lower.includes('canva') || lower.includes('youtube');
    });
  }).length;
}

function updateDurationBreakdown(appName) {
  const matchingAccounts = currentAccounts.filter(a => {
    const appsList = Array.isArray(a.apps) ? a.apps : [a.app || ''];
    return appsList.some(app => app.toLowerCase() === appName.toLowerCase());
  });

  breakdownAppName.textContent = appName;
  breakdownAppTotal.textContent = `รวม ${matchingAccounts.length} บัญชี`;

  const d1 = matchingAccounts.filter(a => a.duration === '1_day').length;
  const d7 = matchingAccounts.filter(a => a.duration === '7_days').length;
  const d30 = matchingAccounts.filter(a => !a.duration || a.duration === '30_days').length;
  const dOther = matchingAccounts.filter(a => a.duration === 'other').length;

  breakdownDay1.textContent = d1;
  breakdownDay7.textContent = d7;
  breakdownDay30.textContent = d30;
  breakdownDayOther.textContent = dOther;

  durationBreakdownCard.classList.remove('hidden');
}

function renderAccountsTable() {
  let filtered = currentAccounts;

  if (currentFilterApp && currentFilterApp !== 'all') {
    filtered = filtered.filter(a => {
      const appsList = Array.isArray(a.apps) ? a.apps : [a.app || ''];
      return appsList.some(app => app.toLowerCase() === currentFilterApp.toLowerCase());
    });
  }

  if (currentFilterDuration && currentFilterDuration !== 'all') {
    filtered = filtered.filter(a => {
      if (currentFilterDuration === '30_days') {
        return !a.duration || a.duration === '30_days';
      }
      return a.duration === currentFilterDuration;
    });
  }

  if (currentSearchTerm) {
    const term = currentSearchTerm.toLowerCase();
    filtered = filtered.filter(a => {
      const emailMatch = a.email && a.email.toLowerCase().includes(term);
      const noteMatch = a.note && a.note.toLowerCase().includes(term);
      const appsList = Array.isArray(a.apps) ? a.apps : [a.app || ''];
      const appMatch = appsList.some(app => app.toLowerCase().includes(term));
      return emailMatch || noteMatch || appMatch;
    });
  }

  if (filtered.length === 0) {
    accountsTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="py-12 text-center text-[#8C7A6B]">
          <div class="flex flex-col items-center justify-center gap-2">
            <i data-lucide="inbox" class="w-8 h-8 text-[#8C7A6B]"></i>
            <span>ไม่พบบัญชีที่ตรงกับเงื่อนไขในร้านของคุณ</span>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  accountsTableBody.innerHTML = '';
  filtered.forEach(acc => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-[#FFF9DB]/40 transition-colors';

    const durationBadge = formatDurationBadge(acc.duration, acc.durationCustom);

    const appsList = Array.isArray(acc.apps) && acc.apps.length > 0 ? acc.apps : [acc.app || 'Other'];
    const appsBadgesHtml = appsList.map(app => `
      <span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border border-[#EADBC8] bg-[#FDE8EC] text-[#7B4B27]">
        ${escapeHtml(app)}
      </span>
    `).join(' ');

    tr.innerHTML = `
      <!-- Email -->
      <td class="py-3 px-4 font-mono">
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-[#4A3525] select-all">${escapeHtml(acc.email)}</span>
          <button type="button" class="btn-copy-email text-[#8C7A6B] hover:text-[#7B4B27] p-1 rounded" title="คัดลอกอีเมล">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>

      <!-- Password -->
      <td class="py-3 px-4 font-mono">
        <div class="flex items-center gap-1.5">
          <span class="acc-pass-masked text-[#8C7A6B]">••••••••</span>
          <span class="acc-pass-raw hidden text-[#583116] select-all font-bold">${escapeHtml(acc.password)}</span>
          <button type="button" class="btn-toggle-pass text-[#8C7A6B] hover:text-[#4A3525] p-1" title="ดู/ซ่อนรหัสผ่าน">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" class="btn-copy-pass text-[#8C7A6B] hover:text-[#D88390] p-1" title="คัดลอกรหัสผ่าน">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>

      <!-- Multi-Apps -->
      <td class="py-3 px-4">
        <div class="flex flex-wrap gap-1 max-w-xs">
          ${appsBadgesHtml}
        </div>
      </td>

      <!-- Duration -->
      <td class="py-3 px-4">
        ${durationBadge}
      </td>

      <!-- Note / Customer -->
      <td class="py-3 px-4 text-[#583116] max-w-xs truncate">
        ${escapeHtml(acc.note || '-')}
      </td>

      <!-- Status -->
      <td class="py-3 px-4">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
          acc.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
        }">
          <span class="w-1.5 h-1.5 rounded-full ${acc.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}"></span>
          <span>${acc.status === 'active' ? 'ใช้งานอยู่' : 'สำรองไว้'}</span>
        </span>
      </td>

      <!-- Last OTP -->
      <td class="py-3 px-4 font-mono">
        ${
          acc.lastOtp
            ? `<button type="button" class="btn-copy-last-otp px-2 py-0.5 rounded-lg bg-[#FFF9DB] border border-[#F9D776] text-[#7B4B27] font-bold text-xs hover:bg-[#FEE440] transition-all flex items-center gap-1" title="คลิกเพื่อคัดลอก OTP">
                <span>${acc.lastOtp.code}</span>
                <i data-lucide="copy" class="w-3 h-3 text-[#7B4B27]"></i>
              </button>`
            : `<span class="text-[#8C7A6B] text-[11px]">-</span>`
        }
      </td>

      <!-- Actions -->
      <td class="py-3 px-4 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button type="button" class="btn-fetch-otp px-3 py-1.5 bg-[#7B4B27] hover:bg-[#583116] text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5">
            <i data-lucide="mail-search" class="w-3.5 h-3.5"></i>
            <span>ดึง OTP</span>
          </button>
          <button type="button" class="btn-delete-acc p-1.5 text-[#8C7A6B] hover:text-rose-600 rounded-lg transition-colors" title="ลบบัญชีนี้">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.btn-copy-email').addEventListener('click', () => {
      copyToClipboard(acc.email, `คัดลอกอีเมล ${acc.email} แล้ว`);
    });

    const toggleBtn = tr.querySelector('.btn-toggle-pass');
    const maskedSpan = tr.querySelector('.acc-pass-masked');
    const rawSpan = tr.querySelector('.acc-pass-raw');
    toggleBtn.addEventListener('click', () => {
      const isHidden = rawSpan.classList.contains('hidden');
      rawSpan.classList.toggle('hidden', !isHidden);
      maskedSpan.classList.toggle('hidden', isHidden);
      toggleBtn.innerHTML = isHidden
        ? `<i data-lucide="eye-off" class="w-3.5 h-3.5"></i>`
        : `<i data-lucide="eye" class="w-3.5 h-3.5"></i>`;
      if (window.lucide) lucide.createIcons();
    });

    tr.querySelector('.btn-copy-pass').addEventListener('click', () => {
      copyToClipboard(acc.password, `คัดลอกรหัสผ่านแล้ว`);
    });

    const copyLastOtpBtn = tr.querySelector('.btn-copy-last-otp');
    if (copyLastOtpBtn) {
      copyLastOtpBtn.addEventListener('click', () => {
        copyToClipboard(acc.lastOtp.code, `คัดลอกรหัส OTP "${acc.lastOtp.code}" แล้ว`);
      });
    }

    tr.querySelector('.btn-fetch-otp').addEventListener('click', () => {
      openTargetedOtpModal(acc);
    });

    tr.querySelector('.btn-delete-acc').addEventListener('click', () => {
      if (confirm(`คุณต้องการลบบัญชี ${acc.email} ใช่หรือไม่?`)) {
        deleteAccount(acc.id);
      }
    });

    accountsTableBody.appendChild(tr);
  });

  if (window.lucide) lucide.createIcons();
}

function formatDurationBadge(duration, custom) {
  if (duration === '1_day') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#FFF9DB] text-[#7B4B27] border border-[#F9D776]">1 วัน</span>`;
  }
  if (duration === '7_days') {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#FDE8EC] text-[#D88390] border border-[#F4ACB7]">7 วัน</span>`;
  }
  if (duration === '30_days' || !duration) {
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#FAF6F0] text-[#7B4B27] border border-[#EADBC8]">30 วัน</span>`;
  }
  const text = custom ? escapeHtml(custom) : 'อื่นๆ';
  return `<span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#F8F3EC] text-[#583116] border border-[#EADBC8]">${text}</span>`;
}

// Create Account Submit
async function handleCreateAccount(e) {
  e.preventDefault();
  const emailPrefix = inputEmailPrefix.value.trim();
  const password = inputAccountPassword.value.trim();
  const note = inputAccountNote.value.trim();
  const durationCustom = inputCustomDuration.value.trim();

  if (!emailPrefix || !password) {
    showToast('กรุณากรอกชื่ออีเมลและรหัสผ่าน', 'error');
    return;
  }

  const selectedAppsArray = Array.from(createSelectedApps);
  if (selectedAppsArray.length === 0) {
    showToast('กรุณาเลือกอย่างน้อย 1 แอปพรีเมี่ยม', 'error');
    return;
  }

  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        emailPrefix,
        password,
        apps: selectedAppsArray,
        duration: createSelectedDuration,
        durationCustom,
        note,
        status: 'active'
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'สร้างบัญชีไม่สำเร็จ');
    }

    showToast(`สร้างบัญชี ${data.account.email} สำเร็จเรียบร้อย`, 'success');
    modalCreateAccount.classList.add('hidden');
    createAccountForm.reset();
    createSelectedApps = new Set(['Netflix']);
    createSelectedDuration = '1_day';
    renderMultiAppSelector();
    loadAccounts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAccount(id) {
  try {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'ลบบัญชีไม่สำเร็จ');

    showToast('ลบบัญชีเรียบร้อย', 'info');
    loadAccounts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// TARGETED OTP FETCHING
// ==========================================

function openTargetedOtpModal(account) {
  activeTargetAccountId = account.id;
  targetEmailTitle.textContent = account.email;
  const appsList = Array.isArray(account.apps) ? account.apps.join(', ') : (account.app || 'ทั่วไป');
  targetAppTag.textContent = `แอป: ${appsList} | อายุแอค: ${account.duration === '1_day' ? '1 วัน' : account.duration === '7_days' ? '7 วัน' : '30 วัน'}`;

  modalTargetedOtp.classList.remove('hidden');
  fetchTargetedOtp(account.id);
}

function closeTargetedOtpModal() {
  stopTargetAutoRefresh();
  chkTargetAutoRefresh.checked = false;
  activeTargetAccountId = null;
  modalTargetedOtp.classList.add('hidden');
}

async function fetchTargetedOtp(accountId) {
  targetOtpLoading.classList.remove('hidden');
  targetOtpResult.classList.add('hidden');
  targetOtpEmpty.classList.add('hidden');
  targetEmailDetails.classList.add('hidden');

  try {
    const res = await fetch(`/api/accounts/${accountId}/fetch-otp`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });

    const data = await res.json();
    targetOtpLoading.classList.add('hidden');

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'ไม่สามารถดึงข้อมูลจดหมายได้');
    }

    if (!data.hasEmail) {
      targetOtpEmpty.classList.remove('hidden');
      targetEmptyMessage.textContent = data.message || 'ยังไม่มีจดหมายส่งถึงเมลนี้';
      return;
    }

    const emailData = data.data;
    if (emailData.otp) {
      targetOtpValue.textContent = emailData.otp;
      btnCopyTargetOtp.classList.remove('hidden');
      targetCopyBtnText.textContent = `คัดลอกรหัส ${emailData.otp}`;
    } else {
      targetOtpValue.textContent = 'ไม่พบรหัส OTP';
      btnCopyTargetOtp.classList.add('hidden');
    }

    targetSubject.textContent = emailData.subject || '(ไม่มีหัวข้อ)';
    targetFrom.textContent = emailData.from || '(ไม่ทราบผู้ส่ง)';
    targetDate.textContent = formatThaiDateTime(emailData.date);

    targetOtpResult.classList.remove('hidden');
    targetEmailDetails.classList.remove('hidden');

    if (emailData.otp) {
      const idx = currentAccounts.findIndex(a => a.id === accountId);
      if (idx !== -1) {
        currentAccounts[idx].lastOtp = { code: emailData.otp, subject: emailData.subject };
        renderAccountsTable();
      }
    }

    showToast('ดึงจดหมายและ OTP สำเร็จ', 'success');
  } catch (err) {
    targetOtpLoading.classList.add('hidden');
    targetOtpEmpty.classList.remove('hidden');
    targetEmptyMessage.textContent = `ข้อผิดพลาด: ${err.message}`;
    showToast(err.message, 'error');
  }
}

function startTargetAutoRefresh() {
  stopTargetAutoRefresh();
  targetAutoRefreshTimer = setInterval(() => {
    if (activeTargetAccountId) fetchTargetedOtp(activeTargetAccountId);
  }, 5000);
}

function stopTargetAutoRefresh() {
  if (targetAutoRefreshTimer) {
    clearInterval(targetAutoRefreshTimer);
    targetAutoRefreshTimer = null;
  }
}

// ==========================================
// DOMAIN SETTINGS
// ==========================================

async function openDomainSettingsModal() {
  modalDomainSettings.classList.remove('hidden');
  try {
    const res = await fetch('/api/settings', {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    const data = await res.json();
    if (data.success && data.settings) {
      const s = data.settings;
      setImapHost.value = s.imapHost || 'mail.bunnieschi.com';
      setImapPort.value = s.imapPort || 993;
      setUseCatchAll.checked = s.useCatchAll !== undefined ? s.useCatchAll : true;
      catchAllInputs.classList.toggle('hidden', !setUseCatchAll.checked);
      setCatchAllEmail.value = s.catchAllEmail || 'mikibun@bunnieschi.com';
      setCatchAllPassword.value = '';
    }
  } catch (e) {}
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const payload = {
    imapHost: setImapHost.value.trim(),
    imapPort: parseInt(setImapPort.value.trim(), 10) || 993,
    useCatchAll: setUseCatchAll.checked,
    catchAllEmail: setCatchAllEmail.value.trim() || 'mikibun@bunnieschi.com',
    catchAllPassword: setCatchAllPassword.value.trim()
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'บันทึกการตั้งค่าไม่สำเร็จ');

    showToast('บันทึกการตั้งค่าเซิร์ฟเวอร์เรียบร้อย', 'success');
    modalDomainSettings.classList.add('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// UNIVERSAL TAB LOGIC
// ==========================================

async function fetchUniversalLatest() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    showToast('กรุณากรอกอีเมลและรหัสผ่าน', 'error');
    return;
  }

  fetchIcon.classList.add('animate-spin');
  btnFetchLatest.disabled = true;

  try {
    const res = await fetch('/api/fetch-latest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        filterQuery: filterQuery.value.trim()
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'ไม่สามารถดึงข้อมูลได้');

    if (!data.hasEmail) {
      showToast(data.message || 'ไม่พบจดหมายล่าสุด', 'info');
      return;
    }

    const emailData = data.data;
    otpPlaceholder.classList.add('hidden');
    otpFoundBox.classList.remove('hidden');
    emailMetaSection.classList.remove('hidden');

    otpCode.textContent = emailData.otp || 'ไม่พบรหัส OTP';
    btnCopyOtp.classList.toggle('hidden', !emailData.otp);
    if (emailData.otp) copyBtnText.textContent = `คัดลอกรหัส ${emailData.otp}`;

    emailSubject.textContent = emailData.subject || '(ไม่มีหัวข้อ)';
    emailFrom.textContent = emailData.from || '(ไม่ทราบผู้ส่ง)';
    emailDate.textContent = formatThaiDateTime(emailData.date);

    showToast('ดึงจดหมายล่าสุดสำเร็จ', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    fetchIcon.classList.remove('animate-spin');
    btnFetchLatest.disabled = false;
  }
}

// Helpers
function copyToClipboard(text, successMessage = 'คัดลอกเรียบร้อย') {
  if (!text || text === '------' || text === 'ไม่พบรหัส OTP') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMessage, 'success');
  }).catch(() => {
    showToast('ไม่สามารถคัดลอกได้ โปรดคัดลอกด้วยตนเอง', 'error');
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast px-4 py-2.5 rounded-2xl shadow-md text-xs font-bold flex items-center gap-2 border-2 pointer-events-auto ${
    type === 'success'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
      : type === 'error'
      ? 'bg-rose-50 text-rose-800 border-rose-300'
      : 'bg-white text-[#7B4B27] border-[#EADBC8]'
  }`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease-out';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatThaiDateTime(dateInput) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return `${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} เวลา ${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`;
}
