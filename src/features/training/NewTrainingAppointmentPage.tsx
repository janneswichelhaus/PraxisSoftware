import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Select } from '@/components/ui/Select';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { leseRueckweg } from '@/lib/rueckweg';
import { canWriteTrainingClients, type CurrentUser } from '@/features/session/types';
import {
  fensterEnde,
  leererTermin,
  leseTerminVorbelegung,
  TERMINFENSTER_MINUTEN,
  todayInTimeZone,
} from '@/features/appointments/api';
import { mitAngelegtemTermin } from '@/features/appointments/terminformular';
import {
  createTrainingAppointment,
  listTrainingBases,
  listTrainingClients,
  vereinbarungText,
} from './api';
import { TrainingTerminFormular } from './TrainingTerminFormular';

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
      <PageHeader
        title="Trainingstermin anlegen"
        description="Ein Termin im gemeinsamen Kalender. Mit * markierte Felder sind erforderlich."
      />

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
          void queryClient.invalidateQueries({ queryKey: ['appointments'] });
          void queryClient.invalidateQueries({ queryKey: ['day-plan'] });
          void queryClient.invalidateQueries({ queryKey: ['training-bases'] });
          void queryClient.invalidateQueries({ queryKey: ['training-client-appointments'] });
          void navigate(
            suche.has('rueckweg') ? mitAngelegtemTermin(zurueck, id) : `/training/termine/${id}`,
            { replace: true },
          );
        }}
        vorFeldern={
          <div className="mb-6 flex flex-col gap-5">
            {kundinnen.isError ? (
              <ErrorState
                title={`Die ${BEGRIFFE.trainingskundInnen} konnten nicht geladen werden.`}
                description="Bitte die Verbindung prüfen und erneut versuchen."
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
          </div>
        }
      />
    </>
  );
}
