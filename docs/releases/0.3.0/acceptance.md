# NWN VFX Studio 0.3.0 — własna geometria i animacja

Odbiór zamówienia **TLC-WYROK-STUDIO-01**, 2026-09-05. Funkcje są ogólne: nazwa efektu nie steruje aplikacją. Miecz w przykładzie jest sceną kontrolną funkcji; nie stanowi zatwierdzonego artystycznie efektu „Wyrok”.

## Dostarczone funkcje

- Warstwa `mesh`: prostopadłościan, pierścień/dysk oraz własne wierzchołki i trójkąty. Wspólny generator dla podglądu i eksportu.
- Klucze pozycji, orientacji, jednorodnej skali i alpha, lokalne względem startu warstwy. Liniowa interpolacja skalarów/wektorów i najkrótsza ścieżka SLERP obrotu. Deterministyczne przewijanie i wspólna oś czasu z emiterami.
- Edytor kształtu, parametrów, tabel kluczy oraz własnego JSON. Niezastosowany JSON pozostaje w szkicu, także po zmianie zaznaczenia, i jest widoczny dla WebMCP w `meshEditorDrafts`. Niepoprawne skrócenie czasu efektu zachowuje poprzedni poprawny dokument.
- Te same `layer.add` i `layer.set` przez UI, CLI i WebMCP. Schemat dokumentu 1 nadal działa; dodanie mesh promuje go do 2. Warianty, historia, zapis, restart, selektywne cofanie, blokady i konflikt rewizji obejmują nowe pola. `geometry` i `animation` są atomowymi polami zmiany i blokady.
- Rzeczywiste `trimesh` i kontrolery `positionkey`, `orientationkey`, `scalekey`, `alphakey` w ASCII MDL. HAK zawiera te same bajty modelu. Niezależny odczyt `validation.json → readback.meshes` sprawdza geometrię i klucze.
- Zaktualizowane capabilities, wspólne schematy, statyczne walidatory przeglądarkowe i przenośny skill dla agentów innych projektów.

## Testy

| Kontrola | Wynik |
| --- | --- |
| `npm run build` | Typy, walidatory AOT, frontend, backend i CLI: poprawnie |
| `npm test` | **77/77**; obejmuje regresję 0.2, geometrię, interpolację, błędy danych, zapis/restart, konflikty, cofanie i niezależny odczyt MDL/HAK |
| `npm run test:browser` | **5/5**; produkcyjny frontend, prawdziwy backend, edycja trzech rodzajów geometrii i czterech kanałów, zachowanie szkicu, blokady, wyścigi zapisu i eksport |
| Duży projekt | Eksport/import własnego ZIP oraz formatowanego JSON powyżej starego limitu 2 MiB, zgodność dokumentów |
| Bardzo bliskie klucze czasu | Rozróżnialne klucze float32 z odstępem poniżej 1 ns zachowane i odczytane poprawnie |
| CLI konsumenta | Zbudowany klient uruchomiony z `C:\Projects\the last city`, ograniczony aktor, prawdziwy renderer Chromium i pobieranie plików z SHA-256 |

Logi: [build](C:/Projects/nwn-vfx/output/mesh-build.log), [testy](C:/Projects/nwn-vfx/output/mesh-tests.log), [przeglądarka](C:/Projects/nwn-vfx/output/mesh-browser-tests.log), [artefakty](C:/Projects/nwn-vfx/output/mesh-artifact-test.log).

Test automatyczny WebMCP używa jawnego mocka wyłącznie rejestracji API hosta. Rzeczywista próba hosta jest odrębnym odbiorem opisanym poniżej.

## Artefakty tej samej rewizji

