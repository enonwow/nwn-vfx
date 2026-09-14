# NWN VFX Studio — plan implementacji i kryteria zakończenia

Data: **2026-09-05**. Status: **implementacja rozpoczęta; dostarczono wersję 0.1.0 alpha**. Bieżące wyniki i niezaliczone kryteria są w [raporcie odbioru](C:/Projects/nwn-vfx/docs/releases/0.1.0/acceptance.md). Poniższe kryteria pozostają docelowym planem V1, nie deklaracją ich pełnego zaliczenia.

Podstawa: [kierunek produktu](C:/Projects/nwn-vfx/docs/design/product-direction.md), [kontrakt człowiek/AI](C:/Projects/nwn-vfx/docs/design/human-ai-control-contract-draft.md) oraz [integracja agentów z innych projektów](C:/Projects/nwn-vfx/docs/design/external-agent-integration.md). Ten plan uszczegóławia kolejność i odbiór; nie zastępuje zasad operacji z kontraktu.

## 1. Rezultat, który dostarczamy

Webowy edytor VFX do NWN: człowiek tworzy i poprawia efekt w przeglądarce; agent z dowolnego projektu wykonuje te same operacje przez instalowalne `nwn-vfx` i wspólne API. Zapis, historia, ograniczenia i zadania należą do jednej usługi. Pierwsza instalacja backendu jest lokalna, a lokalny adapter NWN zapewnia osobną możliwość testowania w grze.

V1 obejmuje krótkie efekty impact: emitery Explosion i krótką emisję Fountain, animowaną geometrię oraz pojedyncze światło w potwierdzonym podzbiorze. Obowiązują dwa projekty odbiorcze: przeciążenie cewki i rozbicie fiolki alchemicznej. Każdy musi dać się edytować, porównać, przenieść i wyeksportować bez ręcznego poprawiania plików produktu.

**Obsługa agentów z innych projektów jest wymaganiem V1 od początku.** `the last city` jest pierwszym rzeczywistym konsumentem. Cwd, nazwa repozytorium ani otwarta karta nie wybierają automatycznie projektu Studio i nie nadają praw. Rdzeń nie zawiera ścieżek TLC, jego stałych wierszy VFX ani własnego launchera gry.

Poza V1: publiczny hosting i konta sieciowe, wieloosobowa edycja przez Internet, pełny importer binary MDL, dowolny graf VFX, symulacja cieczy, efekty długotrwałe, wbudowana orkiestracja agentów. MCP jest kolejnym adapterem po pierwszym działającym przebiegu; WebMCP wymaga dodatkowo testu hosta. Ich brak nie blokuje używania V1 przez zewnętrznych agentów przez CLI/API.

## 2. Podział implementacji

Poniższe katalogi są projektowanym podziałem pracy, nie istniejącymi pakietami. Początkowo wystarczy jedno repozytorium, jeden lockfile i jedna usługa.

| Moduł | Odpowiedzialność |
| --- | --- |
| `packages/contracts` | Schematy wejść/wyników, błędy, manifesty i rejestr operacji; generowane opisy API i adapterów |
| `packages/core` | Dokument, rewizje, ograniczenia, zmiany, warianty i reguły kwalifikacji; bez zależności od UI lub TLC |
| `apps/service` | API, lokalne sesje i uprawnienia, SQLite, pliki zasobów, transakcje, zdarzenia i kolejka zadań |
| `apps/web` | React/Vite: edytor, stan niezapisanej propozycji, podgląd i kontrola pracy AI |
| `apps/cli` | Instalowalne `nwn-vfx`, discovery, operacje, pliki, JSON i ograniczone oczekiwanie |
| `packages/renderer` | Jeden renderer Three.js dla karty i zarządzanego workera Chromium |
| `packages/nwn-format` | Ograniczony import/eksport MDL, TGA/TXI, HAK, odczyt zasobów i profil NWN |
| `adapters/nwn` | Połączenie z istniejącym centralnym runnerem, profile konsumentów i przypisanie dowodów do kandydata |
| `adapters/mcp`, `adapters/webmcp` | Późniejsze wejścia do tych samych operacji; bez własnego stanu dokumentów |
| `tests/fixtures`, `tests/acceptance` | Niezależne przykłady formatu, dwa efekty i scenariusze końcowego odbioru |
| `docs/agents`, `skills/nwn-vfx` | Instrukcja konsumenta i źródło instalowalnego companion skill, tworzone wraz z działającym CLI |

