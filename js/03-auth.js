let adminLoginInFlight = false;

function exitAdminMode() {
  isAdmin = false;
  adminSessionActive = false;
  adminSessionExpiresAt = null;
  editingRecord = null;
  closeModalAccessible('editRecordModal');
  scrubPrivateRecordData();
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
  if (database[activeTab]?.length > 0) {
  filterData();
}
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
populateProvenanceControls(activeTab);
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

  if (adminLoginInFlight) {
    return;
  }

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

  adminLoginInFlight = true;

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

    adminLoginInFlight = false;

    submitBtn.disabled = false;
    submitBtn.innerText =
      originalBtnText;

    setLoading(false);
  }
}

/* =========================
   ADD DATA
========================= */

