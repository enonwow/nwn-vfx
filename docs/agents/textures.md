# Tekstury i wiek cząstki — Studio 0.4.1

UI, CLI i WebMCP używają wspólnych operacji. Import zasobu tworzy rewizję, a przypisanie go do warstwy jest osobną zmianą. Pola tekstur wymagają dokumentu co najmniej `schemaVersion:3`; dotychczasowe dokumenty 1/2 są nadal obsługiwane. Dokument 4 z orientacją emitera zachowuje wersję 4 także po imporcie zasobu.

## Import obrazu

Obsługiwany podzbiór: PNG RGBA, 8 bitów na kanał, bez przeplotu ani animacji. Oba wymiary są potęgami dwóch od 8 do 1024; maksymalnie 2 MiB pliku, 8 zasobów i 6 MiB zwartego dokumentu JSON wraz z obrazami base64. Piksele RGB są interpretowane jako sRGB, alpha jako liniowa. PNG bez informacji o kolorze, z sRGB lub standardowym gAMA 45455 są obsługiwane; ICC, cHRM i inne gamma są jawnie odrzucane. Import TGA nie jest obsługiwany; TGA jest formatem eksportu.

Z dowolnego katalogu, także repozytorium konsumenta:

```text
nwn-vfx --json capabilities
nwn-vfx --json assets import --project <id> --expected-revision <n> --file <jawny-plik.png> --idempotency-key <klucz-importu>
nwn-vfx --json assets list --project <id> --revision <rewizja-z-importu>
nwn-vfx --json assets get <assetId> --project <id> --revision <rewizja-z-importu>
```

CLI odczytuje wskazany plik lokalnie. Do usługi przesyła wyłącznie jego nazwę i zawartość base64, nigdy ścieżkę do odczytania przez backend. `assets.import` zwraca `{project,assetId}`. Tożsamość zasobu jest SHA-256 dokładnych bajtów PNG; ponowny import tego samego obrazu zwraca istniejący zasób bez nowej rewizji. Zachowaj osobny stabilny klucz każdej zamierzonej mutacji. Przy ponowieniu po utracie odpowiedzi użyj tego samego klucza i wejścia.

WebMCP udostępnia `studio.assets.import`, `studio.assets.list`, `studio.assets.get`. Import przyjmuje `{viewSessionId,input:{projectId,expectedRevision,fileName,pngBase64},idempotencyKey}`; nie przyjmuje ścieżki ani URL. Jest operacją w zakresie `edit` przyznanego projektu. AI pause zatrzymuje nowe importy. Lista zawiera metadane bez base64, a get cały ograniczony zasób. Nie myl zasobów dokumentu (`assets`) z wynikami jobów (`artifacts`).

## Jawne dopasowanie rozmiaru

Od 0.4.1 można wybrać normalizację podczas tego samego importu. Domyślny tryb pozostaje ścisły: obraz 1254×1254 zostanie odrzucony, jeżeli nie podasz opcji. W UI wybierz „512” albo „1024” w ustawieniu rozmiaru importu. CLI:

```text
nwn-vfx --json assets import --project <id> --expected-revision <n> --file <oryginalny.png> --target-size 1024 --idempotency-key <klucz>
```

WebMCP dodaje `targetSize:1024` (lub `512`) do `input` operacji `studio.assets.import`; wszystkie pozostałe wymagania sesji i praw pozostają takie same. Pole `targetSize` jest opcjonalne, a inne wartości są odrzucane.

Tryb ten przyjmuje boki od 1 do 4096 px, także niebędące potęgami dwóch. Wejście może mieć format RGB8 lub RGBA8, bez przeplotu i do 8 MiB. RGB8 otrzymuje alpha255. Obowiązują dotychczasowe ograniczenia profilu koloru; tRNS i animowane PNG pozostają odrzucane. Obraz jest dopasowywany do kwadratu 512×512 albo 1024×1024 bez przycinania, z zachowaniem proporcji z dokładnością do zaokrąglenia do piksela. Pozostałe miejsce wypełnia przezroczysty margines; przy nieparzystym marginesie dodatkowy piksel jest po prawej/na dole. Zmniejszanie używa średniej obszarowej, powiększanie interpolacji dwuliniowej. Oba filtry liczą RGB w przestrzeni liniowej sRGB z premnożoną alpha, po czym zapisują PNG z prostą alpha. Wynik jest ponownie walidowany według ścisłych limitów zasobu, w tym 2 MiB.

Oryginalny plik pozostaje niezmieniony. Zasób przechowuje nowy PNG, a `asset.id` i `source.sha256` są hashem **zapisanego wyniku**. `source.normalization` zawiera `originalSha256`, `originalColorType` (2=RGB, 6=RGBA), oryginalne wymiary, `targetSize`, rozmiar treści, przesunięcia, `version:1`, `method:area|bilinear`, `colorSpace:linear-srgb`, `alphaMode:premultiplied`. Jest to zapis pochodzenia; oryginalne bajty pozostają u wywołującego, nie są dodawane do ZIP. Hash wyniku jest sprawdzany na podstawie jego bajtów, hash źródła można sprawdzić na oryginalnym pliku. Powtórny identyczny wynik zachowuje pierwszy istniejący zasób wraz z jego pochodzeniem. `assets.list/get`, historia, handoff i ZIP przenoszą te metadane; podgląd i TGA używają dokładnych znormalizowanych pikseli.

