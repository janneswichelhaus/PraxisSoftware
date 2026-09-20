# Arbeitsauftrag: Untersuchungsbausteine und Scores

**Projekt:** Praxissoftware · **Version:** 1.2 · **Stand:** 21.09.2026
**Adressat:** Claude Code
**Status der Software:** Testsystem — Machbarkeitsprüfung, keine echten Patientendaten.

---

## 0. Was gebaut werden soll

Zwei Inhaltsarten, die dasselbe Muster teilen:

1. **Untersuchungsbausteine** — die Tests und Techniken der Manuellen Therapie, nach Region gegliedert. Im Befund abhakbar, erzeugen daraus Dokumentationstext.
2. **Scores (PROMs)** — 18 standardisierte Fragebögen, digital ausfüllbar durch Therapeut oder Patient, auswertbar, druckbar.

Beides wird **als Daten** abgelegt, nicht als Code und nicht als PDF. Der Code kennt keinen einzigen Test und keinen einzigen Score namentlich — er kennt nur das Schema.

---

## 1. Grundprinzip

```
Definition (JSON)  ──►  Renderer  ──►  Befund-Ansicht (Therapeut)
                                   ──►  Patienten-Ansicht (Link)
                                   ──►  Druck-PDF
                                   ──►  Dokumentationstext / Verlauf
```

Konsequenzen, die einzuhalten sind:

- Ein neuer Test oder Score ist **eine neue Datei**, kein neuer Code.
- Jede Definition hat eine **Version**. Jedes gespeicherte Ergebnis speichert die verwendete `definition_version` mit. Ohne das brechen Verläufe, sobald ein Item korrigiert wird.
- **IDs sind stabil und werden nie geändert** (snake_case, sprechend: `knie_lachmann_test`). Umbenennen eines Labels ändert die ID nicht.
- **Itemtexte und Testbezeichnungen sind unveränderlich.** Layout, Logo und Farben gehören der Marke, der Wortlaut dem Instrument: eine geänderte Formulierung macht Normwerte, MCID und Verlaufsvergleiche unbrauchbar.

---

## 2. Datenmodell A — Untersuchungsbausteine

### Struktur

```
region  →  block  →  item  →  (optional) subitem
```

