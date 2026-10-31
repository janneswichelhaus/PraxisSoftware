import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { CheckupErinnerung } from '@/features/fleet';
import { Arbeitszeitantraege } from '@/features/workplace/open-points/Arbeitszeitantraege';
import { Erstattungen } from '@/features/workplace/open-points/Erstattungen';
import { RaederMitProblem } from '@/features/workplace/open-points/RaederMitProblem';
import { Urlaubsantraege } from '@/features/workplace/open-points/Urlaubsantraege';
import { eingangsrechte } from '@/features/workplace/open-points/eingang';
import { RueckmeldungenImEingang } from '@/features/workplace/feedback/RueckmeldungenImEingang';
import { isTherapyStaff, type CurrentUser } from '@/features/core';
import { useMeldungAusVerlauf } from '@/lib/meldung';
import { MeineAntraege } from './MeineAntraege';
import { EINGANG, NEUER_ANTRAG } from '@/lib/eingang';
import { todayInTimeZone } from '@/lib/datum';

/**
 * Eingang von Organisation (ANN-604): der organisatorische Ausschnitt aus „Offene Punkte"
 * (ANN-450, ADR-024 Punkt 10) mit den eigenen Anträgen. Nichts hier bewertet eine Person (§20):
 * Die Listen zeigen offene Vorgänge, keine Zählung je Person.
 */
export function EingangPage({ user }: { user: CurrentUser }) {
  const zone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zone);
  const darf = eingangsrechte(user);
  const flotte = isTherapyStaff(user.roles);
  // Die Bestätigung eines Antrags aus dem Eingang, einmal (Überholung 9).
  const { meldung } = useMeldungAusVerlauf();

  return (
    <>
      <PageHeader
        title="Eingang"
        actions={<ButtonLink to={NEUER_ANTRAG}>Neuer Antrag</ButtonLink>}
      />
      {meldung ? (
        <Rueckmeldung key={meldung.schluessel} className="mb-6">
          {meldung.text}
        </Rueckmeldung>
      ) : null}
      {darf.urlaubsantraege ? <Urlaubsantraege heute={heute} rueckweg={EINGANG} /> : null}
      {darf.arbeitszeitantraege ? <Arbeitszeitantraege rueckweg={EINGANG} /> : null}
      {darf.erstattungen ? <Erstattungen rueckweg={EINGANG} /> : null}
      {flotte ? <CheckupErinnerung heute={heute} zone={zone} /> : null}
      {darf.raeder ? <RaederMitProblem /> : null}
      {/* ORG-006: Barometer und Rückmeldung an die Praxisleitung; für owner
          die namentlichen Rückmeldungen (§20.2). */}
      <RueckmeldungenImEingang />
      <MeineAntraege heute={heute} />
    </>
  );
}
