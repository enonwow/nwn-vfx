<!-- Studio release 0.28.2 -->

Studio 0.29.0 adds the experimental linked-periodic-pan-v1 material:16 shared preview/export frames, two deliberate segment repeats, three safe points and scoped no-mipmap TXI. Read docs/agents/beam-periodic-pan.md and its public STATIC/ANIMATED example. Document23/ZIP18/header23; legacy nativeMotion remains blocked, nativeVerified:false.
Studio 0.28.2 adds up to four independent static Linked strands beside finite Fountain in one main MDL, plus beam-only builtin beam-soft (constant along V, soft across U). Read docs/agents/beam-multistrand.md and its executable public example. New use requires document22 / ZIP17 / minimum0.28.2 / header22. Each strand has its own authored parameters/reference; shared endpoints/direction remain atomic. Fountain and legacy resource bytes are preserved. This does NOT support phase-controlled weaving or helices between moving endpoints; seed is preview-only and Linked periodically regenerates shape. NativeMotion remains blocked; nativeVerified:false. Preserve old drafts and open a fresh tab after the lab upgrade.

Finite moving particle connections: [Studio 0.27.0 authoring and integration](docs/agents/beam-particle-flow.md).

Studio 0.26.2: [jawne mapowanie własnych PNG na odcinkach beama](docs/agents/beam-texture-mapping.md), z zachowaniem źródeł i podglądem powtórzeń NWN.

<!-- Source version: Studio0.28.1; inspect each running instance -->
# NWN VFX Studio

Studio **0.28.1**: [jedna statyczna nitka Lightning/Linked i skończony strumień Fountain/P2P w jednym modelu](docs/agents/beam-composite.md), przez UI/CLI/WebMCP. Dokument 21 / ZIP 16. Poprawiono również odczyt końcowego klucza czasu po kompilacji float32. To nadal eksport wymagający testu w NWN; usługi starszych wersji pozostają oddzielne.



Webowa aplikacja wspierająca tworzenie efektów do Neverwinter Nights: edytor warstwowy, oś czasu, podgląd, warianty A/B, eksport i porównanie z NWN. Człowiek pracuje w przeglądarce, a AI korzysta z tych samych operacji przez obowiązkowe CLI i adaptery agentów.



**Źródła0.28.0: edytor web, CLI oraz67 nazw narzędzi WebMCP w dwóch zestawach mieszczących się w limicie hosta. [Praca nad iteracją](docs/agents/iteration-workflow.md) obejmuje wszystkie siedem uzgodnionych etapów: porównania, diagnostykę, warianty, warunki/koncept, komponenty, czas i raporty zewnętrzne. Wersję konkretnej usługi sprawdź przez doctor. Globalne0.26.2 oraz lab14384 pozostają oddzielne. Eksport i readback nie potwierdzają wyglądu w NWN.**

W 0.26.1 naprawiono crash Lightning: eksport zawiera o jeden punkt więcej niż odcinków. Starsze kandydaty beama trzeba wygenerować ponownie. Eksport `nativeMotion` jest wstrzymany do przeprojektowania ruchu po całym połączeniu; szkice, PNG i podgląd działają. [Dowód awarii i poprawka](docs/agents/beam-crash-2026-09-10.md).

W 0.25.0 można tworzyć własne wiązki EffectBeam między dwoma punktami, z PNG, szerokością i parametrami Lightning. Kierunek/prędkość przepływu pozostają intencją podglądu; natywny start/stop i ruch wymagają odbioru konsumenta. [Kontrakt beam, CLI i WebMCP](docs/agents/beam.md).

W 0.21.2 billboardy podglądu mają metryczną skalę przy każdym FOV, bez limitu 300 px. Czas życia i prędkość odpowiadają źródłu, bez ukrytej losowości. Dokumenty i eksporter 0.21.1 pozostają bez zmian; otwórz nową kartę, zachowując stare szkice. [Kontrakt podglądu cząstek](docs/agents/particle-preview.md).


W 0.19.0 przełącznik **Obracaj z postacią** zapisuje właściwość całego efektu i eksportuje instrukcję `OrientWithObject` powiązaną z rewizją i modelem. [CLI, WebMCP i kontrakt integracji](docs/agents/effect-integration.md).

Własny efekt: **Nowy → Pusty projekt** zaczyna od jednego emitera, który można skonfigurować lub zastąpić własnymi warstwami. Dodawaj emitery, geometrię/OBJ, smugi, PNG i audio. Presety są przykładami, nie zamkniętą listą efektów.

W 0.18.0 **Wzmocnienie (dB)** zastąpiło procenty; jawne wyciszenie, zakres −60…+24 dB i dokładny kanoniczny gain pozostają wspólne dla UI, CLI i WebMCP.