Izolowana instancja odbiorowa działała na porcie 14335; po próbie zamknięto ją i cofnięto aktora. Zachowano dowody w `output/mesh-acceptance/run-w4p0IU`. Projekt `42aa0709-ca80-4093-93b1-4133cd591e71`, rewizja **2**, schemat dokumentu **2**. Wszystkie handoffy podglądów i buildu wskazują snapshot SHA-256 `89411a65393d27bf0f68f73e2499d4de67f12fd672d6a787a7d8ab80d99e8588`.

- [Przed uderzeniem, 0.2 s](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/before.png), 46 757 bajtów.
- [Uderzenie, 0.8 s](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/impact.png), 49 349 bajtów.
- [Wygaszenie, 1.8 s](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/after.png), 46 518 bajtów.
- [Cała animacja WebM](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/timeline.webm), 120 261 bajtów.
- [MDL](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/vfxd76d5104b003.mdl), [HAK](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/vfxd76d5104b003.hak), [ZIP](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/candidate.zip), [walidacja](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/validation.json), [handoff](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/handoff.json), [pełny raport](C:/Projects/nwn-vfx/output/mesh-acceptance/run-w4p0IU/acceptance.json).

Trzy PNG obejrzano: widać zmianę położenia własnej siatki miecza, pojawienie się pierścienia i wygaszenie geometrii. Eksport zawiera dwie siatki oraz dwa emitery. Scena kontrolna nie ocenia finalnej jakości artystycznej „Wyroku”.

## Instalacja i rzeczywisty WebMCP

Zainstalowano globalnie [nwn-vfx-studio-0.3.0.tgz](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.3.0.tgz), bez dowiązania do repo. SHA-256 paczki: `42d207d47ae9296026070fb22f7e985988cf42f3cad35d464a3ade3e4d0767b9`. [Manifest 64 plików źródłowych](C:/Projects/nwn-vfx/docs/releases/0.3.0/source-manifest.json) wiąże kod, schematy, testy, przykłady, dokumentację i lockfile z wydaniem. Źródłowy i zainstalowany skill są identyczne (SHA-256 `6fece7332a8665d132da4cc6c6f6b893d781ce975f42f623cbd6acb007ecccba`); oba przeszły `quick_validate.py`.

