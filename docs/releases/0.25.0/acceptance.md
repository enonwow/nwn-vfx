# Studio 0.25.0 — własne wiązki EffectBeam

Wdrożono minimalny model authoringu beama: własna tekstura PNG, kolor, alpha,
szerokość, parametry Lightning i dwa punkty podglądu. Człowiek i agent korzystają
z tych samych operacji edytora, CLI i WebMCP. Presety pozostają tylko dokumentami
początkowymi. To pierwszy nośnik do niezależnego testu natywnego, nie gotowy
artystycznie Drain Life ani potwierdzenie jego zachowania w NWN.

## Instalacja i zachowanie danych

- Globalny CLI oraz usługa `http://127.0.0.1:4317` działają w **0.25.0**.
- Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspace
  `7def76b2-ad42-4b55-a5e8-d919b79a8587` zachowane.
- Pakiet `output/releases/nwn-vfx-studio-0.25.0.tgz`: **2 593 755 B**,
  SHA-256 `6d7f84eca86266947b62cce71eda6605c054489299825dc7f6a3ae1368042b6f`.
- Skill repozytorium, osobisty i zainstalowany mają SHA-256
  `944b64f344708272ca67fd9384f0b6c37f3257cd7efc45f7d42f6ba5b091c69f`.
- Restart uzgodniono z konsumentem. Przed nim publicznym CLI odczytano **89 głów
  projektów**, ich rewizje i kanoniczne hashe, oraz potwierdzono brak aktywnych
  jobów. Sprawdzono PID 44660, czas utworzenia i ścieżkę zainstalowanej usługi.
- Pierwszą instalację zablokował Windows EBUSY. Po zatrzymaniu właściwej usługi
  instalację ponowiono i zakończono. Logi nieudanych prób zachowano.
- Po aktualizacji **wszystkie 89 głów zachowały rewizje i hashe**. Projekt
  `tlc-wampir-drain-life@2` i jego PNG oraz `tlc-wampir-drain-wisp` pozostały
  nietknięte. Nie przeładowywano kart ze szkicami użytkownika.

Pierwsze użycie beama promuje nowy dokument do **16**, ZIP do **11**, minimum
Studio **0.25.0**, nagłówek klienta `X-NWN-VFX-Document-Schema:16`. Czytanie
historycznych projektów nie migruje ich. Profil ASCII to
`nwn-ee-beam-ascii-experimental-v1`, binarny odpowiednio `beam-binary`.

## Zakończone kontrole

- Końcowy pełny przebieg **277/277 testów**. Build i TypeScript przeszły.
  Wcześniejszy przebieg wykrył tylko nieaktualne oczekiwanie listy wersji
  dokumentu w teście orientacji; dodano wersję 16 i ponowiono kontrolę.
- Geometria rzeczywistych wierzchołków podglądu: szerokość i dokładne końce
  przy odległościach **0.1, 1, 3, 12 i 30 m**, w kilku chwilach. Zmiana
  punktów lub flow nie zmienia MDL, zgodnie z ich statusem intencji podglądu.
- ASCII: Lightning/Linked, referencja fx_ref, rodzice, kontrolery, brak
  detonate i animacji. Binary: niezależny od dekompilatora, ograniczony zakresami
  odczyt rzeczywistych kontrolerów i referencji; celowe uszkodzenie fx_ref
  odrzucane. Tekstury i zasoby HAK odczytane z kontrolą bajtów.
- Serwis: prawa/grant, pauza, blokady, konflikt, ponowienie, undo, ZIP,
  odrzucenie starszego klienta z rollbackiem oraz kontrakt opublikowanych jobów.
- Chrome: tworzenie beama przez UI; pending numeric `-`; odmowa zmiany widoku;
  zastosowanie szerokości, punktów i flow; import PNG przez adapter; PNG/WebM
  oraz ASCII/binary. Sprawdzono błędy strony i błędy shaderów. Zrzut edytora
  i PNG obejrzano; to techniczna próbka, nie zatwierdzona grafika efektu.
- Regresje Chrome DUR i DUR/audio zaliczone. Test odłączenia DUR poprawiono,
  aby czekał na zakończenie operacji UI przed sprawdzeniem lokalnego grantu.
  Podczas przejścia wcześniejszy test otrzymywał UNAUTHORIZED z serwera zamiast
  końcowego WEBMCP_NOT_CONNECTED. Ochrony dostępu nie osłabiono.
- Metadane beama używają `previewWindowSeconds`; nie deklarują pętli natywnej.
  Mnożnik okna podglądu działa w UI i wspólnych operacjach.

## Rzeczywisty WebMCP

Test rzeczywistego hosta Codex wykonano na izolowanej instancji **0.25.0** pod
`http://127.0.0.1:14402`, na tym samym zbudowanym frontendzie/backendzie, który
następnie spakowano i zainstalowano. To nie był podszyty rejestr ani wywołania
CLI przedstawione jako WebMCP. Osobno testy Chrome używały jawnego rejestru
fixture. Izolowaną instancję i własną kartę zamknięto po teście.

Host odkrył **49 narzędzi, 64 516 B** deskryptorów z origin/pageUrl, czyli 1020 B
poniżej limitu 65 536. Krótkie lokalne `$anchor`/`$ref` pozwalają zachować
komplet narzędzi i granic walidacji. Test porównuje rozpakowane schematy
z kanonicznymi oraz decyzje AJV; rzeczywisty host wykonał te kontrakty.