W 0.17.0 zakres **Głośność klipu** wynosi 0–400%. 300% = gain 3, czyli dwukrotna amplituda względem 150%. UI, CLI, WebMCP i ZIP używają tego samego zakresu; monitor nadal 0–1. Raporty clippingu, brak normalizacji/limitera i oryginalne WAV pozostają zachowane. [Kontrakt i przykłady](docs/agents/audio.md).

W 0.16.0 **Głośność klipu** obsługuje 0–200%: 150% = amplituda ×1,5. UI, CLI i WebMCP korzystają z tej samej operacji. **Poziomy audio** pokazują szczyty i przycięte próbki dla stereo oraz mono NWN; brak automatycznej normalizacji i limitera. Źródła pozostają niezmienne. [Zakres gain, raport clippingu i przykłady](docs/agents/audio.md).



W 0.15.2 **Głośność klipu** ma suwak i zsynchronizowane pole 0–100% w panelu wybranego klipu audio. Ta wartość zapisuje się w efekcie i wpływa na eksport; **Głośność odsłuchu** reguluje tylko lokalny odsłuch. Apply/Save, blokady, cofanie i wspólna operacja audio.set pozostają zachowane. [Instrukcja i przykład 50% = gain 0.5](docs/agents/audio.md).



W 0.15.1 przełączenie odtwarzanego projektu na krótszy projekt audio resetuje zegar do 0, zatrzymuje odtwarzanie i wycisza odsłuch. Spóźniona klatka poprzedniej kompozycji nie nadpisuje nowej pozycji. Eksporter zasobów pozostaje 0.15.0.



W 0.15.0 własne WAV/MP3 trafiają do biblioteki i osobnych klipów na osi czasu: waveform, start/trim/offset, głośność, fades, wiele użyć jednego nagrania. Odsłuch zaczyna się wyciszony; WebM zawiera miks audio, ZIP projektu zachowuje źródła, a kandydat NWN dostarcza WAV mono/44.1 kHz i jawny manifest SoundImpact do integracji przez odbiorcę. [Kontrakt audio, CLI/WebMCP i granice natywnej integracji](docs/agents/audio.md).



W 0.14.2 eksport zapisuje TGA od dolnego wiersza, zgodnie z odczytem NWN. Odwrócony odczyt wcześniejszych tekstur odtwarza zgłoszone plamy i szew na sercu przy niezmienionej geometrii. Kolory, alpha, UV i animacja pozostają zachowane; potwierdzenie wyglądu i odtwarzania w grze wymaga testu odbiorcy. [Kontrakt tekstur i re-eksport](docs/agents/tga-origin.md). Zachowana poprawka kontrolerów z 0.14.1: [audyt animmesh](docs/agents/animmesh-export-audit.md).



W 0.14.0 gładkie cieniowanie działa także z deformacją vertices. Podgląd przelicza normalne podczas ruchu, a eksport zachowuje pełne próbki pozycji i UV oraz gładkie normalne bazowe. Animowane normalne nie są eksportowane przez przypięty kompilator. [Kontrakt i dowody](docs/agents/smooth-deformation.md).



W 0.13.0 **Paleta efektu** zmienia odcienie całej kompozycji lub wybranych warstw, z podglądem A/B i atomowym zatwierdzeniem. Obsługuje też jawną zmianę kolorów PNG z zachowaniem alpha, oryginalnych zasobów i wyłączeń. CLI `palette preview/apply` oraz WebMCP `studio.palette.preview/apply` używają tych samych operacji. [Algorytm, ograniczenia i przykłady](docs/agents/palette.md).



W 0.3.1 poprawiono maski smoke/glow i konwersję barw cząstek do sRGB. Parametry zapisanych efektów pozostają takie same; poprawny podgląd kolorowych cząstek może być jaśniejszy niż w 0.3.0. [Odbiór poprawki renderera](C:/Projects/nwn-vfx/docs/releases/0.3.1/acceptance.md).



W 0.4.0 obrazy PNG są niezmiennymi zasobami projektu zachowywanymi w rewizjach i ZIP. Można ich używać na emiterach i animowanej geometrii, z jawnym UV oraz mieszaniem normal/additive. Kolor, alpha i rozmiar cząstki mają edytowalne wartości start/mid/end oraz jeden wspólny procent środka. [Instrukcja tekstur i przebiegu cząstki](C:/Projects/nwn-vfx/docs/agents/textures.md).



W 0.4.1 opcja importu `--target-size 512|1024` dopasowuje również PNG o wymiarach innych niż potęgi dwóch. Zachowuje proporcje, prawdziwą alpha, hash źródła i opis transformacji. UI i WebMCP udostępniają ten sam wybór. Import bez tej opcji pozostaje ścisły.



