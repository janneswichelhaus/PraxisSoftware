import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { formatEuro } from '@/lib/geld';
import {
  fetchVorschlag,
  KeinKatalog,
  KeinTerminhonorar,
  KontingentAusgeschoepft,
  recordLeistungen,
  type Vorschlag,
} from '@/features/billing/api';
import { canRecordBillableServices, type CurrentUser } from '@/features/session/types';
import type { Appointment } from './api';
import {
  fetchLeistungenAmTermin,
  kontingentErreicht,
  type Grundlagenposition,
  type LeistungenAmTermin,
} from './leistungenAmTermin';

function Kontingent({ positionen }: { positionen: readonly Grundlagenposition[] | null }) {
  if (!positionen || positionen.length === 0) return null;
  return (
    <ul className="text-ink-muted mt-2 text-sm">
      {positionen.map((p) => (
        <li key={p.remedy}>
          {p.remedy}: {p.used_quantity} von {p.prescribed_quantity} genutzt
        </li>
      ))}
    </ul>
  );
}

/**
 * Hinweis, wenn die Grundlage verbraucht ist (IDEA-PRX-039).
 *
 * Eine Rechnung entsteht hier nie (ANN-140): abgerechnet wird im Büro,
 * monatlich je Person (ANN-077). Der Satz sagt das, damit niemand ein
 * Häkchen für eine Abrechnung hält.
 */
function KontingentHinweis({ user }: { user: CurrentUser }) {
  return (
    <div className="mt-3">
      <Statusmeldung ton="neutral">
        Die Grundlage ist damit ausgeschöpft. Eine Rechnung entsteht dabei nicht – abgerechnet wird
        im Büro.{' '}
        {canRecordBillableServices(user.roles) ? (
          <Textlink to="/abrechnung">Zur Abrechnung</Textlink>
        ) : null}
      </Statusmeldung>
    </div>
  );
}

function Erfasst({ stand, user }: { stand: LeistungenAmTermin; user: CurrentUser }) {
  return (
    <div>
      <ul className="text-ink text-liste">
        {stand.services.map((s) => (
          <li key={s.code}>
            {s.label}
            {s.quantity > 1 ? ` × ${s.quantity}` : ''}
            {s.status === 'invoiced' ? ' – abgerechnet' : ''}
          </li>
        ))}
      </ul>
      {stand.recorded_by_name ? (
        <p className="text-ink-muted mt-1 text-xs">Bestätigt von {stand.recorded_by_name}.</p>
      ) : null}
      {/* ABR-031: Das Honorar liefert der Server nur den Rollen der
          Abrechnung; für alle anderen bleibt die Zeile leer. */}
      {stand.session_fee_cents !== null ? (
        <p className="text-ink mt-2 text-sm">
          Terminhonorar{' '}
          <span className="font-medium tabular-nums">{formatEuro(stand.session_fee_cents)}</span>
        </p>
      ) : null}
      <Kontingent positionen={stand.basis_items} />
      {kontingentErreicht(stand.basis_items) ? <KontingentHinweis user={user} /> : null}
      {/* Zurücknehmen bleibt beim Büro (ANN-140) - und dort, unter den
          Leistungen, steht der Weg. Hier gibt es keinen zweiten Knopf. */}
      <p className="text-ink-muted mt-3 text-sm">
        Korrigieren lässt sich eine Bestätigung nur im Büro, solange noch keine Rechnung daran
        hängt.
      </p>
    </div>
  );
}