Agent utworzył `studio-beam-0250-webmcp`, ustawił własną wiązkę i PNG. Własny
projekt zakończył na rewizji **6** po zapisaniu i usunięciu testowej ludzkiej
blokady. Zaliczono: ponowienie bez dodatkowej rewizji, REVISION_CONFLICT,
AI_PAUSED, LOCKED, ustawienie czasu/zaznaczenia, DRAFT_CONFLICT i zachowanie
surowego szkicu podczas renderowania/eksportu. Odwołanie grantu kończyło się
WEBMCP_NOT_CONNECTED. Testowy szkic odrzucono, własną kartę zamknięto.

Przez `studio.artifacts.read` pobrano **31 plików** czterech jobów do
`nextOffset:null`; sprawdzono każdą porcję i pełny rozmiar/SHA. Obejmują ASCII,
binary, PNG i WebM dwóch okien podglądu. Raport:
`output/releases/0.25.0/real-host-webmcp.json`, pliki w podkatalogu `webmcp`.

## Zainstalowany CLI i przykład dla konsumenta

Globalny CLI uruchamiano z **C:/Projects/the last city**. Publiczne operacje
utworzyły `studio-beam-0250-cli@3`, schema16, snapshot
`c363a0ef079d0d88cbb3088ec8635f5c50f7d5b9c4890e5c1411444fdc22fec5`.
Zaimportowano własną techniczną teksturę, zastosowano zmianę, wyeksportowano
ZIP11 i wykonano sześć jobów wraz z pobraniem i kontrolą wszystkich artefaktów.

| Kontrola | Job |
| --- | --- |
| Dawny FnF z audio | 25a3ffc1-60da-4789-b2dc-4396530162fa |
| Dawny DUR z audio | 8ff8ef46-7b05-4146-a6d2-92648ad82d1c |
| Beam ASCII | 66614c7d-20f2-4e3f-93c3-5d955dc1e170 |
| Beam binary | 7b12c9d0-cf1d-4081-a546-c6c3c2bea0e4 |
| PNG | 1d86bdd7-0205-4c9b-a047-fe6cc9b8714a |
| WebM 6 s | f23c4f96-b382-43bd-bfd7-411b8b95b839 |

**Po 11 plików zasobów FnF i DUR z audio** zachowało SHA-256 względem eksportu
0.24.0 tego samego źródła: MDL, HAK, TGA/TXI, WAV, NSS i audio-events.json.
To porównanie dotyczy zasobów, nie zmieniających wersję opisów eksportera.

Przykłady są w `output/releases/0.25.0/{ascii,binary,png,video}`. Model
`custom_beam.mdl` ma SHA-256:

- ASCII: `8f5ef200121544b0a488eeeda2a2c24c34a9e54782853f8fd761e979fce9b964`;
- binary: `73fa6e00851a6461c1ff1d3cff9f87a1243ba47e048bff754a86396734b3a316`.

Dokładny batch `output/releases/0.25.0/tlc-drain-life-r2-to-beam.json` atomowo
zmienia lifecycle, usuwa `sparks` i dodaje `beam` z PNG konsumenta. Publiczne
changes.preview zwróciło OK na @2; **nie wykonano apply**. Konsument dostał
plik, polecenie, wersję, profile i limity, aby sam zapisać zmianę i przeprowadzić
próbę natywną. Użyty biały multiplier nie dodaje kolejnego tintu do jego PNG.

## Granice pierwszej wersji

Eksportowany jest statyczny EFFECT: Lightning/Linked, p2p0/p2p_sel1,
inherit_local1, reattachable fx_ref. Kontrolery width/color/alpha i Lightning
powstają z dokumentu; native width, segmentacja, tekstura i ruch wymagają próby.
`vfx-integration.json` schema3 daje Type_FD B oraz progfx Type7/Param1 resref/
Param2 cast01. Row ID pozostają null; konsument wybiera wiersze, źródło/cel,
body nodes i zewnętrzny czas działania. cast01 zachowuje obserwowaną konwencję
stock 2DA; model nie ma autorskiej animacji o tej nazwie.

**Flow direction/speed, seed i współrzędne source/target są intencją podglądu.**
Nie eksportujemy jeszcze kierunku natywnego przepływu, narastania, animacji
zaniku/odpływu, ciągłych emiterów przy końcach ani audio w profilu beam.
Pierwszy profil dopuszcza maksymalnie osiem aktywnych wiązek; cząstki FnF można
autoryzować w osobnym efekcie i jawnie przyłączyć po stronie konsumenta.

Wszystkie metadane pozostają **nativeVerified:false**. Nie uruchamiano
Toolsetu/NWN, nie integrowano MOD/HAK konsumenta ani nie modyfikowano jego
runnerów. Odczyt zasobów jest dowodem struktury; odbiór wyglądu, ruchu i stop
pozostaje po stronie kwalifikowanego zadania The Last City.

Kontrakt: [beam.md](../../agents/beam.md), źródło techniczne:
[project.json](../../agents/examples/beam/project.json). Dowody: raporty
`output/releases/0.25.0/{installed-acceptance,installed-preservation,real-host-webmcp,native-reference-hashes}.json`
oraz `output/playwright/{beam,duration,duration-audio}/acceptance.json`.
Logi `output/beam-*` zachowują również wcześniejsze nieudane próby.
[Manifest lokalnych źródeł i pakietu](source-manifest.json) wiąże wynik
z plikami w repozytorium bez pierwszego commita.
