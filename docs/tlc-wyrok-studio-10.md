# TLC-WYROK-STUDIO-10 — wdrożenie i odbiór smug

Data: 2026-09-06. Status: **ZAMKNIĘTE — 0.9.0, testy produktu, rzeczywisty WebMCP i odbiór konsumenta PASS**.
Źródła, globalne CLI, usługa i skill użytkownika są zgodne. 203 testy jednostkowe
i 2 testy przeglądarkowe przeszły; osobna karta Codex IAB potwierdziła tworzenie
trail, szkic, prawa, konflikty oraz odbiór PNG/WebM/ZIP z niezależnym SHA-256.
Aktualny kontrakt: `docs/agents/trails.md`; pełny odbiór: `docs/releases/0.9.0/acceptance.md`.
Snapshoty wszystkich 15 istniejących projektów były identyczne przed/po aktywacji.
TLC r52 pozostało nietknięte przez aktualizację; konsument wznowił później własne autorowanie.
Domyślne PNG/WebM zachowują siatkę/sylwetkę 0.8.0; scena bez helperów dotyczyła
wyłącznie eksperymentu formatu. Poniżej zachowano historyczny plan i wyniki
tego eksperymentu, a nie opis bieżących braków produktu. `nativeVerified:false`.

## Końcowy odbiór konsumenta

Zadanie odbierające `01a070e3-5df3-7913-943f-854ac8ea98ee` potwierdziło
funkcję na `tlc-wyrok` r60, po własnym autorowaniu publicznym CLI. Dokument
ma 32 warstwy (12 mesh, 10 emitter, 10 trail); odczytano wszystkie 20 węzłów
smug oraz 684 440 próbek pozycji i tyle samo UV. Zapis, PNG/WebM, eksport
MDL/HAK i dokładny portable roundtrip z pięcioma źródłami otrzymały PASS.
Render i eksport wiąże snapshot
`4a3393666444a81527376f8f8ce48044e9727cbfb3f1c36a7065fd5d2d0bf441`.

Odczytano [końcowy raport konsumenta](<C:/Projects/the last city/assets/vfx/wyrok/source/studio090-final-consumer-review.json>)
oraz wskazane w nim raporty paczki i kompozycji. Identyfikatory zadań, koszt,
próbkowanie i wyniki zapisano w sekcji końcowego odbioru
[wydania 0.9.0](C:/Projects/nwn-vfx/docs/releases/0.9.0/acceptance.md).
Odbiór dotyczy funkcji; wygląd względem oryginalnego konceptu nadal wymaga
strojenia, bez zgody artystycznej i bez kwalifikacji NWN. Callback nie zleca
nowej implementacji, restartu ani zmian TLC.

## Cel i granica zakresu

Ogólna cienka smuga, rysowana za punktem na jawnej ścieżce 3D. Fragmenty mają
własny wiek, lokalnie gasną i zwężają się. Kilka warstw może mieć różne ścieżki,
kolory i czasy. Ruch jest świadomą decyzją autora. Nie wyprowadzamy animacji
ze statycznego konceptu. Nie uruchamiamy NWN ani Toolsetu.

## Propozycja publicznego wejścia

Nowy typ warstwy `trail`, dodawany i zmieniany istniejącymi `layer.add/set`
w `changes.preview/apply`; dokument promowany do wersji 6. Nie dodajemy osobnej
operacji omijającej uprawnienia ani generatora specyficznego dla Wyroku.

```json
{
  "type": "layer.add",
  "layer": {
    "id": "thread_a", "name": "Złota nić", "type": "trail", "enabled": true,
    "start": 0.5, "duration": 2.5,
    "color": "#FFD786", "alpha": 0.8,
    "path": [
      {"time": 0, "position": [0, 0, 0.3]},
      {"time": 0.6, "position": [0.08, 0.02, 0.9]},
      {"time": 1.2, "position": [-0.06, 0.04, 1.5]},
      {"time": 1.8, "position": [0.03, 0.01, 2.0]}
    ],
    "width": 0.012, "tailLifetime": 0.7,
    "profile": "soft", "blend": "additive",
    "glowStrength": 0.12,
    "head": {"enabled": true, "size": 0.025},
    "maxSegmentLength": 0.05
  }
}
```

