import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { fetchPatient, fullName } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { ArbeitszeitRueckfrage, UebernommeneAdresse } from './AppointmentFormFields';
import {
  appointmentTypeLabels,
  checkAppointmentSlots,
  createAppointmentSeries,
  fensterEnde,
  fetchAssignableTherapists,
  fetchLocations,
  fetchPrescriptionSlots,
  istAusserhalbArbeitszeit,
  istHinderlich,
  slotConflictLabels,
  TERMINFENSTER_MINUTEN,
  todayInTimeZone,
  type AppointmentFormValues,
  type AppointmentType,
  type SlotConflict,
} from './api';
import {
  SERIE_HOECHSTZAHL,
  rhythmen,
  serienTermine,
  type Rhythmus,
  type Serientermin,
} from './serie';

/**
 * Terminserie aus einer Verordnung (CAL-007).
 *
 * Der Vorgang hat zwei Schritte, und das ist Absicht: erst ein Vorschlag aus
 * Rhythmus und Anzahl, dann eine Liste, in der jeder Termin einzeln
 * verschiebbar ist. Die Serie ist serverseitig alles oder nichts — ohne die
 * Zwischenansicht hieße ein Feiertag in Woche drei: Meldung lesen und raten.
 *
 * Die Rhythmusrechnung steht in `serie.ts` und ist deterministisch (§6.2). Die
 * Konfliktprüfung macht ausschließlich der Server; was hier steht, ist ihre
 * Darstellung (ADR-004).
 */
