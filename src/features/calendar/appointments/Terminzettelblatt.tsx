import { EmptyState } from '@/components/ui/Feedback';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { AbsenderBlock } from '@/features/privacy/datenschutz/AbsenderBlock';
import type { PraxisAbsender } from '@/features/privacy/datenschutz/absender';
import { slipOrt, type AppointmentSlipEntry } from './api';
import { formatLocalDate, formatLocalTimeRange } from '@/lib/datum';
import { staffName } from '@/lib/termin';

/**
 * Das Blatt des Terminzettels, wie es auf Papier geht (Profil „Druckblatt“,
 * DESIGN.md; herausgelöst aus `AppointmentSlipPage` im Design-Rollout B2).
 *
 * Absender, Überschrift an die Patient:in, die Termine, die Bitte um
 * rechtzeitige Absage. Die Überschrift ist bewusst kein `PageHeader`: Sie
 * steht auf dem Papier und ist an die Patient:in gerichtet, nicht an die
 * bedienende Person. Die Größe ist trotzdem eine des Systems (H4, TER-16).
 *
 * Die Termine stehen als Zeilen des Systems (`ListRow`) ohne Karte, oben und
 * unten eine Linie - am Bildschirm wie auf Papier: Datum, darunter Zeit und
 * Ort, darunter wer kommt.
 */
export function Terminzettelblatt({
  absender,
  patientName,
  eintraege,
  kontakt,
}: {
  absender: PraxisAbsender;
  patientName: string;
  eintraege: readonly AppointmentSlipEntry[];
  /** Telefon und E-Mail der Praxis für die Bitte um Absage, sonst leer. */
  kontakt: string;
}) {
  return (
    <section className="max-w-prose">
      <AbsenderBlock absender={absender} className="mb-6" />
      <h1 className="text-ink text-h4 font-bold">Ihre nächsten Termine</h1>
      <p className="text-ink-muted text-liste mt-1">{patientName}</p>

      {eintraege.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            inKarte
            title="Keine bevorstehenden Termine"
            description="Sobald ein Termin vereinbart ist, steht er hier und lässt sich ausdrucken."
          />
        </div>
      ) : (
        <ListRows rahmen={false} className="border-line mt-6 border-y">
          {eintraege.map((eintrag) => (
            <ListRow
              key={eintrag.id}
              titel={formatLocalDate(eintrag.starts_at, eintrag.organization_time_zone)}
              meta={
                <>
                  <span className="text-ink block">
                    {formatLocalTimeRange(
                      eintrag.starts_at,
                      eintrag.ends_at,
                      eintrag.organization_time_zone,
                    )}
                    {' · '}
                    {slipOrt(eintrag)}
                  </span>
                  <span className="block">{staffName(eintrag)}</span>
                </>
              }
            />
          ))}
        </ListRows>
      )}

      <Kleingedrucktes className="mt-6">
        Bitte sagen Sie einen Termin rechtzeitig ab, wenn Sie ihn nicht wahrnehmen können
        {kontakt ? ` – ${kontakt}` : ''}.
      </Kleingedrucktes>
    </section>
  );
}
