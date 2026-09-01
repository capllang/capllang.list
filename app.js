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


/* =========================================================
   PREMIUM AD CONFIG — CAPLLANG LIST v7.2

   Untuk memasang iklan:
   1) ubah active menjadi true
   2) isi headline / ctaUrl / tanggal
   3) deploy app.js

   Setelah endAt terlewati, slot otomatis kembali menjadi
   house ad "SPACE IKLAN PREMIUM".
========================================================= */

const PAID_AD = {
  active: false,

  sponsor: '',
  label: 'Sponsored',
  headline: '',
  priceText: '',

  ctaText: 'Kunjungi',
  ctaUrl: '',

  // Opsional: URL gambar/logo sponsor. Kosongkan untuk ikon default.
  creativeUrl: '',

  // Format ISO 8601, contoh: 2026-09-01T00:00:00+07:00
  startAt: '',
  endAt: ''
};

function parseAdScheduleDate(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isPaidAdInSchedule(ad = PAID_AD, now = Date.now()) {
  if (!ad?.active) return false;

  const start = parseAdScheduleDate(ad.startAt);
  const end = parseAdScheduleDate(ad.endAt);

  return (!start || now >= start) && (!end || now <= end);
}

function setAdCtaLink(cta, href, { sponsored = false } = {}) {
  if (!cta) return;

  const safeHref = String(href || '').trim();
  cta.setAttribute('href', safeHref || '#adInfoStrip');

  if (/^https?:\/\//i.test(safeHref)) {
    cta.setAttribute('target', '_blank');
    cta.setAttribute(
      'rel',
      sponsored
        ? 'noopener noreferrer sponsored'
        : 'noopener noreferrer'
    );
  } else {
    cta.removeAttribute('target');
    cta.removeAttribute('rel');
  }
}

function setPremiumAdCreative(visual, creativeUrl) {
  if (!visual) return;

  visual.classList.remove('has-creative');
  visual.style.removeProperty('background-image');

  const rawUrl = String(creativeUrl || '').trim();
  if (!rawUrl) return;

  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (!['http:', 'https:'].includes(parsed.protocol)) return;

    visual.style.backgroundImage = `url("${parsed.href.replace(/"/g, '%22')}")`;
    visual.classList.add('has-creative');
  } catch (_) {
    // URL kreatif invalid: gunakan ikon default.
  }
}

function initPremiumAd() {
  const banner = document.getElementById('paidBanner');
  if (!banner) return;

  const visual = banner.querySelector('.premium-ad__visual');
  const label = document.getElementById('adLabel');
  const headline = document.getElementById('adHeadline');
  const price = document.getElementById('adPrice');
  const cta = document.getElementById('adCta');
  const disclosure = document.getElementById('adDisclosure');
  const stripDisclosure = document.getElementById('adStripDisclosure');

  const paidIsActive = isPaidAdInSchedule(PAID_AD);
  banner.classList.toggle('is-paid', paidIsActive);

  if (!paidIsActive) {
    if (label) label.textContent = 'Banner Partner';
    if (headline) headline.textContent = 'SPACE IKLAN PREMIUM';
    if (price) price.textContent = '◈ Mulai Rp25.000/hari';
    if (cta) cta.textContent = 'Pasang Iklan';
    if (disclosure) disclosure.textContent = 'Partner Slot';
    if (stripDisclosure) stripDisclosure.textContent = 'Partner Slot';

    setPremiumAdCreative(visual, '');
    setAdCtaLink(cta, '#adInfoStrip');
    return;
  }

  const sponsor = String(PAID_AD.sponsor || '').trim();
  const paidHeadline = String(PAID_AD.headline || '').trim();

  if (label) label.textContent = PAID_AD.label || 'Sponsored';
  if (headline) headline.textContent = paidHeadline || sponsor || 'Partner Capllang';
  if (price) price.textContent = PAID_AD.priceText || sponsor || 'Partner Capllang List';
  if (cta) cta.textContent = PAID_AD.ctaText || 'Kunjungi';
  if (disclosure) disclosure.textContent = 'Sponsored';
  if (stripDisclosure) stripDisclosure.textContent = 'Sponsored';

  setPremiumAdCreative(visual, PAID_AD.creativeUrl);
  setAdCtaLink(cta, PAID_AD.ctaUrl, { sponsored: true });
}

function updateResultColumns(tab = activeTab) {
  const normalizedTab = tab === 'genshin' ? 'genshin' : 'rekening';
  const columns = document.getElementById('resultColumns');
  const columnsRight = document.getElementById('resultColumnsRight');
  const numberHeading = document.getElementById('resultNumberHeading');

  if (!columns || !columnsRight || !numberHeading) return;

  columns.classList.toggle('result-columns-rekening', normalizedTab === 'rekening');
  columns.classList.toggle('result-columns-genshin', normalizedTab === 'genshin');

  columnsRight.classList.toggle('result-columns-right-rekening', normalizedTab === 'rekening');
  columnsRight.classList.toggle('result-columns-right-genshin', normalizedTab === 'genshin');

  numberHeading.textContent = normalizedTab === 'rekening'
    ? 'Nomor Rekening'
    : 'UID Game';
}

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

async function fetchCategoryRecords(
  category,
  {
    reset = false,
    query = getSearchQuery(),
    silent = false
  } = {}
) {
  if (!['rekening', 'genshin'].includes(category)) {
    return false;
  }

  const state = paginationState[category];
  const cleanQuery = String(query || '').trim();

  const shouldReset =
    reset ||
    state.query !== cleanQuery;

  if (!shouldReset && (!state.hasMore || !state.nextCursor)) {
    return true;
  }

  if (categoryControllers[category]) {
    categoryControllers[category].abort();
  }

  const controller = new AbortController();
  categoryControllers[category] = controller;

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 7000);

  if (!silent) {
    setLoading(
      true,
      shouldReset ? "Memuat data..." : "Memuat data berikutnya..."
    );
  }

  try {
    const params = new URLSearchParams({
      category,
      limit: String(PAGE_SIZE),
      includeTotal: shouldReset ? '1' : '0'
    });

    if (!shouldReset && state.nextCursor) {
      params.set('cursor', state.nextCursor);
    }

    if (cleanQuery) {
      params.set('q', cleanQuery);
    }

    const res = await fetch(
      apiUrl('records', params),
      {
        signal: controller.signal,
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      const error = new Error(
        `Gagal mengambil data (${res.status})`
      );
      error.connectionKind = 'server';
      throw error;
    }

    const data = await res.json();

    if (!Array.isArray(data.records)) {
      const error = new Error(
        "Format data D1 tidak sesuai"
      );
      error.connectionKind = 'server';
      throw error;
    }

    const incoming = migrateData(
      data.records,
      category
    );

    if (shouldReset) {
      database[category] = incoming;
    } else {
      const existingIds = new Set(
        database[category]
          .map(item => Number(item.id))
          .filter(id => Number.isSafeInteger(id) && id > 0)
      );

      for (const item of incoming) {
        const id = Number(item.id);

        if (
          Number.isSafeInteger(id) &&
          id > 0 &&
          existingIds.has(id)
        ) {
          continue;
        }

        database[category].push(item);

        if (Number.isSafeInteger(id) && id > 0) {
          existingIds.add(id);
        }
      }
    }

    if (shouldReset && Number.isSafeInteger(Number(data.total))) {
      state.total = Math.max(0, Number(data.total));
    }

    state.query = cleanQuery;
    state.nextCursor =
      typeof data.nextCursor === 'string' && data.nextCursor
        ? data.nextCursor
        : null;
    state.hasMore = Boolean(state.nextCursor);

    // Jika backend tidak mengirim total pada halaman lanjutan,
    // pertahankan total halaman pertama agar counter tetap stabil.
    if (state.total < database[category].length) {
      state.total = database[category].length;
    }

    database.lastUpdated =
      new Date().toISOString();

    setConnectionState('online');
    cacheDatabase();

    return true;

  } catch (err) {
    if (
      err?.name === 'AbortError' &&
      !timedOut
    ) {
      return false;
    }

    console.warn(
      `Gagal mengambil ${category}:`,
      err
    );

    markConnectionFailure(err);
    return false;

  } finally {
    clearTimeout(timeoutId);

    if (categoryControllers[category] === controller) {
      categoryControllers[category] = null;
    }

    if (!silent) {
      setLoading(false);
    }
  }
}

