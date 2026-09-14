# Audyt zadania „Zbadaj VFX w aurora-web” i planu VFX Studio

Data: **5 września 2026**. Audytowane zadanie: [Zbadaj VFX w aurora-web](codex://threads/01a070e3-5df3-7913-943f-854ac8ea98ee). Repozytorium raportu: `C:\Projects\nwn-vfx`.

**Wniosek: kierunek architektury jest trafny, ale kontrakt v1 nie wystarcza do zbudowania aplikacji równorzędnie obsługiwanej przez człowieka i AI. CLI trzeba uznać za obowiązkowy interfejs produktu. WebMCP powinien być dodatkowym adapterem do wspólnego rdzenia.** Autor po pytaniach audytowych potwierdził najważniejsze braki.

Nie znalazłem podstaw, aby uznać, że autor przedstawiał gotowe Studio jako zaimplementowane: ostatni kontrakt i odpowiedź końcowa jawnie opisują propozycję. Niepełne są zakres operacji i decyzje wykonawcze. Zasługują na korektę przed implementacją, a nie na zastąpienie całego dotychczasowego audytu.

## 1. Zakres i sposób weryfikacji

- Przeczytano 16 wcześniejszych tur audytowanego zadania: od pierwotnego audytu, przez Coil V1–V3, po projekt Studio i kontrakt agentów. Następnie wysłano sześć pytań, zaczekano na zakończenie odpowiedzi i odczytano ją w całości.
- Odpowiedź autora: tura `01a071b7-64ce-7ee0-9c1f-c94aec619c13`, zakończona 2026-09-05 około 15:24 czasu lokalnego. Autor miał wyraźne polecenie odpowiedzi read-only, bez implementacji i bez uruchamiania gry.
- Sprawdzono [pierwotny raport](<C:/Projects/the last city/docs/audits/vfx-audit-aurora-web-meshy2aurora-2026-09-05.md>), [kontrakt v1](<C:/Projects/the last city/docs/contracts/tlc-vfx-studio-agent-contract-v1.md>), notatki obu projektów, wybrane aktywne źródła Aurora Web/Meshy2Aurora i zapisane dowody Coil V3.
- Osobne odczyty kontrolne objęły źródła Meshy2Aurora oraz aktualne dokumentacje protokołów. Zastosowano rozróżnienie dowodu i obserwacji z aurora-toolset-prove oraz wzorce projektowania CLI z cli-creator.
- Nie wykonano testów aplikacji, benchmarku, przeglądarki, Toolsetu ani NWN. Nie przeprowadzono ponownej dekompilacji silnika, pełnego przeglądu wszystkich plików i filmów ani nowego pomiaru wizualnej zgodności. Wnioski o aktualnym kodzie są statyczne; obserwacje runtime pochodzą z zachowanych artefaktów.
- Początkowo `nwn-vfx` zawierał wyłącznie `.git` i nie miał commitów. Ten audyt dodaje dokumentację; nie dodaje aplikacji, CLI ani endpointów. Nie zmieniano kodu i zasobów pozostałych projektów.

## 2. Najważniejsze braki

P1 oznacza element potrzebny przed odbiorem pierwszego wspólnego workflow UI/AI; P2 — wymagane doprecyzowanie przed wdrożeniem danego adaptera lub komponentu. To priorytety planu, nie twierdzenie o regresji nieistniejącej aplikacji.

### P1 — Katalog operacji nie obejmuje całego procesu tworzenia efektu

[Kontrakt:58](<C:/Projects/the last city/docs/contracts/tlc-vfx-studio-agent-contract-v1.md:58>) nazywa katalog pełną drogą edycji, lecz operacje zakładają już istniejący projekt i warstwy. [Linia 78](<C:/Projects/the last city/docs/contracts/tlc-vfx-studio-agent-contract-v1.md:78>) jawnie odkłada import i notatki, a [lista patchy:86](<C:/Projects/the last city/docs/contracts/tlc-vfx-studio-agent-contract-v1.md:86>) nie definiuje tworzenia/usuwania/reorder warstw. Brakuje także odkrywania projektów, odczytu historii oraz zapisu ocen i ograniczeń.

**Skutek:** agent może zmienić parametr gotowego przykładu, ale nie rozpocząć i domknąć tego samego zadania co człowiek bez ręcznej edycji plików. Autor potwierdził, że określenie zakresu było zbyt szerokie.

**Uzupełnienie:** lifecycle projektu i zasobów, struktura warstw, ograniczenia, historia, uwagi do wersji/czasu i eksport edytowalnego projektu. Nie trzeba dodawać osobnego `save`, jeśli `patch apply` już atomowo utrwala rewizję — trzeba jasno przypisać semantykę przyciskowi UI i CLI.

### P1 — „API/CLI” nie stanowi wymaganego kontraktu CLI

[Decyzja architektoniczna:7](<C:/Projects/the last city/docs/contracts/tlc-vfx-studio-agent-contract-v1.md:7>) przewiduje adapter API/CLI, ale nie podaje instalowalnego polecenia, odkrywania komend, stdin/plików, kodów wyjścia, trybu nieinteraktywnego i zachowania po utracie połączenia. W trakcie audytu nie znaleziono `nwn-vfx` ani `tlc-vfx` na PATH. Nie oznacza to, że na komputerze nie ma innych skryptów konsolowych.

**Skutek:** można dostarczyć samo API i nadal uznawać zapis „API/CLI” za spełniony. To nie spełnia doprecyzowanego wymagania użytkownika. Autor przyznał tę nieścisłość.

**Uzupełnienie:** obowiązkowy CLI od pierwszej edytowalnej wersji, te same trwałe operacje co UI, komendy `doctor`, capabilities/schemas, projekty, patch/diff, undo, build, jobs i artifacts. Szczegóły, przykłady i proponowane kody wyjścia są w [projekcie sterowania](C:/Projects/nwn-vfx/docs/design/human-ai-control-contract-draft.md).

### P1 — Przywrócenie całej rewizji nie jest cofnięciem jednej zmiany AI

[`revision_restore`:67](<C:/Projects/the last city/docs/contracts/tlc-vfx-studio-agent-contract-v1.md:67>) tworzy nową rewizję o historycznej treści. `expectedRevision` chroni przed nieaktualnym zapisem, ale po odczytaniu świeżej rewizji pełny restore nadal może usunąć późniejszą pracę człowieka z aktywnego dokumentu. Historia pozostaje zachowana; nie jest to trwałe skasowanie danych.

**Przykład:** AI zwęża łuk, człowiek później zmienia kolor dymu. „Cofnij zmianę AI” powinno przywrócić tylko szerokość łuku i zachować dym. Pełne restore zmieni oba elementy.

**Uzupełnienie:** osobne `changes revert` po `operationId`, zapis zakresu/wartości przed i po, kontrola zależności oraz konflikt przy późniejszej zmianie tego samego pola. Restore całego projektu zachować jako jawnie odmienną akcję. Autor potwierdził brak selective undo.

### P1 — Trwałość i współpraca z UI są wymaganiami, lecz nie mają uzgodnionej realizacji

Kontrakt v1 dobrze wymaga atomowości, kontroli rewizji, idempotencji i trwałych zadań. Nie ustala jednak właściciela zapisu, magazynu, granicy transakcji z plikami, wznowienia workera ani relacji między niezapisanym formularzem człowieka a zewnętrzną zmianą AI.

**Skutek:** osobny zapis z CLI i zapis z UI mogą ominąć wspólną kontrolę. Nawet poprawne CAS w bazie nie rozwiązuje samo niezapisanych suwaków, utraconych zdarzeń i zbyt późnego wyniku renderowania.

**Uzupełnienie:** jedna lokalna usługa zapisująca, transakcyjny rejestr dokumentów/operacji/zadań, zdarzenia po commit i odczyt od kursora. Rozdzielić trwały dokument, niezapisaną propozycję oraz kontekst konkretnej karty. Człowiek widzi autora, zakres i stan operacji, może anulować zadanie oraz wstrzymać zapisy AI. Te reguły obowiązują wykonawcę, nie tylko przyciski.

### P1 — „Sprawdź w NWN” nie jest jeszcze gotową funkcją Studio

Istnieje konkretna użyta droga centralnego AUR-S07 i profil Coil V3. Nie należy ich opisywać jako nieistniejących. Jednocześnie [RUN-NOTES:13](C:/Projects/nwn/VFX/work/coil-overload-v3/evidence/native-demo/RUN-NOTES.md:13) pozostawia niezamknięty finalizer geometrii; [linia 27](C:/Projects/nwn/VFX/work/coil-overload-v3/evidence/native-demo/RUN-NOTES.md:27) opisuje odrzucone nagranie, a [linia 31](C:/Projects/nwn/VFX/work/coil-overload-v3/evidence/native-demo/RUN-NOTES.md:31) — niewłaściwy plik logu w uzbrojonym profilu.

Odczyt `vfx-v3-nwn.capture.json` potwierdził `status: failed`, `blockerCode: capture_identity_or_occlusion_drift`, `capturedArtifactPreserved: false`. W sprawdzonym katalogu runtime nie ma oczekiwanego MP4. Zachowane znaczniki READY/PULSE świadczą o wykonaniu skryptu. Pozytywna wypowiedź użytkownika o wyglądzie pozostaje jego obserwacją, a nie pełnym pakietem weryfikacji.

**Uzupełnienie:** konkretny adapter centralnego runnera, profil, jawne stany i kwalifikacja scenariusza VFX. Oddzielić uruchomienie, wykonanie skryptu, widoczność, zgodność zachowania, opinię artystyczną i kompletność dowodu. Nie restartować gry ani nie naprawiać narzędzia w ramach tego audytu. Autor potwierdził ten stan.

### P2 — Istniejące mechanizmy zadań nie spełniają automatycznie nowego kontraktu

Aktualny [serwis zadań Aurora Web:77](C:/Projects/aurora-web/backend/src/modules/processing-jobs/application/processing-jobs.application.service.ts:77) wyszukuje istniejące zadanie po samym `idempotencyKey` i zwraca jego wynik. W tej ścieżce nie porównuje hasha nowego polecenia ani jego aktora. Nowy kontrakt VFX wymaga związania klucza z wykonawcą, projektem i treścią oraz `IDEMPOTENCY_CONFLICT` przy zmianie wejścia. Serwis ma repozytorium i odzyskiwanie; nie należy błędnie nazywać go wyłącznie kolejką w pamięci.

Podobnie Meshy bridge ma [nonce w pamięci:253](C:/Projects/meshy2aurora/tools/meshy-local-bridge/index.mjs:253), a [rezerwacja:835](C:/Projects/meshy2aurora/tools/meshy-local-bridge/index.mjs:835) następuje po `await` odczytu salda. Statycznie istnieje możliwość przejścia dwóch żądań przez wstępne sprawdzenie; nie odtwarzano tego testem. Powtórzenie sekwencyjne daje odrzucenie, nie odtworzenie poprzedniego `jobId`.

**Uzupełnienie:** traktować te elementy jako punkty odniesienia. Nowy wykonawca potrzebuje atomowego zapisu idempotencji i wyniku oraz testu powtórzenia po restarcie i utracie odpowiedzi. Audyt nie zmienia ani nie certyfikuje tych serwisów.

### P2 — Strategia użycia kodu i profilów rendererów musi być konkretna

Potwierdzono, że [zagnieżdżony renderer:2777](C:/Projects/aurora-web/frontend/src/modules/layout/adapters/three/auroraVfxCanonicalRenderer.ts:2777) nadal stosuje tylko `templateBaseScale`; telemetryczny opis nadal deklaruje wyłączenie skali modelu. Wniosek o sprzeczności z silnikiem opiera się na wcześniejszym audycie źródłowym — nie na nowej próbie NWN. W Meshy2Aurora nadal istnieją luki readera, IR, writera i animacji emiterów opisane w poprzednim raporcie.

Reguła [reference-only Meshy2Aurora:80](C:/Projects/meshy2aurora/documentation/PROJECT_RULES.md:80) ogranicza używanie Aurora Web w produkcie Meshy2Aurora znacznie szerzej niż zakaz kopiowania renderera. Istnieje wyjątek dla wspólnych narzędzi operacyjnych. Nie rozciągamy automatycznie tej reguły na osobny `nwn-vfx`.

**Uzupełnienie:** lista komponentów z decyzją „własna implementacja / biblioteka / adapter / referencja”, pochodzeniem, granicami i zakresem wsparcia. Nie przenosić całego podglądu jako wiarygodnego emulatora NWN. Ograniczenia muszą widzieć zarówno człowiek, jak i agent w capabilities.

## 3. Co dotychczas wykonano dobrze

- Autor rozdzielił podgląd poza grą i uruchomienie NWN; ostatnie dokumenty nie przedstawiają Studio jako gotowego produktu.
- Kontrakt uwzględnia CAS, atomowe listy zmian, idempotencję po restarcie, niezmienny snapshot, drift wejścia, limity i utratę artefaktów. Nie trzeba projektować tych zasad ponownie.
- Poprawnie oddzielono WebMCP od serwerowego MCP. Autor użył aktualnego `document.modelContext`, wskazał draft i brak natywnego `outputSchema` w WebMCP. Nie znaleziono tu błędu polegającego na użyciu starego `navigator.modelContext`.
- Źródłowo potwierdzają się ważne ograniczenia obu projektów. Autor nie ukrył odrzuconego nagrania ani pomylenia plików logu profilu.
- Kolejność „jeden efekt przez edycję, eksport i ocenę w NWN” odpowiada problemowi jakości. Liczba nowych paneli lub testów sama jej nie zastąpi.

## 4. Pytania do autora i uzyskane rozstrzygnięcia

| Pytanie audytowe | Odpowiedź autora i wynik |
| --- | --- |
| Co działa, a co jest planem? Gdzie ma być Studio? | Działają rozproszone skrypty i komponenty; Studio/CLI/WebMCP to propozycja. Repo produktu wcześniej nie było wybrane. |
| Dlaczego brak lifecycle projektu, warstw i pełnego CLI? | Katalog celowo ograniczono do istniejącego efektu, lecz nazwano zbyt szeroko. Autor zgodził się z obowiązkowym pełnym CLI. |
| Jaki runner i czy zamknięto odbiór Coil V3? | AUR-S07, `central_guarded_test_module_action`; rzeczywisty dispatch, ale brak zaliczonego pakietu i MP4 oraz niezamknięte bramki profilu. |
| Jak cofnąć tylko zmianę AI? | Obecny restore nie wystarcza. Potrzebna operacja undo konkretnej edycji z kontrolą konfliktów. |
| Gdzie trwały stan, transakcje, bridge i headless CLI? | Wymagania są opisane, ale decyzje technologiczne i scenariusze odzyskiwania pozostają otwarte. |
| Co można wykorzystać z innych projektów? | Konieczne rozdzielenie granic produktowych, referencji i wspólnych narzędzi operacyjnych; brak zatwierdzonej listy przenoszonych komponentów. |

Dokładny wskazany profil: [aur-s07-runtime-profile.json](C:/Projects/nwn/VFX/work/coil-overload-v3/runtime/aur-s07-runtime-profile.json), ID `tlc-coil03-native-vfx-runtime-v1`, z centralnym [aur-s07-runtime-execution.mjs](C:/Projects/aurora-web/backend/scripts/aur-s07-runtime-execution.mjs). Autor podczas odpowiedzi ponownie odczytał hash profilu/HAK/MDL; hash zainstalowanego MOD przytoczył historycznie z powodu blokady pliku. Ten audyt nie przedstawia go jako nowego pomiaru.

Użytkownik otrzymał jedno pytanie o osobną aplikację w `nwn-vfx` albo moduł Aurora Web. W chwili zapisu nie otrzymano odpowiedzi. Osobna aplikacja jest rekomendacją, nie potwierdzoną decyzją właściciela; sam raport jest zapisany w bieżącym repozytorium.

## 5. CLI, WebMCP i inne wzorce

Rekomenduję **UI + wymagany CLI + MCP server + opcjonalny WebMCP**, wszystkie nad jednym rdzeniem i stanem. Sam protokół nie zapewnia historii, transakcji ani ochrony niezapisanej pracy człowieka.

| Mechanizm | Do czego służy | Decyzja dla tego projektu |
| --- | --- | --- |
| CLI | Pełna automatyzacja i obsługa lokalna bez karty | Fundament pierwszego odbioru |
| API + JSON Schema/OpenAPI | Opis i transport tych samych operacji | Wspólny kontrakt, bez ręcznie powielanych modeli |
| MCP | Odkrywalne narzędzia dla zgodnych klientów AI | Cienki adapter po działającym UI/CLI |
| WebMCP | Narzędzia i kontekst aktualnej strony | Dodatkowy adapter, niezależny od podstawowej dostępności Studio |
| MCP Apps | Interaktywny podgląd/panel A/B w rozmowie | Opcjonalne rozszerzenie, jeśli potrzebne w konkretnym hoście |

Stan źródeł 2026-09-05: WebMCP pozostaje draftem CG z 4.09.2026, nie standardem W3C; Chrome dokumentuje origin trial od 149. Nie sprawdzano obsługi w przeglądarce użytkownika. [Draft WebMCP](https://webmachinelearning.github.io/webmcp/), [Chrome](https://developer.chrome.com/docs/ai/webmcp).

Aktualna publikacja MCP 2026-07-28 zmieniła model sesji i przeniosła Tasks do rozszerzenia. Dotychczasowy kontrakt cytował 2025-11-25 jako przykład, więc nie jest to automatycznie błąd; wdrożenie wymaga jawnego przypięcia wersji zgodnej z hostem i SDK. [Changelog MCP](https://modelcontextprotocol.io/specification/2026-07-28/changelog). OpenAPI opisuje HTTP, a MCP Apps zapewnia interaktywny interfejs w kompatybilnym hoście. [OpenAPI](https://spec.openapis.org/oas/v3.2.0.html), [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview).

## 6. Co dodać i w jakiej kolejności

1. **Kontrakt wykonywalny i pierwszy przebieg człowiek–AI:** schematy, pełny minimalny lifecycle, jedna usługa zapisu, CLI na PATH, UI, konflikt i undo. Odbiór obejmuje ponowne otwarcie po restarcie oraz edycję przez CLI przy zamkniętym UI.
2. **Narzędzia poprawiające wygląd:** tekstury/alpha, krzywe czasu, ruch cząstek, izolowanie warstw, skala postaci i porównanie A/B. Podgląd ma jawny zakres przybliżeń i odświeża zależne warstwy.
3. **Eksport i konkretny odbiór NWN:** kontrola wsparcia parametrów, pochodzenie zasobów, odczyt zapisanego kandydata, kwalifikacja profilu runnera, zapisany materiał do oceny. Nie utożsamiać logu skryptu z jakością obrazu.
4. **MCP i WebMCP:** rzeczywista rejestracja, odczyt, zapis, konflikt i błąd przez docelowego klienta; test zamknięcia karty i zachowania joba. Nazwy narzędzi oraz poprawny JSON nie wystarczą.
5. **Rozszerzenia po pierwszym odbiorze:** plansze wariantów, analiza wpływu parametru, biblioteka stylu TLC, scenariusze ruchu/przerwania i kolejne rodziny VFX. MCP Apps tylko przy rzeczywistej potrzebie panelu w rozmowie.

W [projekcie sterowania](C:/Projects/nwn-vfx/docs/design/human-ai-control-contract-draft.md) zapisano macierz operacji, projekt komend CLI, statusy, kody wyjścia, reguły UI/undo, granice wykonawcy i zestaw testów odbiorczych. Są konkretnym wkładem tego audytu; nie zostały jeszcze zaimplementowane ani uruchomione.

## 7. Ograniczenia werdyktu

Audyt zakończony oznacza sprawdzony i zapisany raport oraz otrzymane wyjaśnienia autora. Nie oznacza gotowego Studio, naprawionego renderera, przetestowanego CLI ani nowej akceptacji VFX w grze. Źródłowe przykłady wyścigów i rozbieżności kontraktów wymagają reprodukcji przy implementacji/naprawie odpowiedniego komponentu.

Weryfikacja dokumentacji: sprawdzono 20 lokalnych odnośników i wskazane numery linii w obu nowych dokumentach, sparsowano przykład JSON oraz sprawdzono domknięcie bloków kodu — bez błędów. Przegląd spójności projektu sterowania doprowadził do doprecyzowania warunków rewizji, kolejności idempotencji, transakcyjnego przyjęcia joba i wstrzymania zapisów AI przy commit. To kontrola dokumentacji, nie test implementacji.
