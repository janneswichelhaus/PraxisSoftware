import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Objektkopf } from '@/components/ui/Objektkopf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Zweispalter } from '@/components/ui/Zweispalter';
import { BEGRIFFE } from '@/lib/begriffe';
import { formatDate, todayInTimeZone } from '@/lib/datum';
import { alsFormularfehler } from '@/lib/formularfehler';
import { leseRueckweg, mitRueckweg, rueckwegBeschriftung } from '@/lib/rueckweg';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import {
  canManageInvoicing,
  canWriteTrainingClients,
  canReadTrainingProtocols,
  canReadTrainingContent,
  canWriteTrainingProtocols,
  canReadExercisePlans,
  canCounselNutrition,
  isOwner,
  type CurrentUser,
} from '@/features/session/types';
import { Trainingspaket } from '@/features/billing/Trainingspaket';
import { Suchreiterleiste } from '@/components/ui/Reiterleiste';
import { useOffenerReiter, type Suchreiter } from '@/components/ui/offenerReiter';
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
import {
  PlattformAbschnitt,
  PlattformzugangBeenden,
} from '@/features/platform-access/PlattformAbschnitt';
import { usePlattformzugang, zugangBeendbar } from '@/features/platform-access/zustand';
import { RueckfragenAbschnitt } from '@/features/messages/RueckfragenAbschnitt';
import { TrainingEinwilligung } from './TrainingEinwilligung';
import { TrainingProfil } from './TrainingProfil';
import { TrainingVertraege } from './TrainingVertraege';
import { PlanAbschnitt } from '@/features/exercise-plans/PlanAbschnitt';
import { ZwischenDenTerminen } from '@/features/checkins/ZwischenDenTerminen';
import { TrainingAssessments } from './TrainingAssessments';
import { ErnaehrungReiter } from '@/features/nutrition/ErnaehrungReiter';

/**
 * Eine Trainingskund:in (TRN-002).
 *
 * Das Laden ist das Öffnen im Sinne von ADR-010 - der Server protokolliert es
 * (`training_relationship.viewed`, ANN-175). Darum lädt die Seite genau
 * einmal und nicht bei jedem Fokuswechsel (Standard der Anwendung); ein
 * Reiterwechsel lädt sie nicht neu.
 *
 * Kein Wort über eine Behandlung: Ob die Person auch eine Akte hat, weiß die
 * Trainingsbetreuung nicht und soll es hier nicht erfahren (§4.8).
 *
 * Seit dem Design-Rollout (Welle B3a) eine Objektseite wie die Akte
 * (DESIGN.md „Objekt“): `Objektkopf` mit Name, Vertrag und „Termin anlegen“,
 * darunter vier Reiter statt vierzehn Abschnitten untereinander - Termine
 * (Termine, Pläne, Einheiten), Verlauf (Check-ins, Assessments), Verträge
 * (Vereinbarungen, Paket, Einwilligung, Vertragsende leise am Ende) und
 * Stammdaten (Kontakt, Voraussetzungen, Plattform, Rückfragen). Der offene
 * Reiter steht im Suchteil der Adresse (`?bereich=`, ANN-460) - die Route
 * bleibt dieselbe. Was ein Reiter zeigt, lädt erst, wenn er offen ist.
 */
export function TrainingClientPage({ user }: { user: CurrentUser }) {
  const { relationshipId = '' } = useParams();
  const abfrage = useQuery({
    queryKey: ['training-client', relationshipId],
    queryFn: () => getTrainingClient(relationshipId),
    retry: false,
  });
  const { data } = abfrage;

  return (
    <>
      {/* Ab 640 px als Zeile über dem Kopf; darunter steht derselbe Weg als
          Pfeil vor dem Namen (Objektkopf, RAH-007). Ohne Datensatz bleibt die
          Zeile auch am Telefon - es gibt keinen Kopf mit Pfeil. */}
      <Rueckweg standard="/training" className={data ? 'mb-3 max-sm:hidden' : ''} />
      {data ? (
        <>
          {/* Ein gescheitertes Nachladen nach einem Vorgang nimmt die Seite
              nicht weg; der Stand bleibt mit dem Hinweis stehen (ZST-03). */}
          {abfrage.isError ? (
            <NachladeHinweis
              className="mb-3"
              laeuft={abfrage.isFetching}
              onErneut={() => void abfrage.refetch()}
            />
          ) : null}
          <Ansicht kundin={data} user={user} />
        </>
      ) : (
        <>
          {/* Solange der Kopf mit dem Namen fehlt, trägt die Seite ihre
              Gattung als Überschrift - im Laden wie im Fehler (UIK-16). */}
          <PageHeader title={BEGRIFFE.trainingskundIn} />
          <Abfragezustand
            abfrage={abfrage}
            laden={`${BEGRIFFE.trainingskundIn} wird geladen …`}
            fehler={`Die ${BEGRIFFE.trainingskundIn} konnte nicht geladen werden.`}
            inKarte
            leer={{
              wenn: (wert) => wert === null,
              titel: `${BEGRIFFE.trainingskundIn} nicht gefunden`,
            }}
          >
            {() => null}
          </Abfragezustand>
        </>
      )}
    </>
  );
}

