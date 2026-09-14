# Studio 0.5.0 — kierunek emisji i wspólna praca człowieka oraz AI

Zlecenie **TLC-WYROK-STUDIO-06** dodaje dowolną statyczną orientację emitera. Efekt można budować od pustego projektu, łącząc emitery, własne PNG, geometrię i klatki animacji. Operacje UI, CLI oraz WebMCP zapisują ten sam dokument i historię. Presety są punktami startowymi, nie zamkniętym katalogiem efektów.

## Zrealizowany zakres

- `orientation:[axisX,axisY,axisZ,angleRadians]` obraca lokalną prędkość emisji +Z. Oś musi być jednostkowa; kąt jest w zakresie ±8π. Pozycja emitera i grawitacja w osi Z świata nie obracają się.
- Brak pola zachowuje dokładnie wcześniejszą symulację. `orientation:null` usuwa opcjonalne pole emitera. Jawna orientacja promuje dokument do wersji 4; kolejne operacje, także import tekstury, nie obniżają wersji.
- UI udostępnia sześć kierunków osi, dowolną oś i kąt oraz jawne zastosowanie po normalizacji. Niezastosowany tekst jest częścią kontekstu karty `meshEditorDrafts[layerId].orientation`; blokuje zapis i zmianę projektu, pozostaje dostępny do odrzucenia również po blokadzie warstwy.
- Wspólne operacje zapewniają walidację, prawa agenta, blokady, pauzę AI, historię, idempotencję i selektywne cofanie. Opóźnione odpowiedzi zapisu, importu i zmiany projektu zachowują późniejsze edycje człowieka.
- PNG i WebM korzystają z tego samego obrotu. Eksporter zapisuje orientację węzła emitera, pozostawiając neutralnego rodzica; odczyt MDL sprawdza obrót, flagi przestrzeni świata oraz niezmienione parametry fizyki.

Formuła podglądu: `position + scale * (R * localVelocity * age + [0,0,-.5*gravity*age²])`. Dotychczasowa skala obejmuje całe przemieszczenie, także grawitację. Statyczny obrót nie oznacza obsługi animowanej orientacji emitera.

## Kryteria i wyniki

| Kryterium | Wynik i dowód |
|---|---|
| Build, kontrakty, stare dokumenty, uprawnienia, undo, MDL | **PASS**, build oraz 145/145 unit/integration. [Build](C:/Projects/nwn-vfx/output/orientation-050/build.log), [testy](C:/Projects/nwn-vfx/output/orientation-050/unit.log). |
| Sześć osi, grawitacja świata, neutralność, edycje podczas odpowiedzi | **PASS**, nowy test przeglądarkowy orientacji; błąd prostopadły projekcji osi <0,83 px, grawitacji 0,36 px; neutralne obrazy identyczne. [Raport](C:/Projects/nwn-vfx/output/playwright/orientation-acceptance/acceptance.json). |
| Regresja cząstek, zapisu, WebMCP, własnych tekstur | **PASS**, 4 testy regresji oraz 1 test tekstur. WebMCP w tych automatycznych testach ma jawną atrapę rejestracji; nie jest dowodem transportu przeglądarki. [Regresja](C:/Projects/nwn-vfx/output/orientation-050/browser-regression.log), [tekstury](C:/Projects/nwn-vfx/output/orientation-050/browser-textures.log). |
| Zainstalowany CLI z katalogu TLC | **PASS**, osobny projekt `4cda8d76-439e-4560-b527-5721b1de7651`, r4; trzy emitery +Z/+X/+Y, PNG w 0,3/0,6/0,9 s, WebM, MDL i HAK tej samej rewizji. Legacy PNG i jawny neutralny PNG mają identyczny SHA-256. [Raport](C:/Projects/nwn-vfx/output/orientation-050/installed/report.json). |
| Rzeczywisty WebMCP karty | **PASS**, 38 odkrytych narzędzi, utworzenie osobnego projektu, zmiana orientacji +X do r2/schema4, sterowanie zaznaczeniem/czasem, PNG, odczyt bajtów i manifestu, pełny SHA-256 i długość zgodne. [Raport](C:/Projects/nwn-vfx/output/orientation-050/live-webmcp/report.json). |
| Ochrona człowieka przez rzeczywisty WebMCP | **PASS**, `VALIDATION_ERROR`, `DRAFT_CONFLICT`, `REVISION_CONFLICT`, `LOCKED`, `AI_PAUSED`; po odłączeniu `WEBMCP_NOT_CONNECTED`. Własny projekt testowy pozostawiono czysty w r4, bez blokad i pauzy; grant odwołano. |
| Oś czasu filmu | **PASS**, zainstalowany renderer: 60 klatek, 2 s, 30 fps, maksymalny odstęp PTS 34 ms. Test przeglądarkowy osobno: 24 klatki/0,8 s i trzy fazy zgodne pozycyjnie. |
| Pełna zgodność obrazu PNG/WebM drobnych kolorowych cząstek | **FAIL** przy zachowanych progach. Szczegóły poniżej. |
| Potwierdzenie w NWN/Toolset | **NIE WYKONANO**, `nativeVerified:false`, `nativeTestAvailable:false`. |

