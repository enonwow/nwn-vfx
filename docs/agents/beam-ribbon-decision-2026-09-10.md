# Drain Life — decyzja o ruchu materiału

**Decyzja: jeden mały prototyp `linked-periodic-pan-v1`: okresowa tekstura
skręconego pasma, przesuwana przez atlas klatek na prostym Linked.** To droga
do pozornego skręcania, nie geometria helisy. Nie jest jeszcze funkcją Studio
ani potwierdzonym efektem w NWN. Bez kolejnej iteracji czterech losowych nitek.

## Dlaczego ta metoda

Wybrana [referencja filmu](https://www.youtube.com/watch?v=fGoYFGiorRg) jest
opisana przez autora jako przesuwana tekstura na płaskich quadach; wygląd
skręcenia jest namalowany w teksturze. Jego studium używa Unity i krzywej
Bezier. Oryginał gry korzystał z dwóch ribbons, co potwierdza wypowiedź
Rachel Day. [Opis autora](https://agilethief.artstation.com/projects/3reR2),
[omówienie techniki](https://realtimevfx.com/t/overwatch-vfx-mercy-healing-beam/699).
Film nie dał się odczytać przez narzędzie web; decyzja dotyczy opisanej techniki,
nie analizy klatek ani potwierdzenia wizualnego dopasowania.

Linked już potrafi wybierać klatkę atlasu przez `fps`, `framestart/frameend`
i `xgrid/ygrid`. Jego pełny zakres V powtarza się na każdym segmencie.
W starym `nativeMotion` psuło to otwieranie/zamykanie całego beama. Przy
**okresowym przesuwaniu** powtórzenie może być zamierzone: jeśli
`T(u,v+1)=T(u,v)`, klatka `F_k(u,v)=T(u,fract(v-sign*k/N))` ma zgodne
końce każdego segmentu. Znak odpowiada wybranemu kierunkowi; orientację
eksportu należy jawnie sprawdzić. To wniosek z mapowania i okresowości,
nie dowód braku szwów geometrii w grze.

## Najmniejszy zakres implementacji

1. **Jeden carrier**, `segments:2` → **3 punkty**, `radius:0`,
   `lightningScale:0`, `flow.speed:0`, `random:0`, jedna reattachable reference.
   Daje dwa powtórzenia tekstury na całej dynamicznej osi. Nie odtwarza
   zakrzywienia Bezier ani stałej długości wzoru w metrach. Zmiana odległości
   rozciąga wzór. Dotychczasowa szerokość statycznego Linked pozostaje `2*width`.
2. **Własny okresowy PNG** z jednym/dwoma miękkimi namalowanymi pasmami,
   przez istniejące `assets.import`; V wzdłuż, U wszerz. Generator przesuwa
   cały RGBA, nie samą maskę jasności. Początek/koniec V każdej wynikowej
   klatki muszą być identyczne; brzegi U przezroczyste. Źródło nie jest nadpisywane.
3. **Mały atlas początkowy:16 klatek,16×1,1024×256** (64×256 na klatkę).
   Jeden rząd zapobiega sąsiedztwu różnych faz na końcach V; przezroczyste
   brzegi U ograniczają mieszanie sąsiednich klatek. Dla tego profilu potrzebny
   jawny TXI `filter 1/mipmap 0` z odczytem kontrolnym — obecny zamknięty
   podzbiór Studio dopuszcza tylko `mipmap 1`. Nie zmieniać materiału essence.
4. **Podgląd odtwarza te same dyskretne klatki i dwa powtórzenia**, bez
   syntetycznej helisy i wygładzania nieobecnego w eksporcie.16 próbek fazy
   to ograniczenie jakości; nominalna pętla wynosi16/fps sekund. NWN zaokrągla
   postęp do kadencji renderowania. Płynność i zgodność faz obu segmentów są
   warunkiem testu, nie obietnicą ciągłego UV panningu.
5. Eksport mieszany zachowuje dokładny Fountain V17, jego `cast01`, istniejące
   assety i zasady lifetime. W nowym forku zastępuje wyłącznie warstwę Linked.
   Odczyt ASCII/binary sprawdza3 punkty, referencję, flags258, atlas16×1,
   klatki0–15, FPS, wyłączenie losowego startu oraz SHA źródła/atlasu/TGA/TXI.

## Minimalny proponowany kontrakt

Nowe opcjonalne, atomowe pole warstwy `materialMotion` (nazwy **proponowane**, nie
obecne operacje):

```json
{
  "type":"layer.set",
  "layerId":"ribbon",
  "values":{
    "materialMotion":{
      "mode":"periodic-pan",
      "direction":"source-to-target",
      "fps":15
    }
  }
}
```

FPS:liczba całkowita1–30;15 to wejście diagnostyczne, nie zaakceptowane tempo.
Tekstura pochodzi z istniejącego `texture`; mapowanie wyłącznie V/source,
bez crop. Generator ustala16 klatek; null usuwa ustawienie. Walidacja wymaga
powyższego carrier, okresowości i brzegów. `nativeMotion` pozostaje zablokowane
i nie może współistnieć z nowym polem.

Bez nowej rodziny narzędzi: `projects.fork` → `assets.import` →
`changes.preview/apply` → `preview.request` → `candidate.build` →
`jobs.get/artifacts.get/read`; WebMCP używa tych samych operacji `studio.*`.
Potrzebne są: następna wersja dokumentu/ZIP i minimalnego klienta, aktualizacja
zamkniętych schematów/capabilities, UI, wspólnego generatora, blokad, undo oraz
testów. Zachować rewizje, idempotency, pauzę AI i szkice. Metadane muszą podawać
`mapping:per-segment`, `wholeSpanRepeats:2`, `nativeVerified:false`,
`nativeCadenceVerified:false`, `geometryHelix:false`; bez gwarancji synchronizacji
z essence lub inną instancją.

## Jedno kryterium natywnego go/no-go

**Jedno nieprzerwane nagranie minimum trzech pełnych pętli przy poruszającym się
celu:** namalowane pasmo ma przesuwać się i pozornie skręcać w zadanym kierunku
przez środek beama, bez widocznego resetu fazy/szwu/zmiany kierunku na łączeniu
dwóch segmentów, z tempem uznanym przez użytkownika za płynne; essence V17
pozostaje widoczna i zachowuje swój feed/drain. Brak takiego przebiegu = brak
kwalifikacji tej metody. Nie przechodzić wtedy do kosmetycznej serii wariantów.

## Baza dowodowa i stan

Wykorzystano istniejący [audyt crasha](beam-crash-2026-09-10.md) i odczyt
`PartEmitter::RenderEmitter` pod0x4ad4c0: klatka/clock pod0x4ae269–0x4ae300,
UV pod0x4ae310–0x4ae3f3. Dodatkowe ograniczone sprawdzenie754 bajtów funkcji
potwierdza inicjalizację wspólnego frameStart/czasu oraz osobną bramkę losowego
startu: `Particle::initialize`0x4abbf0, `chkRandom`0x4acd10,
`MdlNodeEmitter::IsRandom`0x4ab000. Manifest:
`C:/Projects/nwn-vfx/output/beam-ribbon-decision-2026-09-10/manifest.json`.
Źródło to przypięty Linux retail ELF SHA256
`6d19c39bc646af5ddbc333ff31797a4acd9019506bcb45ef1b93b1bd5925e700`;
nie uruchamiano pliku. Początkowa zgodność klatek wynika z odczytu kodu;
zachowanie Windows i kadencję ma sprawdzić konsument.

Ta decyzja nie zmienia aplikacji, lab14387, runtime0.28.2, projektów ani
artefaktów. Nie utworzono nowego kandydata. Natywna integracja i test pozostają
w zadaniu „The Last City - VFX”.
