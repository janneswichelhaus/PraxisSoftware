import { useEffect, useState } from 'react';

/**
 * Verbindungszustand des Geräts (UI-000, ANN-015).
 *
 * Eigene Datei statt eines Exports aus `Verbindungsanzeige.tsx`: Ein Modul mit
 * Komponente **und** Hook hebelt das schnelle Neuladen im Entwicklungsserver
 * aus (`react-refresh`) - dieselbe Überlegung wie bei `buttonStile.ts`. Seit
 * dem Textverlust-Schutz (UX-009) braucht ihn außerdem eine zweite Stelle: die
 * Dokumentationsformulare sagen daneben, dass ein Speichern gerade nicht
 * möglich ist.
 *
 * ANN-015: Quelle ist allein `navigator.onLine` und die Ereignisse
 * `online`/`offline`. Kein Ping gegen den Server, kein Abfragetakt - das wäre
 * eine wiederkehrende Verbindung ohne fachlichen Grund und nach §18/§20
 * zusätzliche Daten ohne Zweck. Der Preis steht im Register: ein Gerät hinter
 * einem Anmeldeportal gilt als verbunden. Deshalb behauptet kein Text an
 * dieser Quelle, der Server sei erreichbar.
 */
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
