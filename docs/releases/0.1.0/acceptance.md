# NWN VFX Studio 0.1.0 — raport implementacji

Data: **2026-09-05**. Status: **działająca alpha; pełna V1 pozostaje nieukończona**.

## Dostarczony przebieg

Edytor działa pod lokalnym adresem [Studio](http://127.0.0.1:4317). React/Three.js udostępniają warstwy emiterów, parametry, podgląd, oś czasu, warianty i A/B. Fastify i SQLite utrwalają projekty, historię, ograniczenia, operacje i zadania. CLI `nwn-vfx` jest instalowalne i pracuje z dowolnego katalogu przez to samo API.

Dostarczono schematy wejść i wyników, scope aktorów, kontrolę rewizji, idempotencję, selektywne cofanie niezależnych zmian, wstrzymanie AI, trwałe joby, atomowe publikowanie artefaktów, pobieranie z weryfikacją SHA-256 i lokalny start/stop usługi. Nieznane/niegotowe funkcje nie są reklamowane jako dostępne.

Eksporter zapisuje rzeczywisty ASCII MDL, proceduralne TGA/TXI, zasobowy HAK i ZIP. Niezależne czytniki sprawdzają strukturę oraz parametry zapisanych bajtów. Dwa presety — cewka i fiolka — korzystają z tego samego dokumentu i eksportera. Chromium renderuje PNG i WebM tym samym pakietem renderera co UI, także po zamknięciu karty.

## Weryfikacja wykonana

| Sprawdzenie | Wynik |
| --- | --- |
| `npm run build` | TypeScript oraz produkcyjne frontend/backend/CLI zbudowane |
| `npm test` | **36/36**: CLI, kontrakty, kodeki NWN i rzeczywista SQLite/API |
| `npm run test:browser` | **1/1**: pełny przebieg web/API, konflikt zachowujący propozycję, pobranie ZIP, prawdziwy PNG/WebM bez karty |
| Ekrany 1440×1000 i 390×844 | Zapisane i obejrzane; brak poziomego przepełnienia na małym ekranie i błędów konsoli w scenariuszu |
| `nwn-vfx` z `C:\Projects\the last city` | Start usługi, doctor i utworzenie dwóch projektów działają bez zmiany cwd na Studio |
| Niezależny agent ze skillem | Przygotował i pobrał wariant bez znajomości historii zadania i bez odczytu kodu |
| Walidator skillu | `quick_validate.py`: poprawny skill, zainstalowany w katalogu umiejętności użytkownika |
| Zależności npm | Po przypięciu poprawionej zależności esbuild: 0 zgłoszonych podatności w odczytanym audycie |
| Instalacja z paczki | Zainstalowano lokalny tarball npm do katalogu pakietów użytkownika; nie jest to dowiązanie do repo. Start z TLC zachował dane i wykonał rzeczywisty render PNG |

Próby trwałości obejmują bazę na dysku i kontrolowane zamknięcie/odtworzenie usługi, nie symulowany raport sukcesu. Próby renderu używają prawdziwego Chromium. Testy niezależnych fixture'ów MDL/HAK/TGA są oddzielne od odczytu plików writerem. Nie wykonano testu natywnej gry ani pomiaru zgodności podglądu z NWN.

Lokalne dowody przeglądarkowe: [desktop](C:/Projects/nwn-vfx/output/playwright/editor-desktop.png), [mały ekran](C:/Projects/nwn-vfx/output/playwright/editor-mobile.png), [PNG](C:/Projects/nwn-vfx/output/playwright/preview.png), [WebM](C:/Projects/nwn-vfx/output/playwright/preview.webm), [raport](C:/Projects/nwn-vfx/output/playwright/acceptance.json). Są to pliki wynikowe poza kontrolą Git.

Paczka do ponownej instalacji: [nwn-vfx-studio-0.1.0.tgz](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.1.0.tgz). [Manifest źródeł](C:/Projects/nwn-vfx/docs/releases/0.1.0/source-manifest.json) wiąże testowane pliki i lockfile z hashami. Po instalacji z paczki job `6431e6db-8270-4702-9e00-0316426cc53a` zakończył render PNG ze snapshotu istniejącego wariantu TLC; SHA-256 obrazu: `99908b757ce59434b16b0580de1deb7fc7a6bbedd19532f415d6780980734f7f`.

## Odbiór przez agenta TLC

Niezależny agent otrzymał wyłącznie zlecenie, zainstalowany skill, ID projektu i własną konfigurację z ograniczonym poświadczeniem. Pracował z katalogu TLC i zapisywał pliki wyłącznie do jawnego katalogu wyników Studio. Nie czytał kodu Studio i nie zmieniał plików repozytorium TLC.

- Wariant: `e68c5d30-50ac-4b4e-af3c-f13cf4e9e94f`, **„TLC — cięższe iskry”**, rewizja **2**.
- Zmiany: ciężar iskier `1.5 → 3`, czas życia `0.9 → 0.6`; tekstura dymu pozostała `smoke`. Projekt źródłowy zachował rewizję 1.
- PNG job: `dfe43330-09bc-4354-9219-0e4402a66bb3`; build job: `cc69f96c-4fcc-42c7-9c3c-727aed060ff6`; oba `succeeded`.
- Oba manifesty wiążą snapshot `81433b00b60679935bd59d3f5ccae7c708a61d97de8639b7ed008c7332e447af` i rewizję 2.
- ZIP SHA-256: `4354f22d598caa89d56a9ace7123060d2c9352990aff3d1e34007a4411733f98`.
- PNG SHA-256: `b44bfb524378403a1eb264a90f621ec54e200c3c1d1c930cb2681f8e429eeb15`.

[Raport niezależnego konsumenta](C:/Users/enonw/.nwn-vfx/acceptance-output/acceptance-report.json). Przekazanie artefaktu drugiemu klientowi z samym prawem odczytu oraz odmowa edycji są dodatkowo objęte rzeczywistym testem integracyjnym CLI/API.

## Stan bramek planu

| Bramka | Stan | Co pozostaje |
| --- | --- | --- |
| G0 | Zaliczone w lokalnym środowisku deweloperskim | Pełna dystrybucja bez istniejącego Node należy do G5/G6 |
| G1 | Część web/CLI/zapis/eksport/odczyt działa | Własny fixture MOD, profil i kwalifikacja natywna emitera/skali |
| G2 | Główne reguły trwałości i kontroli sprawdzone | Pełny odbiór wszystkich reguł V1, w tym natywnego wznowienia; UI używa obecnie odpytywania stanu, nie klienta dziennika z kursorem |
| G3 | Edytor emiterów i dwa presety działają | Światło, animowana geometria, import MDL, własne tekstury i pełna edycja wymaganych krzywych |
| G4 | Zasoby i odczyt eksportu działają | MOD/2DA/wyzwalanie, kwalifikowany runner, dowody z gry |
| G5 | CLI/skillu użył niezależny agent z TLC | Pełny natywny przebieg konsumenta i instalator z prywatnym Node/runtime |
| G6 | Niezaliczone | Całe G0–G5 oraz odbiór artystyczny użytkownika |
| P7 | Nierozpoczęte | MCP i opcjonalny WebMCP z testem rzeczywistego hosta |

## Granice bieżącej wersji

Podgląd trajektorii, mieszania i rozmiarów pozostaje przybliżeniem. Warstwa `gravity` jest mapowana na natywne `mass`, ale zgodność jej obrazu w NWN nie została dowiedziona. `nativeVerified` pozostaje `false` we wszystkich aktualnych wynikach.

Paczka eksportu zawiera zasoby, nie moduł gotowy do uruchomienia. Centralny AUR-S07 wymaga własnego MOD, uporządkowanych HAK, rejestracji VFX/wyzwalania, kwalifikacji geometrii i profilu przypiętego do faktycznie uruchamianych plików. Nie skopiowano starego profilu Coil ani nie zastąpiono wymaganych dowodów flagą sukcesu.

Projekt ZIP przenosi obecny dokument i tożsamości wbudowanych generatorów tekstur. Nie deklaruje importu dowolnych assetów. Nieobsługiwane aktywne warstwy i ucięte ogony emisji powodują jawny błąd eksportu. Full V1, natywny test i przyjęcie artystyczne pozostają otwartą pracą.
