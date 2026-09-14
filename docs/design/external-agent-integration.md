# NWN VFX Studio — integracja agentów z innych projektów

Data: **2026-09-05**. Status: **działająca integracja 0.2.0 oraz docelowe wymagania odbioru V1**. CLI/API obsługują zewnętrznych klientów, a 35 narzędzi WebMCP udostępnia wspólne operacje i kontekst karty z ograniczonymi prawami agenta. Rzeczywiste discovery i wywołania WebMCP potwierdzono w Codex In-app Browser; [raport odbioru 0.2.0](C:/Projects/nwn-vfx/docs/releases/0.2.0/acceptance.md) określa sprawdzony zakres. Zwykły MCP pozostaje niewdrożony (`mcp: false`), a integracja centralnego runnera i kwalifikacja NWN są nadal wymaganiami V1.

Instrukcje bieżącej implementacji: [CLI](C:/Projects/nwn-vfx/docs/agents/cli.md) i [WebMCP](C:/Projects/nwn-vfx/docs/agents/webmcp.md). Poniższe kryteria obejmują także przyszłe możliwości; ich opis nie oznacza zaliczenia całej V1.

Dokument uzupełnia [kontrakt sterowania](C:/Projects/nwn-vfx/docs/design/human-ai-control-contract-draft.md) i [plan implementacji](C:/Projects/nwn-vfx/docs/plans/implementation-plan.md). Agent z `the last city` jest pierwszym konsumentem referencyjnym; rozwiązanie pozostaje niezależne od tego repozytorium i dostawcy modelu AI.

## 1. Tożsamość, połączenie i granice

| Pojęcie | Znaczenie |
| --- | --- |
| `instanceId` | Tożsamość instalacji usługi; nie zmienia się przy zwykłym restarcie, UI i CLI mogą ją porównać |
| `workspaceId` | Przestrzeń danych Studio; w V1 jedna lokalna baza/instancja, bez automatycznego tworzenia kolejnej przy zmianie cwd |
| `projectId` | Stabilne ID projektu VFX; obowiązkowe dla jego operacji, niezależne od nazwy i katalogu konsumenta |
| `actorId` | Wykonawca rozpoznany z uwierzytelnionej sesji/poświadczenia, z przyznanym zakresem |
| `consumerProjectRef`, `clientLabel` | Planowane opcjonalne metadane pochodzenia, np. TLC; nie są obecnie polami komend ani źródłem praw |
| `operationId`, `jobId`, `artifactId` | Identyfikatory trwałej operacji, wykonania i wyniku; ich znajomość nie zastępuje uprawnienia |
| `viewSessionId` | Konkretna otwarta karta i grant WebMCP; wymagany w narzędziach tego adaptera, nie w edycji lub renderze CLI |

`--workspace` wskazuje jawnie skonfigurowaną przestrzeń, nie katalog bieżący. Wybór: jawna flaga → `NWN_VFX_WORKSPACE` → skonfigurowana domyślna przestrzeń. Brak jednoznacznego wyboru daje błąd i listę dostępnych konfiguracji, zamiast zgadywania. Endpoint i oczekiwane ID są częścią tej konfiguracji; doctor sprawdza rzeczywistą tożsamość usługi.

Poświadczenia: przypisane do wybranego połączenia, z pierwszeństwem dedykowanego środowiska nad lokalnym magazynem konfiguracji. Nie zapisujemy tokenów w repozytorium konsumenta, przykładach ani argumentach procesu. `doctor` ujawnia kategorię źródła i przyznane możliwości, bez sekretu.

CLI nie uruchamia i nie zatrzymuje usługi w sposób ukryty przy odczycie. Jawne polecenie zarządzania usługą inicjuje start; połączenie z istniejącą instancją jej nie zastępuje. Brak endpointu daje rozstrzygalny błąd i instrukcję startu. UI startuje przez udokumentowany launcher/usługę, następnie działa pod adresem webowym.

## 2. Prawa i współdzielenie

Właściciel udziela klientowi CLI zakresu przez `actors create`, a karcie WebMCP przez **Połącz agenta → Udostępnij projekt AI**. Sesja WebMCP ma osobnego aktora, jest związana z kartą i sesją właściciela oraz wygasa najpóźniej po 30 minutach. Kolejne odwracalne operacje mieszczące się w ważnym grancie nie wymagają powtarzania zgody. Sesja projektu zewnętrznego nie dziedziczy praw tylko przez nazwę repozytorium lub dostęp do CLI.

