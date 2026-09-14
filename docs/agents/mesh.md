# Geometria i animacja — Studio 0.4.1

Warstwa `mesh` pozwala tworzyć własne efekty z geometrii i animacji. Operacje są wspólne dla człowieka, CLI i WebMCP; nazwa efektu nie steruje zachowaniem aplikacji. Przykład z mieczem służy odbiorowi funkcji, a finalny efekt artystyczny przygotowuje konsument.

## Dokument i jednostki

Dotychczasowe dokumenty emiterów zachowują `schemaVersion: 1`. Dodanie warstwy mesh przez `changes.apply` promuje dokument co najmniej do wersji 2; tekstury, UV i nowe punkty wieku cząstki wymagają 3. Wszystkie trzy wersje można odczytać i importować. Koperta API pozostaje 0.1.0; zamknięte schematy klientów należy odświeżyć. Instalacja Studio/CLI ma wersję 0.4.1.

Dokument ma limit 6 MiB w zwartej serializacji UTF-8, wspólny dla UI i API. Eksportowany ZIP używa takiej serializacji; importer przyjmuje także starszą postać JSON z formatowaniem, jeśli plik mieści się w 6 MiB.

Warstwa ma wspólne pola `id`, `name`, `enabled`, `start`, `duration`, `position`, `scale`, `color`, `alpha` oraz `type: "mesh"`, `orientation`, `geometry` i `animation`.

- Osie: NWN Z-up; współrzędne w metrach. Pozycja bazowa i klucze pozycji są wartościami bezwzględnymi warstwy, a nie przyrostami.
- Orientacja: `[axisX, axisY, axisZ, angleRadians]`. Oś musi mieć długość 1; neutralna orientacja to `[0,0,1,0]`. Kąt mieści się w ±8π.
- Skala jest jednorodna, od 0.01 do 10. Przezroczystość `alpha` mieści się w 0–1.
- Materiał: kolor i opcjonalna tekstura, nieoświetlany w Studio. MDL zapisuje `diffuse`, `selfillumcolor` i bitmapę albo `NULL` dla domyślnego materiału bez mapy. `blend` obsługuje normal/additive; additive bez mapy otrzymuje wewnętrzną białą teksturę/TXI, aby zachować mieszanie w eksporcie. [Zasoby PNG, UV i granice formatu](textures.md). Trójkąty są jednostronne; ich kolejność określa przednią stronę.
- `start + duration` nie może przekroczyć długości efektu. Poza tym przedziałem geometria jest niewidoczna.

## Geometria

`geometry` przyjmuje jedną z trzech postaci:

```json
{"kind":"box","dimensions":[0.15,0.1,1.5]}
```

```json
{"kind":"ring","innerRadius":0.8,"outerRadius":1,"segments":48}
```

```json
{"kind":"custom","vertices":[[-0.5,0,0],[0.5,0,0],[0,0,1]],"faces":[[0,1,2]]}
```

Prostopadłościan jest wyśrodkowany w swoim początku; pierścień leży w płaszczyźnie XY na Z=0. Pierścień z promieniem wewnętrznym 0 tworzy dysk. Własna geometria ma maksymalnie 2048 wierzchołków i 4096 trójkątów; indeksy zaczynają się od 0. Niepoprawne indeksy i trójkąty o zerowym polu są odrzucane. Generator geometrii jest wspólny dla renderera i eksportera.

## Klucze czasu

`animation` zawiera opcjonalne kanały `position`, `orientation`, `scale`, `alpha`. Każdy jest tablicą `{time,value}`, maksymalnie 64 klucze. Czasy są lokalne względem `start`, rosną ściśle i mieszczą się w 0–`duration`. Przesunięcie warstwy na osi czasu przesuwa całą jej animację.

```json
{
  "position":[{"time":0,"value":[0,0,1.2]},{"time":0.75,"value":[0,0,0]}],
  "orientation":[{"time":0,"value":[0,0,1,0]},{"time":0.75,"value":[0,0,1,0.4]}],
  "scale":[{"time":0,"value":0.15},{"time":0.75,"value":1.8}],
  "alpha":[{"time":0,"value":0},{"time":0.2,"value":1},{"time":1,"value":0}]
}
```

Pozycja, skala i alpha interpolują liniowo. Obrót używa kwaternionowego SLERP po najkrótszej drodze; pełne obroty wymagają kluczy pośrednich. Brak kanału oznacza wartość bazową. Jeśli pierwszy klucz wypada później niż 0, interpolacja zaczyna się od wartości bazowej w czasie 0. Ostatnia wartość utrzymuje się do końca warstwy. Przewijanie do dowolnej chwili nie zależy od poprzednio odtworzonych klatek.

