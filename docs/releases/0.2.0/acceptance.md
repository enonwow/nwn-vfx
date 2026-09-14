# NWN VFX Studio 0.2.0 — odbiór WebMCP

Data: **2026-09-05**. Wszystkie cztery wymagania tej iteracji zostały zaimplementowane i sprawdzone. Pełna V1 oraz natywna zgodność z NWN pozostają osobnym etapem.

## Dostarczone zachowanie

1. Historia pobiera autora i czas zatwierdzenia z rzeczywistej operacji. `createdAt` nadal oznacza utworzenie projektu; `committedAt` oznacza zapis rewizji. Brakujące dane historyczne pozostają `null`. Odpowiedź zapisu i odpytywanie serwera zachowują późniejszą edycję człowieka, również cofnięcie pola do poprzedniej wartości podczas oczekiwania na zapis.
2. Adapter rejestruje **35 narzędzi WebMCP** i korzysta ze wspólnych operacji oraz schematów CLI/API. Agent otrzymuje oddzielną tożsamość, ograniczony projekt, zakres praw i czas ważności. Sesja wiąże się z kartą oraz sesją właściciela. Narzędzia nie przechodzą na uprawnienia właściciela przy błędnym poświadczeniu.
3. `view.inspect` udostępnia projekt, rewizję, zaznaczenie, czas, odtwarzanie i niezapisany szkic oddzielony od zapisanego dokumentu. `view.set/open` sprawdzają jawne identyfikatory, rewizję widoku, aktualne prawa i pauzę AI. Otwarcie innego projektu nie zastępuje szkicu ani zapisu w toku.
4. WebMCP obsługuje trwałe zapisy, idempotencję, konflikty, render/build, odczyt jobów i pobieranie bajtów artefaktów w ograniczonych fragmentach z weryfikacją SHA-256. Człowiek może odłączyć sesję.

Walidatory przeglądarkowe są generowane z kanonicznych schematów podczas budowania. Pierwsza próba na rzeczywistym hoście ujawniła konflikt kompilacji AJV z CSP; naprawiono go bez włączania `unsafe-eval`. Test VM sprawdza walidację przy wyłączonym generowaniu kodu ze stringów.

## Testy powtarzalne

| Kontrola | Wynik |
| --- | --- |
| `npm run build` | Typecheck i produkcyjne frontend/backend/CLI przeszły |
| `npm test` | **58/58**, w tym historia, lifecycle adaptera, schematy AOT, prawa sesji, restart/wygaśnięcie, zakres projektu, blokady, CAS i integralność plików |
| `npm run test:browser` | **4/4** na produkcyjnym froncie: dwa przypadki wyścigu zapisu, poprawna historia, przepływ WebMCP, oryginalny przebieg edycji/eksportu oraz PNG/WebM bez otwartej karty |
| Test przeglądarkowy adaptera | Prawdziwy backend i kod adaptera, jawny mock wyłącznie rejestracji API; dwie karty, uprawnienia, pauza, blokada, konflikt, szkic, job, plik i odłączenie |
| Walidator skillu | `quick_validate.py`: poprawny skill |

Logi: [testy jednostkowe i integracyjne](C:/Projects/nwn-vfx/output/webmcp-host/unit-tests.log), [testy przeglądarkowe](C:/Projects/nwn-vfx/output/webmcp-host/browser-tests.log). Testy automatyczne są oddzielone od poniższego dowodu rzeczywistego hosta.

## Rzeczywisty host WebMCP

Host: **Codex In-app Browser**, 2026-09-05. Discovery przez capability `webmcp` zwróciło 35 narzędzi; wywołania wykonano przez `fetchTools().call(...)`. Nie instalowano polyfillu ani zastępczego mostu. Numer kompilacji samego hosta nie został odczytany, więc wynik nie stanowi kwalifikacji innych wersji przeglądarek.

Próba korzystała z izolowanej usługi na porcie 14331 i danych w `output/webmcp-host/instance`. Działania człowieka wykonano w UI, a działania agenta przez rzeczywiście odkryte narzędzia WebMCP. Nie używano DOM/CLI jako zastępstwa wywołań agenta.

