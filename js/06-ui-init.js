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