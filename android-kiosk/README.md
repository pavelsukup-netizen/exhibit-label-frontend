# Exhibit Catalog 0.3.0 – Device Owner

Produktová data, rozložení, výběr produktů a podpora více videí zůstávají zachované. Fotografie na vzdálených URL potřebují internet. Importovaná MP4 videa jsou v soukromém úložišti aplikace.

## Co se změnilo

- Device Owner aktivuje skutečný Lock Task bez systémové nabídky připnutí, s vypnutou navigací a systémovými funkcemi Lock Task.
- Každý den podle místního času tabletu budík v 7:00 probudí displej a otevře aplikaci. Do 18:00 zůstává displej aktivní. V 18:00 aplikace pozastaví videa a povolí systémový časový limit displeje. Tablet musí zůstat zapnutý, nikoli úplně vypnutý.
- Budíky se obnovují po restartu, aktualizaci APK a změně času. Bez Device Owner Android může automatické otevření z pozadí blokovat; samotná instalace APK proto nestačí.
- Administrace obsahuje stav Device Owner a tlačítko **Vypnout aplikaci a odebrat správu tabletu**. Znovu vyžaduje váš administrátorský PIN.
- Při importu souboru v administraci se Lock Task dočasně uvolní pro systémový výběr souborů a po návratu znovu zapne.
- Bez Device Owner zůstává zachováno původní systémové připnutí obrazovky; nenahrazuje plný kiosk.

## 1. Instalace a příprava

Toto je debug APK pro ověření na skutečném tabletu. Každý cloudový build může mít jiný debug podpis. Neodinstalovávejte starou aplikaci při chybě podpisu automaticky: odinstalace smaže místní videa, obrázky, výběry i PIN. Aktualizace se stejným podpisem tato data ponechá. Pro další ostré aktualizace je nutný stabilní podpisový klíč.

Rozbalte ZIP. V PowerShellu ve složce Android platform-tools spusťte (cestu k APK upravte):

```powershell
.\adb.exe devices
.\adb.exe install -r "C:\cesta\ExhibitCatalog-0.3.0-device-owner.apk"
```

Na tabletu potvrďte povolení ladění USB. Při INSTALL_FAILED_UPDATE_INCOMPATIBLE zastavte postup a nejdříve vyřešte uchování místních dat; tento návod neprovádí jejich mazání.

Před aktivací Device Owner otevřete aplikaci, pětkrát klepněte vpravo nahoře a ověřte svůj PIN (při prvním spuštění si jej nastavte). Zkontrolujte správný čas a časové pásmo. Ve vývojářských možnostech vypněte **Nevypínat obrazovku při nabíjení**, jinak displej nezhasne ani po 18:00. V systému nastavte běžný časový limit displeje, například 1 minutu.

## 2. Jednorázová aktivace Device Owner přes USB

Tablet nesmí mít jiného vlastníka zařízení nebo pracovní profil. Pro ADB provisioning obvykle musí být bez přidaných Google/Samsung účtů a v odpovídajícím stavu nastavení. Pokud příkaz Android odmítne, neprovádějte naslepo tovární reset: nejdřív posuďte konkrétní chybu a zálohu. Reset smaže celý tablet a není součástí tohoto postupu.

```powershell
.\adb.exe shell dpm set-device-owner cz.exhibit.catalog/.KioskDeviceAdminReceiver
.\adb.exe shell am start -n cz.exhibit.catalog/.MainActivity
```

Úspěch prvního příkazu musí potvrdit Android. V administraci následně musí být **Device Owner aktivní**. Samotné zaškrtnutí aplikace v seznamu správců zařízení není totéž.

Poté ověřte na tabletu jedno ranní probuzení, večerní zhasnutí a ukončení přes PIN. Kompilace APK neověřuje chování firmwaru Samsung. Po konfiguraci vypněte USB ladění a odvolejte jeho autorizace, aby návštěvník nemohl kiosk ovládat přes USB.

## 3. Ukončení bez továrního resetu

1. Pětkrát klepněte vpravo nahoře a zadejte administrátorský PIN.
2. Stiskněte **Vypnout aplikaci a odebrat správu tabletu** a znovu potvrďte svůj PIN.
3. Aplikace zastaví budíky, ukončí Lock Task, vrátí své nastavení zamykací obrazovky a Lock Task, odebere vlastnictví zařízení a svou aktivní správu. Otevře nastavení Androidu a zavře se.
4. Tablet lze běžně ovládat. V Nastavení → Aplikace → Exhibit Catalog jej lze odinstalovat. Teprve odinstalace smaže jeho místní data; samotné ukončení správy je nemaže.

Pokud Android odebrání odmítne, aplikace zobrazí chybu a nesmí být považována za odspravovanou. Neprovádí žádný automatický reset. Používá vlastníkem volanou metodu clearDeviceOwnerApp, která je v Androidu zastaralá a určená pro testovací deprovisioning; proto před jejím voláním výslovně vrací politiky, které sama nastavila.

Po ukončení zůstává automatický kiosk a probouzení vypnuté i při opětovném otevření aplikace. Znovu se aktivují při novém povolení správce/provisioningu; nový Device Owner znovu vyžaduje splnění podmínek Androidu.

Oficiální podklady: [Lock Task](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode), [DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager#clearDeviceOwnerApp(java.lang.String)).
