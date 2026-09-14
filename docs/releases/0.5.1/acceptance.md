# Studio 0.5.1 — uruchamianie renderera na Windows

Na prośbę użytkownika TLC sprawdzono wyskakujące okna konsoli. Własny launcher usługi, FFmpeg i skrypty odbioru miały już `windowsHide:true`. Playwright 1.63.0 domyślnie wybierał `chrome-headless-shell.exe`: lokalny plik ma PE subsystem 3 (konsola), a wewnętrzne wywołanie `spawn` Playwright nie ustawia `windowsHide`. Pełny bundlowany `chrome.exe` ma subsystem 2 (GUI).

W [render.ts](C:/Projects/nwn-vfx/apps/service/src/render.ts:37) dodano `channel:'chromium'` wyłącznie na Windows, zachowując `headless:true`, argumenty SwiftShader, obsługę błędów, anulowanie i cleanup. To [publicznie wspierany tryb Playwright](https://playwright.dev/docs/browsers#chromium-new-headless-mode); nie zmieniano zależności ani `node_modules`. Wymagana jest instalacja `playwright install chromium`, a nie samo `--only-shell`. Uzupełniono także brak `windowsHide` w teście generatora kontraktów. API, dokumenty oraz reguły WebMCP pozostają takie jak w 0.5.0.

Zmiana usuwa uruchamianie konkretnego konsolowego pliku renderera. Nie wykonano obserwacji wszystkich okien desktopu; nie stanowi to deklaracji, że każdy zewnętrzny skrypt użytkownika lub innego projektu ma już wyłączone okna. Agent TLC osobno poprawił swoje wrappery PowerShell. Okna NWN i Toolset nie były modyfikowane.

## Weryfikacja

- **Build i 145/145 testów unit/integration: PASS.** Istniejący test diagnostyki sprawdza także właściwy kanał, `headless` i argumenty. [Build](C:/Projects/nwn-vfx/output/headless-051/build.log), [testy](C:/Projects/nwn-vfx/output/headless-051/unit.log).
- **Izolowana próba obu trybów: PASS.** Kierunkowy emiter z grawitacją świata oraz scena 32 warstw/3 tekstur dały identyczne bajtowo PNG i zero różnic RGBA. Nowy tryb wygenerował WebM 24 klatki/0,8 s z poprawnymi PTS; wszystkie 17 obserwowanych procesów zostało zakończonych, port 14359 zwolniony. [Raport](C:/Projects/nwn-vfx/output/playwright/headless-channel-check/report.json).
- **Zainstalowany CLI z katalogu TLC: PASS.** Własny projekt `4cda8d76-439e-4560-b527-5721b1de7651` r4: PNG jest identyczny bajtowo z 0.5.0, WebM ma 60 klatek/2 s/30 fps, maksymalny błąd PTS względem `k/30` wynosi 0,334 ms. Zdekodowane RGB klatek 9/18/27 są identyczne z filmem 0.5.0. [Raport](C:/Projects/nwn-vfx/output/headless-051/installed/report.json).

Prawidłowe porównanie dwóch wersji renderera nie rozwiązuje wcześniejszej utraty koloru drobnych cząstek podczas PNG → WebM/YUV420. Ścisły odbiór tej jakości pozostaje **FAIL**, zgodnie z [raportem 0.5.0](C:/Projects/nwn-vfx/docs/releases/0.5.0/acceptance.md). `nativeVerified:false`; żadnego testu NWN nie wykonano.

## Zainstalowana paczka

[nwn-vfx-studio-0.5.1.tgz](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.5.1.tgz), 1014999 B, SHA-256 `2e881530ce0330ba7eb9ea7fb73efdea9df540b18505c391491707864cdf8df4`. Klient i uruchomiona usługa zgłaszają 0.5.1. Zachowano instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057` oraz workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`.

Restart odbył się w uzgodnionym z agentem TLC oknie, po potwierdzeniu braku zadań. Wszystkie **14 projektów było identycznych** przed/po instalacji; w testach renderowano wyłącznie własny projekt, bez zapisów dokumentów. [Przed](C:/Projects/nwn-vfx/output/headless-051/projects-before-install.json), [po](C:/Projects/nwn-vfx/output/headless-051/projects-after-install.json). Konsument otrzymał sygnał gotowości przed kolejnym renderem r10.

Skill w źródłach, globalnej paczce i katalogu użytkownika ma SHA-256 `6c25df1abf0ed5ea21a1d22ab2211fbbe58831947b10cf4d5cb16317cc42f82a`; walidator przeszedł. Pełny odbiór orientacji i rzeczywistego WebMCP jest zachowany w [raporcie 0.5.0](C:/Projects/nwn-vfx/docs/releases/0.5.0/acceptance.md).
