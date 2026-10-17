# Arbeitsbereiche: was echt ist, was Vorschau ist

Stand 2026-10-17. Beantwortet zwei Fragen: **Worauf kann ich mich in der laufenden Anwendung
verlassen?** Und: **Wo steht schon etwas, das kein zweites Mal gebaut werden darf?** Ohne Rang
(§21), keine Reihenfolge (die steht in [`ROADMAP.md`](ROADMAP.md)). Die ausführliche Fassung mit
Einzelheiten je Route (Stand 26.09.) liegt in
[`archiv/ARBEITSBEREICHE-bis-2026-10-12.md`](archiv/ARBEITSBEREICHE-bis-2026-10-12.md).

**Zustände:** **echt** — Datenbank, RLS und Audit, nutzbar mit synthetischen Daten. **Vorschau** —
bedienbar, aber nur im Arbeitsspeicher, ohne Server. **offen** — eine Entscheidung fehlt; die
Ansicht sagt das.

## Bereiche

| Bereich | Routen | Zustand | Code (`src/features/`) |
| --- | --- | --- | --- |
| Übersicht (Tag) | `/`, `/offen`, `/offen/anrufe`, `/auf-dem-geraet` | echt; Entwürfe ohne Netz (ADR-024) | `today`, `open-points`, `offline-documentation` |
| Patient:innen und Akte | `/patienten…`, `/verordner…` | echt | `patients`, `treatment-bases`, `files`, `assessments`, `therapy-reports`, `datenschutz` |
| Kalender, Termine, Warteliste | `/kalender…`, `/termine/…`, `/warteliste…` | echt | `appointments`, `scheduling`, `slot-search`, `waitlist` |
| Tour | `/touren`, `/praxis/gebiete` | echt mit synthetischen Adressen; Produktivfreigabe offen (ADR-019, `LOCATION_DATA_GATE`) | `tours`, `territories` |
| Dokumentation | `/termine/:id/abschluss`, `/termine/:id/dokumentation…`, `/praxis/textbausteine`, `/praxis/instrumente` | echt | `documentation` |
| Training und Übungen | `/training…`, `/uebungen…` | echt | `training`, `training-offers`, `exercises`, `exercise-plans`, `checkins` |
| Rückfragen | `/rueckfragen…`, `/training/rueckfragen/…` | echt; Anhänge von außen ohne Virenprüfung zugelassen (ADR-017 Fassung 6) | `messages` |
| Abrechnung, Statistiken | `/abrechnung…`, `/statistiken` (nur `owner`) | echt; Mailversand offen (B13) | `billing`, `statistics` |
| Organisatorisches | `/praxis/team…`, `/praxis/planung`, `/praxis/sicherheit/…`, `/mein-konto` | echt | `staff`, `audit`, `retention`, `account`, `session` |
| Plattform (Patient:innen, Kund:innen) | `/p/…` | echt; Einladung per Mail offen (B13) | `platform`, `platform-access` |
| Radflotte | `/betrieb/flotte…` | echt (FLT-EPIC-001): Depots, Räder, Schlüssel, Check-Up, Panne, Stellen am 3D-Rad, Unterlage für die Werkstatt; Tübinger Standortvorlage offen (ANN-554) | `fleet` |
| **Praxisbetrieb** | `/team` | **Vorschau** bis zur Bereichsüberholung 11 (vorgezogen 2026-10-16: TEAM); Urlaub seit Überholung 7, Zeitkonto seit 9, Erstattungen seit 10 echt (`/betrieb/erstattungen`, `reimbursements`) | `teamchat` |
| Vorschau-Protokoll | `/vorschau/protokoll` | Vorschau | `preview` |

Offen bleiben in der Vorschau: Speicherfrist und Anhänge des Teamchats (§10, §18) und aggregierte
Auswertungen über Beschäftigte (§20, B6). Diese Punkte blockieren nur die echten Aktionen, nicht die
Ansicht. Fristen für Urlaub, Arbeitszeit, Zeitkonto und Erstattungen stehen seit den Überholungen 7
bis 10 fest (ANN-579, ANN-591, ANN-597, ANN-602); offen ist die Löschsperre für Beschäftigtendaten
(BEF-178).

## Regeln

1. **Keine zweite Implementierung neben einer vorhandenen.** Wer ein Feld, eine Liste oder einen
   Ablauf braucht, den es schon gibt, nutzt oder ersetzt ihn — zwei Wahrheiten über dieselbe Sache
   widersprechen sich irgendwann (darauf verweisen ADR-009, ADR-021 und ADR-022).
2. **Vorschau ist technisch getrennt.** Die Verzeichnisse in `VORSCHAUBEREICHE`
   (`src/features/preview/trennung.test.ts`) haben keinen Datenbankzugriff, kein Netz, keine
   Persistenz und keine Importe aus echten `api.ts`-Modulen; `ehrlichkeit.test.tsx` prüft, dass
   keine Erfolgsmeldung behauptet wird. Beide Tests werden nie angepasst, um grün zu werden — ein
   Treffer heißt, dass die Arbeit in den echten Bereich gehört.
3. **Eine Vorschau wird in ihrem Loop ersetzt**, nicht erweitert und nicht daneben gebaut; danach
   fällt ihr Verzeichnis aus `VORSCHAUBEREICHE`. Neue Vorschaubereiche entstehen nicht mehr (der
   Sandbox-Pfad ist am 2026-10-12 entfallen); Oberflächen werden im echten Bereich gebaut.
4. **Zustandsmeldung statt Kennzeichnung** (Jannes, 2026-09-22): Kein Banner „noch keine echte
   Speicherung“; `SimulationsMeldung` sagt nach jeder Aktion, was **nicht** passiert ist. Aussagen
   über Datenfluss, Rechtslage oder Rechengrundlage bleiben auch im echten Bereich stehen.
5. **Radflotte:** Seit FLT-EPIC-001 (2026-10-15) echt und nicht mehr in `VORSCHAUBEREICHE`. Die
   Urlaubsvorschau nennt noch Stammräder aus den Demodaten (BEF-168), bis URL-001 sie ersetzt.
6. Wo die Vorschau bewusst von der Team-App-Vorlage abweicht (keine PIN, kein zweiter
   Mitarbeiterstamm, Erstattung in vier Ständen, kein vorgetäuschter Versand), steht die
   Begründung im Archiv, Abschnitt 4; sie gilt für die echten Loops weiter.
