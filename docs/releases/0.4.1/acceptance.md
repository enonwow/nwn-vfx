# Studio 0.4.1 — jawna normalizacja PNG

Zlecenie **TLC-WYROK-STUDIO-04A**. Import własnych tekstur wymagał POT do 1024 px, podczas gdy rzeczywiste pliki konsumenta miały 1254×1254. Opcjonalna normalizacja jest teraz częścią wspólnego `assets.import`, dostępnego w UI, CLI i WebMCP. Nie zmienia sposobu działania importu bez opcji.

## Kontrakt

CLI: `nwn-vfx --json assets import --project <id> --expected-revision <n> --file <source.png> --target-size 512 --idempotency-key <key>`. Alternatywny rozmiar to 1024. WebMCP: `studio.assets.import` z opcjonalnym `input.targetSize:512|1024`. Liczba narzędzi pozostaje 38; schemat trzeba ponownie odkryć w karcie nowej wersji. UI ma domyślny wybór ścisłego importu i osobne wybory 512/1024.

Tryb ścisły: PNG RGBA8 bez przeplotu, POT 8–1024, do 2 MiB, bez zmiany bajtów. Jawna normalizacja: PNG RGB8 lub RGBA8 bez przeplotu, wymiary 1–4096, wejście do 8 MiB. RGB8 otrzymuje alpha255. Profile ICC/cHRM/niestandardowe gamma, APNG oraz tRNS nie są obsługiwane. Wynik jest PNG RGBA8, nadal do 2 MiB; limit projektu pozostaje 8 zasobów i 6 MiB zwartego dokumentu. Przekroczenie limitu wyniku daje jawny błąd z sugestią rozmiaru 512.

Obraz mieści się w kwadracie docelowym bez przycinania, z proporcjami zaokrąglonymi do najbliższego piksela i przezroczystym marginesem wyśrodkowanym całymi pikselami. Filtr zmniejszania to średnia obszarowa; powiększanie używa interpolacji dwuliniowej. RGB jest przeliczany na liniowe sRGB, mnożony przez alpha, filtrowany razem z alpha i zapisany ponownie jako sRGB z prostą alpha. Przezroczyste kolory wejścia nie zanieczyszczają miękkich krawędzi. Nowy PNG przechodzi ponownie ścisły dekoder i walidację zasobu.

`asset.id` i `source.sha256` identyfikują rzeczywiście zapisane bajty wynikowego PNG. `source.normalization` zachowuje hash oryginału, jego wymiary i typ koloru, docelowy rozmiar, rozmiar treści, przesunięcia, wersję algorytmu oraz metodę/kolor/alpha. Oryginalne pliki nie są nadpisywane; ich bajty pozostają u wywołującego. Hash oryginału jest zapisem pochodzenia, który można niezależnie zweryfikować na pliku źródłowym. Z samego przeskalowanego PNG nie da się odtworzyć oryginału. Powtórny identyczny wynik zachowuje pierwszy istniejący zasób i jego metadane.

Import korzysta z dotychczasowych praw, CAS, idempotencji, historii i pauzy AI. Nowe metadane są zachowane przez stare rewizje, restart, selective undo, portable ZIP, handoff i eksport. ZIP zawiera wynikowy PNG oraz metadane; TGA/TXI/MDL/HAK używają jego rzeczywistych pikseli. Nie wprowadzono operacji zależnej od TLC ani nazwy efektu.

## Dowody

Testy analityczne rozróżniają średnią liniową (~188 dla czerni/bieli) od niepoprawnego mieszania bajtów sRGB (128), sprawdzają ważenie części piksela, kolor ukryty pod alpha0, alpha255 dla RGB, proporcje i przezroczyste marginesy. Testy serwisowe sprawdzają odrzucenie strict bez nowej rewizji, odtworzenie odpowiedzi, konflikt klucza i rewizji, uprawnienia, pauzę, zachowanie pierwszego pochodzenia oraz cofnięcie importu z zachowaniem późniejszej zmiany. Testy eksportu odczytują faktyczne PNG/TGA/TXI/MDL/HAK i ponownie importują ZIP z metadanymi.

Test UI obejmuje import 30×18 do 512×512 (treść 512×307, przesunięcie Y=102) i 1024×1024 (1024×614, Y=205), widoczne pełne hashe, odrzucenie strict oraz rzeczywisty obraz w rendererze. Zachowano testy późniejszych edycji podczas oczekiwania na import i niewprowadzonego JSON geometrii. [Raport UI](C:/Projects/nwn-vfx/output/textures-acceptance/report.json), [widok](C:/Projects/nwn-vfx/output/textures-acceptance/editor-normalization.png).