## Przypisanie i UV

`texture:"asset:<assetId>"` działa na emiterze oraz mesh. `blend` to `normal` albo `additive`. Nowa własna tekstura domyślnie używa normal. Wbudowane `spark`, `smoke`, `glow` pozostają dostępne. `texture:null` usuwa mapę mesh; opcjonalne `blend` można przywrócić do wartości domyślnej przez null. W emiterze wybierz konkretną teksturę wbudowaną albo własną.

Przykład pliku zmian; podstaw ID rzeczywistego zasobu i warstw:

```json
[
  {"type":"layer.set","layerId":"dust","values":{"texture":"asset:<assetId>","blend":"normal"}},
  {"type":"layer.set","layerId":"wave","values":{"texture":"asset:<assetId>","blend":"additive"}}
]
```

```text
nwn-vfx --json changes preview --project <id> --expected-revision <n> --input-file <zmiany.json>
nwn-vfx --json changes apply --project <id> --expected-revision <n> --input-file <zmiany.json> --idempotency-key <klucz-zmiany>
```

UV ma początek w lewym dolnym rogu i współrzędne 0–1. Ring/disk używa mapowania planarnego `u=.5+x/(2*outerRadius)`, `v=.5+y/(2*outerRadius)`; tekstura pokrywa kwadrat obejmujący geometrię. Prostopadłościan mapuje każdą ścianę na cały obraz. Dla własnej siatki `geometry.uv` jest tablicą par, a `geometry.uvFaces` ma po jednej trójce indeksów UV na każdy trójkąt geometryczny. Indeksy UV są niezależne od indeksów wierzchołków, co pozwala tworzyć szwy bez zmiany geometrii.

```json
{"kind":"custom","vertices":[[0,0,0],[1,0,0],[0,1,0]],"faces":[[0,1,2]],"uv":[[0,0],[1,0],[0,1]],"uvFaces":[[0,1,2]]}
```

Mesh custom z teksturą wymaga UV. Nieprawidłowe indeksy, niezgodna liczba uvFaces i brak obrazu dają diagnozę. `geometry` wraz z UV jest jednym atomowym polem blokady/cofania. `texture` i `blend` mają własne blokady. W UI oczekujący JSON geometrii pozostaje szkicem do zastosowania. Import obrazu przy niezapisanym szkicu jest zablokowany z wyjaśnieniem; późniejsza edycja podczas oczekiwania na import jest zachowywana.

## Trzy punkty życia cząstki

Początek: `color`, `alpha`, `size`. Koniec: `endColor`, `endAlpha`, `endSize`. Środek: opcjonalne `midColor`, `midAlpha`, `midSize`. Jeden wspólny `midPercent` w zakresie 0.01–0.99 określa ułamek **wieku każdej cząstki**, z domyślnym 0.5. W UI jest prezentowany jako 1–99%. Nie oznacza sekund od początku warstwy.

```json
[{"type":"layer.set","layerId":"dust","values":{"color":"#aa8866","midColor":"#c8b49b","endColor":"#665544","alpha":0,"midAlpha":0.7,"endAlpha":0,"size":0.05,"midSize":0.3,"endSize":0.5,"midPercent":0.35}}]
```

Brak środkowej wartości zachowuje liniowy przebieg kanału. Jawne punkty interpolują od startu przez środek do końca. Null usuwa opcjonalny punkt i przywraca wyliczany środek. Eksport zapisuje color/alpha/size Start/Mid/End oraz wspólne `percentStart 0`, `percentMid`, `percentEnd 1`. Nie ma niezależnego czasu środka dla każdego kanału ani dowolnych krzywych Béziera.

## Przenoszenie i odbiór

`projects export` tworzy ZIP z pełnym `project.json`, manifestem w wersji 2 i osobnymi `assets/<hash>.png`. Manifest wiąże dokładny dokument, snapshot, metadane pochodzenia i każdy plik. Import ZIP jako nowego projektu weryfikuje całość; brakująca, zmieniona lub nadmiarowa zależność nie jest pomijana. Starsze ZIP z manifestem 1 nadal są obsługiwane bez własnych zasobów PNG.

PNG/WebM i build kieruj na tę samą rewizję. `handoff.json` wskazuje `snapshotSha256` oraz metadane zasobów. Custom PNG jest dekodowany wspólnie przez podgląd i eksport TGA RGBA. MDL zapisuje bitmap oraz UV w tverts/indeksach faces, TXI zapisuje tryb mieszania, HAK zawiera używane zależności. Readback w `validation.json` odczytuje faktycznie zapisane pliki. Emiterowe maski wbudowane w podgląd nadal są proceduralnym przybliżeniem; ścieżka własnego PNG używa wspólnych pikseli RGBA.

`nativeVerified:false`. Weryfikacja plików nie stanowi testu działania w NWN ani zatwierdzenia artystycznego. Światło, ribbon i kwalifikowany runner pozostają osobnymi rozszerzeniami.
