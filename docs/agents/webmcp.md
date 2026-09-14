# WebMCP — współpraca w karcie Studio

Studio 0.21.1 dostarcza 49 narzędzi WebMCP, ze wspólną obsługą emiterów, geometrii mesh/OBJ, materiałów diffuse/selfillumination, animacji, smug po własnych ścieżkach 3D, zasobów PNG i punktów życia cząstki. Rzeczywiste discovery, import OBJ, blokady, konflikty i odbiór PNG w Codex In-app Browser dokumentuje [raport wydania 0.7.1](C:/Projects/nwn-vfx/docs/releases/0.7.1/acceptance.md). `capabilities.webmcp` oznacza obecność adaptera w produkcie; gotowość konkretnej karty wynika z jej statusu i rzeczywistego discovery hosta. Zwykły MCP pozostaje niewdrożony (`mcp: false`). CLI działa bez otwartej karty, a efekty nadal wymagają kwalifikacji w NWN.

Nowy eksport emisji, kontrolne warianty i odbiór `emitter-emission.json` opisuje [kontrakt emisji 0.21.1](emitter-emission.md). Składanie kilku efektów do jednego podglądu opisuje [preview.compose](composition-preview.md).

Właściwość całego efektu `orientWithObject`, blokadę `@effect`, schemat 11 i publiczny artefakt integracji opisuje [kontrakt obracania z postacią](effect-integration.md).

## Połączenie i prawa

`studio.native.test.status({viewSessionId,input:{candidateId}})` odczytuje zależności natywnego testu konkretnego `candidate.build`; nie uruchamia NWN ani nie przyjmuje dowolnego pozytywnego dowodu. [Kontrakt i ograniczenia](native-test-status.md). Import własnych OBJ, atomowe materiały i usuwanie wyłącznie wskazanych nieużywanych PNG opisuje [przewodnik 0.7.0](obj-material.md). Zachowaj stare karty z niezapisanym szkicem; po aktualizacji użyj osobnej nowej karty do nowych narzędzi.

Człowiek wybiera projekt, otwiera **Połącz agenta** i wybiera **Udostępnij projekt AI**. Połączenie jest ograniczone do tego projektu i projektów/wariantów utworzonych przez tego agenta. Ma osobną tożsamość, maksymalnie 30 minut ważności oraz powiązanie z kartą i sesją właściciela. Nie nadaje prawa zarządzania innymi aktorami, usuwania blokad ani podpisywania oceny artystycznej człowieka.

**Odłącz WebMCP** cofa połączenie karty. **Wstrzymaj AI** blokuje nowe zapisy i skutki pracy AI dla projektu, także zmiany widoku. Odczyt zapisanych danych pozostaje dostępny przy nadal ważnych prawach. Odwracalne działania w przyznanym zakresie nie wymagają ponownego podłączania agenta.

Poświadczenie pozostaje w pamięci strony i nie jest wynikiem narzędzia, adresem pobrania, elementem localStorage ani wpisem w repozytorium konsumenta. Zakończenie karty nie unieważnia automatycznie już przyjętego joba; jego worker sprawdza nadal ważne prawa. Wygaśnięcie lub cofnięcie dostępu może zablokować publikację wyniku. Uprawniony właściciel lub klient CLI może odczytać job bez tej karty.

## Odkrycie i operacje

W hoście udostępniającym WebMCP odczytaj aktualną listę narzędzi. W konektorze przeglądarki Codex, po wybraniu właściwej karty jako `tab`:

```javascript
const webmcp = await tab.capabilities.get('webmcp');
const tools = await webmcp.fetchTools();
nodeRepl.write(tools.description());
const connection = await tools.call('studio.connection.inspect', {});
nodeRepl.write(connection);
```

To przykładowy interfejs tego hosta, nie API dowolnej przeglądarki. Używaj tylko narzędzi zwróconych przez bieżące discovery. Brak narzędzi, brak API oraz niepodłączony projekt są różnymi stanami. Nie zastępuj nieudanego WebMCP wywołaniem DOM/CLI i nie opisuj go jako zaliczonego testu WebMCP.

`studio.connection.inspect` zwraca `viewSessionId`, projekt, aktora, zakres i termin ważności, bez sekretu. Każda operacja domenowa korzysta z takiej postaci wejścia:

```json
{
  "viewSessionId": "<z-connection.inspect>",
  "input": { "projectId": "<jawne-id>", "expectedRevision": 2,
    "changes": [{ "type": "layer.set", "layerId": "sparks", "values": { "life": 0.7 } }] },
  "idempotencyKey": "<zachowany-klucz-tej-zmiany>"
}
```