Minimalne zakresy są rozdzielone: odczyt projektu, edycja/nowy wariant, import, render/build, odczyt jobów/artefaktów i cancel. Tworzenie projektu jest osobnym prawem workspace; zarządzanie prawami i ograniczeniami należy do właściciela. Test natywny według profilu pozostaje planowany. Polityka jest egzekwowana na każdej operacji i ponownie przed mutacją/skutkiem zgodnie z kontraktem; WebMCP nie udostępnia komend administracyjnych ani importu.

Dwaj uprawnieni agenci mogą współpracować przy jednym projekcie. Odczyt joba i pobranie artefaktu mogą być przyznane drugiemu aktorowi bez prawa edycji lub anulowania. Listy, zdarzenia i resolve filtrują niedostępne projekty. Cudzy identyfikator, pole `actorId` i ogólne `operation call` nie rozszerzają praw.

AI nie może sam nadać sobie praw właściciela, usunąć jego blokady ani podpisać oceny artystycznej jako człowiek. UI pokazuje autora i pochodzenie zmiany. Cofnięcie praw oraz wstrzymanie zapisów dotyczą także zewnętrznego klienta i oczekujących operacji.

## 3. Discovery i stabilny kontrakt

Agent rozpoczyna od help/doctor, wersji, capabilities, projektu i schematu operacji. Listy mają ograniczenie rozmiaru, stabilne sortowanie i kursor. Resolve po nazwie przy kilku trafieniach zwraca niejednoznaczność oraz dostępnych kandydatów; agent musi wskazać ID.

Zmiana nazwy zachowuje ID. Nowy import/fork zwraca nowe ID i pochodzenie. Zachowanie tożsamości przy odtwarzaniu backupu jest osobną jawną operacją; zwykły import nie nadpisuje istniejącego projektu.

Koperta odpowiedzi pozostaje wspólna dla klientów. CLI `--json` nie pyta na stdin, stdout zawiera jeden obiekt, a logi idą na stderr. `--ndjson` pozostaje planowany; obecne zdarzenia są odczytywane przez `events.list` z kursorem. Schematy wejść i wyników są dostępne bez odczytu kodu.

W WebMCP agent zaczyna od discovery hosta i `studio.connection.inspect`, następnie używa zwróconego `viewSessionId`. `studio.view.inspect` rozdziela zapisany dokument i niezapisany szkic; `view.set` wymaga oczekiwanej rewizji projektu oraz widoku. `view.open` nie zastępuje niezapisanego szkicu. Pobranie przez `studio.artifacts.read` zwraca ograniczone fragmenty z SHA-256; po ich połączeniu konsument sprawdza także hash całego pliku. Próby dwóch kart, cofnięcia dostępu, pauzy i konfliktów opisano w raporcie wydania.

Wydanie Studio/CLI 0.2.0 używa kontraktu komend API 0.1.0 i dokumentu w wersji 1. Historia ma dodatkowe pola `actorId`, `actorName`, `actorKind`, `committedAt`; konsumenci zamkniętego starego DTO powinni odczytać aktualny schemat. Docelowa macierz zgodności obejmuje także migracje paczek i manifestów oraz profil NWN z wersjami generatorów i dowodami. Zgodność wersji sprawdzamy przed mutacją; nieznany przyszły format nie podlega cichej konwersji z utratą pól.

## 4. Przekazanie plików i wyników

CLI odczytuje tylko jawnie wskazane pliki wejścia po stronie klienta i przesyła je jako zasoby. Backend zwraca ID, pochodzenie, hash i zależności. Parametr API zawierający ścieżkę nie może zmienić usługi w przeglądarkę dowolnych plików komputera.

Render/build używa dokładnej rewizji lub snapshotu. Job nie przestawia się na najnowszą edycję w chwili startu. Wynik zawiera odwołania do artefaktów; duże obrazy, paczki i filmy są pobierane osobno. Podstawowy manifest przekazania obejmuje:

| Pole/grupa | Wymagana informacja |
| --- | --- |
| Wersje | Wersja kontraktu i schematu manifestu |
| Pochodzenie | Workspace/projekt, rewizja i hash snapshotu; źródłowa operacja/job |
| Kandydat | ID kandydata dla builda, docelowy profil i wersje generatorów |
| Artefakty | ID, rodzaj/MIME, nazwa, liczba bajtów, algorytm i hash; zależności |
| Eksport | Nazwy/resrefy, wykorzystane mapowania 2DA i kolejność HAK, gdy dotyczą wyniku |
| Walidacja | Wynik odczytu, ograniczenia oraz rozdzielone statusy kwalifikacji |
| Podgląd | Rewizja, scena/kamera, czas lub zakres, seed i wersja renderera |
| Dowody natywne | Powiązany test/profil, faktyczne zasoby i artefakty dowodowe, jeśli test został wykonany |