Podgląd interaktywny działa w przeglądarce. Backend zarządza bazą, zasobami i workerami. CLI przesyła wybrane pliki i pobiera wyniki przez API; inne projekty nie importują wewnętrznych modułów Studio.

## 3. Etapy i bramki odbioru

| Etap | Dostarczana funkcja | Zależność | Bramka zakończenia |
| --- | --- | --- | --- |
| P0 — fundament | Uruchamialny frontend/backend/CLI, wykonywalny kontrakt i wybór instancji | Brak | G0: instalacja deweloperska i discovery działają także z obcego katalogu |
| P1 — pierwszy efekt | Jeden emiter: UI + CLI + zapis + podgląd + ASCII + odczyt + wczesna próba NWN | P0 | G1: zmiana parametru i skali rodzica przechodzi cały przebieg bez utraty znaczenia |
| P2 — trwała współpraca | Historia, konflikty, undo, kontrola AI, trwałe joby, render bez karty | P1 w części web/CLI | G2: próby współbieżności, restartów i retry nie gubią ani nie powielają skutków |
| P3 — edytor V1 | Warstwy, oś czasu, zasoby, warianty A/B, projekty i dwa efekty | P1; integracja z P2 | G3: oba efekty powstają i są poprawiane przez UI oraz CLI bez zmian kodu generatorów |
| P4 — droga do NWN | Pełny eksport V1, odczyt, pakowanie, kwalifikacja profilu i adapter runnera | Rozpoczęcie po P1; odbiór po P2/P3 | G4: dokładne dwa kandydaty mają zapisane wyniki i dowody z NWN |
| P5 — zewnętrzny konsument | Instalacja, kompatybilność, dokumentacja, skill i pełny scenariusz TLC | Rozpoczęcie w P0; odbiór po P2–P4 | G5: niezależny agent z TLC wykonuje przebieg, a drugi uprawniony klient odbiera wynik |
| P6 — odbiór wydania | Wspólna próba użytkownika, czysta instalacja i raport wydania | G0–G5 | G6: spełniona definicja zakończenia z sekcji 7 |
| P7 — adaptery AI | MCP; opcjonalny WebMCP i kontekst konkretnej karty | Pierwszy przebieg UI/CLI; mutacje wymagają P2 | Osobna bramka adaptera; nie jest bramką wydania CLI/API V1 |

P0/P1 rozwijają wcześniejszy etap A, P2/P3 etap B, P4–P6 etap C, a P7 etap D. Integracja z innymi projektami przebiega przez wszystkie etapy; P5 jest jej końcowym odbiorem.

### P0 — fundament i wykonywalny kontrakt

Prace:

- Utworzyć workspace TypeScript, przypiąć wersje zależności, polecenia build/typecheck/test oraz konfigurację uruchomienia web/API/CLI. Sprawdzić dostępność binariów SQLite i Chromium na docelowym Windows.
- Zaimplementować minimalny rejestr operacji, walidację wejścia **i wyniku**, schemat dokumentu, kontraktu i artefaktu. Wersjonować je oddzielnie. Capabilities pokazują tylko dostarczone funkcje.
- Utworzyć bazę, migrację początkową, magazyn zasobów i identyfikatory instancji/workspace/projektu. Jeden właściciel zapisu; start kolejnego klienta nie tworzy konkurencyjnej bazy.
- Dostarczyć sesję właściciela UI oraz lokalny pairing klienta CLI z zakresem projektu i operacji. Sprawdzać prawa w usłudze; nie przyjmować tożsamości z dowolnego `actorId` w JSON.
- Dostarczyć `version`, `doctor`, `workspaces list`, `projects list/resolve`, `operations list`, `schema get` i jawne zarządzanie uruchomieniem usługi. Ustalić pierwszeństwo konfiguracji i politykę braku połączenia zgodnie z dokumentem integracji.

**G0:** po instalacji CLI nowy terminal z obcego katalogu uruchamia help/doctor; UI i CLI pokazują tę samą instancję. Brak usługi, błędne wejście, niezgodna wersja i brak prawa dają określony JSON i kod wyjścia. Dwa projekty o tej samej nazwie nie prowadzą do przypadkowego wyboru. Backend nie daje nieautoryzowanego dostępu tylko dlatego, że klient łączy się lokalnie.