- **region**: HWS, LWS, Schulter, Ellenbogen, Hand, Hüfte, Knie, Fuß, Kiefer
- **block**: Basisuntersuchung · Weiterführende Untersuchung · Spezialblöcke (z. B. „Untersuchung Hochzervikal", „Untersuchung SIG", „Untersuchung Daumensattelgelenk") · Therapie / Behandlungstechniken
- **item**: ein Test oder eine Technik
- **subitem**: die Unterpunkte a/b/c der Vorlage (z. B. Cozen-, Maudsley-, Mill's-Test unter „LET")

### Felder je item

| Feld | Zweck |
|---|---|
| `id` | stabil, eindeutig, snake_case |
| `label` | wörtlich aus der Quelldatei |
| `type` | `test` oder `technik` |
| `bilateral` | true, wenn seitengetrennt zu dokumentieren |
| `result_type` | `befund` (Tests) oder `durchgefuehrt` (Techniken) |
| `value_field` | optional: `{label, unit, input}` — z. B. Knee-to-Wall in cm, Navicular Drop in cm, Bewegungsausmaß in Grad |
| `note` | Freitext, immer verfügbar |
| `hint` | Durchführungshinweis aus der Vorlage (z. B. „30–60 Sekunden halten") |

### Ergebniswerte

Ein Test hat genau einen Zustand:

`nicht_durchgefuehrt` (Standard) · `ohne_befund` · `positiv` · `negativ` · `nicht_beurteilbar`

Techniken (Therapieblöcke) nur: `nicht_durchgefuehrt` · `durchgefuehrt`.

Zusätzlich je Item optional: Seite (links/rechts/beidseits), Messwert, Freitext.

### Dokumentationstext

Der Generator erzeugt pro Block einen Absatz. Regeln:

- Items mit `nicht_durchgefuehrt` erscheinen **nicht** im Text.
- Reihenfolge = Reihenfolge der Definition, nicht Klickreihenfolge.
- Format je Item: `<Label><, Seite><: Ergebnis><, Messwert><. Freitext>`
- Beispiel: `Lachmann-Test, rechts: positiv. Weicher Anschlag.`
- Ein Block ohne dokumentierte Items erzeugt keine Überschrift.
- Der erzeugte Text ist **editierbar** — er ist ein Vorschlag, kein Endprodukt. Die Bearbeitung wird gespeichert, nicht beim nächsten Klick überschrieben.

### Inhaltliche Quelle

`mt-untersuchung-quelldaten.md` (liegt daneben). **Maßgeblich, wörtlich, vollständig.**

- Keine Tests ergänzen, die dort nicht stehen — auch wenn sie klinisch naheliegen.
- Tippfehler der Vorlage („Relocation Tet", „Supinatin", „Lachmann") **bleiben stehen**. Korrektur nur nach Freigabe durch Jannes.
- Vier Stellen sind in der Vorlage **unvollständig**. Sie werden als leerer Block mit `"status": "unvollstaendig"` angelegt und in der Oberfläche sichtbar als offen markiert — **nicht** aus eigenem Wissen gefüllt:
  - Schulter → „Untersuchung ACG" (keine Inhalte)
  - LWS → „Untersuchung SIG" (als Tabelle gesetzt, 6 Einträge, im Textextrakt nicht als Liste erkennbar)
  - LWS → „Behandlung" (letzter Aufzählungspunkt leer)
  - HWS → „Therapie Hochzervikal" (bricht nach „1. Myofaszial" ab)

### Abnahmekriterium: Anzahl Einträge je Block

Der Import gilt als korrekt, wenn die Zahl der Items pro Block exakt diesen Werten entspricht:

| Region | Basis | Weiterführend | Spezialblock | Therapie |
|---|---|---|---|---|
| HWS | 6 | 7 | 8 (Hochzervikal) | 8 + 1 (unvollständig) |
| LWS | 1 | 5 | 4 (Neuro) / SIG unvollständig | 4 |
| Schulter | 3 | 4 (Gruppen) | ACG unvollständig | 6 |
| Ellenbogen | 3 | 3 (Gruppen) | — | 5 |
| Hand | 3 | 11 | 2 (Daumensattelgelenk) | 5 |
| Hüfte | 6 | in Untersuchung integriert | — | 3 |
| Knie | 7 | 13 | — | 3 + 2 (Patella) |
| Fuß | 8 | 10 | — | 4 |
| Kiefer | 11 | — | — | — |

Gruppen bei Schulter und Ellenbogen zählen als ein Item mit Subitems (z. B. „Impingement" mit 5 Subitems).

---

## 3. Datenmodell B — Scores

### Aufbau je Score

```json
{
  "meta":   { "id", "version", "name_de", "name_en", "region", "konstrukt",
              "ausgefuellt_von", "quelle" },
  "items":  [ { "id", "text", "typ", "optionen": [{"label","wert"}], "skip_logic" } ],
  "scoring":{ "subskalen", "formel", "wertebereich", "richtung", "missing_value_regel" },
  "interpretation": { "cutoffs", "mcid", "mdc" }
}
```

### Regeln

- `richtung` ist Pflichtfeld: `hoch_ist_besser` oder `hoch_ist_schlechter`. **KOOS und HOOS vergeben ihre Punkte gegenläufig** (KOOS 0 = gering, HOOS 4 = gering). Dafür gehört ein expliziter Testfall in die Suite.
- Nicht ausgewertete Items werden als solche markiert, nicht weggelassen — der FABQ zeigt dem Patienten 16 Items, wertet aber nur 11 (Items 1, 8, 13, 14, 16 fallen raus).
- Fehlt im Quell-PDF eine Regel (z. B. Umgang mit unbeantworteten Items), wird sie **nicht erfunden**, sondern als `"missing_value_regel": "TODO_ENTSCHEIDUNG"` markiert.
- Fehlende MCID-Werte bleiben leer. Nicht aus dem Gedächtnis ergänzen.

### Inhaltliche Quelle

Die 18 Original-PDFs in `Downloads\Digotor_Scores\` sowie `Score-Inventar_Praxissoftware_v1.xlsx` im selben Ordner. Das Blatt **Scoring** enthält für jeden Score Items, Antwortformat, Wertebereich, Richtung, Subskalen, Rechenregel, Missing-Value-Regel und MCID/MDC — in der Form, die in `scoring` gehört.

**Die Itemtexte selbst stehen nur in den PDFs.** Sie werden von dort übernommen, nicht aus dem Modellwissen rekonstruiert. Das ist der Punkt, an dem ein Sprachmodell zuverlässig danebenliegt: Item-Reihenfolgen und Formulierungen wirken plausibel und sind falsch.

### Abnahmekriterium: Itemzahlen

| Score | Items | Score | Items |
|---|---|---|---|
| ODI | 10 Sektionen à 6 | KOOS | 42 (9/7/17/5/4) |
| RMDQ | 24 | HOOS | 39 (laut PDF; Original 40 — prüfen) |
| NDI | 10 Sektionen à 6 | FAAM-G | 29 (21 ADL + 8 Sport) |
| SPADI | 13 (5 + 8) | VISA-A | 8 |
| PRWE-G | 15 (5 + 10) | VISA-P-G | 8 |
| LEFS | 20 | Tegner | 1 |
| FABQ | 16 (11 gewertet) | PHQ-4 | 4 |
| STarT Back | 9 | TSK-GV | 11 |
| PCS | 13 | Anamnesebogen V8 | 39 Fragen |

Zusätzlich je Score mindestens ein Referenzfall: bekannte Antwortkombination → erwarteter Score. Grün heißt erst grün, wenn der stimmt.

---

## 4. Anforderungen an den Prototyp

- Region wählen → Blöcke aufklappen → Items abhaken.
- Ein Klick setzt `ohne_befund`, weitere Klicks (oder ein kleines Auswahlfeld) `positiv` / `negativ` / `nicht_beurteilbar`. Der häufigste Fall muss der schnellste sein.
- Seitenauswahl nur bei `bilateral: true`.
- Messwert- und Freitextfeld erst sichtbar, wenn das Item aktiv ist.
- **Live-Vorschau des Dokumentationstexts** neben der Liste, mit Kopier-Button.
- Bedienbar mit einer Hand auf dem Tablet, tastaturnavigierbar, kein Modal-Dialog im Untersuchungsfluss.
- Zustand bleibt beim Wechsel zwischen Regionen erhalten.

---

## 5. Ausdrücklich nicht tun

1. Testbezeichnungen oder Item-Texte umformulieren, ergänzen oder stillschweigend korrigieren.
2. Scores, Item-Reihenfolgen oder Antwortoptionen aus dem Modellwissen rekonstruieren, statt sie aus den PDFs zu lesen.
3. Fehlende Werte (MCID, Missing-Value-Regeln, ACG-Block) mit plausiblen Annahmen füllen.
4. Scoring-Logik hart in Komponenten schreiben, statt sie aus der Definition zu lesen.

---

## 6. Reihenfolge

1. JSON-Schema für beide Datenmodelle, plus Validator.
2. Untersuchungsbausteine: 9 Regionen aus der Quelldatei, Abnahmekriterium prüfen.
3. Renderer + Dokumentationstext-Generator + Prototyp.
4. Scores: mit VISA-A (8 Items, keine Subskalen) und KOOS (5 Subskalen, prozentuale Transformation, Missing-Value-Regeln) beginnen — zusammen reizen sie das Schema vollständig aus. Der Rest ist danach Fließbandarbeit.
5. Referenzfälle und Testsuite.

---

## 7. Quellen

| Datei | Ort |
|---|---|
| `mt-untersuchung-quelldaten.md` | dieser Ordner |
| 9 PDF-Lernübersichten | `Documents\Fortbildungen\MT\Prüfungsvorbereitung\` |
| 18 Score-PDFs | `Downloads\Digotor_Scores\` |
| `Score-Inventar_Praxissoftware_v1.xlsx` | `Downloads\Digotor_Scores\` |