W 0.4.2 błędy podglądu zachowują etap i ograniczony opis rzeczywistej przyczyny w `job.error.details`. Nieudany start lub timeout Chromium nie jest już automatycznie opisywany jako brak instalacji. WebM nadal próbkuje dokładnie `k/30` i koduje wszystkie klatki, niezależnie od czasu renderowania.



W 0.5.0 emiter ma opcjonalną statyczną `orientation` w postaci jednostkowej osi i kąta w radianach. Obraca ona lokalny stożek +Z i początkową prędkość cząstek, zachowując grawitację w osi Z świata. Edytor daje sześć kierunków osiowych i własną oś/kąt; CLI/WebMCP używają zwykłych `layer.add/set`. Użycie pola promuje dokument do wersji 4. [Kontrakt orientacji i przykłady](docs/agents/emitter-orientation.md).



Wersja 0.6.0 dodała odczyt `native test status --candidate <build-job-id>` w CLI oraz `studio.native.test.status` w WebMCP. Raport wskazuje konkretny eksport i brakujące dowody natywne. Oczekuje na zewnętrzny kwalifikowany runner; nie uruchamia NWN i nie uznaje eksportu za pozytywny test. [Kontrakt statusu](docs/agents/native-test-status.md).



W 0.9.0 przycisk **Dodaj smugę** oraz `layer.add/set` pozwalają tworzyć własne świetlne ślady: jawne punkty 3D z czasami, lokalne zwężanie i zanikanie, opcjonalny punkt prowadzący. Podgląd i animmesh w eksporcie używają wspólnych próbek 60 Hz z jawnym budżetem. PNG/WebM zachowują dotychczasową siatkę i sylwetkę pomocniczą. [Kontrakt smug i przykłady CLI/WebMCP](docs/agents/trails.md). Wcześniejsze 0.7.x dodały import OBJ i materiały, a 0.8.0 własny kadr renderu.



