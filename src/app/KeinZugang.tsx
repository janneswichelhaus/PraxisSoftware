import { Navigate, useLocation } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { isStaff, type CurrentUser } from '@/features/session/types';

/**
 * Bereiche der Praxis, deren Seiten nicht jede Rolle öffnen darf. Ein Pfad
 * darunter, den die Routen für diese Rolle nicht kennen, ist kein Tippfehler,
 * sondern eine Seite ohne Zugang.
 */
const PRAXISPFADE =
  /^\/(praxis|betrieb|abrechnung|training|patienten|verordner|statistiken|uebungen|kalender|touren|termine|team|rueckfragen|offen|warteliste)(\/|$)/;

/**
 * Wohin ein unbekannter Pfad führt (ORG-001, ANN-604).
 *
 * Bis ORG-001 leitete jede Seite ohne Zugang still zur Übersicht um - wer aus
 * einem Lesezeichen oder einem Hinweis kam, stand ohne Satz woanders. Jetzt
 * sagt die Seite es und bietet den Weg zur Übersicht an. Was kein Bereich der
 * Praxis ist - etwa die Anmeldeseite nach dem Anmelden -, geht weiter still
 * dorthin. Die Grenze selbst zieht der Server (ADR-004).
 */
export function KeinZugang({ user }: { user: CurrentUser }) {
  const { pathname } = useLocation();
  // Ein Patientenkonto kennt die Bereiche der Praxis nicht - es geht still
  // zu seiner Übersicht.
  if (!isStaff(user.roles) || !PRAXISPFADE.test(pathname)) return <Navigate to="/" replace />;
  return (
    <>
      <PageHeader title="Kein Zugang" description="Diese Seite gibt es für Ihren Zugang nicht." />
      <ButtonLink to="/" variant="secondary">
        Zur Übersicht
      </ButtonLink>
    </>
  );
}