| Próba | Zaobserwowany wynik |
| --- | --- |
| Połączenie przed udostępnieniem | `WEBMCP_NOT_CONNECTED` |
| Udostępnienie projektu w UI | Osobny aktor agenta, określone zakresy i termin ważności, bez sekretu w wyniku |
| Odczyt i zmiana kontekstu | Wybrana warstwa `sparks`, czas 0.55 s, pauza odtwarzania |
| Utworzenie i otwarcie wariantu | Nowe jawne ID; źródło zachowane |
| Zapis parametrów | Wariant przeszedł do rewizji 2 |
| Powtórzenie tego samego klucza | Ten sam `operationId`, bez dodatkowej rewizji |
| Zapis na starej rewizji z nowym kluczem | `REVISION_CONFLICT` |
| Pauza AI ustawiona przez człowieka | `AI_PAUSED` dla zmiany dokumentu i widoku |
| Zablokowana przez człowieka warstwa | `LOCKED` |
| Niezapisana nazwa warstwy | Kontekst zawierał odmienny szkic i zapisany dokument; `view.open` zwróciło `DRAFT_CONFLICT` |
| Render PNG i build zasobów, rewizja 5 | Oba joby `succeeded` |
| Odbiór plików przez `artifacts.read` | Cały PNG i ZIP, poprawne rozmiary i SHA-256, `nextOffset: null` |
| Historia | Rewizje 1–2: agent WebMCP; 3–5: właściciel; rzeczywiste różne czasy operacji |
| Odłączenie w UI | Kolejne wywołanie: `WEBMCP_NOT_CONNECTED` |

Tożsamości dowodu:

- Projekt źródłowy: `a8fd953a-4e50-4604-97b0-d0b0ae65d706`.
- Wariant „WebMCP — odbiór rzeczywisty”: `d1b7a5f7-1132-4f0d-a11f-e6f86fef323d`, końcowa rewizja 5.
- Aktor WebMCP: `b066a1fd-384a-48c4-af4e-71e044af8ba2`.
- Zapis/powtórzenie: `b420d7fb-32e4-4f7b-9d0c-5214524ae4eb`.
- PNG job: `806b940f-105f-4e60-9433-d00c35ced6c1`; artifact: `2d785028-59b2-423d-8e2e-2ad6c3edcf58`; **47472 bajty**, SHA-256 `1fabe1b5b3ad341f28297d35ac68199f60001c6e79cfb55dd66ed50d702aae60`.
- Build job: `afe00610-c0da-4b6c-babf-13cbbc0bb244`; ZIP artifact: `2590ba00-f958-4511-b2b9-ea4e1abc7066`; **103147 bajtów**, SHA-256 `1b9048a2bfdaa55876df276f994c86ec9ab3c34589eac750fa94f08a64679744`.

Po pełnej próbie poprawiono jeszcze komunikat zwykłego zapisu, który niepotrzebnie sugerował pozostawiony szkic. Produkcyjny build oraz wszystkie powyższe testy automatyczne przeszły na tej końcowej poprawce; nie zmieniała ona protokołu WebMCP.

## Instalacja i sprawdzenie końcowej paczki

Zainstalowano [nwn-vfx-studio-0.2.0.tgz](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.2.0.tgz) globalnie z paczki, bez dowiązania do repozytorium. SHA-256 paczki: `6244465d612d8b2abbe455f6a060ea095d0cc8a93b6f6b2a06a22cfa6c5830a6`. [Manifest źródeł](C:/Projects/nwn-vfx/docs/releases/0.2.0/source-manifest.json) wiąże testowany kod, testy, schematy, skill i lockfile z hashami.

Start oraz diagnostykę CLI wykonano z `C:\Projects\the last city`. Zaktualizowana usługa na porcie 4317 zachowała instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587` oraz cztery istniejące projekty z dotychczasowymi ID i rewizjami.

Nowa karta Codex IAB odkryła 35 narzędzi z zainstalowanej paczki. Rzeczywiste wywołanie `studio.version` zwróciło **0.2.0**, a `studio.view.inspect` odczytało istniejący projekt audytowy na rewizji 2. Po odłączeniu kolejna próba zwróciła `WEBMCP_NOT_CONNECTED`. Sesję testową cofnięto. Zainstalowano też zaktualizowany skill użytkownika `nwn-vfx`.

Dotychczasowa karta użytkownika zawierała niezapisany szkic „Fiolki alchemicznej”. Pozostawiono ją otwartą bez przeładowania; nową wersję pokazano w osobnej karcie. Szkic trzeba zapisać przed odświeżeniem starej karty.

## Użycie i granice

W Studio wybierz **Połącz agenta → Udostępnij projekt AI**. Agent innego projektu, w tym the last city, może odkryć narzędzia tej karty albo skorzystać ze swojego CLI. Szczegóły: [WebMCP](C:/Projects/nwn-vfx/docs/agents/webmcp.md), [CLI](C:/Projects/nwn-vfx/docs/agents/cli.md), [skill](C:/Projects/nwn-vfx/skills/nwn-vfx/SKILL.md).

Wydanie Studio i CLI: 0.2.0. Koperta komend: 0.1.0, format dokumentu: 1. Zamknięte walidatory starego DTO historii wymagają pobrania aktualnego schematu z dodatkowymi polami.

Ta iteracja nie dodaje importu dowolnych tekstur, warstw światła, animowanej geometrii ani natywnego runnera. `nativeVerified` pozostaje `false`; render i eksport nie oznaczają testu w NWN. Standalone MCP pozostaje niewdrożony. Zgodność WebMCP zależy od rzeczywistego hosta, a `capabilities.webmcp` opisuje dostępność adaptera w produkcie.
