const API_PROXY_URL = "/api/proxy";

function apiUrl(path, params = null) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const query = new URLSearchParams();
  query.set('path', cleanPath);

  if (params instanceof URLSearchParams) {
    for (const [key, value] of params.entries()) {
      query.append(key, value);
    }
  } else if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.append(key, String(value));
      }
    }
  }

  return `${API_PROXY_URL}?${query.toString()}`;
}
const CACHE_KEY = "cached_scammer_db_v4";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

let database = {
  rekening: [],
  genshin: [],
  lastUpdated: null,
  infoTambahan: []
};

let isAdmin = false;
let activeTab = 'rekening';
let searchTimeout = null;
let toastTimer = null;

const PAGE_SIZE = 50;

const PROVENANCE_CONFIG = {
  rekening: {
    sourceTypes: {
      community_screenshot: 'Screenshot Laporan',
      legacy_archive: 'Arsip Capllang'
    },
    statuses: {
      report_recorded: 'Laporan Tercatat',
      evidence_reviewed: 'Bukti Ditinjau',
      multi_report: 'Laporan Multi-Sumber'
    },
    defaultSource: 'community_screenshot',
    defaultStatus: 'evidence_reviewed'
  },
  genshin: {
    sourceTypes: {
      admin_direct_check: 'Verifikasi Langsung Admin'
    },
    statuses: {
      admin_verified: 'Terverifikasi Admin',
      reverified: 'Diverifikasi Ulang'
    },
    defaultSource: 'admin_direct_check',
    defaultStatus: 'admin_verified'
  }
};

const SOURCE_TYPE_LABELS = {
  ...PROVENANCE_CONFIG.rekening.sourceTypes,
  ...PROVENANCE_CONFIG.genshin.sourceTypes
};

const VERIFICATION_STATUS_LABELS = {
  ...PROVENANCE_CONFIG.rekening.statuses,
  ...PROVENANCE_CONFIG.genshin.statuses
};

function getProvenanceConfig(category) {
  return PROVENANCE_CONFIG[category === 'genshin' ? 'genshin' : 'rekening'];
}

function normalizeProvenance(category, sourceType, verificationStatus) {
  const normalizedCategory = category === 'genshin' ? 'genshin' : 'rekening';
  const config = getProvenanceConfig(normalizedCategory);

  if (normalizedCategory === 'genshin') {
    return {
      source_type: 'admin_direct_check',
      verification_status:
        verificationStatus === 'reverified'
          ? 'reverified'
          : 'admin_verified'
    };
  }

  const legacySource = sourceType === 'legacy_archive';
  const mappedStatus = {
    reported: 'report_recorded',
    reviewed: 'evidence_reviewed',
    corroborated: 'multi_report'
  }[verificationStatus];

  const status = config.statuses[verificationStatus]
    ? verificationStatus
    : (mappedStatus || 'report_recorded');

  return {
    source_type: config.sourceTypes[sourceType]
      ? sourceType
      : (legacySource ? 'legacy_archive' : 'community_screenshot'),
    verification_status: status
  };
}

function getSourceTypeLabel(value, category = activeTab) {
  const normalized = normalizeProvenance(category, value, null);
  return SOURCE_TYPE_LABELS[normalized.source_type] || 'Provenance tidak tersedia';
}

function getVerificationStatusLabel(value, category = activeTab) {
  const normalized = normalizeProvenance(category, null, value);
  return VERIFICATION_STATUS_LABELS[normalized.verification_status] || 'Status tidak tersedia';
}

function isProvenanceCombinationValid(category, sourceType, status) {
  const config = getProvenanceConfig(category);
  return Boolean(config.sourceTypes[sourceType] && config.statuses[status]);
}

