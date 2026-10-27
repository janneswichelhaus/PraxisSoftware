import type { OhneNetz } from '@/features/core';
import { LokaleDokumentation } from './LokaleDokumentation';
import { entwuerfeLesen } from './entwuerfe';
import { einrichtungLesen } from './servicePhone';
import { tagesplanLesen } from './tagesplan';

/**
 * Was die Sitzungssperre ohne Netz für ein Praxiskonto öffnen kann (OFF-003, ANN-363,
 * ADR-024 Punkt 9, ADR-025 Punkt 16): Tagesplan von heute und die eigenen
 * Entwürfe auf dem eingerichteten Diensttelefon. Sonst nichts - keine Akte,
 * kein Kalender, nichts vom Server.
 */
export function praxisOhneNetz(besitzer: string): OhneNetz {
  return {
    einleitung:
      'Ohne Verbindung öffnet Ihr Passkey nur, was auf diesem Gerät liegt: Ihren Tagesplan von heute und Ihre Entwürfe zur Dokumentation. Alles andere kommt mit der Verbindung zurück.',
    hatAblage: async () =>
      (await entwuerfeLesen(besitzer)).length > 0 ||
      (Boolean(await einrichtungLesen(besitzer)) && (await tagesplanLesen(besitzer)) !== null),
    ansicht: (sperren) => <LokaleDokumentation besitzer={besitzer} onSperren={sperren} />,
  };
}
