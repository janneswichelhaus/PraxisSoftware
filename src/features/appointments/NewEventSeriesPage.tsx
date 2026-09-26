import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { EreignisArbeitszeitRueckfrage, EreignisFormFields } from './EreignisFormFields';
import { fetchStaffMembers } from '@/features/staff/api';
import { leseRueckweg } from '@/lib/rueckweg';
import {
  createEventSeries,
  ereignisFormSchema,
  fetchLocations,
  istAusserhalbArbeitszeit,
  leseTerminVorbelegung,
  todayInTimeZone,
  type EreignisFormValues,
} from './api';
import { SERIE_HOECHSTZAHL, rhythmen, serienTermine, type Rhythmus } from './serie';

/**
 * Dauerfehlzeit eintragen (CAL-021).
 *
 * Eine Fehlzeit ist ein Ereignis: Teammeeting, Achtsamkeitspuffer, Kaffeezeit
 * mit Kolleg:in. Sie belegt Zeit im Kalender, sie ist ausdrücklich **keine
 * Behandlung** (`PROJECT_PRINCIPLES.md` §8.1) und erzeugt nie eine
 * abrechenbare Leistung (§19). Die Dauerfehlzeit ist dieselbe Fehlzeit über
 * mehrere Wochen.
 *
 * Bewusst dasselbe Formular wie beim einzelnen Ereignis, ergänzt um Rhythmus
 * und Anzahl: Es fragt dieselben Dinge, und ein zweites Ereignisformular
 * daneben wäre eine zweite Wahrheit über dieselbe Sache.
 *
 * Die Tage rechnet `serienTermine` - dieselbe deterministische Rechnung und
 * dieselben drei Rhythmen wie bei der Terminserie (CAL-007, §6.2). Was daraus
 * wird, entscheidet `create_event_series`: alles oder nichts, mit derselben
 * Prüfung auf Raster, Arbeitszeit und Überschneidung wie bei jedem Termin.
 */
type Feld = keyof EreignisFormValues;

const leer: EreignisFormValues = {
  title: '',
  staff_member_ids: [],
  appointment_type: 'practice',
  date: '',
  start_time: '',
  end_time: '',
  location_id: '',
};

/** „1 Fehlzeit" gegen „6 Fehlzeiten" - an einer Stelle statt in jeder Meldung. */
function fehlzeitenWort(anzahl: number): string {
  return anzahl === 1 ? '1 Fehlzeit' : `${anzahl} Fehlzeiten`;
}