Proponowane zasady:

- Metry, Z w górę; czasy lokalne względem `start`. 2–64 punkty, pierwszy w 0,
  czasy ściśle rosnące, pozycje ±20 m; kolejne pozycje różne.
- Ścieżka jest łamaną interpolowaną liniowo. Krzywiznę autor określa punktami;
  brak losowego szumu i ukrytego wygładzania. Podział odcinków nie zmienia łamanej.
- Ostatni czas ścieżki plus `tailLifetime` musi mieścić się w `duration`;
  cała warstwa mieści się w czasie efektu. Po końcu ruchu ogon dogasa.
- `width` opisuje szerokość rdzenia; miękka poświata jest częścią profilu.
  Jest to pełna szerokość FWHM składnika rdzenia, przed dodaniem poświaty.
  `head.size` będzie pełną średnicą FWHM. Profil rdzenia jest gaussowski,
  FWHM poświaty = 2.8 × width, jej szczyt = glowStrength × szczyt rdzenia;
  pełna szerokość nośnika geometrii = 3 × width. Brzegi profilu mają zerową alpha.
  Ogon zwęża się geometrycznie
  według wieku; przezroczystość również maleje lokalnie.
- Pierwsza wersja: tylko additive + soft, jeden kolor; bez świateł, fizyki,
  kolizji, śledzenia żywej kości/obiektu i importu dowolnej deformacji siatki.
- `path` i `head` są polami atomowymi dla blokad/historii/undo. UI udostępnia
  własną ścieżkę i parametry, a niezastosowany tekst ścieżki pozostaje szkicem
  człowieka w kontekście karty.

## Reprezentacja eksportowa i dowody z kodu źródłowego

Obecny writer Studio emituje `trimesh` z jednorodnym `scalekey`. Nie wystarcza
to do zwężania odcinka bez skrócenia jego długości. Nie przyjmujemy takiej
aproksymacji, ponieważ tworzyłaby szczeliny.

Wykonalny kandydat to **generowany animmesh**: dwie przecinające się wstęgi
o wspólnych przekrojach, animowane wierzchołki dla narastania i szerokości,
animowane UV dla lokalnego wieku/przezroczystości w deterministycznej teksturze
profilu. Jedna siatka śladu, ewentualnie osobny mały punkt czołowy. Wspólne
przekroje zapobiegają szczelinom; przekroje przed narodzinami lub po wygaśnięciu
mają zerową szerokość. Niewidoczne przekroje nie są osobnymi warstwami edytora.

Obsługę formatu potwierdzają źródła kompilatora/dekompilatora NWN Explorer,
commit `3660b18459c2c762806bc0f00458fc590b376ca9`:

