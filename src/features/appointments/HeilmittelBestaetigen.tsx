import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
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

/** Was der Server gegen eine Bestätigung einwendet, als Satz für die Praxis. */
function erfassenFehler(fehler: Error): string {
  if (fehler instanceof KontingentAusgeschoepft) {
    return 'Die Grundlage ist bereits ausgeschöpft. Bitte im Büro klären, auf welche Grundlage der Termin gehört.';
  }
  if (fehler instanceof KeinTerminhonorar) {
    return 'Für diesen Tag gilt kein Terminhonorar. Bitte im Büro klären – die Praxisinhaber:in legt es in der Preisliste oder in der Akte fest.';
  }
  return fehler.message;
}

function Auswahl({
  appointment,
  stand,
  onBestaetigt,
  einTipp = false,
}: {
  appointment: Appointment;
  stand: LeistungenAmTermin;
  onBestaetigt: () => void;
  /**
   * Auf der Schreibseite nach dem Festschreiben (ANN-475): Auswahl und Folge
   * stehen über dem Knopf, ein Tipp bestätigt - ohne die Rückfrage des
   * Terminfensters.
   */
  einTipp?: boolean;
}) {
  const folgeId = useId();
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

  if (einTipp) {
    return (
      <div>
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">Geleistete Heilmittel</legend>
          {positionen.map((p) => (
            <Checkbox
              key={p.catalog_item_id}
              label={p.label}
              checked={gewaehlt.has(p.catalog_item_id)}
              disabled={erfassen.isPending}
              onChange={() => umschalten(p.catalog_item_id)}
            />
          ))}
        </fieldset>
        <Kontingent positionen={stand.basis_items} />
        {erfassen.isError ? (
          <Statusmeldung ton="fehler" className="mt-3">
            {erfassenFehler(erfassen.error)}
          </Statusmeldung>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Sekundär: Der eine Hauptknopf der Seite ist „Fertig". */}
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={ausgewaehlt.length === 0 || erfassen.isPending}
            aria-describedby={folgeId}
            onClick={() => {
              if (erfassen.isPending) return;
              erfassen.mutate(ausgewaehlt);
            }}
          >
            {erfassen.isPending ? 'Wird bestätigt …' : 'Heilmittel bestätigen'}
          </Button>
        </div>
        <Kleingedrucktes id={folgeId} className="mt-2">
          {ausgewaehlt.length === 0
            ? 'Mindestens ein Heilmittel auswählen.'
            : 'Die genutzte Menge der Grundlage zählt damit weiter. Korrigieren lässt sich das danach nur im Büro.'}
        </Kleingedrucktes>
      </div>
    );
  }

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
            fehler={erfassen.isError ? erfassenFehler(erfassen.error) : undefined}
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

/**
 * Heilmittel nach dem Festschreiben, auf der Schreibseite (Auftrag C1,
 * ANN-475): derselbe Weg wie im Terminfenster - `record_billable_services`
 * mit Dokumentationskopplung (§19), Kontingent und Schutz vor
 * Doppelerfassung (ADR-009 Punkt 4), wer darf, entscheidet der Server
 * (ANN-140). Anders ist nur die Bedienung: vorbelegt, ein Tipp. Ist schon
 * bestätigt, steht es als erledigt da (Leitfaden L3).
 *
 * Die Seite zeigt den Teil nur, wer an diesem Termin bestätigen darf
 * (`canRecordAtAppointment`); vor dem Festschreiben schweigt er.
 */
export function HeilmittelAmAbschluss({
  appointment,
  user,
}: {
  appointment: Appointment;
  user: CurrentUser;
}) {
  const erfassbar = appointment.status === 'documented';
  const stand = useQuery({
    queryKey: ['appointment', appointment.id, 'leistungen'],
    queryFn: () => fetchLeistungenAmTermin(appointment.id),
    enabled: erfassbar || appointment.status === 'invoiced',
    retry: false,
  });

  if (!erfassbar && appointment.status !== 'invoiced') return null;
  const daten = stand.data;
  // Ohne Recht liefert der Server keine Zeile: Dann gibt es hier nichts.
  if (daten === null) return null;

  return (
    <section aria-labelledby={`heilmittel-${appointment.id}`}>
      <Zwischentitel id={`heilmittel-${appointment.id}`}>Heilmittel</Zwischentitel>
      {stand.isPending ? <LoadingState label="Heilmittel werden geladen …" /> : null}
      {stand.isError ? (
        <ErrorState
          title="Die Heilmittel zu diesem Termin konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => stand.refetch()}
        />
      ) : null}
      {daten ? (
        daten.services.length > 0 ? (
          <div>
            <p className="text-accent text-liste font-semibold">
              <span aria-hidden="true">✓ </span>
              Bestätigt:{' '}
              {daten.services
                .map((s) => (s.quantity > 1 ? `${s.label} × ${s.quantity}` : s.label))
                .join(', ')}
            </p>
            {kontingentErreicht(daten.basis_items) ? <KontingentHinweis user={user} /> : null}
          </div>
        ) : daten.can_record && erfassbar ? (
          <Auswahl appointment={appointment} stand={daten} einTipp onBestaetigt={() => undefined} />
        ) : (
          <p className="text-ink-muted text-liste">Noch nicht bestätigt.</p>
        )
      ) : null}
    </section>
  );
}