Oba oryginały konsumenta są RGBA8 1254×1254:

| Obraz | SHA-256 oryginału | PNG 512 | PNG 1024 |
| --- | --- | --- | --- |
| Fala | `46c56fa9437ad4742356431ff4589bdca4afb6f300c0efa8d14626435e0aa0cf` | `dd3683259b86ee6909650dc1d7cea093dee29aededfb604296534bddf2060956` | `a3390066dbe1c947a9be8587817e4d9f45b3357f9e793416c4d9be9181f2b577` |
| Pył | `60fd99940925b9d55366f57152ff3769ca1a5405431c5e04618833e5fa66135e` | `a3d19d8597ae356b73409e1d2f6dfcff4940f7b70ebe0c29d7b7c46536e0355c` | `f595d6fab1a4cd0e0e29643605563c8a0b0a0505077f1745b6d56d3e5fa01c98` |

Skrypt [accept-normalization.ts](C:/Projects/nwn-vfx/scripts/accept-normalization.ts) używa CLI z katalogu konsumenta i normalizuje wyłącznie przez zarejestrowany import Studio. Oba rozmiary przechodzą przypisanie do emitera/animowanej geometrii, podgląd PNG, build oraz odbiór ZIP. Niezależny FFmpeg dekoduje wynikowe PNG i TGA do raw RGBA i wymaga identycznych hashy. Wszystkie handoffy jednego projektu muszą wskazywać ten sam snapshot. Oryginały są ponownie hashowane na końcu.

## Granice

`nativeVerified:false`. Normalizacja i odczyt plików nie są testem efektu w grze ani zatwierdzeniem artystycznym. Nie zmieniano `tlc-wyrok` ani niezapisanego szkicu „Fiolka alchemiczna”. Pierwsza kwalifikacja CLI używała izolowanej usługi i osobnych projektów.

Trzy rzeczywiste tekstury w rozmiarze 1024 razem przekraczają limit 6 MiB dokumentu przez narzut base64. Fala i pył 1024 wraz z metalem 512 mieszczą się w limicie. To jawne ograniczenie istniejącego dokumentu, bez automatycznego obniżania jakości lub usuwania zasobów.

## Zainstalowana wersja i końcowy odbiór

W nocy 5/6 września 2026 zainstalowano globalną paczkę [nwn-vfx-studio-0.4.1.tgz](C:/Projects/nwn-vfx/output/releases/nwn-vfx-studio-0.4.1.tgz), SHA-256 `d78bd6dc72b66953beb4f86fb1d25cbddcf302d8e9db1deb3df8394444b1d2c5`. Rozmiar 913913 B. Instalacja nie jest dowiązaniem do repo. `doctor` uruchomiony z katalogu TLC potwierdził klienta 0.4.1, gotowy renderer i endpoint 127.0.0.1:4317. Zachowano instancję `12d0fa8e-4887-4f00-ad74-9bb15b05c057` oraz workspace `7def76b2-ad42-4b55-a5e8-d919b79a8587`.

Przed restartem sprawdzono brak aktywnych jobów każdego projektu. Wszystkie **8 istniejących projektów** było identycznych przed i po instalacji: [przed](C:/Projects/nwn-vfx/output/normalization-live-projects-before.json), [po](C:/Projects/nwn-vfx/output/normalization-live-projects-after.json). Oryginalna karta Fiolki nadal prezentowała „Niezapisane zmiany” po zakończeniu WebMCP; nie była odświeżana ani zapisywana. Wszystkie dalsze testy tworzyły własne osobne projekty.

Końcowy build przeszedł, **119/119** testów unit/integration oraz **8/8** przeglądarkowych są zielone: [build](C:/Projects/nwn-vfx/output/normalization-build.log), [unit/integration](C:/Projects/nwn-vfx/output/normalization-unit.log), [7 regresji przeglądarkowych](C:/Projects/nwn-vfx/output/normalization-browser-regression.log) i [test tekstur/normalizacji](C:/Projects/nwn-vfx/output/textures-acceptance/report.json). Test CLI obejmuje 11 scenariuszy, w tym odrzucenie 2/8 MiB przed odczytem/siecią. [Manifest 85 źródeł](C:/Projects/nwn-vfx/docs/releases/0.4.1/source-manifest.json). Źródłowy, globalnie zainstalowany i spakowany skill mają ten sam SHA-256 `b9f26b4eebb3f9d65f42059bf0f3e3c71bcc3948c21410e464741a6ead933373`; walidacja skilla przeszła.

