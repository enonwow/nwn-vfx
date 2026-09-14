# Statyczna orientacja emitera — Studio 0.5.0

Emiter może wyrzucać cząstki w dowolnym kierunku. UI, CLI i WebMCP używają tego samego opcjonalnego pola `orientation`, tych samych rewizji, praw i blokad. Orientacja jest statyczna; klucze obrotu emitera nie należą do tej funkcji.

## Kontrakt i układ współrzędnych

`orientation` ma postać `[axisX, axisY, axisZ, angleRadians]`: jednostkowa oś obrotu i kąt w radianach w zakresie ±8π. Układ jest prawoskrętny, z Z skierowanym w górę. To ta sama reprezentacja co w siatkach mesh. Trzy pierwsze liczby określają **oś obrotu**, a nie kierunek wyrzutu.

Stożek wyrzutu i początkowa prędkość powstają wokół lokalnego +Z emitera. Orientacja obraca tę prędkość do układu świata. Grawitacja jest skalarem działającym osobno wzdłuż światowego Z: dodatnia wartość przyspiesza w dół, ujemna w górę. Obrót emitera nie obraca grawitacji.

Podgląd zachowuje dotychczasową skalę całej trajektorii:

```text
pozycja(t) = position + scale × (R(orientation) × prędkośćLokalna × t
                               + [0, 0, -0.5 × gravity × t²])
```

`t` oznacza wiek cząstki od jej narodzin. `position` jest światowym początkiem emitera. Zmiana orientacji nie obraca początku emitera, rozmiaru cząstki ani grawitacji. Dotychczasowe losowanie prędkości, czasu życia, rozrzutu i narodzin pozostaje takie samo; podgląd trajektorii jest przybliżeniem silnika NWN.

| Kierunek osi wyrzutu | `orientation` |
| --- | --- |
| +Z, w górę | brak pola albo `[0,0,1,0]` |
| +X | `[0,1,0,1.5707963267948966]` |
| −X | `[0,1,0,-1.5707963267948966]` |
| +Y | `[1,0,0,-1.5707963267948966]` |
| −Y | `[1,0,0,1.5707963267948966]` |
| −Z, w dół | `[1,0,0,3.141592653589793]` |

Niepodanie pola oznacza obrót neutralny i zachowuje stare dokumenty oraz ich dotychczasowy podgląd. Jawne użycie pola wymaga dokumentu `schemaVersion:4`; wspólne operacje promują dokument automatycznie. Pozostałe dokumenty nadal zachowują wersje 1/2/3. Usunięcie orientacji nie obniża wersji dokumentu. Import tekstury do dokumentu 4 również nie obniża jego wersji.

## Edycja przez CLI i WebMCP

Najpierw odczytaj konkretny projekt, rewizję oraz `schema get changes.apply`. Poniższy plik zmian kieruje istniejący emiter `dust_outward_0` po +X. ID jest przykładem — użyj identyfikatora rzeczywistej warstwy.

```json
[{"type":"layer.set","layerId":"dust_outward_0","values":{"orientation":[0,1,0,1.5707963267948966]}}]
```

```text
nwn-vfx --json changes preview --project <id> --expected-revision <n> --input-file orientation.json
nwn-vfx --json changes apply --project <id> --expected-revision <n> --input-file orientation.json --idempotency-key <zachowany-klucz>
```

Te same dane `values.orientation` działają w `layer.add` i `studio.changes.apply`. W WebMCP zachowaj zwykłą kopertę z `viewSessionId`, `input`, `expectedRevision` i kluczem idempotencji. Przed działaniem na karcie odczytaj `studio.view.inspect` i respektuj niezapisany szkic. Operacje zmieniają zapisaną rewizję, a nie szkic człowieka.

`orientation:null` w `layer.set` usuwa opcjonalną orientację emitera i przywraca neutralne zachowanie. Nie jest dozwolone dla mesh, gdzie orientacja jest polem wymaganym. Zero długości osi, oś niejednostkowa, niewłaściwa liczba elementów i niefinitywne wartości są odrzucane; API nie poprawia ich automatycznie. Cała orientacja jest jednym polem blokady `orientation`, historii i selektywnego cofania. Pauza AI oraz blokada `*` również obowiązują.

W edytorze można wybrać kierunek osiowy albo podać własną oś i kąt. Niezastosowana edycja jest szkicem człowieka; blokuje zapis/przełączenie projektu. Kontekst karty zachowuje ją w polu `orientation` wpisu `meshEditorDrafts` według ID emitera. Nazwa tej mapy pochodzi z wcześniejszego edytora geometrii i jest zachowana dla zgodności klientów.

## Podgląd, eksport i granice dowodu

PNG, WebM i build wskaż na tę samą zapisaną rewizję. Sprawdź kilka momentów, w tym niską emisję poziomą przy niezerowej grawitacji. WebM ma stałe próbkowanie `k/30`; wolniejszy render wydłuża pracę, nie usuwa faz efektu.

Eksport zapisuje orientację statycznego węzła `emitter`; jego rodzic pozostaje bez obrotu i przechowuje pozycję oraz skalę warstwy. Parametry `mass`, `velocity`, `spread` i wyłączone dziedziczenie pozostają dotychczasowe. Odczyt MDL w `validation.json` sprawdza rzeczywiście zapisany obrót i strukturę rodzica, zamiast zakładać poprawność na podstawie wejściowego dokumentu.

Kierunek podglądu i odczyt danych MDL można potwierdzić automatycznie. Zgodność natywnej fizyki, jednostek `mass`, rozkładu stożka i zachowania konkretnego NWN pozostaje niezakwalifikowana: `nativeVerified:false`. Ta funkcja nie uruchamia nowego runnera NWN, nie dodaje świateł ani ribbonów.

Przy projektowaniu kontraktu sprawdzono [transformację emitera i wybór układu cząstek w rollnw](https://github.com/jd28/rollnw/blob/5ab55c0af98ba92576df8f31863e71c6d26cac72/lib/nw/model/mdl_particle_import.cpp#L82) oraz [obrót lokalnego kierunku i integrację cząstek](https://github.com/jd28/rollnw/blob/5ab55c0af98ba92576df8f31863e71c6d26cac72/lib/nw/render/particle_system.cpp#L164). Jest to niezależna implementacja formatu, która uzasadnia przyjęty kierunek; nie stanowi dowodu zachowania zainstalowanego silnika NWN.
