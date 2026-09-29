import { PageHeader } from '@/components/ui/PageHeader';
import { canWriteTreatmentBases, type CurrentUser } from '@/features/session/types';
import { PrescriptionsToCapture } from './PrescriptionsToCapture';

/**
 * Offene Punkte - die Büroliste (PRX-EPIC-003, „Nichts fällt durch").
 *
 * Hier läuft zusammen, was sonst liegen bliebe: Verordnungen, die nur als Foto
 * da sind, Aufgaben und Wiedervorlagen, offene Erstaufnahmen, die Anrufe für
 * morgen und Verordnungen, die bald enden. Jede Liste hat ihren eigenen
 * Lesepfad; was eine Rolle nicht sehen darf, fragt die Seite gar nicht erst ab
 * - verbindlich prüft der Server (ADR-004).
 *
 * Nichts hier bewertet eine Person oder einen Verlauf (§17): Die Listen
 * zählen organisatorische Zustände, sie empfehlen nichts.
 */
export function OpenPointsPage({ user }: { user: CurrentUser }) {
  const timeZone = user.organizationTimeZone ?? 'Europe/Berlin';

  return (
    <>
      <PageHeader
        title="Offene Punkte"
        description="Was noch zu erledigen ist, bis es erledigt ist."
      />
      <div className="lg:max-w-3xl">
        {canWriteTreatmentBases(user.roles) ? <PrescriptionsToCapture timeZone={timeZone} /> : null}
      </div>
    </>
  );
}