Manifest nie wymaga dostępu do prywatnej ścieżki magazynu Studio. `artifacts get --out` pobiera bajty przez usługę, sprawdza hash i dopiero po sukcesie publikuje docelowy plik. Plik niepełny nie udaje wyniku; istniejący plik wymaga jawnej opcji nadpisania. Paczka projektu/zasobów nie odtwarza absolutnych ścieżek autora; import weryfikuje ścieżki wpisów i kolizje przed rozpakowaniem do własnego magazynu.

Pobranie kandydata jest odrębne od instalacji w module, repozytorium lub grze. Tę drugą czynność wykonuje uprawniony adapter/konsument w ustalonym zakresie. Domyślne katalogi robocze Studio nie mogą wskazywać checkoutu TLC.

## 5. Scenariusz konsumenta „the last city”

Cel: agent pracujący nad zaklęciem przygotowuje wariant impactu z cięższymi iskrami i krótszym błyskiem, zachowując zaakceptowaną teksturę dymu.

1. Z terminala projektu TLC uruchamia zainstalowane CLI, identyfikuje usługę i zakres dostępu, odczytuje capabilities i wybiera stabilne ID projektu Studio.
2. Odczytuje rewizję, warstwy i ograniczenia; tworzy osobny wariant z pochodzeniem i przygotowuje diff. Zapisuje zmiany z `expectedRevision` i trwałym kluczem idempotencji. UI pokazuje nową rewizję oraz autora.
3. Człowiek zmienia niezależny parametr w przeglądarce. Agent odczytuje stan, a próba zapisu starej propozycji daje konflikt. Cofnięcie wcześniejszej edycji AI zachowuje niezależną zmianę człowieka.
4. Agent przy zamkniętej karcie zleca render i build wybranej rewizji. Zapisuje ID operacji/jobów. Utrata odpowiedzi lub timeout prowadzą do odczytu/resolve istniejącego wyniku, bez nowego skutku.
5. Drugi klient z przyznanym odczytem otrzymuje ID i odbiera status, manifest oraz artefakt do jawnego katalogu odbioru; sprawdza hash. Sam identyfikator nie nadaje praw do cancel ani innego projektu.
6. Adapter konsumenta wiąże kandydata z kwalifikowanym profilem centralnego runnera: dokładny MOD, uporządkowane HAK, model/wiersz VFX, Area, fixture i wymagane dowody geometrii. Test odbywa się według istniejącej autoryzacji projektu.
7. Wynik runnera zostaje zarejestrowany przy kandydacie przez uprawniony adapter, z dowodami pochodzenia. Agent otrzymuje osobno integralność, wykonanie, widoczność, zgodność zachowania i kompletność dowodów. Właściciel ogląda wynik i zapisuje ocenę artystyczną.

Brak NWN/runnera daje stan niedostępnej możliwości, pozostawiając działające kroki edycji, renderu i eksportu. Nie jest sukcesem testu. Jeśli natywny Save tworzy zmieniony MOD, adapter rejestruje rzeczywisty wynik i jego relację do wejścia.

Konfiguracja adaptera TLC zawiera lokalizację centralnego runnera i NWN, katalogi staging/MOD/HAK, politykę nazw i wierszy, scenę demonstracyjną, wyzwalanie, prawa testu oraz zasady procesu/monitora. Rdzeń zna projekty, kandydatów i zadania. Nie zna stałej ścieżki `C:\Projects\the last city`, identyfikatora monitora ani wiersza `10100`.

Przykładowe działające wywołania po instalacji; wartości w nawiasach pochodzą z discovery lub poprzednich odpowiedzi, a plik zmian jest przygotowany według pobranego schematu:

