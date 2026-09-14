# Studio0.29.0 — odbiór prototypu okresowej wstęgi

Wdrożono `linked-periodic-pan-v1` w UI/CLI/WebMCP i eksporcie. Jeden wspólny
generator16 klatek,3 punkty,2 powtórzenia, random0 i TXI bez mipmap wyłącznie
dla tego profilu. [Kontrakt i przykład](beam-periodic-pan.md).

Lab14387 zachował instance `8b4f65b0-db70-4c0e-b891-4e300c66ec43` i workspace
`00055d70-45f3-47f4-ac83-73bbef89e88d`. CLI: `C:\Projects\nwn-vfx\output\beam-composite-0281\lab\runtime-0290\bin\nwn-vfx.mjs`.
Ten sam ograniczony `tlc-agent.config.json`; restart przez `lab/start-lab.ps1`
ustawia istniejące lab/data. Frozen `lab/runtime-0290-manifest.json`.
Pełny handoff: `C:\Projects\nwn-vfx\output\beam-periodic-pan-0290\handoff.json`.

| Wariant | Projekt@rewizja | Job | ZIP artifact |
| --- | --- | --- | --- |
| ANIMATED | `614b5b56-df93-45b4-8eeb-97aa54a78d98@3` | `5297b4ea-9637-4fbe-a6f6-e46952c2946b` | `c6518b4c-548c-42fb-9f3a-18756118be19` |
| STATIC | `7d651fde-091e-448c-b637-b5c77d27f1da@2` | `1d855d09-786e-4af8-ba07-6a6f5f73e5f4` | `c803326b-659d-4dee-ae3c-2833b3208b49` |

ZIP SHA256 ANIMATED: `5fa0afe3fdf210f2bc9584ee5ec37fe5e8c425ddbe7a5f67ab87ffbc1d062126`.
ZIP SHA256 STATIC: `51031a5a48559ffa989b2d50758326cff4717c9142ea7b34e1f1f4063f89eea2`.
Lokalne pliki obu wariantów: `C:\Projects\nwn-vfx\output\beam-periodic-pan-0290` — `animated/static.zip`, `.png`, `.webm`.
To proceduralna tekstura diagnostyczna, **nie zatwierdzony art**.

- 317/317 testów,0 pominiętych/błędów; końcowe4 testy nowego profilu i build/typecheck PASS.
- Publiczny przykład z repo konsumenta zrobił fork/import/changes/build i PNG/WebM.
 Wznowienie z tymi samymi kluczami zachowało istniejące projekty.
- `public-readback.json`: exact essence V17, wszystkie3 wcześniejsze assety,
 cast01, węzły poza nitką, binarne kontrolery i essence TGA/TXI. Dodano1PNG.
 Frame0 atlasu jest dokładnie teksturą STATIC. Różnice carrier to wyłącznie
 texture/resref, xgrid16/1, fps15/0 i frameend15/0;3punkty i flags258 wspólne.
 Dokumenty mają schema23 i różnią się materialMotion oraz niewizualną nazwą
 forka. STATIC raportuje legacy exporter0.28.1, ANIMATED0.29.0.
- `webmcp-acceptance.json`: rzeczywisty host przeglądarki, ograniczony grant,
 fork, szkic FPS i DRAFT_CONFLICT, UI apply/save/reopen, null/undo, human pause,
 blokada nitki, przywrócenie fixture, binary job,4-chunkowy ZIP+SHA i odłączenie.
 Testowa kopia `f8965d84-1222-4c1c-b5d8-85bb9b1508bc@9` jest oddzielna
 od obu przekazanych kandydatów. Oryginalne karty/szkice nie były przeładowywane.
- `preview-readback.json`: oba filmy960×640,108 klatek,30fps,3.6s;3.375 nominalnej
 pętli atlasu. PNG mają1506 różnych pikseli. Obejrzano PNG i dekodowaną klatkę
 t3.3: wstęga jest czytelniejsza po odpłynięciu essence; podczas feed może być
 przez nią zasłonięta. Nie dostrajano artu ani parametrów essence.
- `preservation.json`: wszystkie11 wcześniejszych projektów,29rewizji,13jobs,
 193artifacts i1report bez zmian;195 wcześniejszych plików/configów oraz109
 plików runtime0.28.2 zachowało bajty. SQLite integrity PASS.

Źródło V17 `0bb65bb5-d27d-4197-8728-5f44561cc83a@2` zachowane. Lifetime to ten sam
feed3s + life0.6s. Sekwencja konsumenta: V17→STATIC→ANIMATED w stałej scenie,
kamerze i dystansie; dopiero po zaliczeniu widoczności/materiału osobny ruch celu.
Nie rozciągać feed/drain w celu wydłużenia nagrania. Brak helisy/Bezier, brak
obietnicy ciągłego panningu, synchronizacji lub szwów w NWN. Eksport i filmy
nie są testem gry. `nativeVerified:false`, `nativeCadenceVerified:false`.
