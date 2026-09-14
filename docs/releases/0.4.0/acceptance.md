# Studio 0.4.0 — tekstury RGBA i trzy punkty życia cząstki

Zlecenie **TLC-WYROK-STUDIO-04**, 2026-09-05. Zakres: własne tekstury PNG, wersjonowane zasoby, emitery i mesh z UV, kompletne przenoszenie projektu/eksportu oraz Start/Mid/End koloru, alpha i rozmiaru. Kod nie zawiera wariantów zależnych od projektu TLC. Światło, ribbon, orientacja emiterów i runner natywny są poza tym zleceniem.

## Implementacja

Dokument 3 dodaje immutable `assets`, referencje `texture:"asset:<sha256>"`, `blend`, UV i punkty wieku cząstki. SHA-256 identyfikuje dokładne oryginalne PNG, metadane zawierają nazwę/format/wymiary/pochodzenie. Obraz pozostaje w każdej używającej go rewizji. Dodawanie obrazu to `assets.import`, przypisanie i UV to `changes.apply`; obie operacje zachowują CAS, idempotencję, autora/czas, prawa i pauzę AI. Cofnięcie przypisania/UV/punktów respektuje blokady. Cofnięcie importu usuwa tylko jego zasób, zachowuje późniejsze niezależne importy i parametry oraz odmawia, jeśli warstwa nadal używa obrazu. Promocji schematu nie trzeba cofać wraz z parametrem.

CLI czyta jawny plik w katalogu konsumenta i przekazuje nazwę oraz base64. Backend nie otrzymuje ścieżki do otwarcia. WebMCP ma 38 narzędzi, w tym `studio.assets.import/list/get`; import używa zakresu `edit` przyznanego projektu. UI pokazuje zasoby, przypisanie i mieszanie, blokuje rozpoczęcie importu przy niezapisanym szkicu, zachowuje późniejszą edycję podczas oczekiwania i osobny tekst edytora UV JSON.

Wspólny dekoder obsługuje PNG RGBA8 bez przeplotu, POT 8–1024, do 2 MiB, 8 zasobów i 6 MiB zwartego dokumentu. Weryfikuje strukturę, CRC, Adler, filtry 0–4, hash, rozmiar dekompresji i sRGB. RGB jest niepremnożone, alpha liniowa. ICC/cHRM, inna gamma i APNG są jawnie odrzucane. TGA jest formatem eksportu, bez importera TGA.

Custom mesh ma osobno indeksowane `uv` i `uvFaces`, jeden trójkąt UV na trójkąt geometryczny. UV lewym dolnym początkiem, w 0–1. Ring/disk ma wspólne planarne mapowanie, box mapę każdej ściany. Renderer próbuje dokładnie te same custom RGBA co eksport TGA; gałąź starych proceduralnych masek emitera pozostaje dla zgodności dotychczasowych podglądów. Eksport TGA zachowuje wszystkie bajty RGBA, TXI normal/additive dostaje odrębne resrefy, MDL zapisuje bitmap/tverts/indeksy faces. HAK zawiera zależności aktywnych warstw. ZIP projektu zawiera pełny dokument, manifest 2 i obrazy `assets/<hash>.png`; import weryfikuje cały zestaw i zachowuje starszy manifest 1 bez zasobów.