export function NewEventSeriesPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, '/kalender');

  // Tag und Zeiten kommen aus der aufgezogenen Spanne im Kalender, wenn der
  // Weg von dort kam (CAL-019). Der Tag ist dann der erste der Serie.
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));

  const [werte, setWerte] = useState<EreignisFormValues>(() => ({
    ...leer,
    date:
      vorbelegung.datum ??
      (user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : ''),
    start_time: vorbelegung.beginn ?? '',
    end_time: vorbelegung.ende ?? '',
    // Die Person aus der angetippten Spalte, sonst die eigene: Wer im
    // Kalender von Anna eine Spanne aufzieht, meint Anna (CAL-019).
    staff_member_ids: vorbelegung.person
      ? [vorbelegung.person]
      : user.staffMemberId
        ? [user.staffMemberId]
        : [],
  }));
  const [rhythmus, setRhythmus] = useState<Rhythmus>('woechentlich');
  const [anzahl, setAnzahl] = useState(6);
  const [fehler, setFehler] = useState<Partial<Record<Feld, string>>>({});

  const personen = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    retry: false,
  });
  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Bei genau einem verfügbaren Standort darf vorausgewählt werden - eine
  // Auswahl ohne Alternative ist keine Entscheidung (FIX-013).
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      setWerte((bisher) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher,
      );
    }
  }, [standorte.data]);

  const tage = serienTermine(werte.date, werte.start_time, rhythmus, anzahl).map((t) => t.datum);

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: EreignisFormValues; tage: string[]; bestaetigt: boolean }) =>
      createEventSeries(eingabe.werte, eingabe.tage, eingabe.bestaetigt),
    onSuccess: async () => {
      // Kalender und Tagesplan führen die Zeiträume sonst weiter als frei.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      void navigate(zurueck, { replace: true });
    },
  });

  function setzen<F extends Feld>(feld: F, wert: EreignisFormValues[F]) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    if (mutation.isError) mutation.reset();
  }

  function absenden(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;

    const ergebnis = ereignisFormSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gesammelt: Partial<Record<Feld, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as Feld | undefined;
        if (feld && !gesammelt[feld]) gesammelt[feld] = problem.message;
      }
      setFehler(gesammelt);
      return;
    }

    setFehler({});
    mutation.mutate({ werte: ergebnis.data, tage, bestaetigt: false });
  }

  if (!canManageAppointments(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Termine und Fehlzeiten eintragen dürfen die Rollen der Terminverwaltung."
      />
    );
  }

  if (personen.isPending || standorte.isPending) {
    return <LoadingState label="Formular wird vorbereitet …" />;
  }

  const aktive = (personen.data ?? []).filter((p) => p.employment_status === 'active');
  const ausserhalb = mutation.isError && istAusserhalbArbeitszeit(mutation.error);

  return (
    <>
      <Rueckweg standard="/kalender" />

      <PageHeader
        title="Dauerfehlzeit eintragen"
        description="Dieselbe Fehlzeit über mehrere Wochen – Teammeeting, Puffer, Pause. Ohne Patient:in und ohne Verordnung; es entsteht keine Behandlungsleistung."
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        <EreignisFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          standorte={standorte.data ?? []}
          zeitzone={user.organizationTimeZone}
          rasterMinuten={user.appointmentGridMinutes}
          datumBeschriftung="Erste Fehlzeit am *"
          beteiligte={
            <fieldset>
              <legend className="text-ink text-sm font-medium">Beteiligte Personen *</legend>
              <p className="text-ink-muted mt-1 text-sm">
                Die Fehlzeit belegt den Zeitraum in jedem gewählten Kalender.
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {aktive.map((person) => (
                  <Checkbox
                    key={person.id}
                    label={`${person.given_name} ${person.family_name}`}
                    checked={werte.staff_member_ids.includes(person.id)}
                    onChange={(e) =>
                      setzen(
                        'staff_member_ids',
                        e.target.checked
                          ? [...werte.staff_member_ids, person.id]
                          : werte.staff_member_ids.filter((id) => id !== person.id),
                      )
                    }
                  />
                ))}
              </div>
              {fehler.staff_member_ids ? (
                <p className="text-danger mt-2 text-xs">{fehler.staff_member_ids}</p>
              ) : null}
            </fieldset>
          }
        />

        <Section titel="Wiederholung" ebene={3}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-end">
            <Select
              label="Rhythmus *"
              value={rhythmus}
              onChange={(e) => setRhythmus(e.target.value as Rhythmus)}
            >
              {(Object.keys(rhythmen) as Rhythmus[]).map((key) => (
                <option key={key} value={key}>
                  {rhythmen[key].label}
                </option>
              ))}
            </Select>
            <Field
              label="Anzahl Fehlzeiten *"
              type="number"
              inputMode="numeric"
              min={1}
              max={SERIE_HOECHSTZAHL}
              value={String(anzahl)}
              hint={`Höchstens ${SERIE_HOECHSTZAHL} je Vorgang.`}
              onChange={(e) => setAnzahl(Number(e.target.value))}
            />
          </div>

          {/* Die Tage stehen vor dem Eintragen da: Die Serie ist serverseitig
              alles oder nichts, und ohne diese Liste hieße ein Feiertag in
              Woche drei „Meldung lesen und raten" (wie bei CAL-007). */}
          {tage.length > 0 ? (
            <div className="mt-5">
              <p className="text-ink text-sm font-medium">
                {fehlzeitenWort(tage.length)}
                {werte.start_time && werte.end_time
                  ? `, jeweils ${werte.start_time}–${werte.end_time} Uhr`
                  : ''}
              </p>
              <ul className="text-ink-muted mt-2 flex flex-col gap-1 text-sm">
                {tage.map((tag) => (
                  <li key={tag}>{formatDate(tag)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        {ausserhalb ? (
          <EreignisArbeitszeitRueckfrage
            beschriftung="Trotzdem eintragen"
            laeuft={mutation.isPending}
            onBestaetigen={() => {
              const ergebnis = ereignisFormSchema.safeParse(werte);
              if (!ergebnis.success) return;
              mutation.mutate({ werte: ergebnis.data, tage, bestaetigt: true });
            }}
            onAbbrechen={() => mutation.reset()}
          />
        ) : null}

        {mutation.isError && !ausserhalb ? (
          <Statusmeldung ton="fehler" className="mt-5">
            {mutation.error.message}
          </Statusmeldung>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird eingetragen …' : `${fehlzeitenWort(tage.length)} eintragen`}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </>
  );
}