Przykład dotyczy `studio.changes.apply`; klucz jest wymagany przy trwałych mutacjach. Schemat `input` pochodzi z tego samego rejestru co CLI/API. Narzędzia obejmują discovery, projekty, fork, diff/zapis/cofanie, historię, render/build, joby, artefakty i uwagi agenta. `schema.get` oraz opisy narzędzi są źródłem aktualnych parametrów. Nie ma ogólnego mostu do nieograniczonych komend właściciela.

Wynik zachowuje kopertę Studio: `status`, `requestId`, ewentualny `operationId`, `data` lub `error`. `accepted` oznacza przyjęty job, nie gotowy plik. `OUTCOME_UNKNOWN` albo przerwanie oczekiwania oznacza konieczność odzyskania tego samego żądania z zachowanym kluczem; nie anuluje zatwierdzonego zapisu. `jobs.cancel` jest osobną operacją. Błędna rewizja wymaga nowego odczytu i decyzji o propozycji.

## Mesh i animacja

Od 0.5.0 emiter przyjmuje statyczne `values.orientation:[axisX,axisY,axisZ,angleRadians]` w `studio.changes.apply` oraz orientację w `layer.add`. Lokalna oś wyrzutu +Z i początkowa prędkość obracają się, a grawitacja pozostaje w Z świata. Brak pola jest neutralny, `orientation:null` usuwa je tylko z emitera. Użycie pola promuje dokument do 4. Pole podlega blokadom, pauzie AI, rewizjom i selektywnemu cofnięciu. [Kształt danych, kierunki X/Y/Z i ograniczenia](emitter-orientation.md).

`studio.assets.import/list/get` udostępniają niezmienne zasoby PNG wybranego projektu. Import przesyła `{projectId,expectedRevision,fileName,pngBase64}` w standardowej kopercie i wymaga zakresu `edit`; tworzy rewizję oraz zwraca `{project,assetId}`. `layer.set` przypisuje `texture:"asset:<assetId>"`, `blend` i geometrię z UV. Punkty `midColor`, `midAlpha`, `midSize` i jeden `midPercent` również podlegają tym samym prawom, blokadom i historii. [Przykłady oraz granice formatu](textures.md).

`studio.changes.preview` i `studio.changes.apply` przyjmują `layer.add` z `type: "mesh"` oraz `layer.set` z polami mesh. Geometria ma warianty `box`, `ring`, `custom`; kanały animacji to `position`, `orientation`, `scale`, `alpha`. Kształty danych i przykłady zawiera [instrukcja mesh](C:/Projects/nwn-vfx/docs/agents/mesh.md), a bieżące limity — `studio.schema.get` dla `changes.apply`.

Każdy kanał ma do 64 kluczy `{time,value}`; czas jest lokalny względem początku warstwy, ściśle rosnący, w zakresie jej długości. Własna geometria ma do 2048 wierzchołków i 4096 trójkątów; dokument do 32 warstw i 6 MiB zwartego JSON UTF-8. `values.geometry` i `values.animation` zastępują całe odpowiednie pola: odczytaj bieżącą warstwę, zachowaj pozostałe kanały i respektuj blokady tych pól. Zmiana podglądu nie zapisuje kluczy.

## Kontekst człowieka

- `studio.view.inspect({viewSessionId})` zwraca jawny projekt/rewizję, `viewRevision`, zaznaczenie, czas, odtwarzanie oraz osobno `savedDocument` i `draft` z flagą `draftDirty`. `meshEditorDrafts` zachowuje niezastosowany tekst JSON geometrii/animacji/ścieżki według ID warstwy; wpis pola ma `{text,baseline}`. Ten tekst może być niepoprawny i nie jest częścią zapisanego dokumentu.
- `studio.view.set` wymaga `viewSessionId`, `projectId`, `expectedRevision`, `expectedViewRevision`; ustawia zaznaczenie, czas lub odtwarzanie. Nie zapisuje szkicu.
- `studio.view.open` wymaga jawnego docelowego `projectId` i `expectedViewRevision`. Może otworzyć przyznany projekt lub własny wariant. Nie zastąpi niezapisanego szkicu człowieka.

Zmiany intencji widoku, dokumentu i szkicu, także oczekującego tekstu JSON, zwiększają `viewRevision`. `draftDirty` uwzględnia `meshEditorDrafts`; dopóki człowiek nie zastosuje albo nie odrzuci tekstu, UI blokuje zapis i przełączenie projektu. Sam upływ czasu podczas odtwarzania nie zwiększa tego licznika co klatkę. Dwie karty mają różne identyfikatory oraz połączenia. Kontrola widoku wymaga praw odczytu/edycji i ponownej autoryzacji w usłudze.

