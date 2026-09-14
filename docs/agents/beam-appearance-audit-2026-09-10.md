# V10 / V11 — audyt materiału i zgodności podglądu, 2026-09-10

Nie wykazałem uszkodzenia eksportu V11 ani braku ustawienia TXI, które samo
wyłączałoby przezroczysty emiter Normal. Wykazałem duże osłabienie parametrów
obrazu względem białej kontroli V10 oraz konkretne różnice pomiędzy podglądem
Studio i ścieżką renderowania NWN. Przyczyna niewidoczności V11 w Windows
pozostaje nierozstrzygnięta; poniższy audyt nie zastępuje obserwacji konsumenta.

## Tożsamość i zakres

| Kandydat | Projekt / rewizja | Job | Snapshot SHA-256 |
| --- | --- | --- | --- |
| V10 | studio-finite-essence-visibility-v10 / 3 | e67badcd-11df-4d85-99c5-ced0f90c9552 | 1a1fca0fba0ad1b01d333fa71588eeac3c2e1e40a2af6c1f8b15a31b654254cc |
| V11 | c5174697-46c0-41f5-85a0-12845b93759d / 3 | b03ece1f-a72c-40a4-b6c9-36fc8b27a7ba | f951cb29dcfa374ae3ce229a73bbd2483c8fd3c95865c23968b08264cba05276 |

Wejścia: `output/beam-high-visibility-v10/binary` oraz
`C:/Projects/the last city/assets/vfx/wampir/drain-life/studio/carmine-v11-r3-candidate`.
Odczyt plików, bez wywołań usługi, nowych jobów i zmian projektów. Brak zmian
laboratorium 14384, globalnej instalacji 4317, MOD/HAK konsumenta i procesów NWN.

Konsument zgłosił widoczne V10 i niewidoczne/nieczytelne V11. To obserwacja
zewnętrzna, której nie przeprowadzałem ponownie. Przekazana tożsamość nagrania
V11: `native/beam-v11/runtime/drain-life.mp4`, SHA-256
`b9f400f5dafb3b24ad151424b5ae54a7a532ecf9f42141c1098d541c1935b247`.

## Co zachowuje eksport

- Sprawdzono hash i rozmiar wszystkich 13 artefaktów wymienionych w handoff V10
  oraz 15 z V11. Te listy nie obejmują samego handoff i zewnętrznego candidate.zip.
- Wszystkie 3 zasoby HAK V10 i 5 zasobów HAK V11 są identyczne z osobnymi plikami
  MDL/TGA/TXI kandydata. Obie tekstury V11 mają identyczne piksele; różne resrefy
  wynikają z odmiennych TXI dla Normal i Lighten.
- Porównano każdy bajt RGBA PNG z niezależnie odczytanym BGRA32 TGA, również RGB
  pod zerową alfą. Wymiary, fizyczne odwrócenie wierszy i dolny początek TGA 0x08
  są poprawne. Nie następuje utrata alfy ani dodatkowe przemnożenie RGB przez alfę.
- Odczyt istniejącego wyniku dekompilacji zgadza się ze źródłowym MDL w ramach
  tolerancji float32 czytnika: V10 7 węzłów / 3 kontrolery animacji, V11 12 / 6.
  Zachowane są właściwości materiałów, alphaStart/Mid/End, sizeStart/Mid/End,
  colorStart/Mid/End, lifeExp oraz klucze birthrate. To kontrola zasobów,
  nie dowód odtwarzania tych kontrolerów w grze.

Kod: `packages/nwn-format/src/textures.ts:12`, `:27`,
`packages/nwn-format/src/mdl-writer.ts:150`.
Metadane normalizacji PNG `alphaMode:premultiplied` opisują filtr resamplingu.
`packages/core/src/textures.ts:175` dzieli RGB przez alfę przed zakodowaniem
wynikowego PNG. Nie jest to deklaracja przechowywania premultiplikowanych pikseli.

## Rzeczywista różnica V11 względem V10

| Właściwość głównego emitera | V10 | V11 |
| --- | --- | --- |
| Tekstura | biała, 32×32, RGBA=255 | miękka wisp, 512×512 |
| Średnia alfa tekstury | 1 | 0,119832 |
| Piksele o alfa > 0,5 | 100% | 10,895% |
| Piksele o alfa > 0,9 | 100% | 3,365% |
| Maksymalna alfa tekstury | 1 | 253/255 |
| Rozmiar start / mid / end | 0,5 / 0,5 / 0,5 m | 0,2 / 0,24 / 0,1 m |
| Alfa start / mid / end | 1 / 1 / 1 | 0,35 / 1 / 0 |
| Kolory start / mid / end | białe | #c95d72 / #d37184 / #9b344f |
| Count | 144 | 110 |
| Blend | Normal | Normal |

Maksymalna powierzchnia quada V11 to 23,04% V10. Czysto analityczna średnia
`size² × alfa emitera × średnia alfa tekstury` po życiu jednej cząstki wynosi
1,269% V10, jeszcze przed uwzględnieniem koloru i mniejszego count. Nie jest to
pomiar jasności, widoczności ani całego efektu: pomija nakładanie, perspektywę,
mipmapy, RGB, tło, fog i głębię. Sama średnia RGB tekstury ~0,15 nie jest jasnością
jej widocznego rdzenia; średnią zawyża/zaniża udział przezroczystych pikseli.
Raport zapisuje osobno `meanRgbTimesAlpha` (~0,062 na kanał), zamiast mnożyć
niezależnie średnie RGB i alfa.

