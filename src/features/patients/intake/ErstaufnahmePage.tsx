import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState } from '@/components/ui/Feedback';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { erhebungenQueryKey, fetchErhebungen } from '@/features/clinical/assessments/api';
import { erhebenPfad } from '@/features/clinical/assessments/darstellung';
import { erhebbareInstrumente } from '@/features/clinical/assessments/instrumente';
import { AnmeldebogenFoto, Datenschutz } from '@/features/privacy/datenschutz/Anmeldebogen';
import { PrescriptionPhoto } from '@/features/patients/files/PrescriptionPhoto';
import { fetchIntakeChecklist } from '@/features/patients/intake/api';
import { fetchPatient, type Patient } from '@/features/patients/api';
import { Behandlungsliege } from '@/features/patients/Behandlungsliege';
import {
  canReadPatientDirectory,
  canWriteQuestionnaire,
  canWriteTreatmentBases,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/core/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { erstaufnahmePfad, erstaufnahmestand, istAnamnese, type Schrittstand } from './stand';

/**
 * Erstaufnahme, geführt (Bereichsüberholung „Erstaufnahme geführt“, K10).
 *
 * Am ersten Besuch auf einer Seite, von oben nach unten: Verordnung
 * fotografieren, Anmeldebogen fotografieren, Einwilligungen, Anamnesebogen,
 * Behandlungsliege - danach mit einem Tipp zur Doku des Termins, wo der
 * Befund aus Bausteinen entsteht. Bis dahin lagen die fünf Dinge an vier
 * Orten (Termin, Kopf der Akte, Stammdaten, Doku) und nichts erinnerte an die
 * Reihenfolge.
 *
 * Die Seite hält keinen eigenen Zustand (ANN-542): Jeder Schritt zeigt, was
 * in der Akte steht, und wird mit den Bausteinen erledigt, die es dafür schon
 * gibt - `PrescriptionPhoto`, `AnmeldebogenFoto`, die Einwilligungskarte, die
 * Erhebung und `Behandlungsliege`. Rechte prüft jeweils der Server (ADR-004);
 * was eine Rolle nicht darf, steht hier nur als Zustand da.
 *
 * Außerhalb des Aktenrahmens wie die Erhebung (UX-009): Ein halbes Foto oder
 * ein offenes Einwilligungsfenster soll kein Tipp auf die Reiterleiste
 * verwerfen.
 */
export function ErstaufnahmePage({ user }: { user: CurrentUser }) {
  const { patientId = '' } = useParams<{ patientId: string }>();
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: patientId !== '',
    retry: false,
  });
  const [suche] = useSearchParams();
  const zurueck = leseRueckweg(suche, `/patienten/${patientId}`);

  return (
    <>
      <Rueckweg standard={zurueck} />
      <Abfragezustand
        abfrage={patient}
        laden="Erstaufnahme wird geladen …"
        fehler="Die Erstaufnahme konnte nicht geladen werden."
      >
        {(daten) =>
          daten ? (
            <Schritte patient={daten} user={user} zurueck={zurueck} />
          ) : (
            <>
              <PageHeader title="Erstaufnahme" />
              <ErrorState
                title="Nicht gefunden"
                description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
              />
            </>
          )
        }
      </Abfragezustand>
    </>
  );
}

