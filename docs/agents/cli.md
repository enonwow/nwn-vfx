# CLI NWN VFX Studio

CLI `nwn-vfx` jest klientem tej samej usługi API co interfejs webowy. Nie odczytuje bazy projektu ani nie wybiera projektu na podstawie katalogu bieżącego. Uruchomienie z innego repozytorium nie nadaje dodatkowych praw.

Ten dokument opisuje bieżącą implementację, a nie pełny plan V1. Obecny kontrakt to `0.1.0`. Zainstalowane CLI wymaga dostępnego Node.js 24; pełna dystrybucja prywatnego runtime pozostaje osobnym zadaniem wydania. W repo można uruchomić źródło przez `npm run cli -- <argumenty>`; docelowe polecenie na PATH prowadzi do zbudowanego klienta.

## Uruchomienie i połączenie

```text
nwn-vfx --help
nwn-vfx --json version
nwn-vfx service start
nwn-vfx --json service status
nwn-vfx --json workspaces list
nwn-vfx --json doctor
nwn-vfx --json capabilities
```

`service start` jawnie uruchamia zbudowany `dist/node/service.js` z instalacji CLI. Nie zależy od cwd. Proces jest odłączony, na Windows bez osobnego okna; logi trafiają do katalogu danych jako `service.log`. Istniejąca, zgodna usługa jest ponownie używana. Odczyty nie uruchamiają usługi automatycznie. `service stop --idempotency-key <key>` przesyła uwierzytelnione żądanie właściciela; nie kończy procesu po odgadniętym PID. Zatrzymanie następuje przez usługę po wysłaniu odpowiedzi. Ponowienie tej samej zatwierdzonej operacji po restarcie nie zatrzymuje nowego uruchomienia.

Konfiguracja klienta jest odczytywana z `--config`, następnie `NWN_VFX_CONFIG`, następnie `<dataDir>/config.json`. `dataDir` to `NWN_VFX_DATA_DIR` albo katalog `.nwn-vfx` użytkownika. Usługa zapisuje swój plik w katalogu danych; niestandardowe `NWN_VFX_CONFIG` jest wyborem klienta.

Pola konfiguracji: `endpoint`, `instanceId`, `workspaceId`, `ownerToken`. Domyślny endpoint to `http://127.0.0.1:4317`. Pierwszeństwo wyboru połączenia:

| Wartość | Kolejność |
| --- | --- |
| Endpoint | `--endpoint` → `NWN_VFX_ENDPOINT` → konfiguracja → domyślny adres |
| Workspace | `--workspace` → `NWN_VFX_WORKSPACE` → konfiguracja |
| Poświadczenie | `NWN_VFX_TOKEN` → `ownerToken` z konfiguracji |

Przed wywołaniem operacji CLI odczytuje publiczną tożsamość usługi i sprawdza oczekiwany `instanceId` oraz wybrany workspace. Dopiero wtedy wysyła poświadczenie. Tokenów nie podaje się w argumentach polecenia ani w repozytorium. Agent zewnętrzny powinien używać przyznanego tokenu klienta, nie domyślnego poświadczenia właściciela. `doctor` pokazuje kategorię źródła poświadczenia, bez sekretu.

## Discovery i projekt

```text
nwn-vfx --json operations list
nwn-vfx --json schema get projects.create
nwn-vfx --json projects list --limit 20
nwn-vfx --json projects resolve --name "Przeciążenie cewki"
nwn-vfx --json projects create --project effect-demo --name "Wariant cewki" --preset coil --idempotency-key create-demo-001
nwn-vfx --json projects inspect --project effect-demo
nwn-vfx --json projects fork --project effect-demo --revision 1 --name "Wariant A" --idempotency-key fork-demo-001
```

Nazwa nie zastępuje ID. `resolve` może zgłosić niejednoznaczność; wtedy wybierz ID dostępnego projektu. Presety to `coil`, `vial` i `empty`; faktyczny zakres profilu wynika z capabilities. ID i rewizję nowego wariantu odczytaj z odpowiedzi — nie zakładaj, że pozostają takie same jak źródło.

Studio 0.3.0 pozwala również budować własne efekty z warstw `mesh`: prostopadłościanu, pierścienia lub własnych wierzchołków i trójkątów, z kluczami pozycji, orientacji, skali i alpha. Używaj tych samych `layer.add`/`layer.set` przez `changes preview/apply`; dodanie mesh promuje dokument do schematu 2. Starsze dokumenty emiterów zachowują schemat 1. Format i przykład znajdują się w [instrukcji geometrii](mesh.md).

Studio 0.4.0 dodaje `assets import/list/get`, własne tekstury PNG RGBA, UV mesh i punkty start/mid/end cząstki. Import wymaga projektu, rewizji, pliku i klucza idempotencji; zwraca `{project,assetId}`. Przypisanie tekstury i zmiana punktów używają `changes.apply`. Nowe pola promują dokument do schematu 3. Ograniczenia formatu i kompletne przykłady dla CLI/WebMCP zawiera [instrukcja tekstur](textures.md).