async function fetchOnlineDatabase() {
  const status =
    document.getElementById('statusBar');

  checkUrlParams();
  updateMetaSelectOptions();

  const initialQuery =
    getSearchQuery();

  setLoading(
    true,
    "Memuat data awal..."
  );

  try {
    setConnectionState('checking');
    status.innerText =
      "⏳ Memeriksa koneksi ke D1...";

    if (navigator.onLine === false) {
      const error = new Error("Browser sedang offline");
      error.connectionKind = 'offline';
      throw error;
    }

    const initialOk = await fetchCategoryRecords(
      activeTab,
      {
        reset: true,
        query: initialQuery,
        silent: true
      }
    );

    if (!initialOk) {
      throw new Error(
        "Data awal gagal dimuat"
      );
    }

    setConnectionState('online');
    status.innerText = getDefaultStatusText();

    // Isi cache kategori lain tanpa menunda tampilan awal.
    // Hormati Data Saver agar tidak membuat request tambahan yang tidak perlu.
    const saveData = Boolean(navigator.connection?.saveData);
    if (!saveData) {
      const inactiveCategory =
        activeTab === 'rekening' ? 'genshin' : 'rekening';

      void fetchCategoryRecords(
        inactiveCategory,
        { reset: true, query: '', silent: true }
      ).then(ok => {
        if (ok) cacheDatabase();
      });
    }

  } catch (err) {
    console.warn(
      "Menggunakan cache lokal:",
      err
    );

    const parsed = readFreshCache();

    if (parsed) {
      database = {
        rekening: migrateData(
          parsed.rekening || [],
          'rekening'
        ),
        genshin: migrateData(
          parsed.genshin || [],
          'genshin'
        ),
        lastUpdated:
          parsed.lastUpdated || null,
        infoTambahan:
          parsed.infoTambahan || []
      };

      restorePaginationState(parsed);

      markConnectionFailure(err);
      status.innerText = getDefaultStatusText();
    } else {
      database = {
        rekening: [],
        genshin: [],
        lastUpdated: null,
        infoTambahan: []
      };

      paginationState.rekening = {
        total: 0,
        query: '',
        hasMore: false,
        nextCursor: null
      };

      paginationState.genshin = {
        total: 0,
        query: '',
        hasMore: false,
        nextCursor: null
      };

      markConnectionFailure(err);
      status.innerText = getDefaultStatusText();
    }

  } finally {
    setLoading(false);
  }

  filterData();
}

async function loadMoreRecords() {
  if (navigator.onLine === false) {
    showToast(
      "Data tambahan membutuhkan koneksi aktif."
    );
    return;
  }

  const ok = await fetchCategoryRecords(
    activeTab,
    {
      reset: false,
      query: getSearchQuery()
    }
  );

  if (ok) {
    filterData();
  } else {
    showToast(
      "⚠️ Gagal memuat data berikutnya."
    );
  }
}

async function runServerSearch() {
  const query =
    getSearchQuery();

  updateUrlParam(query);

  if (navigator.onLine === false) {
    // Saat benar-benar offline, pencarian hanya pada data lokal yang tersedia.
    filterData();
    return;
  }

  const ok = await fetchCategoryRecords(
    activeTab,
    {
      reset: true,
      query
    }
  );

  if (ok) {
    filterData();
  } else {
    showToast(
      "⚠️ Pencarian gagal. Coba lagi."
    );
  }
}

/* =========================
   ADMIN
========================= */

function exitAdminMode() {

  isAdmin = false;
  adminSessionActive = false;
  adminSessionExpiresAt = null;

  if (adminSessionExpiryTimer) {
    clearTimeout(adminSessionExpiryTimer);
    adminSessionExpiryTimer = null;
  }

  document.getElementById('authBtn').innerText =
    "🔑 Mode Pemilik";

  document.getElementById('authBtn').setAttribute(
    'aria-pressed',
    'false'
  );

  document.getElementById('addBox').classList.add('is-hidden');

  filterData();
  restoreDefaultStatusBar();
}

async function toggleAdmin() {

  if (!isAdmin) {

    const pwdInput =
      document.getElementById(
        'adminPasswordInput'
      );

    pwdInput.value = '';

    openModalAccessible(
      'adminModal',
      '#adminPasswordInput'
    );

  } else {

    try {
      const res = await fetch(
        apiUrl('auth/logout'),
        {
          method: 'POST',
          credentials: 'include'
        }
      );

      if (!res.ok) {
        throw new Error(`Logout gagal (${res.status})`);
      }

      exitAdminMode();
      showToast("Keluar Mode Pemilik");
    } catch (err) {
      console.warn('Logout server gagal:', err);
      showToast("⚠️ Logout gagal. Coba lagi.");
    }
  }
}

function scheduleAdminSessionExpiry(expiresAt) {
  if (adminSessionExpiryTimer) {
    clearTimeout(adminSessionExpiryTimer);
    adminSessionExpiryTimer = null;
  }

  const exp = Number(expiresAt || 0);
  adminSessionExpiresAt = Number.isFinite(exp) && exp > 0 ? exp : null;
  if (!adminSessionExpiresAt) return;

  const delay = Math.max(0, adminSessionExpiresAt * 1000 - Date.now());
  adminSessionExpiryTimer = setTimeout(() => {
    if (isAdmin || adminSessionActive) {
      exitAdminMode();
      showToast("Sesi Pemilik berakhir. Silakan login lagi.");
    }
  }, Math.min(delay + 250, 2147483647));
}

