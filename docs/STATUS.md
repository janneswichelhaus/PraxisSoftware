# Status · Stand 2026-09-23 · letzte Session: Umbau U0 und U1

Livestand, sonst nichts. Die **Reihenfolge** legt [`development/ROADMAP.md`](development/ROADMAP.md)
fest (Kette in 15 Blöcken), Befunde sammelt [`development/BEFUNDE.md`](development/BEFUNDE.md),
Ideen gehören nach [`product/IDEENSPEICHER.md`](product/IDEENSPEICHER.md).

## Jetzt

**Umbau läuft** ([`development/UMBAU.md`](development/UMBAU.md)). Am 2026-09-23 hat Jannes das Produkt genauer beschrieben und sieben Entscheidungen getroffen (E-1 bis E-7): Anfragen ab Anfang 2027 parallel, Test-Umgebung für das Handy, Nachsorge-Abo nach der Behandlung, UX-Fundament vorziehen, Sichtung statt Abnahme je Epic. Das wird in fünf Schritten **eingearbeitet, nicht angehängt**. U1 hat die Entscheidungen in `PROJECT_PRINCIPLES.md` 0.17 und die ADRs gebracht. Fortschritt **34,1 %**.

## Danach — Umbau, dann Bauen

1. **U2 Produktbeschreibung und Roadmap 7.0** — „Umbau U2 nach `docs/development/UMBAU.md`"
2. **U3 Ablauf schlank**
3. **U4 Register**, dann **U5 Test-Umgebung**

Danach **G6c**, sobald deine Wahl unter „Blocker" da ist, sonst der neue Block „Handy und UX-Fundament" (kommt mit Roadmap 7.0).

## Prüfverfahren

**Die CI läuft.** Lokal: `pnpm test:db` gegen einen Wegwerf-Container (54329); **angemeldete E2E-Tests und die Deno-Laufzeit laufen in der Cloud nicht**. Stand heute: `test` **2347**; `test:db` **1871** (mit G6b, eine Migration). Keine Sichtprüfung: Geändert sind nur zehn neue Einträge im Aktionsfilter des Auditlogs, und die Seite liegt hinter der Anmeldung.

## Blocker (Jannes-seitig)

- **Abnahme-Rückstand über 30 Epics:** Abweichungsregel 1 ist seit 2026-09-23 auf deinen Wunsch ausgesetzt; es wird ohne Abnahmen weitergebaut. Wenn du abnimmst: lokal mit `supabase start`, je Etappe am Stück ([`abnahme/README.md`](abnahme/README.md)), zuerst **M1** ([`abnahme/etappe-1-kernprozess.md`](abnahme/etappe-1-kernprozess.md)).
- **MAP-003, MAP-004, MAP-005** ([`abnahme/etappe-t-kartendienst.md`](abnahme/etappe-t-kartendienst.md)): MAP-003 Schritte 2, 3, 5 und alle fünf von MAP-004 lokal mit `[edge_runtime] enabled = true` **für den Lauf** (im Repository bleibt `false`); MAP-005 Teil A erneut prüfen (dabei MAP-002 Schritt 3), **Teil B am Telefon ruht**, bis ein Gerät da ist — `MAX_ZWISCHENZIELE` bleibt bei drei.
- **G6c Schreibpfade** (Optionen in der Roadmap, Block 1): Empfehlung (a) HTTP 403 bei bestätigter Transaktion für Rollen und Konten, Legal Hold und Löschaufträge, (c) für den Rest. Ohne Antwort geht es mit Block 2 weiter.
- **Logfrist für Betriebslogs (R14 alt, jetzt R9):** (a) ADR-011 Punkt 4 senken oder (b) Ausleitungsweg. Empfehlung: nach G3. Gebraucht vor echten Daten.
- **BEF-026 / B13:** Die Plattform braucht Mails an Patient:innen; Empfehlung: eigener SMTP-Anbieter, geprüft in Block 11. STAFF-004 ruht bis dahin.
- **D2/D3 aus dem FRB-Plan** vor FRB-EPIC-003; ohne Antwort gilt der Vorschlag dort.
- **Preise** für Abo und Pakete vor Block 5 (bis dahin synthetisch); **G13** (Umsatzsteuer-Status, Befreiungshinweis, Kürzel `RG`/`TR`) vor M3.
- **B8:** schriftlicher Lizenzbeleg bis M3 · ungemergt liegen `claude/issue-42-status-fv319v`, `claude/r3-analyse`, `claude/r3-code-review-hardening-c22b8f`.
- **Ab Anfang 2027 parallel zum Bauen (E-1, 2026-09-23):** OPS-001-Unterlagen, Anfragen B1, B2, B4, Anbieterprüfungen.
- **Lokal:** `git pull`, **Node 22** (`.nvmrc`).

## Auf Abnahme warten

Alles aus Etappe 1 seit CAL-EPIC-003b, dazu DAT-EPIC-001, ROL-EPIC-001, FIX-015, Etappe L (ABR-EPIC-004 bis 006, LEI-EPIC-001, CAL-EPIC-005, CAL-027), FRB-EPIC-000, MAP-002 bis MAP-005 ([Etappe T](abnahme/etappe-t-kartendienst.md)), OPS-006, OPS-007 (lokal mit `db reset --no-seed`) und PAT-006 ([Etappe G](abnahme/etappe-g-betriebsreife.md)). Gesamtliste: [`abnahme/README.md`](abnahme/README.md).

## Letzte Session

**Umbau U0 und U1.** Plan [`development/UMBAU.md`](development/UMBAU.md) nach Durchsicht und Produktgespräch. **`PROJECT_PRINCIPLES.md` 0.17**: eingearbeitet statt angehängt — §14 Umfang, §4.6/§4.10 Plattformstufen und Nachsorge-Abo, §5 Fotos und Erstaufnahme, §9 Tagesroute mit Liege, §15 Anfragen ab Anfang 2027, §19 Abo und Paket; Vermerke in [`PRINCIPLES-CHRONIK.md`](PRINCIPLES-CHRONIK.md), −25 % Text. ADR-014 Fassung 2, ADR-013 Fassung 4 (Negativfälle „fremde Person", „anderer Leistungsbereich"), ADR-009 Fassung 3. Kein Code, **keine neue Annahme**. **Lokale Schritte:** `git pull origin main` nach dem Merge; keine Migration, keine neue Abhängigkeit.