function populateProvenanceControls(category, { edit = false, sourceType = null, status = null } = {}) {
  const config = getProvenanceConfig(category);
  const sourceSelect = document.getElementById(edit ? 'editSourceTypeInput' : 'sourceTypeInput');
  const statusSelect = document.getElementById(edit ? 'editVerificationStatusInput' : 'verificationStatusInput');
  const sourceRefInput = document.getElementById(edit ? 'editSourceRefInput' : 'sourceRefInput');

  if (!sourceSelect || !statusSelect) return;

  const normalized =
    sourceType === null && status === null
      ? {
          source_type: config.defaultSource,
          verification_status: config.defaultStatus
        }
      : normalizeProvenance(category, sourceType, status);
  const selectedSource = config.sourceTypes[normalized.source_type]
    ? normalized.source_type
    : config.defaultSource;
  const selectedStatus = config.statuses[normalized.verification_status]
    ? normalized.verification_status
    : config.defaultStatus;

  sourceSelect.replaceChildren();
  Object.entries(config.sourceTypes).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedSource;
    sourceSelect.appendChild(option);
  });

  statusSelect.replaceChildren();
  Object.entries(config.statuses).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === selectedStatus;
    statusSelect.appendChild(option);
  });

  sourceSelect.setAttribute(
    'aria-label',
    category === 'genshin' ? 'Metode verifikasi UID' : 'Jenis bukti rekening'
  );
  sourceSelect.title =
    category === 'genshin' ? 'Metode verifikasi UID' : 'Jenis bukti rekening';
  statusSelect.setAttribute('aria-label', 'Status provenance');
  statusSelect.title = 'Status provenance';

  if (sourceRefInput) {
    sourceRefInput.placeholder =
      category === 'genshin'
        ? 'Ref verifikasi opsional (tanpa data pribadi)'
        : 'Ref laporan/SS opsional (tanpa data pribadi)';
  }

  const dateInput = document.getElementById(edit ? 'editDateInput' : 'newDateInput');
  if (dateInput) {
    const dateLabel = category === 'genshin' ? 'Tanggal verifikasi' : 'Tanggal laporan';
    dateInput.setAttribute('aria-label', dateLabel);
    dateInput.title = dateLabel;
  }

  if (edit) {
    const editDateLabel = document.querySelector('label[for="editDateInput"]');
    if (editDateLabel) {
      editDateLabel.textContent = category === 'genshin' ? 'Tanggal verifikasi' : 'Tanggal laporan';
    }
  }
}

let adminSessionActive = false;
let adminSessionExpiresAt = null;
let adminSessionExpiryTimer = null;
let offlineMode = false;
let connectionState = 'checking';
let statusResetTimer = null;
let connectionRecoveryInProgress = false;
let editingRecord = null;

function hasUsableLocalData() {
  return Boolean(
    database.lastUpdated ||
    database.rekening.length ||
    database.genshin.length
  );
}

function getDefaultStatusText() {
  switch (connectionState) {
    case 'online':
      return "● Online";
    case 'offline-cache':
      return "● Offline — menampilkan cache";
    case 'offline-empty':
      return "● Offline — cache tidak tersedia";
    case 'server-error-cache':
      return "● Server tidak tersedia — menampilkan cache";
    case 'server-error-empty':
      return "● Server tidak tersedia";
    case 'checking':
    default:
      return "● Memeriksa koneksi...";
  }
}

function restoreDefaultStatusBar() {
  if (statusResetTimer) {
    clearTimeout(statusResetTimer);
    statusResetTimer = null;
  }

  const status = document.getElementById('statusBar');
  if (status) status.textContent = getDefaultStatusText();
}

function refreshStatusBarIfIdle() {
  if (statusResetTimer) return;

  const status = document.getElementById('statusBar');
  if (status) status.textContent = getDefaultStatusText();
}

function setConnectionState(nextState) {
  connectionState = nextState;
  offlineMode = nextState !== 'online';
  document.body.dataset.connectionState = nextState;
  refreshStatusBarIfIdle();
}

function markConnectionFailure(error = null) {
  const hasLocalData = hasUsableLocalData();
  const browserOffline =
    navigator.onLine === false ||
    error?.connectionKind === 'offline';

  setConnectionState(
    browserOffline
      ? (hasLocalData ? 'offline-cache' : 'offline-empty')
      : (hasLocalData ? 'server-error-cache' : 'server-error-empty')
  );
}

function showTransientStatus(message, duration = 3000) {
  const status = document.getElementById('statusBar');
  if (!status) return;

  if (statusResetTimer) clearTimeout(statusResetTimer);
  status.textContent = message;

  statusResetTimer = setTimeout(() => {
    statusResetTimer = null;
    restoreDefaultStatusBar();
  }, duration);
}

const paginationState = {
  rekening: {
    total: 0,
    query: null,
    hasMore: false,
    nextCursor: null
  },
  genshin: {
    total: 0,
    query: null,
    hasMore: false,
    nextCursor: null
  }
};

const categoryControllers = {
  rekening: null,
  genshin: null
};

const modalPreviousFocus = new Map();

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null);
}