async function restoreAdminSession() {

  try {
    const res = await fetch(
      apiUrl('auth/me'),
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      exitAdminMode();
      return false;
    }

    const data = await res.json();

    if (!data.authenticated) {
      exitAdminMode();
      return false;
    }

    isAdmin = true;
    adminSessionActive = true;
    scheduleAdminSessionExpiry(data.expiresAt);

    document.getElementById('authBtn').innerText =
      "🔓 Keluar Mode";

    document.getElementById('authBtn').setAttribute(
      'aria-pressed',
      'true'
    );

    document.getElementById('addBox').classList.remove('is-hidden');

    document.getElementById('newDateInput').value =
      getLocalDateInputValue();

    updateMetaSelectOptions();
    return true;

  } catch (err) {
    console.warn(
      'Tidak dapat memulihkan sesi admin:',
      err
    );
    exitAdminMode();
    return false;
  }
}

function closeAdminModal() {
  closeModalAccessible('adminModal');
}

function handleAdminModalKeyDown(e) {

  if (e.key === 'Enter') {
    submitAdminLogin();
  }
}

async function submitAdminLogin() {

  const inputSecret =
    document.getElementById(
      'adminPasswordInput'
    ).value;

  if (
    !inputSecret ||
    inputSecret.trim() === ""
  ) {

    showToast(
      "⚠️ Password Admin wajib diisi!"
    );

    return;
  }

  const cleanSecret =
    inputSecret.trim();

  const submitBtn =
    document.querySelector(
      '#adminModal .btn-add'
    );

  const originalBtnText =
    submitBtn.innerText;

  submitBtn.disabled = true;
  submitBtn.innerText =
    "Verifikasi...";

  setLoading(
    true,
    "Memverifikasi admin..."
  );

  try {

    const res =
      await fetch(
        apiUrl('auth/login'),
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            password: cleanSecret
          })
        }
      );

    if (
      res.status === 401 ||
      res.status === 403
    ) {

      showToast(
        "❌ Password Admin Salah!"
      );

      return;
    }

    if (!res.ok) {

      throw new Error(
        "Gagal login ke server"
      );
    }

    /*
     * Jangan aktifkan UI admin hanya berdasarkan respons login.
     * Cookie HttpOnly harus terbukti terbaca kembali oleh /auth/me.
     */
    const sessionConfirmed = await restoreAdminSession();

    if (!sessionConfirmed) {
      throw new Error(
        "Login diterima, tetapi sesi tidak dapat diverifikasi."
      );
    }

    closeAdminModal();

    showToast(
      "Mode Pemilik Aktif"
    );

    filterData();

  } catch (err) {

    console.error(
      "Login error:",
      err
    );

    showToast(
      err?.message?.includes("sesi tidak dapat diverifikasi")
        ? "⚠️ Sesi login tidak tersimpan. Coba refresh lalu login lagi."
        : "⚠️ Gagal login: masalah jaringan/server."
    );

  } finally {

    submitBtn.disabled = false;
    submitBtn.innerText =
      originalBtnText;

    setLoading(false);
  }
}

/* =========================
   ADD DATA
========================= */

function handleInputKeyDown(e) {

  if (e.key === 'Enter') {
    addNumber();
  }
}

function normalizeNumberInput(rawValue) {
  const raw = String(rawValue || '').trim();

  if (!raw) {
    return { ok: false, value: '', error: 'Nomor/UID wajib diisi.' };
  }

  // Izinkan separator visual umum, tetapi jangan diam-diam
  // membuang huruf/simbol lain karena dapat mengubah data yang dimaksud.
  if (!/^[0-9\s.\-]+$/.test(raw)) {
    return {
      ok: false,
      value: '',
      error: 'Nomor/UID hanya boleh berisi angka, spasi, titik, atau tanda hubung.'
    };
  }

  return {
    ok: true,
    value: raw.replace(/[\s.\-]/g, ''),
    error: ''
  };
}

async function addNumber() {

  const input =
    document.getElementById(
      'newNumberInput'
    );

  const dateInput =
    document.getElementById(
      'newDateInput'
    );

  const btnAdd =
    document.getElementById(
      'btnAdd'
    );

  const selectMeta =
    document.getElementById(
      'metaSelectInput'
    );

  const customMetaInput =
    document.getElementById(
      'metaCustomInput'
    );

  const sourceTypeInput = document.getElementById('sourceTypeInput');
  const verificationStatusInput = document.getElementById('verificationStatusInput');
  const sourceRefInput = document.getElementById('sourceRefInput');

  if (!isAdmin || !adminSessionActive) {
    await showConfirm({
      title: "Sesi Admin Berakhir",
      message:
        "Sesi admin tidak lagi aktif. Silakan login kembali.",
      confirmText: "OK",
      danger: false
    });

    exitAdminMode();
    return;
  }

  let selectedMeta =
    selectMeta.value;

  const rawVal =
    input.value.trim();

  const dateVal =
    dateInput.value;

  const provenanceConfig = getProvenanceConfig(activeTab);
  const sourceType = sourceTypeInput?.value || provenanceConfig.defaultSource;
  const verificationStatus = verificationStatusInput?.value || provenanceConfig.defaultStatus;
  const sourceRef = sourceRefInput?.value.trim() || '-';

  if (!isProvenanceCombinationValid(activeTab, sourceType, verificationStatus)) {
    showToast("⚠️ Status provenance tidak sesuai dengan kategori data.");
    return;
  }

  if (sourceRef.length > 80) {
    showToast("⚠️ Referensi sumber maksimal 80 karakter.");
    return;
  }

  if (!rawVal) {

    showToast(
      "⚠️ Masukkan nomor/UID baru!"
    );

    return;
  }

  if (
    !selectedMeta ||
    selectedMeta === ""
  ) {

    selectedMeta = "-";

  } else if (
    selectedMeta === 'Lainnya...'
  ) {

    selectedMeta =
      customMetaInput.value.trim();

    if (!selectedMeta) {
      selectedMeta = "-";
    }
  }

  if (!dateVal) {

    showToast(
      "⚠️ Tanggal wajib diisi!"
    );

    return;
  }

  const normalizedNumber =
    normalizeNumberInput(rawVal);

  if (!normalizedNumber.ok) {
    showToast(`⚠️ ${normalizedNumber.error}`);
    return;
  }

  const cleanVal =
    normalizedNumber.value;

  if (activeTab === 'genshin') {

    if (!/^\d{5,12}$/.test(cleanVal)) {

      showToast(
        "⚠️ UID harus 5 - 12 digit."
      );

      return;
    }

  } else if (
    activeTab === 'rekening'
  ) {

    if (!/^\d{5,25}$/.test(cleanVal)) {

      showToast(
        "⚠️ Nomor harus 5 - 25 digit."
      );

      return;
    }
  }


  btnAdd.disabled = true;
  btnAdd.innerText =
    "⏳ Menyimpan...";

  setLoading(true, "Menyimpan data...");

  try {

    const res = await fetch(
      apiUrl('records'),
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category: activeTab,
          nomor: cleanVal,
          tanggal: dateVal,
          meta: selectedMeta,
          source_type: sourceType,
          source_ref: sourceRef,
          verification_status: verificationStatus
        })
      }
    );

    let responseData = {};

    try {
      responseData = await res.json();
    } catch (_) {}

    if (
      res.status === 401 ||
      res.status === 403
    ) {
      await showConfirm({
        title: "Akses Ditolak",
        message:
          "Sesi Admin telah berakhir atau akses ditolak oleh server.",
        confirmText: "OK",
        danger: false
      });

      exitAdminMode();
      return;
    }

    if (res.status === 409) {
      showToast(
        "⚠️ Nomor/UID sudah ada!"
      );
      return;
    }

    if (!res.ok || !responseData.record) {
      throw new Error(
        responseData.error ||
        "Gagal menambahkan data"
      );
    }

    setConnectionState('online');

    const newItem =
      migrateData(
        [responseData.record],
        activeTab
      )[0];

    if (!newItem) {
      throw new Error(
        "Respons record tidak valid"
      );
    }

    input.value = "";
    customMetaInput.value = "";
    populateProvenanceControls(activeTab);
    if (sourceRefInput) sourceRefInput.value = '';

    updateMetaSelectOptions();

    document.getElementById(
      'searchInput'
    ).value = "";

    updateUrlParam("");

    const refreshed =
      await fetchCategoryRecords(
        activeTab,
        {
          reset: true,
          query: "",
          silent: true
        }
      );

    if (!refreshed) {
      database[activeTab].unshift(
        newItem
      );

      sortRecords(
        database[activeTab]
      );

      const state =
        paginationState[activeTab];

      state.query = "";
      state.total =
        Math.max(
          state.total + 1,
          database[activeTab].length
        );

      state.hasMore = false;
      state.nextCursor = null;

      cacheDatabase();
    }

    filterData();

    showTransientStatus("🟢 Tersimpan di D1!");

    showToast(
      "Data berhasil ditambahkan!"
    );

  } catch (err) {

    console.error(
      "Add record error:",
      err
    );

    await showConfirm({
      title: "Penyimpanan Gagal",
      message:
        "Data gagal ditambahkan karena masalah jaringan atau server.",
      confirmText: "OK",
      danger: false
    });

    markConnectionFailure(err);
    showTransientStatus("⚠️ Simpan gagal", 4000);

  } finally {

    btnAdd.disabled = false;
    btnAdd.innerText =
      "+ Simpan Data";

    setLoading(false);
  }
}

