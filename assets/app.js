(() => {
  'use strict';
  const catalog = window.EXHIBIT_CATALOG;
  if (!catalog?.products?.length) throw new Error('Katalog produktů není dostupný.');

  const STORAGE_KEY = 'exhibit-label-device-v2';
  const IMAGE_DB_NAME = 'exhibit-label-media-v1';
  const IMAGE_STORE_NAME = 'product-images';
  const PIN_STORAGE_KEY = 'exhibit-label-admin-pin-v1';
  const PIN_ITERATIONS = 120000;
  const brands = ['Hisense', 'Gorenje', 'Mora'];
  const applianceCategoryOrder = ['Trouby', 'Varné desky', 'Sporáky', 'Mikrovlnné trouby', 'Digestoře', 'Chladničky', 'Myčky nádobí', 'Pračky', 'Sušičky', 'Malé domácí spotřebiče'];
  const hisenseCategoryOrder = ['Televizory', 'Projektory', 'Soundbary', ...applianceCategoryOrder];
  const brandPresentation = {
    Hisense: { color: '#009b9b', logo: 'https://hisense-static.hgecdn.net/img/w_full/medias/Hisense-logo-green.png?context=bWFzdGVyfGltYWdlc3wyMTM5fGltYWdlL3BuZ3xhRFpsTDJnMU9DOHhOVEV6T1RFM05UZzFPREl3Tmk5SWFYTmxibk5sTFd4dloyOHRaM0psWlc0dWNHNW58MjllY2M3OWI3ZDdlYTcyNTNjNzVjZDk4YTlmMTc2OWNiNGNlZmFkMzZlMWQxNWQ0YTY5NGJjY2M3ZTJkNjk3NQ' },
    Gorenje: { color: '#62666a', logo: 'https://gorenje-static.hgecdn.net/img/w_full/medias/gorenje-logo-narrow-CZ.webp?context=bWFzdGVyfGltYWdlc3w0MjU5MnxpbWFnZS93ZWJwfGFEYzFMMmhrTkM4eE5UTXhORFEzTnpNeE9ERTNOQzluYjNKbGJtcGxMV3h2WjI4dGJtRnljbTkzTFVOYUxuZGxZbkF8ODU3MmNhZjljZjI3YjczOTdhYThkZGQyYzYxYTYyNDY4MzMzZDIxNDA3MDg5ZTZiMzRiOTU1M2E0OTFkNTIwNQ' },
    Mora: { color: '#b0192e', logo: 'https://www.mora.cz/front/style/img/novy_vzhled/mora-logo.svg' },
  };
  const products = catalog.products;
  const byId = new Map(products.map((product) => [product.id, product]));
  const catalogSourceOrder = new Map(products.map((product, index) => [product.id, index]));
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
  let pendingAdminVideos = [];
  const uploadedImages = new Map();
  const uploadedObjectUrls = new Map();

  const $ = (id) => document.getElementById(id);
  const ids = ['app','gallery','productCopy','brandLogo','headerCategory','headerModel','headerPrice','productEyebrow','productTitle','productDescription','heroImage','imageSkeleton','previousImage','nextImage','imageCounter','thumbnails','detailTabs','detailPanel','catalogButton','catalogOverlay','closeCatalog','categoryFilters','catalogGrid','catalogEmpty','secretAdminButton','brandButton','pinOverlay','pinForm','pinInput','pinError','pinSetupOverlay','pinSetupForm','pinSetupInput','pinSetupConfirm','pinSetupError','adminOverlay','closeAdmin','adminBrand','adminProducts','adminDefaultProduct','adminVideo','adminVideoProduct','uploadVideoButton','addVideoUrlButton','adminVideoUpload','adminVideoList','adminVideoStatus','toggleAllProducts','wakeLockStatus','fullscreenButton','saveAdmin','toast'];
  const els = Object.fromEntries(ids.map((id) => [id, $(id)]));
  const unique = (items) => [...new Set(items)];
  const formatPrice = (price) => price ? `${new Intl.NumberFormat('cs-CZ').format(price)} Kč` : 'Cena bude doplněna';
  const productVideos = (product) => {
    const value = config.videoOverrides?.[product.id] ?? product.video ?? [];
    return (Array.isArray(value) ? value : [value]).map((video) => String(video || '').trim()).filter(Boolean);
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const persistConfig = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  const bytesToBase64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const base64ToBytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

  async function derivePin(pin, salt, iterations = PIN_ITERATIONS) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return new Uint8Array(bits);
  }

  async function saveAdminPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePin(pin, salt);
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify({ salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: PIN_ITERATIONS }));
  }

  async function verifyAdminPin(pin) {
    try {
      const credential = JSON.parse(localStorage.getItem(PIN_STORAGE_KEY) || 'null');
      if (!credential?.salt || !credential?.hash) return false;
      const actual = await derivePin(pin, base64ToBytes(credential.salt), credential.iterations);
      const expected = base64ToBytes(credential.hash);
      return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
    } catch { return false; }
  }

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
  const catalogCategoryOrder = () => config.brand === 'Hisense' ? hisenseCategoryOrder : applianceCategoryOrder;

  function catalogCategory(product) {
    const text = `${product.name || ''} ${product.category || ''} ${product.model || ''}`.toLocaleLowerCase('cs');
    if (text.includes('televiz') || /(^|\s)tv(\s|$)/.test(text)) return 'Televizory';
    if (text.includes('projektor')) return 'Projektory';
    if (text.includes('soundbar')) return 'Soundbary';
    if (text.includes('mikrovln')) return 'Mikrovlnné trouby';
    if (text.includes('troub')) return 'Trouby';
    if (text.includes('varná deska') || text.includes('indukční deska') || text.includes('sklokeram')) return 'Varné desky';
    if (text.includes('sporák')) return 'Sporáky';
    if (text.includes('odsavač') || text.includes('digestoř')) return 'Digestoře';
    if (text.includes('chladnič') || text.includes('lednic') || text.includes('mraz')) return 'Chladničky';
    if (text.includes('myčk')) return 'Myčky nádobí';
    if (text.includes('sušička potravin') || text.includes('mezikus') || text.includes('držák na obuv') || text.includes('držák na boty')) return 'Malé domácí spotřebiče';
    if (text.includes('pračk')) return 'Pračky';
    if (text.includes('sušič')) return 'Sušičky';
    return 'Malé domácí spotřebiče';
  }

  function sortedCatalogProducts() {
    const order = catalogCategoryOrder();
    return [...visibleProducts()].sort((a, b) => {
      const categoryDifference = order.indexOf(catalogCategory(a)) - order.indexOf(catalogCategory(b));
      return categoryDifference || catalogSourceOrder.get(a.id) - catalogSourceOrder.get(b.id);
    });
  }

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
    if (productVideos(currentProduct).length) tabs.push({ id: 'video', label: 'Video' });
    if (!tabs.some((tab) => tab.id === currentTab)) currentTab = 'overview';
    const scrollable = currentTab === 'overview' || currentTab === 'specs' || currentTab === 'video';
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
      els.detailPanel.innerHTML = `<div class="video-list">${productVideos(currentProduct).map((video, index) => `<article class="video-item"><strong>Video ${index + 1}</strong><video controls playsinline preload="metadata" src="${escapeHtml(video)}"></video></article>`).join('')}</div>`;
    }
  }

  function changeImage(step) {
    const count = productImages(currentProduct).length;
    if (count < 2) return;
    currentImage = (currentImage + step + count) % count;
    renderGallery();
  }

  function renderCatalog() {
    const list = sortedCatalogProducts();
    const populatedCategories = new Set(list.map(catalogCategory));
    const categories = ['Vše', ...catalogCategoryOrder().filter((name) => populatedCategories.has(name))];
    if (!categories.includes(category)) category = 'Vše';
    els.categoryFilters.innerHTML = categories.map((name) => `<button class="filter-chip${name === category ? ' active' : ''}" data-category="${escapeHtml(name)}" type="button">${escapeHtml(name)}</button>`).join('');
    const filtered = list.filter((product) => category === 'Vše' || catalogCategory(product) === category);
    els.catalogGrid.innerHTML = filtered.map((product) => { const cover = productImages(product)[0]; return `<button class="product-card${product.id === currentProduct?.id ? ' selected' : ''}" data-product="${product.id}" type="button"><span class="product-card-image">${cover?.url ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy">` : ''}</span><span class="product-card-copy"><span><small>${escapeHtml(product.name)}</small><strong>${escapeHtml(product.model)}</strong></span><b>${escapeHtml(formatPrice(product.price))}</b></span></button>`; }).join('');
    els.catalogEmpty.hidden = filtered.length > 0;
  }

  function setOverlay(overlay, open) {
    overlay.hidden = !open;
    if (overlay === els.catalogOverlay) els.catalogButton.setAttribute('aria-expanded', String(open));
    if (open && overlay === els.catalogOverlay) { category = 'Vše'; renderCatalog(); }
  }

  function openPin() {
    if (!localStorage.getItem(PIN_STORAGE_KEY)) {
      els.pinSetupForm.reset();
      els.pinSetupError.textContent = '';
      setOverlay(els.pinSetupOverlay, true);
      setTimeout(() => els.pinSetupInput.focus(), 20);
      return;
    }
    els.pinInput.value = '';
    els.pinError.textContent = '';
    setOverlay(els.pinOverlay, true);
    setTimeout(() => els.pinInput.focus(), 20);
  }
  function openAdmin() {
    setOverlay(els.pinOverlay, false);
    els.adminBrand.innerHTML = brands.map((brand) => `<option value="${brand}">${brand}</option>`).join('');
    els.adminBrand.value = config.brand;
    renderAdminProducts();
    pendingAdminVideos = [...productVideos(currentProduct)];
    els.adminVideo.value = '';
    els.adminVideoProduct.textContent = `(${currentProduct.model} · PN ${currentProduct.id})`;
    renderAdminVideoList();
    setOverlay(els.adminOverlay, true);
  }

  function renderAdminVideoList() {
    els.adminVideoList.innerHTML = pendingAdminVideos.map((video, index) => `<div class="admin-video-row"><span>${escapeHtml(video.split('/').pop() || `Video ${index + 1}`)}</span><button class="text-button remove-video" data-video-index="${index}" type="button">Odebrat</button></div>`).join('');
    els.adminVideoStatus.textContent = pendingAdminVideos.length
      ? `Přiřazeno videí: ${pendingAdminVideos.length}`
      : 'K tomuto produktu není přiřazeno žádné video.';
  }

  function appendAdminVideo(url) {
    const value = String(url || '').trim();
    if (!value || pendingAdminVideos.includes(value)) return false;
    pendingAdminVideos.push(value);
    renderAdminVideoList();
    return true;
  }

  function commitAdminVideoInput() {
    const value = els.adminVideo.value.trim();
    if (!value) return;
    appendAdminVideo(value);
    els.adminVideo.value = '';
  }

  window.ExhibitNativeVideo = {
    selected(productId, url, name) {
      if (currentProduct?.id !== productId) return;
      appendAdminVideo(url);
      showToast('Video bylo zkopírováno do zařízení. Nastavení ještě uložte.');
    },
    failed(message) { showToast(message || 'Video se nepodařilo uložit.'); },
  };

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
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      const displayWindowActive = minutes >= 7 * 60 && minutes < 18 * 60;
      if (!displayWindowActive) {
        if (wakeLock) await wakeLock.release();
        wakeLock = null;
        els.wakeLockStatus.textContent = 'Mimo čas 7:00–18:00';
        return;
      }
      if (wakeLock && !wakeLock.released) {
        els.wakeLockStatus.textContent = 'Aktivní';
        return;
      }
      if ('wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        els.wakeLockStatus.textContent = 'Aktivní';
        wakeLock.addEventListener('release', () => { wakeLock = null; els.wakeLockStatus.textContent = 'Uvolněno'; });
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
  els.pinSetupForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const pin = els.pinSetupInput.value;
    if (!/^\d{4,8}$/.test(pin)) { els.pinSetupError.textContent = 'Zadejte 4 až 8 číslic.'; return; }
    if (pin !== els.pinSetupConfirm.value) { els.pinSetupError.textContent = 'Zadané PINy se neshodují.'; return; }
    try {
      await saveAdminPin(pin);
      setOverlay(els.pinSetupOverlay, false);
      openAdmin();
      showToast('PIN tohoto tabletu byl nastaven.');
    } catch { els.pinSetupError.textContent = 'PIN se nepodařilo bezpečně uložit.'; }
  });
  els.pinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (await verifyAdminPin(els.pinInput.value)) openAdmin();
    else { els.pinError.textContent = 'Nesprávný PIN.'; els.pinInput.select(); }
  });
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
  els.uploadVideoButton.addEventListener('click', () => {
    if (window.AndroidMedia?.pickVideo) window.AndroidMedia.pickVideo(currentProduct.id);
    else els.adminVideoUpload.click();
  });
  els.adminVideoUpload.addEventListener('change', () => {
    const file = els.adminVideoUpload.files?.[0];
    if (!file) return;
    if (file.type !== 'video/mp4') return showToast('Vyberte video ve formátu MP4.');
    appendAdminVideo(URL.createObjectURL(file));
    renderAdminVideoList();
    showToast('V internetovém náhledu není lokální video trvalé. V APK se uloží do zařízení.');
  });
  els.addVideoUrlButton.addEventListener('click', () => {
    if (!els.adminVideo.value.trim()) return showToast('Zadejte adresu videa.');
    commitAdminVideoInput();
  });
  els.adminVideoList.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-video');
    if (!button) return;
    pendingAdminVideos.splice(Number(button.dataset.videoIndex), 1);
    renderAdminVideoList();
  });
  els.saveAdmin.addEventListener('click', () => {
    const selected = adminSelectedIds();
    if (!selected.length) return showToast('Vyberte alespoň jeden produkt.');
    const oldProductId = currentProduct.id;
    config.brand = els.adminBrand.value;
    config.productIds = selected;
    config.defaultProductId = selected.includes(els.adminDefaultProduct.value) ? els.adminDefaultProduct.value : selected[0];
    commitAdminVideoInput();
    if (pendingAdminVideos.length) config.videoOverrides[oldProductId] = [...pendingAdminVideos]; else delete config.videoOverrides[oldProductId];
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
  window.setInterval(requestWakeLock, 60_000);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') [els.catalogOverlay, els.pinOverlay, els.pinSetupOverlay, els.adminOverlay].forEach((overlay) => setOverlay(overlay, false));
    if (event.key === 'ArrowLeft') changeImage(-1);
    if (event.key === 'ArrowRight') changeImage(1);
  });
  els.detailPanel.addEventListener('play', (event) => {
    if (event.target.tagName !== 'VIDEO') return;
    els.detailPanel.querySelectorAll('video').forEach((video) => { if (video !== event.target) video.pause(); });
  }, true);

  window.addEventListener('beforeunload', () => uploadedObjectUrls.forEach((url) => URL.revokeObjectURL(url)));
  (async () => {
    await loadUploadedImages();
    selectProduct(config.defaultProductId);
    requestWakeLock();
  })();
})();