`midColor`, `midAlpha`, `midSize` są niezależnymi wartościami, ale `midPercent` jest **wspólnym** ułamkiem wieku każdej cząstki .01–.99, domyślnie .5. Eksport zapisuje `percentStart 0`, `percentMid`, `percentEnd 1`. Brak środkowej wartości zachowuje liniowy kanał. Osobne procenty trzech kanałów i dowolne Béziery nie są deklarowane. Podstawę implementacyjną stanowią [kontrolery i procenty rollnw](https://raw.githubusercontent.com/jd28/rollnw/main/lib/nw/model/mdl_particle_import.cpp), [kontrolery xoreos](https://raw.githubusercontent.com/xoreos/xoreos/master/src/graphics/aurora/model_nwn.cpp) i [dyrektywy TXI BioWare](https://neverwintervault.org/article/tutorial/bioware-txi-example). To źródła formatu, bez kwalifikacji zainstalowanej gry.

## Dowody obrazu i UI

[Raport przeglądarkowy](C:/Projects/nwn-vfx/output/textures-acceptance/report.json), [emiter](C:/Projects/nwn-vfx/output/textures-acceptance/emitter-normal.png), [mesh](C:/Projects/nwn-vfx/output/textures-acceptance/mesh-uv.png), [edytor](C:/Projects/nwn-vfx/output/textures-acceptance/editor-textures.png).

Asymetryczny PNG ma cztery kolory i miękką alpha. Kontrola faktycznych PNG podglądu potwierdziła:

| Miejsce | Oczekiwany RGB | Emiter i mesh |
| --- | --- | --- |
| Góra lewo | 255,32,16 | identycznie |
| Góra prawo | 32,255,16 | identycznie |
| Dół lewo | 16,32,255 | identycznie |
| Dół prawo | 255,210,24 | identycznie |
| Miękka krawędź | mieszanie z tłem | oba 149,31,27 |

Test obejmuje alpha 0, alpha .5, normal/additive, osobne indeksy UV, zgodność pikselową UI z headless, rzeczywisty zapis importu z opóźnioną odpowiedzią i zachowaniem późniejszej edycji, blokadę niepoprawnego UV JSON, usunięcie mapy bez usunięcia zasobu, zmianę/reset punktów oraz blokady człowieka. Root obejrzał PNG obu typów oraz edytora i potwierdził orientację oraz miękkie brzegi.

Rzeczywiste klatki przebiegu cząstki przy czasach 0/.4/.83 s dały RGB środka [136,12,16] → [4,196,69] → [7,63,145] i powierzchnie widocznego obrazu 2304 → 32400 → 4352 pikseli. Wspólny midPercent=.4. Dowody: [start](C:/Projects/nwn-vfx/output/textures-acceptance/age-start.png), [środek](C:/Projects/nwn-vfx/output/textures-acceptance/age-middle.png), [koniec](C:/Projects/nwn-vfx/output/textures-acceptance/age-end.png).

## CLI z katalogu TLC, jeden snapshot

Skrypt [accept-textures.ts](C:/Projects/nwn-vfx/scripts/accept-textures.ts) uruchomił **zbudowany CLI** z `C:/Projects/the last city`, z własną izolowaną usługą na 14344 i nowym projektem kontrolnym. Usługa została zamknięta po kwalifikacji. Nie była to mutacja projektu konsumenta.

[Raport](C:/Projects/nwn-vfx/output/textures-cli-acceptance/run-Qr1xpu/report.json), [PNG](C:/Projects/nwn-vfx/output/textures-cli-acceptance/run-Qr1xpu/preview.png), [WebM](C:/Projects/nwn-vfx/output/textures-cli-acceptance/run-Qr1xpu/preview.webm), [portable ZIP](C:/Projects/nwn-vfx/output/textures-cli-acceptance/run-Qr1xpu/studio-project.zip), [candidate ZIP](C:/Projects/nwn-vfx/output/textures-cli-acceptance/run-Qr1xpu/candidate.zip), [odczyt zapisanych zasobów](C:/Projects/nwn-vfx/output/textures-cli-acceptance/run-Qr1xpu/candidate/validation.json).

Projekt `0de55916-ca06-44d9-84f5-ce8220b7a2ed`, rewizja 3, zawiera animowany pierścień, panel z UV i emiter z jawnymi punktami. Jeden PNG 64×64: `0d95698683f54ef63b9ef5355298f751a5a0e825134831e9e720a2e64ad7670f`. Wszystkie handoffy PNG/WebM/build wskazują snapshot `3b84d7b5534d82c0e9657a9f707e6a640b4351ce8d541e613757cf81588f8b87` i ten sam zasób. Ponowny import ZIP dał identyczny dokument. Film ma 36 klatek, 1.200 s i maksymalną lukę 34 ms.

Readback zapisanych plików potwierdził RGBA 64×64/32bpp/alpha0–255, dwie pary materiałów dla jednego PNG (normal/additive), UV, bitmapy, kontrolery oraz identyczne payloady HAK. Niezależny FFmpeg 9.0.1 zdekodował źródłowy PNG i oba wynikowe TGA do raw RGBA; wszystkie trzy mają SHA-256 **`92e20b1ab144645f9c3a1199b40d920cc7b76d868b17abf0caae089a7fff3346`**. W plikach odczytano m.in. percentMid=.35, alphaMid=.8, sizeMid=.3 i zapisany biały colorMid. Root obejrzał PNG całej kompozycji testowej; kolory służą kontroli technicznej, bez artystycznego zatwierdzenia efektu.

## Zgodność i granice

Dokumenty 1/2, wbudowane tekstury, zapisane joby/export reports 0.3.1 oraz koperta API 0.1.0 pozostają czytelne. Nowe pola mają zamknięte schematy; walidatory klienta należy odświeżyć. Przeszło **103/103** testów jednostkowych i integracyjnych, w tym testy hashy NIST, dekodowania, dekompresji, historii, restartu, niezależnego cofania, importu/ZIP, praw WebMCP i odczytu eksportu. [Log](C:/Projects/nwn-vfx/output/textures-unit.log).

Nie uruchamiano NWN/Toolsetu; `nativeVerified:false`. Render w Studio i zgodność danych eksportu nie potwierdzają natywnego blendu, interpolacji, cząstek, czasu aktywacji ani przezroczystości. `tlc-wyrok` rewizja 3 i niezapisany szkic „Fiolka alchemiczna” nie są obiektami testów.

## Końcowe testy i instalacja

Końcowy build przeszedł; pełny zestaw przeglądarkowy **8/8** jest zielony, w tym dotychczasowe mesh/cząstki/zapis/WebM i nowy test tekstur. [Build](C:/Projects/nwn-vfx/output/textures-build.log), [103 testy unit/integration](C:/Projects/nwn-vfx/output/textures-unit.log), [8 testów przeglądarkowych](C:/Projects/nwn-vfx/output/textures-browser.log).

Zainstalowano globalnie [paczkę 0.4.0](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.4.0.tgz) bez dowiązania do repo: SHA-256 `d57ce75689beb7f969c002a285ad6d8914f2782da54230f67f3ed6c3ea1aa872`. [Manifest 81 plików źródłowych](C:/Projects/nwn-vfx/docs/releases/0.4.0/source-manifest.json). Źródłowy, zainstalowany i spakowany skill mają identyczny hash `a0d9a675f32353e19096895443a7cfdfd9b34ed44ad79ba94e2fb17140cde06e`; źródło i instalacja przeszły walidację skilla.

Przed zatrzymaniem usługi nie było aktywnych jobów. Restart przez uwierzytelnione CLI zachował instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057` i workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`. Zainstalowany CLI uruchomiony z katalogu TLC potwierdził 0.4.0 i gotowy renderer. Wszystkie **7 istniejących projektów** było identycznych przed/po instalacji: [przed](C:/Projects/nwn-vfx/output/textures-live-projects-before.json), [po](C:/Projects/nwn-vfx/output/textures-live-projects-after.json). Oryginalna karta fiolki zachowała niezapisany szkic.

## Rzeczywisty WebMCP w zainstalowanym Studio

Adapter WebMCP karty Codex IAB opublikował 38 narzędzi. Przez ten adapter agent utworzył osobny projekt „WebMCP 0.4 — tekstura i animowana fala” (`13bf68eb-e92e-4a82-89d0-4c6a76af8273`), zaimportował PNG, odczytał jego metadane i pełne bajty, przypisał obraz do emitera oraz animowanego pierścienia i ustawił punkty Start/Mid/End. Następnie otworzył projekt w swojej karcie z podglądem zatrzymanym na .4 s i zlecił WebM, eksport kandydata NWN i przenośny ZIP projektu z rewizji 3. To test rzeczywistego transportu aplikacji, uzupełniający testy automatyczne.

`studio.artifacts.read` przekazał kompletne bajty trzech wyników; długości, SHA-256 i końcowy offset zostały sprawdzone. Te same artefakty odebrano dodatkowo przez globalnie zainstalowane CLI uruchomione z katalogu TLC. Handoff filmu i kandydata wskazuje snapshot `b4d1f03e3975b13f71486baf8aab37f0ccc9bceea6e10bed807e2d6f96f5e4d1`. Film ma 36 klatek, 1.200 s i maksymalną lukę 34 ms.

| Artefakt | Bajty | SHA-256 |
| --- | ---: | --- |
| preview.webm | 73862 | `c6f3ab119895959725c04ba8debed4ab35ac0e3bfd96d73acce687092e4d92ce` |
| candidate.zip | 26017 | `b2d1c88336a651e788a462ad2b582ef8a44e98d63d7f583c1096021eb3432f4c` |
| studio-project.zip | 1902 | `78631fdcfccbb66c66dc62dd7463c3d93464a9b1e1849a77588245f22c395d83` |

Pauza AI włączona przez UI własnego projektu zatrzymała kolejny import z kodem `AI_PAUSED`. Próba zmiany ze starą rewizją dała `REVISION_CONFLICT`. Po zakończeniu grant testowy odłączono; `studio.connection.inspect` zwrócił `WEBMCP_NOT_CONNECTED`. Oryginalna karta „Fiolka alchemiczna” nadal miała niezapisany szkic; nie była odświeżana ani zapisywana.

[Raport WebMCP](C:/Projects/nwn-vfx/output/textures-live-webmcp/report.json), [film](C:/Projects/nwn-vfx/output/textures-live-webmcp/preview.webm), [kandydat NWN](C:/Projects/nwn-vfx/output/textures-live-webmcp/candidate.zip), [przenośny projekt](C:/Projects/nwn-vfx/output/textures-live-webmcp/studio-project.zip). Test nadal ma `nativeVerified:false`.

Po odbiorze wysłano do zadania konsumenta `01a070e3-5df3-7913-943f-854ac8ea98ee` wersję zainstalowanej aplikacji, przykłady operacji, wyniki testów, ścieżki dowodów i granice funkcji, z przekazaniem dalszej iteracji artystycznej Wyroku. Końcowa kontrola potwierdziła 81/81 hashy źródeł oraz hash zainstalowanej paczki.
