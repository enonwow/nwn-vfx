# Studio 0.4.2 — diagnostyka i odbiór teksturowanego WebM

Zlecenie **TLC-WYROK-STUDIO-05**. Po pięciu udanych PNG konsument dostał błąd WebM `RENDERER_UNAVAILABLE` sugerujący brak Chromium. Job `f45d4ed9-448f-442d-ab57-f370640a0424` zakończył się po 33,436 s. Kod 0.4.1 zastępował każdy wyjątek z `chromium.launch` identycznym komunikatem i nie zachowywał przyczyny w jobie. Ten konkretny tekst powstawał przed otwarciem strony i przetwarzaniem tekstur.

## Ustalenie przyczyny i zakres poprawki

Historyczny wyjątek został utracony. Sam czas awarii nie wystarcza do przypisania timeoutu, przeciążenia, awarii enkodera ani braku instalacji. Bezpośredni test tego samego zainstalowanego Chromium 153.0.8010.12 i `/render` przeszedł w 0,997 s. Powtórny WebM dokładnie tej samej r7, nadal na 0.4.1, zakończył się w 20,567 s: job `416ef59f-b54c-4273-98f5-7a4da1a63887`. Film ma 301605 B i SHA-256 `8684460c917f538ea8797955a7d936b6f8248c7bca0fd5c4e5e0c2effbfd9070`. Awarii nie odtworzono.

0.4.2 rozróżnia brak pliku wykonywalnego, timeout startu i inną awarię uruchomienia Chromium. Kolejne etapy renderowania zachowują ograniczoną przyczynę, numer/czas klatki, błędy strony oraz osobny błąd sprzątania. Cleanup przeglądarki i pliku enkodera nie zastępuje pierwotnego błędu. Worker zapisuje szczegóły w jobie; zamknięty schemat API przekazuje je przez wspólne operacje CLI/WebMCP. Dane obrazu, poświadczenia, stosy i pełne ścieżki nie są publikowane w diagnostyce.

Nie zmieniono parametrów r7 ani algorytmu renderowania tekstur, jakości VP9, timeoutów lub próbkowania `k/30`. Scena tworzy trzy tekstury przy ustawieniu dokumentu i używa ich na wielu warstwach. Strona `/render` nie utrzymuje pętli odtwarzania po wykonaniu żądania. Nie wprowadzono zewnętrznego sposobu produkcji filmu.

## Metoda odbioru

Powtarzalny test ma 32 warstwy i trzy własne PNG 1024/512/512, pięć podglądów PNG, a następnie 120 klatek WebM. Sprawdza rzeczywiste PTS, brak kolejnych alokacji tekstur/buforów pomiędzy klatkami, bezczynność zakończonej strony i zgodność faz ruchu.

Rzeczywista r7 projektu `tlc-wyrok` ma 22 siatki i 10 emiterów, czas 4 s, snapshot `cf2b30706fabfbd17c199be002b45c32def66615257b5fa4a4c8fd94c9589b5e`. Skrypt `scripts/accept-video-installed.ts` renderuje wyłącznie podaną zapisaną rewizję przez zainstalowany CLI uruchomiony z katalogu TLC. Pobiera artefakty ze sprawdzeniem SHA-256 i porównuje dokument przed/po.

PNG do pomiarów powstają dokładnie przy czasach klatek 18/30, 26/30, 35/30, 54/30 i 110/30. Oryginalne fazy konsumenta .88, 1.18 i 3.65 s nie leżą na siatce 30 fps; nie są traktowane jako identyczny moment do porównania pikseli. Dodatkowy PNG w 4 s dostarcza pustą scenę do maski efektu.

Niezależny `scripts/verify-textured-video.ts` odczytuje 120 PTS przez ffprobe, sprawdza 4 s/30 fps/maksymalnie 34 ms, weryfikuje SHA-256 i pochodzenie handoffów oraz dekoduje klatki po indeksie. Mierzy błąd całego obrazu, obszaru miecza, obszaru uderzenia i samego efektu względem pustej sceny. Progi i definicja SSIM są zapisane jawnie w raporcie. Kontrola negatywna z pustym PNG zamiast miecza jest odrzucana mimo niskiego błędu całego kadru.

## Granice