/** Der Suchparameter des offenen Reiters (`?bereich=vertraege`, ANN-460). */
const BEREICH_PARAM = 'bereich';

type Bereich = 'termine' | 'verlauf' | 'vertraege' | 'ernaehrung' | 'stammdaten';

/** „Vertrag seit 01.09.2026" - „läuft" ist der Regelfall und steht nicht dran (UX-005i). */
function vertragszeile(kundin: TrainingClient): string {
  const beginn = kundin.contract_started_on
    ? `Vertrag seit ${formatDate(kundin.contract_started_on)}`
    : 'Vertrag ohne Beginn';
  return kundin.contract_ended_on
    ? `${beginn} bis ${formatDate(kundin.contract_ended_on)}`
    : beginn;
}

function Ansicht({ kundin, user }: { kundin: TrainingClient; user: CurrentUser }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  // Zählt die Speichervorgänge: Jede Bestätigung ist eine neue Zeile und nimmt
  // den Fokus erneut (`Rueckmeldung`).
  const [gespeichert, setGespeichert] = useState(0);
  const darfSchreiben = canWriteTrainingClients(user.roles);
  const zone = user.organizationTimeZone;
  const laeuft = kundin.status === 'active';
  const [suche] = useSearchParams();
  const ort = useLocation();
  const rueckwegZiel = leseRueckweg(suche, '/training');
  // Das Formular kehrt in diesen Reiter zurück, samt dem Rückweg der Seite
  // selbst (PAT-08, TER-03).
  const hier = `${ort.pathname}${ort.search}`;

  // ANN-440: vier Reiter wie die Akte; was ein Reiter zeigt, lädt erst, wenn
  // er offen ist. Check-ins und Assessments lesen dieselben Rollen wie die
  // Pläne; ohne sie gibt es den Reiter „Verlauf" nicht. Verbindlich prüft der
  // Server.
  const zeigtVerlauf = canReadExercisePlans(user.roles, 'training');
  const bereiche: Suchreiter<Bereich>[] = [
    { wert: 'termine', label: 'Termine' },
    ...(zeigtVerlauf ? [{ wert: 'verlauf' as const, label: 'Verlauf' }] : []),
    { wert: 'vertraege', label: 'Verträge' },
    // ERN-001 (ANN-620): nur für die Fähigkeit „Ernährungsberatung“ (owner);
    // Büro und Trainingsbetreuung sehen den Reiter nicht (ADR-021 Punkt 11).
    ...(canCounselNutrition(user.roles)
      ? [{ wert: 'ernaehrung' as const, label: 'Ernährung' }]
      : []),
    { wert: 'stammdaten', label: 'Stammdaten' },
  ];
  const offen = useOffenerReiter(
    BEREICH_PARAM,
    bereiche.map((bereich) => bereich.wert),
  );
  // Derselbe Zugang wie im Abschnitt „Plattform“ (ein Abfrageschlüssel);
  // gelesen erst, wenn die Stammdaten offen sind.
  const plattformzugang = usePlattformzugang(
    'training',
    kundin.id,
    darfSchreiben && Boolean(zone) && offen === 'stammdaten',
  );
  const beendenZugang = darfSchreiben && Boolean(zone) && zugangBeendbar(plattformzugang);

  return (
    <>
      <Objektkopf
        titel={`${kundin.given_name} ${kundin.family_name}`}
        rueckweg={{ to: rueckwegZiel, beschriftung: rueckwegBeschriftung(rueckwegZiel) }}
        meta={
          <>
            {vertragszeile(kundin)}
            {/* Der Ort sagt im Kopf, wohin es geht - die Anschrift steht in
                den Stammdaten (wie in der Akte). */}
            {kundin.city ? ` · ${kundin.city}` : ''}
          </>
        }
        // Der laufende Vertrag ist der Regelfall und trägt kein Abzeichen.
        status={laeuft ? null : <Badge>Vertrag beendet</Badge>}
        // TRN-EPIC-002: der Termin im gemeinsamen Kalender - der Vorgang, der
        // im Alltag aus der Trainingskund:in heraus entsteht.
        aktionen={
          darfSchreiben && laeuft && zone && !bearbeiten ? (
            <ButtonLink to={mitRueckweg(`/training/termine/neu?kunde=${kundin.id}`, hier)}>
              Termin anlegen
            </ButtonLink>
          ) : null
        }
        // Wer die Stammdaten ändert, sieht die Reiter nicht - wie bei den
        // Formularen der Akte (AKTE-000).
        reiter={
          bearbeiten ? null : (
            <Suchreiterleiste
              reiter={bereiche}
              param={BEREICH_PARAM}
              label={`Bereiche der ${BEGRIFFE.trainingskundIn}`}
            />
          )
        }
      />

      <div className="mt-6 min-w-0">
        {bearbeiten ? (
          <Bearbeiten
            kundin={kundin}
            onFertig={(ok) => {
              setBearbeiten(false);
              if (ok) setGespeichert((zahl) => zahl + 1);
            }}
          />
        ) : offen === 'termine' ? (
          <>
            {/* TRN-EPIC-002: Termine im gemeinsamen Kalender. */}
            {zone ? <TrainingTermine kundin={kundin} zeitzone={zone} /> : null}
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
            {/* TRN-009: die protokollierten Einheiten - owner und
                Trainingsbetreuung (ANN-184), seit ABN-022 (BEF-113) auch das
                Büro. */}
            {canReadTrainingProtocols(user.roles) ? <TrainingEinheiten kundin={kundin} /> : null}
          </>
        ) : offen === 'verlauf' ? (
          <>
            {/* TRK-002: Check-in mit Takt und die Angaben (DSN-001 Abschnitt 6);
                dieselben Rollen wie die Pläne, verbindlich prüft der Server. */}
            <ZwischenDenTerminen art="training" verhaeltnisId={kundin.id} />
            {/* OUT-002: Assessments mit Bedingungen und Wiederholung
                (IDEA-OUT-007); dieselben Rollen wie die Pläne. */}
            <TrainingAssessments verhaeltnisId={kundin.id} />
          </>
        ) : offen === 'ernaehrung' ? (
          <ErnaehrungReiter art="training" verhaeltnisId={kundin.id} />
        ) : offen === 'vertraege' ? (
          <>
            {/* TRN-EPIC-002: die Vereinbarungen, an denen Termine hängen können. */}
            <TrainingVereinbarungen kundin={kundin} darfSchreiben={darfSchreiben} />
            {/* ANG-006: das Paket nach Zeitraum - owner und office (ANN-071). */}
            {canManageInvoicing(user.roles) ? <Trainingspaket verhaeltnisId={kundin.id} /> : null}
            {/* KND-004: im Konto geschlossene Verträge und ihr Widerruf (owner, office). */}
            {canManageInvoicing(user.roles) ? (
              <TrainingVertraege relationshipId={kundin.id} />
            ) : null}
            {/* POR-017: Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4). */}
            {zone ? (
              <TrainingEinwilligung
                relationshipId={kundin.id}
                darfSchreiben={darfSchreiben}
                zeitzone={zone}
              />
            ) : null}
            {/* TRN-001: Das Vertragsende leise am Ende des Reiters, mit
                Rückfrage (DESIGN.md, Zerstörendes). */}
            {darfSchreiben ? (
              <div className="border-line mt-8 border-t pt-6">
                <VertragBeenden kundin={kundin} zeitzone={zone} />
              </div>
            ) : null}
          </>
        ) : (
          // Ab 900 px Inhaltsbreite stehen Zugang und Rückfragen als
          // Kontextspalte neben Kontakt und Voraussetzungen (DESIGN.md
          // „Objekt“, `Zweispalter schmal`); darunter folgen sie.
          <>
            <Zweispalter
              kontextBreite="schmal"
              kontext={
                <>
                  {/* POR-002: der eigene Zugang zur Plattform, getrennt von einem
                    Zugang zur Behandlung (§4.8, ADR-023 Punkt 4). */}
                  {zone ? (
                    <PlattformAbschnitt
                      art="training"
                      verhaeltnisId={kundin.id}
                      darfVerwalten={darfSchreiben}
                      zeitzone={zone}
                      praxis={user.organizationName ?? 'der Praxis'}
                      beendenAmEnde
                      einsichtFuer={isOwner(user.roles) ? kundin.given_name : null}
                    />
                  ) : null}
                  {/* KOM-003: Rückfragen dieses Trainingsverhältnisses; das Büro
                    liest alle und antwortet auf Termin, Rechnung und Sonstiges
                    (ANN-311 Fassung 3), verbindlich entscheidet der Server. */}
                  <RueckfragenAbschnitt art="training" verhaeltnisId={kundin.id} />
                </>
              }
            >
              {gespeichert > 0 ? (
                <Rueckmeldung key={gespeichert} className="mb-6">
                  Gespeichert.
                </Rueckmeldung>
              ) : null}
              <Kontakt
                kundin={kundin}
                aktion={
                  darfSchreiben ? (
                    <Button
                      type="button"
                      variant="secondary"
                      groesse="kompakt"
                      onClick={() => setBearbeiten(true)}
                    >
                      Bearbeiten
                    </Button>
                  ) : null
                }
              />
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
              {/* BEF-182: die Auskunft zum Training, wie „Betroffenenrechte“ an der
                Akte - nur owner; verbindlich prüft der Server (ADR-004). */}
              {isOwner(user.roles) ? (
                <Section titel="Betroffenenrechte">
                  <ButtonLink
                    to={mitRueckweg(`/training/${kundin.id}/auskunft`, hier)}
                    variant="secondary"
                  >
                    Auskunft zum Training
                  </ButtonLink>
                </Section>
              ) : null}
            </Zweispalter>
            {/* Sperren und Entziehen leise am Ende des Reiters, wie an der Akte
              (DESIGN.md, Objekt-Rezeptur und 9.16; Design-Review BEF-182). */}
            {beendenZugang ? (
              <Section titel="Beenden">
                {/* 12 px zwischen den Auslösern: Mit Handschuhen liegt „sperren“
                  sonst zu dicht an „entziehen“ (Grundsatz 3). */}
                <div className="flex flex-col items-start gap-3">
                  <PlattformzugangBeenden art="training" verhaeltnisId={kundin.id} />
                </div>
              </Section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** Kontakt der Trainingskund:in - Telefon und E-Mail als Wege (DESIGN.md Regel 9). */
function Kontakt({ kundin, aktion }: { kundin: TrainingClient; aktion: ReactNode }) {
  const anschrift = [
    [kundin.street, kundin.house_number].filter(Boolean).join(' '),
    [kundin.postal_code, kundin.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Section titel="Kontakt" rahmen aktion={aktion}>
      {/* Eine leere Angabe nimmt keine Zeile ein (UX-005i). */}
      {kundin.date_of_birth || kundin.phone || kundin.email || anschrift ? (
        <DetailList>
          {kundin.date_of_birth ? (
            <DetailRow label="Geburtsdatum">{formatDate(kundin.date_of_birth)}</DetailRow>
          ) : null}
          {kundin.phone ? (
            <DetailRow label="Telefon">
              <Textlink href={`tel:${kundin.phone}`}>{kundin.phone}</Textlink>
            </DetailRow>
          ) : null}
          {kundin.email ? (
            <DetailRow label="E-Mail">
              <Textlink href={`mailto:${kundin.email}`}>{kundin.email}</Textlink>
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
  );
}

/**
 * Kontakt und Vertragsbeginn ändern - ein Formular nach DESIGN.md
 * („Formular“): Abschnitte ohne Rahmen in `max-w-formular`, unten der
 * `Formularfuss` (Speichern zuerst, Abbrechen leise).
 */
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
    <form
      onSubmit={absenden}
      noValidate
      aria-label="Stammdaten bearbeiten"
      className="max-w-formular"
    >
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
      <Formularfuss>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Wird gespeichert …' : 'Speichern'}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            freigeben();
            onFertig(false);
          }}
        >
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}

/**
 * Vertragsende setzen oder zurücknehmen (TRN-001).
 *
 * Das Ende ist der Anker der dreijährigen Aufbewahrung (ADR-021 Punkt 4) -
 * deshalb die Rückfrage und der Satz dazu. Tag zwischen Beginn und heute in
 * der Zeitzone der Praxis; verbindlich prüft der Server dieselben Grenzen.
 *
 * Das Beenden steht leise am Ende des Reiters „Verträge“ (DESIGN.md,
 * Zerstörendes); das Wiederaufnehmen ist kein zerstörender Vorgang und
 * bleibt ein gewöhnlicher Knopf.
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
      ausloeserVariante="quiet"
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
