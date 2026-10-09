import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import { alsFormularfehler } from '@/lib/formularfehler';
import { todayInTimeZone } from '@/features/appointments/api';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import {
  canManageInvoicing,
  canWriteTrainingClients,
  canReadTrainingProtocols,
  canReadTrainingContent,
  canWriteTrainingProtocols,
  canReadExercisePlans,
  type CurrentUser,
} from '@/features/session/types';
import { Trainingspaket } from '@/features/billing/Trainingspaket';
import {
  TRAINING_BESCHRIFTUNG,
  TRAINING_FELDER,
  endTrainingRelationship,
  getTrainingClient,
  reopenTrainingRelationship,
  trainingFeldId,
  trainingWerteSchema,
  updateTrainingClient,
  werteAus,
  type TrainingClient,
  type TrainingFeld,
  type TrainingWerte,
  anschriftZurPruefung,
} from './api';
import { TrainingClientFields } from './TrainingClientFields';
import { TrainingTermine, TrainingVereinbarungen } from './TrainingClientSections';
import { TrainingEinheiten } from './TrainingProtocol';
import { PlattformAbschnitt } from '@/features/platform-access/PlattformAbschnitt';
import { RueckfragenAbschnitt } from '@/features/messages/RueckfragenAbschnitt';
import { TrainingEinwilligung } from './TrainingEinwilligung';
import { TrainingProfil } from './TrainingProfil';
import { TrainingVertraege } from './TrainingVertraege';
import { PlanAbschnitt } from '@/features/exercise-plans/PlanAbschnitt';

/**
 * Eine Trainingskund:in (TRN-002).
 *
 * Das Laden ist das Öffnen im Sinne von ADR-010 - der Server protokolliert es
 * (`training_relationship.viewed`, ANN-175). Darum lädt die Seite genau
 * einmal und nicht bei jedem Fokuswechsel (Standard der Anwendung).
 *
 * Kein Wort über eine Behandlung: Ob die Person auch eine Akte hat, weiß die
 * Trainingsbetreuung nicht und soll es hier nicht erfahren (§4.8).
 */
export function TrainingClientPage({ user }: { user: CurrentUser }) {
  const { relationshipId = '' } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['training-client', relationshipId],
    queryFn: () => getTrainingClient(relationshipId),
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (isError) {
    return (
      <>
        <Rueckweg standard="/training" />
        <ErrorState
          title={`Die ${BEGRIFFE.trainingskundIn} konnte nicht geladen werden.`}
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <Rueckweg standard="/training" />
        <EmptyState title={`${BEGRIFFE.trainingskundIn} nicht gefunden`} />
      </>
    );
  }
  return <Ansicht kundin={data} user={user} />;
}

