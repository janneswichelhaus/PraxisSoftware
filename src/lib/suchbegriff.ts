// Der Suchbegriff einer Liste für den Weg in einen Datensatz und zurück. Meist ist er ein Name:
// nie in der Adresse (ADR-011, ADR-013 Punkt 9 Nr. 5), nur im Arbeitsspeicher. Neuladen leert
// ihn, ein Kontowechsel über `suchbegriffeLeeren` im SessionProvider.

export type Suchliste = 'patienten' | 'mitarbeitende' | 'radflotte';

const begriffe = new Map<Suchliste, string>();

export function gemerkterSuchbegriff(liste: Suchliste): string {
  return begriffe.get(liste) ?? '';
}

export function suchbegriffMerken(liste: Suchliste, wert: string): void {
  if (wert) begriffe.set(liste, wert);
  else begriffe.delete(liste);
}

export function suchbegriffeLeeren(): void {
  begriffe.clear();
}
