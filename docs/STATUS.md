# Status · Stand 2026-09-21 · letzte Session: CAL-EPIC-005 — Terminkontext und Trainingsgrundlage

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**CAL-EPIC-005 ist gebaut** (Roadmap 5.30, dritter Loop der Etappe L). `appointments.kind` hat den
Wert `training`, daneben das Trainingsverhältnis als zweite Verknüpfung und `training_bases` als
eigene Klammer **ohne klinische Felder**. Gelesen wird je Kontext, dokumentiert nur die Behandlung,
gelöscht **je Zeile** — drei Fristen in einer Tabelle. **Keine Oberfläche, keine Schreibwege** für
Training; 42 neue Datenbanktests, **keine neue Annahme**. 37,7 → **38,8 %**, **ABR-EPIC-005 frei**.

## Danach — Reihenfolge seit 2026-09-20

1. **ABR-EPIC-005** — ein Bereich je Rechnung, getrennte Nummernkreise; Voraussetzung liegt vor
2. **ABR-EPIC-006** — „Einnahmen je Leistungsart"; darf als einziger rutschen
3. **MAP-002** — In-App-Kartenprototyp, startbar und von nichts abhängig

Daneben: **E18 Schritt 7** (Training hat einen Platz im Kalender, aber keinen Schreibweg) ·
**`MDR_REVIEW_REQUIRED` verorten** · **CAL-027** (Umbenennung der Bestandswerte, mechanisch).

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329);
**angemeldete E2E-Tests laufen in der Cloud nicht**, Rest: `.env.local`. `ASSUMPTIONS.md` bleibt bei
**1150** Zeilen und 87 Einträgen: Was ein ADR dem SPEC überlässt, ist Festlegung, nicht Annahme.

## Blocker (Jannes-seitig)

- **PTV-Schlüssel nur lokal** (Abo seit 2026-09-20): `.env.local`, nie ins Repository, synthetische
  Koordinaten; offen: **Domainbindung** (ADR-019).
- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge (drei neue Migrationen, **Seed
  unverändert**). **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Nummernformat (**je Nummernkreis**, ABR-EPIC-005), Umsatzsteuer-Status und
  **der Wortlaut des Befreiungshinweises** stehen als Annahme (ANN-074/075/082); dazu echte Preise.
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) — **B2 trägt** die
  Trennung aus ADR-021, die Einwilligung im Training, die Office-Sicht (§4.8) und **die Frist für
  Screening-Daten** · **Secret Scanning und Push Protection** · Kartendienst ablegen.
- **Neu (Vertragsfrage, kein Blocker):** Entsteht der **Gebührenanlass** aus ADR-018 Punkt 8 auch im
  Dienstvertrag über Training? Bis zur Antwort gilt er nur für die Behandlung.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018, CAL-EPIC-004a/b/c,
  FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001/002a/b/003** in
  [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md); **Sichtprüfung hinter der
  Anmeldung wartet auf OPS-002**.
- **B8:** Lizenzbeleg · **OPS-001** offen · `claude/issue-42-status-fv319v` ungemergt.

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, ABR-EPIC-004,
LEI-EPIC-001, FRB-EPIC-000 und neu **CAL-EPIC-005**
([`abnahme/etappe-l-leistungsbereiche.md`](abnahme/etappe-l-leistungsbereiche.md)); FIX-EPIC-001 braucht Docker. Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Drei Kontexte, ein Kalender, kein Durchgriff.** Zwei Fehler fielen auf und sind behoben:
`record_no_show` hätte am Trainings-Hausbesuch einen Gebührenanlass gesetzt, der Löschlauf hätte
abgesagte Trainingstermine zu früh und **an der Löschsperre vorbei** gelöscht. Neu: **BEF-020**.
Lokal: `git pull origin claude/erste-aufgabe-status-u2vc66`, dann `db reset`; keine neuen Pakete.