Dowód: wersje i polecenia odtworzenia instalacji, zanonimizowane odpowiedzi discovery oraz test schematów i wyboru instancji. G0 nie oznacza jeszcze działającego edytora VFX.

### P1 — pierwszy działający przebieg i próba ryzyka

Prace:

- Dodać create/inspect oraz preview/apply pojedynczej zmiany, z rewizją, idempotencją i atomowym zapisem operacji oraz zdarzenia. Po restarcie odczytywać zatwierdzony dokument.
- Zbudować mały ekran webowy: projekt, jeden emiter, parametry rozmiaru/czasu/koloru, play/pause, zapis i pobranie eksportu. Zapewnić równoważne operacje CLI od tego etapu.
- Wprowadzić wspólny model parametrów, jednostek, seeda i czasu. Pierwszy eksporter ASCII MDL oraz odczyt faktycznie zapisanych danych sprawdzić także na niezależnych fixture'ach.
- Porównać bazę z wariantem różniącym się rozmiarem emitera, następnie przypadek niejednostkowej skali rodzica. Uruchomić te zasoby przez istniejący centralny tor NWN i kwalifikowany mały fixture; zarejestrować dokładny build gry i ograniczenia podglądu.

**G1:** człowiek w przeglądarce i agent przez CLI zmieniają ten sam projekt; zapis przeżywa restart; eksport zawiera oczekiwane parametry i zdarzenia. Dowód natywny pozwala ocenić rozmiar, start, zanik i kierunek zmiany. Losowe pozycje cząstek nie muszą być identyczne piksel po pikselu.

Dowód: dwie wersje dokumentu, diff, hashe eksportu, raport odczytu i powiązany materiał z NWN. Brak runnera lub dowodu oznacza niezaliczoną część natywną G1. Niezależne P2 i część P3 mogą postępować; nie utrwalamy w UI niepotwierdzonych założeń jako zgodności z grą.

### P2 — trwałość, człowiek i agent

Prace:

- Wdrożyć pełną obsługę rewizji, historii, ograniczeń parametrów, selektywnego cofnięcia oraz odtworzenia rewizji jako nowej zmiany. Cofnięcie zależnej lub nieobsługiwanej zmiany strukturalnej ma jawnie odmówić.
- Rozdzielić zapisany stan, lokalną propozycję formularza i stan widoku. Zdarzenia po reconnect nadrabiają trwały dziennik; stary render nie podmienia aktualnej wersji.
- Wdrożyć „Wstrzymaj zapisy AI”, prawa do zmiany polityki oraz kontrolę uprawnień przy commit. Człowiek widzi rzeczywistego aktora, zakres i historię operacji.
- Zapisywać job, snapshot, idempotencję i zamiar wykonania przed zwróceniem `accepted`. Dostarczyć status, listowanie, bounded wait, anulowanie i odzyskanie kontekstu po utracie odpowiedzi.
- Wdrożyć worker renderujący tym samym rendererem przy zamkniętej karcie, z wersją sceny, kamery, czasu i seeda w wyniku. Rejestrować artefakty dopiero po pełnym zapisie i sprawdzeniu hasha.

**G2:** przechodzą wszystkie scenariusze C01–C08 z sekcji 5. Proces restartuje się bez utraty zatwierdzonych zmian i bez automatycznego powtórzenia niepewnego skutku natywnego. Render bez karty daje rzeczywisty obraz/film tej rewizji; wspólny kod obu hostów jest uzupełniony próbą porównawczą.

Dowód: raport testów integracyjnych z wymuszonym przerwaniem odpowiedzi/procesu, stan operacji i jobów po odzyskaniu, porównanie UI/CLI oraz artefakty renderu.

### P3 — pełny przebieg tworzenia VFX

Prace:

- Dostarczyć bibliotekę/pusty projekt, listę warstw i ich operacje, inspektor, oś czasu, izolowanie warstw, tło i skalę postaci, import tekstur oraz edycję ruchu/alpha/krzywych.
- Wdrożyć trzy rodzaje warstw w ograniczonym profilu V1. Odróżnić czas efektu od wieku cząstki i reprezentowalne krzywe od nieobsługiwanych. Światło odblokować po osobnej kwalifikacji.
- Dostarczyć fork/variant, A/B, diff, uwagi do rewizji/warstwy/czasu oraz zapis oceny człowieka. Każda trwała funkcja ma operację CLI.
- Wdrożyć ZIP projektu z zależnościami i pochodzeniem oraz kontrolowany import ASCII MDL. Nieobsługiwane dane zachować w oryginale i zgłosić; eksport nie może po cichu ich zgubić.
- Przenieść Coil do wejściowego dokumentu Studio i przygotować fiolkę przez te same typy i generatory. Nie dodawać rozgałęzień zależnych od nazwy efektu ani drugiego źródła parametrów w skryptach.