/* =========================
   CUSTOM CONFIRM
========================= */

let confirmResolver = null;

function showConfirm({
  title = "Konfirmasi",
  message = "Apakah Anda yakin?",
  confirmText = "OK",
  danger = true
} = {}) {

  return new Promise(resolve => {

    confirmResolver = resolve;

    document.getElementById(
      'confirmTitle'
    ).textContent = title;

    document.getElementById(
      'confirmMessage'
    ).textContent = message;

    const btn =
      document.getElementById(
        'confirmOkBtn'
      );

    btn.textContent =
      confirmText;

    btn.className =
      danger
        ? "btn btn-confirm-danger"
        : "btn btn-add";

    openModalAccessible(
      'confirmModal',
      '#confirmOkBtn'
    );
  });
}

function closeConfirmModal(result) {

  closeModalAccessible('confirmModal');

  if (confirmResolver) {

    const resolver =
      confirmResolver;

    confirmResolver = null;

    resolver(result);
  }
}

/* =========================
   EDIT RECORD
========================= */

function openEditRecord(itemObj) {
  if (!isAdmin || !adminSessionActive) {
    showToast("⚠️ Sesi admin tidak aktif.");
    exitAdminMode();
    return;
  }

  const id = Number(itemObj?.id || 0);
  if (!Number.isSafeInteger(id) || id <= 0) {
    showToast("⚠️ ID data tidak tersedia. Muat ulang halaman.");
    return;
  }

  editingRecord = { ...itemObj, id };

  const category =
    itemObj.category === 'genshin'
      ? 'genshin'
      : 'rekening';

  document.getElementById('editCategoryInput').value = category;
  document.getElementById('editNumberInput').value = String(itemObj.nomor || '');
  document.getElementById('editMetaInput').value =
    itemObj.meta && itemObj.meta !== '-'
      ? String(itemObj.meta)
      : '';
  document.getElementById('editDateInput').value =
    itemObj.tanggal && itemObj.tanggal !== '-'
      ? String(itemObj.tanggal)
      : getLocalDateInputValue();
  populateProvenanceControls(category, {
    edit: true,
    sourceType: itemObj.source_type,
    status: itemObj.verification_status
  });
  document.getElementById('editSourceRefInput').value =
    itemObj.source_ref && itemObj.source_ref !== '-'
      ? String(itemObj.source_ref)
      : '';

  openModalAccessible(
    'editRecordModal',
    '#editNumberInput'
  );
}

function closeEditRecordModal() {
  closeModalAccessible('editRecordModal');
  editingRecord = null;
}