W 0.4.1 `assets import ... --target-size 512` lub `1024` jawnie dopasowuje także wejściowy PNG o bokach 1–4096 px. Bez opcji import pozostaje ścisły. Normalizacja zachowuje proporcje, alpha i zapis pochodzenia; wynik i źródło mają osobne hashe w metadanych. Jawny tryb przyjmuje RGB8/RGBA8 do 8 MiB; wynik RGBA8 pozostaje ograniczony do 2 MiB.

## Zmiany, historia i ograniczenia

Studio 0.5.0 udostępnia statyczną orientację emitera przez `layer.add` i `layer.set`. Pole `orientation:[axisX,axisY,axisZ,angleRadians]` obraca lokalny wyrzut +Z; grawitacja zachowuje światowy kierunek Z. +X to `[0,1,0,1.5707963267948966]`, +Y to `[1,0,0,-1.5707963267948966]`. Użycie pola promuje dokument do 4, a brak pola zachowuje stare projekty. Pole jest objęte blokadami, historią i cofaniem. [Pełny kontrakt i przykłady](emitter-orientation.md).

Plik `patch.json` zawiera tablicę zmian albo obiekt z jednym polem `changes`:

```json
[
  { "type": "layer.set", "layerId": "sparks", "values": { "speed": 2.8, "life": 0.6 } }
]
```

```text
nwn-vfx --json changes preview --project effect-demo --expected-revision 1 --input-file patch.json
nwn-vfx --json changes apply --project effect-demo --expected-revision 1 --input-file patch.json --idempotency-key edit-demo-001
nwn-vfx --json revisions list --project effect-demo
nwn-vfx --json changes revert --project effect-demo --expected-revision 2 --operation <operation-id> --idempotency-key undo-demo-001
```

Rewizje w przykładzie są ilustracyjne; przed pracą odczytaj rzeczywisty stan. `preview` sprawdza propozycję bez zapisu. `apply` zapisuje nową rewizję. Przy konflikcie odczytaj aktualny dokument i przygotuj nową propozycję; nie zwiększaj automatycznie numeru rewizji starej zmiany.

Każda mutacja wymaga `--idempotency-key` o długości 8–160 znaków. Przy ponowieniu po utracie odpowiedzi zachowaj identyczne wejście i klucz. Wynik odzyskasz przez:

```text
nwn-vfx --json operations resolve --operation changes.apply --project effect-demo --idempotency-key edit-demo-001
nwn-vfx --json operations get <operation-id>
```

Skróty `layers set/add/remove/move/enable/duplicate` wykonują `changes.apply` z tymi samymi kontrolami. `layers set --input-file values.json` przyjmuje obiekt zmienianych wartości; `layers add` przyjmuje kompletną warstwę według schematu. `constraints set` przyjmuje tablicę blokad i wykonuje właścicielskie `locks.set`. `revisions restore` odtwarza całą wskazaną rewizję jako nowy zapis. `--input -` pozwala przekazać JSON przez stdin; jest alternatywą dla `--input-file`, bez interaktywnego pytania.

## Render, build i pobranie wyniku

PNG wymaga Chromium. Od Studio 0.3.1 WebM wymaga dodatkowo `ffmpeg` z enkoderem `libvpx-vp9` na PATH usługi. Wideo próbkuje dokument w stałych chwilach `frameIndex / 30`, a następnie koduje te klatki jako 30 FPS. Wolny renderer wydłuża wykonanie joba, zamiast przeskakiwać momenty efektu; długość filmu jest zaokrąglana w górę do pełnej klatki. `--format webm` nagrywa całą oś czasu, niezależnie od `--time` używanego dla PNG.

```text
nwn-vfx --json preview request --project effect-demo --revision 2 --time 0.6 --format png --idempotency-key render-demo-001
nwn-vfx --json candidate build --project effect-demo --revision 2 --idempotency-key build-demo-001
nwn-vfx --json jobs list --project effect-demo
nwn-vfx --json jobs get <job-id>
nwn-vfx --json jobs wait <job-id> --timeout 30s
nwn-vfx --json artifacts list --project effect-demo
nwn-vfx --json artifacts get <artifact-id> --out <jawna-sciezka-pliku>
```

`accepted` i kod wyjścia 0 oznaczają przyjęcie joba, a nie jego ukończenie. `jobs wait` ma łączny limit; `--request-timeout` ogranicza pojedyncze żądanie. Timeout oraz Ctrl+C przerywają klienta, nie anulują joba. Anulowanie jest osobne:

```text
nwn-vfx --json jobs cancel <job-id> --idempotency-key cancel-demo-001
```