Wspólny impakt ustala się przez te same czasy: np. klucz miecza na `start + 0.75` i emiter zaczynający emisję w tej chwili. Animacja geometrii nie zmienia istniejącego harmonogramu emiterów.

## CLI i WebMCP

Przed zapisem sprawdź `doctor`, `capabilities`, aktualny projekt i `schema get changes.apply`. [Przykładowy plik zmian](C:/Projects/nwn-vfx/docs/agents/examples/mesh-impact.changes.json) dodaje własną geometrię miecza, pierścień i pył do pustego projektu z domyślnym emiterem `sparks`:

```text
nwn-vfx --json projects create --preset empty --name "Mój efekt" --idempotency-key <create-key>
nwn-vfx --json changes preview --project <id> --expected-revision 1 --input-file C:/Projects/nwn-vfx/docs/agents/examples/mesh-impact.changes.json
nwn-vfx --json changes apply --project <id> --expected-revision 1 --input-file C:/Projects/nwn-vfx/docs/agents/examples/mesh-impact.changes.json --idempotency-key <apply-key>
```

Ścieżka przykładu dotyczy tej instalacji roboczej; paczka npm zawiera ten sam plik w `docs/agents/examples`. Własne siatki przekazuj przez `layer.add`; zmiany geometrii/animacji przez `layer.set` z `values.geometry`/`values.animation`. Wartość tych pól zastępuje całą geometrię lub obiekt kanałów, dlatego wcześniej odczytaj bieżący dokument i zachowaj pozostałe kanały.

WebMCP korzysta z tych samych danych:

```javascript
await tools.call('studio.changes.apply', {
  viewSessionId,
  input: { projectId, expectedRevision: 2, changes: [
    { type: 'layer.set', layerId: 'impact_ring', values: {
      animation: { scale: [{ time: 0, value: 0.15 }, { time: 1, value: 2 }],
        alpha: [{ time: 0, value: 0 }, { time: 0.1, value: 0.7 }, { time: 1, value: 0 }] }
    } }
  ] },
  idempotencyKey: 'retained-key-for-this-change'
});
```

Parametry muszą odpowiadać aktualnej warstwie i jej długości; przykład nie jest poleceniem do zapisania dowolnego projektu. Warianty, historia, selektywne cofanie, rewizje oraz prawa działają jak dla emiterów. Blokady `geometry` i `animation` obejmują całe odpowiednie pola; `*` obejmuje warstwę.

W UI dostępne są generatory, własna geometria JSON, tabelki wszystkich czterech kanałów oraz edytor JSON animacji. Niezastosowany tekst edytora jest zachowany osobno, blokuje zapis/przełączenie projektu i pojawia się w `studio.view.inspect` jako `meshEditorDrafts`; `draftDirty` uwzględnia ten stan. Agent nie powinien traktować niezwalidowanego tekstu jako zapisanego dokumentu.

## Podgląd i eksport

PNG, WebM i `candidate.build` wskaż na tę samą zapisaną rewizję. Polecenia, joby i pobieranie plików pozostają takie jak w [instrukcji CLI](C:/Projects/nwn-vfx/docs/agents/cli.md) i [WebMCP](C:/Projects/nwn-vfx/docs/agents/webmcp.md).

ASCII MDL zawiera rzeczywiste `trimesh`, tablice `verts/tverts/faces`, materiał oraz `positionkey`, `orientationkey`, `scalekey`, `alphakey` w animacji `impact`. HAK zawiera ten sam model. `validation.json` odczytuje siatki i kontrolery z zapisanych bajtów w `readback.meshes`; błędy eksportu nie pomijają aktywnej warstwy.

Statyczne `alpha` geometrii w MDL wynosi 0, a widoczność nadaje animacja `impact`. Przy niezerowym alpha na granicach warstwy liniowy kontroler wymaga rampy do 1 ms; eksporter zgłasza tę różnicę jawnie w diagnostyce i `visibilityRampSeconds`. Alpha równe 0 w pierwszym i ostatnim kluczu pozwala uniknąć tego przybliżenia. Czasy nierozróżnialne w float32 są odrzucane.

`nativeVerified` pozostaje `false`. Materiał, przezroczystość i interpolacja wymagają osobnej kwalifikacji w NWN; ta implementacja nie uruchamia gry. Własne tekstury PNG, ich normalizacja, UV oraz eksport zależności TGA/TXI są dostępne; opisuje je [instrukcja tekstur](textures.md). Pełny importer MDL/FBX, światła i ribbon nie należą do tej wersji.

Od 0.11.0 dostępny jest również [kanał deformacji vertices dla custom mesh](mesh-deformation.md), schema 7.

Rigid custom meshes also support [explicit flat/smooth shading](mesh-shading.md) since 0.12.0.
