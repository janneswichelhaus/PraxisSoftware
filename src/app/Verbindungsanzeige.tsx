import { useIstVerbunden } from './verbindung';

/**
 * Zeigt an, wenn das Gerät keine Netzverbindung hat (UI-000).
 *
 * Der Anlass ist der Hausbesuch: im Treppenhaus reißt die Verbindung ab, und
 * ohne Hinweis merkt man das erst, wenn ein Speichern fehlschlägt — im
 * schlimmsten Fall mit einem Dokumentationstext im Feld. Die Anzeige sagt es
 * vorher.
 *
 * Sie ist ausdrücklich **keine Offline-Fähigkeit**: nichts wird
 * zwischengespeichert, nichts synchronisiert, es gibt keinen Service Worker
 * (ADR-015 Punkt 16). Der begrenzte Offline-Modus aus ADR-001 ist ein eigenes
 * Vorhaben; hier steht nur die Anzeige.
 *
 * ANN-015: Quelle ist allein `navigator.onLine` — der Haken dafür steht in
 * `verbindung.ts`, weil ihn seit UX-009 auch der Textverlust-Schutz in den
 * Dokumentationsformularen braucht. Kein Ping gegen den Server, kein
 * Abfragetakt; der Preis dafür steht im Register: ein Gerät hinter einem
 * Anmeldeportal gilt als verbunden.
 *
 * Deshalb ist der Text zurückhaltend formuliert. Er behauptet nicht, dass der
 * Server erreichbar ist — er sagt nur, was das Gerät meldet.
 */

export function Verbindungsanzeige() {
  const verbunden = useIstVerbunden();

  // Im Normalfall steht hier nichts Sichtbares. Eine dauerhafte
  // „verbunden"-Anzeige wäre Rauschen: sie stünde 99 Prozent der Zeit da und
  // würde genau dann übersehen, wenn sie umschlägt.
  //
  // Die Zeile selbst steht aber immer im Baum, nur ihr Inhalt wechselt
  // (NAV-11): Eine Live-Region, die erst zusammen mit ihrem Text entsteht,
  // sagt Vorlesesoftware unzuverlässig an - sie muss den Bereich schon
  // kennen, bevor sich darin etwas ändert.
  return (
    <div role="status" className="nicht-drucken">
      {verbunden ? null : (
        // Ohne eigenen Rand (TOK-09): Die weiche Fläche setzt sich vom Kopf
        // darunter ab; ein Rand in abgeleiteter Deckkraft stand außerhalb der
        // Palette.
        <div className="bg-warnung-soft text-warnung px-5 py-2 text-sm">
          {/* Der Hinweis ist Fließtext und begrenzt sich deshalb selbst auf ein
              lesbares Maß — die Seitenbreite tut das seit UI-001 nicht mehr. */}
          <span className="block max-w-prose">
            {/* Das Zeichen der Warnung wie im Badge (DS-001): Farbe trägt nie
                allein. Für Vorlesesoftware ausgeblendet, der Satz sagt es. */}
            <span aria-hidden="true" className="mr-1.5 font-semibold">
              !
            </span>
            <strong className="font-semibold">Keine Verbindung.</strong> Änderungen lassen sich
            gerade nicht speichern. Bitte den Text im Feld stehen lassen, bis die Verbindung zurück
            ist.
          </span>
        </div>
      )}
    </div>
  );
}