function openModalAccessible(modalId, focusSelector = null) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modalPreviousFocus.set(modalId, document.activeElement);
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    const target = focusSelector
      ? modal.querySelector(focusSelector)
      : getFocusableElements(modal)[0];

    if (target) {
      target.focus();
    } else {
      modal.focus();
    }
  });
}

function closeModalAccessible(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');

  const previous = modalPreviousFocus.get(modalId);
  modalPreviousFocus.delete(modalId);

  if (previous && typeof previous.focus === 'function') {
    previous.focus();
  }
}

function trapFocus(event, modal) {
  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements(modal);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleTabKeyDown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    return;
  }

  event.preventDefault();

  const tabs = [
    document.getElementById('tabRekening'),
    document.getElementById('tabGenshin')
  ];

  let index = tabs.indexOf(event.currentTarget);

  if (event.key === 'Home') index = 0;
  else if (event.key === 'End') index = tabs.length - 1;
  else if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') index = (index - 1 + tabs.length) % tabs.length;

  const next = tabs[index];
  switchTab(next.id === 'tabRekening' ? 'rekening' : 'genshin');
  next.focus();
}


const BANK_OPTIONS = [
  "BCA",
  "BRI",
  "Mandiri",
  "BNI",
  "BSI",
  "DANA",
  "OVO",
  "GoPay",
  "ShopeePay",
  "Seabank",
  "Jago",
  "Blu",
  "Lainnya..."
];

const GAME_OPTIONS = [
  "Genshin Impact",
  "Honkai: Star Rail",
  "Zenless Zone Zero",
  "Mobile Legends",
  "Free Fire",
  "PUBG Mobile",
  "Roblox",
  "Valorant",
  "Lainnya..."
];

const PAYMENT_BRAND_MARKS = {
  bca: { label: 'BCA', mark: 'BCA' },
  bri: { label: 'BRI', mark: 'BRI' },
  mandiri: { label: 'Mandiri', mark: 'M' },
  bni: { label: 'BNI', mark: 'BNI' },
  bsi: { label: 'BSI', mark: 'BSI' },
  dana: { label: 'DANA', mark: 'D' },
  ovo: { label: 'OVO', mark: 'O' },
  gopay: { label: 'GoPay', mark: 'G' },
  shopeepay: { label: 'ShopeePay', mark: 'S' },
  seabank: { label: 'Seabank', mark: 'S' },
  jago: { label: 'Jago', mark: 'J' },
  blu: { label: 'Blu', mark: 'B' }
};

function getPaymentBrandKey(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  if (normalized === 'bankmandiri' || normalized === 'mandiri') return 'mandiri';
  if (normalized === 'bankjago' || normalized === 'jago') return 'jago';
  if (normalized === 'bankseabank' || normalized === 'seabank') return 'seabank';
  if (normalized === 'blu' || normalized === 'blubybcadigital') return 'blu';
  if (PAYMENT_BRAND_MARKS[normalized]) return normalized;
  return 'generic';
}

function createPaymentBrandIcon(metaValue) {
  const key = getPaymentBrandKey(metaValue);
  const span = document.createElement('span');
  span.className = `payment-brand-icon payment-brand-${key}`;
  span.setAttribute('aria-hidden', 'true');

  if (key === 'generic') {
    span.textContent = '▥';
  } else {
    span.textContent = PAYMENT_BRAND_MARKS[key].mark;
  }

  return span;
}

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage dapat diblokir oleh browser/privacy mode.
  }
}

function getLocalDateInputValue(date = new Date()) {
  const localTime = new Date(
    date.getTime() - date.getTimezoneOffset() * 60 * 1000
  );
  return localTime.toISOString().slice(0, 10);
}

/* =========================
   LOADING STATE
========================= */

function setLoading(state, text = "Memuat...") {
  const indicator = document.getElementById('loadingIndicator');
  const loadingText = document.getElementById('loadingText');

  if (!indicator) return;

  loadingText.textContent = text;
  indicator.classList.toggle('show', state);
}

/* =========================
   DATA NORMALIZATION
========================= */

