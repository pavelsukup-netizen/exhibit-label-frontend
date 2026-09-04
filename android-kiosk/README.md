# Android kiosk APK

Nativní WebView obal statického katalogu. Při sestavení vezme aktuální `index.html`, `assets/` a produktové soubory z preview a vloží je přímo do APK.

## Vlastnosti

- obsah aplikace je zabalený v APK; produktové fotografie zatím zůstávají na vzdálených URL a pro jejich první načtení je nutné připojení k internetu;
- fullscreen a landscape režim;
- obrazovka zůstává zapnutá po celou dobu běhu;
- návratové tlačítko návštěvníka neopustí;
- podporuje výběr vlastních obrázků v administraci;
- bez přiřazeného videa se záložka Video nezobrazuje;
- se systémovým připnutím aplikace funguje bez Device Owner;
- při nastavení aplikace jako Device Owner se aktivuje skutečný Android Lock Task.

## Instalace debug APK

```powershell
adb devices
adb install -r .\ExhibitCatalog-0.1.0-debug.apk
```

Při prvním běžném spuštění Android nabídne systémové připnutí obrazovky. To stačí pro první test. Plný kiosk bez možnosti opuštění aplikace nastavíme až po ověření APK; příkaz Device Owner vyžaduje čistý nebo továrně resetovaný tablet bez přidaných účtů.

Debug APK je určené jen pro první test a nepoužívá finální stabilní podpis. Před ostrou konfigurací tabletů vytvoříme trvale podepsané release APK; přechod z tohoto debug sestavení může vyžadovat odinstalaci a tím smazat jeho zkušební lokální nastavení.