function Ansicht({ kundin, user }: { kundin: TrainingClient; user: CurrentUser }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [gespeichert, setGespeichert] = useState(false);
  const darfSchreiben = canWriteTrainingClients(user.roles);
  const name = `${kundin.given_name} ${kundin.family_name}`;
  const anschrift = [
    [kundin.street, kundin.house_number].filter(Boolean).join(' '),
    [kundin.postal_code, kundin.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <Rueckweg standard="/training" />
      {/* Keine Zeile „Trainingskund:in" unter dem Namen: Der Weg hierher
          sagt es schon (UX-005i). */}
      <PageHeader
        title={name}
        actions={kundin.status === 'inactive' ? <Badge>Vertrag beendet</Badge> : null}
      />

      {bearbeiten ? (
        <Bearbeiten
          kundin={kundin}
          onFertig={(ok) => {
            setBearbeiten(false);
            setGespeichert(ok);
          }}
        />
      ) : (
        <>
          {gespeichert ? <Statusmeldung ton="erfolg">Gespeichert.</Statusmeldung> : null}
          <Section
            titel="Kontakt"
            rahmen
            aktion={
              darfSchreiben ? (
                <Button
                  type="button"
                  variant="secondary"
                  groesse="kompakt"
                  onClick={() => {
                    setGespeichert(false);
                    setBearbeiten(true);
                  }}
                >
                  Bearbeiten
                </Button>
              ) : null
            }
          >
            {/* Eine leere Angabe nimmt keine Zeile ein (UX-005i). */}
            {kundin.date_of_birth || kundin.phone || kundin.email || anschrift ? (
              <DetailList>
                {kundin.date_of_birth ? (
                  <DetailRow label="Geburtsdatum">{formatDate(kundin.date_of_birth)}</DetailRow>
                ) : null}
                {kundin.phone ? (
                  <DetailRow label="Telefon">
                    <a className="text-accent hover:underline" href={`tel:${kundin.phone}`}>
                      {kundin.phone}
                    </a>
                  </DetailRow>
                ) : null}
                {kundin.email ? (
                  <DetailRow label="E-Mail">
                    <a className="text-accent hover:underline" href={`mailto:${kundin.email}`}>
                      {kundin.email}
                    </a>
                  </DetailRow>
                ) : null}
                {anschrift ? (
                  <DetailRow label="Anschrift">
                    {anschrift}
                    {/* Vor ABN-020 standen Straße und Hausnummer in einem Feld;
                        was nicht eindeutig zu trennen war, steht zur Prüfung da
                        (BEF-111). Ohne Hausnummer gibt es keine Rechnung. */}
                    {anschriftZurPruefung(kundin) ? (
                      <span className="text-warnung block text-sm">
                        Bitte prüfen: Die Hausnummer steht noch in der Straße.
                      </span>
                    ) : null}
                  </DetailRow>
                ) : null}
              </DetailList>
            ) : (
              <p className="text-ink-muted text-sm">Keine Kontaktangaben hinterlegt.</p>
            )}
          </Section>

          <Section titel="Vertrag" rahmen>
            {/* Eine Zeile statt zweier Reihen „Beginn"/„Ende": „läuft" ist
                der Regelfall und steht nicht dran (UX-005i). */}
            <p className="text-ink text-liste">
              {kundin.contract_started_on
                ? `Seit ${formatDate(kundin.contract_started_on)}`
                : 'Ohne Beginn'}
              {kundin.contract_ended_on ? ` bis ${formatDate(kundin.contract_ended_on)}` : ''}
            </p>
            {darfSchreiben ? (
              <div className="mt-4">
                <VertragBeenden kundin={kundin} zeitzone={user.organizationTimeZone} />
              </div>
            ) : null}
          </Section>

          {/* TRN-EPIC-002: Termine im gemeinsamen Kalender und die
              Vereinbarungen, an denen sie hängen können. */}
          {user.organizationTimeZone ? (
            <TrainingTermine
              kundin={kundin}
              zeitzone={user.organizationTimeZone}
              darfPlanen={darfSchreiben}
            />
          ) : null}
          <TrainingVereinbarungen kundin={kundin} darfSchreiben={darfSchreiben} />
          {/* ANG-006: das Paket nach Zeitraum - owner und office (ANN-071). */}
          {canManageInvoicing(user.roles) ? <Trainingspaket verhaeltnisId={kundin.id} /> : null}
          {/* KND-004: im Konto geschlossene Verträge und ihr Widerruf (owner, office). */}
          {canManageInvoicing(user.roles) ? <TrainingVertraege relationshipId={kundin.id} /> : null}
          {/* POR-017: Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4). */}
          {user.organizationTimeZone ? (
            <TrainingEinwilligung
              relationshipId={kundin.id}
              darfSchreiben={darfSchreiben}
              zeitzone={user.organizationTimeZone}
            />
          ) : null}
          {/* KND-005: Voraussetzungen und Übernahmen aus der Behandlung.
              Schreiben owner und Trainingsbetreuung (ANN-287), lesen dazu das
              Büro (ABN-030, BEF-137). */}
          {canReadTrainingContent(user.roles) ? (
            <TrainingProfil
              relationshipId={kundin.id}
              darfSchreiben={
                canWriteTrainingProtocols(user.roles) && kundin.contract_ended_on === null
              }
            />
          ) : null}
          {/* UEB-EPIC-002: die Trainingspläne - schreiben owner und
              Trainingsbetreuung, lesen dazu das Büro (ANN-298, BEF-137); ob
              geschrieben werden darf, sagt der Server (can_write). */}
          {canReadExercisePlans(user.roles, 'training') ? (
            <PlanAbschnitt
              bereich="training"
              verhaeltnisId={kundin.id}
              rueckweg={`/training/${kundin.id}`}
            />
          ) : null}
          {/* TRN-009: die protokollierten Einheiten - nur owner und
              Trainingsbetreuung (ANN-184). */}
          {/* ABN-022 (BEF-113): auch das Büro sieht die Einheiten. */}
          {canReadTrainingProtocols(user.roles) ? <TrainingEinheiten kundin={kundin} /> : null}
          {/* POR-002: der eigene Zugang zur Plattform, getrennt von einem
              Zugang zur Behandlung (§4.8, ADR-023 Punkt 4). */}
          {user.organizationTimeZone ? (
            <PlattformAbschnitt
              art="training"
              verhaeltnisId={kundin.id}
              darfVerwalten={darfSchreiben}
              zeitzone={user.organizationTimeZone}
              praxis={user.organizationName ?? 'der Praxis'}
            />
          ) : null}
          {/* KOM-003: Rückfragen dieses Trainingsverhältnisses; das Büro liest
              alle und antwortet auf Termin, Rechnung und Sonstiges (ANN-311
              Fassung 2), verbindlich entscheidet der Server. */}
          <RueckfragenAbschnitt art="training" verhaeltnisId={kundin.id} />
        </>
      )}
    </>
  );
}

function Bearbeiten({
  kundin,
  onFertig,
}: {
  kundin: TrainingClient;
  onFertig: (gespeichert: boolean) => void;
}) {
  const ausgang = werteAus(kundin);
  const [werte, setWerte] = useState<TrainingWerte>(ausgang);
  const [fehler, setFehler] = useState<Partial<Record<TrainingFeld, string>>>({});
  const queryClient = useQueryClient();
  const ungespeichert = TRAINING_FELDER.some((feld) => werte[feld] !== ausgang[feld]);
  const { freigeben, schutz } = useTextverlustschutz({ ungespeichert, texte: EINGABETEXTE });

  const mutation = useMutation({
    mutationFn: () => updateTrainingClient(kundin.id, werte),
    onSuccess: async () => {
      freigeben();
      await queryClient.invalidateQueries({ queryKey: ['training-clients'] });
      await queryClient.invalidateQueries({ queryKey: ['training-client', kundin.id] });
      onFertig(true);
    },
  });

  function setzen(feld: TrainingFeld, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;
    const ergebnis = trainingWerteSchema.safeParse(werte);
    const gefunden: Partial<Record<TrainingFeld, string>> = {};
    if (!ergebnis.success) {
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as TrainingFeld | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
    }
    // Beim Ändern bleibt der Beginn gesetzt; der Server verlangt ihn.
    if (werte.contract_started_on === '') {
      gefunden.contract_started_on = 'Bitte den Vertragsbeginn angeben.';
    } else if (kundin.contract_ended_on && werte.contract_started_on > kundin.contract_ended_on) {
      gefunden.contract_started_on = 'Der Beginn liegt nach dem Vertragsende.';
    }
    if (Object.keys(gefunden).length > 0) {
      setFehler(gefunden);
      return;
    }
    setFehler({});
    mutation.mutate();
  }

  return (
    <form onSubmit={absenden} noValidate className="max-w-xl">
      <Fehlerzusammenfassung
        fehler={alsFormularfehler(TRAINING_FELDER, TRAINING_BESCHRIFTUNG, fehler, trainingFeldId)}
      />
      <TrainingClientFields werte={werte} fehler={fehler} onChange={setzen} vertragsbeginnPflicht />
      {schutz}
      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-6">
          {/* ANG-006: der Grund, wenn ein Paket vor dem neuen Vertragsbeginn liegt. */}
          {mutation.error.message.includes('Trainingspaket')
            ? mutation.error.message
            : 'Die Angaben konnten nicht gespeichert werden. Bitte die Verbindung prüfen und erneut versuchen.'}
        </Statusmeldung>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            freigeben();
            onFertig(false);
          }}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/**
 * Vertragsende setzen oder zurücknehmen (TRN-001).
 *
 * Das Ende ist der Anker der dreijährigen Aufbewahrung (ADR-021 Punkt 4) -
 * deshalb die Rückfrage und der Satz dazu. Tag zwischen Beginn und heute in
 * der Zeitzone der Praxis; verbindlich prüft der Server dieselben Grenzen.
 */
function VertragBeenden({ kundin, zeitzone }: { kundin: TrainingClient; zeitzone: string | null }) {
  const queryClient = useQueryClient();
  const heute = zeitzone ? todayInTimeZone(zeitzone) : '';
  const [tag, setTag] = useState(heute);
  const beendet = kundin.contract_ended_on !== null;

  const mutation = useMutation({
    mutationFn: () =>
      beendet ? reopenTrainingRelationship(kundin.id) : endTrainingRelationship(kundin.id, tag),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-clients'] });
      await queryClient.invalidateQueries({ queryKey: ['training-client', kundin.id] });
    },
  });

  if (beendet) {
    return (
      <Rueckfrage
        ausloeser="Vertrag wieder aufnehmen"
        bestaetigen="Vertrag wieder aufnehmen"
        bestaetigenLaeuft="Wird wieder aufgenommen …"
        fehler={
          mutation.isError ? 'Der Vertrag konnte nicht wieder aufgenommen werden.' : undefined
        }
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync()}
      >
        <p>
          Der Vertrag läuft wieder. Die Aufbewahrungsfrist beginnt erst mit einem neuen
          Vertragsende.
        </p>
      </Rueckfrage>
    );
  }

  return (
    <Rueckfrage
      ausloeser="Vertrag beenden"
      bestaetigen="Vertrag beenden"
      bestaetigenLaeuft="Wird beendet …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
      onAbbrechen={() => setTag(heute)}
    >
      <p>
        Ab diesem Tag läuft die Aufbewahrung von drei Jahren; danach werden Kontakt, Vereinbarungen
        und Termine gelöscht. Rechnungen und die abgerechneten Termine bleiben, bis ihre steuerliche
        Frist von acht Jahren abgelaufen ist (ANN-183). Trainiert die Person wieder, lässt sich der
        Vertrag wieder aufnehmen.
      </p>
      <div className="mt-3 max-w-60">
        <Field
          label="Letzter Vertragstag"
          type="date"
          min={kundin.contract_started_on ?? undefined}
          max={heute || undefined}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        />
      </div>
    </Rueckfrage>
  );
}
