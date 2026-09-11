import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { appointmentTypeLabels, formatLocalTimeRange } from '@/features/appointments/api';
import {
  adressZeilen,
  dayPlanStatusLabels,
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
 */
export function Tageskarte({
  termin,
  aktionen,
}: {
  termin: DayPlanEntry;
  /** Zusätzliche Aktionen der Karte, etwa der Navigations-Handoff (UX-002). */
  aktionen?: ReactNode;
}) {
  const zone = termin.organization_time_zone;
  const adresse = adressZeilen(termin);
  const nummern = rufnummern(termin);
  const grund = offenGrund(termin);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-ink text-[0.9375rem] font-semibold tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
        </p>
        <Badge
          ton={
            termin.status === 'cancelled'
              ? 'kritisch'
              : termin.status === 'completed'
                ? 'positiv'
                : 'neutral'
          }
        >
          {dayPlanStatusLabels[termin.status]}
        </Badge>
      </div>

      <p className="text-ink mt-1 text-[1.0625rem] font-medium">
        <Link to={`/patienten/${termin.patient_id}`} className="hover:text-accent hover:underline">
          {termin.patient_given_name} {termin.patient_family_name}
        </Link>
      </p>

      <p className="text-ink-muted mt-0.5 text-sm">
        {appointmentTypeLabels[termin.appointment_type]}
        {termin.location_name ? ` · ${termin.location_name}` : ''}
      </p>

      {grund ? <p className="text-warnung mt-2 text-sm font-medium">{grund}</p> : null}

      {adresse.length > 0 ? (
        <address className="text-ink mt-3 text-[0.9375rem] not-italic">
          {adresse.map((zeile) => (
            <span key={zeile} className="block">
              {zeile}
            </span>
          ))}
        </address>
      ) : null}

      {termin.home_visit_access_note ? (
        <p className="text-ink-muted mt-2 text-sm leading-relaxed">
          <span className="text-ink-muted font-medium">Zugang: </span>
          {termin.home_visit_access_note}
        </p>
      ) : null}

      {termin.special_note ? (
        <p className="text-ink-muted mt-1 text-sm leading-relaxed">
          <span className="text-ink-muted font-medium">Besonderheit: </span>
          {termin.special_note}
        </p>
      ) : null}

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
        <Link
          to={`/termine/${termin.id}`}
          className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center px-1 text-sm font-medium"
        >
          Termin öffnen →
        </Link>
      </div>
    </Card>
  );
}