```text
nwn-vfx --json doctor --workspace <workspace-id>
nwn-vfx --json projects list --workspace <workspace-id> --limit 20
nwn-vfx --json projects inspect --workspace <workspace-id> --project <project-id> --revision <revision>
nwn-vfx --json changes preview --workspace <workspace-id> --project <project-id> --expected-revision <revision> --input-file <patch.json>
nwn-vfx --json changes apply --workspace <workspace-id> --project <project-id> --expected-revision <revision> --input-file <patch.json> --idempotency-key <saved-key>
nwn-vfx --json candidate build --workspace <workspace-id> --project <project-id> --revision <result-revision> --profile <profile-id> --idempotency-key <saved-build-key>
nwn-vfx --json jobs wait <job-id> --workspace <workspace-id> --timeout 30s
nwn-vfx --json artifacts get <artifact-id> --workspace <workspace-id> --out <explicit-destination>
```

To wycinek powierzchni CLI, nie kompletny skrypt ani pretekst do pominięcia wariantu/renderu. Zainstalowany skill oraz instrukcje CLI/WebMCP zawierają przykłady przygotowania wejścia, wariantów, renderu, eksportu i odzyskiwania wyników.

## 6. Kryteria odbioru integracji

| ID | Próba | Warunek zakończenia |
| --- | --- | --- |
| X01 | Czysta instalacja i obcy cwd | Polecenie na PATH działa z TLC i katalogu ze spacjami/polskimi znakami, bez źródeł Studio, kompilatora i `npm run`; cwd nie zmienia bazy |
| X02 | Discovery i tożsamość | UI/CLI wskazują tę samą instancję/workspace; niejednoznaczna nazwa nie wybiera projektu; rename/restart zachowują ID |
| X03 | Dwaj aktorzy i zakresy | Dozwolony projekt działa; cudzy odczyt/zapis/job/artefakt jest niedostępny; etykieta/ID w payloadzie nie nadaje praw; pause/revoke obowiązuje przed commitem |
| X04 | Wspólna edycja | UI widzi operację z TLC, CLI widzi zmianę człowieka; konflikt/undo/ograniczenia zachowują reguły C01–C07 |
| X05 | Job bez karty i przerwanie klienta | Render/build wracają jako trwałe joby tej samej rewizji; timeout/restart/utrata odpowiedzi nie tworzą duplikatu; uprawniony klient odzyskuje status |
| X06 | Handoff do drugiego klienta | Przyznany odczyt wystarcza do odebrania manifestu i artefaktu z poprawnym hashem; nie daje automatycznie prawa cancel/edycji |
| X07 | Pliki i przenośność | Jawny import/download nie zmienia niepowiązanych plików TLC; paczka działa bez ścieżek autora, nie wychodzi poza magazyn, zgłasza kolizję lub niewspierany format |
| X08 | Wersje | Obsługiwany kontrakt przechodzi przebieg, nieobsługiwany jest odrzucony przed mutacją; migracja zachowuje deklarowane dane, ID i historię |
| X09 | Adapter TLC i wynik NWN | Dokładne zasoby/przebieg mają zarejestrowane dowody; drift lub brak nagrania nie przechodzi jako sukces; brak runnera pozostawia działający edytor i CLI |
| X10 | Niezależny agent | Agent bez historii tego zadania wykonuje scenariusz z TLC na podstawie zainstalowanego skillu/help/schematów, bez czytania źródeł i ręcznej pomocy autora |

Próby używają odrębnych kont/sesji testowych o określonych prawach, kopii fixture oraz jawnego katalogu wyników. W V1 chodzi o kilku autoryzowanych wykonawców jednej lokalnej usługi, nie nowy system kont SaaS. Raport zawiera odpowiedzi CLI, ID operacji/jobów, hashe, wynik native i listę zmian plików konsumenta. Brak wymaganego testu to brak odbioru G5.

## 7. Pakiet dla kolejnego agenta

Wydanie dostarcza: instalowalne CLI, `--help` i JSON discovery, schematy/API, instrukcję konfiguracji, katalog błędów i wznowienia, przykłady create/edit/variant/render/build/download oraz companion skill dostępny spoza repo Studio. Skill uczy kolejności pracy i wskazuje schematy aktualnej instalacji; nie zawiera sekretów, stałych ID ani sposobów omijania API przez edycję bazy.

Zadanie TLC dostarczyło ten scenariusz i granice adaptera w turze `01a071e2-d5cb-7e20-ab74-58f657919133` w zadaniu [Zbadaj VFX w aurora-web](codex://threads/01a070e3-5df3-7913-943f-854ac8ea98ee). Niezależny konsument CLI został sprawdzony w 0.1.0, a WebMCP w Codex In-app Browser w 0.2.0. Pozostałe kryteria, zwłaszcza X09 i pełny odbiór NWN, pozostają częścią planu V1.
