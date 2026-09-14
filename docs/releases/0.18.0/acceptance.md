# Studio 0.18.0 — wzmocnienie klipu w dB

Wdrożono 2026-09-08 do istniejącej usługi `http://127.0.0.1:4317/`.
UI, globalny CLI i rzeczywisty WebMCP działają w wersji **0.18.0**.
Instance `12d0fa8e-4887-4f00-ad74-9bb15b05c057` i workspace
`7def76b2-ad42-4b55-a5e8-d919b79a8587` pozostały te same.

## Zachowanie i zgodność

- Kontrolka **Wzmocnienie (dB)**: −60 do +24 dB, suwak co 0,5 dB,
  precyzyjne pole liczbowe oraz osobne **Wycisz**. 0 dB to poziom źródła.
- `audio.add.clip` i `audio.set.values` przyjmują `gainDb` albo `gain`.
  Jednoczesne podanie obu jest odrzucane. Wspólny przelicznik domeny
  `gain = 10^(gainDb/20)` wykonuje się raz; dokument przechowuje tylko `gain`.
- `gain:1.5`, `gain:3`, `gain:6` pokazują odpowiednio +3,52, +9,54 i +15,56 dB.
  Zaokrąglenie wyświetlania nie zmienia zapisanej wartości podczas otwierania
  ani edycji innych pól. Dotyczy to też precyzyjnych starych wartości i gain
  poniżej zakresu suwaka.
- Wyciszenie zapisuje `gain:0`. Odczyt agenta zwraca `gainDb:null,muted:true`;
  nie ma Infinity/NaN w JSON. Włączenie wcześniej zapisanego wyciszonego klipu
  zaczyna od 0 dB; lokalny odsłuch pozostaje osobnym ustawieniem.
- `projects.inspect` i `revisions.get` dodają diagnostykę `AUDIO_CLIP_GAINS`.
  `view.inspect.audioClipGains` rozdziela zapis i szkic; surowy tekst edycji
  pozostaje w `meshEditorDrafts[clipId].audio`. Niepełne stare procenty są
  zachowane jako błędna edycja, a nie automatycznie zamieniane w ciszę.
- Szczyty `peakDbFS` są mierzone przed przycięciem; cisza to null.
  Zachowano też liniowe `peak` i liczniki clippingu. UI pokazuje wynik szkicu
  przed eksportem oraz prostą informację o możliwych zniekształceniach.
  Nie dodano normalizacji, limitera, przetwarzania źródła ani zmian miksera OS.

Audio capabilities mają wersję **4**, API pozostaje 0.1.0, WebMCP ma **48 narzędzi**.
Gain ma zakres 0–15.848931924611133. Wynik zmiany z gain >4 otrzymuje dokument
**schema 10** i przenośny ZIP **v5**, z `minimumStudioVersion:0.18.0`.
Stare schema 9 pozostaje przy gain <=4 i ZIP v4. Obniżenie gain lub undo nie
obniża automatycznie wersji dokumentu; stare rewizje i ZIP v1–4 nadal są czytelne.
Identyfikatory eksportera to `nwn-ascii-vfx-0.18.0` / `nwn-binary-vfx-0.18.0`.

Nowe klienty deklarują `X-NWN-VFX-Document-Schema: 10`. Bez tej deklaracji
nowe dB i schema10 są odrzucane przez `CLIENT_UPGRADE_REQUIRED` przed zapisem.
Odczyt capabilities/schema discovery pozostaje dostępny. Deklaracja wersji nie
nadaje uprawnień; działają istniejące granty, blokady, pauza i rewizje.
Starsze importery ZIP v5 odrzucą; ich historyczny komunikat może być
`BUNDLE_HASH_MISMATCH`. Nowy importer rozróżnia nieobsługiwaną wersję paczki.

## Kontrole automatyczne

