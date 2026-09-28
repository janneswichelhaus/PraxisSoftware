import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { readEnv } from '@/lib/env';
import { Vollseite } from './Vollseite';

/**
 * Was ein Renderfehler zeigt (FIX-EPIC-003).
 *
 * Ein Data Router fängt einen geworfenen Fehler selbst ab. Ohne eigenes
 * `errorElement` zeigt er dabei seine eingebaute Seite — englisch, mit
 * Stacktrace, auch im Produktionsbuild. Das wäre in einer Praxis mit
 * Gesundheitsdaten die falsche Antwort gleich zweimal: unverständlich für die
 * Person davor (`PROJECT_PRINCIPLES.md` §13) und gesprächiger, als ein
 * Fehlerbild sein muss (ADR-011).
 *
 * Kein „Erneut versuchen": Was geworfen hat, wirft nach einem Neurendern
 * wieder. Neu geladen wird deshalb das Dokument, nicht die Komponente - seit
 * UXR-002 aber mit einem Knopf auf der Seite (AUTH-15). Bis dahin bat sie
 * darum, die Anwendung neu zu laden, und bot nichts dafür an; am Telefon, mit
 * Handschuhen, ist die Geste des Browsers dafür schwer zu finden.
 */
export function Absturzseite({
  neuLaden = () => window.location.reload(),
}: {
  /** Nur für Tests austauschbar; die Anwendung lädt das Dokument neu. */
  neuLaden?: () => void;
}) {
  return (
    <Vollseite titel="Seite konnte nicht angezeigt werden">
      <ErrorState
        title="Da ist etwas schiefgegangen."
        description="Bitte laden Sie die Anwendung neu. Ihre gespeicherte Arbeit bleibt unverändert erhalten."
      />
      <Button className="mt-4 w-full" onClick={neuLaden}>
        Neu laden
      </Button>
    </Vollseite>
  );
}

/**
 * Die Seite bei unvollständiger Konfiguration (AUTH-15).
 *
 * Im Betrieb sagt sie, an wen man sich wendet; die Namen der fehlenden
 * Variablen stehen nur in der Entwicklung darunter.
 */
function KonfigurationFehlt({ meldung }: { meldung: string }) {
  return (
    <Vollseite titel="Anwendung nicht eingerichtet">
      <ErrorState
        title="Die Anwendung ist nicht vollständig eingerichtet."
        description="Bitte wenden Sie sich an die Praxisinhaber:in."
      />
      {import.meta.env.DEV && meldung ? (
        <p className="text-ink-muted mt-4 text-sm">{meldung}</p>
      ) : null}
    </Vollseite>
  );
}

/** Die Meldung einer unvollständigen Konfiguration - oder `null`, wenn sie stimmt. */
function konfigurationsfehler(): string | null {
  try {
    readEnv();
    return null;
  } catch (fehler) {
    return fehler instanceof Error ? fehler.message : '';
  }
}

/**
 * Fängt, was oberhalb des Routers scheitert (AUTH-15).
 *
 * Renderfehler der Seiten fängt der Router selbst (`errorElement`). Was
 * darüber scheitert - der `SessionProvider` beim ersten Zugriff auf den
 * Anmeldedienst -, fing bis UXR-002 niemand: React hängte den Baum ab, zu
 * sehen war eine leere Fläche ohne Absender, und der Grund stand nur in der
 * Konsole.
 *
 * Der häufigste Grund ist eine unvollständige Konfiguration - ein
 * fehlerhafter Build, eine falsche Umgebung. Geprüft wird sie erst im
 * Fehlerfall: Der Normalfall kommt ohne zweiten Blick aus, und Tests ohne
 * Konfiguration bleiben davon unberührt. Jeder andere Fehler an dieser Stelle
 * zeigt die Absturzseite.
 */
export class Startfehlergrenze extends Component<
  { children: ReactNode },
  { gescheitert: boolean }
> {
  override state = { gescheitert: false };

  static getDerivedStateFromError(): { gescheitert: boolean } {
    return { gescheitert: true };
  }

  override render(): ReactNode {
    if (!this.state.gescheitert) return this.props.children;
    const meldung = konfigurationsfehler();
    return meldung === null ? <Absturzseite /> : <KonfigurationFehlt meldung={meldung} />;
  }
}
