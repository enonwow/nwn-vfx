# Obracanie całego efektu z postacią — Studio 0.19.0

UI **Obracaj z postacią** zapisuje logiczne `document.orientWithObject` przez
wspólne `project.set`. Brak pola w historycznym dokumencie oznacza `false`.
Odczyt, otwarcie karty ani aktualizacja Studio nie dopisują pola. Jawny zapis
`true` lub `false` promuje nową rewizję do schematu 11; przenośny ZIP ma
manifest v6 i minimum Studio 0.19.0. Schematy 1–10 i ZIP v1–5 pozostają czytelne.
Cofnięcie pierwszego ustawienia przywraca brak pola, zachowując schemat 11.

To instrukcja integracji całego VFX. Kolumna `visualeffects.2da.OrientWithObject`
pozwala efektowi przyłączonemu do obiektu przyjąć jego orientację
([informacje o poprawkach BioWare, sekcja Custom content](https://nwn.wiki/spaces/NWN1/pages/38174729/1.69)).
Nie zmienia lokalnej `layer.orientation`, geometrii, animacji, tekstur, WAV,
wzmocnienia ani istniejących obrotów o 180°. Nie zmienia `ApplyEffectAtLocation`
w przyłączenie do postaci; sposób aplikacji wybiera konsument. Podgląd Studio
nie ma obracającej się postaci i nie potwierdza działania flagi w NWN.

## CLI z dowolnego repozytorium

Odczytaj projekt, aktualną rewizję i `schema get changes.apply`. Zapisz plik
`orientation.json` w UTF-8:

```json
[{"type":"project.set","values":{"orientWithObject":true}}]
```

```text
nwn-vfx --json changes preview --project ID --expected-revision N --input-file orientation.json
nwn-vfx --json changes apply --project ID --expected-revision N --input-file orientation.json --idempotency-key orientation-enable-001
nwn-vfx --json candidate build --project ID --revision NEXT --model-name MY_MODEL --idempotency-key orientation-export-001
```

`false` wyłącza opcję. `0`, `1`, tekst, `null` i dodatkowe pola są odrzucane.
Oczekiwana rewizja i stabilny klucz obowiązują jak w pozostałych edycjach.
`changes.revert` przyjmuje ID operacji; odmawia przy późniejszej zależnej zmianie.

## WebMCP i praca z człowiekiem

Po połączeniu karty odkryj rzeczywiste narzędzia hosta, wywołaj
`studio.connection.inspect({})`, następnie `studio.view.inspect({viewSessionId})`.
Kontekst zawiera osobno `savedDocument.orientWithObject` i
`draft.orientWithObject`; dla każdego brak oznacza false. Zachowaj szkic człowieka.

```javascript
await tools.call('studio.changes.preview', {
  viewSessionId,
  input: {projectId, expectedRevision: revision,
    changes: [{type: 'project.set', values: {orientWithObject: true}}]}
});
await tools.call('studio.changes.apply', {
  viewSessionId, idempotencyKey: 'orientation-enable-001',
  input: {projectId, expectedRevision: revision,
    changes: [{type: 'project.set', values: {orientWithObject: true}}]}
});
```

Blokada właściciela ma postać `{layerId:"@effect",field:"orientWithObject"}`
w istniejącym `locks.set`. `@effect` jest zarezerwowane i nie jest ID warstwy.
Zachowaj pozostałe blokady. UI oferuje kłódkę przy przełączniku; blokadę trzeba
zapisać. Agent nie może jej usunąć. `LOCKED`, `AI_PAUSED`, `REVISION_CONFLICT`,
`VIEW_CONFLICT` i `DRAFT_CONFLICT` zachowują swoje znaczenie. CLI, UI i adapter
deklarują `X-NWN-VFX-Document-Schema: 11`. Klienci 0.18 deklarują 10; odczyty
nowych dokumentów oraz nowe zapisy przez starszego klienta kończą się
`CLIENT_UPGRADE_REQUIRED`, bez mutacji. Discovery pozostaje dostępne.

## Artefakt integracji

Zakończony `candidate.build` publikuje `vfx-integration.json` osobno i wewnątrz
`candidate.zip`. Identyczna instrukcja jest w `validation.json → integration.effect`
i `handoff.json → metadata.validation.integration.effect`:

```json
{
  "schemaVersion": 1,
  "projectId": "PROJECT_ID",
  "revision": 2,
  "snapshotSha256": "SHA256_KANONICZNEGO_DOKUMENTU",
  "documentSha256": "SHA256_PLIKU_EFFECT_DOCUMENT_JSON",
  "model": {"resref": "MY_MODEL", "file": "MY_MODEL.mdl", "sha256": "SHA256_MODELU_TEGO_JOBA"},
  "orientWithObject": true,
  "visualeffects2da": {"rowId": null, "columns": {"OrientWithObject": 1}},
  "nativeVerified": false
}
```

Przykładowe symbole SHA i modelu zastąp rzeczywistymi wartościami z artefaktu.
`rowId:null` pozostawia wybór wiersza konsumentowi. Dla false lub braku pola
kolumna wynosi 0. Nie powstaje pełne zastępcze `visualeffects.2da`; instrukcja
nie trafia do HAK, a Studio nie instaluje niczego w module. Samodzielna funkcja
biblioteczna bez projektu zwraca `projectId:null,revision:null`; publiczne joby
serwisu zawsze wiążą instrukcję z rzeczywistym projektem i rewizją.

Przed pakowaniem sprawdź hash artefaktu, tożsamość rewizji/snapshotu oraz modelu.
ASCII MDL, TGA/TXI i WAV dla niezmienionych warstw są identyczne przy zmianie
wyłącznie flagi. Przypięty kompilator binarny może zapisać różne bajty po NUL
w 32-bajtowym polu nazwy zdarzenia animacji, nawet dla identycznego źródła.
Własny mieszany przykład porównuje cztery kompilacje, cały dekompilowany MDL,
wszystkie odczytane pola siatek, indeksy rysowania, kontrolery, próbki i normalne;
raport: `output/releases/0.19.0/binary-proof/report.json`. Kompilator i wynikowe
bajty pozostają nietknięte. Ten odczyt nie jest testem gry.

Jeśli konsument zachowuje wcześniej zaakceptowany binarny MDL, nowy hash
eksportu go nie opisuje. Należy porównać źródłowe ASCII, zachować oba hashe
i zapisać własny łańcuch pochodzenia: identyczne źródło → wcześniej zaakceptowany
binary → nowa kolumna w istniejącym wierszu. Nie przypisuj staremu MDL nowego
handoff ani nowego SHA. Test efektu przy obrocie postaci pozostaje zadaniem
kwalifikowanego konsumenta NWN.