## Granica jakości WebM

Niezależny odbiór filmu trzech osi nie przeszedł progu MAE 8/255 dla pikseli efektu: wynik 18,90–19,67. Luminancyjny SSIM wyniósł 0,9796–0,9864. Kontrola PNG → YUV420p → RGB bez kodowania daje już MAE 16,11–17,15; porównanie filmu do tej kontroli daje 5,55–7,82. To wskazuje, że głównym źródłem różnicy jest redukcja rozdzielczości koloru w YUV420 przy cząstkach szerokości 1–2 px.

Osobny pomiar centroidów kolorów, z wcześniej ustalonym progiem 1,5 px na oś i minimum 20 pikseli, przeszedł dla pomarańczowego +Z i cyjanowego +X we wszystkich trzech fazach. Magenta +Y przekroczyła próg w 0,6 i 0,9 s (maks. |dx| 1,901 px, |dy| 1,627 px). Klasyfikacja magenty jest zanieczyszczona rozmytym kolorem innych grup; nie traktujemy tego wyjaśnienia jako wyniku PASS. Oględziny PNG i dekodowanej klatki pokazują zachowane trzy kierunki i słabszy kolor drobnych cząstek. Nie zmieniono progów, enkodera ani danych konsumenta w celu przejścia testu.

[Pełny raport filmu](C:/Projects/nwn-vfx/output/orientation-050/video-proof/run-O1sZ1Y/report.json), [kontrola YUV420](C:/Projects/nwn-vfx/output/orientation-050/video-proof/run-O1sZ1Y/chroma-diagnostic.json), [pomiar kierunków i faz](C:/Projects/nwn-vfx/output/orientation-050/video-proof/run-O1sZ1Y/direction-phase.json), [MDL/HAK](C:/Projects/nwn-vfx/output/orientation-050/video-proof/run-O1sZ1Y/candidate-readback.json).

## Instalacja i zachowanie pracy użytkownika

Globalnie zainstalowano **0.5.0**. [Paczka](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.5.0.tgz): 1014543 B, SHA-256 `71a8d56f3c7e825475e80d6aa6d91265f9bc59776622957ba2988f81ca5f6c0c`. Zachowano instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057` i workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`; `doctor` potwierdza gotowe API/bazę/renderer i klienta 0.5.0.

Wszystkie 12 projektów miało identyczną zawartość przed/po instalacji. Testy funkcjonalne następnie tworzyły własne dwa projekty; nie edytowały `tlc-wyrok`. Późniejsze rewizje Wyroku należą do konsumenta. [Przed](C:/Projects/nwn-vfx/output/orientation-050/projects-before-install.json), [po](C:/Projects/nwn-vfx/output/orientation-050/projects-after-install.json).

Oryginalna karta Fiolki nie była przeładowana, zapisana ani zamknięta. Po próbie WebMCP nadal miała niezapisany szkic czterech warstw oraz zaznaczone „Iskry 4” z liczbą 70.

Skill w źródłach, globalnej paczce i katalogu użytkownika ma zgodny SHA-256 `00871f647f59f5922130c6a4e5bf888755c2a847da42ae61017d3cb2d8882ab7`; walidator skilla przeszedł. API envelope pozostaje 0.1.0, dokumenty mają wersje 1–4. Pełne przykłady są w [dokumencie orientacji](C:/Projects/nwn-vfx/docs/agents/emitter-orientation.md) i [skillu](C:/Projects/nwn-vfx/skills/nwn-vfx/SKILL.md).

## Przykład dla agenta konsumenta

Po odczytaniu ID warstwy i aktualnej rewizji zapisz propozycję w pliku zmian, następnie wykonaj `changes preview` i `changes apply` ze stabilnym kluczem idempotencji:

```json
[{"type":"layer.set","layerId":"actual-emitter-id","values":{"orientation":[0,1,0,1.5707963267948966]}}]
```

To kierunek +X; +Y to `[1,0,0,-1.5707963267948966]`, a usunięcie obrotu to `orientation:null`. WebMCP używa `studio.changes.apply({viewSessionId,input:{projectId,expectedRevision,changes},idempotencyKey})` według odkrytego schematu. Agent nie usuwa blokad człowieka, nie nadpisuje szkicu i nie zastępuje testu NWN raportem eksportera.

Otwarte ograniczenia produktu: jakość koloru drobnych cząstek w WebM/YUV420, światła i wstęgi, animowana orientacja emitera, ogólny import MDL/FBX oraz kwalifikacja natywnej fizyki i wyglądu NWN. Gotowość techniczna orientacji i sterowania agentem nie oznacza zakończenia tych obszarów.