- [NmcAttribute.cpp](https://github.com/virusman/nwnexplorer/blob/3660b18459c2c762806bc0f00458fc590b376ca9/_NmcLib/NmcAttribute.cpp)
  rejestruje `sampleperiod`, `animverts`, `animtverts`.
- [NmcMesh.cpp](https://github.com/virusman/nwnexplorer/blob/3660b18459c2c762806bc0f00458fc590b376ca9/_NmcLib/NmcMesh.cpp)
  wylicza liczbę zestawów z rozmiaru tablic i przepisuje ASCII w kolejności
  klatka → wierzchołek do natywnego układu danych.
- [NwnMdlDecomp.cpp](https://github.com/virusman/nwnexplorer/blob/3660b18459c2c762806bc0f00458fc590b376ca9/_NwnLib/NwnMdlDecomp.cpp)
  zapisuje te same tablice i okres próbkowania przy dekompilacji.

To dowód obsługi reprezentacji w narzędziach formatu, **nie próba w grze**.
Izolowany plik z geometrią oraz UV w bloku animacji przeszedł kompilację
i dekompilację niezależnym kompilatorem oraz porównanie wszystkich próbek.
Animmesh jest wykonalną podstawą dalszej implementacji; produkt nadal nie
udostępnia warstwy trail i nie ma kwalifikacji zachowania w NWN.

## Ograniczony etap sprawdzający przed szerszą implementacją

1. Mała, niezależna od TLC próbka: zakrzywiona ścieżka i lokalne zwężanie/fade.
2. Wspólny deterministyczny kompilator próbek dla renderera i MDL; proponowane
   60 Hz, PNG na dowolnym czasie interpoluje ten sam zapis, WebM używa 30 Hz.
3. Limit 128 odcinków na ślad i jawny wspólny budżet próbek/rozmiaru wyniku.
   Przekroczenie daje błąd z wyliczeniem kosztu, bez cichego uproszczenia.
4. Odczyt serializowanego MDL: okres, liczba zestawów, każdy wierzchołek/UV,
   indeksy ścian, materiały i alpha; odczyt TGA/TXI i identyczność zasobów HAK.
5. Raport błędu próbkowania względem ścieżki, liczby węzłów, wierzchołków,
   klatek i bajtów. Jeśli reprezentacja nie przejdzie tego etapu, callback
   z konkretnym ograniczeniem przed rozszerzaniem produktu.

## Kryteria wydania 0.9.0

- Pełny zapis warstwy przez UI/CLI/WebMCP, discovery i kompaktowe schematy
  mieszczą się w limicie hosta. Dawne dokumenty zachowują zachowanie.
- Testy: idempotency, rewizje/konflikt, blokady człowieka, pauza AI, selektywne
  undo, portable ZIP i zachowanie szkiców. Brak bezpośrednich zmian SQLite.
- Sekwencja PNG i WebM co najmniej trzech różnych ścieżek: brak pełnej wstęgi
  na starcie, szczelin i sztywnych kabli; ślad za głową, lokalny fade/zwężanie.
- Eksport korzysta z tego samego modelu czasu i przechodzi odczyt zasobów.
  Wynik pozostaje `nativeVerified:false`.
- Test rzeczywistego hosta WebMCP na osobnym projekcie, odbiór artefaktów
  z kontrolą rozmiaru/SHA-256. Projekt TLC i stare karty bez ingerencji.
- Dopiero wtedy tarball, synchronizacja CLI/skilla i callback z dokładnymi
  przykładami publicznych operacji oraz raportem w `docs/releases/0.9.0/`.

## Okno instalacji

Nie jest jeszcze otwarte. Po przygotowaniu i sprawdzeniu paczki zgłoszę
wersję 0.9.0 i proponowane krótkie okno (do 5 minut na restart i kontrolę).
Do potwierdzenia okna utrzymujemy usługę 0.8.0. To nie jest termin gotowości;
gotowość zależy od przejścia etapu sprawdzającego i testów wydania.

## Wynik etapu sprawdzającego (2026-09-06)

Kod eksperymentu: `scripts/trail-feasibility/`. Wyniki:
`output/trail-feasibility/report.json`, `external-report.json`, `contact.png`,
`preview.webm`, `frames/`, `probe.zip`. Jest to eksperyment formatu, nie operacja
Studio ani wydanie 0.9.0. Źródło produkcyjne i usługa pozostały 0.8.0.

Użyto odczytanej kopii 3 gęstych ścieżek konsumenta, SHA-256
`2c60ae7875aeb9a045feccbefc71d6e586c627b665648ad517e5f0e4408e1ec5`.
Dodano 3 przesunięte w czasie kopie WYŁĄCZNIE do próby kosztu sześciu warstw;
nie są to zatwierdzone ścieżki przywołania ani zmiana TLC. Każda ścieżka ma
64 jawne punkty, 63 odcinki i 256 wierzchołków; efekt trwa 4 s.

| Pomiar | Wynik |
| --- | ---: |
| Logiczne ślady / węzły modelu (z root) | 6 / 7 |
| Zestawy klatek na ślad | 241 przy 60 Hz |
| Próbki animverts / animtverts łącznie | 370 176 / 370 176 |
| ASCII MDL | 19 152 849 B |
| Zasobowy HAK z ASCII MDL | 19 218 695 B |
| ZIP z luźnymi zasobami i HAK | 3 947 622 B |
| Binarny MDL z niezależnego kompilatora | 15 244 148 B |
| Generowanie ASCII / lokalny odczyt | 441 / 441 ms |
| Niezależna kompilacja / dekompilacja | 496 / 2164 ms |

Kompilator zbudowano lokalnie z `C:/Projects/Claude/nwnexplorer` w izolowanej
kopii pod `output/trail-feasibility/compiler-source`, MSVC v145, Win32.
Jedyna zmiana w jego kodzie C++ zastępuje inicjalizację wyszukiwania gry
odrzuceniem trybu ekstrakcji: próbka nie ma supermodelu i wymaga wyłącznie
lokalnych zasobów. Parser, kompilator geometrii, serializer i dekompilator
pozostają bez zmian. To nie jest instalacja nowego narzędzia systemowego.
SHA-256 binarium kompilatora:
`5b8b49441cbc8121ff8f38ec48651e2388d54842ccc12128cf2b59f8b735739d`.

Po ścieżce ASCII → binarny MDL → ASCII porównano **wszystkie 370 176 próbek
wierzchołków i tyle samo próbek UV**, z uwzględnieniem remapowania indeksów.
Maksymalny błąd współrzędnej: 1.69e-7 m; UV: 7.95e-8. Liczby klatek,
okres próbkowania, nazwy węzłów i liczby ścian zachowane.

Dwie istotne poprawki z eksperymentu:

- Stary dekompilator skleja jednakowe statyczne UV, nie uwzględniając różnego
  wieku w animacji. Niewidoczna poza animacją baza ma teraz osobne UV dla
  przekrojów, dzięki czemu odczyt zachowuje lokalne zanikanie.
- Jawne grupy wygładzania dla stron wstęg ograniczyły powielanie wierzchołków
  przez kompilator: binarny wynik spadł z około 44.5 MB do 15.2 MB.

Renderer próby czyta zapisane tablice MDL i odkodowane RGBA z TGA. Powstało
120 klatek PNG i WebM 30 fps. Pierwszy i ostatni PNG są identyczne i puste.
Nie ma geometrii pomocniczej. Odcinki mają współdzielone indeksowane przekroje;
widoczne klatki pokazują cienkie, lokalnie zanikające ślady. **Odbiór artystyczny
pozostaje po stronie człowieka; punkt czołowy nie jest jeszcze zaimplementowany.**

Kontrola czasu co 1/240 s: ślad nie wyprzedza punktu wyliczonego z tego samego
modelu próbek (błąd numeryczny 4.45e-16 m w osi Z), nie pojawia się przed
startem warstwy. Różnica punktu próbkowanego względem jawnej łamanej wynosi
maksymalnie 9.06 mm, głównie przy rozpoczęciu/zatrzymaniu. Różnica widocznego
czoła względem łamanej w osi Z: 0.0097 mm. Nie wolno prezentować punktu
prowadzącego z innego modelu czasu. Produkt musi ujawniać aproksymację,
przyczynowe otwarcie do dwóch okresów próbkowania oraz budżet zasobów.

Pozostało do wydania: integracja dokumentu v6, UI/CLI/WebMCP, ruchomy mały
punkt czołowy, publiczne diagnostyki/budżety, testy historii/uprawnień/szkiców,
portable i rzeczywisty odbiór narzędzi WebMCP. `nativeVerified:false`.