async function saveEditedRecord() {
  if (!isAdmin || !adminSessionActive) {
    await showConfirm({
      title: "Sesi Admin Berakhir",
      message: "Sesi admin tidak lagi aktif. Silakan login kembali.",
      confirmText: "OK",
      danger: false
    });
    closeEditRecordModal();
    exitAdminMode();
    return;
  }

  const recordBeforeEdit = editingRecord;
  const id = Number(recordBeforeEdit?.id || 0);

  if (!Number.isSafeInteger(id) || id <= 0) {
    showToast("⚠️ Data edit tidak valid.");
    closeEditRecordModal();
    return;
  }

  const category =
    document.getElementById('editCategoryInput').value;
  const nomor = document
    .getElementById('editNumberInput')
    .value
    .replace(/\D/g, '');
  const tanggal =
    document.getElementById('editDateInput').value;
  const metaRaw =
    document.getElementById('editMetaInput').value.trim();
  const meta = metaRaw || '-';
  const sourceType = document.getElementById('editSourceTypeInput').value;
  const verificationStatus = document.getElementById('editVerificationStatusInput').value;
  const sourceRefRaw = document.getElementById('editSourceRefInput').value.trim();
  const sourceRef = sourceRefRaw || '-';

  if (!['rekening', 'genshin'].includes(category)) {
    showToast("⚠️ Kategori tidak valid.");
    return;
  }

  const nomorValid =
    category === 'genshin'
      ? /^\d{5,12}$/.test(nomor)
      : /^\d{5,25}$/.test(nomor);

  if (!nomorValid) {
    showToast(
      category === 'genshin'
        ? "⚠️ UID harus 5 - 12 digit."
        : "⚠️ Nomor harus 5 - 25 digit."
    );
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    showToast("⚠️ Tanggal wajib diisi.");
    return;
  }

  if (meta.length > 100) {
    showToast("⚠️ Bank/Game maksimal 100 karakter.");
    return;
  }

  if (!isProvenanceCombinationValid(category, sourceType, verificationStatus)) {
    showToast("⚠️ Status provenance tidak sesuai dengan kategori data.");
    return;
  }

  if (sourceRef.length > 80) {
    showToast("⚠️ Referensi sumber maksimal 80 karakter.");
    return;
  }

  const saveBtn = document.getElementById('editSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = "Menyimpan...";
  setLoading(true, "Memperbarui data...");

  try {
    const res = await fetch(
      apiUrl(`records/${id}`),
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category,
          nomor,
          tanggal,
          meta,
          source_type: sourceType,
          source_ref: sourceRef,
          verification_status: verificationStatus
        })
      }
    );

    let responseData = {};
    try {
      responseData = await res.json();
    } catch (_) {}

    if (res.status === 401 || res.status === 403) {
      await showConfirm({
        title: "Akses Ditolak",
        message: "Sesi Admin telah berakhir atau akses ditolak oleh server.",
        confirmText: "OK",
        danger: false
      });
      closeEditRecordModal();
      exitAdminMode();
      return;
    }

    if (res.status === 409) {
      showToast("⚠️ Nomor/UID sudah dipakai data lain.");
      return;
    }

    if (res.status === 404) {
      showToast("⚠️ Data sudah tidak ditemukan. Muat ulang halaman.");
      closeEditRecordModal();
      await fetchCategoryRecords(activeTab, {
        reset: true,
        query: getSearchQuery(),
        silent: true
      });
      filterData();
      return;
    }

    if (!res.ok || !responseData.record) {
      throw new Error(
        responseData.error ||
        "Gagal memperbarui data"
      );
    }

    setConnectionState('online');

    const updatedRecord =
      migrateData(
        [responseData.record],
        category
      )[0];

    if (!updatedRecord) {
      throw new Error("Respons record tidak valid");
    }

    closeEditRecordModal();

    if (category !== activeTab) {
      paginationState[category].query = null;
      paginationState[category].hasMore = false;
      paginationState[category].nextCursor = null;
    }

    const currentQuery = getSearchQuery();
    const refreshed = await fetchCategoryRecords(
      activeTab,
      {
        reset: true,
        query: currentQuery,
        silent: true
      }
    );

    if (!refreshed) {
      for (const key of ['rekening', 'genshin']) {
        database[key] = database[key].filter(
          item => Number(item.id) !== id
        );
      }

      if (category === activeTab && !currentQuery) {
        database[category].unshift(updatedRecord);
        sortRecords(database[category]);
      }

      cacheDatabase();
    }

    filterData();
    showTransientStatus("🟢 Data berhasil diperbarui di D1!");
    showToast("Data berhasil diperbarui!");

  } catch (err) {
    console.error("Edit record error:", err);
    markConnectionFailure(err);

    await showConfirm({
      title: "Pembaruan Gagal",
      message: "Data gagal diperbarui karena masalah jaringan atau server.",
      confirmText: "OK",
      danger: false
    });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Simpan Perubahan";
    setLoading(false);
  }
}

/* =========================
   DELETE
========================= */

async function deleteNumber(
  itemObj,
  btnEl
) {

  if (!isAdmin || !adminSessionActive) {
    await showConfirm({
      title: "Sesi Admin Berakhir",
      message:
        "Sesi admin tidak lagi aktif. Silakan login kembali.",
      confirmText: "OK",
      danger: false
    });

    exitAdminMode();
    return;
  }

  if (!itemObj || !Number.isSafeInteger(Number(itemObj.id)) || Number(itemObj.id) <= 0) {
    showToast(
      "⚠️ ID data tidak tersedia. Muat ulang halaman."
    );
    return;
  }

  const nomorStr =
    String(itemObj.nomor);

  const confirmed =
    await showConfirm({
      title: "Hapus Data?",
      message:
        `Data "${nomorStr}" akan dihapus dari database. Tindakan ini tidak dapat dibatalkan.`,
      confirmText: "Hapus",
      danger: true
    });

  if (!confirmed) return;

  if (btnEl) {
    btnEl.disabled = true;
  }

  setLoading(true, "Menghapus data...");

  try {

    const res = await fetch(
      apiUrl(`records/${itemObj.id}`),
      {
        method: 'DELETE',
        credentials: 'include'
      }
    );

    let responseData = {};

    try {
      responseData = await res.json();
    } catch (_) {}

    if (
      res.status === 401 ||
      res.status === 403
    ) {
      await showConfirm({
        title: "Akses Ditolak",
        message:
          "Sesi Admin telah berakhir atau akses ditolak oleh server.",
        confirmText: "OK",
        danger: false
      });

      exitAdminMode();
      return;
    }

    if (!res.ok) {
      throw new Error(
        responseData.error ||
        "Gagal menghapus data"
      );
    }

    setConnectionState('online');

    const currentQuery =
      getSearchQuery();

    const refreshed =
      await fetchCategoryRecords(
        activeTab,
        {
          reset: true,
          query: currentQuery,
          silent: true
        }
      );

    if (!refreshed) {
      database[activeTab] =
        database[activeTab].filter(
          item =>
            Number(item.id) !==
            Number(itemObj.id)
        );

      const state =
        paginationState[activeTab];

      state.total =
        Math.max(
          0,
          state.total - 1
        );

      state.hasMore = false;
      state.nextCursor = null;

      cacheDatabase();
    }

    filterData();

    showTransientStatus("🟢 Data dihapus dari D1!");

    showToast(
      "Data dihapus!"
    );

  } catch (err) {

    console.error(
      "Delete record error:",
      err
    );

    markConnectionFailure(err);

    await showConfirm({
      title: "Penghapusan Gagal",
      message:
        "Data gagal dihapus karena masalah jaringan atau server.",
      confirmText: "OK",
      danger: false
    });

    if (btnEl) {
      btnEl.disabled = false;
    }

  } finally {

    setLoading(false);
  }
}

/* =========================
   TABS
========================= */

async function switchTab(tab) {
  if (!['rekening', 'genshin'].includes(tab)) return;

  activeTab = tab;
  updateTabUrlParam(tab);

  document
    .getElementById('tabRekening')
    .classList.toggle(
      'active',
      tab === 'rekening'
    );

  document
    .getElementById('tabGenshin')
    .classList.toggle(
      'active',
      tab === 'genshin'
    );

  const tabRekening =
    document.getElementById('tabRekening');

  const tabGenshin =
    document.getElementById('tabGenshin');

  tabRekening.setAttribute(
    'aria-selected',
    String(tab === 'rekening')
  );

  tabGenshin.setAttribute(
    'aria-selected',
    String(tab === 'genshin')
  );

  tabRekening.tabIndex =
    tab === 'rekening' ? 0 : -1;

  tabGenshin.tabIndex =
    tab === 'genshin' ? 0 : -1;

  document.getElementById('resultPanel').setAttribute(
    'aria-labelledby',
    tab === 'rekening' ? 'tabRekening' : 'tabGenshin'
  );

  const input =
    document.getElementById(
      'searchInput'
    );

  input.placeholder =
    tab === 'rekening'
      ? "Cari nomor rekening..."
      : "Cari UID...";

  updateResultColumns(tab);
  updateMetaSelectOptions();
  populateProvenanceControls(tab);

  const query =
    getSearchQuery();

  const state =
    paginationState[tab];

  if (
    navigator.onLine !== false &&
    state.query !== query
  ) {
    const ok = await fetchCategoryRecords(
      tab,
      {
        reset: true,
        query
      }
    );

    if (!ok) {
      showToast(
        "⚠️ Gagal memuat tab."
      );
    }
  }

  filterData();
}

