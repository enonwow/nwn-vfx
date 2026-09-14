# Studio 0.19.0 — Obracaj z postacią

Wdrożono 2026-09-08 do istniejącej usługi `http://127.0.0.1:4317/`.
UI, globalny CLI i rzeczywisty WebMCP potwierdziły działanie.
Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587` pozostały te same.

## Zakres i kontrakt

`project.set.values.orientWithObject` przyjmuje boolean. Historyczny brak
oznacza false i pozostaje bez zmian po odczycie/aktualizacji. Jawne ustawienie
promuje nową rewizję do schematu 11, ZIP do v6, minimum Studio 0.19.0.
UI: **Obracaj z postacią**, z osobną kłódką. Blokada właściciela:
`{layerId:"@effect",field:"orientWithObject"}` w istniejącym `locks.set`.
Klienci wysyłają `X-NWN-VFX-Document-Schema: 11`; deklaracja 10 nadal obsługuje
starsze dokumenty. Starszy klient otrzymuje `CLIENT_UPGRADE_REQUIRED` przy
nowej właściwości, przed zapisem. Discovery pozostaje dostępne.

Publiczny `vfx-integration.json` wiąże wartość `OrientWithObject:0|1` z
projektem, rewizją, snapshotem i rzeczywistym hashem modelu eksportu. Jest
powtórzony w `validation.integration.effect` i
`handoff.metadata.validation.integration.effect`, z `rowId:null` do wyboru
przez konsumenta. Nie jest zastępczym `visualeffects.2da`, nie trafia do HAK
i nie instaluje niczego w NWN. CLI `candidate build --model-name RESREF`
udostępnia istniejący parametr eksportu.

[Kontrakt, CLI, WebMCP i przykład integracji](../../agents/effect-integration.md).
Nie zmieniono lokalnej orientacji warstw, geometrii, animacji ani audio.
Opcja nie przyłącza efektu tworzonego przez ApplyEffectAtLocation. Nie ma
podglądu obracającej się postaci ani dowodu natywnego; `nativeVerified:false`.

## Weryfikacja

- Build i typecheck: `output/orient-build-release.log`.
- 15/15 testów: `output/orient-acceptance-release.log`. Boolean/legacy,
  schemat i ZIP, historia/autorstwo, undo, blokady, pauza, konflikty,
  stare deklaracje klienta, pełna integralność handoff, profile eksportu,
  regresja dB oraz prawdziwa przeglądarka: checkbox/save/reload/undo/lock.
- 38/38 regresji CLI i adaptera/sesji WebMCP:
  `output/orient-client-regression.log`.
- Zainstalowany CLI z `C:/Projects/the last city`: preview/apply true i
  false, jawny modelName, eksport, import starego ZIP i dokładny roundtrip v6.
  `output/releases/0.19.0/installed-cli.json`.
- Rzeczywisty host Codex, nowa karta 7: **48 odkrytych narzędzi**.
  Odrębny ludzki szkic, DRAFT_CONFLICT, zapis agenta i idempotencja,
  REVISION_CONFLICT, LOCKED, FORBIDDEN dla próby usunięcia blokady,
  AI_PAUSED, undo, historia autora, eksport false/true i sześć pobranych
  plików z weryfikacją SHA-256/rozmiaru/chunków. Grant cofnięty, potwierdzono
  WEBMCP_NOT_CONNECTED. `output/releases/0.19.0/real-host-webmcp.json`.
- Fixture: `studio-orient-0190`, końcowo r8, true. Job false r7:
  `220d35a8-5cf2-4221-8aa7-23463a814393`; true r8:
  `bfdcc5f0-262b-46ec-876f-9a51921888b3`. Model obu eksportów:
  `orient_0190.mdl`, SHA-256
  `d10187a39b77a96ca6ffb62211af003268857cb2c72a799052f08b92875d5838`.

Pierwsze nieudane próby i diagnozy zachowano w `output/orient-build.log`,
`output/orient-tests-initial.log`, `output/orient-tests-second.log` oraz
`output/orient-tests-verified.log`. Ostateczne wyniki są w plikach wskazanych
powyżej. Nie traktowano nieudanego testu jako potwierdzenia.

## Zasoby i niedeterministyczność binary

Przed aktualizacją wykonano bazowy eksport własnego projektu przez 0.18.0.
Po aktualizacji eksport legacy, false i true zachowuje identyczne ASCII MDL,
TGA/TXI i WAV (siedem plików); pełne źródła audio i warstwy są niezmienione.

Przypięty kompilator binary pozostał nietknięty. Dla mieszanego przykładu
z emiterem, deformującą się siatką smooth, smugą i audio przeprowadzono
cztery kompilacje: dwie identyczne implicit-false oraz jawne false/true.
Cały dekompilowany MDL i wszystkie bezpośrednio odczytane pola binary mesh
są identyczne. Każdy wynik niezależnie przechodzi porównanie kontrolerów,
geometrii, UV, próbek i normalnych ze źródłem. Odczyt: 6 węzłów mesh,
514 trójkątów rysowania, 50 499 próbek pozycji i tyle samo UV; 30 narożników
normalnych w dwóch smooth animmesh, maksymalny błąd normalnej 0.

Wszystkie różniące się bajty badanego binary znajdują się po NUL nazwy
zdarzenia `detonate`, wewnątrz jej 32-bajtowego magazynu. Odczyt źródła
przypiętego kompilatora potwierdza przyczynę: `_NmcLib/NmcGeometry.cpp:479`
tworzy niewyzerowany `NwnMdlAnimationEvent`; `_NmcLib/NmcCoreParsers.cpp:377`
kopiuje nazwę i NUL; `_NwnLib/NwnMdlSerialize.cpp:239` zapisuje pełną
strukturę. Nie zmieniano kompilatora ani wynikowych bajtów.

Dokładne pliki, hashe, zakresy różnic i raport strukturalny:
`output/releases/0.19.0/binary-proof/report.json`, odtwarzalne przez
`scripts/prove-effect-integration-binary.ts`. To dowód w zakresie odczytanego
formatu, nie działania gry. Konsument zachowujący poprzedni zaakceptowany
binary musi wykazać identyczność źródła i zachować oba hashe w swoim lineage.
Nowy handoff opisuje wyłącznie model nowego joba.

## Zachowanie danych i paczka

Przy instalacji potwierdzono niezmienność wszystkich 55 istniejących
projektów. Końcowa kontrola zachowała pozostałe 54 projekty; zmieniał się
wyłącznie własny fixture. Produkcja do chwili przekazania:

- `tlc-wampir-ugryzienie` r31, wszystkie gain 3, SHA dokumentu
  `f8dde757445a44f07b93869ae506618776b2b41dc13a29c8bee4021eac2178e8`.
- `tlc-wampir-bijace-serce` r9, wszystkie gain 3, SHA dokumentu
  `f16a91e6715819f64df0cc9f0cd0abbb1d5f7a0d6637ea791ed17408d1f05411`.

Porównano również pełną historię, zasoby audio i listy artefaktów/hashów.
`output/releases/0.19.0/closure.json` potwierdza zgodność dokumentacji
i skillu w repozytorium, instalacji globalnej i osobistym katalogu skillu.
Konsument dokonuje następnie własnych zmian, pakowania i testu gry.

Paczka: `output/releases/nwn-vfx-studio-0.19.0.tgz`, 2 224 984 bajty,
SHA-256 `3c4c87d16567910fc8aa31f8d3eeada6da557c7701f99e5ea2ffae1347a4fb99`.
`source-manifest.json` wiąże 228 plików źródłowych. Repozytorium pozostaje
lokalne, bez pierwszego commita; manifest nie udaje tożsamości commita.
