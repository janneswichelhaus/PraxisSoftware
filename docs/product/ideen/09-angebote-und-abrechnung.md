# Angebote, Preise und Abrechnung (ANG)

> Nicht normativ. Siehe [../IDEENSPEICHER.md](../IDEENSPEICHER.md).

Wie die Weiterbetreuung nach Therapieende verkauft und abgerechnet wird. Baut
auf [ADR-009](../../adr/ADR-009-private-billing-model.md) auf, geht aber über
das dort Entschiedene hinaus: ADR-009 kennt Einzelleistungen und Rechnungen,
keine vorausbezahlten Pakete.

---

### IDEA-ANG-001 — Coaching als Paketpreis

| | |
|---|---|
| Status | notiert · entscheidung nötig |
| Quelle | Jannes, 2026-09-01 |
| Berührt | [ADR-009](../../adr/ADR-009-private-billing-model.md), B4, B9, B11 |

**Idee.** Die Weiterbetreuung wird nicht je Einheit abgerechnet, sondern als
Paket: ein Preis für einen Zeitraum oder ein Kontingent — etwa drei Monate
Begleitung, oder zehn Einheiten.

**Warum.** Für die Praxis planbarer Umsatz, für die Person eine Entscheidung
statt zwölf. Fachlich ist es außerdem ehrlicher: Betreuung wirkt über Monate,
nicht über Einzeltermine, und ein Paket bildet genau das ab.

**Was daran neu ist gegenüber ADR-009.** Ein Paket ist eine **Vorauszahlung
auf noch nicht erbrachte Leistungen**. Das ist ein anderer Vorgang als die
Rechnung nach erbrachter Leistung, die ADR-009 regelt, und bringt eigene
Anforderungen mit:

- **Guthabenführung**: Was ist gekauft, was ist verbraucht, was ist offen.
  ADR-009 verlangt, dass Leistungen unabhängig von Rechnungen geführt werden
  und keine unbeabsichtigte Mehrfachabrechnung entsteht — ein Paket ist genau
  die Konstellation, in der doppelt abgerechnet wird, wenn das Guthaben nicht
  sauber gegen die Leistung gebucht wird.
- **Umsatzsteuer bei Vereinnahmung**: Bei Anzahlungen entsteht die Steuer mit
  dem Zahlungseingang, nicht mit der Leistung. Das verschiebt den
  Steuerzeitpunkt gegenüber dem Rest des Modells.
- **Keine gemischten Pakete.** Ein Paket, das steuerfreie Heilbehandlung und
  steuerpflichtiges Training zusammenfasst, muss aufgeteilt werden — oder es
  darf nicht entstehen. Letzteres ist einfacher und sauberer.
- **Gültigkeit und Verfall**: Ein Kontingent braucht eine Laufzeit. Zu kurze
  Verfallfristen sind in Allgemeinen Geschäftsbedingungen angreifbar.
- **Abbruch und Erstattung**: Was passiert bei Krankheit, Umzug, Rückfall in
  die Heilbehandlung? Der Rückfall ist der interessante Fall — dann wird aus
  dem bezahlten Training wieder Therapie.
- **Unveränderbarkeit**: Ein Guthabenkonto ist eine steuerlich relevante
  Aufzeichnung und unterliegt denselben GoBD-Anforderungen wie die Rechnung.
- **Preisversionierung**: ADR-009 hat versionierte Kataloge entschieden. Ein
  laufendes Paket behält seinen Preis; eine Preiserhöhung wirkt erst auf neue
  Pakete.

**Offen.** Als neuer Punkt **B11** in `docs/decisions/OPEN_DECISIONS.md`
aufgenommen. Kontingent nach Einheiten oder nach Zeitraum? Automatische
Verlängerung — und wenn ja, mit welcher Kündigungsfrist? Das sind
Geschäftsmodellentscheidungen, keine technischen.

---

### IDEA-ANG-002 — Rabatt für eine Google-Bewertung: so nicht

| | |
|---|---|
| Status | notiert · Bedenken |
| Quelle | Jannes, 2026-09-01 · Einordnung Claude |
| Berührt | B11, [ADR-007](../../adr/ADR-007-data-protection-impact-assessment.md), §16 |

**Die Idee.** Ein Rabatt — etwa ein kostenloser Monat Coaching —, wenn ein
Patient nach der Therapie eine gute Google-Bewertung hinterlässt.

**Einordnung: davon ist abzuraten, und zwar aus drei voneinander unabhängigen
Gründen.** Jeder für sich würde reichen.

1. **Werberecht im Heilbereich.** Zuwendungen und Werbegaben sind im Umfeld
   von Heilbehandlungen weitgehend unzulässig (§7 HWG). Ein kostenloser
   Betreuungsmonat ist keine geringwertige Kleinigkeit. Dass die Gegenleistung
   das Coaching betrifft und die Bewertung die Therapie, macht es nicht
   besser — der Anreiz bezieht sich auf die Heilbehandlung.
2. **Lauterkeitsrecht.** Ein bezahlter Anreiz für eine Bewertung muss
   offengelegt werden; eine nicht gekennzeichnete incentivierte Bewertung ist
   irreführend. Der Zusatz **„gute"** ist dabei der schärfste Punkt: eine
   Prämie nur für positive Bewertungen verzerrt das Gesamtbild systematisch
   und ist der Kern dessen, was das UWG bei Verbraucherbewertungen untersagt.
