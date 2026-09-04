# Exhibit Label Frontend 0.12 preview

Statická tabletová aplikace pro výstavní popisky produktů Hisense, Gorenje a MORA. Tato verze už nepoužívá Supabase: konfigurace tabletu se ukládá pouze v daném zařízení a katalog lze otevřít z GitHub Pages i z lokální složky.

## Co obsahuje

- 60 aktivních produktů: 52 z původního seznamu pro výstavu a 8 doplněných Hisense TV/audio; stabilní ID každého produktu je jeho PN.
- celoobrazovkový výběr produktů z hamburger menu bez vyhledávacího pole a automatického otevírání klávesnice;
- katalog se třemi kartami na řádek, svislým rolováním a zalomenými filtry sjednocených produktových skupin;
- pořadí skupin podle výstavní zóny: u Hisense nejprve televizory, projektory a soundbary, poté velké a malé spotřebiče; u Gorenje a MORA začíná katalog troubami;
- velké dotykové prvky a responzivní rozvržení pro 11″ tablet 1920 × 1200;
- barevně odlišené zóny značek s originálními logy a cenou označenou `DMOC s DPH`;
- úplné technické parametry a rozšířené popisy klíčových funkcí;
- galerii s pevným responzivním boxem, ve kterém se fotografie vždy zobrazí celá a nezasahuje do šipek ani náhledů;
- lokální nastavení značky, povolených produktů, výchozího produktu a viditelnosti jednotlivých fotografií;
- možnost přidat ke konkrétnímu produktu vlastní obrázek ze zařízení nebo relativní cestu k souboru v offline balíčku;
- volitelnou cestu k videu; bez přiřazeného videa se záložka Video vůbec nevytvoří;
- Screen Wake Lock jako doplněk kiosk režimu;
- plné běžné ceny bez akčních/cashback cen.

## Spuštění

Aplikace nemá sestavení ani serverové závislosti. Otevřete `index.html`, případně kořen repozitáře publikujte přes GitHub Pages.

Pro lokální test přes HTTP:

```powershell
python -m http.server 4173
```

Potom otevřete `http://localhost:4173/`.

## Nastavení tabletu

Správu otevřete výhradně pěti rychlými dotyky v pravém horním rohu. Výchozí PIN je `2468`. V zákaznické části není žádné textové pole; softwarová klávesnice se může otevřít až po vstupu do administrace.

Nastavení se ukládá do `localStorage` pod klíčem `exhibit-label-device-v2`. Nahrané obrázky se ukládají jako soubory do lokální databáze IndexedDB `exhibit-label-media-v1`. Každý tablet proto může mít jinou značku, výběr produktů i vlastní fotografie, přestože všechny používají stejnou aplikaci.

Relativní cesta k obrázku, například `media/20017916-detail.jpg`, slouží pro soubory zabalené společně s offline aplikací. Pro výběr běžné fotografie z úložiště Androidu použijte tlačítko **Nahrát ze zařízení**; aplikace si vytvoří vlastní trvalou lokální kopii.

Video se zadává jako relativní cesta, například `media/745997.mp4`. Doporučený cílový formát pro tablet je MP4, video H.264 (AVC), zvuk AAC, rozlišení nejvýše 1920 × 1080.

Nové produkty se na dříve nakonfigurovaném tabletu automaticky nepřidávají do uloženého výběru. V administraci je zaškrtněte a uložte nastavení. Původní výběr produktů, vlastní fotografie ani videa se aktualizací nemažou.

## Datové soubory

- `data/products-*.js` — katalog rozdělený podle značek, aby se dal spolehlivě publikovat a načíst i z `file://`;
- `data/products.js` — malé sloučení datových částí do výsledného katalogu;
- `data/products-source.json` — zdrojové řádky a URL z Excelu;
- `data/products-hisense-av.js` — 8 Hisense TV/audio produktů doplněných 2. 9. 2026;
- `data/import-report-hisense-av.json` — zdroje, ceny a kontrolní počty nových produktů;
- `data/import-report.json` — kontrolní výstup importu;
- `scripts/validate-catalog.mjs` — kontrola počtu produktů, PN, cen a obrázků.

## Známé kontroly před ostrým nasazením

- Excel obsahuje 52 řádků produktů, nikoli 62.
- Gorenje používá potvrzený model `BM341M3DBGH` s PN `744400`.
- U pračky se zobrazuje potvrzený výstavní název `WG814A55 TotalFresh` při PN `747646`.
- MORA `IS 8688 DX` používá potvrzený podklad Planeo a PN `740927`.
- Obrázky jsou nyní vybírány z originálních/HI-RES zdrojů. Pro finální offline balíček se stáhnou do lokální složky a odkazy se přepíší na relativní cesty.

## Provoz 7:30–18:00

Webová aplikace žádá systém o udržení obrazovky zapnuté, ale spolehlivý časový plán, automatický start po restartu a uzamčení tabletu musí zajistit kiosk aplikace nebo vlastní Android kiosk řešení (bez placeného Knoxu). Tato část bude dokončena až po odsouhlasení vzhledu a chování preview.

## Testovací Android APK

Nativní projekt je v `android-kiosk/`. GitHub Actions sestaví debug APK se statickým katalogem zabaleným uvnitř. Aplikace běží v landscape/fullscreen režimu, udržuje obrazovku zapnutou a podporuje systémové připnutí i plný Android Lock Task po nastavení jako Device Owner. Podrobný instalační postup je v `android-kiosk/README.md`.

