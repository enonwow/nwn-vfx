# Studio 0.3.1 — cząstki i czas filmu

Zlecenia konsumenta **TLC-WYROK-STUDIO-02** i **TLC-WYROK-STUDIO-03**, 2026-09-05. Dokumenty efektów i kontrakty operacji pozostają kompatybilne z 0.3.0.

## Cząstki: poprawka i dowody

Smoke i glow używały `smoothstep` z odwróconymi granicami. Wynik takiego wywołania jest niezdefiniowany według [specyfikacji GLSL](https://raw.githubusercontent.com/KhronosGroup/OpenGL-Refpages/main/gl4/smoothstep.xml). Maski mają teraz rosnące granice i odwrócony wynik: `(1.-smoothstep(.15,1.,r+n))*.48` oraz `exp(-r*r*4.)*(1.-smoothstep(.65,1.,r))`.

`THREE.Color` dostarcza shaderowi liniowe RGB, które wcześniej trafiało prosto na canvas. Dodano standardowe fragmenty Three w tej samej kolejności co MeshBasicMaterial: tone mapping, konwersja wyjściowa, opcjonalne premnożenie alpha. Renderer jawnie wybiera sRGB i NoToneMapping. Nie dodano konwersji na CPU ani kompensacji per efekt. Alpha pozostaje liniowa; materiał jest niepremnożony, smoke używa NormalBlending, spark/glow AdditiveBlending. Odpowiada to [zarządzaniu kolorem Three.js](https://threejs.org/manual/en/color-management.html).

Na użytym SwiftShader stare smoke/glow były widoczne, ale miały przyciemnione i przekłamane barwy. Odbiór nie twierdzi, że zawsze znikały na każdym sterowniku. Poprawione kolorowe cząstki mogą być jaśniejsze przy tych samych zapisanych parametrach.

Kontrola to pojedyncza nieruchoma cząstka o kolorze `#ff8040`, alpha 1 i stałym rozmiarze. Niezależny odczyt PNG porównuje kanały z oczekiwanym kolorem sRGB i właściwym równaniem mieszania na osobno wyrenderowanym tle:

| Próba | Wynik |
| --- | --- |
| Smoke, środek | RGB **[131,74,48]**, oczekiwane [130.72,73.92,47.88] |
| Glow, środek | RGB **[255,152,97]**, additive zgodne z kolorem i tłem |
| Spark, środek | RGB **[255,150,96]**, uwzględnia maskę radialną |
| Maski trzech typów | Środek mocniejszy od połowy promienia; brzeg wraca do tła |
| Alpha 0 trzech typów | Każdy piksel identyczny z tłem |
| Powtórzona klatka | Identyczna pikselowo |
| Smoke/glow w produkcyjnym UI | Identyczne pikselowo z headless przy tej samej kamerze, czasie i canvas 960×640 |
| Biała iskra przed/po zmianie | Cały PNG identyczny bajtowo, SHA-256 `6ec5b314407544f5115a5faf0affc985b496b78416a13e30411a45b8f77b5c95` |
| CLI uruchomione z TLC | PNG smoke identyczny z kontrolą bezpośredniego renderera; SHA-256 `08218579dcede3c170ce44d09f672f3f9b9499a9d769da02a03852b3bdf793e3` |

Obejrzano kontrolne PNG smoke/glow przed i po zmianie oraz domyślną cewkę. Pliki:

- [Raport testu pikseli i UI](C:/Projects/nwn-vfx/output/particles-acceptance/report.json).
- Smoke: [przed](C:/Projects/nwn-vfx/output/particles-before/single-smoke.png), [po](C:/Projects/nwn-vfx/output/particles-after/single-smoke.png).
- Glow: [przed](C:/Projects/nwn-vfx/output/particles-before/single-glow.png), [po](C:/Projects/nwn-vfx/output/particles-after/single-glow.png).
- Domyślna cewka: [przed](C:/Projects/nwn-vfx/output/particles-before/default-coil.png), [po](C:/Projects/nwn-vfx/output/particles-after/default-coil.png).
- [PNG z CLI](C:/Projects/nwn-vfx/output/particles-after/cli-smoke.png) i [job](C:/Projects/nwn-vfx/output/particles-after/cli-render-job.json).

## WebM: przyczyna i rozwiązanie

W dostarczonym `preview/r2/wyrok.webm` niezależny ffprobe potwierdził **74 klatki i maksymalną lukę PTS 1.117 s**, od 0.388 do 1.505 s. To pomijało uderzenie zaplanowane na 0.84 s. Poprawny nagłówek/długość filmu nie były wystarczającym kryterium odbioru. [Odczyt starego filmu](C:/Projects/nwn-vfx/output/particles-old-video-pts.json).

Usunięto rejestrację MediaRecorder opartą o `performance.now()`. Usługa ustawia dokument raz i renderuje dokładnie `ceil(duration*30)` klatek w chwilach `k/30`. PNG trafiają kolejno przez image2pipe do FFmpeg z wejściowym framerate 30; wolne renderowanie i oczekiwanie na encoder nie zmieniają czasu filmu. Wynik VP9 powstaje w prywatnym pliku tymczasowym, umożliwiając zapis długości i indeksu przewijania; po odczycie plik jest usuwany. Próbkowanie obrazów i ich framerate opisuje [dokumentacja FFmpeg](https://ffmpeg.org/ffmpeg-formats.html#image2).

## Kwalifikacja filmu konsumenta

Na odczytanym dokumencie `tlc-wyrok`, rewizja **3**, 25 warstw i 3.6 s, wygenerowano nowy film w izolowanej instancji. Snapshot SHA-256: `b8f460a515fa496aa73c6e8ae9735f3babff62c97791a9cec7e15e28c84343de`. Nie tworzono rewizji ani joba w projekcie konsumenta.

Pierwszy przebieg: **108 klatek**, początek PTS 0, dokładna długość **3.6 s**, największy odstęp **0.034 s**. Każdy PTS odpowiada `index/30` z milisekundowym zaokrągleniem WebM. Klatki 18/25/28/43 porównano z osobnymi PNG z czasu 0.600/0.833/0.933/1.433 s. Średni bezwzględny błąd kanału RGB wyniósł 1.085–1.112 na skali 0–255; w obszarze efektu 1.168–1.234. Wszystkie próbki różnią się między sobą.

Obejrzano wyodrębnione klatki: 0.600 s pokazuje miecz w powietrzu, 0.833 s moment tuż przed zaplanowanym strike 0.84, 0.933 s impakt, a 1.433 s kamienie i fazę po uderzeniu. Różnica nominalnego czasu próbki od najbliższej klatki jest mniejsza niż 1/30 s. Cała kwalifikacja wraz z dodatkowymi PNG i dekodowaniem trwała 15.8 s.

[Raport pierwszego przebiegu](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-1HMDLO/report.json), [ffprobe](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-1HMDLO/ffprobe.json), [WebM](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-1HMDLO/wyrok-r3.webm). SHA-256 filmu: `56061a968fcaf13e99fcc2c345d0007a07d9abec9bbdc20d760249ddee0e104e`.

Końcowy przebieg po poprawieniu ścieżek awarii powtórzył cały odbiór i dodał klatkę 26, PTS **0.867 s**, tuż po uderzeniu. Ona również pokazuje impakt i odpowiada PNG (MAE 1.106, ROI 1.220). [Końcowy raport](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-iUCXa7/report.json), [WebM](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-iUCXa7/wyrok-r3.webm), [ffprobe](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-iUCXa7/ffprobe.json), [impakt 0.867 s](C:/Projects/nwn-vfx/output/video-wyrok-acceptance/run-iUCXa7/0-86-video.png). Nadal 108 klatek i max gap 34 ms. SHA-256 końcowego filmu: `9c83d40a351fcead4bf36bcd62df8dfdb168f6b989f3db9c5d6fd3978f38489b`.

## Testy i instalacja

Końcowy `npm run build` przeszedł, `npm test`: **77/77**, `npm run test:browser`: **7/7**. Test wideo obejmuje wszystkie PTS i obrazy faz, nie tylko istnienie pliku. Dokument 1.61 s daje 49 klatek i 1.633 s filmu; celowo wolny producent 12 klatek nadal daje 0.4 s. Przeszły także brak executable, synchroniczny błąd spawn, zakończenie procesu podczas tworzenia klatki, diagnostyka zamkniętego pipe i anulowanie. Obsługa awarii zachowuje przyczynę błędu i sprząta własny plik tymczasowy.

Logi: [build](C:/Projects/nwn-vfx/output/particles-final-build.log), [unit/integration](C:/Projects/nwn-vfx/output/particles-final-unit.log), [przeglądarka](C:/Projects/nwn-vfx/output/particles-final-browser.log), [kontrola rzeczywistego filmu](C:/Projects/nwn-vfx/output/video-wyrok-final.log), [test wideo](C:/Projects/nwn-vfx/output/playwright/video-acceptance/acceptance.json).

Zainstalowano globalnie [paczkę 0.3.1](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.3.1.tgz) bez dowiązania do repo. SHA-256 paczki: `a149ea32c2a14565d187387902fedc63dd78d28ae35169e38e10567cfb2dd335`. [Manifest](C:/Projects/nwn-vfx/docs/releases/0.3.1/source-manifest.json) obejmuje 69 plików źródłowych. Zaktualizowane źródłowy, zainstalowany i spakowany skill są identyczne (SHA-256 `d8035fdb8eb4ca4e482ce9484a6ada2ccd54450d536bd4187e3635edab44bdc2`); źródłowy i zainstalowany przeszły walidację.

Usługę na porcie 4317 zatrzymano przez uwierzytelnione polecenie i uruchomiono po aktualizacji. CLI wywołane z katalogu TLC potwierdziło 0.3.1, instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057` i workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`. Dostępny tutaj FFmpeg ma wersję 9.0.1. Używany renderer testowy to Chromium headless / ANGLE SwiftShader.

## Rzeczywisty WebMCP po instalacji

W osobnej karcie przeglądarki Codex podłączono ograniczony grant do własnego projektu kontrolnego „Próba własnego VFX — kryształ i fala”, ID `8be9fb93-693d-4263-8a01-d0ea4d209d33`, rewizja 5. Rzeczywiste narzędzia WebMCP potwierdziły wersję 0.3.1, uruchomiły `studio.preview.request` i odczytały zakończony job `a5e2f421-cf11-4d5a-b6b9-51a452b4419b` przez `studio.jobs.get`. Metadata zawiera `rendererVersion:0.3.1` i stałe próbkowanie 30 FPS.

`studio.artifacts.read` odebrało cały WebM, artefakt `9565713f-9dde-4b9e-865e-a91ff26872bf`, 113606 bajtów, `nextOffset:null`. SHA-256 obliczone z odebranych bajtów zgadza się z metadanymi: `dd3f0a3d199ed5c8f6d80db73945a9c2d5b5626c24559589919e9034760b1ae2`. Zainstalowany CLI uruchomiony z katalogu TLC pobrał ten sam artefakt i ponownie zweryfikował hash. Niezależny ffprobe potwierdził **90 klatek, 3.000 s i max gap 34 ms**. [Raport](C:/Projects/nwn-vfx/output/particles-live-webmcp/report.json), [job](C:/Projects/nwn-vfx/output/particles-live-webmcp/job.json), [ffprobe](C:/Projects/nwn-vfx/output/particles-live-webmcp/ffprobe.json), [WebM](C:/Projects/nwn-vfx/output/particles-live-webmcp/preview.webm).

Po teście odłączono grant; `studio.connection.inspect` zwraca `WEBMCP_NOT_CONNECTED`. Wszystkie 7 istniejących projektów miało identyczne dokumenty przed i po aktualizacji. Końcowy odczyt oryginalnej karty potwierdził nadal „Fiolka alchemiczna” i „Niezapisane zmiany”; nie przeładowywano jej ani nie zapisywano szkicu.

## Wymagania i granice

WebM wymaga dostępnego FFmpeg z `libvpx-vp9`; można wskazać executable przez `NWN_VFX_FFMPEG`. Brak programu kończy job czytelnym `RENDERER_UNAVAILABLE`, bez powrotu do wadliwego nagrywania czasu rzeczywistego. PNG nadal wymaga wyłącznie Chromium. Nowe nagranie może powstawać dłużej niż trwa efekt. Film ma 30 FPS, a długość jest zaokrąglana w górę do pełnej klatki; VP9/yuv420p jest kompresją stratną.

`nativeVerified:false`. Korekta dotyczy podglądu Studio; zachowanie cząstek, materiałów i animacji w NWN wymaga osobnej kwalifikacji. Nie uruchamiano gry/Toolsetu. Nie zmieniano dokumentu `tlc-wyrok`; do kwalifikacji użyto odczytanego snapshotu rewizji 3. Nie przeładowywano niezapisanego szkicu fiolki.

Końcowy callback obejmujący oba zlecenia, instalację 0.3.1, wyniki i ścieżki dowodów wysłano do zadania konsumenta `01a070e3-5df3-7913-943f-854ac8ea98ee` z prośbą o kontynuację oceny wizualnej i finalnego podglądu. Odbiór techniczny nie stanowi zatwierdzenia artystycznego.