Pobranie odbywa się przez API. CLI sprawdza SHA-256 i liczbę bajtów przed publikacją pliku, nie nadpisuje istniejącego bez `--overwrite`, usuwa nieudane pliki tymczasowe. Katalog docelowy musi istnieć. Przekazuj drugiemu uprawnionemu klientowi ID joba/artefaktu i manifest, bez prywatnych ścieżek magazynu. Sam identyfikator nie nadaje prawa odczytu. Pobranie nie instaluje zasobów w The Last City ani w grze.

`projects export --project <id> --revision <n> --idempotency-key <key> [--out <plik>]` tworzy artefakt przenośnego projektu udostępniony przez bieżący backend. `projects import --file <plik>` przyjmuje paczkę ZIP Studio, dokument JSON Studio albo obiekt z polem `document`; nie jest importerem dowolnego ZIP ani MDL. Limit wejściowego pliku wynosi 9 MB. Backend waliduje zawartość paczki i ścieżki jej wpisów. Nie używaj rozszerzenia pliku jako dowodu wspieranego formatu.

## Aktorzy, wstrzymanie i ocena

Właściciel może utworzyć poświadczenie klienta z konkretnymi ID projektów i zakresami:

```text
nwn-vfx --json actors create --name "TLC agent" --projects effect-demo --scopes "read,edit,build,render,jobs,artifacts" --idempotency-key actor-demo-001
nwn-vfx --json actors list
nwn-vfx --json actors revoke <actor-id> --idempotency-key revoke-demo-001
nwn-vfx --json policy pause --project effect-demo --idempotency-key pause-demo-001
nwn-vfx --json policy resume --project effect-demo --idempotency-key resume-demo-001
```

Odpowiedź `actors create` zawiera nowy sekret potrzebny do konfiguracji klienta. Przechowaj go poza repozytorium i nie dołączaj odpowiedzi do publicznych logów. Utworzenie aktora jest odrębne od instalacji modeli i od kont SaaS. Drugi klient może mieć tylko `jobs,artifacts`; prawa kontroli joba i edycji są odrębne.

`reviews add --project <id> --revision <n> --text <uwaga> --verdict note --idempotency-key <key>` dodaje uwagę. `approved` i `needs-work` są ocenami właściciela według polityki backendu. Agent nie podpisuje za człowieka oceny artystycznej. Lista jest dostępna przez `reviews list`.

## JSON, błędy i pełna powierzchnia

`--json` daje jeden obiekt UTF-8 na stdout, również przy błędzie. Postęp i diagnostyka tekstowa są na stderr. CLI nie pyta interaktywnie; `--no-input` wyraża tę intencję jawnie. Help pozostaje tekstem. Nieznane flagi, niepoprawne typy i wejścia są odrzucane. CLI waliduje wejście wspólnym rejestrem schematów, a usługa ponownie sprawdza dane i uprawnienia.

| Kod | Znaczenie |
| --- | --- |
| 0 | Sukces komendy lub przyjęcie joba |
| 2 | Argumenty/schemat/nieobsługiwana operacja lub istniejący plik |
| 3 | Konfiguracja, połączenie, tożsamość lub uprawnienia |
| 4 | Konflikt rewizji/idempotencji lub blokada parametrów |
| 5 | Błąd wykonania lub integralności artefaktu |
| 6 | Upłynął limit oczekiwania/żądania |
| 7 | Job zablokowany lub oczekujący działania |
| 8 | Job potwierdzony jako anulowany |
| 130 | Przerwano klienta |

`jobs get` zwraca 0 dla poprawnego odczytu joba o statusie `failed`; `jobs wait` w takim przypadku zwraca 5. Szczegółową przyczynę odczytaj z `error.code`, `message`, `details`, `retryable` oraz danych joba.

Każda zarejestrowana operacja jest też dostępna jako `operations call <nazwa> --input-file <plik.json>` z tym samym schematem i obowiązkowym kluczem dla mutacji. To wejście do zarejestrowanych operacji, nie shell ani dowolny kod. Nie dodawaj `actorId` do wejścia w celu wyboru tożsamości.

`events list --project <id> --cursor <n>` zwraca ograniczoną porcję zdarzeń w JSON. Ciągły stream NDJSON, sterowanie sesją widoku, import MDL i samodzielny test natywny nie są deklarowane jako ukończone. `native test request` wywołuje zarejestrowaną operację; faktyczna dostępność wymaga kwalifikowanego adaptera i wynika z capabilities. CLI nie zastępuje runnera własnym launcherem NWN.
# Own OBJ geometry and material authoring

Studio 0.7.0 adds `meshes import-obj`, preview before commit, optional atomic `MeshLayer.material`, and `assets remove` for an explicit list of unused assets. See [OBJ/material workflow](obj-material.md) for exact flags, independent UV indexing, source units, transform ordering, limited WebMCP rights and selective undo.

Studio 0.15.0: audio import/list/get/remove, klipy przez changes.preview/apply i wspólny eksport audio/wideo. [Kontrakt audio i przykłady](audio.md).