- Build i typecheck: PASS, `output/audio-db-build.log`.
- **58/58** testów domeny, API, kontraktów, wygenerowanych walidatorów,
  ograniczenia wielkości opisów WebMCP oraz eksportu ASCII/binarnego: PASS,
  `output/audio-db-verified-unit.log`.
- **1/1** dodatkowy test niepełnych historycznych szkiców procentowych: PASS,
  `output/audio-db-legacy-draft.log`.
- **6 scenariuszy przeglądarki zaliczonych**: test dB w
  `output/audio-db-verified-gain.log`; pozostałe pięć w
  `output/audio-db-verified-browser.log`. Ten drugi log zachowuje też wcześniejszy
  timeout konfiguracji testu dB; nie jest raportem pojedynczego przebiegu 6/6.
  Ostateczny test czeka na zakończenie inicjalizacji strony i konkretny nagłówek
  otwieranego projektu. Nie osłabiono ochrony VIEW_CONFLICT ani uprawnień.
- Przebieg dB sprawdza otwarcie i zapis innych pól dla gain
  0/1.5/3/1.234567890123456/1e-8, zakres, wyciszenie, błędny szkic, Save,
  undo, gain lock, AI pause, konflikt, schema10, clipping, WebM i bufor odsłuchu.
  Pozostałe scenariusze obejmują audio timeline, reset zegara i równoczesny zapis.
- Próbki są sprawdzane niezależnie od konwertera dla −20/0/+20/+24 dB,
  stereo48k i mono44.1k. Przy większym gain sprawdzane jest rzeczywiste przycięcie.
  Źródła audio pozostają identyczne.

Historię przebiegów opisują `output/audio-db-unit.log`,
`output/audio-db-browser.log`, `output/audio-db-final-unit.log` i
`output/audio-db-final-browser.log`; pierwszy nieudany test przeglądarki
pozostał w `output/audio-db-browser.log`. W trakcie prac poprawiono brak schema10
w bramce eksportera, budżet opisów, zbyt szeroką odmowę discovery dla starszych
klientów oraz oczekiwanie testu na zakończenie ładowania projektu.

## Zainstalowany CLI i porównanie ze starą wersją

`scripts/accept-audio-db-installed.ts --before` zapisał kontrolne eksporty
z działającej 0.17.0 dla izolowanych gain 0/1.5/3. Po instalacji ponowny eksport
tych samych dokumentów/modelNames dał **identyczne SHA-256 wszystkich 21
kontrolnych plików WAV/MDL/TGA/TXI**. Oryginalne paczki v4 importują się bez
zmiany dokumentu. Świeże ZIP-y mogą różnić się metadanymi czasu kontenera;
kontrola dotyczy dokładnego dokumentu i zasobów, nie timestampu ZIP.

Globalny CLI uruchomiony z `C:/Projects/the last city` wykonał preview i apply
`gainDb:24` na forku `studio-db-0180`, tworząc r2/schema10. Zgłosił clipping
bez zmiany source assets. Brak deklaracji nowej wersji klienta dał czytelną
odmowę. Dowody: `output/releases/0.18.0/legacy-baseline.json` oraz
`installed-audio-db.json`; log `output/audio-db-installed.log`.

## Rzeczywisty WebMCP

W osobnej karcie Codex **6** odczytano rzeczywistą rejestrację **48 narzędzi**
i nadano przez UI grant wyłącznie na własny `studio-db-0180`. Nie użyto makiety
rejestracji ani poświadczenia właściciela do wywołań agenta.

- Odczyt wersji/capabilities, saved/draft gain i ustawienie `gainDb:6`: PASS.
  Ponowienie identycznego klucza zwróciło tę samą r3.
- Zapisana blokada człowieka (r5): `LOCKED`; pauza: `AI_PAUSED`.
  Blokadę w UI należy zapisać, aby obowiązywała operacje na zapisanej rewizji.
- `gain` razem z `gainDb`: `INVALID_INPUT`; stara rewizja: `REVISION_CONFLICT`.
  Potwierdzona niezastosowana edycja w widoku: `DRAFT_CONFLICT` przy nawigacji.
