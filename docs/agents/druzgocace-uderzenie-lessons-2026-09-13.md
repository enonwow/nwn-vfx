# Druzgoczące uderzenie — trwałe wnioski Studio po V10

## Bieżący stan do przekazania

- **Wynik użytkownika:** widoczność impaktu V10 potwierdzona 2026-09-13; odpowiedź „no brawo w koncu” po nagraniu `Neverwinter Nights 2026.09.13 - 22.35.14.03.mp4`.
- **Zachowany kandydat:** Studio 0.36.2, jeden FnF `tlc_smf0360`; kontakt `tlc-smash-contact-size10-0362@2`, snapshot `e4d1ebe2ec57bf474ae7081c6c252f0ed0021662b0a8f15339da2971b3e2c82e`.
- **Najważniejszy wcześniejszy wynik:** już V5 pokazała działające, ale zbyt małe cząstki. Ten wynik zgubiono przy dalszych rewizjach. V9 naprawiła rzeczywisty błąd odrzucania alfa, lecz użytkownik nadal nie widział impaktu. V10 zachowała poprawkę i powiększyła wyłącznie drops/spray obu stron ×10.
- **Następny krok:** zachować V10. Brak zlecenia kolejnego eksportu, strojenia lub wersji aplikacji.
- **Zakres potwierdzenia:** pozytywny wynik użytkownika z gry przekazany przez koordynatora TLC. Studio nie wykonało nowego uruchomienia NWN, analizy klatek ani formalnej kwalifikacji natywnej. Nie rozszerzać wyniku na niezależną akceptację każdego elementu wyglądu i audio.

## Zasady dla kolejnego VFX

1. **Przenosić rozstrzygnięcia, nie tylko numery paczek.** Każdy handoff i aktywny stan powinny zawierać zachowany wzorzec, ostatnią opinię użytkownika, wcześniejszą próbę rozstrzygającą, odrzucone hipotezy i następny krok. Historia techniczna nie zastępuje tego krótkiego zapisu.
2. **Oceniać rozmiar w skali postaci.** Podawać kamerę, FOV, rozdzielczość i obiekt odniesienia. Miękka maska tekstury może zajmować tylko małą część quada. Wcześniejsze około 2–4 px dla drops/spray było projekcją kamery Studio, a nie pomiarem pikseli NWN.
3. **Oddzielać emisję od czytelności.** V5 pokazała mały pomarańczowy punkt oryginału, poprawę po ×10 oraz twarde kwadraty po zmianie tekstury na białą. Nie pomijać tych danych na rzecz kolejnych spekulacji. Dowód dla wcześniejszego emitera nie kwalifikuje automatycznie późniejszego animmesh.
4. **Zmieniać wskazaną kategorię.** V6 jednocześnie zmieniła tekstury, rozmiary, ruch i inne parametry; wynik został odrzucony. W V10 zachowano miecz, smugę, audio, celowanie i wszystkie właściwości kontaktu poza rozmiarami czterech warstw. Nie uznawać wcześniej niewidocznego kontaktu za zaakceptowany wygląd tylko dlatego, że był częścią projektu.
5. **Weryfikować zgłoszony objaw.** Udany eksport, kompilacja, hashe, instalacja i test shadera mają osobne statusy od widoczności i akceptacji wyglądu. V9 była poprawną naprawą techniczną, ale niewystarczającą naprawą zgłoszonego problemu.
6. **Korzystać z istniejącego publicznego authoringu.** V10 powstała przez fork, changes.preview/apply, spells.build i spells.preview w istniejącym Studio 0.36.2. Nie wymagała nowej funkcji. Zachować oryginalne projekty i artefakty oraz podział pracy: Studio tworzy i eksportuje; konsument integruje i testuje grę.

## Zachowane parametry i poprawki

| Warstwy | Start / mid / end, metry |
|---|---|
| drops, drops-back | 0.35 / 0.23625 / 0.1225 |
| spray, spray-back | 0.55 / 0.37125 / 0.1925 |

To parametry tego efektu, a nie reguła powiększania wszystkich VFX ×10. Soft/soft-back pozostały bez zmian. Dokładny diff to osiem zastąpień size/endSize oraz cztery jawne midSize, wcześniej wyliczane domyślnie. Liczba cząstek, tekstury, barwy, alfa, trajektorie i czasy życia są zachowane.

Przy utrzymaniu istniejącego toru eksportu zachować:

- Prawidłową inicjalizację i wyjście shadera miecza: `FragmentColor`, `SetupStandardShaderInputs()`, `ApplyStandardShader()` i zapis `gl_FragColor`.
- Odtwarzanie fazy z `materialFrontEmissive.r` przez `RevertColorSpace(...)` po natywnej konwersji koloru. Przekształcony kanał koloru nie jest bezpośrednio czasem.
- W tym torze scatter: bramki czasu życia i `if(FragmentColor.a<=0.0)discard;`. W badanym wcześniejszym torze cutoff 0.2 odrzucał soft z maksymalną alfą 0.18. Nie przenosić tej poprawki automatycznie na wszystkie materiały.

Integracja konsumenta zachowuje wybraną lokalizację celu i poprawne jednostki kątów NWScript. Studio nie przejmuje natywnej instalacji ani testu. W V10 MOD i skrypty pozostały bez zmian.

## Dowody i tożsamość zachowanego wyniku

- [Wnioski koordynatora TLC](<C:/Projects/the last city/docs/vfx/druzgocace-uderzenie-lessons-2026-09-13.md>).
- [Wynik użytkownika V10](<C:/Projects/the last city/assets/vfx/rycerz/druzgocace-uderzenie/demo/v10-scatter-size/user-result.json>) i [instalacja](<C:/Projects/the last city/assets/vfx/rycerz/druzgocace-uderzenie/demo/v10-scatter-size/installed.json>).
- [Raport publicznego eksportu](../../output/contact-size10-0362/DELIVERY.md), [dokładny diff](../../output/contact-size10-0362/size-diff.json), [zachowanie pozostałych danych](../../output/contact-size10-0362/preservation/receipt.json). Raport eksportu opisuje stan sprzed wyniku użytkownika; niniejszy dokument zapisuje późniejsze potwierdzenie bez nadpisywania historycznych artefaktów.
- Zainstalowany przez konsumenta `demo_cp_smash.hak`: 20 460 456 B, SHA-256 `cfc775de6f1ef7b421cf5c814d10191700f152217676ad90cf4d70447e5ce8bd`, demo `DEMO-Czempion-Druzgocace.mod`.
- Nagranie wskazane w wyniku użytkownika: SHA-256 `bd217889301bd3e4bc249e8fdbc95cd87224f831273dbfa66682546228e7e2f6`. To tożsamość odczytana z raportu konsumenta, nie nowa analiza nagrania w tym zadaniu.
