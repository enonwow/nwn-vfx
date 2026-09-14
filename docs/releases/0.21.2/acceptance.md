# Studio 0.21.2 — odbiór poprawki podglądu cząstek

Wdrożono 2026-09-08 po uzgodnieniu okna z zadaniem konsumenta
`01a070e3-5df3-7913-943f-854ac8ea98ee`. Zakres: przeglądarka, PNG i WebM.
Nie wykonywano integracji ani testów w NWN/Toolsecie.

## Zachowanie

- Instancjonowane billboardy z dwóch trójkątów mają metryczną szerokość oraz
  poprawną projekcję przy różnych FOV. Usunięto limit aplikacji 300 px i zależność
  od sprzętowego limitu punktów. Widoczna część cząstki pozostaje w kadrze, gdy
  jej środek wychodzi poza ekran; obowiązuje zwykły clipping 0.05–100 m.
- Life i speed odpowiadają dokumentowi. Usunięto ukryte mnożniki 0.85–1.15
  oraz 0.6–1.4. Narodziny Fountain i kierunki zachowują poprzedni strumień ziarna.
- Wiek od narodzin steruje alpha/kolorem/rozmiarem i atlasem. Cząstka istnieje
  w przedziale `[0,life)` i znika dokładnie na końcu życia. Skala warstwy oraz
  instancji kompozycji stosowane są po jednym razie.
- Eksportery ASCII/binary pozostają 0.21.1; dokumenty, schematy 1–12, historia,
  operacje, uprawnienia i 49 narzędzi WebMCP pozostają bez migracji.

Pełna semantyka, przykłady i ograniczenia: [particle-preview.md](../../agents/particle-preview.md).

## Weryfikacja

`npm run build` oraz 263/263 testy domenowe przeszły. Przeszło również pięć
testów przeglądarkowych: preview-metrics, particles, textures, flipbook i
composition. Wykorzystują produkcyjny frontend i prawdziwy renderer Chromium.

Nowy test niezależnie porównuje bitmapę cząstki z ręcznie utworzoną geometrią
kwadratu w przestrzeni świata i rachunkiem projekcji: FOV10/30/39/60/90/120,
głębokość 2/8/20 m, DPR1/2 — 36 kombinacji. Dalsze przypadki obejmują 723px
billboard, środek poza kadrem, near/far/behind clipping, cztery ziarna dla
life/alpha/prędkości, powtarzalność, skalę instancji i 2000 cząstek w warstwie.
Tolerancja obwiedni względem rachunku wynosi 2 piksele rasteryzacji.
Pozostałe testy sprawdzają maski, kolory, miękką alpha, orientację UV,
klatki atlasu oraz zgodność edytora/PNG/WebM. Brak błędów konsoli WebGL.

Dowody w `C:/Projects/nwn-vfx/output/`:

- `preview-metrics-build.log`, `preview-metrics-unit.log`,
  `preview-metrics-test.log`, `preview-metrics-regressions.log`.
- `playwright/preview-metrics/acceptance.json` i kontrolne PNG.
- `playwright/flipbook-acceptance/acceptance.json`,
  `playwright/composition/acceptance.json`.

## Instalacja i niezmienność

Doctor wykonany z `C:/Projects/the last city` potwierdził wersję 0.21.2 i gotowy
renderer. Endpoint `http://127.0.0.1:4317`, instanceId
`12d0fa8e-4887-4f00-ad74-9bb15b05c057`, workspaceId
`7def76b2-ad42-4b55-a5e8-d919b79a8587` są niezmienione.

Przed restartem kolejka była pusta. Wszystkie 71 zastanych projektów zachowały
dokładne rewizje i SHA-256 kanonicznych dokumentów; dowody z kompletnymi ID/SHA:
`output/releases/0.21.2/before-install.json` oraz `installed-preservation.json`.
Nie przeładowywano istniejących kart. W inwentarzu dostępnego hosta przed
odbiorem WebMCP nie było kart; odbiór przeprowadzono w nowej ukrytej karcie.

