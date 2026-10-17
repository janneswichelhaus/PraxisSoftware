import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { todayInTimeZone } from '@/features/appointments/api';
import { CheckupErinnerung } from '@/features/fleet/CheckupHinweise';
import { Arbeitszeitantraege } from '@/features/open-points/Arbeitszeitantraege';
import { Erstattungen } from '@/features/open-points/Erstattungen';
import { RaederMitProblem } from '@/features/open-points/RaederMitProblem';
import { Urlaubsantraege } from '@/features/open-points/Urlaubsantraege';
import { eingangsrechte } from '@/features/open-points/eingang';
import { LadestromVorschlaege } from '@/features/reimbursements/LadestromVorschlaege';
import { isTherapyStaff, type CurrentUser } from '@/features/session/types';
import { useMeldungAusVerlauf } from '@/lib/meldung';
import { MeineAntraege } from './MeineAntraege';
import { EINGANG, NEUER_ANTRAG } from './pfade';

/**
 * Eingang von Organisation (ORG-004, ANN-604): was im Team, an den Rädern und
 * in den eigenen Anträgen offen ist.
 *
 * Dieselben Gruppen und Abfragen wie „Offene Punkte" (ANN-450) - die
 * Übersicht bleibt der Ort, an dem man alles sieht, was zu tun ist (ADR-024
 * Punkt 10); hier steht der organisatorische Ausschnitt daraus, dazu die
 * eigenen Anträge und der eine Einstieg in jeden neuen Antrag.
 *
 * Nichts hier bewertet eine Person (§20): Die Listen zeigen offene Vorgänge,
 * keine Zählung je Person. Der Ladestrom (ORG-008) steht nur für die eigene
 * Person, fertig gerechnet, mit dem Sprung in den Antrag.
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
      <LadestromVorschlaege rueckweg={EINGANG} />
      <MeineAntraege heute={heute} />
    </>
  );
}