Usługę zatrzymano przez uwierzytelnione `service stop` z idempotencją, zaktualizowano i uruchomiono CLI z `C:\Projects\the last city`. Port 4317 zachował instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587` oraz wszystkie pięć wcześniejszych projektów z tymi samymi dokumentami i rewizjami. `doctor` i capabilities potwierdziły 0.3.0 oraz nowe pola.

W **Codex In-app Browser** odkryto 35 narzędzi i wywołano je bezpośrednio przez `fetchTools().call(...)`. Test używał zainstalowanej paczki, rzeczywistego hosta i osobnego, ograniczonego grantu. Utworzono własny kryształ (6 wierzchołków, 8 trójkątów), pierścień i emiter. Nie dodano takiego presetu do aplikacji.

| Próba w rzeczywistym hoście | Wynik |
| --- | --- |
| `studio.version`, `view.inspect` | 0.3.0; poprawny projekt, zapisany dokument, szkic i kontekst |
| `changes.preview/apply` z `layer.add` | Własna siatka, pierścień i cztery kanały animacji przyjęte; dokument 1 → 2 |
| `view.set` | Wybór kryształu, pauza odtwarzania, czas 0.8 s; UI pokazało geometrię i klucze |
| Niedokończony JSON w UI | `meshEditorDrafts` zawierał tekst i baseline; `draftDirty: true`; `view.open` odmówiło z `DRAFT_CONFLICT` |
| Blokada warstwy zapisana przez człowieka | Zmiana `animation` odrzucona z `LOCKED` |
| Pauza AI ustawiona w UI | Zmiana `geometry` odrzucona z `AI_PAUSED` |
| Po wznowieniu i odblokowaniu | `layer.set` zmieniło geometrię pierścienia i klucze skali kryształu; rewizja 5 |
| Stara rewizja | `REVISION_CONFLICT`, oczekiwana 4, bieżąca 5 |
| Render PNG i `candidate.build`, rewizja 5 | Oba `succeeded`; readback obu siatek i czterech rodzajów kontrolerów |
| `artifacts.read` | Odebrano cały PNG (50 288 bajtów) i MDL (11 836 bajtów); rozmiary, SHA-256 obliczone z odebranych bajtów i `nextOffset: null` poprawne |
| Odłączenie grantu | `WEBMCP_NOT_CONNECTED` |

Projekt „Próba własnego VFX — kryształ i fala”: `8be9fb93-693d-4263-8a01-d0ea4d209d33`, końcowa rewizja **5**. Aktor testowy: `7f7a403e-9459-42c1-8418-02499dd8e476` (dostęp cofnięty). Operacje dodania i edycji: `417ed75c-382a-4660-9ebb-e2eb9b5a6d31`, `47c064b9-19ad-418e-a3d3-2f8f3522ef1e`.

- PNG job `6e6732f2-73f2-46c2-b1bd-4cac232cdec3`; plik `6e55c711-45bd-4cbd-97ea-3a2a5308f7c5`, SHA-256 `de15103a308bd322a2f88d6e83ba79b195494afc8bf48281d3505fd146aa3a37`.
- Build job `b56a555c-7907-449b-8fb7-36f6305582af`; MDL `0568253c-4f2f-49ef-9789-2797d4bc9906`, SHA-256 `11a13bc7998857394b73543c7d91ebfd24e759334aba0fea8137a80a1f50b659`.
- Dodatkowe kopie wyników pobrano przez zainstalowane CLI: [PNG](C:/Projects/nwn-vfx/output/mesh-webmcp/custom-crystal.png), [ZIP](C:/Projects/nwn-vfx/output/mesh-webmcp/candidate.zip), [render job](C:/Projects/nwn-vfx/output/mesh-webmcp/render-job.json), [build job](C:/Projects/nwn-vfx/output/mesh-webmcp/build-job.json). Kopie CLI nie zastępują powyższej próby odbioru przez WebMCP.

Karta testowa pozostała otwarta z nowym przykładem. Pierwotna karta użytkownika nadal zawiera niezapisany szkic „Fiolki alchemicznej”; nie przeładowywano jej. Numer kompilacji hosta nie został odczytany, więc ta próba nie kwalifikuje innych hostów/przeglądarek.

## Granice wersji

`nativeVerified: false`. Nie uruchamiano NWN ani Toolsetu. Wygląd, przezroczystość, materiał i interpolacja kontrolerów w silniku wymagają osobnej kwalifikacji. MDL używa statycznego alpha 0 i animacji `impact`; niezerowe alpha na granicach warstwy wymaga jawnie raportowanych ramp do 1 ms. Scena kontrolna ma zerowe alpha na obu granicach.

Własna siatka nie oznacza importera MDL/FBX. Ta wersja nie dodaje własnych tekstur, warstw światła, ribbon ani natywnego runnera. Materiał mesh jest jednobarwny i nieoświetlany w Studio. Dokument ma limit 6 MiB zwartego UTF-8; siatka ma do 2048 wierzchołków i 4096 trójkątów, kanał do 64 kluczy.

Instrukcje: [geometria i animacja](C:/Projects/nwn-vfx/docs/agents/mesh.md), [CLI](C:/Projects/nwn-vfx/docs/agents/cli.md), [WebMCP](C:/Projects/nwn-vfx/docs/agents/webmcp.md), [przykład zmian](C:/Projects/nwn-vfx/docs/agents/examples/mesh-impact.changes.json).

Wyniki i instrukcje przekazano zadaniu `01a070e3-5df3-7913-943f-854ac8ea98ee` do odbioru konsumenckiego i kontynuacji właściwego „Wyroku” przez Studio. Zadanie podjęło pracę; jego odbiór i finalny efekt artystyczny nie są jeszcze wynikiem tego raportu.