Własny projekt kontrolny `studio-metric-preview-0212`, r3, snapshot
`4d63227b83098421b2118c89e4e02239d849c8ceb6910b4ed5b7ec61b513d959`,
powstał wyłącznie przez publiczne operacje na 0.21.1. Zachował cały dokument
i historię po renderach/eksporcie na 0.21.2. Porównanie potwierdziło identyczność
wszystkich czterech zasobów kontrolnych MDL/TGA/TXI/HAK. Wszystkie 19 plików
źródłowych eksportera mają SHA z manifestu wydania 0.21.1.

Kontrolny `metric_probe.mdl`: SHA-256
`6b69b4bed8dff1316822c5cfa334a2113da7e00be3ad8dc539592f0534c77d7b`.
Komplet SHA i rozmiarów: `output/releases/0.21.2/after-acceptance.json`.

## PNG tego samego snapshotu i WebMCP

Kamera `[0,-8,0.7] → [0,0,0.7]`, FOV39, czas 0.25 s, rozdzielczość 960×640.

| Wynik | SHA-256 PNG |
|---|---|
| Baseline 0.21.1 | `81ec6aa542717a1c973474965e3ba3559f3e0ef10fdf321a8c6a0e6db8cfae59` |
| Renderer 0.21.2 | `ce5d6e0fd117f98e82e079b544358ad9defd08611dda89d2292668233fc13312` |
| Rzeczywisty WebMCP 0.21.2 | `ce5d6e0fd117f98e82e079b544358ad9defd08611dda89d2292668233fc13312` |
| Zainstalowane CLI z katalogu konsumenta | `ce5d6e0fd117f98e82e079b544358ad9defd08611dda89d2292668233fc13312` |

Pliki: `output/releases/0.21.2/before/preview.png`, `after/preview.png`,
`webmcp/preview.png`, `cli-from-consumer.png`. Każdy nowy PNG ma 10498 bajtów.

WebMCP odkrył narzędzia rzeczywistej karty i zgłosił 0.21.2. Job
`40936d87-94d0-40e1-8fec-3371900420de` zakończył się `succeeded`, PNG artifactId
`f674371c-d469-4668-b1b0-742bd1b08135`. Odbiór PNG: trzy części po maksymalnie
4096 bajtów; dodatkowo odebrano handoff.json, sprawdzając skróty części i całości.
Render zachował niezapisany szkic, a ponowienie z tym samym kluczem zwróciło
ten sam job. Stary viewRevision dał `VIEW_CONFLICT`. Testowy szkic usunięto,
dokument pozostał na r3, dostęp cofnięto i sprawdzono `WEBMCP_NOT_CONNECTED`.
Dowód: `output/releases/0.21.2/real-host-webmcp.json`.

Z katalogu konsumenta rzeczywiście wykonano:

```text
nwn-vfx --json preview request --project studio-metric-preview-0212 --revision 3 --time 0.25 --format png --camera-file C:/Projects/nwn-vfx/output/releases/0.21.2/camera.json --idempotency-key metric-0212-consumer-png
nwn-vfx --json jobs wait 6ba5b695-d217-4c0b-8d03-066099412532 --timeout 30s
nwn-vfx --json artifacts get ed084446-203d-4d5c-994a-478b30ab58dd --out C:/Projects/nwn-vfx/output/releases/0.21.2/cli-from-consumer.png
```

## Paczka i granice odbioru

`output/releases/nwn-vfx-studio-0.21.2.tgz`: 2432781 bajtów, SHA-256
`a8aa07f8510e4a58db3639080ddc253eb0813c49fd300752b9ecd422e5c0e629`.
[Manifest źródeł](source-manifest.json) obejmuje 253 pliki i paczkę.

Nowy renderer może pokazać większe cząstki niż stary przy tym samym źródle.
Nie zastosowano mnożnika FOV do eksportu ani automatycznej korekty projektów.
Nie dowiedziono zgodności optycznej z NWN, pełnego zasłonięcia postaci, fizyki,
sortowania ani filtrowania tekstur. Te kwestie nadal należą do testów konsumenta.
Duże przezroczyste billboardy mogą zwiększyć obciążenie GPU. Stare karty zachowują
wcześniej załadowany renderer: nowy podgląd wymaga nowej karty, z zachowaniem
niezapisanej pracy w poprzedniej.