function Auswahl({
  appointment,
  stand,
  onBestaetigt,
}: {
  appointment: Appointment;
  stand: LeistungenAmTermin;
  onBestaetigt: () => void;
}) {
  const queryClient = useQueryClient();
  const vorschlag = useQuery({
    queryKey: ['appointment', appointment.id, 'leistungsvorschlag'],
    queryFn: () => fetchVorschlag(appointment.id),
    retry: false,
  });
  // `null`: noch nichts angefasst - dann gilt die Vorbelegung aus der Grundlage.
  const [auswahl, setAuswahl] = useState<Set<string> | null>(null);

  const erfassen = useMutation({
    mutationFn: (positionen: Vorschlag[]) =>
      recordLeistungen(
        appointment.id,
        positionen.map((p) => ({ catalog_item_id: p.catalog_item_id, quantity: 1 })),
      ),
    onSuccess: async () => {
      onBestaetigt();
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      // Die Arbeitslisten der Abrechnung zeigen den Termin nicht mehr als offen.
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-leistungen'] });
      await queryClient.invalidateQueries({ queryKey: ['abrechnung-offene-termine'] });
    },
  });

  if (vorschlag.isPending) return <LoadingState label="Heilmittel werden geladen …" />;
  if (vorschlag.isError) {
    return vorschlag.error instanceof KeinKatalog ? (
      <p className="text-ink-muted text-liste">
        Für diesen Tag ist keine Preisliste in Kraft. Die Heilmittel lassen sich bestätigen, sobald
        sie im Büro eingerichtet ist.
      </p>
    ) : (
      <ErrorState
        title="Die Heilmittel konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => vorschlag.refetch()}
      />
    );
  }

  const positionen = vorschlag.data;
  const gewaehlt =
    auswahl ?? new Set(positionen.filter((p) => p.suggested).map((p) => p.catalog_item_id));
  const ausgewaehlt = positionen.filter((p) => gewaehlt.has(p.catalog_item_id));
  const umschalten = (id: string) => {
    const neu = new Set(gewaehlt);
    if (neu.has(id)) neu.delete(id);
    else neu.add(id);
    setAuswahl(neu);
  };

  return (
    <div>
      <p className="text-ink-muted text-sm">
        Vorbelegt ist, was die Grundlage verordnet. Was nicht geleistet wurde, abwählen.
      </p>
      <fieldset className="mt-3 flex flex-col gap-2">
        <legend className="sr-only">Geleistete Heilmittel</legend>
        {positionen.map((p) => (
          <Checkbox
            key={p.catalog_item_id}
            label={p.label}
            checked={gewaehlt.has(p.catalog_item_id)}
            onChange={() => umschalten(p.catalog_item_id)}
          />
        ))}
      </fieldset>
      <Kontingent positionen={stand.basis_items} />
      <div className="mt-4">
        {ausgewaehlt.length === 0 ? (
          <p className="text-ink-muted text-sm">Mindestens ein Heilmittel auswählen.</p>
        ) : (
          <Rueckfrage
            ausloeser="Heilmittel bestätigen"
            bezeichnung="Heilmittel bestätigen"
            bestaetigen="Ja, so bestätigen"
            bestaetigenLaeuft="Wird bestätigt …"
            fehler={
              erfassen.isError
                ? erfassen.error instanceof KontingentAusgeschoepft
                  ? 'Die Grundlage ist bereits ausgeschöpft. Bitte im Büro klären, auf welche Grundlage der Termin gehört.'
                  : erfassen.error instanceof KeinTerminhonorar
                    ? 'Für diesen Tag gilt kein Terminhonorar. Bitte im Büro klären – die Praxisinhaber:in legt es in der Preisliste oder in der Akte fest.'
                    : erfassen.error.message
                : undefined
            }
            onBestaetigen={() => erfassen.mutateAsync(ausgewaehlt)}
            onAbbrechen={() => erfassen.reset()}
          >
            Bestätigt werden: {ausgewaehlt.map((p) => p.label).join(', ')}. Die genutzte Menge der
            Grundlage zählt damit weiter. Korrigieren lässt sich das danach nur im Büro.
          </Rueckfrage>
        )}
      </div>
    </div>
  );
}

/**
 * Termin abhaken: Heilmittel bestätigen (PRX-009, `IDEA-PRX-039`).
 *
 * Die Oberfläche der Leistungserfassung am Termin - kein zweiter Weg: Es
 * schreibt `record_billable_services` mit all seinen Regeln (nur aus
 * „dokumentiert" oder Gebührenanlass, Kontingent, einmal je Termin). Wer
 * darf, entscheidet der Server (ANN-140); die Seite zeigt den Abschnitt nur
 * denen, die es dürfen.
 */
export function HeilmittelBestaetigen({
  appointment,
  user,
}: {
  appointment: Appointment;
  user: CurrentUser;
}) {
  const [gemeldet, setGemeldet] = useState(false);
  // Nur die Behandlung: Ein Ausfallhonorar (Gebührenanlass) erfasst weiter
  // das Büro unter den Leistungen - dort steht es auch am Termin.
  const erfassbar = appointment.status === 'documented';
  const stand = useQuery({
    queryKey: ['appointment', appointment.id, 'leistungen'],
    queryFn: () => fetchLeistungenAmTermin(appointment.id),
    enabled: erfassbar || appointment.status === 'invoiced',
    retry: false,
  });

  // Vor der Dokumentation gibt es nichts zu bestätigen (§19, ANN-072) - und
  // der Abschnitt schweigt dann ganz. Ein Termin ohne Dokumentation ist
  // erlaubt (ANN-005); ein Hinweis „sobald die Dokumentation …“ läse sich als
  // Mangel (CAL-004, appointment-completion.spec.ts).
  if (!erfassbar && appointment.status !== 'invoiced') return null;

  return (
    <Section titel="Heilmittel">
      {gemeldet ? (
        <div className="mb-3">
          <Statusmeldung ton="erfolg">Heilmittel bestätigt.</Statusmeldung>
        </div>
      ) : null}
      {stand.isPending ? <LoadingState label="Heilmittel werden geladen …" /> : null}
      {stand.isError ? (
        <ErrorState
          title="Die Heilmittel zu diesem Termin konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => stand.refetch()}
        />
      ) : null}
      {stand.data ? (
        stand.data.services.length > 0 ? (
          <Erfasst stand={stand.data} user={user} />
        ) : stand.data.can_record && erfassbar ? (
          <Auswahl
            appointment={appointment}
            stand={stand.data}
            onBestaetigt={() => setGemeldet(true)}
          />
        ) : (
          <p className="text-ink-muted text-liste">Noch nicht bestätigt.</p>
        )
      ) : null}
    </Section>
  );
}
