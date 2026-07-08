# Exhibit Label Frontend v0.11

Statický frontend pro GitHub Pages.

## Co je uvnitř

- `index.html` – celá tabletová aplikace v jednom souboru
- výchozí Supabase public-api:
  `https://cfuwwwhuftelsjwketjc.supabase.co/functions/v1/public-api`
- výchozí Device ID:
  `tablet-01`

## Nasazení na GitHub Pages

1. Vytvoř na GitHubu nový repozitář, třeba:
   `exhibit-label-frontend`

2. Nahraj do rootu repozitáře soubor:
   `index.html`

3. V GitHubu otevři:
   `Settings -> Pages`

4. Nastav:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`

5. Ulož.

6. Počkej minutu/dvě. GitHub ti ukáže URL ve stylu:
   `https://TVUJ-USERNAME.github.io/exhibit-label-frontend/`

## Nastavení v tabletu

Otevři aplikaci na GitHub Pages.

Admin menu:
- 5× tap do pravého horního rohu
- nebo dlouhý stisk loga
- PIN: `2468`

V adminu nastav:
- Device ID v Supabase: například `tablet-01`
- Supabase public-api URL:
  `https://cfuwwwhuftelsjwketjc.supabase.co/functions/v1/public-api`
- zapnout `Načítat produkty ze Supabase podle Device ID`
- kliknout `Načíst ze Supabase`

## Fully Kiosk / Android

Ve Fully Kiosk Browseru nastav jako Start URL GitHub Pages URL.
Aplikace si uloží Device ID lokálně do daného tabletu.

## Důležité

Každý tablet má stejnou URL, ale jiné lokální Device ID.
Supabase potom vrací produkty podle tabulky `devices` a přiřazeného `display_profile`.