/* =========================
   SEARCH NORMALIZATION
========================= */

function normalizeSearchValue(value) {

  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/* =========================
   EVENT RESULT LIST
========================= */

document
  .getElementById('resultList')
  .addEventListener(
    'click',
    async (e) => {

      const target =
        e.target;

      /*
       * Pagination diperbaiki:
       * tombol sekarang benar-benar
       * bekerja karena elemen load-more
       * ditambahkan ke fragment/resultList.
       */
      if (
        target.classList.contains(
          'btn-load-more'
        )
      ) {

        const originalText = target.textContent;
        target.disabled = true;
        target.textContent = "Memuat...";

        try {
          await loadMoreRecords();
        } finally {
          // Bila render gagal/permintaan gagal dan tombol lama masih ada,
          // pulihkan agar pengguna dapat mencoba lagi.
          if (target.isConnected) {
            target.disabled = false;
            target.textContent = originalText;
          }
        }

        return;
      }

      const itemEl =
        target.closest(
          '.result-item'
        );

      if (!itemEl) return;

      const nomorStr =
        itemEl.dataset.nomor;

      const itemId =
        Number(itemEl.dataset.id || 0);

      const itemObj =
        database[activeTab].find(
          i =>
            (
              itemId > 0 &&
              Number(i.id) === itemId
            ) ||
            String(i.nomor) === nomorStr
        );

      if (
        target.classList.contains(
          'btn-edit'
        )
      ) {

        e.stopPropagation();

        openEditRecord(
          itemObj
        );

      } else if (
        target.classList.contains(
          'btn-delete'
        )
      ) {

        e.stopPropagation();

        await deleteNumber(
          itemObj,
          target
        );

      } else if (
        target.classList.contains(
          'btn-icon'
        )
      ) {

        e.stopPropagation();

        copyReportTemplate(
          itemObj || nomorStr
        );

      } else {

        copyToClipboard(
          nomorStr,
          `Disalin: ${nomorStr}`
        );
      }
    }
  );

/* =========================
   COPY TEMPLATE
========================= */

function copyReportTemplate(itemObj) {

  const nomorStr =
    typeof itemObj === 'object'
      ? itemObj.nomor
      : itemObj;

  const category =
    typeof itemObj === 'object' && itemObj.category === 'genshin'
      ? 'genshin'
      : 'rekening';

  const metaStr =
    typeof itemObj === 'object'
      ? (itemObj.meta || itemObj.bank || itemObj.game || '-')
      : '-';

  const tanggalStr =
    typeof itemObj === 'object'
      ? itemObj.tanggal
      : '-';

  const normalized = normalizeProvenance(
    category,
    typeof itemObj === 'object' ? itemObj.source_type : null,
    typeof itemObj === 'object' ? itemObj.verification_status : null
  );

  const sourceLabel = getSourceTypeLabel(normalized.source_type, category);
  const statusLabel = getVerificationStatusLabel(normalized.verification_status, category);

  const sourceRef =
    typeof itemObj === 'object' && itemObj.source_ref && itemObj.source_ref !== '-'
      ? String(itemObj.source_ref)
      : '-';

  const isUid = category === 'genshin';
  const heading = isUid ? '🛡️ VERIFIKASI UID HB' : '🚨 CATATAN LAPORAN REKENING';
  const dateLabel = isUid ? 'Tanggal Verifikasi' : 'Tanggal Laporan';
  const provenanceLabel = isUid ? 'Metode Verifikasi' : 'Jenis Bukti';
  const disclaimer = isUid
    ? 'Status menunjukkan hasil pemeriksaan langsung admin pada tanggal verifikasi.'
    : 'Status menjelaskan dokumentasi/telaah bukti dan bukan penetapan bersalah.';

  const template =
`${heading}

Nomor/UID: ${nomorStr}
Platform/Bank: ${metaStr}
${dateLabel}: ${tanggalStr}
${provenanceLabel}: ${sourceLabel}
Status: ${statusLabel}
Referensi: ${sourceRef}

Catatan: ${disclaimer}`;

  copyToClipboard(
    template,
    isUid ? 'Template verifikasi disalin!' : 'Template laporan disalin!'
  );
}

/* =========================
   FILTER + PAGINATION
========================= */

function filterData() {
  try {
    updateResultColumns(activeTab);

    const rawQuery =
      getSearchQuery()
        .toLowerCase();

    const cleanQuery =
      normalizeSearchValue(
        rawQuery
      );

    const resultList =
      document.getElementById(
        'resultList'
      );

    const counter =
      document.getElementById(
        'dataCounter'
      );

    while (
      resultList.firstChild
    ) {
      resultList.removeChild(
        resultList.firstChild
      );
    }

    const currentData =
      database[activeTab] || [];

    const state =
      paginationState[activeTab];

    let visibleData =
      currentData;

    // Hanya dipakai saat offline karena server tidak tersedia.
    if (offlineMode && rawQuery) {
      visibleData =
        currentData.filter(item => {
          const nomorStr =
            String(item?.nomor || '');

          const tanggalStr =
            String(
              item?.tanggal || ''
            ).toLowerCase();

          const metaStr =
            String(
              item?.meta ||
              item?.bank ||
              item?.game ||
              ''
            ).toLowerCase();

          const nomorNormalized =
            normalizeSearchValue(
              nomorStr
            );

          const isNumericQuery = /^[0-9\s.\-]+$/.test(rawQuery);
          const numericQuery = isNumericQuery
            ? rawQuery.replace(/[^0-9]/g, '')
            : '';
          const numberMatches = numericQuery
            ? nomorNormalized.startsWith(numericQuery)
            : false;

          return (
            numberMatches ||
            tanggalStr.includes(rawQuery) ||
            metaStr.includes(rawQuery)
          );
        });
    }

    if (offlineMode) {
      const cachedTotal =
        Number(state.total || 0);

      const categoryLabel = activeTab === 'rekening' ? 'Rekening' : 'UID';
      counter.textContent =
        cachedTotal > visibleData.length
          ? `${visibleData.length}/${cachedTotal} ${categoryLabel}`
          : `${visibleData.length} ${categoryLabel}`;
    } else {
      const categoryLabel = activeTab === 'rekening' ? 'Rekening' : 'UID';
      counter.textContent = `${state.total} ${categoryLabel}`;
    }

    if (
      visibleData.length === 0
    ) {
      const emptyLi =
        document.createElement(
          'li'
        );

      emptyLi.className =
        'empty-msg';

      emptyLi.textContent =
        offlineMode
          ? 'Tidak ditemukan di cache lokal. Hubungkan internet untuk memastikan data terbaru.'
          : 'Tidak ada data ditemukan.';

      resultList.appendChild(
        emptyLi
      );

      return;
    }

    const fragment =
      document.createDocumentFragment();

    visibleData.forEach(item => {
      const nomorStr =
        typeof item === 'object'
          ? String(item.nomor)
          : String(item);

      const tanggalStr =
        typeof item === 'object'
          ? String(
              item.tanggal || '-'
            )
          : '-';

      const metaStr =
        typeof item === 'object'
          ? String(
              item.meta ||
              item.bank ||
              item.game ||
              '-'
            )
          : '-';

      const itemCategory =
        item?.category === 'genshin'
          ? 'genshin'
          : activeTab;

      const li =
        document.createElement(
          'li'
        );

      li.className =
        'result-item';

      li.dataset.nomor =
        nomorStr;

      if (item && item.id) {
        li.dataset.id =
          String(item.id);
      }

      li.title =
        "Klik untuk menyalin nomor";

      const numberButton =
        document.createElement(
          'button'
        );

      numberButton.type = 'button';

      numberButton.className =
        'number';

      numberButton.setAttribute(
        'aria-label',
        `Salin nomor ${nomorStr}`
      );

      numberButton.textContent =
        nomorStr;

      const topRow =
        document.createElement(
          'div'
        );

      topRow.className =
        'record-top';

      const actionContent =
        document.createElement(
          'div'
        );

      actionContent.className =
        'record-actions';

      const rightContent =
        document.createElement(
          'div'
        );

      rightContent.className =
        `right-content right-content-${itemCategory}`;

      if (
        itemCategory === 'rekening' &&
        metaStr &&
        metaStr !== '-'
      ) {
        const metaSpan =
          document.createElement(
            'span'
          );

        metaSpan.className =
          'badge-meta';

        if (itemCategory === 'rekening') {
          metaSpan.classList.add('payment-brand');
          metaSpan.appendChild(
            createPaymentBrandIcon(metaStr)
          );

          const metaLabel = document.createElement('span');
          metaLabel.className = 'payment-brand-name';
          metaLabel.textContent = metaStr;
          metaSpan.appendChild(metaLabel);
        } else {
          metaSpan.textContent = metaStr;
        }

        rightContent.appendChild(
          metaSpan
        );
      }

      if (
        tanggalStr !== '-' &&
        tanggalStr.length > 0
      ) {
        const dateSpan =
          document.createElement(
            'span'
          );

        dateSpan.className =
          'badge-date';

        const dParts =
          tanggalStr.includes('-')
            ? tanggalStr.split('-')
            : [tanggalStr];

        const formattedDate =
          dParts.length === 3
            ? `${dParts[2]}/${dParts[1]}/${dParts[0]}`
            : tanggalStr;

        dateSpan.textContent =
          formattedDate;

        rightContent.appendChild(
          dateSpan
        );
      }

      const provenance = normalizeProvenance(
        itemCategory,
        item?.source_type,
        item?.verification_status
      );
      const sourceType = provenance.source_type;
      const verificationStatus = provenance.verification_status;

      const statusBadge = document.createElement('span');
      statusBadge.className = `badge-provenance badge-status-${verificationStatus}`;
      statusBadge.textContent = getVerificationStatusLabel(verificationStatus, itemCategory);
      statusBadge.title = itemCategory === 'genshin'
        ? `Status verifikasi UID: ${getVerificationStatusLabel(verificationStatus, itemCategory)}`
        : `Status laporan: ${getVerificationStatusLabel(verificationStatus, itemCategory)}`;
      rightContent.appendChild(statusBadge);

      // Provenance tetap disimpan dan tersedia di API/admin, tetapi tampilan publik
      // hanya menampilkan satu status utama agar kartu tetap ringkas dan jelas.
      if (item?.source_ref && item.source_ref !== '-') {
        const sourceRef = document.createElement('span');
        sourceRef.className = 'record-reference';
        sourceRef.textContent = `Ref: ${item.source_ref}`;
        sourceRef.title = itemCategory === 'genshin'
          ? `Referensi verifikasi: ${item.source_ref}`
          : `Referensi laporan/bukti: ${item.source_ref}`;
        rightContent.appendChild(sourceRef);
      }

      if (isAdmin) {
        const editBtn =
          document.createElement(
            'button'
          );

        editBtn.type = 'button';
        editBtn.className =
          'btn btn-edit';
        editBtn.textContent =
          'Edit';
        editBtn.setAttribute(
          'aria-label',
          `Edit data ${nomorStr}`
        );

        actionContent.appendChild(
          editBtn
        );

        const deleteBtn =
          document.createElement(
            'button'
          );

        deleteBtn.type = 'button';

        deleteBtn.className =
          'btn btn-delete';

        deleteBtn.textContent =
          'Hapus';

        deleteBtn.setAttribute(
          'aria-label',
          `Hapus data ${nomorStr}`
        );

        actionContent.appendChild(
          deleteBtn
        );
      }

      topRow.appendChild(
        numberButton
      );

      if (actionContent.childElementCount > 0) {
        topRow.appendChild(
          actionContent
        );
      }

      li.appendChild(
        topRow
      );

      li.appendChild(
        rightContent
      );

      fragment.appendChild(
        li
      );
    });

    if (
      navigator.onLine !== false &&
      state.hasMore
    ) {
      const loadMoreLi =
        document.createElement(
          'li'
        );

      loadMoreLi.className =
        'load-more-container';

      const loadMoreBtn =
        document.createElement(
          'button'
        );

      loadMoreBtn.type = 'button';

      loadMoreBtn.className =
        'btn btn-load-more';

      const remaining =
        Math.max(
          0,
          state.total -
          currentData.length
        );

      loadMoreBtn.textContent =
        `Muat Lebih Banyak (${Math.min(
          PAGE_SIZE,
          remaining
        )})`;

      loadMoreBtn.setAttribute(
        'aria-label',
        `Muat ${Math.min(
          PAGE_SIZE,
          remaining
        )} data berikutnya`
      );

      loadMoreLi.appendChild(
        loadMoreBtn
      );

      fragment.appendChild(
        loadMoreLi
      );
    }

    resultList.appendChild(
      fragment
    );

  } catch (error) {
    console.error(
      "Terjadi masalah saat merender list:",
      error
    );

    const resultList =
      document.getElementById(
        'resultList'
      );

    while (
      resultList.firstChild
    ) {
      resultList.removeChild(
        resultList.firstChild
      );
    }

    const errLi =
      document.createElement(
        'li'
      );

    errLi.className =
      'empty-msg error';

    errLi.textContent =
      'Terjadi kendala saat membaca data. Coba muat ulang halaman.';

    resultList.appendChild(
      errLi
    );
  }
}

/* =========================
   SEARCH EVENT
========================= */

document
  .getElementById('searchInput')
  .addEventListener(
    'input',
    () => {
      clearTimeout(
        searchTimeout
      );

      searchTimeout =
        setTimeout(() => {
          runServerSearch();
        }, 300);
    }
  );

/* =========================
   KEYBOARD SEARCH
========================= */

document.addEventListener(
  'keydown',
  (e) => {

    const searchInput =
      document.getElementById(
        'searchInput'
      );

    if (
      e.key === '/' &&
      document.activeElement !== searchInput &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA'
    ) {

      e.preventDefault();

      searchInput.focus();
    }
  }
);

/* =========================
   CLIPBOARD
========================= */

function copyToClipboard(
  text,
  toastMessage = 'Berhasil disalin!'
) {

  if (
    navigator.clipboard &&
    window.isSecureContext
  ) {

    navigator.clipboard
      .writeText(text)
      .then(() => {

        showToast(
          toastMessage
        );

      })
      .catch(err => {

        console.error(
          'Gagal menyalin:',
          err
        );

        fallbackCopy(
          text,
          toastMessage
        );
      });

  } else {

    fallbackCopy(
      text,
      toastMessage
    );
  }
}

function fallbackCopy(
  text,
  toastMessage
) {

  const textarea =
    document.createElement(
      'textarea'
    );

  textarea.value =
    text;

  textarea.className =
    'clipboard-helper';

  document.body.appendChild(
    textarea
  );

  textarea.select();

  try {

    document.execCommand(
      'copy'
    );

    showToast(
      toastMessage
    );

  } catch (err) {

    console.error(
      'Gagal menyalin:',
      err
    );

    showToast(
      'Gagal menyalin ke clipboard.'
    );

  } finally {

    document.body.removeChild(
      textarea
    );
  }
}

/* =========================
   TOAST
========================= */

function showToast(message) {

  const toast =
    document.getElementById(
      'toast'
    );

  toast.textContent =
    message;

  toast.classList.add('show');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    toastTimer = null;
  }, 3000);
}

