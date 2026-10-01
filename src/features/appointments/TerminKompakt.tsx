import type { ReactNode } from 'react';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import type { CurrentUser } from '@/features/session/types';
import { grundlageBezeichnung } from '@/features/treatment-bases/api';
import { Kurzblick } from './Kurzblick';
import { Laengenzeichen } from './Laengenzeichen';
import { Mitteilungszeichen } from './Mitteilungszeichen';
import { NavigationZumTermin } from './NavigationStarten';
import { positionText } from './abrechnungslage-api';
import { useAbrechnungslage } from './useAbrechnungslage';
import { Badge } from '@/components/ui/Badge';
import { Deckungszeichen } from './Deckungszeichen';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  locationSummary,
  staffName,
  type Appointment,
} from './api';

/** „Do 01.10.2026" in der Zeit der Praxis. */
function tagMitWochentag(iso: string, zone: string): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone,
  }).formatToParts(new Date(iso));
  const wert = (art: Intl.DateTimeFormatPartTypes) =>
    teile.find((teil) => teil.type === art)?.value ?? '';
  return `${wert('weekday').replace('.', '')} ${wert('day')}.${wert('month')}.${wert('year')}`;
}

/** Ein Glied der Metazeile: unsichtbare Beschriftung, sichtbarer Wert, Punkt davor. */
function Glied({
  label,
  erstes = false,
  eigeneZeile = false,
  children,
}: {
  label: string;
  erstes?: boolean;
  /** Beginnt eine eigene Zeile - ohne verwaisten Punkt am Zeilenanfang. */
  eigeneZeile?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${eigeneZeile ? 'basis-full' : ''}`}>
      {erstes || eigeneZeile ? null : (
        <span aria-hidden="true" className="text-ink-muted">
          ·
        </span>
      )}
      <dt className="sr-only">{label}</dt>
      <dd className="inline-flex items-center gap-1.5">{children}</dd>
    </div>
  );
}

/**
 * Eine Metazeile statt Kicker und Kachelreihe (Design-Handoff 2026-10-01,
 * Abschnitt 6, Zyklus 3): „Do 01.10.2026 · 09:10–10:10 Uhr · 60 min · Termin
 * 2 von 6 · ✓ gedeckt · Verordnung vom …".
 *
 * Als `dl` mit unsichtbaren Beschriftungen wie bisher die Kopfzeile: Wer
 * vorliest, hört „Datum", „Zeit", „Status". Der Hausbesuch trägt kein Wort
 * (ANN-192) - ein Praxis- oder Videotermin sagt es in der Zeile des Ortes.
 * Der Zustand steht nur, wenn er vom Regelfall abweicht; die behandelnde
 * Person nur an fremden Terminen (ANN-193); die Mitteilungswege als Zeichen
 * (CAL-012). Ungedeckt steht das Abzeichen „Ohne Deckung" mit dem Weg zum
 * Übertragen (CAL-022).
 */
export function TerminMetazeile({
  appointment,
  user,
  darfVerwalten,
  zumTermin,
  hinweis,
}: {
  appointment: Appointment;
  user: CurrentUser;
  darfVerwalten: boolean;
  zumTermin: string;
  /** Was aus einem Zustand ohne Rückweg folgt, eine Zeile. */
  hinweis?: string | null;
}) {
  const zone = appointment.organization_time_zone;
  const { data: lage } = useAbrechnungslage(appointment.id);
  const minuten = Math.round(
    (Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60_000,
  );
  const position = lage ? positionText(lage) : null;
  const grundlage =
    lage?.treatment_basis_kind && lage.treatment_basis_issued_on
      ? (() => {
          const { bauart, praeposition } = grundlageBezeichnung({
            treatment_basis_kind: lage.treatment_basis_kind,
          });
          return `${bauart} ${praeposition} ${formatDate(lage.treatment_basis_issued_on)}`;
        })()
      : null;
  const ungedeckt = appointment.treatment_basis_covered === false;
  const fremdePerson = appointment.staff_member_id !== user.staffMemberId;
  const bestaetigt = appointment.status === 'confirmed';

  return (
    <div className="text-ink-muted mt-1 text-sm">
      <dl className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {bestaetigt ? (
          <div>
            <dt className="sr-only">Status</dt>
            <dd className="sr-only">{appointmentStatusLabels.confirmed}</dd>
          </div>
        ) : (
          <Glied label="Status" erstes>
            <Badge ton={appointmentStatusTon[appointment.status]}>
              {appointmentStatusLabels[appointment.status]}
            </Badge>
          </Glied>
        )}
        <Glied label="Datum" erstes={bestaetigt}>
          {tagMitWochentag(appointment.starts_at, zone)}
        </Glied>
        <Glied label="Zeit">
          <span className="tabular-nums">
            {formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}
          </span>
          <Laengenzeichen termin={appointment} />
        </Glied>
        <Glied label="Dauer">{`${minuten} min`}</Glied>
        {position || grundlage || ungedeckt ? (
          <Glied label="Grundlage" eigeneZeile>
            {[position, ungedeckt ? null : lage && position ? '✓ gedeckt' : null, grundlage]
              .filter(Boolean)
              .join(' · ')}
            <Deckungszeichen gedeckt={appointment.treatment_basis_covered} />
          </Glied>
        ) : null}
        {appointment.notification_channels.length > 0 ? (
          <Glied label="Mitgeteilt">
            <Mitteilungszeichen kanaele={appointment.notification_channels} />
          </Glied>
        ) : null}
        {appointment.completed_at ? (
          <div className="flex basis-full flex-wrap gap-x-1">
            <dt>Abgeschlossen am</dt>
            <dd className="text-ink">
              {formatLocalDate(appointment.completed_at, zone)},{' '}
              {formatLocalTime(appointment.completed_at, zone)} Uhr
            </dd>
          </div>
        ) : null}
        {fremdePerson ? (
          <div className="flex basis-full flex-wrap gap-x-1">
            <dt className="after:content-[':']">Behandelnde Person</dt>
            <dd className="text-ink">{staffName(appointment)}</dd>
          </div>
        ) : null}
      </dl>
      {ungedeckt && darfVerwalten && appointment.patient_id ? (
        <Textlink
          alleinstehend
          to={mitRueckweg(`/patienten/${appointment.patient_id}/termine-uebertragen`, zumTermin)}
        >
          Auf andere Grundlage übertragen
        </Textlink>
      ) : null}
      {hinweis ? <p className="mt-1">{hinweis}</p> : null}
    </div>
  );
}

/** Eine Zeile der Liste: Beschriftung links, Inhalt rechts, Linie dazwischen. */
export function Zeile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-line grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 border-t py-2 first:border-t-0 sm:grid-cols-[132px_minmax(0,1fr)]">
      <dt className="text-ink-muted pt-0.5 text-sm">{label}</dt>
      <dd className="text-ink text-liste min-w-0">{children}</dd>
    </div>
  );
}

/**
 * Was zum Termin gehört, als Zeilen statt Kacheln (Design-Handoff 2026-10-01,
 * Abschnitt 6, Zyklus 3): Anschrift mit „Navigation →", „Vor der Tür" (der
 * Kurzblick, erst auf Anforderung gelesen, ANN-137) und der Weg in den
 * Verlauf. Der Satz zur Datenübergabe der Navigation bleibt an ihr
 * (ADR-019 Punkt 23).
 */
export function TerminZeilen({
  appointment,
  darfKurzblick,
  darfVerlauf,
  zumTermin,
  children,
}: {
  appointment: Appointment;
  /** Darf die Rolle den Kurzblick lesen (canReadTreatmentNote)? */
  darfKurzblick: boolean;
  darfVerlauf: boolean;
  zumTermin: string;
  /** Weitere Zeilen, etwa Abschluss oder Absage. */
  children?: ReactNode;
}) {
  const art = appointment.appointment_type;
  const strasse = [appointment.visit_street, appointment.visit_house_number]
    .filter(Boolean)
    .join(' ');
  const ort = [appointment.visit_postal_code, appointment.visit_city].filter(Boolean).join(' ');
  const behandlung = appointment.kind === 'therapy';

  return (
    <dl className="border-line mt-5 border-y">
      <Zeile label={art === 'home_visit' ? 'Anschrift' : art === 'practice' ? 'Standort' : 'Ort'}>
        {art === 'home_visit' ? (
          strasse || ort ? (
            <div className="flex flex-wrap items-start justify-between gap-x-4">
              <address className="not-italic">
                {strasse ? <span>{strasse}</span> : null}
                {strasse && ort ? ', ' : null}
                {ort ? <span>{ort}</span> : null}
              </address>
              <span className="flex flex-col items-start">
                <NavigationZumTermin termin={appointment} textlink />
              </span>
              <span className="text-ink-muted basis-full text-xs leading-relaxed">
                Öffnet Google Maps im Fahrradmodus und übergibt nur die Anschrift ohne Namen – erst
                beim Tippen.
              </span>
            </div>
          ) : (
            '—'
          )
        ) : art === 'video' ? (
          <span>
            Videotermin
            <span className="text-ink-muted block text-sm">
              Für Videotermine wird noch kein Videolink erzeugt.
            </span>
          </span>
        ) : (
          <>
            <span className="text-accent font-semibold">{appointmentTypeHint(art)}termin</span> ·{' '}
            <span>{locationSummary(appointment)}</span>
          </>
        )}
      </Zeile>
      {behandlung && darfKurzblick ? (
        <Zeile label="Vor der Tür">
          <Kurzblick appointmentId={appointment.id} alsZeile />
        </Zeile>
      ) : null}
      {behandlung && darfVerlauf && appointment.patient_id ? (
        <Zeile label="Zuletzt">
          <Textlink
            alleinstehend
            to={mitRueckweg(`/patienten/${appointment.patient_id}/verlauf`, zumTermin)}
          >
            Verlauf →
          </Textlink>
        </Zeile>
      ) : null}
      {children}
    </dl>
  );
}
