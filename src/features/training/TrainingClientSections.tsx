import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  formatLocalTimeRange,
} from '@/features/appointments/api';
import {
  createTrainingBasis,
  listTrainingBases,
  listTrainingClientAppointments,
  setTrainingBasisConcluded,
  vereinbarungText,
  type TrainingBasis,
  type TrainingClient,
} from './api';

function kurzesDatum(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: zone,
  }).format(new Date(iso));
}

/**
 * Die Termine einer Trainingskund:in (TRN-006).
 *
 * Ab 30 Tagen zurück, nur Trainingstermine - eine Behandlung derselben Person
 * steht hier nie, auch nicht für owner (ADR-021 Punkt 3). Die Liste gehört zur
 * protokollierten Detailansicht (ANN-175).
 */
export function TrainingTermine({
  kundin,
  zeitzone,
  darfPlanen,
}: {
  kundin: TrainingClient;
  zeitzone: string;
  darfPlanen: boolean;
}) {
  const hier = `/training/${kundin.id}`;
  const termine = useQuery({
    queryKey: ['training-client-appointments', kundin.id],
    queryFn: () => listTrainingClientAppointments(kundin.id),
    retry: false,
  });

  return (
    <Section
      titel="Termine"
      rahmen
      aktion={
        darfPlanen && kundin.status === 'active' ? (
          <ButtonLink
            to={mitRueckweg(`/training/termine/neu?kunde=${kundin.id}`, hier)}
            variant="secondary"
            groesse="kompakt"
          >
            Termin anlegen
          </ButtonLink>
        ) : null
      }
    >
      {termine.isPending ? (
        <LoadingState label="Termine werden geladen …" />
      ) : termine.isError ? (
        <ErrorState
          title="Die Termine konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => termine.refetch()}
        />
      ) : termine.data.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Termine in den letzten 30 Tagen und danach.</p>
      ) : (
        <ul className="divide-line flex flex-col divide-y">
          {termine.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <Link
                className="text-accent hover:underline"
                to={mitRueckweg(`/training/termine/${t.id}`, hier)}
              >
                {kurzesDatum(t.starts_at, zeitzone)},{' '}
                {formatLocalTimeRange(t.starts_at, t.ends_at, zeitzone)}
              </Link>
              <span className="text-ink-muted flex items-center gap-2 text-sm">
                {/* Nur eine abweichende Terminart steht dran (ANN-192, UX-005i). */}
                {appointmentTypeHint(t.appointment_type)
                  ? `${appointmentTypeHint(t.appointment_type)} · `
                  : ''}
                {t.staff_given_name}
                {t.status === 'confirmed' ? null : (
                  <Badge ton={appointmentStatusTon[t.status]}>
                    {appointmentStatusLabels[t.status]}
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/**
 * Vereinbarungen im Training (TRN-005, ADR-022 Punkt 5).
 *
 * Die Klammer über eine Anzahl Einheiten - oder ohne feste Anzahl. Keine
 * Sperre, wenn sie erreicht ist (ANN-179): Die Zahl ist eine Anzeige.
 * Abschließen heißt „keine neuen Termine daran"; wieder öffnen geht, solange
 * der Vertrag läuft.
 */
export function TrainingVereinbarungen({
  kundin,
  darfSchreiben,
}: {
  kundin: TrainingClient;
  darfSchreiben: boolean;
}) {
  const [neu, setNeu] = useState(false);
  const liste = useQuery({
    queryKey: ['training-bases', kundin.id],
    queryFn: () => listTrainingBases(kundin.id),
    retry: false,
  });
  const laeuft = kundin.status === 'active';

  return (
    <Section
      titel="Vereinbarungen"
      rahmen
      aktion={
        darfSchreiben && laeuft && !neu ? (
          <Button type="button" variant="secondary" groesse="kompakt" onClick={() => setNeu(true)}>
            Vereinbarung anlegen
          </Button>
        ) : null
      }
    >
      {neu ? <NeueVereinbarung kundin={kundin} onFertig={() => setNeu(false)} /> : null}
      {liste.isPending ? (
        <LoadingState label="Vereinbarungen werden geladen …" />
      ) : liste.isError ? (
        <ErrorState
          title="Die Vereinbarungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => liste.refetch()}
        />
      ) : liste.data.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Vereinbarung – Termine sind Einzelstunden.</p>
      ) : (
        <ul className="divide-line flex flex-col divide-y">
          {liste.data.map((v) => (
            <Vereinbarung
              key={v.id}
              vereinbarung={v}
              kundin={kundin}
              darfSchreiben={darfSchreiben && (v.status === 'active' || laeuft)}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

function Vereinbarung({
  vereinbarung,
  kundin,
  darfSchreiben,
}: {
  vereinbarung: TrainingBasis;
  kundin: TrainingClient;
  darfSchreiben: boolean;
}) {
  const queryClient = useQueryClient();
  const offen = vereinbarung.status === 'active';
  const mutation = useMutation({
    mutationFn: () => setTrainingBasisConcluded(vereinbarung.id, offen),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-bases', kundin.id] });
    },
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="text-ink text-sm font-medium">Seit {formatDate(vereinbarung.started_on)}</p>
        <p className="text-ink-muted text-sm">{vereinbarungText(vereinbarung)}</p>
      </div>
      <div className="flex items-center gap-3">
        {offen ? null : <Badge>Abgeschlossen</Badge>}
        {darfSchreiben ? (
          <Rueckfrage
            ausloeser={offen ? 'Abschließen' : 'Wieder öffnen'}
            ausloeserVariante="quiet"
            bestaetigen={offen ? 'Vereinbarung abschließen' : 'Wieder öffnen'}
            bestaetigenLaeuft="Wird gespeichert …"
            fehler={mutation.isError ? mutation.error.message : undefined}
            laeuft={mutation.isPending}
            onBestaetigen={() => mutation.mutateAsync()}
          >
            <p>
              {offen
                ? 'An eine abgeschlossene Vereinbarung lassen sich keine neuen Termine hängen. Die geplanten bleiben, wie sie sind.'
                : 'Die Vereinbarung läuft wieder; neue Termine lassen sich daran planen.'}
            </p>
          </Rueckfrage>
        ) : null}
      </div>
    </li>
  );
}

function NeueVereinbarung({ kundin, onFertig }: { kundin: TrainingClient; onFertig: () => void }) {
  const queryClient = useQueryClient();
  const [beginn, setBeginn] = useState('');
  const [anzahl, setAnzahl] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () =>
      createTrainingBasis(kundin.id, beginn || null, anzahl ? Number(anzahl) : null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-bases', kundin.id] });
      onFertig();
    },
  });

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    if (anzahl && !/^\d+$/.test(anzahl)) {
      setFehler('Bitte eine ganze Zahl zwischen 1 und 200 eingeben – oder leer lassen.');
      return;
    }
    const zahl = anzahl ? Number(anzahl) : null;
    if (zahl !== null && (zahl < 1 || zahl > 200)) {
      setFehler('Bitte eine ganze Zahl zwischen 1 und 200 eingeben – oder leer lassen.');
      return;
    }
    setFehler(undefined);
    mutation.mutate();
  }

  return (
    <form onSubmit={absenden} noValidate className="border-line mb-4 border-b pb-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[10rem] flex-1">
          <Field
            label="Beginn"
            type="date"
            hint="Leer heißt heute."
            value={beginn}
            onChange={(e) => setBeginn(e.target.value)}
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <Field
            label="Vereinbarte Einheiten"
            inputMode="numeric"
            hint="Leer heißt ohne feste Anzahl."
            value={anzahl}
            error={fehler}
            onChange={(e) => {
              setAnzahl(e.target.value.trim());
              setFehler(undefined);
            }}
          />
        </div>
      </div>
      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {mutation.error.message}
        </Statusmeldung>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" groesse="kompakt" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wird angelegt …' : 'Vereinbarung anlegen'}
        </Button>
        <Button type="button" variant="secondary" groesse="kompakt" onClick={onFertig}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