**G3:** dla obu efektów UI i CLI zmieniają teksturę/alfę, ruch oraz czas błysku; tworzą i porównują warianty; przenoszą projekt przez paczkę i odczytują ten sam stan wraz z zależnościami. Parametry zablokowane przez człowieka pozostają nienaruszone. Brak zakwalifikowanego światła pozostaje brakującym wymaganiem V1.

Dowód: dwa przenośne projekty, zapis ich przejścia przez UI i CLI, diff wariantów i raport importu/eksportu. Właściciel potrafi wskazać wariant i zapisać ocenę z poziomu edytora.

### P4 — eksport i kwalifikacja NWN

Prace:

- Wdrożyć docelowy eksport ASCII MDL, TGA/TXI, HAK i przygotowanie dema. Rozwiązywać nazwy/resrefy, wiersze 2DA, zależności i kolejność HAK z profilu; wykrywać kolizje dwóch efektów.
- Odczytywać wygenerowane pliki, klucze animacji, zdarzenia, tekstury i powiązania; testować reader/writer niezależnymi przykładami, także przykładami błędnymi.
- Związać kandydata z rewizją/snapshotem, wersją generatora, profilem i hashami. Wykrywać zmianę zależności przed uruchomieniem testu.
- Podłączyć centralny runner przez adapter i konfigurację konsumenta. Własność procesu, profil, monitor i dowody pozostają regułami tego runnera. Po restarcie uzgodnić istniejące wykonanie, zanim zostanie rozważone kolejne.
- W oddzielnych wynikach zapisać integralność, wykonanie, widoczność, zgodność zachowania, kompletność dowodów oraz ocenę artystyczną człowieka.

**G4:** dwa dokładnie wskazane kandydaty przechodzą odczyt zasobów i test w zakwalifikowanym profilu NWN; wymagany materiał jest dostępny i związany z rzeczywiście uruchomionym MOD/HAK/modelem. Krótki Fountain, geometria i światło mają potwierdzony używany podzbiór. Brak filmu, niewidoczny efekt i nieuruchomiony test są różnymi wynikami.

Dowód: manifest kandydata, raport odczytu, build gry/profil, uporządkowana lista HAK i hashe, wynik runnera oraz powiązane nagrania/zrzuty. Jeśli natywny Save zmienił MOD, dowód wskazuje to wyjście i jego pochodzenie; nie podpisuje go hashem wcześniejszego pliku.

### P5 — agenci innych projektów i dystrybucja

Prace:

- Dostarczyć instalację dla bieżącego użytkownika, prywatne wymagane runtime'y i `nwn-vfx` na PATH. Nowy terminal oraz uruchomienie poza repo muszą działać bez środowiska deweloperskiego.
- Udostępnić opis API, przykłady JSON, błędy, schemat manifestu przekazania, politykę wersji i aktualizacji. Companion skill instalować do miejsca dostępnego agentom z innych repozytoriów; samo źródło skillu wewnątrz Studio nie wystarcza.
- Zrealizować cały scenariusz TLC opisany w dokumencie integracji i odbiór wyniku przez drugiego uprawnionego aktora. Instrukcje nie mogą zakładać historii obecnego zadania.
- Sprawdzić, że projekt wywołujący nie otrzymuje niezamierzonych zmian; tylko jawnie wybrane pliki wejścia/wyjścia i osobna autoryzowana integracja mogą go dotykać.

**G5:** wszystkie scenariusze X01–X10 w dokumencie integracji przechodzą. Agent rozpoczynający pracę z katalogu `C:\Projects\the last city` wykonuje je na podstawie zainstalowanego CLI/skillu i dokumentacji, bez otwierania źródeł Studio. To test rzeczywistego konsumenta, a nie samo sprawdzenie wywołań przez autora aplikacji.

