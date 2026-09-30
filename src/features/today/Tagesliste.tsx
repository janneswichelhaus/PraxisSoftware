import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { Card } from '@/components/ui/Card';
import { Textlink } from '@/components/ui/Textlink';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { appointmentTypeHint, formatLocalTimeRange } from '@/features/appointments/api';
import {
  adressZeilen,
  dayPlanStatusLabels,
  dayPlanStatusTon,
  offenGrund,
  rufnummern,
  type DayPlanEntry,
} from './api';

/**
 * Ein Termin des eigenen Tages, so wie man ihn an der Wohnungstür braucht
 * (UX-001).
 *
 * Bewusst eine Karte statt einer Listenzeile: Adresse, Klingelname und
 * Rufnummer sind mehrzeilig und müssen bei 375 px ohne Aufklappen lesbar sein.
 * Wer im Hausflur steht, hat keine Hand frei, um erst ein Detail zu öffnen.
 *
 * Die Karte ist als Ganzes KEIN Link: sie enthält mehrere eigenständige
 * Ziele - Akte, Termin, Anruf. Verschachtelte Klickflächen sind mit Tastatur
 * und Vorlesesoftware nicht auseinanderzuhalten.
 *
 * Freitexte - Name, Anschrift, Zugangshinweis, Besonderheit - brechen auch
 * mitten im Wort um (UEB-16, wie BEF-005): Ein Hinweis ohne Trennstelle
 * sprengte sonst bei 390 px die Karte und die Seite liefe waagerecht.
 */
export function Tageskarte({
  termin,
  aktionen,
  hinweis,
}: {
  termin: DayPlanEntry;
  /** Zusätzliche Aktionen der Karte, etwa der Navigations-Handoff (UX-002). */
  aktionen?: ReactNode;
  /** Ein Hinweis unter den Angaben zur Person, etwa die offene Erstaufnahme (PRX-013). */
  hinweis?: ReactNode;
}) {
  const zone = termin.organization_time_zone;
  const adresse = adressZeilen(termin);
  const nummern = rufnummern(termin);
  const grund = offenGrund(termin);
  const einordnung = [
    termin.kind === 'internal' ? 'Fehlzeit' : termin.kind === 'training' ? 'Training' : null,
    appointmentTypeHint(termin.appointment_type),
    termin.location_name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-ink text-liste flex flex-wrap items-center gap-x-2 font-semibold tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
          {/* §8.1: abweichende Länge gekennzeichnet (CAL-020). */}
          <Laengenzeichen termin={termin} />
        </p>
        <Badge ton={dayPlanStatusTon[termin.status]}>{dayPlanStatusLabels[termin.status]}</Badge>
      </div>

      {/* Eine Fehlzeit des Praxisbetriebs hat keine Akte, in die ein Link
          führen könnte - es trägt seine Bezeichnung (CAL-016).

          Der Name führt in die Akte, und zwar mit dem Weg zurück in den Tag
          wie jedes andere Ziel der Karte (UEB-13). Er ist als Link zu
          erkennen, auch ohne Maus, und 44 px hoch (RSP-06, UIK-15). */}
      <p className="text-ink mt-1 min-w-0 text-[1.0625rem] font-medium wrap-anywhere">
        {termin.kind === 'training' ? (
          // TRN-006: der Name aus dem Training; er führt zur Kund:in.
          termin.training_relationship_id ? (
            <Textlink
              alleinstehend
              to={mitRueckweg(`/training/${termin.training_relationship_id}`, '/')}
            >
              {termin.training_given_name} {termin.training_family_name}
            </Textlink>
          ) : (
            '—'
          )
        ) : termin.kind === 'internal' || !termin.patient_id ? (
          (termin.title ?? 'Fehlzeit')
        ) : (
          <Textlink alleinstehend to={mitRueckweg(`/patienten/${termin.patient_id}`, '/')}>
            {termin.patient_given_name} {termin.patient_family_name}
          </Textlink>
        )}
      </p>

      {/* Der Hausbesuch ist der Regelfall und trägt kein Wort (ANN-192);
          die Zeile steht nur, wenn sie etwas sagt. */}
      {einordnung ? <p className="text-ink-muted mt-0.5 text-sm">{einordnung}</p> : null}

      {grund ? <p className="text-warnung mt-2 text-sm font-medium">{grund}</p> : null}

      {adresse.length > 0 ? (
        <address className="text-ink text-liste mt-3 min-w-0 wrap-anywhere not-italic">
          {adresse.map((zeile) => (
            <span key={zeile} className="block">
              {zeile}
            </span>
          ))}
        </address>
      ) : null}

      {/* „Zugangshinweis" wie im Feld der Stammdaten (WRT-17): „Zugang"
          allein ist in dieser Anwendung die Berechtigung zum Anmelden. */}
      {termin.home_visit_access_note ? (
        <p className="text-ink-muted mt-2 min-w-0 text-sm leading-relaxed wrap-anywhere">
          <span className="text-ink-muted font-medium">Zugangshinweis: </span>
          {termin.home_visit_access_note}
        </p>
      ) : null}

      {termin.special_note ? (
        <p className="text-ink-muted mt-1 min-w-0 text-sm leading-relaxed wrap-anywhere">
          <span className="text-ink-muted font-medium">Besonderheit: </span>
          {termin.special_note}
        </p>
      ) : null}

      {/* UX-003a: Die Liege gehört zur Person, nicht zum Termin (ANN-116). */}
      {termin.treatment_table_required ? (
        <p className="text-ink mt-1 text-sm leading-relaxed">
          <span className="text-ink-muted font-medium">Behandlungsliege: </span>
          mitnehmen
        </p>
      ) : null}

      {hinweis}

      <div className="mt-3 flex flex-wrap gap-2">
        {aktionen}
        {/* Kontakt ist Aktion, nicht Text (Oberflächen-Checkliste Punkt 8).
            Seit `IDEA-PRX-040` stehen die Nummern hinter den Handlungen: sie
            sind wichtig, aber selten — gebraucht werden sie, wenn niemand
            öffnet. Weggeklappt werden sie deshalb nicht, nur nach hinten
            gesetzt; im Hausflur mit Handschuhen ist die Nummer die einzige
            Handlung, die den Besuch noch rettet. */}
        {nummern.map((nummer) => (
          <a key={nummer.label} href={nummer.href} className={kartenAktionKlassen()}>
            <span className="text-ink-muted">{nummer.label}</span>
            <span className="tabular-nums">{nummer.anzeige}</span>
          </a>
        ))}
        {/* Der Pfeil zeigt die Richtung, er gehört nicht zum Namen des Links
            (WRT-08): Vorlesesoftware sagt sonst „Pfeil nach rechts". Den
            Abstand davor trägt `gap-1` - ein Leerzeichen am Ende des Textes
            fiele im Flex-Kasten weg. */}
        <Textlink
          alleinstehend
          to={mitRueckweg(
            termin.kind === 'training' ? `/training/termine/${termin.id}` : `/termine/${termin.id}`,
            '/',
          )}
          className="gap-1 px-1 text-sm font-medium"
        >
          {termin.kind === 'internal' ? 'Fehlzeit öffnen' : 'Termin öffnen'}
          <span aria-hidden="true">→</span>
        </Textlink>
      </div>
    </Card>
  );
}