Odbiór potwierdza techniczną kompletność filmu i wybrane fazy wizualne. Nie ustala artystycznej jakości efektu ani natywnego wyglądu w NWN: `nativeVerified:false`. Historycznej przyczyny pierwszej awarii nie można odzyskać. Oryginalna karta z niezapisanym szkicem Fiolki nie jest odświeżana ani zapisywana. Równoległa r8 konsumenta pozostaje jego pracą.

## Zainstalowane wydanie

Globalna paczka [nwn-vfx-studio-0.4.2.tgz](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.4.2.tgz) ma 930668 B, SHA-256 `45c1f497d9d3c317322087a0bb3a0f54a497e568d9791bef1ce2a630eb3a2d6d`. Klient, uruchomiona usługa i handoffy renderów potwierdzają 0.4.2. Zachowano instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057` i workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`. Skill w repozytorium, paczce i katalogu użytkownika ma zgodny SHA-256 `79cf47dcd3d2a2172ecdf73a493577451748dab498e85245439ce7eddb5895c0`; walidator skilla przeszedł z PyYAML w osobnym katalogu testowym.

Build i **131/131 testów unit/integration** przeszły, w tym 12 testów diagnostyki. Dwa testy przeglądarkowe filmu przeszły: istniejący test wolnej produkcji klatek oraz nowy test 32 warstw z teksturami. Nowy test zmierzył trzy przesłania tekstur zasobów na całą scenę, stałe 7 obiektów tekstur i 102 buforów od pierwszej do ostatniej klatki, zmieniające się dane cząstek oraz brak pracy strony po ostatnim renderze. [Build](C:/Projects/nwn-vfx/output/tlc-video-r7/build-042.log), [testy](C:/Projects/nwn-vfx/output/tlc-video-r7/unit-042.log), [testy przeglądarkowe](C:/Projects/nwn-vfx/output/tlc-video-r7/browser-video-042.log), [raport zasobów GPU](C:/Projects/nwn-vfx/output/playwright/textured-video-acceptance/acceptance.json).

Przed restartem potwierdzono brak aktywnych zadań; konsument ukończył już r8. Wszystkie **12 zapisanych projektów** było identycznych przed/po instalacji: [przed](C:/Projects/nwn-vfx/output/tlc-video-r7/projects-before-install.json), [po](C:/Projects/nwn-vfx/output/tlc-video-r7/projects-after-install.json). Karta Fiolki po restarcie nadal miała „Niezapisane zmiany”, zaznaczenie „Iskry 4” i 70 cząstek; nie była zapisywana, zamykana ani przeładowywana.

Zainstalowany CLI uruchomiony z katalogu TLC wyrenderował r7 w **16,671 s**. Job `ec505545-10c2-45d8-a913-3a143e7c47b0`, artefakt `c277492a-46a4-4fc8-a48b-7fdec3d7ef0e`, 301605 B, SHA-256 `f51b31cbc1682a2be310e07a023d850bbc2c0b7cd9e90a7fcf53ea9aff36d3d7`. Wszystkie pięć dokładnych PNG i pusty kadr także zakończyły się powodzeniem, z tym samym snapshotem i wersją renderera. [Film](C:/Projects/nwn-vfx/output/tlc-video-r7/installed-042/video.webm), [handoff](C:/Projects/nwn-vfx/output/tlc-video-r7/installed-042/video.handoff.json), [raport renderów](C:/Projects/nwn-vfx/output/tlc-video-r7/installed-042/render-report.json).

Niezależny końcowy odbiór: **PASS**, 120 klatek / 4,000 s / 30 fps, maksymalny odstęp PTS 34 ms, maksymalny błąd PTS względem `k/30` 0,333 ms. Wszystkie hashe plików, pochodzenie r7, kamera, rozdzielczość i wersja handoffów są zgodne. Pełny obraz: MAE 1,036–1,278/255. Obszary ostrza i uderzenia: MAE maks. 2,363/255, SSIM min. 0,9723. Sam efekt: MAE 2,872–4,972/255, SSIM min. 0,9491, p95 maks. 12,667/255. Kadr końcowy ma zero pikseli efektu. Obejrzano PNG pyłu oraz wyciągniętą z filmu klatkę 35; obie zachowują miecz, falę i strukturę pyłu. [Raport pełnego odbioru](C:/Projects/nwn-vfx/output/textured-video-proof/run-TbWEvr/report.json).
