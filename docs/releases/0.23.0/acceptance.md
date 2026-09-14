# Studio 0.23.0 — odbiór interpolacji własnej geometrii

Wdrożono opcjonalną interpolację deformacji mesh w edytorze, globalnym CLI i WebMCP. Efekty można budować od pustego projektu: podczas rzeczywistego odbioru WebMCP agent utworzył własny projekt, zaimportował PNG, dodał siatkę custom oraz klucze vertices, wybrał płynną pętlę i pobrał eksport oraz podgląd.

## Opublikowana wersja

- Usługa: `http://127.0.0.1:4317`, wersja `0.23.0`.
- Globalny pakiet: `C:/Users/enonw/AppData/Roaming/npm/node_modules/nwn-vfx-studio`.
- Pakiet: `output/releases/nwn-vfx-studio-0.23.0.tgz`, 2 500 568 B, SHA-256 `ec11aa83813d4145efe669b9b57d1a6fe0af4554e487427c7ada691a44f97bd7`.
- Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587` — zachowane.
- Wszystkie 79 istniejących przed aktualizacją głów projektów zachowało rewizję i kanoniczny SHA-256. Przed zatrzymaniem usługi nie było aktywnych zadań. Zatrzymanie/wznowienie uzgodniono z konsumentem; nie przeładowywano jego kart.
- Projekty konsumenta nie były zmieniane. Testy funkcji używały osobnych fixture i kopii źródła r6. Osobisty i pakietowy skill nwn-vfx oraz dokumentacja/przykłady są zaktualizowane.

Kontrakt i polecenia: [deformation-interpolation.md](../../agents/deformation-interpolation.md). Pierwszy wybór/lock pola wymaga dokumentu 14 i ZIP v9. Domyślne pominięcie pozostawia poprzednią interpolację i zasoby. Jawne `linear` daje te same zasoby MDL/HAK/TGA/TXI, z nową metryką wersji eksportera.

## Zakończone kontrole

- Build i TypeScript przeszły. Pełny przebieg 270 testów miał jedną nieaktualną asercję listy wersji (oczekiwała 1–13). Po dopisaniu 14 cały dotyczący jej plik przeszedł ponownie 3/3; łącznie wszystkie 270 przypadków ma wynik pozytywny. Logi zachowują ten przebieg, bez ukrywania pierwszego niepowodzenia.
- Testy nowej krzywej obejmują C1, dokładne seamy okresowe, zerowe prędkości końców FnF, stałe nasady, zakres każdej współrzędnej, niewyrównane granice klipu i konserwatywny błąd próbkowania. Walidacja odrzuca niedopasowane końce i odstępy poniżej 1 µs.
- Operacje serwisu: wersja klienta, lock pola i animacji, pauza, idempotencja, konflikt, historia i undo. ZIP v9 roundtrip, ASCII oraz binarny odczyt próbek, zachowanie źródłowych kluczy i wcześniejszych zasobów.
- Dwa scenariusze przeglądarkowe przeszły: nowa interpolacja oraz regresja DUR. Rejestr adaptera jest w tych testach fixture; rzeczywisty host sprawdzono dodatkowo poniżej.
- Zainstalowane CLI uruchomione z `C:/Projects/the last city`: 2 własne projekty, 7 zakończonych zadań ASCII/binary/PNG/WebM oraz eksporty ZIP. Pobrane pliki sprawdzono według rozmiaru i SHA-256.
- W 6 parach zadań potwierdzono identyczne hashe pozycji/UV, częstotliwość, liczby klatek, interpolację i granice błędu między rendererem a readbackiem eksportu. Film dwóch obiegów r6 ma 84 klatki przy 30 FPS, długość 2,8 s; SHA-256 `641fb0877d8b54e1c6ccb5d841a39451d7ba4aafdcf54176704f71f91aff0cc7`.

## Rzeczywisty WebMCP

Host Codex IAB odkrył i udostępnił wszystkie **49 narzędzi**, łącznie **65 405 B** deskryptorów z origin/pageUrl. To 131 B poniżej limitu 65 536 B; kontrola wydania wymaga 128 B rezerwy i rzeczywistego discovery. Opisy i nazwy lokalnych definicji skrócono, zachowując wszystkie ograniczenia schematów oraz wskazówki readOnly/untrustedContent. Rezerwa jest mała: dalsze rozszerzenie wymaga ponownego sprawdzenia tego limitu.

Własny projekt: `studio-interpolation-0230-webmcp@6`, utworzony z `empty`, PNG + custom mesh 6 wierzchołków / 5 kluczy. Zaliczone: propozycja, zapis, identyczne ponowienie, REVISION_CONFLICT, kontrola czasu/zaznaczenia, LOCKED, AI_PAUSED, DRAFT_CONFLICT, zachowanie szkicu podczas eksportu, dwa zakończone zadania i 13 pobranych plików przez porcje base64 z weryfikacją SHA fragmentów i całych plików. Testowy szkic przywrócono, a grant odwołano; końcowy wynik połączenia to WEBMCP_NOT_CONNECTED.

- Eksport: `d4c2977c-829e-46f0-a22b-5a2052c47dda`.
- Podgląd: `ecedd499-638e-4afe-a97c-e956e3131397`.
- MDL: `4bcb2bdef70aa34b01fb671d9b8d9b297b8eaedc4c92e8c339cb3234a183e0e8`.

## Izolowana kopia skrzydeł r6

Źródło: `tlc-wampir-skrzydla-loop@6`, snapshot `aee8d5b88dcb223a676cd2bda90f3e262040861a2e629b00fb9479f6c6f2223a`. Wyłącznie własna kopia `studio-interpolation-0230-r6@2` otrzymała nowe pole na czterech warstwach. Snapshot kopii: `f1ea103bf3540d3d6db2f3494cebec1f6089e83cc411fc171829210a857950b3`.

Pozostało 17 kluczy na warstwę, 85 próbek na obieg i 5 102 952 B dokumentu. Geometria, tekstury, transformacje i wszystkie autorskie klucze są identyczne ze źródłem. Front/back różni się o 0 m we wszystkich próbkach. Stałe wierzchołki: 78/78/46/45; ruch nasad 0 m. Prędkości analityczne na seamie są identyczne. Największy skok wektora prędkości między liniowymi odcinkami próbek zmniejszył się z 2,09138443 do 0,61117604 m/s. Największa konserwatywna granica błędu próbkowania wynosi 0,00152391 m przed transformacją warstwy.

| Artefakt kopii r6 | Job |
| --- | --- |
| ASCII | `3390d94a-1334-4736-8120-c813322e3fcc` |
| Binary | `ed644318-0aa7-4d2a-842e-a041b96583c0` |
| PNG | `0f2452a0-be41-409b-8572-9b5c67aa0839` |
| WebM | `81c691f8-c704-487d-8dff-4954198679ba` |

## Granice odbioru

Krzywa autorska jest C1; podgląd i eksport wykorzystują wspólne liniowe próbki 60 Hz, czyli przybliżenie C0. Brak overshootu dotyczy współrzędnych między kluczami, a nie kątów, promieni czy samoprzecięć. Binarny animmesh nadal ma statyczne normalne. To wydanie nie zmienia mocowania do kości, integracji MOD/HAK ani czasu życia efektu w skryptach. Nie uruchamiano Toolsetu ani NWN; wszystkie wyniki mają `nativeVerified:false`. Konsument otrzymał callback gotowości 0.23.0 przed własnym apply r7 i prowadzi integrację/test gry osobno.

Dowody maszynowe: `output/releases/0.23.0/{before-install.json,installed-preservation.json,source-acceptance.json,installed-acceptance.json,sample-parity.json,real-host-webmcp.json}`. Logi: `output/interpolation-{build,all-tests,recheck,typecheck-final}.log`. Manifest 279 plików źródłowych i pakietu: [source-manifest.json](source-manifest.json). Repozytorium jest jeszcze bez pierwszego commita; manifest identyfikuje lokalne pliki, nie zatwierdzenie Git.
