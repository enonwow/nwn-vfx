**SMOKE-v5: statyczny audyt podglądu i eksportu 0.21.1**

Nie znalazłem błędu mnożnika alpha, skali 100/0,01 ani utraty `percentMid`
w badanym eksporcie. Są natomiast konkretne niespójności podglądu: losowy
czas życia i prędkość, których nie opisuje eksport, oraz projekcja wielkości
cząstek niezależna od FOV. Nie przesądzają one przyczyny rzadkiego dymu w NWN.

Analizowany `smnew_smoke`, projekt `studio-smoke-single-0211` r2, ma SHA-256
`f7e305859714d6ab66e6b2e1f30a3e47f3f981b9ff945d2173ab143f5d04694a`.
To hash modelu wskazanego w konsumenckim `smoke-v5/package-manifest.json`.
Zweryfikowano również MP4: `b0e83538012132080ee5a7f8f3378bc8c6cf106dfccbeec070315c1b6dd0bcc3`,
6 638 517 bajtów. Według konsumenta nowy smoke i atlas są widoczne, stare
odpowiedniki nie były widoczne w tej sekwencji, a bright działa w obu wersjach.
To wynik konkretnych przypadków. `nativeVerified:false` pozostaje; nie wykonano
tu własnej sesji native ani pełnej kwalifikacji renderowania.

**Rozmiar.** [Shader](C:/Projects/nwn-vfx/packages/renderer/src/index.ts:18)
wyznacza bok point sprite jako `size * viewportHeight / depth`, z limitem 300 px.
Pomija `projectionMatrix[1][1] / 2`, potrzebne do projekcji boku kwadratu
o danej wielkości w świecie. Niezależna projekcja dwóch punktów przez
`THREE.PerspectiveCamera` daje dla FOV 39°, wysokości 640 px i głębokości 8 m:
kwadrat 1 m = 112,9565 px, cząstka = 80 px. Stosunek boków to 0,70824,
a pól około 0,5016. Zmiana FOV zmienia wielkość mesha, lecz nie wielkość
cząstki przy tej samej głębokości; przy FOV 90° stosunek wynosi już 2.
To błąd spójności metrycznej podglądu. Nie jest to zmierzony przelicznik NWN;
nie uzasadnia mnożenia rozmiaru eksportu przez 1,412. Przy domyślnych 39°
kierunek tej różnicy wręcz nie wyjaśnia mniejszego pokrycia w grze.

**Czas życia i ruch.** [Renderer](C:/Projects/nwn-vfx/packages/renderer/src/index.ts:256)
losuje życie `life * (0.85 + random * 0.3)` i następnie według niego skaluje
całą krzywą alpha/size. Prędkość losuje w zakresie 0,6–1,4 wartości autorskiej
([linia 260](C:/Projects/nwn-vfx/packages/renderer/src/index.ts:260)).
[Eksport](C:/Projects/nwn-vfx/packages/nwn-format/src/mdl-writer.ts:152)
zapisuje stałe `lifeExp=life`, `velocity=speed`, `randvel=0`.
Dla głównych emiterów życie podglądu wynosi 0,867–1,173 s wobec zapisanego
1,02 s, a szczyt alpha 0,19074–0,25806 s wobec nominalnego 0,2244 s.
Podgląd ma zatem inny rozkład zanikania i rozproszenia. To pewna różnica
autorskich danych i symulacji, nie pomiar wewnętrznej losowości retail NWN.

**Krzywe i przezroczystość.** Bezpośredni odczyt binarnych kontrolerów
24 emiterów potwierdził dokładne wartości float32 alphaStart/Mid/End,
sizeStart/Mid/End, percentStart/Mid/End, lifeExp, velocity i randvel.
[Wspólny sampler](C:/Projects/nwn-vfx/packages/core/src/particles.ts:12)
interpoluje alpha i size odcinkami liniowymi po unormowanym wieku.
[Writer](C:/Projects/nwn-vfx/packages/nwn-format/src/mdl-writer.ts:147)
zapisuje te same węzły krzywych. `percentMid=.22` trafia do binarium jako
0,2199999988; nie ma konwersji na 22 ani dzielenia przez 100. Wszystkie
skale rodziców badanego dymu wynoszą 1. Retail interpretacji/interpolacji
tych pól nie można w pełni zakwalifikować samym odczytem.

