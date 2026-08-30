(() => {
  'use strict';
  const catalog = window.EXHIBIT_CATALOG;
  if (!catalog?.products?.length) throw new Error('Katalog produktů není dostupný.');

  const STORAGE_KEY = 'exhibit-label-device-v2';
  const ADMIN_PIN = '2468';
  const brands = ['Hisense', 'Gorenje', 'Mora'];
  const brandPresentation = {
    Hisense: { color: '#009b9b', logo: 'https://hisense-static.hgecdn.net/img/w_full/medias/Hisense-logo-green.png?context=bWFzdGVyfGltYWdlc3wyMTM5fGltYWdlL3BuZ3xhRFpsTDJnMU9DOHhOVEV6T1RFM05UZzFPREl3Tmk5SWFYTmxibk5sTFd4dloyOHRaM0psWlc0dWNHNW58MjllY2M3OWI3ZDdlYTcyNTNjNzVjZDk4YTlmMTc2OWNiNGNlZmFkMzZlMWQxNWQ0YTY5NGJjY2M3ZTJkNjk3NQ' },
    Gorenje: { color: '#62666a', logo: 'https://gorenje-static.hgecdn.net/img/w_full/medias/gorenje-logo-narrow-CZ.webp?context=bWFzdGVyfGltYWdlc3w0MjU5MnxpbWFnZS93ZWJwfGFEYzFMMmhrTkM4eE5UTXhORFEzTnpNeE9ERTNOQzluYjNKbGJtcGxMV3h2WjI4dGJtRnljbTkzTFVOYUxuZGxZbkF8ODU3MmNhZjljZjI3YjczOTdhYThkZGQyYzYxYTYyNDY4MzMzZDIxNDA3MDg5ZTZiMzRiOTU1M2E0OTFkNTIwNQ' },
    Mora: { color: '#b0192e', logo: 'https://www.mora.cz/front/style/img/novy_vzhled/mora-logo.svg' },
  };
  const products = catalog.products;
  const byId = new Map(products.map((product) => [product.id, product]));
  const defaultConfig = { brand: 'Hisense', productIds: [], defaultProductId: '', videoOverrides: {} };
  const loadConfig = () => { try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return { ...defaultConfig }; } };
  let config = loadConfig();
  let currentProduct = null;
  let currentImage = 0;
  let currentTab = 'overview';
  let category = 'Vše';
  let wakeLock = null;
  let adminTapCount = 0;
  let adminTapTimer = null;
  let pressTimer = null;

  const $ = (id) => document.getElementById(id);
  const ids = ['app','gallery','productCopy','brandLogo','headerCategory','headerModel','headerPrice','productEyebrow','productTitle','productDescription','heroImage','imageSkeleton','previousImage','nextImage','imageCounter','thumbnails','detailTabs','detailPanel','catalogButton','catalogOverlay','closeCatalog','catalogSearch','categoryFilters','catalogGrid','catalogEmpty','secretAdminButton','brandButton','pinOverlay','pinForm','pinInput','pinError','adminOverlay','closeAdmin','adminBrand','adminProducts','adminDefaultProduct','adminVideo','toggleAllProducts','wakeLockStatus','fullscreenButton','saveAdmin','toast'];
  const els = Object.fromEntries(ids.map((id) => [id, $(id)]));
  const unique = (items) => [...new Set(items)];
  const formatPrice = (price) => price ? `${new Intl.NumberFormat('cs-CZ').format(price)} Kč` : 'Cena bude doplněna';
  const productVideo = (product) => (config.videoOverrides?.[product.id] || product.video || '').trim();
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  function normalizeConfig() {
    if (!brands.includes(config.brand)) config.brand = 'Hisense';
    const brandProducts = products.filter((product) => product.brand === config.brand);
    const valid = new Set(brandProducts.map((product) => product.id));
    config.productIds = (config.productIds || []).filter((id) => valid.has(id));
    if (!config.productIds.length) config.productIds = [...valid];
    if (!config.productIds.includes(config.defaultProductId)) config.defaultProductId = config.productIds[0];
    config.videoOverrides ||= {};
  }
  normalizeConfig();
  const visibleProducts = () => config.productIds.map((id) => byId.get(id)).filter(Boolean);
  function showToast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200); }

  function selectProduct(id, closeCatalog = false) {
    const next = byId.get(id) || byId.get(config.defaultProductId) || visibleProducts()[0];
    if (!next) return;
    currentProduct = next;
    currentImage = 0;
    currentTab = 'overview';
    renderProduct();
    if (closeCatalog) setOverlay(els.catalogOverlay, false);
  }

  function renderProduct() {
    const product = currentProduct;
    const presentation = brandPresentation[product.brand];
    els.app.dataset.brand = product.brand;
    els.brandLogo.src = presentation.logo;
    els.brandLogo.alt = product.brand;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', presentation.color);
    els.headerCategory.textContent = product.name;
    els.headerModel.textContent = product.model;
    els.headerPrice.innerHTML = `<span>DMOC s DPH:</span><strong>${escapeHtml(formatPrice(product.price))}</strong>`;
    els.productEyebrow.textContent = `${product.brand} · PN ${product.id}`;
    els.productTitle.textContent = product.model;
    els.productDescription.textContent = product.description;
    renderGallery();
    renderTabs();
    renderCatalog();
  }

  function renderGallery() {
    const images = currentProduct.images || [];
    if (currentImage >= images.length) currentImage = 0;
    const image = images[currentImage];
    els.imageSkeleton.hidden = false;
    els.heroImage.classList.remove('loaded');
    els.heroImage.alt = `${currentProduct.name} ${currentProduct.model}`;
    if (image?.url) els.heroImage.src = image.url;
    else { els.heroImage.removeAttribute('src'); els.heroImage.alt = 'Fotografie bude doplněna'; els.imageSkeleton.hidden = true; }
    const multiple = images.length > 1;
    els.gallery.classList.toggle('single-image', !multiple);
    els.previousImage.hidden = !multiple;
    els.nextImage.hidden = !multiple;
    els.imageCounter.textContent = images.length ? `${currentImage + 1} / ${images.length}` : 'Bez fotografie';
    els.thumbnails.innerHTML = images.map((item, index) => `<button class="thumbnail${index === currentImage ? ' active' : ''}" data-image="${index}" type="button" aria-label="Zobrazit obrázek ${index + 1}"><img src="${escapeHtml(item.url)}" alt=""></button>`).join('');
  }

  function renderTabs() {
    const tabs = [{ id: 'overview', label: 'Přehled' }, { id: 'specs', label: 'Parametry' }];
    if (productVideo(currentProduct)) tabs.push({ id: 'video', label: 'Video' });
    if (!tabs.some((tab) => tab.id === currentTab)) currentTab = 'overview';
    els.productCopy.classList.toggle('is-specs', currentTab === 'specs');
    els.detailTabs.innerHTML = tabs.map((tab) => `<button class="tab-button${tab.id === currentTab ? ' active' : ''}" data-tab="${tab.id}" type="button">${tab.label}</button>`).join('');
    if (currentTab === 'overview') {
      const features = currentProduct.features?.length ? currentProduct.features : [{ title: 'Hlavní vlastnosti', description: currentProduct.description }];
      els.detailPanel.innerHTML = `<div class="feature-list">${features.map((feature) => `<article class="feature-card"><h3>${escapeHtml(feature.title)}</h3>${feature.subtitle && feature.subtitle !== feature.description ? `<strong>${escapeHtml(feature.subtitle)}</strong>` : ''}${feature.description ? `<p>${escapeHtml(feature.description)}</p>` : ''}</article>`).join('')}</div>`;
    } else if (currentTab === 'specs') {
      const specs = currentProduct.specifications || [];
      els.detailPanel.innerHTML = specs.length ? `<dl class="spec-list">${specs.map((spec) => `<div class="spec-row"><dt>${escapeHtml(spec.label)}</dt><dd>${escapeHtml(spec.value)}</dd></div>`).join('')}</dl>` : '<p class="empty-state">Technické parametry budou doplněny po kontrole zdroje.</p>';
    } else {
      els.detailPanel.innerHTML = `<div class="video-wrap"><video controls playsinline preload="metadata" src="${escapeHtml(productVideo(currentProduct))}"></video></div>`;
    }
  }

  function changeImage(step) {
    const count = currentProduct.images?.length || 0;
    if (count < 2) return;
    currentImage = (currentImage + step + count) % count;
    renderGallery();
  }

  function renderCatalog() {
    const list = visibleProducts();
    const categories = ['Vše', ...unique(list.map((product) => product.name))];
    if (!categories.includes(category)) category = 'Vše';
    els.categoryFilters.innerHTML = categories.map((name) => `<button class="filter-chip${name === category ? ' active' : ''}" data-category="${escapeHtml(name)}" type="button">${escapeHtml(name)}</button>`).join('');
    const query = els.catalogSearch.value.toLocaleLowerCase('cs');
    const filtered = list.filter((product) => (category === 'Vše' || product.name === category) && `${product.model} ${product.name} ${product.category}`.toLocaleLowerCase('cs').includes(query));
    els.catalogGrid.innerHTML = filtered.map((product) => `<button class="product-card${product.id === currentProduct?.id ? ' selected' : ''}" data-product="${product.id}" type="button"><span class="product-card-image">${product.images?.[0]?.url ? `<img src="${escapeHtml(product.images[0].url)}" alt="" loading="lazy">` : ''}</span><span class="product-card-copy"><span><small>${escapeHtml(product.name)}</small><strong>${escapeHtml(product.model)}</strong></span><b>${escapeHtml(formatPrice(product.price))}</b></span></button>`).join('');
    els.catalogEmpty.hidden = filtered.length > 0;
  }

  function setOverlay(overlay, open) {
    overlay.hidden = !open;
    if (overlay === els.catalogOverlay) els.catalogButton.setAttribute('aria-expanded', String(open));
    if (open && overlay === els.catalogOverlay) { els.catalogSearch.value = ''; category = 'Vše'; renderCatalog(); setTimeout(() => els.catalogSearch.focus(), 20); }
  }

  function openPin() { els.pinInput.value = ''; els.pinError.textContent = ''; setOverlay(els.pinOverlay, true); setTimeout(() => els.pinInput.focus(), 20); }
  function openAdmin() {
    setOverlay(els.pinOverlay, false);
    els.adminBrand.innerHTML = brands.map((brand) => `<option value="${brand}">${brand}</option>`).join('');
    els.adminBrand.value = config.brand;
    renderAdminProducts();
    els.adminVideo.value = productVideo(currentProduct);
    setOverlay(els.adminOverlay, true);
  }

  function renderAdminProducts() {
    const list = products.filter((product) => product.brand === els.adminBrand.value);
    const selected = new Set(config.brand === els.adminBrand.value ? config.productIds : list.map((product) => product.id));
    els.adminProducts.innerHTML = list.map((product) => `<label class="product-toggle"><input type="checkbox" value="${product.id}" ${selected.has(product.id) ? 'checked' : ''}><span>${escapeHtml(product.model)} · ${escapeHtml(product.name)}</span></label>`).join('');
    renderAdminDefaultOptions();
  }

  function renderAdminDefaultOptions() {
    const list = products.filter((product) => product.brand === els.adminBrand.value);
    const selectedIds = [...els.adminProducts.querySelectorAll('input:checked')].map((input) => input.value);
    const previousValue = els.adminDefaultProduct.value || config.defaultProductId;
    els.adminDefaultProduct.innerHTML = list.filter((product) => selectedIds.includes(product.id)).map((product) => `<option value="${product.id}">${escapeHtml(product.model)}</option>`).join('');
    els.adminDefaultProduct.value = selectedIds.includes(previousValue) ? previousValue : selectedIds[0] || '';
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        els.wakeLockStatus.textContent = 'Aktivní';
        wakeLock.addEventListener('release', () => { els.wakeLockStatus.textContent = 'Uvolněno'; });
      } else els.wakeLockStatus.textContent = 'Řídí kiosk';
    } catch { els.wakeLockStatus.textContent = 'Řídí kiosk'; }
  }

  els.heroImage.addEventListener('load', () => { els.imageSkeleton.hidden = true; els.heroImage.classList.add('loaded'); });
  els.heroImage.addEventListener('error', () => { els.imageSkeleton.hidden = true; els.heroImage.classList.remove('loaded'); });
  els.previousImage.addEventListener('click', () => changeImage(-1));
  els.nextImage.addEventListener('click', () => changeImage(1));
  els.thumbnails.addEventListener('click', (event) => { const button = event.target.closest('[data-image]'); if (button) { currentImage = Number(button.dataset.image); renderGallery(); } });
  els.detailTabs.addEventListener('click', (event) => { const button = event.target.closest('[data-tab]'); if (button) { currentTab = button.dataset.tab; els.productCopy.scrollTop = 0; els.detailPanel.scrollTop = 0; renderTabs(); } });
  els.catalogButton.addEventListener('click', () => setOverlay(els.catalogOverlay, true));
  els.closeCatalog.addEventListener('click', () => setOverlay(els.catalogOverlay, false));
  els.catalogSearch.addEventListener('input', renderCatalog);
  els.categoryFilters.addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (button) { category = button.dataset.category; renderCatalog(); } });
  els.catalogGrid.addEventListener('click', (event) => { const button = event.target.closest('[data-product]'); if (button) selectProduct(button.dataset.product, true); });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => setOverlay($(button.dataset.close), false)));
  els.pinForm.addEventListener('submit', (event) => { event.preventDefault(); if (els.pinInput.value === ADMIN_PIN) openAdmin(); else { els.pinError.textContent = 'Nesprávný PIN.'; els.pinInput.select(); } });
  els.closeAdmin.addEventListener('click', () => setOverlay(els.adminOverlay, false));
  els.adminBrand.addEventListener('change', renderAdminProducts);
  els.adminProducts.addEventListener('change', renderAdminDefaultOptions);
  els.toggleAllProducts.addEventListener('click', () => { const inputs = [...els.adminProducts.querySelectorAll('input')]; const all = inputs.every((input) => input.checked); inputs.forEach((input) => { input.checked = !all; }); renderAdminDefaultOptions(); });
  els.fullscreenButton.addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('Celou obrazovku bude řídit kiosk aplikace.'); } });
  els.saveAdmin.addEventListener('click', () => {
    const selected = [...els.adminProducts.querySelectorAll('input:checked')].map((input) => input.value);
    if (!selected.length) return showToast('Vyberte alespoň jeden produkt.');
    const oldProductId = currentProduct.id;
    config.brand = els.adminBrand.value;
    config.productIds = selected;
    config.defaultProductId = selected.includes(els.adminDefaultProduct.value) ? els.adminDefaultProduct.value : selected[0];
    const video = els.adminVideo.value.trim();
    if (video) config.videoOverrides[oldProductId] = video; else delete config.videoOverrides[oldProductId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    normalizeConfig();
    selectProduct(config.defaultProductId);
    setOverlay(els.adminOverlay, false);
    showToast('Nastavení tabletu bylo uloženo.');
  });

  els.secretAdminButton.addEventListener('click', () => {
    adminTapCount += 1;
    clearTimeout(adminTapTimer);
    adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 3500);
    if (adminTapCount >= 5) { adminTapCount = 0; openPin(); }
  });
  const startPress = () => { clearTimeout(pressTimer); pressTimer = setTimeout(openPin, 1300); };
  const cancelPress = () => clearTimeout(pressTimer);
  ['pointerdown','touchstart'].forEach((name) => els.brandButton.addEventListener(name, startPress, { passive: true }));
  ['pointerup','pointercancel','pointerleave','touchend'].forEach((name) => els.brandButton.addEventListener(name, cancelPress, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWakeLock(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') [els.catalogOverlay, els.pinOverlay, els.adminOverlay].forEach((overlay) => setOverlay(overlay, false));
    if (event.key === 'ArrowLeft') changeImage(-1);
    if (event.key === 'ArrowRight') changeImage(1);
  });

  selectProduct(config.defaultProductId);
  requestWakeLock();
})();