### Rzeczywiste obrazy przez zainstalowany CLI

[Raport](C:/Projects/nwn-vfx/output/normalization-installed/run-142f5X/report.json) obejmuje oba rzeczywiste PNG RGBA i rozmiary 512/1024. Projekty kontrolne: 512 — `509484cb-7cec-4552-9dbb-c700f92a5dfd`, snapshot `36a620fef0d27d1a5c0ca3ec721319e9d064750747c834b8af04b28913b5d66e`; 1024 — `56209ff5-c2d3-4b49-ad73-51355493a8fc`, snapshot `41d3a9b847b432d262b52eacbed386074a8d59670c4afe8c1533ec99e3099087`. W każdym podgląd, handoff i build wskazują ten sam dokument i metadane źródła. ZIP zawiera sprawdzone hashem PNG. FFmpeg niezależnie potwierdził identyczne raw RGBA PNG oraz TGA dla wszystkich czterech wyników. Obejrzano znormalizowaną falę oraz podgląd kompozycji testowej. [Podgląd 1024](C:/Projects/nwn-vfx/output/normalization-installed/run-142f5X/1024/preview.png).

Dodatkowy RGB metal 1254×1254, 3265620 B, przeszedł zainstalowany CLI w obu rozmiarach. Oryginał `1ca200d733786108d2ce2c4af0fd7f230d7ab190f05bbd7ca4daa96a8803adec` pozostał niezmieniony. Wynik 512: 458531 B, `10547e1419e9dcf4587b97a98ecbafd98402675afc65592b09d16e02d02e2e28`; wynik 1024: 2068001 B, `85b78369c81c67bebbcc2ad8ea6addd4046af57f7bfa3f76c12c3232dbc70e8c`. Niezależny dekoder FFmpeg potwierdził alpha255 każdego piksela obu obrazów. Strict odrzucił duży RGB z `LIMIT_EXCEEDED`. [Raport metalu](C:/Projects/nwn-vfx/output/normalization-metal-installed/report.json).

### Rzeczywisty WebMCP w Codex IAB

Własna czysta karta odświeżona do 0.4.1 opublikowała 38 narzędzi z opcjonalnym targetSize i warunkowym limitem wejścia. Ograniczony agent `ae679e4a-5545-4e13-b16c-03266d6c30eb`, viewSession `1288f95e-76a9-40b5-8d6a-9252eefb1a4c`, utworzył projekt `34bb4904-6a54-44f0-9b3b-7208cd02f404`. Import RGB16×8 bez opcji został odrzucony jako `INVALID_TEXTURE`; z targetSize512 utworzył rewizję 2. RGBA30×18 z targetSize1024 utworzył rewizję 3. Odczyt `studio.assets.get` zwrócił pełne bajty obu PNG, zweryfikowane hashem, oraz oryginalne hashe i parametry transformacji.

`studio.projects.export` i `studio.artifacts.read` przekazały cały ZIP 4256 B, SHA-256 `736842a4e204a4b719e24b12f5b6f7a05e5e788902b210b403ad00d5fe99a26f`; artefakt `18f5ec2c-aa25-4a4d-8588-bb6dcbaf27ac`. Grant został odłączony i `studio.connection.inspect` zwrócił `WEBMCP_NOT_CONNECTED`. [Raport WebMCP](C:/Projects/nwn-vfx/output/normalization-live-webmcp/report.json), [ZIP](C:/Projects/nwn-vfx/output/normalization-live-webmcp/studio-project.zip). Nie jest to transport zastąpiony DOM ani samym HTTP; test używał odkrytych narzędzi hosta karty.

Po zakończeniu wysłano do zadania `01a070e3-5df3-7913-943f-854ac8ea98ee` wersję instalacji, polecenia, hashe rzeczywistych obrazów, raporty oraz ograniczenie łącznego rozmiaru dokumentu. Konsument otrzymał kierunek dalszej kompozycji: fala i pył 1024 wraz z metalem 512. Końcowa kontrola potwierdziła 85/85 hashy źródeł i zgodny hash paczki.
