import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Segment, type Segmentwahl } from '@/components/ui/Segment';
import { Textlink } from '@/components/ui/Textlink';
import { kalenderZumTermin, todayInTimeZone } from '@/features/appointments/api';
import { leseAngelegtenTermin } from '@/features/appointments/terminformular';
import type { CurrentUser } from '@/features/session/types';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { Arbeitszeile } from './Arbeitszeile';
import { basisText, wishText } from './format';
import {
  fetchWaitlist,
  reasonLabels,
  waitingText,
  withdrawWaitlistEntry,
  type ListFilter,
  type WaitlistEntry,
} from './api';

const FILTER_WAHLEN: readonly Segmentwahl<ListFilter>[] = [
  { wert: 'open', text: 'Offen' },
  { wert: 'closed', text: 'Geschlossen' },
];

/** Die Nummern zum Anrufen - Textlinks auf `tel:`, je Nummer einer (B15). */
function PhoneLinks({ entry }: { entry: WaitlistEntry }) {
  const numbers = [entry.phone, entry.phone_mobile].filter((n): n is string => Boolean(n));
  if (numbers.length === 0) {
    return <p className="text-ink-muted mt-1 text-sm">Keine Telefonnummer hinterlegt</p>;
  }
  return (
    <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
      {numbers.map((number) => (
        <Textlink key={number} href={telHref(number)} alleinstehend>
          Anrufen: {number}
        </Textlink>
      ))}
    </p>
  );
}