Dowód: raport czystej instalacji, protokół pracy niezależnego agenta, manifesty/pobrane hashe, wynik przekazania i lista faktycznych zmian w katalogu konsumenta. Integracja natywna odbywa się w wyznaczonym fixture/staging zgodnie z zakresem projektu.

### P6 — odbiór wydania

Prace: odtworzyć pełny przebieg sekcji 7 na kandydacie wydania, sprawdzić instalację/aktualizację i opublikować lokalny raport odbioru z dowodami oraz znanymi ograniczeniami. Naprawić błędy blokujące, bez ponownego uruchamiania wszystkich prób, jeżeli zmiana uzasadnia tylko wąski ponowny test.

**G6:** wszystkie obowiązkowe bramki i kryteria końcowe są zaliczone dla wskazanej wersji. Raport nie opiera się na starszym eksporcie lub innym buildzie aplikacji.

### P7 — MCP i opcjonalny WebMCP

MCP udostępnia operacje i wyniki tego samego rdzenia, zachowuje uprawnienia oraz semantykę jobów, retry i błędów. Przypiąć faktycznie przetestowane wersje SDK/protokołu/hosta. WebMCP dodatkowo wiąże operacje widoku z konkretnym `viewSessionId`; brak wsparcia hosta pozostawia działające UI/CLI.

Odbiór każdego deklarowanego adaptera wymaga rzeczywistego wywołania przez jego host: discovery → zmiana → konflikt → job → wynik. Sam wygenerowany opis narzędzi lub mock nie oznacza integracji. Nie zmieniamy przy tej okazji formatu dokumentu ani reguł zapisu.

## 4. Kolejność pracy równoległej

Po P0 można rozdzielić frontend, CLI oraz renderer/eksporter, pracując na jednym minimalnym rejestrze operacji. Po pierwszym przebiegu P1 prace nad trwałością P2, edytorem P3 i kwalifikacją P4 mogą postępować równolegle. Natywne wykonanie ma jednego właściciela; niezależni agenci nie uruchamiają konkurencyjnych testów gry.

Osoba/agent integrujący odpowiada za wspólny kontrakt i odbiór etapu. Wykonawca UI nie tworzy osobnego zapisu projektu; wykonawca CLI nie czyta SQLite; wykonawca adaptera TLC nie przenosi polityk swojego repo do rdzenia. Zmiana schematu lub semantyki operacji wymaga aktualizacji wszystkich jej klientów i odpowiednich prób zgodności.

Nie przypisujemy dat ani fikcyjnych procentów ukończenia. Pierwszą estymację dalszych prac należy sporządzić po G1, na podstawie rzeczywistych trudności formatu i podglądu.

## 5. Obowiązkowe próby trwałości i kontroli

| ID | Próba | Warunek zaliczenia |
| --- | --- | --- |
| C01 | Dwa zapisy tego samego pola z tej samej rewizji | Jeden commit, drugi jawny konflikt; żadnej utraconej edycji |
| C02 | AI zmienia szerokość, człowiek kolor; cofnięcie AI | Powstaje nowa rewizja cofająca szerokość i zachowująca kolor; późniejsza zależna zmiana powoduje konflikt |
| C03 | Utrata odpowiedzi po commit, później nowa rewizja i retry | Ten sam klucz zwraca pierwotną operację; inna treść z tym kluczem daje konflikt; brak drugiego skutku |
| C04 | Restart po `accepted`, przed startem i podczas pracy | Trwały job i wejście są odzyskiwane; niepewny skutek zewnętrzny trafia do uzgodnienia |
| C05 | Cancel przed startem, podczas pracy i po końcu | Stan odpowiada rzeczywistemu wykonaniu; cancel nie udaje rollbacku, timeout/Ctrl+C klienta nie anuluje joba |
| C06 | Człowiek wstrzymuje AI lub odbiera prawa podczas pracy | Kontrola przy commit blokuje nowy zapis; worker sprawdza prawa przed następnym skutkiem; zapis już zatwierdzony pozostaje w historii |
| C07 | Reconnect, brak starego kursora, niezapisany formularz i opóźniony render | Odtworzenie snapshotu/dziennika bez nadpisania propozycji; stary wynik jest oznaczony własną rewizją |
| C08 | Zamknięta karta, brak NWN i awaria workera renderu | CLI zapisuje/eksportuje; sprawny worker renderuje bez karty; brak renderera zgłasza błąd, brak NWN ogranicza test natywny |

