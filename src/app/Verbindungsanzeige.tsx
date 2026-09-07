import { useEffect, useState } from 'react';

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
 * ANN-015: Quelle ist allein `navigator.onLine`. Kein Ping gegen den Server,
 * kein Abfragetakt — das wäre eine wiederkehrende Verbindung ohne fachlichen
 * Grund und nach §18/§20 zusätzliche Daten ohne Zweck. Der Preis dafür steht
 * im Register: ein Gerät hinter einem Anmeldeportal gilt als verbunden.
 *
 * Deshalb ist der Text zurückhaltend formuliert. Er behauptet nicht, dass der
 * Server erreichbar ist — er sagt nur, was das Gerät meldet.
 */

/** Verbindungszustand des Geräts. Ausgelagert, damit Tests ihn setzen können. */
export function useIstVerbunden(): boolean {
  const [verbunden, setVerbunden] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const zeigeVerbunden = () => setVerbunden(true);
    const zeigeGetrennt = () => setVerbunden(false);
    window.addEventListener('online', zeigeVerbunden);
    window.addEventListener('offline', zeigeGetrennt);
    // Zwischen dem ersten Rendern und dem Anmelden der Ereignisse kann sich
    // der Zustand geaendert haben.
    setVerbunden(navigator.onLine);
    return () => {
      window.removeEventListener('online', zeigeVerbunden);
      window.removeEventListener('offline', zeigeGetrennt);
    };
  }, []);

  return verbunden;
}

export function Verbindungsanzeige() {
  const verbunden = useIstVerbunden();

  // Im Normalfall steht hier nichts. Eine dauerhafte „verbunden"-Anzeige wäre
  // Rauschen: sie stünde 99 Prozent der Zeit da und würde genau dann übersehen,
  // wenn sie umschlägt.
  if (verbunden) return null;

  return (
    <div
      role="status"
      className="border-warnung/30 bg-warnung-soft text-warnung nicht-drucken border-b px-5 py-2 text-sm"
    >
      <span className="mx-auto block w-full max-w-5xl">
        <strong className="font-semibold">Keine Verbindung.</strong> Änderungen lassen sich gerade
        nicht speichern. Bitte den Text im Feld stehen lassen, bis die Verbindung zurück ist.
      </span>
    </div>
  );
}