function EntryItem({ entry, today }: { entry: WaitlistEntry; today: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | undefined>();
  const isOpen = entry.status === 'open';
  const here = '/warteliste';

  return (
    <Arbeitszeile
      titel={
        <Textlink to={`/patienten/${entry.patient_id}/termine`}>
          {entry.patient_family_name}, {entry.patient_given_name}
        </Textlink>
      }
      // Der Grund steht nur am offenen Eintrag; ein geschlossener sagt, wie
      // er geschlossen wurde.
      status={
        isOpen ? (
          <Badge>{reasonLabels[entry.priority_reason]}</Badge>
        ) : entry.status === 'placed' ? (
          <Badge ton="positiv">Eingeplant</Badge>
        ) : entry.status === 'withdrawn' ? (
          <Badge>Zurückgezogen</Badge>
        ) : undefined
      }
      meta={
        <>
          <span className="text-ink block">{wishText(entry)}</span>
          <span className="block">
            {[
              basisText(entry),
              isOpen ? `wartet ${waitingText(entry.created_at, today)}` : null,
              entry.earliest_on ? `frühestens ab ${formatDate(entry.earliest_on)}` : null,
              entry.needed_by ? `bis spätestens ${formatDate(entry.needed_by)}` : null,
              !isOpen && entry.closed_at
                ? `geschlossen am ${formatDate(entry.closed_at.slice(0, 10))}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </>
      }
      aktionen={
        isOpen ? (
          <>
            {/* Kein Hauptknopf je Zeile: Auf der Liste stehen mehrere
                Einträge, und genau ein Hauptknopf je Ansicht (DESIGN.md
                Regel 4) ist der im Kopf. */}
            <ButtonLink
              to={mitRueckweg(
                `/patienten/${entry.patient_id}/plaetze?warteliste=${entry.id}`,
                here,
              )}
              variant="secondary"
            >
              Freie Termine suchen
            </ButtonLink>
            <ButtonLink
              to={mitRueckweg(`/warteliste/${entry.id}/bearbeiten`, here)}
              variant="quiet"
            >
              Bearbeiten
            </ButtonLink>
            <Rueckfrage
              ausloeser="Von der Liste nehmen"
              ausloeserVariante="quiet"
              ausloeserGroesse="kompakt"
              bestaetigen="Von der Liste nehmen"
              bestaetigenLaeuft="Wird genommen …"
              fehler={error}
              onAbbrechen={() => setError(undefined)}
              onBestaetigen={async () => {
                try {
                  await withdrawWaitlistEntry(entry);
                  await queryClient.invalidateQueries({ queryKey: ['waitlist'] });
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : undefined);
                  throw caught;
                }
              }}
            >
              {entry.patient_given_name} {entry.patient_family_name} von der Warteliste nehmen? Der
              Eintrag bleibt unter „Geschlossen" sichtbar.
            </Rueckfrage>
          </>
        ) : entry.placed_appointment_id ? (
          <Textlink to={kalenderZumTermin(entry.placed_appointment_id)} alleinstehend>
            Zum Termin
          </Textlink>
        ) : undefined
      }
    >
      {entry.note ? <p className="text-ink mt-1 text-sm break-words">„{entry.note}"</p> : null}
      {isOpen ? <PhoneLinks entry={entry} /> : null}
    </Arbeitszeile>
  );
}

/**
 * Warteliste (PRX-001).
 *
 * Wer auf einen Termin wartet, mit Wunschzeiten, Dauer und organisatorischem
 * Grund (ANN-132). Geordnet nach „bis spätestens", dann nach Wartezeit — die
 * Reihenfolge kommt vom Server, die Seite sortiert nicht nach. Wird ein Platz
 * frei, ruft die Praxis an; die Nummer steht deshalb am Eintrag. Nichts wird
 * versendet (B15).
 */
export function WaitlistPage({ user }: { user: CurrentUser }) {
  const [filter, setFilter] = useState<ListFilter>('open');
  const [suche] = useSearchParams();
  /** Der Termin, mit dem ein Eintrag gerade eingeplant wurde (BEF-071). */
  const neuerTermin = leseAngelegtenTermin(suche);
  const today = todayInTimeZone(user.organizationTimeZone ?? 'Europe/Berlin');

  const abfrage = useQuery({
    queryKey: ['waitlist', filter],
    queryFn: () => fetchWaitlist(filter),
    retry: false,
  });

  return (
    <>
      {/* Seitentyp „Liste“ (DESIGN.md): „Eintragen“ kompakt neben dem Titel,
          die Ansicht als Segment, die Einträge als Zeilen. */}
      <PageHeader
        title="Warteliste"
        actions={<ButtonLink to="/warteliste/neu">Eintragen</ButtonLink>}
      />

      {neuerTermin ? (
        <Rueckmeldung className="mb-4">
          Termin angelegt – der Eintrag ist eingeplant und steht unter „Geschlossen“.{' '}
          <Textlink to={kalenderZumTermin(neuerTermin)}>Termin öffnen</Textlink>
        </Rueckmeldung>
      ) : null}

      <div className="mb-4">
        <Segment
          beschriftung="Einträge anzeigen"
          wahlen={FILTER_WAHLEN}
          gewaehlt={filter}
          onWaehlen={setFilter}
        />
      </div>

      <Abfragezustand
        abfrage={abfrage}
        laden="Warteliste wird geladen …"
        fehler="Die Warteliste konnte nicht geladen werden."
        inKarte
        leer={{
          wenn: (eintraege) => eintraege.length === 0,
          titel: filter === 'open' ? 'Niemand wartet' : 'Noch nichts geschlossen',
          beschreibung:
            filter === 'open'
              ? 'Eintragen lässt sich hier oder aus der Akte.'
              : 'Eingeplante und zurückgezogene Einträge erscheinen hier.',
        }}
      >
        {(eintraege) => (
          <ListRows>
            {eintraege.map((entry) => (
              <EntryItem key={entry.id} entry={entry} today={today} />
            ))}
          </ListRows>
        )}
      </Abfragezustand>

      {/* Was die Seite nicht tut, steht am Ende - nicht im Kopf (B15). */}
      <Kleingedrucktes className="mt-8">
        Wird ein Platz frei, zeigt die Absage die passenden Einträge. Angerufen wird von hier;
        versendet wird nichts.
      </Kleingedrucktes>
    </>
  );
}
