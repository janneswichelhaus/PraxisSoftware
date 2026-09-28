/**
 * Liefert ein Aufruf ein Versprechen (UXR-001)?
 *
 * `Rueckfrage` und `ErrorState` nehmen Rückrufe, die synchron sein dürfen
 * (`() => x.mutate()`) oder ein Versprechen liefern (`() => x.mutateAsync()`,
 * `() => abfrage.refetch()`). Nur im zweiten Fall gibt es etwas abzuwarten und
 * einen Zustand „läuft" zu zeigen; ein synchroner Aufruf bleibt, wie er war.
 */
export function istVersprechen(wert: unknown): wert is PromiseLike<unknown> {
  return (
    typeof wert === 'object' &&
    wert !== null &&
    typeof (wert as { then?: unknown }).then === 'function'
  );
}
