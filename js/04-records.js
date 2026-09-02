let addRecordInFlight = false;
let editRecordSaveInFlight = false;

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

  if (addRecordInFlight) {
    return;
  }

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


  addRecordInFlight = true;

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

    const wasRestored = responseData.restored === true;

    showTransientStatus(
      wasRestored
        ? "🟢 Data dipulihkan di D1!"
        : "🟢 Tersimpan di D1!"
    );

    showToast(
      wasRestored
        ? "Data lama berhasil dipulihkan!"
        : "Data berhasil ditambahkan!"
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

    addRecordInFlight = false;

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
  if (editRecordSaveInFlight) {
    return;
  }

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
  const rawNomor =
    document.getElementById('editNumberInput').value;
  const normalizedNumber =
    normalizeNumberInput(rawNomor);

  if (!normalizedNumber.ok) {
    showToast(`⚠️ ${normalizedNumber.error}`);
    return;
  }

  const nomor = normalizedNumber.value;
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

  editRecordSaveInFlight = true;

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
    editRecordSaveInFlight = false;

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
        `Data "${nomorStr}" akan disembunyikan dari daftar publik. Riwayat tetap disimpan untuk audit dan dapat dipulihkan dengan menambahkan kembali nomor/UID yang sama.`,
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

  if (isAdmin && adminSessionActive) {
  updateMetaSelectOptions();
  populateProvenanceControls(tab);
}

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

