# Status · Stand 2026-09-20 · letzte Session: Roadmap 5.26 (E18, Schritt 6 fertig)

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest, Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md), Ideen gehören nach
[`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md); ein Eintrag hier ist keine Einplanung.

## Jetzt

**Die Roadmap ist neu geschnitten** (Version **5.26**, E18 Schritt 6): Die vier Entscheidungen vom
2026-09-20 stehen als **Etappe L** in Spur A1 — fünf Loops, gebunden an den **Feature-Freeze Stufe 1
(26.02.2027)** und **nicht** an M1, dessen Kriterien unverändert bleiben. **Etappe 1 ist
unangetastet**, **gebaut ist von E18 nichts**, **BEF-019 ist eingeplant** (ABR-EPIC-004), offen
bleibt allein **Schritt 7**. Der Stand fällt durch den Zuschnitt von 39,6 auf 35,4 Prozent — der
Nenner wächst, gebaut ist nichts weniger. **R3 gemergt** (PR #57–#59); Abrechnung Etappe 1 gebaut.

## Danach — Reihenfolge seit 2026-09-20

1. **ABR-EPIC-004** — Befreiungsgrund (**BEF-019**) und § 14c-Riegel; zuerst, weil es Gebautes korrigiert
2. **LEI-EPIC-001** — Trainingsverhältnis: Tabelle, Datenklasse, Löschlauf, Trainingsbetreuung
3. **CAL-EPIC-005** — Terminkontext und Trainingsgrundlage; braucht LEI-EPIC-001

Daneben: **MAP-002** ist **startbar**, der PTV-Free-Schlüssel liegt seit 2026-09-20 vor · **E18
Schritt 7** und **`MDR_REVIEW_REQUIRED` verorten** als eigene Sitzungen; kein Loop wartet darauf.

## Prüfverfahren

**Die CI läuft wieder** (seit PR #48). Lokal: `pnpm test:db` gegen einen Wegwerf-Container (Port
54329), seit R3 halb so lang; **angemeldete E2E-Tests laufen in der Cloud nicht**, Rest: `.env.local`.

## Blocker (Jannes-seitig)

- **PTV-Schlüssel nur lokal** (Abo seit 2026-09-20): `.env.local`, nie ins
  Repository, synthetische Koordinaten; offen: **Domainbindung** (ADR-019).
- **Lokal `pnpm dlx supabase@2.116.0 db reset`** nach dem Merge von R3 (eine
  Migration aus G2); Seed unverändert. **Node 22** (`.nvmrc`), sonst rot.
- **G13 ist überfällig:** Nummernformat (jetzt **je Nummernkreis**, ABR-EPIC-005)
  und Umsatzsteuer-Status stehen als Annahme (ANN-074, ANN-075); dazu echte
  Preise und Praxisstammdaten — der Seed trägt erfundene.
- **M0 am 30.09.:** B1, B2, B4 ([`decisions/ANFRAGEN.md`](decisions/ANFRAGEN.md)) —
  **B2 trägt** die Trennung aus ADR-021, die Einwilligung im Training, die
  Office-Sicht (§4.8) und **neu die Frist für Screening-Daten** (sonst Annahme in
  LEI-EPIC-001) · **Secret Scanning und Push Protection** · Kartendienst ablegen.
- **Abnahme R3** (25 Befunde umgesetzt, 26 bleiben Backlog) und **CAL-018,
  CAL-EPIC-004a/b/c, FIX-EPIC-004, UX-013, GRD-001, VER-EPIC-002, ABR-EPIC-001,
  ABR-EPIC-002a/b, ABR-EPIC-003** in [`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md);
  **Sichtprüfung hinter der Anmeldung wartet auf OPS-002**.
- **B8:** Lizenzbeleg · **OPS-001** offen · `claude/issue-42-status-fv319v`
  ungemergt.

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015;
FIX-EPIC-001 braucht Docker. Liste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Schritt 6 aus E18 — kein Code, keine Migration, kein Test, keine neue Annahme.** Über die Vorgabe
hinaus ging eine Stelle: Die **Trainingsbetreuung** (§4.9) bekommt ihren Rollenschlüssel in
LEI-EPIC-001 — ohne sie bleibt „kein Durchgriff" eine unbesetzte Grenze. Nachgezogen: E18, BEF-019,
`fortschritt.json`; **BEF-017 bleibt offen**. Lokal: `git pull origin main`.
