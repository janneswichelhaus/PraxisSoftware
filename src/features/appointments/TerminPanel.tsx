import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Textlink } from '@/components/ui/Textlink';
import { mitRueckweg } from '@/lib/rueckweg';
import { BEGRIFFE } from '@/lib/begriffe';
import {
  canManageAppointments,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { Laengenzeichen } from './Laengenzeichen';
import { TerminAbschliessenKnopf } from './TerminAbschliessen';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  dokuOffen,
  fetchAppointment,
  formatLocalTimeRange,
  terminBezeichnung,
  terminPfad,
  type CalendarEntry,
} from './api';

/** „Do 01.10.2026" in der Zeit der Praxis. */
function tagKurz(iso: string, zone: string): string {
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

/**
 * Das Terminpanel nach einem Tipp auf die Kachel (Design-Handoff 2026-10-01,
 * Abschnitt 7a): Kicker, Name, Zeit, Ort, Zustand - und die beiden Handgriffe
 * des Tages, Haken und „Doku", ohne den Kalender zu verlassen.
 *
 * Am fremden Termin gibt es weder Haken noch „Doku" - wer wessen Termin
 * abschließt, bleibt eine Sache der behandelnden Person; der Termin selbst ist
 * einen Tipp entfernt. Die Anschrift kommt aus der Termindetailansicht
 * (`appointment_directory`), dieselbe Quelle wie die Terminseite; der
 * Kalender selbst liefert sie nicht (Datensparsamkeit, CAL-002).
 *
 * Am Telefon ein Blatt über der Tableiste, am Rechner eine Karte unten
 * rechts - auch ab 1200 px, statt einer festen Spalte (ANN-202). Escape und
 * × schließen.
 */
export function TerminPanel({
  eintrag,
  user,
  rueckweg,
  onSchliessen,
}: {
  eintrag: CalendarEntry;
  user: CurrentUser;
  /** Der Kalenderstand - der Weg zurück aus Termin und Schreibseite. */
  rueckweg: string;
  onSchliessen: () => void;
}) {
  const zone = user.organizationTimeZone ?? 'Europe/Berlin';
  const titelRef = useRef<HTMLHeadingElement>(null);
  const [meldung, setMeldung] = useState<{ ton: 'erfolg' | 'fehler'; text: string } | null>(null);

  const detail = useQuery({
    queryKey: ['appointment', eintrag.id],
    queryFn: () => fetchAppointment(eintrag.id),
    enabled: eintrag.kind !== 'training',
    retry: false,
  });

  useEffect(() => {
    titelRef.current?.focus();
    setMeldung(null);
  }, [eintrag.id]);

  const behandlung = eintrag.kind === 'therapy' && eintrag.patient_id !== null;
  const eigener = user.staffMemberId !== null && eintrag.staff_member_id === user.staffMemberId;
  const offen = dokuOffen(eintrag);
  const darfHaken =
    behandlung && eigener && eintrag.status === 'confirmed' && canManageAppointments(user.roles);
  const darfDoku =
    behandlung &&
    eigener &&
    canWriteTreatmentNote(user.roles) &&
    (eintrag.status === 'confirmed' || offen);
  const art =
    eintrag.kind === 'internal'
      ? BEGRIFFE.fehlzeit
      : eintrag.kind === 'training'
        ? 'Training'
        : 'Termin';

  const termin = detail.data;
  const anschrift =
    termin && termin.appointment_type === 'home_visit'
      ? [
          [termin.visit_street, termin.visit_house_number].filter(Boolean).join(' '),
          [termin.visit_postal_code, termin.visit_city].filter(Boolean).join(' '),
        ]
          .filter(Boolean)
          .join(', ')
      : eintrag.appointment_type === 'practice'
        ? eintrag.location_name
        : null;

  return (
    <section
      aria-labelledby="terminpanel-titel"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onSchliessen();
      }}
      className="border-line-strong bg-surface nicht-drucken max-sm:rounded-t-card sm:rounded-card fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-40 max-h-[70dvh] overflow-y-auto border-t px-4 pt-3 pb-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] sm:border"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-ink-muted tracking-label text-xs font-semibold uppercase">
            {art} · {tagKurz(eintrag.starts_at, zone)}
          </p>
          <h2
            id="terminpanel-titel"
            ref={titelRef}
            tabIndex={-1}
            className="text-h4 mt-0.5 font-bold outline-none"
          >
            {behandlung ? (
              <Link
                to={mitRueckweg(`/patienten/${eintrag.patient_id}`, rueckweg)}
                className="text-accent underline decoration-2 underline-offset-4 hover:no-underline"
              >
                {terminBezeichnung(eintrag)}
              </Link>
            ) : (
              <span className="text-ink">{terminBezeichnung(eintrag)}</span>
            )}
          </h2>
        </div>
        <Symbolknopf beschriftung="Terminpanel schließen" onClick={onSchliessen}>
          <span className="text-xl leading-none">×</span>
        </Symbolknopf>
      </div>

      <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-1.5 text-sm tabular-nums">
        {formatLocalTimeRange(eintrag.starts_at, eintrag.ends_at, zone)}
        <Laengenzeichen termin={eintrag} />
      </p>
      {anschrift ? <p className="text-ink mt-1 text-sm">{anschrift}</p> : null}
      {/* Am fremden Termin die behandelnde Person (Abschnitt 7a). */}
      {!eigener ? (
        <p className="text-ink-muted mt-1 text-sm">
          Behandelnde Person: {eintrag.staff_given_name} {eintrag.staff_family_name}
        </p>
      ) : null}

      {eintrag.status !== 'confirmed' || offen ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {eintrag.status !== 'confirmed' ? (
            <Badge ton={appointmentStatusTon[eintrag.status]}>
              {appointmentStatusLabels[eintrag.status]}
            </Badge>
          ) : null}
          {offen ? <Badge ton="warnung">Doku offen</Badge> : null}
        </div>
      ) : null}

      {meldung ? (
        <Statusmeldung ton={meldung.ton} className="mt-2">
          {meldung.text}
        </Statusmeldung>
      ) : null}

      {darfHaken || darfDoku ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {darfHaken ? (
            <TerminAbschliessenKnopf
              appointmentId={eintrag.id}
              {...(termin ? { stand: termin.updated_at } : {})}
              variant="primary"
              onAbgeschlossen={() =>
                setMeldung({
                  ton: 'erfolg',
                  text: canWriteTreatmentNote(user.roles)
                    ? 'Termin abgeschlossen. Doku offen.'
                    : 'Termin abgeschlossen.',
                })
              }
              onFehler={(text) => setMeldung({ ton: 'fehler', text })}
            />
          ) : null}
          {darfDoku ? (
            <ButtonLink
              to={mitRueckweg(`/termine/${eintrag.id}/abschluss`, rueckweg)}
              variant={offen ? 'primary' : 'secondary'}
              groesse="kompakt"
            >
              Doku <span className="sr-only">schreiben</span>
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-x-4">
        {behandlung && canReadTreatmentNote(user.roles) ? (
          <Textlink
            alleinstehend
            to={mitRueckweg(`/patienten/${eintrag.patient_id}/verlauf`, rueckweg)}
          >
            Bisherige Doku →
          </Textlink>
        ) : null}
        <Textlink alleinstehend to={mitRueckweg(terminPfad(eintrag), rueckweg)}>
          {eintrag.kind === 'internal' ? 'Fehlzeit →' : 'Termin →'}
        </Textlink>
      </div>
    </section>
  );
}
