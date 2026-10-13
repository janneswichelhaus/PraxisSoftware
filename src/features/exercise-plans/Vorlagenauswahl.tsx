import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { vorlagenListe } from './vorlagen';

/**
 * „Aus Vorlage" (Welle B): die mitgelieferten Zusammenstellungen als Zeilen,
 * nach Name. Ein Tipp fügt alle Übungen der Vorlage mit ihrer Dosierung zum
 * Entwurf hinzu.
 *
 * **Bekommt nur die Vorlagen** - keinen Plan, keine Person, keine Diagnose
 * (ADR-006 Punkt 10). Die Liste sieht für jede Person gleich aus;
 * `Plaene.test.tsx` hält das fest.
 */
export function Vorlagenauswahl({
  vorlagen,
  onWaehlen,
  onSchliessen,
}: {
  vorlagen: readonly Katalogvorlage[];
  onWaehlen: (vorlage: Katalogvorlage) => void;
  onSchliessen: () => void;
}) {
  return (
    <Dialogfenster titel="Aus Vorlage" onSchliessen={onSchliessen}>
      <ListRows>
        {vorlagenListe(vorlagen).map((vorlage) => (
          <ListRow
            key={vorlage.schluessel}
            titel={vorlage.name}
            meta={`${vorlage.uebungen.length === 1 ? '1 Übung' : `${vorlage.uebungen.length} Übungen`} · ${vorlage.ziel}`}
            onClick={() => onWaehlen(vorlage)}
          />
        ))}
      </ListRows>
    </Dialogfenster>
  );
}