/* =========================
   QRIS
========================= */

function openQrisModal(src) {

  document.getElementById(
    'modalImg'
  ).src = src;

  openModalAccessible('qrisModal');
}

function closeQrisModal() {
  closeModalAccessible('qrisModal');
}

/* =========================
   STATIC EVENT BINDING
   (CSP: tanpa inline onclick/onkeydown)
========================= */

function bindStaticEvents() {
  const homeTitle = document.getElementById('homeTitle');
  homeTitle?.addEventListener('click', resetToHome);

  document.getElementById('authBtn')
    ?.addEventListener('click', toggleAdmin);

  document.getElementById('themeToggleBtn')
    ?.addEventListener('click', toggleTheme);

  const tabRekening = document.getElementById('tabRekening');
  tabRekening?.addEventListener('click', () => switchTab('rekening'));
  tabRekening?.addEventListener('keydown', handleTabKeyDown);

  const tabGenshin = document.getElementById('tabGenshin');
  tabGenshin?.addEventListener('click', () => switchTab('genshin'));
  tabGenshin?.addEventListener('keydown', handleTabKeyDown);

  document.getElementById('metaSelectInput')
    ?.addEventListener('change', event =>
      handleMetaSelectChange(event.currentTarget)
    );

  document.getElementById('newNumberInput')
    ?.addEventListener('keydown', handleInputKeyDown);

  document.getElementById('btnAdd')
    ?.addEventListener('click', addNumber);

  const qrisThumb = document.getElementById('qrisThumb');
  const qrisButton = document.getElementById('qrisButton');
  qrisButton?.addEventListener('click', () => {
    if (qrisThumb?.src) openQrisModal(qrisThumb.src);
  });

  const adminModal = document.getElementById('adminModal');
  adminModal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeAdminModal();
  });

  document.getElementById('adminPasswordInput')
    ?.addEventListener('keydown', handleAdminModalKeyDown);
  document.getElementById('adminCancelBtn')
    ?.addEventListener('click', closeAdminModal);
  document.getElementById('adminLoginBtn')
    ?.addEventListener('click', submitAdminLogin);

  const editRecordModal = document.getElementById('editRecordModal');
  editRecordModal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeEditRecordModal();
  });
  document.getElementById('editCancelBtn')
    ?.addEventListener('click', closeEditRecordModal);
  document.getElementById('editCategoryInput')
    ?.addEventListener('change', event => {
      const category = event.currentTarget.value === 'genshin' ? 'genshin' : 'rekening';
      populateProvenanceControls(category, { edit: true });
    });
  document.getElementById('editSaveBtn')
    ?.addEventListener('click', saveEditedRecord);
  document.getElementById('editNumberInput')
    ?.addEventListener('keydown', event => {
      if (event.key === 'Enter') saveEditedRecord();
    });

  const confirmModal = document.getElementById('confirmModal');
  confirmModal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeConfirmModal(false);
  });
  document.getElementById('confirmCancelBtn')
    ?.addEventListener('click', () => closeConfirmModal(false));
  document.getElementById('confirmOkBtn')
    ?.addEventListener('click', () => closeConfirmModal(true));

  document.getElementById('qrisCloseBtn')
    ?.addEventListener('click', closeQrisModal);

  const qrisModal = document.getElementById('qrisModal');
  qrisModal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeQrisModal();
  });
}

