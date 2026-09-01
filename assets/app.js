(() => {
  'use strict';
  const catalog = window.EXHIBIT_CATALOG;
  if (!catalog?.products?.length) throw new Error('Katalog produktů není dostupný.');

  const STORAGE_KEY = 'exhibit-label-device-v2';
  const IMAGE_DB_NAME = 'exhibit-label-media-v1';
  const IMAGE_STORE_NAME = 'product-images';
  const ADMIN_PIN = '2468';
  const brands = ['Hisense', 'Gorenje', 'Mora'];
  const brandPresentation = {
    Hisense: { color: '#009b9b', logo: 'https://hisense-static.hgecdn.net/img/w_full/medias/Hisense-logo-green.png?context=bWFzdGVyfGltYWdlc3wyMTM5fGltYWdlL3BuZ3xhRFpsTDJnMU9DOHhOVEV6T1RFM05UZzFPREl3Tmk5SWFYTmxibk5sTFd4dloyOHRaM0psWlc0dWNHNW58MjllY2M3OWI3ZDdlYTcyNTNjNzVjZDk4YTlmMTc2OWNiNGNlZmFkMzZlMWQxNWQ0YTY5NGJjY2M3ZTJkNjk3NQ' },
    Gorenje: { color: '#62666a', logo: 'https://gorenje-static.hgecdn.net/img/w_full/medias/gorenje-logo-narrow-CZ.webp?context=bWFzdGVyfGltYWdlc3w0MjU5MnxpbWFnZS93ZWJwfGFEYzFMMmhrTkM4eE5UTXhORFEzTnpNeE9ERTNOQzluYjNKbGJtcGxMV3h2WjI4dGJtRnljbTkzTFVOYUxuZGxZbkF8ODU3MmNhZjljZjI3YjczOTdhYThkZGQyYzYxYTYyNDY4MzMzZDIxNDA3MDg5ZTZiMzRiOTU1M2E0OTFkNTIwNQ' },
    Mora: { color: '#b0192e', logo: 'https://www.mora.cz/front/style/img/novy_vzhled/mora-logo.svg' },
  };
  const products = catalog.products;
  const byId = new Map(products.map((product) => [product.id, product]));
  const defaultConfig = { brand: 'Hisense', productIds: [], defaultProductId: '', videoOverrides: {}, imageSettings: {} };
  const loadConfig = () => { try { return { ...defaultConfig, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return { ...defaultConfig }; } };
  let config = loadConfig();
  let currentProduct = null;
  let currentImage = 0;
  let currentTab = 'overview';
  let category = 'Vše';
  let wakeLock = null;
  let adminTapCount = 0;
  let adminTapTimer = null;
  let imageDb = null;
  const uploadedImages = new Map();
  const uploadedObjectUrls = new Map();

  const $ = (id) => document.getElementById(id);
  const ids = ['app','gallery','productCopy','brandLogo','headerCategory','headerModel','headerPrice','productEyebrow','productTitle','productDescription','heroImage','imageSkeleton','previousImage','nextImage','imageCounter','thumbnails','detailTabs','detailPanel','catalogButton','catalogOverlay','closeCatalog','categoryFilters','catalogGrid','catalogEmpty','secretAdminButton','brandButton','pinOverlay','pinForm','pinInput','pinError','adminOverlay','closeAdmin','adminBrand','adminProducts','adminDefaultProduct','adminVideo','toggleAllProducts','wakeLockStatus','fullscreenButton','saveAdmin','toast'];
  const els = Object.fromEntries(ids.map((id) => [id, $(id)]));
  const unique = (items) => [...new Set(items)];
  const formatPrice = (price) => price ? `${new Intl.NumberFormat('cs-CZ').format(price)} Kč` : 'Cena bude doplněna';
  const productVideo = (product) => (config.videoOverrides?.[product.id] || product.video || '').trim();
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const persistConfig = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

  function imageSettings(productId) {
    config.imageSettings ||= {};
    config.imageSettings[productId] ||= { hidden: [], linked: [] };
    config.imageSettings[productId].hidden ||= [];
    config.imageSettings[productId].linked ||= [];
    return config.imageSettings[productId];
  }

  function allProductImages(product) {
    const settings = imageSettings(product.id);
    const source = (product.images || []).map((image, index) => ({ ...image, key: `source:${image.url}`, label: `Zdrojový obrázek ${index + 1}`, removable: false }));
    const linked = settings.linked.map((image, index) => ({ ...image, key: `linked:${image.id}`, label: image.label || `Lokální cesta ${index + 1}`, removable: true, kind: 'linked' }));
    const uploaded = (uploadedImages.get(product.id) || []).map((image) => ({ ...image, key: `uploaded:${image.id}`, label: image.name || 'Obrázek ze zařízení', removable: true, kind: 'uploaded' }));
    return [...source, ...linked, ...uploaded];
  }

  function productImages(product) {
    const hidden = new Set(imageSettings(product.id).hidden);
    return allProductImages(product).filter((image) => !hidden.has(image.key));
  }

  function normalizeConfig() {
    if (!brands.includes(config.brand)) config.brand = 'Hisense';
    const brandProducts = products.filter((product) => product.brand === config.brand);
    const valid = new Set(brandProducts.map((product) => product.id));
    config.productIds = (config.productIds || []).filter((id) => valid.has(id));
    if (!config.productIds.length) config.productIds = [...valid];
    if (!config.productIds.includes(config.defaultProductId)) config.defaultProductId = config.productIds[0];
    config.videoOverrides ||= {};
    config.imageSettings ||= {};
  }
  normalizeConfig();
  const visibleProducts = () => config.productIds.map((id) => byId.get(id)).filter(Boolean);
  function showToast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2200); }

  function openImageDatabase() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (imageDb) return Promise.resolve(imageDb);
    return new Promise((resolve) => {
      const request = indexedDB.open(IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IMAGE_STORE_NAME)) {
          const store = db.createObjectStore(IMAGE_STORE_NAME, { keyPath: 'id' });
          store.createIndex('productId', 'productId', { unique: false });
        }
      };
      request.onsuccess = () => { imageDb = request.result; resolve(imageDb); };
      request.onerror = () => resolve(null);
    });
  }

  function registerUploadedImage(record) {
    const oldUrl = uploadedObjectUrls.get(record.id);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    const url = URL.createObjectURL(record.blob);
    uploadedObjectUrls.set(record.id, url);
    const list = (uploadedImages.get(record.productId) || []).filter((item) => item.id !== record.id);
    list.push({ id: record.id, productId: record.productId, name: record.name, url });
    uploadedImages.set(record.productId, list);
  }

  async function loadUploadedImages() {
    const db = await openImageDatabase();
    if (!db) return;
    await new Promise((resolve) => {
      const request = db.transaction(IMAGE_STORE_NAME, 'readonly').objectStore(IMAGE_STORE_NAME).getAll();
      request.onsuccess = () => { request.result.forEach(registerUploadedImage); resolve(); };
      request.onerror = () => resolve();
    });
  }

  async function storeUploadedImages(productId, files) {
    const db = await openImageDatabase();
    if (!db) return showToast('Prohlížeč nepodporuje lokální uložení obrázků.');
    const validFiles = [...files].filter((file) => file.type.startsWith('image/'));
    for (const file of validFiles) {
      const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const record = { id, productId, name: file.name, blob: file, createdAt: Date.now() };
      await new Promise((resolve, reject) => {
        const request = db.transaction(IMAGE_STORE_NAME, 'readwrite').objectStore(IMAGE_STORE_NAME).put(record);
        request.onsuccess = resolve;
        request.onerror = reject;
      });
      registerUploadedImage(record);
    }
    if (validFiles.length) showToast(`Uloženo obrázků: ${validFiles.length}`);
  }

  async function removeUploadedImage(productId, imageId) {
    const db = await openImageDatabase();
    if (db) await new Promise((resolve) => {
      const request = db.transaction(IMAGE_STORE_NAME, 'readwrite').objectStore(IMAGE_STORE_NAME).delete(imageId);
      request.onsuccess = resolve;
      request.onerror = resolve;
    });
    const objectUrl = uploadedObjectUrls.get(imageId);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    uploadedObjectUrls.delete(imageId);
    uploadedImages.set(productId, (uploadedImages.get(productId) || []).filter((image) => image.id !== imageId));
  }

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
    const images = productImages(currentProduct);
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
    const scrollable = currentTab === 'overview' || currentTab === 'specs';
    els.productCopy.classList.toggle('is-scrollable', scrollable);
    els.productCopy.classList.toggle('is-specs', currentTab === 'specs');
    els.productCopy.classList.toggle('is-overview', currentTab === 'overview');
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
    const count = productImages(currentProduct).length;
    if (count < 2) return;
    currentImage = (currentImage + step + count) % count;
    renderGallery();
  }

  function renderCatalog() {
    const list = visibleProducts();
    const categories = ['Vše', ...unique(list.map((product) => product.name))];
    if (!categories.includes(category)) category = 'Vše';
    els.categoryFilters.innerHTML = categories.map((name) => `<button class="filter-chip${name === category ? ' active' : ''}" data-category="${escapeHtml(name)}" type="button">${escapeHtml(name)}</button>`).join('');
    const filtered = list.filter((product) => category === 'Vše' || product.name === category);
    els.catalogGrid.innerHTML = filtered.map((product) => { const cover = productImages(product)[0]; return `<button class="product-card${product.id === currentProduct?.id ? ' selected' : ''}" data-product="${product.id}" type="button"><span class="product-card-image">${cover?.url ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy">` : ''}</span><span class="product-card-copy"><span><small>${escapeHtml(product.name)}</small><strong>${escapeHtml(product.model)}</strong></span><b>${escapeHtml(formatPrice(product.price))}</b></span></button>`; }).join('');
    els.catalogEmpty.hidden = filtered.length > 0;
  }

  function setOverlay(overlay, open) {
    overlay.hidden = !open;
    if (overlay === els.catalogOverlay) els.catalogButton.setAttribute('aria-expanded', String(open));
    if (open && overlay === els.catalogOverlay) { category = 'Vše'; renderCatalog(); }
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

  function renderAdminProducts(selectionOverride = null) {
    const list = products.filter((product) => product.brand === els.adminBrand.value);
    const selected = new Set(selectionOverride || (config.brand === els.adminBrand.value ? config.productIds : list.map((product) => product.id)));
    const opened = new Set([...els.adminProducts.querySelectorAll('details[open]')].map((details) => details.dataset.adminProduct));
    els.adminProducts.innerHTML = list.map((product) => {
      const settings = imageSettings(product.id);
      const hidden = new Set(settings.hidden);
      const images = allProductImages(product);
      const imageRows = images.length ? images.map((image, index) => `<div class="admin-image-row">
        <label><input class="image-visible" type="checkbox" data-product-id="${product.id}" data-image-key="${escapeHtml(image.key)}" ${hidden.has(image.key) ? '' : 'checked'}><img src="${escapeHtml(image.url)}" alt=""><span>${escapeHtml(image.label || `Obrázek ${index + 1}`)}</span></label>
        ${image.removable ? `<button class="image-remove" type="button" data-product-id="${product.id}" data-image-key="${escapeHtml(image.key)}" aria-label="Odstranit obrázek">×</button>` : ''}
      </div>`).join('') : '<p class="help">Produkt zatím nemá žádný obrázek.</p>';
      const visibleCount = images.filter((image) => !hidden.has(image.key)).length;
      return `<details class="admin-product-card" data-admin-product="${product.id}" ${opened.has(product.id) ? 'open' : ''}>
        <summary><input class="product-enabled" type="checkbox" value="${product.id}" ${selected.has(product.id) ? 'checked' : ''}><span><strong>${escapeHtml(product.model)}</strong><small>${escapeHtml(product.name)} · PN ${escapeHtml(product.id)}</small></span><b>${visibleCount}/${images.length} fotek</b></summary>
        <div class="admin-product-detail">
          <div class="admin-image-list">${imageRows}</div>
          <div class="admin-image-actions">
            <label class="button secondary file-button">Nahrát ze zařízení<input class="admin-image-upload" type="file" accept="image/*" multiple data-product-id="${product.id}"></label>
            <div class="linked-image-form"><input class="large-input admin-image-path" type="text" inputmode="url" placeholder="media/${escapeHtml(product.id)}-detail.jpg"><button class="button secondary add-image-path" type="button" data-product-id="${product.id}">Přidat cestu</button></div>
          </div>
        </div>
      </details>`;
    }).join('');
    renderAdminDefaultOptions();
  }

  function renderAdminDefaultOptions() {
    const list = products.filter((product) => product.brand === els.adminBrand.value);
    const selectedIds = adminSelectedIds();
    const previousValue = els.adminDefaultProduct.value || config.defaultProductId;
    els.adminDefaultProduct.innerHTML = list.filter((product) => selectedIds.includes(product.id)).map((product) => `<option value="${product.id}">${escapeHtml(product.model)}</option>`).join('');
    els.adminDefaultProduct.value = selectedIds.includes(previousValue) ? previousValue : selectedIds[0] || '';
  }

  function adminSelectedIds() {
    return [...els.adminProducts.querySelectorAll('.product-enabled:checked')].map((input) => input.value);
  }

  function refreshImagesAfterAdminChange(productId) {
    if (currentProduct?.id === productId) {
      const count = productImages(currentProduct).length;
      if (currentImage >= count) currentImage = Math.max(0, count - 1);
      renderGallery();
    }
    renderCatalog();
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
  els.categoryFilters.addEventListener('click', (event) => { const button = event.target.closest('[data-category]'); if (button) { category = button.dataset.category; renderCatalog(); } });
  els.catalogGrid.addEventListener('click', (event) => { const button = event.target.closest('[data-product]'); if (button) selectProduct(button.dataset.product, true); });
  document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => setOverlay($(button.dataset.close), false)));
  els.pinForm.addEventListener('submit', (event) => { event.preventDefault(); if (els.pinInput.value === ADMIN_PIN) openAdmin(); else { els.pinError.textContent = 'Nesprávný PIN.'; els.pinInput.select(); } });
  els.closeAdmin.addEventListener('click', () => setOverlay(els.adminOverlay, false));
  els.adminBrand.addEventListener('change', renderAdminProducts);
  els.adminProducts.addEventListener('change', async (event) => {
    const input = event.target;
    if (input.matches('.product-enabled')) return renderAdminDefaultOptions();
    if (input.matches('.image-visible')) {
      const settings = imageSettings(input.dataset.productId);
      const hidden = new Set(settings.hidden);
      if (input.checked) hidden.delete(input.dataset.imageKey); else hidden.add(input.dataset.imageKey);
      settings.hidden = [...hidden];
      persistConfig();
      const card = input.closest('.admin-product-card');
      const count = allProductImages(byId.get(input.dataset.productId)).filter((image) => !hidden.has(image.key)).length;
      const badge = card?.querySelector('summary b');
      if (badge) badge.textContent = `${count}/${allProductImages(byId.get(input.dataset.productId)).length} fotek`;
      refreshImagesAfterAdminChange(input.dataset.productId);
      return;
    }
    if (input.matches('.admin-image-upload')) {
      const selectedIds = adminSelectedIds();
      try {
        await storeUploadedImages(input.dataset.productId, input.files || []);
      } catch {
        showToast('Obrázek se nepodařilo uložit. Zkontrolujte volné místo v zařízení.');
      }
      renderAdminProducts(selectedIds);
      refreshImagesAfterAdminChange(input.dataset.productId);
    }
  });
  els.adminProducts.addEventListener('click', async (event) => {
    if (event.target.matches('.product-enabled')) event.stopPropagation();
    const removeButton = event.target.closest('.image-remove');
    if (removeButton) {
      const productId = removeButton.dataset.productId;
      const imageKey = removeButton.dataset.imageKey;
      const selectedIds = adminSelectedIds();
      const settings = imageSettings(productId);
      if (imageKey.startsWith('linked:')) settings.linked = settings.linked.filter((image) => image.id !== imageKey.slice(7));
      if (imageKey.startsWith('uploaded:')) await removeUploadedImage(productId, imageKey.slice(9));
      settings.hidden = settings.hidden.filter((key) => key !== imageKey);
      persistConfig();
      renderAdminProducts(selectedIds);
      refreshImagesAfterAdminChange(productId);
      showToast('Obrázek byl odstraněn.');
      return;
    }
    const addButton = event.target.closest('.add-image-path');
    if (addButton) {
      const productId = addButton.dataset.productId;
      const pathInput = addButton.closest('.linked-image-form').querySelector('.admin-image-path');
      const url = pathInput.value.trim().replaceAll('\\', '/');
      if (!url) return showToast('Zadejte cestu k obrázku.');
      if (/^javascript:/i.test(url)) return showToast('Tuto cestu nelze použít.');
      const selectedIds = adminSelectedIds();
      imageSettings(productId).linked.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, url, label: url.split('/').pop() || 'Lokální obrázek' });
      persistConfig();
      renderAdminProducts(selectedIds);
      refreshImagesAfterAdminChange(productId);
      showToast('Cesta k obrázku byla přidána.');
    }
  });
  els.toggleAllProducts.addEventListener('click', () => { const inputs = [...els.adminProducts.querySelectorAll('.product-enabled')]; const all = inputs.every((input) => input.checked); inputs.forEach((input) => { input.checked = !all; }); renderAdminDefaultOptions(); });
  els.fullscreenButton.addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { showToast('Celou obrazovku bude řídit kiosk aplikace.'); } });
  els.saveAdmin.addEventListener('click', () => {
    const selected = adminSelectedIds();
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestWakeLock(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') [els.catalogOverlay, els.pinOverlay, els.adminOverlay].forEach((overlay) => setOverlay(overlay, false));
    if (event.key === 'ArrowLeft') changeImage(-1);
    if (event.key === 'ArrowRight') changeImage(1);
  });

  window.addEventListener('beforeunload', () => uploadedObjectUrls.forEach((url) => URL.revokeObjectURL(url)));
  (async () => {
    await loadUploadedImages();
    selectProduct(config.defaultProductId);
    requestWakeLock();
  })();
})();

