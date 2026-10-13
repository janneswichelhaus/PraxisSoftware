import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  dayKey,
  formatLocalDate,
  formatLocalTimeRange,
  todayInTimeZone,
} from '@/features/appointments/api';
import {
  createTrainingBasis,
  listTrainingBases,
  listTrainingClientAppointments,
  setTrainingBasisConcluded,
  vereinbarungText,
  type TrainingBasis,
  type TrainingClient,
  type TrainingClientAppointment,
} from './api';

/** „10:00–11:00 Uhr · Video · Tom" - eine abweichende Art steht dabei (ANN-192). */
function terminMeta(termin: TrainingClientAppointment, zone: string): string {
  return [
    formatLocalTimeRange(termin.starts_at, termin.ends_at, zone),
    appointmentTypeHint(termin.appointment_type),
    termin.staff_given_name,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Eine Terminzeile: der ganze Eintrag führt zum Trainingstermin. */
function Terminzeile({
  termin,
  zone,
  hier,
}: {
  termin: TrainingClientAppointment;
  zone: string;
  hier: string;
}) {
  return (
    <ListRow
      to={mitRueckweg(`/training/termine/${termin.id}`, hier)}
      titel={formatLocalDate(termin.starts_at, zone)}
      meta={terminMeta(termin, zone)}
      gedaempft={termin.status === 'cancelled'}
      // „Bestätigt" ist der Regelfall und trägt kein Abzeichen (UX-005i).
      status={
        termin.status === 'confirmed' ? undefined : (
          <Badge ton={appointmentStatusTon[termin.status]}>
            {appointmentStatusLabels[termin.status]}
          </Badge>
        )
      }
    />
  );
}

/**
 * Die Termine einer Trainingskund:in (TRN-006).
 *
 * Ab 30 Tagen zurück, nur Trainingstermine - eine Behandlung derselben Person
 * steht hier nie, auch nicht für owner (ADR-021 Punkt 3). Die Liste gehört zur
 * protokollierten Detailansicht (ANN-175).
 *
 * Seit dem Design-Rollout (Welle B3a) nach dem Vorbild der Akte: oben der
 * nächste Termin und die laufende Vereinbarung als Kacheln, dann „Kommende
 * Termine", das Vergangene zugeklappt. Dieselbe Abfrage wie bisher, nur
 * geteilt nach „schon vorbei" und „kommt noch". „Termin anlegen" steht im
 * Kopf der Seite.
 */
export function TrainingTermine({
  kundin,
  zeitzone,
}: {
  kundin: TrainingClient;
  zeitzone: string;
}) {
  const hier = `/training/${kundin.id}`;
  const termine = useQuery({
    queryKey: ['training-client-appointments', kundin.id],
    queryFn: () => listTrainingClientAppointments(kundin.id),
    retry: false,
  });

  return (
    <Abfragezustand
      abfrage={termine}
      laden="Termine werden geladen …"
      fehler="Die Termine konnten nicht geladen werden."
      inKarte
      kacheln={2}
    >
      {(liste) => {
        const jetzt = Date.now();
        const kommend = liste.filter((t) => Date.parse(t.ends_at) >= jetzt);
        // Neueste zuerst, wie in der Akte.
        const vergangen = liste.filter((t) => Date.parse(t.ends_at) < jetzt).reverse();
        const naechster = kommend.find((t) => t.status === 'confirmed') ?? null;
        return (
          <>
            <Terminkacheln kundin={kundin} naechster={naechster} zone={zeitzone} />
            <Section titel="Kommende Termine">
              {kommend.length === 0 ? (
                <EmptyState inKarte title="Kein Termin geplant." />
              ) : (
                <ListRows>
                  {kommend.map((t) => (
                    <Terminzeile key={t.id} termin={t} zone={zeitzone} hier={hier} />
                  ))}
                </ListRows>
              )}
            </Section>
            {/* Was war, zugeklappt in einer Karte - wie in der Akte. Die
                Liste reicht 30 Tage zurück. */}
            {vergangen.length > 0 ? (
              <div className="mt-8">
                <Disclosure
                  inKarte
                  kopf="label"
                  anzahl={vergangen.length}
                  summary={<h2>Vergangene Termine</h2>}
                >
                  <ListRows rahmen={false}>
                    {vergangen.map((t) => (
                      <Terminzeile key={t.id} termin={t} zone={zeitzone} hier={hier} />
                    ))}
                  </ListRows>
                </Disclosure>
              </div>
            ) : null}
          </>
        );
      }}
    </Abfragezustand>
  );
}

/**
 * Nächster Termin und laufende Vereinbarung als Kacheln (Design-Handoff
 * 2026-10-01, Abschnitt 7; wie „Nächster Termin" und „Grundlage" der Akte).
 * Die Vereinbarungen kommen aus derselben Abfrage wie im Reiter „Verträge".
 */
function Terminkacheln({
  kundin,
  naechster,
  zone,
}: {
  kundin: TrainingClient;
  naechster: TrainingClientAppointment | null;
  zone: string;
}) {
  const vereinbarungen = useQuery({
    queryKey: ['training-bases', kundin.id],
    queryFn: () => listTrainingBases(kundin.id),
    retry: false,
  });
  const laufend = vereinbarungen.data?.find((v) => v.status === 'active') ?? null;
  if (!naechster && !laufend) return null;
  const heute = todayInTimeZone(zone);

  return (
    <div className="mb-6">
      <TileGrid spalte="kachel">
        {naechster ? (
          <Tile
            label="Nächster Termin"
            ton="akzent"
            zusatz={[appointmentTypeHint(naechster.appointment_type), naechster.staff_given_name]
              .filter(Boolean)
              .join(' · ')}
          >
            {dayKey(naechster.starts_at, zone) === heute
              ? 'Heute'
              : formatLocalDate(naechster.starts_at, zone)}
            <span className="block tabular-nums">
              {formatLocalTimeRange(naechster.starts_at, naechster.ends_at, zone)}
            </span>
          </Tile>
        ) : null}
        {laufend ? (
          <Tile label="Vereinbarung" zusatz={`Seit ${formatDate(laufend.started_on)}`}>
            {vereinbarungText(laufend)}
          </Tile>
        ) : null}
      </TileGrid>
    </div>
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
      aktion={
        darfSchreiben && laeuft && !neu ? (
          <Button type="button" variant="secondary" groesse="kompakt" onClick={() => setNeu(true)}>
            Vereinbarung anlegen
          </Button>
        ) : null
      }
    >
      {neu ? <NeueVereinbarung kundin={kundin} onFertig={() => setNeu(false)} /> : null}
      <Abfragezustand
        abfrage={liste}
        laden="Vereinbarungen werden geladen …"
        fehler="Die Vereinbarungen konnten nicht geladen werden."
        inKarte
        leer={{
          wenn: (daten) => daten.length === 0,
          titel: 'Keine Vereinbarung – Termine sind Einzelstunden.',
        }}
      >
        {(daten) => (
          <ListRows>
            {daten.map((v) => (
              <Vereinbarung
                key={v.id}
                vereinbarung={v}
                kundin={kundin}
                darfSchreiben={darfSchreiben && (v.status === 'active' || laeuft)}
              />
            ))}
          </ListRows>
        )}
      </Abfragezustand>
    </Section>
  );
}

/**
 * Eine Vereinbarung als Zeile. Ihr Vorgang öffnet eine Rückfrage an Ort und
 * Stelle, die über die volle Breite der Zeile aufgeht - deshalb eine eigene
 * Zeile im Raster der `ListRow` statt ihres `aktion`-Platzes.
 */
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
    <li className="border-line flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-2 first:border-t-0">
      <div className="min-w-0">
        <p
          className={`text-base ${offen ? 'text-ink font-semibold' : 'text-ink-muted font-medium'}`}
        >
          Seit {formatDate(vereinbarung.started_on)}
        </p>
        <p className="text-ink-muted text-sm">{vereinbarungText(vereinbarung)}</p>
      </div>
      <div className="flex items-center gap-2">
        {offen ? null : <Badge>Abgeschlossen</Badge>}
        {darfSchreiben ? (
          <Rueckfrage
            ausloeser={offen ? 'Abschließen' : 'Wieder öffnen'}
            ausloeserVariante="quiet"
            ausloeserGroesse="kompakt"
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
    // Ein Formular über der Liste, ohne eigenen Kasten (Leitfaden L2): Felder
    // sind ohnehin weiß; eine Linie trennt es von den Zeilen darunter.
    <form
      onSubmit={absenden}
      noValidate
      aria-label="Vereinbarung anlegen"
      className="border-line max-w-formular mb-6 border-b pb-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <Field
          label="Beginn"
          type="date"
          hint="Leer heißt heute."
          value={beginn}
          onChange={(e) => setBeginn(e.target.value)}
        />
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
      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {mutation.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wird angelegt …' : 'Vereinbarung anlegen'}
        </Button>
        <Button type="button" variant="quiet" onClick={onFertig}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
