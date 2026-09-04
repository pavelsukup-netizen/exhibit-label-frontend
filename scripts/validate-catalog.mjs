import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const window = {};
for (const brand of ['hisense', 'hisense-av', 'gorenje', 'mora']) new Function('window', fs.readFileSync(path.join(root, 'data', `products-${brand}.js`), 'utf8'))(window);
new Function('window', fs.readFileSync(path.join(root, 'data', 'products.js'), 'utf8'))(window);
const products = window.EXHIBIT_CATALOG.products;
const ids = products.map((product) => product.id);
const errors = [];

if (products.length !== 60) errors.push(`Očekáváno 60 aktivních produktů, nalezeno ${products.length}.`);
const expectedAV = {"20014434":"HS3100","20016767":"AX3120Q","20016768":"AX5140Q","20017736":"C3","20018725":"65U7SE","20018804":"55E8S","20019162":"65UR9S","20019612":"55UR8S"};
for (const [id, model] of Object.entries(expectedAV)) {
  if (!products.some((product) => product.id === id && product.model === model && product.brand === 'Hisense')) errors.push(`${model}: chybí očekávaný produkt/PN.`);
}
if (new Set(ids).size !== ids.length) errors.push('PN nejsou unikátní.');
for (const product of products) {
  if (!/^\d+$/.test(product.id)) errors.push(`${product.model}: neplatné PN.`);
  if (!product.price || product.price < 100) errors.push(`${product.model}: chybí plná cena.`);
  if (!product.images?.length) errors.push(`${product.model}: chybí obrázek.`);
  if (product.images?.some((image) => image.width && image.width < 600)) errors.push(`${product.model}: galerie obsahuje obrázek pod 600 px.`);
  if (!product.features?.length) errors.push(`${product.model}: chybí přehled funkcí.`);
  if (!product.specifications?.length) errors.push(`${product.model}: chybí technické parametry.`);
  if (!product.sourceUrl) errors.push(`${product.model}: chybí zdroj.`);
}

const counts = Object.fromEntries(['Hisense', 'Gorenje', 'Mora'].map((brand) => [brand, products.filter((product) => product.brand === brand).length]));
console.log(JSON.stringify({ products: products.length, uniquePn: new Set(ids).size, brands: counts, assignedVideos: products.filter((product) => product.video).length, errors }, null, 2));
if (errors.length) process.exitCode = 1;
