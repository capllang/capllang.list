const PROXY_URL = "/api";
const CACHE_KEY = "cached_scammer_db_v2";
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

const PAGE_SIZE = 50;

let adminSessionActive = false;
let isLoading = false;
let offlineMode = false;

const paginationState = {
  rekening: {
    total: 0,
    query: null,
    hasMore: false
  },
  genshin: {
    total: 0,
    query: null,
    hasMore: false
  }
};

const categoryControllers = {
  rekening: null,
  genshin: null
};

const modalPreviousFocus = new Map();

function handleActivationKey(event, action) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function handleQrisKeyDown(event, src) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openQrisModal(src);
  }
}

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

/* =========================
   LOADING STATE
========================= */

function setLoading(state, text = "Memuat...") {
  isLoading = state;

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
          meta: "-"
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
            : "-"
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

  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      ...database,
      cachedAt: Date.now(),
      paginationState: cachedState
    })
  );
}

function readFreshCache() {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const cachedAt = Number(parsed?.cachedAt || 0);

    if (!Number.isFinite(cachedAt) || cachedAt <= 0) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    if (Date.now() - cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(CACHE_KEY);
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

  localStorage.setItem(
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

if (localStorage.getItem('theme') === 'dark') {

  document.body.classList.add('dark-mode');

  document.getElementById('themeToggleBtn').textContent =
    'Light';

  document.getElementById('themeToggleBtn').setAttribute(
    'aria-pressed',
    'true'
  );
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

  if (searchQuery) {
    document.getElementById('searchInput').value =
      searchQuery;
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

  if (!shouldReset && !state.hasMore) {
    return true;
  }

  const offset =
    shouldReset
      ? 0
      : database[category].length;

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
      reset ? "Memuat data..." : "Memuat data berikutnya..."
    );
  }

  try {
    const params = new URLSearchParams({
      category,
      limit: String(PAGE_SIZE),
      offset: String(offset)
    });

    if (cleanQuery) {
      params.set('q', cleanQuery);
    }

    const res = await fetch(
      `${PROXY_URL}/records?${params.toString()}`,
      {
        signal: controller.signal,
        cache: 'no-store'
      }
    );

    if (!res.ok) {
      throw new Error(
        `Gagal mengambil data (${res.status})`
      );
    }

    const data = await res.json();

    if (!Array.isArray(data.records)) {
      throw new Error(
        "Format data D1 tidak sesuai"
      );
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

    state.total = Number(data.total || 0);
    state.query = cleanQuery;
    state.hasMore =
      database[category].length < state.total;

    offlineMode = false;
    database.lastUpdated =
      new Date().toISOString();

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
    status.innerText =
      "⏳ Mengambil data dari D1...";

    const [rekeningOk, genshinOk] =
      await Promise.all([
        fetchCategoryRecords(
          'rekening',
          {
            reset: true,
            query: initialQuery,
            silent: true
          }
        ),
        fetchCategoryRecords(
          'genshin',
          {
            reset: true,
            query: initialQuery,
            silent: true
          }
        )
      ]);

    if (!rekeningOk || !genshinOk) {
      throw new Error(
        "Sebagian data gagal dimuat"
      );
    }

    offlineMode = false;

    status.innerText =
      "🟢 Terhubung ke D1 — data dimuat bertahap.";

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
      offlineMode = true;

      status.innerText =
        "🟡 Mode Offline: cache lokal maksimal 12 jam.";
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
        hasMore: false
      };

      paginationState.genshin = {
        total: 0,
        query: '',
        hasMore: false
      };

      offlineMode = true;

      status.innerText =
        "🔴 Mode Offline: cache tidak tersedia atau kedaluwarsa.";
    }

  } finally {
    setLoading(false);
  }

  filterData();
}

async function loadMoreRecords() {
  if (offlineMode) {
    showToast(
      "Mode offline: data tambahan membutuhkan koneksi."
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

  if (offlineMode) {
    // Saat offline, pencarian hanya pada cache yang tersedia.
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

  document.getElementById('authBtn').innerText =
    "🔑 Mode Pemilik";

  document.getElementById('authBtn').setAttribute(
    'aria-pressed',
    'false'
  );

  document.getElementById('addBox').classList.add('is-hidden');

  filterData();
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
      await fetch(
        `${PROXY_URL}/auth/logout`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
    } catch (err) {
      console.warn(
        'Logout server gagal:',
        err
      );
    }

    exitAdminMode();

    showToast(
      "Keluar Mode Pemilik"
    );
  }
}

async function restoreAdminSession() {

  try {
    const res = await fetch(
      `${PROXY_URL}/auth/me`,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      }
    );

    if (!res.ok) return;

    const data = await res.json();

    if (!data.authenticated) return;

    isAdmin = true;
    adminSessionActive = true;

    document.getElementById('authBtn').innerText =
      "🔓 Keluar Mode";

    document.getElementById('authBtn').setAttribute(
      'aria-pressed',
      'true'
    );

    document.getElementById('addBox').classList.remove('is-hidden');

    document.getElementById('newDateInput')
      .valueAsDate = new Date();

    updateMetaSelectOptions();

  } catch (err) {
    console.warn(
      'Tidak dapat memulihkan sesi admin:',
      err
    );
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
        `${PROXY_URL}/auth/login`,
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
     * Tidak menyimpan password/token/session
     * ke JavaScript.
     *
     * Session ditangani oleh cookie
     * HttpOnly dari server.
     */
    isAdmin = true;
    adminSessionActive = true;

    document.getElementById('authBtn').innerText =
      "🔓 Keluar Mode";

    document.getElementById('authBtn').setAttribute(
      'aria-pressed',
      'true'
    );

    document.getElementById('addBox').classList.remove('is-hidden');

    document.getElementById('newDateInput')
      .valueAsDate = new Date();

    updateMetaSelectOptions();

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
      "⚠️ Gagal login: masalah jaringan/server."
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

  const cleanVal =
    rawVal.replace(/\D/g, '');

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
      `${PROXY_URL}/records`,
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
          meta: selectedMeta
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

      state.hasMore =
        database[activeTab].length <
        state.total;

      cacheDatabase();
    }

    filterData();

    document.getElementById('statusBar').innerText =
      "🟢 Tersimpan di D1!";

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

    document.getElementById('statusBar').innerText =
      "⚠️ Simpan gagal";

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

  if (!itemObj || !Number.isSafeInteger(Number(itemObj.id))) {
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
      `${PROXY_URL}/records/${itemObj.id}`,
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

      state.hasMore =
        database[activeTab].length <
        state.total;

      cacheDatabase();
    }

    filterData();

    document.getElementById('statusBar').innerText =
      "🟢 Data dihapus dari D1!";

    showToast(
      "Data dihapus!"
    );

  } catch (err) {

    console.error(
      "Delete record error:",
      err
    );

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
  activeTab = tab;

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

  const input =
    document.getElementById(
      'searchInput'
    );

  input.placeholder =
    tab === 'rekening'
      ? "Tulis nomor rekening di sini..."
      : "Tulis UID game di sini...";

  updateMetaSelectOptions();

  const query =
    getSearchQuery();

  const state =
    paginationState[tab];

  if (
    !offlineMode &&
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

        target.disabled = true;
        target.textContent =
          "Memuat...";

        await loadMoreRecords();

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
   KEYBOARD RESULT ITEM
========================= */

document
  .getElementById('resultList')
  .addEventListener(
    'keydown',
    (e) => {
      if (
        (e.key === 'Enter' || e.key === ' ') &&
        e.target.classList.contains('number')
      ) {
        e.preventDefault();

        const itemEl =
          e.target.closest('.result-item');

        const nomorStr =
          itemEl?.dataset?.nomor || '';

        if (nomorStr) {
          copyToClipboard(
            nomorStr,
            `Disalin: ${nomorStr}`
          );
        }
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

  const metaStr =
    typeof itemObj === 'object'
      ? (
          itemObj.meta ||
          itemObj.bank ||
          itemObj.game ||
          '-'
        )
      : '-';

  const tanggalStr =
    typeof itemObj === 'object'
      ? itemObj.tanggal
      : '-';

  const template =
`🚨 LAPORAN PENIPUAN 🚨

Nomor/UID: ${nomorStr}
Platform/Bank: ${metaStr}
Tanggal Terdata: ${tanggalStr}

Hati-hati terhadap modus penipuan dengan informasi di atas!`;

  copyToClipboard(
    template,
    'Template laporan disalin!'
  );
}

/* =========================
   FILTER + PAGINATION
========================= */

function filterData() {
  try {
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

          return (
            nomorStr
              .toLowerCase()
              .includes(rawQuery) ||
            (
              cleanQuery &&
              nomorNormalized.includes(
                cleanQuery
              )
            ) ||
            tanggalStr.includes(
              rawQuery
            ) ||
            metaStr.includes(
              rawQuery
            )
          );
        });
    }

    if (offlineMode) {
      const cachedTotal =
        Number(state.total || 0);

      counter.textContent =
        cachedTotal > visibleData.length
          ? `${visibleData.length}/${cachedTotal} Cache`
          : `${visibleData.length} Data`;
    } else {
      counter.textContent =
        `${state.total} Data`;
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

      const numberSpan =
        document.createElement(
          'span'
        );

      numberSpan.className =
        'number';

      numberSpan.setAttribute(
        'role',
        'button'
      );

      numberSpan.tabIndex = 0;

      numberSpan.setAttribute(
        'aria-label',
        `Salin nomor ${nomorStr}`
      );

      numberSpan.textContent =
        nomorStr;

      const rightContent =
        document.createElement(
          'div'
        );

      rightContent.className =
        'right-content';

      if (
        metaStr &&
        metaStr !== '-'
      ) {
        const metaSpan =
          document.createElement(
            'span'
          );

        metaSpan.className =
          'badge-meta';

        metaSpan.textContent =
          metaStr;

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

      const copyBtn =
        document.createElement(
          'button'
        );

      copyBtn.className =
        'btn-icon';

      copyBtn.title =
        'Salin Template Laporan';

      copyBtn.setAttribute(
        'aria-label',
        `Salin template laporan untuk ${nomorStr}`
      );

      copyBtn.textContent =
        '📢';

      rightContent.appendChild(
        copyBtn
      );

      if (isAdmin) {
        const deleteBtn =
          document.createElement(
            'button'
          );

        deleteBtn.className =
          'btn btn-delete';

        deleteBtn.textContent =
          'Hapus';

        deleteBtn.setAttribute(
          'aria-label',
          `Hapus data ${nomorStr}`
        );

        rightContent.appendChild(
          deleteBtn
        );
      }

      li.appendChild(
        numberSpan
      );

      li.appendChild(
        rightContent
      );

      fragment.appendChild(
        li
      );
    });

    if (
      !offlineMode &&
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

  toast.classList.add(
    'show'
  );

  setTimeout(() => {

    toast.classList.remove(
      'show'
    );

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
  homeTitle?.addEventListener('keydown', event =>
    handleActivationKey(event, resetToHome)
  );

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
  qrisThumb?.addEventListener('click', () => openQrisModal(qrisThumb.src));
  qrisThumb?.addEventListener('keydown', event =>
    handleQrisKeyDown(event, qrisThumb.src)
  );

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

  const confirmModal = document.getElementById('confirmModal');
  confirmModal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeConfirmModal(false);
  });
  document.getElementById('confirmCancelBtn')
    ?.addEventListener('click', () => closeConfirmModal(false));
  document.getElementById('confirmOkBtn')
    ?.addEventListener('click', () => closeConfirmModal(true));

  const qrisModal = document.getElementById('qrisModal');
  qrisModal?.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeQrisModal();
  });
}

bindStaticEvents();

/* =========================
   ACCESSIBLE MODAL KEYBOARD
========================= */

document.addEventListener(
  'keydown',
  (event) => {
    const openModal = [
      'confirmModal',
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
