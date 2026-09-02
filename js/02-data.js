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

