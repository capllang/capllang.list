(function initSaasUi() {
  const formatNumber = value => {
    const number = Number(value || 0);
    return Number.isFinite(number)
      ? new Intl.NumberFormat('id-ID').format(Math.max(0, number))
      : '0';
  };

  function syncDashboardStats() {
    const rekening = Number(paginationState?.rekening?.total || 0);
    const uid = Number(paginationState?.genshin?.total || 0);
    const total = rekening + uid;

    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };

    setText('statRekeningTotal', formatNumber(rekening));
    setText('statUidTotal', formatNumber(uid));
    setText('statTotalData', formatNumber(total));
    setText('heroTotalData', formatNumber(total));

    const state = document.body.dataset.connectionState || 'checking';
    const isOnline = state === 'online';

    setText(
      'heroStatusText',
      isOnline
        ? 'Database terhubung'
        : getDefaultStatusText().replace(/^●\s*/, '')
    );
    setText(
      'trustUpdateText',
      isOnline
        ? 'Terhubung ke database'
        : state === 'checking'
          ? 'Memeriksa koneksi'
          : 'Status koneksi terbatas'
    );
  }

  function scrollToTarget(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeMobileNav() {
    const nav = document.getElementById('mainNav');
    const button = document.getElementById('mobileMenuBtn');
    nav?.classList.remove('is-open');
    button?.setAttribute('aria-expanded', 'false');
  }

  document.querySelectorAll('[data-scroll-target]').forEach(button => {
    button.addEventListener('click', () => {
      scrollToTarget(button.dataset.scrollTarget);
      closeMobileNav();
    });
  });

  document.querySelectorAll('[data-tab-target]').forEach(button => {
    button.addEventListener('click', async () => {
      const targetTab = button.dataset.tabTarget === 'genshin' ? 'genshin' : 'rekening';
      await switchTab(targetTab);
      scrollToTarget('checker');
      window.setTimeout(() => document.getElementById('searchInput')?.focus(), 450);
      closeMobileNav();
      syncDashboardStats();
    });
  });

  document.getElementById('heroCtaBtn')?.addEventListener('click', () => {
    scrollToTarget('checker');
    window.setTimeout(() => document.getElementById('searchInput')?.focus(), 450);
  });

  document.getElementById('checkerSearchBtn')?.addEventListener('click', async () => {
    await runServerSearch();
    document.getElementById('resultPanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    syncDashboardStats();
  });

  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  mobileMenuBtn?.addEventListener('click', () => {
    const nav = document.getElementById('mainNav');
    const opening = !nav?.classList.contains('is-open');
    nav?.classList.toggle('is-open', opening);
    mobileMenuBtn.setAttribute('aria-expanded', String(opening));
  });

  const statusBar = document.getElementById('statusBar');
  if (statusBar) {
    const statusObserver = new MutationObserver(syncDashboardStats);
    statusObserver.observe(statusBar, { childList: true, characterData: true, subtree: true });
  }

  const bodyObserver = new MutationObserver(syncDashboardStats);
  bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-connection-state'] });

  document.getElementById('tabRekening')?.addEventListener('click', () => window.setTimeout(syncDashboardStats, 0));
  document.getElementById('tabGenshin')?.addEventListener('click', () => window.setTimeout(syncDashboardStats, 0));

  syncDashboardStats();

  // Close the mobile menu with Escape or when clicking outside the header.
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMobileNav();
  });

  document.addEventListener('click', event => {
    const nav = document.getElementById('mainNav');
    const menuButton = document.getElementById('mobileMenuBtn');
    if (!nav?.classList.contains('is-open')) return;
    if (nav.contains(event.target) || menuButton?.contains(event.target)) return;
    closeMobileNav();
  });

  // Shared URLs that already contain a search query should land users near
  // the checker instead of making them hunt for the matching result panel.
  const initialParams = new URLSearchParams(window.location.search);
  const hasInitialSearch = Boolean(
    (initialParams.get('search') || initialParams.get('q') || '').trim()
  );
  if (hasInitialSearch) {
    window.setTimeout(() => scrollToTarget('checker'), 650);
  }


  let attempts = 0;
  const warmupTimer = window.setInterval(() => {
    syncDashboardStats();
    attempts += 1;
    if (attempts >= 20) window.clearInterval(warmupTimer);
  }, 500);
})();