bindStaticEvents();
initPremiumAd();
updateResultColumns(activeTab);
populateProvenanceControls(activeTab);

/* =========================
   ACCESSIBLE MODAL KEYBOARD
========================= */

document.addEventListener(
  'keydown',
  (event) => {
    const openModal = [
      'confirmModal',
      'editRecordModal',
      'adminModal',
      'qrisModal'
    ]
      .map(id => document.getElementById(id))
      .find(modal => modal && modal.classList.contains('is-open'));

    if (!openModal) return;

    if (event.key === 'Escape') {
      event.preventDefault();

      if (openModal.id === 'confirmModal') {
        closeConfirmModal(false);
      } else if (openModal.id === 'editRecordModal') {
        closeEditRecordModal();
      } else if (openModal.id === 'adminModal') {
        closeAdminModal();
      } else if (openModal.id === 'qrisModal') {
        closeQrisModal();
      }

      return;
    }

    trapFocus(event, openModal);
  }
);

/* =========================
   CONNECTION STATE
========================= */

function cancelActiveCategoryRequests() {
  for (const category of ['rekening', 'genshin']) {
    categoryControllers[category]?.abort();
    categoryControllers[category] = null;
  }
}

function handleBrowserOffline() {
  cancelActiveCategoryRequests();
  setConnectionState(
    hasUsableLocalData()
      ? 'offline-cache'
      : 'offline-empty'
  );
  filterData();
}

async function handleBrowserOnline() {
  if (connectionRecoveryInProgress) return;

  connectionRecoveryInProgress = true;
  setConnectionState('checking');

  const status = document.getElementById('statusBar');
  if (status) {
    status.textContent =
      "⏳ Koneksi kembali — menyinkronkan data D1...";
  }

  try {
    const ok = await fetchCategoryRecords(
      activeTab,
      {
        reset: true,
        query: getSearchQuery(),
        silent: true
      }
    );

    if (ok) {
      filterData();
      showTransientStatus(
        "🟢 Koneksi pulih — data terbaru tersedia.",
        2500
      );
    } else {
      restoreDefaultStatusBar();
    }
  } finally {
    connectionRecoveryInProgress = false;
  }
}

window.addEventListener('offline', handleBrowserOffline);
window.addEventListener('online', handleBrowserOnline);

/* =========================
   SERVICE WORKER
========================= */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
    } catch (err) {
      console.warn('Service Worker gagal didaftarkan:', err);
    }
  });
}

/* =========================
   INITIAL LOAD
========================= */

(async function initApp() {
  await restoreAdminSession();
  await fetchOnlineDatabase();
})();