# Abnahme — Etappe G: Betriebsreife

Manuelle Prüfschritte der Loops aus Spur A3 (`docs/development/ROADMAP.md`,
Abschnitt „Etappe G"). Voraussetzung und Aufbau: [README.md](README.md).

**Für diese Etappe zusätzlich nötig:** der volle Supabase-Stack mit
Anmeldedienst und Mailfänger. `pnpm dlx supabase start`, dann liegt der
Mailfänger unter <http://127.0.0.1:54324>. Ohne ihn sind die Schritte mit
Einladungs- und Kennwortmails nicht durchführbar — in der
Cloud-Entwicklungsumgebung greifen dort `pnpm test:db` und die
Komponententests.

---

## STAFF-002a — Wer darf Mitarbeiterdaten pflegen

**Was geprüft wird:** dass die Dreiteilung aus E10 in der Oberfläche ankommt —
und dass das Praxismanagement die Privatanschrift einer Kollegin weder sieht
noch versehentlich löscht.

1. **Office darf pflegen.** Als `olivia.office@praxis.invalid` anmelden, Praxis
   → Team öffnen. Die Schaltfläche „Mitarbeiter:in anlegen" ist da. Auf „Anna
   Beispiel" tippen: „Stammdaten bearbeiten" wird angeboten.
2. **Aber nicht alles.** Auf demselben Datensatz gibt es **keine** Schaltfläche
   „Als inaktiv führen" und **keinen** Abschnitt „Zugang". Beides bleibt bei der
   Praxisinhaberin.
3. **Privat bleibt privat.** „Stammdaten bearbeiten" öffnen: Es gibt die
   Abschnitte „Person" und „Dienstlich", **keinen** Abschnitt „Privat".
   Stattdessen steht dort der Satz, dass die Privatangaben ausschließlich die
   Praxisinhaberin pflegt.
4. **Der entscheidende Schritt.** Diensttelefon ändern und speichern.
5. **Nichts verloren.** Abmelden, als `jannes.test@praxis.invalid` anmelden,
   denselben Datensatz öffnen: Das neue Diensttelefon steht da — und der
   Abschnitt „Privat" trägt unverändert Geburtsdatum, private E-Mail und
   Adresse. Genau das wäre ohne ANN-022 gelöscht worden.
6. **Therapie pflegt nicht.** Als `anna.beispiel@praxis.invalid` anmelden,
   Praxis → Team: Die Liste ist lesbar, „Mitarbeiter:in anlegen" fehlt, und auf
   einem Datensatz gibt es weder „Stammdaten bearbeiten" noch „Zugang". Dasselbe
   gilt für `tim.teamleitung@praxis.invalid`.
7. **Am Handy.** Schritt 3 bei ~375 px Breite wiederholen: Das Formular ist
   ohne waagerechtes Scrollen bedienbar, „Änderungen speichern" mit dem Daumen
   erreichbar.

## STAFF-002b — Zugang einladen und annehmen

**Was geprüft wird:** dass ein Zugang vollständig in der Anwendung entsteht —
und dass ein Konto ohne Einladung nichts sieht.

Ausgangslage: **Nina Neu** steht im Seed als Mitarbeiterin **ohne** Zugang.
Nach einer Änderung an `supabase/seed.sql` zuerst `pnpm dlx supabase db reset`.

1. **Nur die Praxisinhaberin.** Als `jannes.test@praxis.invalid` anmelden,
   Praxis → Team → „Nina Neu": Es gibt den Abschnitt „Zugang" mit einem
   Einladungsformular. Die E-Mail-Adresse ist aus der dienstlichen Adresse
   vorbelegt, **keine** Rolle ist angekreuzt.
2. **Ohne Rolle geht es nicht.** Direkt auf „Zugang einladen" tippen: Es
   erscheint „Bitte mindestens eine Rolle wählen." Nichts wurde gesendet.
3. **Einladen.** „Therapeut:in" ankreuzen, „Zugang einladen". Der Abschnitt
   zeigt jetzt die Adresse, die vorgesehene Rolle und „Offen bis <Datum>"
   (14 Tage).
4. **Die Mail ist da.** <http://127.0.0.1:54324> öffnen: Es liegt eine Mail an
   `nina.neu@praxis.invalid` mit einem Anmeldelink.
5. **Noch kein Zugriff.** Vorher im Auditlog nachsehen (Betrieb → Sicherheit):
   Es steht „Zugang eingeladen" mit Bezug auf den Mitarbeiterdatensatz — und
   die E-Mail-Adresse steht **nicht** darin.
6. **Annehmen.** In einem privaten Fenster den Link aus der Mail öffnen. Es
   erscheint „Zugang einrichten". Auf „Einladung annehmen" tippen: Die
   Anwendung öffnet sich als Nina Neu.
7. **Die Rolle wirkt.** Als Nina ist Praxis → Team lesbar, „Mitarbeiter:in
   anlegen" fehlt (kein `office`), und unter „Mein Tag" steht ihr eigener Tag.
8. **Der Nachweis.** Zurück als `jannes.test@praxis.invalid`: Der Abschnitt
   „Zugang" bei Nina zeigt jetzt „Eingerichtet" und die Rolle. Im Auditlog steht
   zusätzlich „Einladung angenommen" — mit **Nina** als handelnder Person, nicht
   mit Jannes.
9. **Jetzt ist sie einplanbar.** Kalender → Termin anlegen: „Nina Neu" steht in
   der Auswahl der behandelnden Personen. Vorher stand sie dort nicht.
10. **Ein Konto ohne Einladung bleibt leer.** Abmelden. Auf der Anmeldemaske
    gibt es keinen Weg zur Selbstregistrierung. Wer trotzdem eines erzeugt (etwa
    über einen zweiten Einladungslink an eine andere Adresse), landet auf
    „Zugang einrichten" und bekommt dort „Für diesen Zugang liegt keine offene
    Einladung vor." — ohne Auskunft darüber, ob es die Adresse in der Praxis
    gibt.
11. **Zurücknehmen.** Als Jannes eine zweite Person einladen (Praxis → Team →
    „Petra Platzhalter" gibt es nicht; stattdessen unter „Mitarbeiter:in
    anlegen" eine neue anlegen und einladen), dann „Einladung zurücknehmen" und
    bestätigen. Der Abschnitt zeigt wieder das Formular; im Auditlog steht
    „Einladung zurückgenommen".
12. **Am Handy.** Schritt 1 bis 3 bei ~375 px Breite: Die Rollenliste ist ohne
    waagerechtes Scrollen bedienbar, jedes Kontrollkästchen samt Beschriftung
    ist mindestens 44 px hoch antippbar.
