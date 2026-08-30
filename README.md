# Exhibit Label Frontend 0.12 preview

Statická tabletová aplikace pro výstavní popisky produktů Hisense, Gorenje a MORA. Tato verze už nepoužívá Supabase: konfigurace tabletu se ukládá pouze v daném zařízení a katalog lze otevřít z GitHub Pages i z lokální složky.

## Co obsahuje

- 52 aktivních produktů načtených ze seznamu pro výstavu; stabilní ID každého produktu je jeho PN.
- celoobrazovkový výběr produktů z hamburger menu;
- velké dotykové prvky a responzivní rozvržení pro 11″ tablet 1920 × 1200;
- barevně odlišené zóny značek s originálními logy a cenou označenou `DMOC s DPH`;
- úplné technické parametry a rozšířené popisy klíčových funkcí;
- galerii omezenou na kvalitní produktové fotografie bez nízkých náhledů a 360° mezisnímků;
- lokální nastavení značky, povolených produktů a výchozího produktu;
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

Správu otevřete dlouhým stiskem názvu značky nebo pěti rychlými dotyky v pravém horním rohu. Výchozí PIN je `2468`.

Nastavení se ukládá do `localStorage` pod klíčem `exhibit-label-device-v2`. Každý tablet proto může mít jinou značku a jiný výběr produktů, přestože všechny používají stejnou aplikaci.

Video se zadává jako relativní cesta, například `media/745997.mp4`. Doporučený cílový formát pro tablet je MP4, video H.264 (AVC), zvuk AAC, rozlišení nejvýše 1920 × 1080.

## Datové soubory

- `data/products-*.js` — katalog rozdělený podle značek, aby se dal spolehlivě publikovat a načíst i z `file://`;
- `data/products.js` — malé sloučení tří částí do výsledného katalogu;
- `data/products-source.json` — zdrojové řádky a URL z Excelu;
- `data/import-report.json` — kontrolní výstup importu;
- `scripts/validate-catalog.mjs` — kontrola počtu produktů, PN, cen a obrázků.

## Známé kontroly před ostrým nasazením

- Excel obsahuje 52 řádků produktů, nikoli 62.
- Gorenje používá potvrzený model `BM341M3DBGH` s PN `744400`.
- U pračky se zobrazuje potvrzený výstavní název `WG814A55 TotalFresh` při PN `747646`.
- MORA `IS 8688 DX` používá potvrzený podklad Planeo a PN `740927`.
- Obrázky jsou nyní vybírány z originálních/HI-RES zdrojů. Pro finální offline balíček se stáhnou do lokální složky a odkazy se přepíší na relativní cesty.

## Provoz 7:30–18:00

Webová aplikace žádá systém o udržení obrazovky zapnuté, ale spolehlivý časový plán, automatický start po restartu a uzamčení tabletu musí zajistit kiosk aplikace nebo Samsung Knox. Tato část bude dokončena až po odsouhlasení vzhledu a chování preview.

