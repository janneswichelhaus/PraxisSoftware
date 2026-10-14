import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import { AftercareCancellations } from './AftercareCancellations';
import { TrainingWithdrawals } from './TrainingWithdrawals';
import { CallsSummary } from './CallsSummary';
import { ConsentWithdrawals } from './ConsentWithdrawals';
import { EndingPrescriptions, OffeneVerordnungen } from './Reminders';
import { OpenIntakes } from './OpenIntakes';
import { PrescriptionsToCapture } from './PrescriptionsToCapture';
import { AufgabeAnlegen, ErledigteAufgaben, Tasks } from './Tasks';
import { PlatformRequests } from './PlatformRequests';
import { WaitlistReview } from './WaitlistReview';
import { useEingang } from './eingang';
import { PlanWiedervorlage } from '@/features/exercise-plans/Wiedervorlage';
import { OffeneRueckfragen } from '@/features/messages/RueckfragenAbschnitt';

/** Eine Kennung aus der Adresszeile, wie die Datenbank sie vergibt. */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Offene Punkte - der Eingang der Praxis (PRX-EPIC-003, „Nichts fällt durch").
 *
 * Hier läuft zusammen, was sonst liegen bliebe: Rückfragen mit ihrer
 * Antwortfrist (KOM-002), Terminwünsche von der Plattform (POR-011),
 * Aufgaben und Wiedervorlagen, die Anrufe für morgen, Widerrufe und
 * Kündigungen über die Plattform (POR-016, KND-004, ANG-003), Verordnungen,
 * die nur als Foto da sind, offene Erstaufnahmen, Verordnungen, die bald
 * enden, auslaufende Pläne (UEB-007), Wartelisteneinträge, die lange keiner
 * angefasst hat (ABN-018), und Akten ohne Abschluss. Jede Liste hat ihren
 * eigenen Lesepfad; was eine Rolle nicht sehen darf, fragt die Seite gar nicht
 * erst ab - verbindlich prüft der Server (ADR-004).
 *
 * **Ein Eingang statt 13 Listen** (Design-Rollout B5, ANN-450): Eine Gruppe
 * steht nur da, wenn sie etwas enthält, das Dringlichste zuerst; ist alles
 * leer, sagt die Seite einmal „Nichts offen". Jede Zeile führt zur Person
 * oder zum Vorgang, die Arbeit steht daneben (L3). Bis alle Listen
 * geantwortet haben, steht ein Ladezustand da - danach erscheint der Eingang
 * auf einmal, statt Gruppe für Gruppe nachzurutschen.
 *
 * Nichts hier bewertet eine Person oder einen Verlauf (§17): Die Listen
 * zählen organisatorische Zustände, sie empfehlen nichts.
 */
export function OpenPointsPage({ user }: { user: CurrentUser }) {
  const timeZone = user.organizationTimeZone ?? 'Europe/Berlin';
  const today = todayInTimeZone(timeZone);
  // `?aufgabe=neu&patient=…` öffnet das Formular mit der Person (PRX-012).
  const [suche] = useSearchParams();
  const patientParam = suche.get('patient');
  const aufgabePatient = patientParam && KENNUNG.test(patientParam) ? patientParam : null;
  const [neueAufgabe, setNeueAufgabe] = useState(suche.get('aufgabe') === 'neu');
  // Die Bestätigung steht oben und nimmt den Fokus - die Zeile, an der der
  // Vorgang begann, ist danach oft fort (erledigt, gelöscht, angelegt).
  const [meldung, setMeldung] = useState<{ text: string; nr: number } | null>(null);
  const melde = (text: string) => setMeldung((bisher) => ({ text, nr: (bisher?.nr ?? 0) + 1 }));

  const { darf, laedt, nichtsOffen, anrufeOffen } = useEingang(user, today);

  return (
    <>
      <PageHeader
        title="Offene Punkte"
        actions={
          darf.aufgaben && !neueAufgabe ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMeldung(null);
                setNeueAufgabe(true);
              }}
            >
              Aufgabe anlegen
            </Button>
          ) : null
        }
      />
      {meldung ? (
        <Rueckmeldung key={meldung.nr} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
      {darf.aufgaben && neueAufgabe ? (
        <div className="max-w-formular mb-8">
          <AufgabeAnlegen
            patientId={aufgabePatient}
            onFertig={(text) => {
              setNeueAufgabe(false);
              if (text) melde(text);
            }}
          />
        </div>
      ) : null}

      {laedt ? <LoadingState inKarte label="Offene Punkte werden geladen …" /> : null}
      {!laedt && nichtsOffen ? <EmptyState inKarte title="Nichts offen" /> : null}

      {/* Die Gruppen sind von Anfang an da, damit jede Liste nur einmal
          geladen wird; sichtbar werden sie zusammen. Reihenfolge: was eine
          Frist oder eine Person warten lässt, zuerst (ANN-450). */}
      <div hidden={laedt}>
        {darf.rueckfragen ? <OffeneRueckfragen bereiche={darf.rueckfrageBereiche} /> : null}
        {darf.terminwuensche ? <PlatformRequests timeZone={timeZone} /> : null}
        {darf.aufgaben ? <Tasks today={today} onMeldung={melde} /> : null}
        {darf.anrufe ? <CallsSummary today={today} /> : null}
        {darf.trainingswiderrufe ? <TrainingWithdrawals /> : null}
        {darf.widerrufe ? <ConsentWithdrawals /> : null}
        {darf.kuendigungen ? <AftercareCancellations /> : null}
        {darf.scans ? <PrescriptionsToCapture timeZone={timeZone} /> : null}
        {darf.erstaufnahmen ? <OpenIntakes /> : null}
        {darf.verordnungEndet ? <EndingPrescriptions timeZone={timeZone} /> : null}
        {darf.plaene ? (
          <PlanWiedervorlage bereiche={darf.planBereiche} rueckweg="/offen" nurWennVorhanden />
        ) : null}
        {darf.warteliste ? <WaitlistReview timeZone={timeZone} /> : null}
        {darf.verordnungOffen ? <OffeneVerordnungen /> : null}
      </div>

      {/* Seltenes leise am Ende: der Rückblick und - wenn morgen niemand
          mehr anzurufen ist - der Weg zur Anrufliste. */}
      {darf.aufgaben || (darf.anrufe && !laedt && anrufeOffen === 0) ? (
        <div className="mt-8">
          {darf.anrufe && !laedt && anrufeOffen === 0 ? (
            <Textlink alleinstehend to="/offen/anrufe" className="text-sm">
              Anrufliste
            </Textlink>
          ) : null}
          {darf.aufgaben ? <ErledigteAufgaben today={today} onMeldung={melde} /> : null}
        </div>
      ) : null}
    </>
  );
}