export function AppointmentSeriesPage({ user }: { user: CurrentUser }) {
  const { patientId, prescriptionId } = useParams<{
    patientId: string;
    prescriptionId: string;
  }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const praxisZeitzone = user.organizationTimeZone;
  const heute = praxisZeitzone ? todayInTimeZone(praxisZeitzone) : '';

  const [staffMemberId, setStaffMemberId] = useState('');
  const [art, setArt] = useState<AppointmentType>('home_visit');
  const [locationId, setLocationId] = useState('');
  const [ersterTag, setErsterTag] = useState(heute);
  const [beginn, setBeginn] = useState('');
  const [rhythmus, setRhythmus] = useState<Rhythmus>('woechentlich');
  const [anzahl, setAnzahl] = useState(1);

  /** Die Liste, sobald ein Vorschlag steht. `null` heißt „noch keiner". */
  const [liste, setListe] = useState<Serientermin[] | null>(null);
  /** Befunde zur aktuellen Liste. `null` heißt „noch nicht geprüft". */
  const [befunde, setBefunde] = useState<(SlotConflict | null)[] | null>(null);
  const [formFehler, setFormFehler] = useState<string | null>(null);

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const kontingent = useQuery({
    queryKey: ['prescription-slots', prescriptionId],
    queryFn: () => fetchPrescriptionSlots(prescriptionId!),
    enabled: Boolean(prescriptionId),
    retry: false,
  });

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // „Ich" als behandelnde Person, sobald feststeht, wer zuordenbar ist — wie
  // im Terminformular (UX-003).
  useEffect(() => {
    const zuordenbar = therapeuten.data;
    if (!zuordenbar || staffMemberId !== '') return;
    const ich = zuordenbar.find((t) => t.staff_member_id === user.staffMemberId);
    if (ich) setStaffMemberId(ich.staff_member_id);
  }, [therapeuten.data, user.staffMemberId, staffMemberId]);

  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) setLocationId((bisher) => (bisher === '' ? nurEiner.id : bisher));
  }, [standorte.data]);

  // Das offene Kontingent ist der Vorschlag für die Anzahl — genau dafür schlägt
  // man eine Verordnung im Alltag auf.
  const offen = kontingent.data?.remaining ?? 0;
  useEffect(() => {
    if (offen > 0) setAnzahl(Math.min(offen, SERIE_HOECHSTZAHL));
  }, [offen]);

  const pruefung = useMutation({
    mutationFn: (termine: Serientermin[]) => checkAppointmentSlots(staffMemberId, termine),
    onSuccess: setBefunde,
  });

  const anlegen = useMutation({
    mutationFn: (eingabe: { termine: Serientermin[]; bestaetigt: boolean }) => {
      const werte: AppointmentFormValues = {
        staff_member_id: staffMemberId,
        appointment_type: art,
        date: eingabe.termine[0]?.datum ?? '',
        start_time: eingabe.termine[0]?.beginn ?? '',
        end_time: fensterEnde(eingabe.termine[0]?.beginn ?? ''),
        location_id: locationId,
      };
      return createAppointmentSeries(
        patientId!,
        prescriptionId!,
        werte,
        eingabe.termine,
        eingabe.bestaetigt,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['patient-upcoming', patientId] });
      void navigate(`/patienten/${patientId}`, { replace: true });
    },
  });

  /** Jede Änderung an der Liste macht den Befund gegenstandslos. */
  function listeSetzen(neu: Serientermin[] | null) {
    setListe(neu);
    setBefunde(null);
    if (anlegen.isError) anlegen.reset();
  }

  function vorschlagen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (staffMemberId === '') return setFormFehler('Bitte eine behandelnde Person wählen.');
    if (art === 'practice' && locationId === '') {
      return setFormFehler('Für Praxistermine ist ein Standort erforderlich.');
    }
    if (!ersterTag) return setFormFehler('Bitte den ersten Termin datieren.');
    if (!beginn) return setFormFehler('Bitte einen Beginn wählen.');
    if (fensterEnde(beginn) === '') {
      return setFormFehler('Ein Termin, der über Mitternacht reicht, ist nicht planbar.');
    }

    setFormFehler(null);
    const termine = serienTermine(ersterTag, beginn, rhythmus, anzahl);
    listeSetzen(termine);
    pruefung.mutate(termine);
  }

  function zeileSetzen(index: number, feld: 'datum' | 'beginn', wert: string) {
    if (!liste) return;
    listeSetzen(liste.map((t, i) => (i === index ? { ...t, [feld]: wert } : t)));
  }

  function zeileEntfernen(index: number) {
    if (!liste) return;
    listeSetzen(liste.filter((_, i) => i !== index));
  }

  function absenden(bestaetigt: boolean) {
    if (!liste || liste.length === 0 || anlegen.isPending) return;
    anlegen.mutate({ termine: liste, bestaetigt });
  }

  if (patient.isPending || kontingent.isPending) {
    return <LoadingState label="Verordnung wird geladen …" />;
  }
  if (patient.isError || !patient.data || kontingent.isError || !kontingent.data) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Diese Verordnung existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  const patientDaten = patient.data;
  const zahlen = kontingent.data;
  const geprueft = befunde !== null && liste !== null && befunde.length === liste.length;
  const hindernisse = geprueft ? befunde.filter(istHinderlich).length : 0;
  const randzeiten = geprueft ? befunde.filter((b) => b === 'outside_working_hours').length : 0;

  return (
    <>
      <Link
        to={`/patienten/${patientDaten.id}`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Akte
      </Link>

      <PageHeader
        title="Terminserie anlegen"
        description={`Für ${fullName(patientDaten)}. Die Serie entsteht in einem Vorgang — entweder alle Termine oder keiner.`}
      />

      <Section titel="Kontingent der Verordnung">
        <DetailList>
          <DetailRow label="Verordnet">{zahlen.prescribed} Behandlungen</DetailRow>
          <DetailRow label="Genutzt">{zahlen.used}</DetailRow>
          <DetailRow label="Bereits verplant">{zahlen.planned}</DetailRow>
          <DetailRow label="Offen">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-ink text-[0.9375rem]">{zahlen.remaining}</span>
              {zahlen.remaining === 0 ? <Badge ton="neutral">Kontingent ausgeschöpft</Badge> : null}
            </span>
          </DetailRow>
          {zahlen.frequency_note ? (
            <DetailRow label="Frequenz laut Verordnung">{zahlen.frequency_note}</DetailRow>
          ) : null}
        </DetailList>
      </Section>

      <form onSubmit={vorschlagen} noValidate className="mt-8 max-w-xl">
        <Section titel="Rhythmus" ebene={3}>
          <div className="flex flex-col gap-5">
            <Select
              label="Behandelnde Person *"
              value={staffMemberId}
              onChange={(e) => {
                setStaffMemberId(e.target.value);
                listeSetzen(null);
              }}
            >
              <option value="">Bitte wählen …</option>
              {(therapeuten.data ?? []).map((t) => (
                <option key={t.staff_member_id} value={t.staff_member_id}>
                  {t.display_name}
                </option>
              ))}
            </Select>

            <Select
              label="Terminart *"
              value={art}
              onChange={(e) => setArt(e.target.value as AppointmentType)}
            >
              {(Object.keys(appointmentTypeLabels) as AppointmentType[]).map((typ) => (
                <option key={typ} value={typ}>
                  {appointmentTypeLabels[typ]}
                </option>
              ))}
            </Select>

            {art === 'practice' ? (
              <Select
                label="Standort *"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">Bitte wählen …</option>
                {(standorte.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            ) : null}

            {art === 'home_visit' ? (
              <UebernommeneAdresse
                street={patientDaten.street}
                houseNumber={patientDaten.house_number}
                postalCode={patientDaten.postal_code}
                city={patientDaten.city}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:items-end">
              <Field
                label="Erster Termin am *"
                type="date"
                value={ersterTag}
                min={heute || undefined}
                onChange={(e) => setErsterTag(e.target.value)}
              />
              <Field
                label="Beginn *"
                type="time"
                value={beginn}
                step={user.appointmentGridMinutes ? user.appointmentGridMinutes * 60 : undefined}
                hint={
                  user.appointmentGridMinutes
                    ? `Praxisraster: ${user.appointmentGridMinutes} Minuten · Fenster: ${TERMINFENSTER_MINUTEN} Minuten`
                    : `Terminfenster: ${TERMINFENSTER_MINUTEN} Minuten`
                }
                onChange={(e) => setBeginn(e.target.value)}
              />
            </div>

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
                label="Anzahl Termine *"
                type="number"
                inputMode="numeric"
                min={1}
                max={SERIE_HOECHSTZAHL}
                value={String(anzahl)}
                hint={`Vorgeschlagen ist das offene Kontingent. Höchstens ${SERIE_HOECHSTZAHL} je Vorgang.`}
                onChange={(e) => setAnzahl(Number(e.target.value))}
              />
            </div>

            {anzahl > zahlen.remaining ? (
              <Statusmeldung ton="warnung">
                Geplant sind {anzahl} Termine, offen sind {zahlen.remaining}. Das ist zulässig — die
                Verordnung deckt dann nicht alle Termine ab.
              </Statusmeldung>
            ) : null}

            {formFehler ? <Statusmeldung ton="fehler">{formFehler}</Statusmeldung> : null}

            <div>
              <Button type="submit" variant="secondary" disabled={pruefung.isPending}>
                {pruefung.isPending ? 'Wird geprüft …' : 'Termine vorschlagen'}
              </Button>
            </div>
          </div>
        </Section>
      </form>

      {liste ? (
        <Section titel={`Vorgeschlagene Termine (${liste.length})`} ebene={3}>
          {pruefung.isError ? (
            <div className="mb-4">
              <ErrorState
                title="Die Termine konnten nicht geprüft werden."
                description={pruefung.error.message}
              />
            </div>
          ) : null}

          {liste.length === 0 ? (
            <Statusmeldung>
              Es ist kein Termin mehr übrig. Bitte oben einen neuen Vorschlag erzeugen.
            </Statusmeldung>
          ) : (
            <ul className="flex flex-col gap-3">
              {liste.map((termin, index) => {
                const befund = geprueft ? befunde[index] : null;
                return (
                  <li
                    key={`${index}-${termin.datum}`}
                    className="border-line bg-surface rounded-card border p-4"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <p className="text-ink-muted min-w-8 pb-2 text-sm">{index + 1}.</p>
                      <div className="min-w-40 flex-1">
                        <Field
                          label={`Datum ${index + 1}`}
                          type="date"
                          value={termin.datum}
                          min={heute || undefined}
                          onChange={(e) => zeileSetzen(index, 'datum', e.target.value)}
                        />
                      </div>
                      <div className="min-w-28 flex-1">
                        <Field
                          label={`Beginn ${index + 1}`}
                          type="time"
                          step={
                            user.appointmentGridMinutes
                              ? user.appointmentGridMinutes * 60
                              : undefined
                          }
                          value={termin.beginn}
                          onChange={(e) => zeileSetzen(index, 'beginn', e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        className={kartenAktionKlassen('secondary')}
                        onClick={() => zeileEntfernen(index)}
                      >
                        Entfernen
                      </button>
                    </div>
                    <p className="text-ink-subtle mt-2 text-xs">
                      bis {fensterEnde(termin.beginn) || '—'} Uhr
                    </p>
                    {befund ? (
                      <div className="mt-2">
                        <Badge ton={istHinderlich(befund) ? 'kritisch' : 'warnung'}>
                          {slotConflictLabels[befund]}
                        </Badge>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {liste.length > 0 ? (
            <div className="mt-6 flex flex-col gap-3">
              {!geprueft ? (
                <Statusmeldung ton="warnung">
                  Die Liste wurde geändert und ist noch nicht geprüft.
                </Statusmeldung>
              ) : hindernisse > 0 ? (
                <Statusmeldung ton="fehler">
                  {hindernisse} von {liste.length} Terminen sind so nicht planbar. Weil die Serie
                  alles oder nichts ist, muss jeder davon erst geändert oder entfernt werden.
                </Statusmeldung>
              ) : randzeiten > 0 ? (
                <Statusmeldung ton="warnung">
                  {randzeiten} Termine liegen außerhalb der hinterlegten Arbeitszeit. Das Anlegen
                  fragt dann noch einmal nach.
                </Statusmeldung>
              ) : (
                <Statusmeldung>Alle {liste.length} Termine sind planbar.</Statusmeldung>
              )}

              {istAusserhalbArbeitszeit(anlegen.error) ? (
                <ArbeitszeitRueckfrage
                  onBestaetigen={() => absenden(true)}
                  laeuft={anlegen.isPending}
                  beschriftung="Serie trotzdem anlegen"
                />
              ) : anlegen.isError ? (
                <ErrorState
                  title="Die Terminserie konnte nicht angelegt werden."
                  description={anlegen.error.message}
                />
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => absenden(false)}
                  disabled={anlegen.isPending || !geprueft || hindernisse > 0}
                >
                  {anlegen.isPending ? 'Wird angelegt …' : `${liste.length} Termine anlegen`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pruefung.isPending}
                  onClick={() => pruefung.mutate(liste)}
                >
                  Erneut prüfen
                </Button>
              </div>
            </div>
          ) : null}
        </Section>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Jeder Termin der Serie ist danach ein eigener Termin mit eigenem Zustand — eine Absage
        betrifft nur ihn. Es werden ausschließlich organisatorische Angaben erfasst.
      </p>
    </>
  );
}