V11 dodaje drugi emiter `fine-flow`: count 270, bez pulse, blend Lighten,
rozmiar 0,09/0,14/0,035, alfa 0,08/0,38/0 i ciemniejszy karmin. V11 nie jest
próbą izolującą jedną przyczynę. Wspólne pozostają lifeExp=0,6, zasilanie 3 s,
animacja 3,6 s, P2P Bezier i punkty źródła/celu; pierwszy emiter zachowuje pulse.

## Normal, TXI i render silnika

Źródło statyczne: retail Linux ELF SHA-256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`.
Dowody w `C:/Projects/New Folder/beam-appearance-audit-2026-09-10`.

1. `PartEmitter::Initialize` porównuje blend z `Normal`, ustawia stan 0
   (`emitter-blend.asm.txt:41`, `:48`). W `RenderEmitter` ten stan wywołuje
   SetBlendFunc(0,1) (`emitter-render.asm.txt:193`). Tablica 0x12f5040 mapuje to
   GL_SRC_ALPHA / GL_ONE_MINUS_SRC_ALPHA. Lighten trafia do (0,2), czyli
   GL_SRC_ALPHA / GL_ONE. Oba odpowiadają RGB blendom użytym przez Three przy
   premultipliedAlpha=false (`WebGLState.js:674`).
2. `Material` startuje z parametrami (0,1), adresy 0x4c63fc i 0x4c6406.
   `ParseField` zmienia je dla `additive` i `punchthrough`. `blending default`
   zachowuje stan początkowy (`txi-parser.asm.txt:69`). Nie znaleziono tu
   wymogu dodania TXI `transparencyhint`; znaleziony parser tego słowa jest
   parserem MDL trimesh. Nie jest to twierdzenie o każdym możliwym parserze gry.
3. Obydwa odczytane stockowe `fsparticle` zaczynają od iloczynu
   `VertexColor * texture2D(...)`; alfa tekstury współdziała z alfą cząstki.
   Wywołują też AlphaDiscard, a przy odpowiedniej jakości — soft particles
   zależne od depth oraz fog. Nie ustalono aktywnej konfiguracji/shadera Windows.

`shader-manifest.json` zawiera hashe KEY, adresy BIF i hashe shaderów z obu
katalogów niezależnie, tabelę blendów oraz 11 asercji instrukcji. Samo posiadanie
stockowego shadera nie dowodzi, który wariant lub override działał w nagraniu.

## Wykazane różnice podglądu, bez przypisywania im niewidoczności

- **Filtrowanie:** podgląd `renderer/src/index.ts:195` używa LinearFilter i
  `generateMipmaps=false`; TXI obu kandydatów ma `mipmap 1 / filter 1`.
  Podgląd nie odtwarza minifikacji zadanej eksportem. Biała jednolita kontrola
  V10 nie sprawdza zachowania miękkiego, szczegółowego obrazu V11 przy oddaleniu.
- **Scena:** shader cząstek Studio (`renderer/src/index.ts:29`) nie zawiera
  odpowiednika natywnego wygaszania od depth ani fog. Stockowy retail shader
  `nwn_retail-fsparticle-2069.txt:37` zawiera te ścieżki. Wpływ na konkretną
  scenę nie został zmierzony i nie jest rozpoznaniem przyczyny.
- **Kolor:** `core/src/particles.ts:4` interpoluje kolory w linear RGB;
  `mdl-writer.ts:18` zapisuje kanały sRGB / 255. Three wczytuje teksturę jako
  SRGB8_ALPHA8 i koduje wynik do sRGB. Stockowy vertex shader przekazuje vColor.
  Pełna zgodność przestrzeni kolorów, interpolacji i końcowego postprocessingu
  Windows pozostaje niepotwierdzona. Nie należy zmieniać eksportowanego RGB
  w ciemno na linear na podstawie samej tej różnicy reprezentacji.

Żadna z powyższych różnic nie uzasadnia deklaracji „naprawiliśmy V11”.

## Najkrótsze rozstrzygnięcie dla konsumenta

Zachować widoczne V10 jako punkt odniesienia. Pierwszy fork: wymienić wyłącznie
teksturę na wisp, zachowując biel, alfa=1, rozmiar=0,5 i count=144. Jeżeli działa,
materiał obsługuje tę teksturę i można osobno oceniać rozmiar, obwiednię alfy,
kolor, a na końcu dodatkową warstwę. Jeżeli nie działa, przerwać zmiany palety
i gęstości oraz izolować sam obraz/materiał i warunki sceny. Próby wykonuje
konsument; ten audyt nie tworzy nowego kandydata ani instalacji.

Odtworzenie wyłącznie kontroli plików:

```text
node --import tsx scripts/audit-beam-appearance.ts
python scripts/audit-particle-shaders.py
```

Wyniki: `output/beam-appearance-audit-2026-09-10/candidate-comparison.json` oraz
`C:/Projects/New Folder/beam-appearance-audit-2026-09-10/shader-manifest.json`.
