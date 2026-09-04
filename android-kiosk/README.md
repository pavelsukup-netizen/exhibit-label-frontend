# Android kiosk APK

Nativní WebView obal statického katalogu. Při sestavení vezme aktuální `index.html`, `assets/` a produktové soubory z preview a vloží je přímo do APK.

## Vlastnosti

- obsah aplikace je zabalený v APK; produktové fotografie zatím zůstávají na vzdálených URL a pro jejich první načtení je nutné připojení k internetu;
- fullscreen a landscape režim;
- displej se automaticky probudí v 7:00, do 18:00 zůstane aktivní a poté znovu respektuje systémový časový limit;
- návratové tlačítko návštěvníka neopustí;
- podporuje výběr vlastních obrázků a MP4 videí v administraci; video se kopíruje do soukromého úložiště aplikace a zůstává dostupné offline;
- bez přiřazeného videa se záložka Video nezobrazuje;
- bez Device Owner používá celoobrazovkový immersive režim bez systémových hlášek screen pinningu;
- při nastavení aplikace jako Device Owner se aktivuje skutečný Android Lock Task.

## Instalace debug APK

```powershell
adb devices
adb install -r .\ExhibitCatalog-0.2.0-debug.apk
```

Pro první test není potřeba systémové připnutí ani Device Owner. Aplikace sama skryje systémové lišty, ale návštěvník se znalostí systémových gest ji stále může opustit. Plný kiosk bez možnosti opuštění aplikace vyžaduje Device Owner na čistém nebo továrně resetovaném tabletu bez přidaných účtů.

Debug APK je určené jen pro první test a nepoužívá finální stabilní podpis. Před ostrou konfigurací tabletů vytvoříme trvale podepsané release APK; přechod z tohoto debug sestavení může vyžadovat odinstalaci a tím smazat jeho zkušební lokální nastavení.