| Część chmury | Docelowa liczba cząstek | Alpha start/mid/end | Life | Nominalny szczyt |
|---|---:|---|---:|---:|
| 18 emiterów body | 72 | 0,03 / 1 / 0 | 1,02 s | 0,2244 s |
| 6 emiterów edge | 18 | 0,03 / 0,68 / 0 | 0,65 s | 0,143 s |

Body ma nominalne alpha 0,33937 po 0,75 s i 0,02514 po 1 s; wtedy rosnący
rozmiar nie oznacza rosnącej zasłony. [Shader atlasu](C:/Projects/nwn-vfx/packages/renderer/src/index.ts:22)
mnoży alpha tekstury przez alpha wieku. Nie stosuje do custom PNG mnożnika
0,48 obecnego w osobnej procedurze wbudowanego dymu. W konwencji podglądu
przy 12 fps szczyt body przypada na klatkę atlasu 2: jej średnie alpha to
0,2630, a alpha > 0,5 zajmuje tylko 26,79% kwadratu. Klatka 6 ma średnie
alpha 0,4737, lecz przy wieku 0,5 s krzywa body jest już w fazie zanikania.
AlphaMid=1 zachowuje maskę PNG; nie zamienia jej w nieprzezroczysty kwadrat.
Pokrycie wielu nakładających się cząstek wymaga osobnej oceny przestrzennej.

**Normal i ograniczenia porównania.** `render Normal` określa billboard
zwrócony do kamery; mieszanie jest osobnym polem. Dym ma `blend Normal`
i TXI `blending default`, a preview `THREE.NormalBlending`, bez premultiplikacji.
Nie ma dowodu dodatkowego globalnego tłumienia alpha przez samo `render Normal`.
Takie rozdzielenie opisuje [przewodnik emiterów](https://nwn.wiki/pages/viewpage.action?pageId=139690011)
i realizuje [niezależny importer rollnw](https://github.com/jd28/rollnw/blob/main/lib/nw/model/mdl_particle_import.cpp).
Rollnw nie jest kodem retail NWN. Filtracja nadal różni się: preview wyłącza
mipmapy ([linia 186](C:/Projects/nwn-vfx/packages/renderer/src/index.ts:186)),
TXI włącza `mipmap 1`; natywne próbkowanie, sorting i kolor nie są ustalone.
Referencja postaci w Studio jest przesuniętą w bok, przezroczystą siatką
o opacity 0,12 ([linia 130](C:/Projects/nwn-vfx/packages/renderer/src/index.ts:130)),
więc nie zastępuje testu zasłaniania nieprzezroczystego modelu postaci.

Zalecany kierunek: naprawić spójność projekcji i uzgodnić jawne zasady
losowości preview z eksportem. Gęstość oceniać na osobnym wariancie z dłuższym
okresem wysokiego alpha oraz kontrolą pojedynczego nieprzezroczystego billboardu
obok geometrii o znanym rozmiarze. Nie kompensować nieustalonej skali NWN
globalnym mnożnikiem eksportera. Porównywać ten sam wiek efektu: podane PTS
VFR określają czas w nagraniu, nie same w sobie czas od wywołania VFX.

Dowód liczbowy i hashe kodu: [evidence.json](C:/Projects/nwn-vfx/output/smoke-preview-native-audit/evidence.json).
Odtworzenie analizy bez uruchamiania native: [skrypt audytu](C:/Projects/nwn-vfx/scripts/audit-preview-emitter-parity.ts).
Analiza nie zmieniła projektów, eksportów, szkiców ani działającej usługi.
