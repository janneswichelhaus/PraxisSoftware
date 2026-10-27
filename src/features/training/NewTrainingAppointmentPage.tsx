import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate, todayInTimeZone } from '@/lib/datum';
import { leseRueckweg } from '@/lib/rueckweg';
import { canWriteTrainingClients, type CurrentUser } from '@/features/core';
import { fensterEnde, leererTermin, tageslageNeuLaden } from '@/features/calendar';
import {
  createTrainingAppointment,
  listTrainingBases,
  listTrainingClients,
  vereinbarungText,
} from './api';
import { TrainingTerminFormular } from './TrainingTerminFormular';
import { leseTerminVorbelegung, TERMINFENSTER_MINUTEN, mitAngelegtemTermin } from '@/lib/termin';

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function kennungAus(suche: URLSearchParams, name: string): string {
  const roh = suche.get(name);
  return roh && KENNUNG.test(roh) ? roh : '';
}

/**
 * Einen Trainingstermin anlegen (TRN-004).
 *
 * Aus dem Kalender (Tag, Beginn und Person der angetippten Stelle) oder von
 * der Trainingskund:in (sie steht dann schon fest). Gewählt werden die
 * Kund:in - nur mit laufendem Vertrag - und, wenn es eine gibt, die
 * Vereinbarung. Ohne Vereinbarung ist es eine Einzelstunde (ADR-022 Punkt 5).
 *
 * Verbindlich prüft `create_training_appointment`: Rolle, Verhältnis,
 * Vereinbarung, Zuordnung, Raster, Arbeitszeit und Belegung über alle
 * Kontexte - eine Überschneidung heißt dort nur „belegt" (Punkt 11).
 */
export function NewTrainingAppointmentPage({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));
  const [kunde, setKunde] = useState(() => kennungAus(suche, 'kunde'));
  const [basis, setBasis] = useState(() => kennungAus(suche, 'basis'));
  const [kundeFehler, setKundeFehler] = useState<string | undefined>(undefined);
  const zurueck = leseRueckweg(suche, kunde ? `/training/${kunde}` : '/kalender');
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';

  const [startwerte] = useState(() => ({
    ...leererTermin,
    appointment_type: vorbelegung.art ?? 'practice',
    date: vorbelegung.datum ?? heute,
    start_time: vorbelegung.beginn ?? '',
    end_time: vorbelegung.beginn ? fensterEnde(vorbelegung.beginn, TERMINFENSTER_MINUTEN) : '',
    staff_member_id: vorbelegung.person ?? user.staffMemberId ?? '',
  }));

  const kundinnen = useQuery({
    queryKey: ['training-clients'],
    queryFn: listTrainingClients,
    retry: false,
  });
  const vereinbarungen = useQuery({
    queryKey: ['training-bases', kunde],
    queryFn: () => listTrainingBases(kunde),
    enabled: Boolean(kunde),
    retry: false,
  });

  if (!canWriteTrainingClients(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Trainingstermine planen owner, Trainingsbetreuung und Büro."
      />
    );
  }

  const laufende = (kundinnen.data ?? []).filter((k) => k.status === 'active');
  const offene = (vereinbarungen.data ?? []).filter((v) => v.status === 'active');

  return (
    <>
      <Rueckweg standard={zurueck} />
      {/* Kein Satz zu den Sternchen und keiner zum Kalender: Sie erklärten
          das Formular, nicht den Termin (UX-005g, Design-Rollout B3a). */}
      <PageHeader title="Trainingstermin anlegen" />

      <TrainingTerminFormular
        startwerte={startwerte}
        startMinuten={TERMINFENSTER_MINUTEN}
        heute={heute}
        rasterMinuten={user.appointmentGridMinutes}
        bereit={kunde !== ''}
        absendeText="Trainingstermin anlegen"
        laeuftText="Wird angelegt …"
        fehlerTitel="Der Trainingstermin konnte nicht angelegt werden."
        abbrechenZiel={zurueck}
        onSpeichern={(werte, b) =>
          createTrainingAppointment(kunde, werte, basis || null, b.bestaetigt, b.vergangenheit)
        }
        onGespeichert={(id) => {
          // UBK-011: Trainingstermine stehen in derselben Tagesroute (ADR-022).
          void tageslageNeuLaden(queryClient);
          void queryClient.invalidateQueries({ queryKey: ['training-bases'] });
          void queryClient.invalidateQueries({ queryKey: ['training-client-appointments'] });
          void navigate(
            suche.has('rueckweg') ? mitAngelegtemTermin(zurueck, id) : `/training/termine/${id}`,
            { replace: true },
          );
        }}
        vorFeldern={
          // Ein eigener Abschnitt vor den geteilten Feldern (Design-Rollout
          // B3a): wer und woran, dann „Person und Art“ und „Zeit und Ort“.
          <Section titel="Kund:in und Vereinbarung">
            <Feldgruppe>
              {kundinnen.isError ? (
                <ErrorState
                  title={`Die ${BEGRIFFE.trainingskundInnen} konnten nicht geladen werden.`}
                  description={VERBINDUNG_PRUEFEN}
                  onErneut={() => kundinnen.refetch()}
                />
              ) : (
                <Select
                  label={`${BEGRIFFE.trainingskundIn} *`}
                  feldId="trainingstermin-kunde"
                  value={kunde}
                  error={kundeFehler}
                  hint="Nur mit laufendem Vertrag."
                  onChange={(e) => {
                    setKunde(e.target.value);
                    setBasis('');
                    setKundeFehler(e.target.value ? undefined : 'Bitte eine Kund:in wählen.');
                  }}
                >
                  <option value="">
                    {kundinnen.isPending ? 'Wird geladen …' : 'Bitte wählen …'}
                  </option>
                  {laufende.map((k) => (
                    <option key={k.id} value={k.id}>
                      {`${k.family_name}, ${k.given_name}`}
                    </option>
                  ))}
                </Select>
              )}
              {kunde ? (
                <Select
                  label="Vereinbarung"
                  feldId="trainingstermin-vereinbarung"
                  value={basis}
                  hint="Ohne Vereinbarung ist es eine Einzelstunde."
                  onChange={(e) => setBasis(e.target.value)}
                >
                  <option value="">Einzelstunde ohne Vereinbarung</option>
                  {offene.map((v) => (
                    <option key={v.id} value={v.id}>
                      {`Seit ${formatDate(v.started_on)} · ${vereinbarungText(v)}`}
                    </option>
                  ))}
                </Select>
              ) : null}
            </Feldgruppe>
          </Section>
        }
      />
    </>
  );
}