Schematy i krytyczne reguły otrzymują testy jednostkowe; transakcje/restarty testy integracyjne z rzeczywistą bazą; przebiegi człowieka testy przeglądarkowe; zgodność NWN rzeczywisty odbiór natywny. Nie wyznaczamy arbitralnego procentu pokrycia jako zamiennika tych prób.

## 6. Rejestr dowodów

Każda bramka ma status `not_started`, `in_progress`, `passed`, `failed` albo `blocked`, datę, wykonawcę, wersję/commit aplikacji, środowisko oraz odnośniki do wyników. `blocked` zapisuje konkretną brakującą zależność i następny krok; nie jest zaliczeniem. Te statusy dotyczą raportu planu, nie narzędzia celów ani protokołu jobów.

Projektowany raport wydania: `docs/releases/<version>/acceptance.md` wraz z maszynowym indeksem wyników. Duże dowody mogą pozostać artefaktami usługi, ale muszą mieć zachowane ID, hash i sposób pobrania. Surowe tokeny i prywatne ścieżki magazynu nie trafiają do instrukcji konsumenta.

Zapisujemy osobno testy automatyczne, odbiór przeglądarkowy, native proof i ocenę człowieka. Mierzymy opóźnienie podglądu i czas przygotowania wariantu na opisanym sprzęcie/scenie; wcześniejsze cele 150 ms p95 i 10 minut pozostają celami do kalibracji po P1. Nie ogłaszamy ich osiągnięcia bez pomiarów ani nie dobieramy progu po wyniku, by zamknąć etap.

## 7. Definicja zakończenia V1

- [ ] **Web:** po udokumentowanej instalacji człowiek wykonuje cały przebieg w zwykłej przeglądarce: nowy/preset → edycja → A/B → uwaga/wybór → eksport. Zainstalowane NWN nie jest wymagane do tej części.
- [ ] **Dwa efekty:** cewka i fiolka używają tych samych typów warstw i generatorów; dokument wejściowy steruje podglądem i eksportem. Nie ma ręcznych poprawek eksportowanych plików.
- [ ] **CLI i inne projekty:** wszystkie trwałe funkcje V1 mają CLI/API; niezależny agent z TLC wykonuje X01–X10, a drugi uprawniony klient odczytuje przekazany job i artefakt. Instalowany skill wystarcza do rozpoczęcia pracy.
- [ ] **Kontrola człowieka:** wspólna historia, blokady parametrów, konflikty, selektywne undo i wstrzymanie zapisów AI przechodzą C01–C08.
- [ ] **Trwałość:** restart, utrata odpowiedzi i ponowienie nie gubią ani nie powielają zatwierdzonych operacji; joby i niezmienne artefakty można odzyskać.
- [ ] **Przenośność:** import/eksport projektu zachowuje obsługiwany stan i zależności bez ścieżek komputera autora; nieobsługiwane dane są jawne. Aktualizacja nie omija polityki migracji.
- [ ] **Render:** obraz i krótki film zadanej rewizji powstają przez CLI bez otwartej karty, z tym samym rendererem co UI i zapisanym wynikiem porównania hostów.
- [ ] **NWN:** oba kandydaty przechodzą odczyt eksportu oraz test potwierdzonego profilu; obsługiwane emitery, geometria i światło mają dowody. Pakiet wiąże dokładne zasoby faktycznie użyte w grze.
- [ ] **Użytkownik:** właściciel obejrzał przebieg, potrafi wskazać i zachować poprawiony wariant obu efektów; jego ocena nie została wymyślona przez agenta.
- [ ] **Wydanie:** instalacja bez kompilatora i repo źródłowego, zgodność kontraktu, wymagane testy, dokumentacja i raport G0–G6 są kompletne; brak otwartych błędów blokujących którykolwiek obowiązkowy punkt.

Brak obowiązkowego punktu pozwala opisać konkretnie działający prototyp lub częściowy etap. **Nie pozwala oznaczyć pełnej V1 jako ukończonej.** Opcjonalne adaptery mają własny status; brak WebMCP nie ukrywa żadnego braku CLI ani nie blokuje zaliczonej V1.

Najbliższa jednostka pracy: **P0, następnie mały przebieg P1**. Nie rozpoczynać od rozbudowanej galerii, wbudowanego chatu ani integracji wymagającej gotowego hosta WebMCP.
