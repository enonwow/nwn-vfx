# Studio 0.24.0 — odbiór audio na osi DUR

Wdrożono aktywne klipy audio w efektach DUR przez wspólne operacje edytora, CLI i WebMCP. Agent może utworzyć nowy efekt od pustego projektu, zaimportować WAV/MP3 i ustawić start, długość, fragment źródła, gain/gainDb, mute oraz fade-in/out. Źródłem okresu pozostaje document.duration. Żaden dźwięk testowy nie jest zaakceptowanym brzmieniem skrzydeł użytkownika.

## Wersja i zachowanie danych

- Usługa `http://127.0.0.1:4317` i globalny CLI: **0.24.0**. Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587` zachowane.
- Pakiet `output/releases/nwn-vfx-studio-0.24.0.tgz`: 2 520 027 B, SHA-256 `33fb0953513813a4ebf82ed79c8c988b86e7929ffc25532b62996069c83c5d0c`.
- Globalna instalacja: `C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio`. Skill repozytorium, osobisty i zainstalowany mają identyczny SHA-256 `e762bb013d85c6434275a4798dd0e588d736bb05285e08bd13c7d2e442d70ec1`.
- Restart uzgodniono z konsumentem; przed zatrzymaniem sprawdzono PID 14580, jego plik wykonywalny i ścieżkę zainstalowanej usługi. Nie było aktywnych zadań. Nie przeładowywano istniejących kart konsumenta.
- **83 wcześniejsze głowy projektów zachowały rewizje i kanoniczne hashe dokumentów**, w tym `tlc-wampir-skrzydla-{open,loop,close}@7`. Nie zmieniano demo konsumenta ani jego artefaktów.
- Aktywne audio DUR promuje nową rewizję do dokumentu **15**, ZIP **10**, minimum Studio **0.24.0**. Klient deklaruje `X-NWN-VFX-Document-Schema:15`. Starszy klient nie może opublikować tej kombinacji; nie ma automatycznej migracji historycznych dokumentów.

Kontrakt i publiczne przykłady: [duration-audio.md](../../agents/duration-audio.md), [techniczny projekt i WAV](../../agents/examples/duration-audio/). Okres musi zawierać całkowite próbki przy 48 i 44,1 kHz; Studio nie zaokrągla ani nie zmienia autorskiego tempa. Zmiana długości DUR skaluje klucze siatki; klipy audio zachowują swoje czasy i offsety.

## Zakończone kontrole

- Pełny przebieg: **273/273 testy**. Obejmuje dokładne PCM przy obu częstotliwościach, fazę po seek, częściowe okresy, mute, offsety, fades, okresy niedozwolone, eksport ASCII/binary, ZIP, blokady, pauzę, konflikt, idempotencję, undo oraz rollback starego klienta. Build i TypeScript przeszły.
- Trzy scenariusze przeglądarkowe mają wynik pozytywny: dotychczasowa oś audio, zmiana odtwarzanego projektu i nowy DUR. Pierwszy wspólny przebieg zaliczył dwa istniejące scenariusze; nowy test następnie poprawiono i zaliczono osobno. Wcześniejsze logi niepowodzeń zachowano.
- Test nowego DUR używa prawdziwego Chrome AudioContext: przez co najmniej trzy okresy jest maksymalnie **jedno aktywne źródło**, z buforem 1,6 s i loop=true. Pauza w połowie okresu, Stop i zmiana projektu kończą poprzednie źródło. W testach automatycznych rejestr WebMCP jest fixture; odbiór prawdziwego hosta opisano osobno poniżej.
- Ujawnione podczas kontroli błędy poprawiono: nie powstaje nowe nieme źródło po przejściu na projekt bez audio, a błąd float `1.6*3*30` nie dodaje 145. klatki do filmu DUR z audio. Zmiana liczby klatek jest ograniczona do aktywnego audio DUR. Właściwe regresje przeglądarkowe i test zainstalowanego renderera sprawdzają te poprawki.
- Film trzech okresów ma **144 klatki, 4,8 s i 230 400 ramek PCM stereo/48 kHz**. Trzy fragmenty WAV są identyczne bajtowo. Dekodowanie rzeczywistego Opus daje tę samą długość; każdy okres zawiera oczekiwany sygnał oraz ciszę. Opus jest stratny, więc identyczność próbek sprawdza osobny WAV.
- Zainstalowane CLI uruchomione z `C:/Projects/the last city`: pięć zakończonych zadań, pobranie artefaktów z kontrolą rozmiarów/SHA, eksport ZIP, ASCII i binary, film trzech okresów oraz jawnie niema kompozycja.
- **11 zasobów/plików FnF** porównano z eksportem tego samego projektu przez 0.23.0: identyczne SHA-256 MDL, HAK, TGA, TXI, WAV, NSS i audio-events.json v1. Geometria fixture DUR pozostała identyczna po dodaniu audio.

Projekt CLI: `studio-duration-audio-0240-loop@3`, snapshot `b2ec042b35fddb03971911905c24a1e120fea50e98195f9765f10f6101336d0d`.

| Przebieg CLI | Job |
| --- | --- |
| Porównanie FnF z 0.23 | `29a86ba0-39c2-44ac-a01a-1a4e31a2dcb6` |
| DUR ASCII | `7d181369-1833-462a-8ec1-194470f932c1` |
| DUR binary | `134a4642-7467-4c11-bf56-63667720ed4b` |
| DUR trzy obiegi WebM | `3603ed15-fb16-482c-a2b9-28d97a019bb2` |
| Kompozycja bez audio | `5291dbc9-7031-4add-a608-cd54958c409f` |

## Rzeczywisty WebMCP

Nowa izolowana karta Codex IAB odkryła **49 narzędzi, 65 405 B** deskryptorów z origin/pageUrl. Rezerwa do 65 536 B wynosi 131 B; rozszerzanie kontraktu nadal wymaga kontroli tego limitu. Test nie korzystał z podszytego rejestru narzędzi ani bezpośrednich wewnętrznych operacji przeglądarki.

Agent utworzył `studio-duration-audio-0240-webmcp` przez projects.create(empty, duration), zaimportował techniczny WAV, wykonał changes.preview/apply, ustawił 1,6 s, dwa klipy z offsetami i fades oraz gainDb=-18. Rewizja 3 ma dokument 15. Po ludzkim zapisaniu i usunięciu testowej blokady projekt ma rewizję **5**.

Zaliczone: identyczne ponowienie, REVISION_CONFLICT, czas 0,8 s/zaznaczenie warstwy, AI_PAUSED, LOCKED, DRAFT_CONFLICT, zachowanie ludzkiego szkicu podczas renderu/eksportu. Pobrano **19 plików** przez artifacts.read, aż do nextOffset=null, z kontrolą SHA każdej porcji i rozmiaru/SHA całości. Film ma trzy identyczne okresy PCM; manifest v2 wskazuje mono WAV **70 560 ramek przy 44,1 kHz**. Testowy szkic przywrócono, grant odwołano z wynikiem WEBMCP_NOT_CONNECTED, własną kartę zamknięto.

- Eksport: `c691e767-19a4-4beb-9f48-a4260e3ab3ce`.
- Podgląd: `e44f2f0a-920b-4a86-b94c-dc5a1ec8c97f`.
- WebM SHA-256: `7e200ad40c7575b44e4125ac2b97583b82c46a87e5acc32130536a255769411b`.

## Granice eksportu i odbioru

Aktywne audio DUR eksportuje audio-events.json **v2** oraz jeden pełny okres mono WAV z wliczoną ciszą, czasem startu klipów i offsetami źródła. preferredIntegration.method=`consumer-scheduled-period-wav`; konsument wywołuje kolejne okresy w chwilach `activationTime+k*period`, gdy `k*period < externalLifetime`. Przy anulowaniu unieważnia generację aktywacji i kończy przyszłe wywołania. Helper NSS odtwarza jeden okres na wywołanie i nie implementuje harmonogramu.

Nie ma automatycznej pętli SoundImpact, odczytu fazy natywnej animacji ani uchwytu do natychmiastowego przerwania już wywołanego dźwięku. Ostatni WAV może wybrzmieć po końcu wizualnym; opóźnienie kolejki akcji może wydłużyć ten ogon. Konsument rozstrzyga spóźnienia i nakładanie aktywacji. Studio nie dodaje automatycznego crossfade, normalizacji ani naprawy łączenia okresów. **preview.compose nadal jawnie pomija audio**.

Nie uruchamiano Toolsetu/NWN ani nie integrowano natywnych modułów. Readback zasobów nie jest dowodem natywnego brzmienia, synchronizacji, zaniku czy zatrzymania. Wszystkie wyniki pozostają **nativeVerified:false**. W końcowym callbacku konsument poinformował o wyborze przez użytkownika próbki E (Shirt Whoosh 2); konsument przygotowuje jej dopasowaną pochodną i osobny wariant. Studio nie importowało tej próbki ani nie zmieniło jego projektów; użyty tutaj fixture pozostaje tonem technicznym.

Dowody: `output/releases/0.24.0/{fnf-before.json,installed-acceptance.json,installed-preservation.json,real-host-webmcp.json}` oraz `output/playwright/duration-audio/acceptance.json`. Logi: `output/duration-audio-{all-tests,build,typecheck-final,browser,browser-final,installed,after}.log`. [Manifest źródeł i pakietu](source-manifest.json) identyfikuje 288 plików lokalnych; repozytorium nie ma jeszcze pierwszego commita.
