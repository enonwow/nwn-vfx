# NWN VFX Studio 0.1.0 — audyt sterowania przez WebMCP

**Adnotacja po wdrożeniu 0.2.0:** ustalenia poniżej zachowano jako historyczny audyt wersji 0.1.0. Poprawiono zapis i historię, wdrożono ograniczone sesje agenta, kontekst karty oraz 35 narzędzi WebMCP. Rzeczywiste discovery i wywołania potwierdzono w Codex In-app Browser. Aktualny stan i dowody opisuje [raport odbioru 0.2.0](C:/Projects/nwn-vfx/docs/releases/0.2.0/acceptance.md). `mcp` pozostaje `false`, a kwalifikacja efektów w NWN nie została wykonana. Historyczne stwierdzenia o braku WebMCP nie opisują wydania 0.2.0.

Data: 2026-09-05. Zakres: działająca lokalna alpha, integracja innych agentów i braki przed dodaniem WebMCP. Raport uzupełnia [odbiór implementacji](../releases/0.1.0/acceptance.md), nie zastępuje kwalifikacji pełnej V1.

Audyt wykonało wskazane przez użytkownika zadanie [Zbadaj VFX w aurora-web](codex://threads/01a070e3-5df3-7913-943f-854ac8ea98ee), zakończona tura `01a07238-3325-7fc1-bc6e-b43e594cddf6`. Poniżej odróżniamy jego próby konsumenckie od dodatkowej inspekcji autora aplikacji. Audyt zakończono; nie implementowano w nim adaptera ani poprawek kodu.

## Werdykt aplikacji

**W obecnej wersji nie można zadeklarować sterowania Studio przez WebMCP.** Działające CLI/API nie zastępuje tego adaptera. Usługa zgłasza `webmcp: false` i `mcp: false`, a frontend nie rejestruje narzędzi WebMCP. Wewnętrzne funkcje `/render` służą workerowi podglądu i nie są WebMCP.

Dowody w źródłach: `apps/service/src/commands.ts:122`, `packages/contracts/src/schema.ts:177`, `apps/web/src/api.ts`. Próba bieżącej usługi: `nwn-vfx --json capabilities`.

| Warstwa | Stan |
| --- | --- |
| Trwałe operacje usługi i CLI | Wdrożone w zakresie alphy; wcześniejszy niezależny odbiór opisano w raporcie 0.1.0 |
| Rejestracja WebMCP przez aplikację | Brak |
| Discovery WebMCP w bieżącym hoście | Konektor przeglądarki wbudowanej udostępnia `webmcp.fetchTools()`; rzeczywiste wywołanie działa i zwraca brak narzędzi na stronie Studio |
| Natywne API i wersja WebMCP silnika IAB | Niezweryfikowane; dostępności konektora nie utożsamiamy z konkretną implementacją draftu |
| Wywołanie operacji WebMCP przez agenta | Niedostępne: discovery nie zwróciło żadnego narzędzia aplikacji |
| MCP dla klientów pracujących bez karty | Brak adaptera; CLI pozostaje działającym kanałem |

Aktualny [draft WebMCP z 4 września 2026](https://webmachinelearning.github.io/webmcp/) opisuje `document.modelContext`; nie jest ukończonym standardem W3C. Dostępność konkretnego hosta trzeba sprawdzić w jego uruchomionej konfiguracji. [Dokumentacja Chrome](https://developer.chrome.com/docs/ai/webmcp) nie jest dowodem wsparcia przeglądarki wbudowanej w Codex.

## Ustalenia autora aplikacji

Bezpośrednia próba na istniejącej karcie użytkownika, bez przeładowania i zmiany jej stanu: CUA wskazało `Codex In-app Browser`, kartę `NWN VFX Studio`, URL `http://127.0.0.1:4317/`, providerTabId `de26ed72-c05d-462c-ac88-9942cf9a7e33`. Udokumentowany interfejs `tab.capabilities.get('webmcp')` → `fetchTools()` → `description()` zwrócił **`No WebMCP tools are available in this document.`** Nie wywołano niezarejestrowanego narzędzia ani zastępczej funkcji DOM. Wynik przekazano wskazanemu agentowi.

1. **Historia nie prezentuje autora i poprawnego czasu rewizji.** `revisions.list` (`apps/service/src/commands.ts:175`) zwraca snapshot projektu i `operationId`, bez autora. UI (`apps/web/src/main.tsx:203`) próbuje odczytać brakujące `actorName`/`actorId`, po czym pokazuje `Studio`, oraz używa daty utworzenia projektu. Faktyczny autor i czas są zachowane w zapisie operacji. To problem kontraktu historii i prezentacji, nie utrata dziennika.

   Potwierdzenie na projekcie `e68c5d30-50ac-4b4e-af3c-f13cf4e9e94f`, rewizjach 1 i 2: oba wyniki mają `createdAt = 2026-09-05T15:08:24.602Z`, bez pól autora. Operacja rewizji 2, `a3df74fc-3a1c-4ced-a515-942380b5531c`, ma `actorId = 883c6ab1-0653-431e-9e25-4e1176a843cf` i `createdAt = 2026-09-05T15:08:53.574Z`.

2. **WebMCP potrzebuje odrębnej tożsamości agenta po stronie serwera.** Obecny frontend używa sesji właściciela (`apps/service/src/app.ts:71–84`, `apps/web/src/api.ts`). Podłączenie nowych narzędzi bezpośrednio do tej funkcji przypisałoby działania AI właścicielowi. Adapter musi działać przez nadany grant aktora AI, bez przyjmowania dowolnego `actorId` z argumentów narzędzia. Brak adaptera oznacza, że jest to warunek jego budowy, nie wykazana podatność istniejącego WebMCP.

3. **Brakuje kontraktu widoku.** Aktywny projekt, zaznaczona warstwa, czas, A/B i niezapisany szkic są stanem React. Potrzebne są jawne operacje widoku związane z `viewSessionId`, z rozróżnieniem zapisanego dokumentu i lokalnej propozycji. Operacja trwała nadal wymaga jawnego projektu i rewizji.

4. **Dokumentacja wymaga aktualizacji statusów.** Dokument integracji zewnętrznej opisuje całość jako przyszłą, mimo częściowego wdrożenia; końcówka planu nadal wskazuje P0 jako następny krok. Raport 0.1.0 jest obecnie właściwym źródłem informacji o dostarczonych funkcjach.

## Minimalny następny etap i kryteria odbioru

| Kolejność | Zakres | Dowód zakończenia |
| --- | --- | --- |
| 1 | Zapis szkicu, historia i identyfikacja wykonawcy | Opóźniona odpowiedź zapisu nie usuwa późniejszych edycji szkicu; zmiana człowieka i agenta pokazuje odrębnego autora i rzeczywisty czas; stare rewizje zachowują pochodzenie |
| 2 | Grant sesji agenta i adapter wspólnych operacji | Serwer egzekwuje scope, blokady, pauzę AI, cofnięcie praw, `expectedRevision` oraz idempotencję; AI nie zapisuje oceny artystycznej jako właściciel |
| 3 | Narzędzia projektu i widoku | Odczyt, fork, diff, zapis, render, build, status i artefakty korzystają ze schematów rdzenia; operacje widoku wymagają właściwej karty, a niezapisany szkic jest chroniony |
| 4 | Rzeczywisty odbiór WebMCP | W nazwanym hoście agent odkrywa narzędzia, wykonuje zmianę, otrzymuje konflikt starej rewizji, uruchamia job i odbiera zgodny wynik. Raport podaje wersję hosta/API, ID operacji, rewizji, joba i hash artefaktu |
| 5 | Brak wsparcia i cykl życia karty | Niedostępny host ma czytelny status; UI/CLI nadal działa. Zamknięcie karty nie gubi już przyjętego joba; ponowienie nie dubluje skutku. Dwie karty nie mylą kontekstu |

MCP może udostępnić te same operacje agentom pracującym bez karty. Odbiór MCP i WebMCP musi być osobny: powodzenie jednego nie zalicza drugiego.

Pozostałe braki produktu obejmują własne tekstury i import zasobów, światło i animowaną geometrię, wymagane krzywe, instalator z prywatnym runtime oraz kwalifikowany eksport/przebieg w NWN. Ich pełny zakres i bramki pozostają w planie V1; podgląd alphy nadal nie stanowi dowodu zachowania efektu w grze.

## Wynik wskazanego agenta

Agent niezależnie powtórzył discovery WebMCP na własnej karcie Studio w Codex IAB i otrzymał ten sam wynik: **brak narzędzi**. To zastępuje jego wcześniejsze, wstępne stwierdzenie, że discovery IAB było nieweryfikowalne. W osobnym Playwright Chromium **153.0.8010.12**, bez flag WebMCP, odczytał `document.modelContext` i `navigator.modelContext` jako `undefined`. Wynik osobnego Chromium nie został przypisany silnikowi IAB.

Próby CLI na własnym forku `c052f375-f653-498e-83f9-8d4f0aa2ec59`:

- Odmowa `FORBIDDEN` przy odczycie projektu poza grantem aktora TLC.
- Zmiana `sparks.life: 0.9 → 0.7`, rewizja 1 → 2.
- Retry z tym samym kluczem zwrócił tę samą operację i rewizję; osobny zapis z rewizji 1 dał `REVISION_CONFLICT`.
- Job PNG `c8fb8879-80c8-46d8-a28a-44be7d1e7edf` i build `dc62402e-9887-41b4-95b9-f319a0eca787` zakończyły się sukcesem. Agent pobrał wyniki, sprawdzając rozmiar i SHA-256: [PNG](C:/Users/enonw/.nwn-vfx/acceptance-output/root-webmcp-audit-20260905/preview.png), [ZIP](C:/Users/enonw/.nwn-vfx/acceptance-output/root-webmcp-audit-20260905/candidate.zip).
- Obserwacja UI potwierdziła błąd historii: autor `Studio` i czas `17:43:35` przy obu rewizjach, mimo że edycja nastąpiła o `17:48:55` (czas lokalny).

**Dodatkowe ustalenie P1 z inspekcji kodu:** w `apps/web/src/main.tsx:154` odpowiedź zapisu zastępuje szkic, a pola parametrów pozostają edytowalne podczas oczekiwania. Edycja wykonana po wysłaniu zapisu może więc zniknąć po jego odpowiedzi. To wniosek z kodu, nie odtworzony w tym audycie błąd z opóźnieniem sieci; przed zamknięciem poprawki należy dodać rzeczywistą próbę opóźnionej odpowiedzi.

Uzgodniony priorytet: najpierw ochrona szkicu i poprawna historia, następnie adapter WebMCP na wspólnych operacjach z ograniczoną tożsamością AI oraz kontraktem widoku. Działający konsument CLI potwierdza użyteczny fundament dla TLC; nie zalicza WebMCP ani testu efektu w NWN.