3. **Plattformregeln.** Google untersagt incentivierte Bewertungen
   ausdrücklich. Die absehbare Folge ist nicht nur die Entfernung einzelner
   Bewertungen, sondern ein Risiko für das gesamte Unternehmensprofil — also
   genau das Kapital, das aufgebaut werden soll.

**Und ein vierter, nicht rechtlicher Punkt.** Zwischen Therapeut und Patient
besteht ein Abhängigkeitsverhältnis. Eine Bitte um eine öffentliche
Positivbewertung gegen Geldwert ist darin etwas anderes als unter Gleichen.
Wer im Herbst wieder Termine braucht, sagt schwer nein. Außerdem entstünde in
der Praxis eine Zuordnung „wer hat welche öffentliche Bewertung geschrieben" —
eine Verknüpfung, die datenschutzrechtlich nichts Gutes bringt.

**Was stattdessen geht — und fast dasselbe bewirkt:**

- **Einfach fragen, zum richtigen Zeitpunkt.** Eine Bitte um eine Bewertung
  ohne Gegenleistung ist zulässig. Der wirksamste Hebel ist nicht die Prämie,
  sondern der Moment: kurz nachdem jemand einen spürbaren Fortschritt erlebt
  hat. Genau diesen Moment kennt die Plattform ohnehin — er steht in den
  Verlaufsdaten.
- **Den Weg kurz machen.** Ein Link, ein Klick, kein Suchen. Das schlägt
  jeden Rabatt.
- **Paketrabatte ohne Bewertungsbezug.** Mehrmonatsrabatt, Treuerabatt,
  Rabatt bei Vorauszahlung: alles unproblematisch, weil es ein Preisnachlass
  auf eine reguläre, steuerpflichtige Trainingsleistung ist und an keine
  Meinungsäußerung geknüpft.
- **Internes Feedback belohnen statt öffentlicher Bewertung.** Eine
  strukturierte Rückmeldung an die Praxis — unabhängig davon, ob sie positiv
  ausfällt — ist ein anderer Sachverhalt und fachlich wertvoller, weil man aus
  Kritik mehr lernt als aus fünf Sternen.

**Was die Software dazu beitragen kann, ohne die Grenze zu berühren:** einen
guten Zeitpunkt erkennbar machen und den Bewertungslink bereitstellen. Nicht:
Rabatte an Bewertungen koppeln, Bewertungen Personen zuordnen oder
nachverfolgen, wer bewertet hat.

**Offen.** Ob Jannes die Empfehlung teilt. Wenn er den Anreiz trotzdem
umsetzen will, gehört das vorher zu einer wettbewerbs- und
heilmittelwerberechtlichen Beratung — nicht in einen Feature-Loop.

---

### IDEA-ANG-003 — Rückfall in die Heilbehandlung während eines Pakets

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-ANG-001, [00 LZK](00-lebenszyklus-und-zugang.md), B9, B11 |

**Idee.** Der Fall, den jedes Paketmodell braucht und keines vorsieht: Jemand
hat drei Monate Coaching bezahlt und bekommt in Monat zwei ein neues Rezept.

**Warum das wichtig ist.** Es ist kein Randfall, sondern in der
Physiotherapie der Regelfall — Menschen kommen wieder. Und es ist genau der
Punkt, an dem alle Trennungen gleichzeitig belastet werden: die Episode
wechselt den Typ ([IDEA-LZK-002](00-lebenszyklus-und-zugang.md)), die
Umsatzsteuer wechselt, die Dokumentationspflicht setzt ein, und das bezahlte
Guthaben läuft weiter.

**Denkbare Antworten**, alle mit Nebenwirkungen: Paket pausiert und
verlängert sich um die Behandlungsdauer · Paket läuft parallel weiter ·
Restguthaben wird erstattet. Die erste ist für die Person die fairste und
buchhalterisch die aufwendigste.

**Offen.** Teil von B11. Eine Entscheidung, die Jannes trifft, nicht ein Loop.

---

### IDEA-ANG-004 — Preise sichtbar, bevor jemand fragt

| | |
|---|---|
| Status | bestätigt |
| Quelle | Claude, 2026-09-01 |
| Berührt | IDEA-ANG-001, [00 LZK](00-lebenszyklus-und-zugang.md) |

**Idee.** Wenn die Weiterbetreuung im Portal angeboten wird, steht der Preis
dort — vollständig, mit Laufzeit, Umfang und Kündigungsbedingungen, ohne
Beratungsgespräch als Zwischenschritt.

**Warum.** Der Übergang vom Rezept ins Selbstzahlerangebot ist der Moment, in
dem das Vertrauensverhältnis kommerziell wird. Vollständige Preisangaben sind
das Einzige, was diesen Moment sauber hält — und rechtlich ohnehin erforderlich
(Preisangabenverordnung, Fernabsatzrecht bei Abschluss über das Portal).

**Vorsicht.** Ein Vertragsschluss über das Portal bringt Widerrufsrecht,
Informationspflichten und eine Bestätigung in Textform mit sich. Das ist ein
eigenes Feature, kein Knopf.