function migrateData(dataArray, fallbackCategory = "") {
  if (!Array.isArray(dataArray)) return [];

  return dataArray
    .map(item => {

      if (item === null || item === undefined) {
        return null;
      }

      if (typeof item !== 'object') {
        return {
          id: null,
          category: fallbackCategory,
          nomor: String(item),
          tanggal: "-",
          meta: "-",
          ...normalizeProvenance(fallbackCategory, "legacy_archive", "report_recorded"),
          source_ref: "-",
          provenance_updated_at: null,
          created_at: null
        };
      }

      const rawId =
        item.id === null || item.id === undefined
          ? null
          : Number(item.id);

      return {
        id:
          Number.isSafeInteger(rawId) && rawId > 0
            ? rawId
            : null,
        category:
          item.category
            ? String(item.category)
            : fallbackCategory,
        nomor:
          item.nomor === null || item.nomor === undefined
            ? ""
            : String(item.nomor),
        tanggal:
          item.tanggal
            ? String(item.tanggal)
            : "-",
        meta:
          (item.meta || item.bank || item.game)
            ? String(item.meta || item.bank || item.game)
            : "-",
        ...normalizeProvenance(
          item.category ? String(item.category) : fallbackCategory,
          item.source_type,
          item.verification_status
        ),
        source_ref:
          item.source_ref && String(item.source_ref).trim()
            ? String(item.source_ref).trim()
            : "-",
        provenance_updated_at:
          Number.isFinite(Number(item.provenance_updated_at))
            ? Number(item.provenance_updated_at)
            : null,
        created_at:
          item.created_at === null || item.created_at === undefined
            ? null
            : item.created_at
      };
    })
    .filter(item => item && item.nomor);
}