Uruchomiony edytor: [http://127.0.0.1:4317](http://127.0.0.1:4317). Dane są przechowywane w katalogu `.nwn-vfx` użytkownika, niezależnie od katalogu wywołania CLI.



```text

nwn-vfx service start

nwn-vfx --json doctor

nwn-vfx --json projects list

```



Wersja 0.9.0 wymaga Node.js 24 i Chromium do podglądów. WebM wymaga także `ffmpeg` na PATH (z enkoderem `libvpx-vp9`). Z repozytorium: `npm ci`, `npx playwright install chromium`, `npm run build`, `npm link`; sprawdź też `ffmpeg -version`. Na Windows renderer używa pełnego Chromium w trybie headless (`channel:'chromium'`), aby nie uruchamiać konsolowego `chrome-headless-shell.exe`; instalacja `--only-shell` nie wystarcza. CLI i FFmpeg zachowują ukrywanie okien swoich procesów. CLI można zainstalować z lokalnej paczki npm zawierającej zbudowany frontend/backend. Prywatny runtime Node i pełny instalator Windows są dalszą częścią planu.

Plik `apps/web/src/generated/webmcp-contracts.ts` jest generowany i pomijany przez Git. Polecenia `npm run dev`, `npm run build`, `npm run typecheck` i `npm test` odtwarzają go automatycznie. Przed bezpośrednim uruchomieniem testów przez `tsx` lub kompilatora `tsc` wykonaj `npm run generate:browser-contracts`.



Działają: tworzenie własnego efektu przez **Nowy projekt → Pusty projekt** (jeden początkowy emiter), presety cewki i fiolki, dodawanie i edycja warstw, oś czasu, warianty A/B, historia/cofanie, blokady i wstrzymanie AI, ZIP projektu, eksport ASCII MDL/TGA/TXI/HAK z odczytem wyników, trwałe zadania oraz PNG/WebM bez otwartej karty. CLI, API i WebMCP korzystają ze wspólnych operacji, schematów, praw i rewizji. Historia pokazuje rzeczywistego autora oraz czas operacji, a zapis zachowuje edycje wykonane podczas oczekiwania na odpowiedź.



Warstwa `mesh` obsługuje prostopadłościan (`box`), pierścień/dysk (`ring`) i własne wierzchołki z trójkątami (`custom`). Edytor oraz agenci mogą zmieniać pozycję, orientację axis-angle, jednorodną skalę, kolor i alpha, a także cztery kanały kluczy: `position`, `orientation`, `scale`, `alpha`. Podgląd i eksport korzystają ze wspólnej geometrii. Stare dokumenty zachowują `schemaVersion: 1`, `2` lub `3`; orientacja emitera promuje dokument do 4. Materiały mesh promują do 5, smugi do 6. Wszystkie sześć wersji jest obsługiwanych, a koperta API pozostaje 0.1.0.



WebMCP udostępnia także kontekst konkretnej karty: projekt, zaznaczenie, czas podglądu oraz niezapisany szkic, w tym oczekujący tekst edytorów JSON geometrii i animacji. Człowiek nadaje ograniczony dostęp przez **Połącz agenta → Udostępnij projekt AI** i cofa go przez **Odłącz WebMCP**. Gotowość konkretnej przeglądarki wymaga jej własnego discovery; brak wsparcia nie wyłącza UI ani CLI.



Podgląd jest przybliżeniem, a materiał i animacja mesh wymagają kwalifikacji w NWN. Obecny eksport jest paczką zasobów; nie zawiera gotowego MOD ani rejestracji efektu w docelowym module. Światło, dowolny ribbon, import MDL/FBX i kwalifikowany adapter NWN nie są jeszcze dostępne. PNG ma jawny obsługiwany podzbiór: RGBA8 bez przeplotu, sRGB, potęgi dwóch 8–1024, do 2 MiB. Capabilities raportują limity i `webmcp: true`, `mcp: false`, `nativeVerified: false`, `nativeTestAvailable: false`. Zwykły MCP pozostaje osobnym etapem implementacji.



- [Raport poprzedniego wydania 0.2.0, w tym rzeczywisty WebMCP w Codex IAB](C:/Projects/nwn-vfx/docs/releases/0.2.0/acceptance.md)

- [Instrukcja CLI dla innych projektów](C:/Projects/nwn-vfx/docs/agents/cli.md)

- [Instrukcja WebMCP i uprawnienia karty](C:/Projects/nwn-vfx/docs/agents/webmcp.md)

- [Geometria i animacja mesh w 0.3.0](C:/Projects/nwn-vfx/docs/agents/mesh.md)

- [Skill dla agentów](C:/Projects/nwn-vfx/skills/nwn-vfx/SKILL.md)



- [Kierunek produktu i pierwszy odbiór](C:/Projects/nwn-vfx/docs/design/product-direction.md)

- [Plan implementacji i kryteria zakończenia V1](C:/Projects/nwn-vfx/docs/plans/implementation-plan.md)

- [Integracja agentów innych projektów, w tym the last city](C:/Projects/nwn-vfx/docs/design/external-agent-integration.md)

- [Sterowanie UI, CLI, MCP i WebMCP](C:/Projects/nwn-vfx/docs/design/human-ai-control-contract-draft.md)

- [Audyt wcześniejszego zadania i wyjaśnienia autora](C:/Projects/nwn-vfx/docs/audits/codex-vfx-human-ai-audit-2026-09-05.md)



Wybrano osobny produkt w tym repozytorium: frontend React/Three.js oraz backend API w TypeScript/Node.js z SQLite. Usługa działa lokalnie, z edytorem otwieranym pod adresem w przeglądarce. Docelowy adapter testów ma połączyć backend z zainstalowanym NWN/Toolsetem; jego brak nie blokuje edycji, podglądu i pobierania eksportu. Publiczny hosting nie jest jeszcze przedmiotem wdrożenia.



Pierwszy przebieg działa do eksportu i niezależnego odczytu zasobów. Próba w NWN wymaga jeszcze własnego modułu demonstracyjnego, profilu i dowodów centralnego runnera. Docelowy zakres V1 obejmuje trzy rodzaje warstw oraz pełny odbiór obu efektów opisany w planie.



Studio 0.11.0: [deformacja własnych siatek, CLI/WebMCP i wspólne próbki podglądu/eksportu](docs/agents/mesh-deformation.md).



Studio 0.12.0: [smooth shading for rigid custom meshes](docs/agents/mesh-shading.md), with binary normal readback.


## Saved audio gain in dB (0.18.0)

Clip gain uses -60 to +24 dB and a separate mute control. UI, CLI and WebMCP share one conversion; exact legacy linear gains remain unchanged on open/save. `gainDb` and `gain` are mutually exclusive. Peaks are reported in dBFS before clipping. Gain >4 creates schema 10 / ZIP v5; audio capabilities v4 and client schema negotiation make the compatibility boundary explicit. See [audio authoring](docs/agents/audio.md).

Studio 0.20.0: własne animowane atlasy PNG dla emiterów przez UI, CLI i WebMCP. Siatka, zakres klatek i prędkość od narodzin każdej cząstki; schema 12 / ZIP v7. [Kontrakt i przykłady dla agentów](docs/agents/emitter-flipbook.md). Kolejność i wygląd w NWN wymagają osobnego testu konsumenta.

Studio 0.21.1: stała emisja dla jednego wspólnego wybuchu, jawna diagnostyka gęstych zdarzeń oraz niezależny odczyt binarnych detonate/birthrate/flag. [Kontrakt i ograniczenia emisji](docs/agents/emitter-emission.md). Nie kwalifikuje widoczności w NWN.