- `gain:0`: null dBFS i null gainDb, zaznaczone Wycisz i nieaktywne pole dB.
  Undo przywróciło poprzednią wartość. `audio.add` z `gainDb:-20` zapisało gain .1.
- Końcowa r10 ma jeden klip z dokładnym **gain6**, UI **+15,56 dB**, źródła
  identyczne, czysty szkic, czas0, pauza, wyciszony monitor i 0 aktywnych źródeł.
- `candidate.build` zakończył się sukcesem. Stereo WAV i WAV dla NWN zostały
  pobrane przez `artifacts.read` w fragmentach 65536 B, z kontrolą każdego
  fragmentu, kompletnego rozmiaru i SHA-256. Niezależny maksymalny błąd względem
  próbek liniowych gain6: stereo **5.04e-9 jednostki PCM**, mono **0.4898**.
- ZIP v5 pobrany przez WebMCP został zaimportowany przez publiczne API jako
  `studio-db-0180-portable` r1; dokument jest dokładnie równy r10.
- Grant cofnięty; kolejne połączenie zwraca `WEBMCP_NOT_CONNECTED`.
  Nowa karta pozostała do oglądania. Starych kart 3/4/5 nie przeładowano.

Dowód: `output/releases/0.18.0/real-host-webmcp.json`,
`real-host-mix.wav`, `real-host-native.wav`, `real-host-project-v5.zip`.
Job: `325ba184-53a8-46c7-a087-648c968d23cc`.
Native WAV SHA-256:
`d98cef15bd06b7ff9c264519b45916190ac68b2667bb998540685227c86a6d8d`.

## Zachowanie produkcji i przekazanie

Produkcja była tylko odczytywana. Potwierdzono niezmienione dokumenty,
source assets, pełną historię i listy hash/rozmiar istniejących artefaktów:

| Projekt | Rewizja | Gain | Zachowana historia / artefakty |
| --- | --- | --- | --- |
| `tlc-wampir-ugryzienie` | 31 | 3 | 31 rewizji / 355 artefaktów |
| `tlc-wampir-bijace-serce` | 9 | 3 dla obu klipów | 9 rewizji / 127 artefaktów |

- Ugryzienie: `f8dde757445a44f07b93869ae506618776b2b41dc13a29c8bee4021eac2178e8`.
- Serce: `f16a91e6715819f64df0cc9f0cd0abbb1d5f7a0d6637ea791ed17408d1f05411`.

Przed instalacją zachowano stan **48 projektów** (45 zastanych +3 własne kontrole).
Porównanie rewizji i canonical SHA-256 jest w `installed-preservation.json`;
pełne zamknięcie kontroli produkcji i ZIP v5 w `closure.json`.
Repozytoryjna, globalnie zainstalowana i osobista umiejętność `nwn-vfx` oraz
zainstalowane instrukcje audio są zgodne. [Kontrakt audio](../../agents/audio.md)
zawiera kompletne przykłady i wymagania klientów.

Przykładowa nowa zmiana: `audio.set` z `values:{gainDb:12}`; dokładne zachowanie
obecnego poziomu to pozostawienie gain3 lub jawne `values:{gain:3}`.
Wpisanie zaokrąglonego +9,54 dB jest świadomą zmianą amplitudy.

Paczka: `output/releases/nwn-vfx-studio-0.18.0.tgz`, 2197182 B,
SHA-256 `447b7ebf7d74fca3b66dfc78dde3200a54f395a42399760ddeb74c0923625804`.
Manifest kodu: [source-manifest.json](source-manifest.json); workspace nie ma
commitu, więc identyfikację zapewniają hashe.

To odbiór authoringu, podglądu i eksportu. Studio nie uruchamiało Toolset/NWN
ani nie integrowało modułów. `nativeVerified:false`; odbiór w grze należy do
kwalifikowanego zadania konsumenta.