function sortRecords(dataArray) {
  dataArray.sort((a, b) => {
    const aDate =
      a.tanggal && a.tanggal !== '-'
        ? String(a.tanggal)
        : '';

    const bDate =
      b.tanggal && b.tanggal !== '-'
        ? String(b.tanggal)
        : '';

    if (aDate !== bDate) {
      return bDate.localeCompare(aDate);
    }

    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function cacheDatabase() {
  // Jangan timpa cache utama dengan hasil pencarian parsial.
  if (paginationState.rekening.query || paginationState.genshin.query) {
    return;
  }

  const cachedState = {
    rekening: {
      total: paginationState.rekening.total,
      query: paginationState.rekening.query
    },
    genshin: {
      total: paginationState.genshin.total,
      query: paginationState.genshin.query
    }
  };

  safeStorageSet(
    CACHE_KEY,
    JSON.stringify({
      ...database,
      cachedAt: Date.now(),
      paginationState: cachedState
    })
  );
}

function readFreshCache() {
  const raw = safeStorageGet(CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt || 0);

    if (!Number.isFinite(cachedAt) || cachedAt <= 0) {
      safeStorageRemove(CACHE_KEY);
      return null;
    }

    if (Date.now() - cachedAt > CACHE_TTL_MS) {
      safeStorageRemove(CACHE_KEY);
      return null;
    }

    return parsed;
  } catch {
    safeStorageRemove(CACHE_KEY);
    return null;
  }
}

function getSearchQuery() {
  return document
    .getElementById('searchInput')
    .value
    .trim();
}

function restorePaginationState(parsed) {
  const cachedState =
    parsed && typeof parsed.paginationState === 'object'
      ? parsed.paginationState
      : {};

  for (const category of ['rekening', 'genshin']) {
    const items = database[category] || [];
    const saved = cachedState[category] || {};
    const total = Number(saved.total);

    paginationState[category].total =
      Number.isSafeInteger(total) && total >= items.length
        ? total
        : items.length;

    paginationState[category].query =
      typeof saved.query === 'string'
        ? saved.query
        : '';

    // Cache hanya menyimpan halaman yang pernah dimuat.
    // Saat offline jangan menawarkan load-more yang membutuhkan server.
    paginationState[category].hasMore = false;
    paginationState[category].nextCursor = null;
  }
}

/* =========================
   META SELECT
========================= */

function updateMetaSelectOptions() {
  const select = document.getElementById('metaSelectInput');
  const customInput = document.getElementById('metaCustomInput');

  if (!select) return;

  select.innerHTML = '';

  const defaultOpt = document.createElement('option');

  defaultOpt.value = "";
  defaultOpt.textContent =
    activeTab === 'rekening'
      ? "-- Pilih Bank (Opsional) --"
      : "-- Pilih Game (Opsional) --";

  defaultOpt.selected = true;

  select.appendChild(defaultOpt);

  const options =
    activeTab === 'rekening'
      ? BANK_OPTIONS
      : GAME_OPTIONS;

  options.forEach(opt => {
    const el = document.createElement('option');

    el.value = opt;
    el.textContent = opt;

    select.appendChild(el);
  });

  customInput.classList.add('is-hidden');
  customInput.value = '';
}

function handleMetaSelectChange(selectEl) {
  const customInput =
    document.getElementById('metaCustomInput');

  if (selectEl.value === 'Lainnya...') {

    customInput.classList.remove('is-hidden');
    customInput.focus();

  } else {

    customInput.classList.add('is-hidden');
    customInput.value = '';

  }
}

/* =========================
   THEME
========================= */

function toggleTheme() {
  document.body.classList.toggle('dark-mode');

  const isDark =
    document.body.classList.contains('dark-mode');

  safeStorageSet(
    'theme',
    isDark ? 'dark' : 'light'
  );

  document.getElementById('themeToggleBtn').textContent =
    isDark ? 'Light' : 'Dark';

  document.getElementById('themeToggleBtn').setAttribute(
    'aria-pressed',
    String(isDark)
  );
}

const savedTheme = safeStorageGet('theme');
if (savedTheme !== 'light') {
  document.body.classList.add('dark-mode');
  document.getElementById('themeToggleBtn').textContent = 'Light';
  document.getElementById('themeToggleBtn').setAttribute('aria-pressed', 'true');
} else {
  document.getElementById('themeToggleBtn').textContent = 'Dark';
  document.getElementById('themeToggleBtn').setAttribute('aria-pressed', 'false');
}

/* =========================
   HOME
========================= */

function resetToHome() {

  const url = new URL(window.location.href);

  url.searchParams.delete('search');
  url.searchParams.delete('q');
  url.searchParams.delete('tab');

  window.history.replaceState(
    {},
    '',
    url.pathname + url.search + url.hash
  );

  document.getElementById('searchInput').value = '';

  switchTab('rekening');

  const resultList =
    document.getElementById('resultList');

  if (resultList) {
    resultList.scrollTop = 0;
  }

  showToast("Kembali ke Halaman Utama");
}

/* =========================
   URL
========================= */

function checkUrlParams() {

  const urlParams =
    new URLSearchParams(window.location.search);

  const searchQuery =
    urlParams.get('search') ||
    urlParams.get('q');

  const tabQuery =
    urlParams.get('tab');

  if (
    tabQuery &&
    (tabQuery === 'rekening' ||
     tabQuery === 'genshin')
  ) {

    activeTab = tabQuery;

    document
      .getElementById('tabRekening')
      .classList.toggle(
        'active',
        activeTab === 'rekening'
      );

    document
      .getElementById('tabGenshin')
      .classList.toggle(
        'active',
        activeTab === 'genshin'
      );

    document.getElementById('tabRekening').setAttribute(
      'aria-selected',
      String(activeTab === 'rekening')
    );

    document.getElementById('tabGenshin').setAttribute(
      'aria-selected',
      String(activeTab === 'genshin')
    );

    document.getElementById('tabRekening').tabIndex =
      activeTab === 'rekening' ? 0 : -1;

    document.getElementById('tabGenshin').tabIndex =
      activeTab === 'genshin' ? 0 : -1;
  }

  document.getElementById('resultPanel').setAttribute(
    'aria-labelledby',
    activeTab === 'rekening' ? 'tabRekening' : 'tabGenshin'
  );

  const searchInput = document.getElementById('searchInput');
  searchInput.placeholder =
    activeTab === 'rekening'
      ? 'Cari nomor rekening...'
      : 'Cari UID...';

  if (searchQuery) {
    searchInput.value = searchQuery;
  }
}

function updateUrlParam(query) {

  const url =
    new URL(window.location.href);

  const currentQuery =
    url.searchParams.get('search') || '';

  if (query === currentQuery) {
    return;
  }

  if (query) {
    url.searchParams.set('search', query);
  } else {
    url.searchParams.delete('search');
  }

  window.history.replaceState(
    {},
    '',
    url.pathname +
    (url.search ? url.search : '') +
    url.hash
  );
}

function updateTabUrlParam(tab) {
  const url = new URL(window.location.href);

  if (tab === 'genshin') {
    url.searchParams.set('tab', 'genshin');
  } else {
    // rekening adalah default; URL lebih bersih tanpa parameter.
    url.searchParams.delete('tab');
  }

  window.history.replaceState(
    {},
    '',
    url.pathname + (url.search ? url.search : '') + url.hash
  );
}

/* =========================
   SERVER-SIDE PAGINATION
========================= */

