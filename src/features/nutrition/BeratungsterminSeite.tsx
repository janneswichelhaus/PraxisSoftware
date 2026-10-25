import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leererTermin, tageslageNeuLaden } from '@/features/appointments';
import type { CurrentUser } from '@/features/session/types';
import { TrainingTerminFormular } from '@/features/training/TrainingTerminFormular';
import { beratungsterminAnlegen, ernaehrungSchluessel, fetchErnaehrung } from './api';
import { ernaehrungsReiter, type Verhaeltnisart } from './eingabe';
import { todayInTimeZone } from '@/lib/datum';
import { kalenderZumTermin, TERMINFENSTER_MINUTEN } from '@/lib/termin';

/**
 * `…/ernaehrung/termin` - einen Beratungstermin anlegen (ERN-012, ANN-622).
 *
 * Am Verhältnis des laufenden Profils: an der Akte ein Termin der Behandlung,
 * am Trainingsverhältnis einer des Trainings (ADR-022 Punkt 2), mit dem
 * Anlass „Ernährungsberatung“. Dieselben Felder und Rückfragen wie jeder
 * Termin; zugeordnet wird, wer im Kalender des Bereichs geführt wird.
 * Verbindlich prüft `create_nutrition_appointment`: Fähigkeit, Profil,
 * Einwilligung, Raster, Arbeitszeit und Belegung.
 */
export function BeratungsterminSeite({ art, user }: { art: Verhaeltnisart; user: CurrentUser }) {
  const { patientId = '', relationshipId = '' } = useParams();
  const verhaeltnisId = art === 'treatment' ? patientId : relationshipId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zurueck = ernaehrungsReiter(art, verhaeltnisId);
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';
  const [startwerte] = useState(() => ({
    ...leererTermin,
    appointment_type: 'practice',
    date: heute,
    staff_member_id: user.staffMemberId ?? '',
  }));

  const abfrage = useQuery({
    queryKey: ernaehrungSchluessel(art, verhaeltnisId),
    queryFn: () => fetchErnaehrung(art, verhaeltnisId),
    retry: false,
    // Jedes Laden ist ein protokolliertes Öffnen des Verhältnisses.
    refetchOnWindowFocus: false,
  });

  return (
    <>
      <Rueckweg standard={zurueck} className="mb-3" />
      <PageHeader title="Beratungstermin anlegen" />
      {/* Laden, Fehler und Leer in der Breite des Formulars (DESIGN.md
          Seitentyp „Formular“), nicht über die ganze Seite. */}
      <div className="max-w-formular">
        <Abfragezustand
          abfrage={abfrage}
          laden="Die Ernährungsberatung wird geladen …"
          fehler="Die Ernährungsberatung konnte nicht geladen werden."
          inKarte
          leer={{
            wenn: (sicht) =>
              !sicht?.profile ||
              sicht.profile.ended_on !== null ||
              sicht.profile.consent?.state !== 'granted',
            titel: 'Keine laufende Ernährungsberatung mit Einwilligung',
            aktion: (
              <ButtonLink to={zurueck} variant="secondary">
                Zur Ernährung
              </ButtonLink>
            ),
          }}
        >
          {(sicht) => (
            <TrainingTerminFormular
              startwerte={startwerte}
              startMinuten={TERMINFENSTER_MINUTEN}
              heute={heute}
              rasterMinuten={user.appointmentGridMinutes}
              personenkreis={art === 'treatment' ? 'therapy' : 'training'}
              bezeichnung="Ungespeicherter Beratungstermin"
              hausbesuchHinweis={
                art === 'treatment'
                  ? 'Die Anschrift kommt aus der Akte – Straße mit Hausnummer, PLZ und Ort.'
                  : 'Die Anschrift kommt aus dem Kontakt der Trainingskund:in – Straße mit Hausnummer, PLZ und Ort.'
              }
              absendeText="Beratungstermin anlegen"
              laeuftText="Wird angelegt …"
              fehlerTitel="Der Beratungstermin konnte nicht angelegt werden."
              abbrechenZiel={zurueck}
              onSpeichern={(werte, b) =>
                beratungsterminAnlegen(sicht!.profile!.id, werte, b.bestaetigt, b.vergangenheit)
              }
              onGespeichert={(id) => {
                void tageslageNeuLaden(queryClient);
                void navigate(kalenderZumTermin(id), { replace: true });
              }}
            />
          )}
        </Abfragezustand>
      </div>
    </>
  );
}
