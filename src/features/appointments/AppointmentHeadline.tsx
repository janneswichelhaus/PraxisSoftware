import { Badge } from '@/components/ui/Badge';
import type { CurrentUser } from '@/features/session/types';
import { Laengenzeichen } from './Laengenzeichen';
import { Mitteilungszeichen } from './Mitteilungszeichen';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  staffName,
  type Appointment,
} from './api';

/**
 * Die Zeile unter dem Titel eines Termins (UX-005a).
 *
 * Jannes: „Das es sich um Max Mustermann handelt ist doch so oder so schon
 * klar. Das steht in der Überschrift." Bis UX-005a wiederholte eine Tabelle
 * darunter den Namen, nannte die behandelnde Person auch der Person selbst,
 * „Hausbesuch" auch in einer Hausbesuchspraxis und „Bestätigt" auch dort, wo
 * es nichts zu bestätigen gab - und Datum und Zeit standen erst in Zeile
 * sechs und sieben.
 *
 * Hier steht, was einen Termin ausmacht, in einer Zeile: der Tag, die Zeit,
 * das Zeichen einer abweichenden Länge (CAL-020), der Zustand - nur wenn er
 * vom Regelfall abweicht - und die Zeichen der Mitteilung (CAL-012). Die
 * behandelnde Person steht nur da, wenn sie nicht die Person ist, die gerade
 * liest: Für Anna an ihrem eigenen Termin ist das klar, für das Büro nicht.
 *
 * Für Vorlesesoftware bleibt jede Angabe beschriftet (`dt`/`dd`), auch die,
 * die sichtbar ohne Beschriftung auskommt - und der Zustand „Bestätigt" steht
 * dort als Wort, wo die Seite ihn sichtbar nicht wiederholt.
 */
export function AppointmentHeadline({
  appointment,
  user,
}: {
  appointment: Appointment;
  user: CurrentUser;
}) {
  const zone = appointment.organization_time_zone;
  const istEreignis = appointment.kind === 'internal';
  const bestaetigt = appointment.status === 'confirmed';
  // Die eigene Person weiß, wer behandelt (ANN-193). Ein Patientenkonto hat
  // keine Beschäftigtenkennung und sieht die Person immer.
  const fremdePerson = appointment.staff_member_id !== user.staffMemberId;

  return (
    // Nur `div`-Gruppen direkt im `dl` (WCAG, axe „definition-list"): Der
    // Punkt zwischen Tag und Zeit steht deshalb in der Gruppe des Tages.
    <dl className="text-ink text-liste flex flex-wrap items-center gap-x-2 gap-y-1">
      <div className="flex items-center gap-2">
        <dt className="sr-only">Datum</dt>
        <dd className="font-medium">{formatLocalDate(appointment.starts_at, zone)}</dd>
        <span aria-hidden="true" className="text-ink-muted">
          ·
        </span>
      </div>
      <div>
        <dt className="sr-only">Zeit</dt>
        <dd className="flex items-center gap-1.5 font-medium tabular-nums">
          {formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}
          <Laengenzeichen termin={appointment} />
        </dd>
      </div>
      <div>
        <dt className="sr-only">Status</dt>
        <dd>
          {bestaetigt ? (
            <span className="sr-only">{appointmentStatusLabels.confirmed}</span>
          ) : (
            <Badge ton={appointmentStatusTon[appointment.status]}>
              {appointmentStatusLabels[appointment.status]}
            </Badge>
          )}
        </dd>
      </div>
      {/* Die Mitteilungswege als Zeichen (CAL-012): Zettel, Telefon, persönlich,
          E-Mail - dort, wo man hinsieht, nicht in einem Abschnitt weiter unten.
          Kein Zeichen heißt: noch nicht mitgeteilt oder seit der Mitteilung
          geändert. */}
      {!istEreignis && appointment.notification_channels.length > 0 ? (
        <div>
          <dt className="sr-only">Mitgeteilt</dt>
          <dd>
            <Mitteilungszeichen kanaele={appointment.notification_channels} />
          </dd>
        </div>
      ) : null}
      {appointment.completed_at ? (
        <div className="flex basis-full flex-wrap gap-x-1">
          <dt className="text-ink-muted">Abgeschlossen am</dt>
          <dd>
            {formatLocalDate(appointment.completed_at, zone)},{' '}
            {formatLocalTime(appointment.completed_at, zone)} Uhr
          </dd>
        </div>
      ) : null}
      {!istEreignis && fremdePerson ? (
        <div className="flex basis-full flex-wrap gap-x-1">
          {/* Der Doppelpunkt kommt aus dem Stil: Die Beschriftung bleibt für
              die Prüfungen das Wort allein. */}
          <dt className="text-ink-muted after:content-[':']">Behandelnde Person</dt>
          <dd>{staffName(appointment)}</dd>
        </div>
      ) : null}
    </dl>
  );
}