function Schritte({
  patient,
  user,
  zurueck,
}: {
  patient: Patient;
  user: CurrentUser;
  zurueck: string;
}) {
  const queryClient = useQueryClient();
  const [suche] = useSearchParams();
  const terminId = suche.get('termin');
  // Derselbe Schlüssel wie Kopf der Akte, Tagesliste und Büroliste: Ein Foto
  // hier erledigt den Punkt überall zugleich.
  const checkliste = useQuery({
    queryKey: ['open-points', 'intake', patient.id],
    queryFn: () => fetchIntakeChecklist(patient.id),
    retry: false,
  });
  // Den Anamnesebogen führt nur, wer ihn erheben darf (die behandelnden
  // Rollen): Für das Büro wäre er ein „offen“, das es nie erledigen kann.
  // Ohne Abfrage auch kein Leseeintrag im Protokoll.
  const darfBogenLesen = canWriteQuestionnaire(user.roles);
  const erhebungen = useQuery({
    queryKey: erhebungenQueryKey(patient.id),
    queryFn: () => fetchErhebungen(patient.id),
    enabled: darfBogenLesen,
    retry: false,
  });

  const stand = erstaufnahmestand({
    checkliste: checkliste.data ?? [],
    erhebungen: darfBogenLesen ? (erhebungen.data ?? []) : null,
    liege: patient.treatment_table_required ?? null,
  });
  // Solange die Checkliste lädt, ist ein Punkt nicht „offen“, sondern unbekannt.
  const checklisteDa = checkliste.data !== undefined;
  const erhebungenDa = !darfBogenLesen || erhebungen.data !== undefined;

  const hier = mitRueckweg(erstaufnahmePfad(patient.id, terminId), zurueck);
  const nachFoto = () => void queryClient.invalidateQueries({ queryKey: ['open-points'] });
  const anamnese = erhebbareInstrumente().find((score) => istAnamnese(score.meta.id));
  const entwurf = (erhebungen.data ?? []).find(
    (e) => istAnamnese(e.instrument_id) && e.status === 'entwurf',
  );
  const name = `${patient.given_name} ${patient.family_name}`;
  const offen =
    checklisteDa && erhebungenDa
      ? stand.offen === 0
        ? 'alles erledigt'
        : `noch ${stand.offen} offen`
      : null;

  return (
    <>
      <PageHeader title="Erstaufnahme" description={offen ? `${name} · ${offen}` : name} />
      <div className="max-w-spalte">
        {/* Ohne Stand kein „offen“: Scheitert eine Abfrage, sagt die Seite das
            oben, statt Schritte ohne Zustand stehen zu lassen (Regel 8). */}
        {(checkliste.isError && !checklisteDa) || (erhebungen.isError && !erhebungenDa) ? (
          <div className="mb-8">
            <ErrorState
              title="Der Stand der Erstaufnahme konnte nicht geladen werden."
              description={VERBINDUNG_PRUEFEN}
              onErneut={() => {
                if (checkliste.isError) void checkliste.refetch();
                if (erhebungen.isError) void erhebungen.refetch();
              }}
            />
          </div>
        ) : null}
        <Schritt titel="Verordnung" stand={checklisteDa ? stand.verordnung : null}>
          {stand.verordnung === 'offen' && checklisteDa && canWriteTreatmentBases(user.roles) ? (
            <PrescriptionPhoto patientId={patient.id} onErfolg={nachFoto} gefuehrt />
          ) : null}
        </Schritt>

        <Schritt titel={BEGRIFFE.anmeldebogen} stand={checklisteDa ? stand.anmeldebogen : null}>
          {stand.anmeldebogen === 'offen' && checklisteDa ? (
            <AnmeldebogenFoto patientId={patient.id} />
          ) : null}
        </Schritt>

        {/* Freiwillig, ohne Zustand „offen“: Gefragt wird, vermerkt wird nur,
            was die Person sagt (PAT-04). Die Karte bringt ihren Titel mit. */}
        <Datenschutz patient={patient} user={user} />

        {darfBogenLesen ? (
          <Schritt titel="Anamnesebogen" stand={erhebungenDa ? stand.anamnese : null}>
            {stand.anamnese === 'offen' &&
            erhebungenDa &&
            anamnese &&
            canWriteQuestionnaire(user.roles) ? (
              <ButtonLink
                variant="secondary"
                to={mitRueckweg(
                  erhebenPfad(patient.id, anamnese.meta.id, entwurf ? { entwurf: entwurf.id } : {}),
                  hier,
                )}
              >
                {entwurf ? 'Entwurf weiter ausfüllen' : 'Bogen erheben'}
              </ButtonLink>
            ) : null}
          </Schritt>
        ) : null}

        <Schritt titel="Behandlungsliege" stand={stand.liege}>
          <Behandlungsliege patient={patient} darfAendern={canReadPatientDirectory(user.roles)} />
        </Schritt>

        {/* Ein Hauptknopf (DESIGN.md Regel 4): mit Termin weiter zur Doku,
            wo der Befund aus Bausteinen entsteht; sonst zurück. */}
        <Formularfuss>
          {terminId && canWriteTreatmentNote(user.roles) ? (
            <>
              <ButtonLink to={`/termine/${encodeURIComponent(terminId)}/abschluss`}>
                Weiter zu Befund und Doku
              </ButtonLink>
              <ButtonLink to={zurueck} variant="quiet">
                Später
              </ButtonLink>
            </>
          ) : (
            <ButtonLink to={zurueck}>Fertig</ButtonLink>
          )}
        </Formularfuss>
      </div>
    </>
  );
}

const STANDTEXT: Record<Schrittstand, { text: string; ton: 'positiv' | 'neutral' | 'warnung' }> = {
  erledigt: { text: 'Erledigt', ton: 'positiv' },
  entfaellt: { text: 'Entfällt', ton: 'neutral' },
  offen: { text: 'Offen', ton: 'warnung' },
};

/** Ein Schritt: Titel mit Zustand als Zeichen und Wort (Regel 5), darunter die Arbeit. */
function Schritt({
  titel,
  stand,
  children,
}: {
  titel: string;
  /** `null`: noch nicht bekannt - dann ohne Abzeichen. */
  stand: Schrittstand | null;
  children: ReactNode;
}) {
  const zeichen = stand ? STANDTEXT[stand] : null;
  return (
    <Section
      titel={titel}
      {...(zeichen ? { aktion: <Badge ton={zeichen.ton}>{zeichen.text}</Badge> } : {})}
    >
      {children}
    </Section>
  );
}
