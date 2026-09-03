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
    isAdmin &&
    typeof itemObj === 'object' &&
    itemObj.source_ref &&
    itemObj.source_ref !== '-'
      ? String(itemObj.source_ref)
      : '-';

  const isUid = category === 'genshin';
  const heading = isUid ? '🛡️ VERIFIKASI UID HB' : '🚨 CATATAN LAPORAN REKENING';
  const dateLabel = isUid ? 'Tanggal Verifikasi' : 'Tanggal Laporan';
  const provenanceLabel = isUid ? 'Metode Verifikasi' : 'Jenis Bukti';
  const disclaimer = isUid
    ? 'Status menunjukkan hasil pemeriksaan langsung admin pada tanggal verifikasi.'
    : 'Status menjelaskan dokumentasi/telaah bukti dan bukan penetapan bersalah.';

  const referenceLine =
    isAdmin && sourceRef !== '-'
      ? `\nReferensi: ${sourceRef}`
      : '';

  const template =
`${heading}

Nomor/UID: ${nomorStr}
Platform/Bank: ${metaStr}
${dateLabel}: ${tanggalStr}
${provenanceLabel}: ${sourceLabel}
Status: ${statusLabel}${referenceLine}

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

      // Referensi bukti/verifikasi adalah detail admin. Tampilan publik hanya
      // menampilkan status utama agar informasi internal tidak ikut terekspos.
      if (isAdmin && item?.source_ref && item.source_ref !== '-') {
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