W 0.5.0 ta sama mapa zawiera również `meshEditorDrafts[layerId].orientation` dla emitera. `text` jest JSON-em czterech ciągów znaków z pól osi/kąta, a `baseline` zapamiętuje orientację przed rozpoczęciem edycji. Wartości mogą być niepełne lub błędne; agent zachowuje je jako szkic człowieka. Zastosowanie normalizacji osi jest jawną akcją w UI. Odrzucenie lokalnych pól pozostaje dostępne także po zablokowaniu orientacji.

Zapis AI nie przestawia automatycznie karty człowieka. Karta odbiera nową rewizję; przy niezapisanych zmianach pokazuje konflikt i zachowuje propozycję. Historia podaje autora, jego rodzaj i rzeczywisty czas operacji. Odpowiedź na zapis człowieka nie usuwa kolejnej edycji wykonanej podczas oczekiwania.

## Artefakty i inne projekty

`studio.artifacts.get` udostępnia metadane. `studio.artifacts.read` pobiera fragment przez poświadczenie karty: `{viewSessionId, artifactId, offset?, length?}`. Domyślny fragment ma 65536 bajtów, maksymalny 262144. Wynik zawiera `artifact`, `base64`, `offset`, `length`, `nextOffset` oraz `chunkSha256`.

Łącz zdekodowane fragmenty według offsetów do `nextOffset === null`. Sprawdź ostateczny rozmiar oraz `artifact.sha256`; same poprawne hashe fragmentów nie zastępują sprawdzenia całego pliku. Wybierz jawny katalog odbioru. Identyfikator pliku ani ścieżka względna `downloadUrl` nie rozszerza uprawnień.

Agent TLC może pracować przez WebMCP z kartą Studio albo przez zainstalowane CLI ze swojego katalogu. Dane nie przenoszą się automatycznie do repozytorium TLC. PNG, WebM i build powinny wskazywać tę samą zapisaną rewizję. Render jest przybliżeniem; eksport zasobów i odczyt kontrolerów mesh nie oznaczają testu efektu w NWN (`nativeVerified: false`, `nativeTestAvailable: false`). Światło, ribbon i import MDL/FBX pozostają poza zakresem tego wydania.

## Zgodność

W 0.4.1 `studio.assets.import` przyjmuje opcjonalne `input.targetSize:512|1024`. Pozwala to jawnie normalizować PNG RGB8/RGBA8 o innych wymiarach, z wejściem do 8 MiB i wynikiem do 2 MiB. Import bez pola nadal działa w trybie ścisłym. `studio.assets.list/get` zwraca zarówno hash wyniku (`id`/`source.sha256`), jak i `source.normalization.originalSha256` oraz parametry przekształcenia. Nie przybywa nowych nazw narzędzi; odśwież odkryte schematy przed wywołaniem nowego pola. Szczegóły: [normalizacja PNG](textures.md).

Adapter wykrywa API opisywane przez [aktualny draft WebMCP](https://webmachinelearning.github.io/webmcp/) oraz starszą postać API Chrome, bez instalowania zastępczego mostu. Wersję rzeczywiście użytego hosta i wynik discovery/wywołań należy zapisać w raporcie wydania. Walidatory przeglądarkowe powstają z kanonicznych schematów podczas budowania; strona nie wymaga `unsafe-eval`.

Koperta komend API pozostaje w wersji 0.1.0. Studio/CLI 0.9.0 obsługuje dokumenty `schemaVersion: 1`, `2`, `3`, `4`, `5`, `6`: stare dokumenty zachowują wersję, dodanie mesh promuje co najmniej do 2, nowe tekstury/UV i punkty cząstki do 3, statyczna orientacja emitera do 4, jawny materiał mesh do 5, smuga do 6. [Pełne wejście trail i przykłady](trails.md). Odśwież zamknięte schematy klienta, w tym unie warstw, zasoby i capabilities. Historia zawiera pola `actorId`, `actorName`, `actorKind`, `committedAt`; stare DTO historii również wymagają aktualnego schematu. Istniejące dane i identyfikatory pozostają zachowane.

Studio 0.15.0 udostępnia 48 narzędzi, w tym audio.import/list/get/remove. Klipy audio używają changes.preview/apply i kontekstu karty. [Kontrakt audio, transport i eksport](audio.md).
