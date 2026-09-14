# Studio 0.26.0 — autorska animacja tekstury beama

Dodano opcjonalne nativeMotion do warstwy beam: flow/opening/closing, kierunek impulsu, FPS, względna długość impulsu i jawne crop/fit. Operacje UI, CLI i WebMCP zapisują ten sam dokument. Własny PNG pozostaje niezmienny; podgląd i eksporter używają tego samego pochodnego atlasu. Nie jest to zatwierdzona artystycznie grafika Drain Life ani dowód działania w NWN.

## Instalacja

- Globalne CLI i usługa http://127.0.0.1:4317 działają w 0.26.0.
- Pakiet output/releases/nwn-vfx-studio-0.26.0.tgz: 2652134 B, SHA256 bdc4389049666908437fa81058b84530594d4a3a323d84e43b36a4d53fc124b8.
- Skill repo/osobisty/zainstalowany: SHA256 4c34c02c1c5c80337d21123d3e4f40c56201680bc4eab935194a9a47cbb0ef5e.
- Konsument zwolnił usługę do restartu. Przed zatrzymaniem odczytano publicznym CLI 90 głów projektów oraz brak aktywnych jobów. Zweryfikowano zainstalowany proces PID9104 i jego ścieżkę. Stop/install/start zakończyły się poprawnie.
- Wszystkie 90 głów zachowały rewizje i hashe. W tym tlc-wampir-drain-life@3: 3926a72b74f709a3d21c62e92c669f88ec42cf881b7f862375e415cf60631621. Nie zmieniono projektu ani grafiki konsumenta.
- Instance 12d0fa8e-4887-4f00-ad74-9bb15b05c057 i workspace 7def76b2-ad42-4b55-a5e8-d919b79a8587 zachowane. Dane przeglądarki i stare szkice nie były przeładowywane. Aktualizacja wymaga świeżej karty.

## Weryfikacja

- Build/typecheck passed. Pełny zestaw **285/285** testów passed. Pierwszy przebieg283/284 wskazał wyłącznie starszą oczekiwaną listę schematów w teście orientacji; uzupełniono17. Dodatkowy test kosztu atlasów kompozycji podniósł liczbę do285.
- Piksele: przeciwne kierunki impulsu, exact first/last alpha, opening od źródła, closing usuwany od celu, źródłowy gradient X odwzorowany na native V, jawne przycięcie paddingu i identyczne źródło.
- Geometria: jeden quad, właściwy prostokąt UV każdej klatki, pełna szerokość niezależna od długości w podglądzie. Nowy profil eksportuje size=width/2; stary profil zachowuje wcześniejsze zasoby.
- ASCII/TGA: kontrolery odczytane i porównane ze źródłem, wszystkie piksele atlasu zdekodowane. Uszkodzone FPS, frameEnd, xgrid, birthrate i piksele są odrzucane. Binary: bezpośrednie odczyty FPS/frameStart/frameEnd/grid/loop; celowe uszkodzenia odrzucane niezależnie od dekompilatora.
- Serwis: uprawnienia, pauza, blokada nativeMotion, retry, konflikt, undo, ZIP12 i rollback dla klienta16. Kompozycja uwzględnia pamięć pochodnych atlasów i odrzuca przekroczenie64MiB.
- Ostateczny Chrome: nowy i historyczny beam, **2/2** przebiegi passed. UI zapisuje nową fazę/FPS, zachowuje raw '-' i blokuje zapis/nawigację; adapter uruchamia ASCII/binary/PNG/WebM i odbiera artefakty. Brak błędów strony/shaderów. PNG flow/opening/closing obejrzano: techniczny gradient, nie zatwierdzona grafika użytkownika.

## Rzeczywisty host WebMCP

Izolowana instancja0.26 na14403: **49 narzędzi, 65470 B** z origin/pageUrl. Pełny przepływ przez narzędzia faktycznego hosta Codex, bez zastępowania ich CLI lub sztucznym rejestrem. Osobny Chrome używa jawnego fixture adaptera.

Potwierdzono brak dostępu przed grantem, zapis motion, retry bez nowej rewizji, REVISION_CONFLICT, AI_PAUSED, LOCKED po zapisaniu blokady, surowy szkic FPS, DRAFT_CONFLICT, zmianę czasu/zaznaczenia i odwołanie grantu. W czasie kontroli rozróżniono niezapisaną blokadę szkicu od zapisanej blokady serwera: niezatwierdzony szkic pozostaje propozycją, a równoległa zmiana saved revision zgłasza konflikt i zachowuje propozycję.

Przez bounded artifacts.read pobrano **55 plików / 6 jobów**, z kontrolą każdej porcji, nextOffset:null, rozmiaru i pełnegoSHA. Obejmują flow ASCII/binary/PNG/WebM oraz osobne własne warianty opening/closing ASCII. Brak błędów strony. Grant odwołano; własną kartę i izolowaną usługę zamknięto.

Po instalacji ponownie odkryto narzędzia w rzeczywistym hoście na4317: **49, 65372 B**, odmowa bez grantu. Schematy mieszczą się w65536B, z niewielkim zapasem: każda przyszła rozbudowa wymaga sprawdzenia budżetu. Końcowy build zawiera dodatkową kontrolę pamięci kompozycji; końcowy Chrome i testy objęły tę zmianę. Pełny izolowany przebieg hosta dotyczył tej samej funkcji atlasu, przed dodaniem limitu kompozycji; odkrycie instalacyjne dotyczy finalnej paczki.

## Globalny CLI z katalogu konsumenta

C:/Projects/the last city: **13 jobów**, **137 plików jobów** i trzy ZIP-y źródłowe pobrane i zweryfikowane. Zachowane bajty zasobów starego FnF/audio, DUR/audio i statycznego beam0.25 (MDL/HAK/TGA/TXI/WAV/NSS/audio-events, odpowiednio do profilu). Tylko własne projekty testowe zapisywano.

- flow: studio-motion-0260-cli@3, snapshot f2a0fff6bfa81f3013b1774c81acab3b0e351f3b24c8f8f47dd4380511cad84c
- opening: studio-motion-0260-cli@4, snapshot 8aa7568207a60c4d34e958c6e56e0d6c682b9cc69c4ad88089502417819973b3
- closing: studio-motion-0260-cli@5, snapshot ec9e409b8a77f66496430673d286e20d86015846927817938ec19f42b63a7ac3

| Wynik | Źródło | Job |
|---|---|---|
| duration_audio | studio-duration-audio-0240-fnf@1 | acedeb98-35d0-4d5c-8058-a4609e1ff9b8 |
| duration_audio | studio-duration-audio-0240-loop@3 | 70e58840-0800-4cc5-8c17-31cb06a5c587 |
| custom_beam | studio-beam-0250-cli@3 | 541fc719-1736-44a9-a15c-0bf482643849 |
| bm26_flow | studio-motion-0260-cli@3 | ffad5630-d7d5-4a81-b64e-1701fe580231 |
| bm26_flow | studio-motion-0260-cli@3 | 09a28af3-62db-479b-97a4-5d804e81067e |
| png | studio-motion-0260-cli@3 | 4c576d6e-a60d-4682-b874-fe021bc6c5d7 |
| webm | studio-motion-0260-cli@3 | 73d967c2-8869-44e7-9b7e-4bfcb0dd9381 |
| bm26_opening | studio-motion-0260-cli@4 | 8c9cbd2e-8110-4787-b054-5dbaa6c143d1 |
| bm26_opening | studio-motion-0260-cli@4 | b4642fb2-46a3-44df-a4ed-40c7493cf44f |
| png | studio-motion-0260-cli@4 | 22fac4f9-5246-49b5-812c-8fd00829f4cf |
| bm26_closing | studio-motion-0260-cli@5 | f4148edd-7ea3-42f7-907d-0c81f45c9a84 |
| bm26_closing | studio-motion-0260-cli@5 | 603a54e4-c6fd-4028-b351-7290df7e2621 |
| png | studio-motion-0260-cli@5 | a0f04cec-56a8-4699-9250-72e59403a6e8 |

Szczegóły: output/releases/0.26.0/installed-acceptance.json, real-host-webmcp.json, installed-preservation.json, installed-webmcp-discovery.json oraz podkatalogi flow/opening/closing. Źródła wydania: source-manifest.json,312 plików; repo pozostaje unborn/untracked, manifest nie jest commitem.

## Granice i przekazanie

Dokument17 / ZIP12 / minimum0.26 / header17. Motion jest opcjonalne i atomowe, null je usuwa. Beam.json v2, integration v4; exporter0.26 dla nowej funkcji. Pozostałe dokumenty nie są przepisywane. Wszystkie49 narzędzi pozostają dostępne innym agentom poprzez zwykły grant/CLI.

Źródła natywne i dokładny kontrakt opisuje docs/agents/beam-native-motion.md, przykłady examples/beam-native-motion. Recovered Linked mapuje całą klatkę na każdy segment, dlatego nowy profil wymaga dwóch punktów i zerowej nieregularności. Atlas16 klatek powtarza **każdą** fazę. Native flow oznacza animację RGBA, nie transport cząstek. Opening odsłania źródło→cel, closing usuwa cel→źródło; kierunek/pulseWidth dotyczą tylko flow. Pełna szerokość nowego profilu jest mapowana na natywny półwymiar.

FPS16: idealny obieg1s, ostatnia klatka[0.9375,1)s. Renderer odrzuca resztę czasu po aktualizacji klatki; nie ma gwarantowanego natywnego bezpiecznego momentu zmiany bez pomiaru. Nie ma automatycznego stopu, hold-last, cessation ani endpoint glow. Konsument synchronizuje przełączenia NWScript, obserwuje UV/cadence/width oraz końce EffectBeam. NativeVerified i nativeCadenceVerified pozostają false. Nie uruchomiono Toolset/NWN ani nie wykonano integracji modułu z tego zadania.
