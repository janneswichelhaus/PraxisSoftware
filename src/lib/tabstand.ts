// Der Stand eines laufenden Vorgangs im Tab: Die Adresse trägt nur seine Kennung, damit sie und jeder
// Rückweg dorthin kurz bleiben (ANN-574). Nur Kennungen, keine Namen; je Konto, und er fällt mit dem
// Tab, beim Abmelden und beim Kontowechsel.

const PRAEFIX = 'tabstand:';

function speicher(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function schluessel(konto: string, vorgang: string): string {
  return `${PRAEFIX}${konto}:${vorgang}`;
}

export function tabstandLegen(konto: string, vorgang: string, stand: unknown): void {
  try {
    speicher()?.setItem(schluessel(konto, vorgang), JSON.stringify(stand));
  } catch {
    // Ohne Speicher (privates Fenster, voll) übersteht der Stand nur kein Neuladen.
  }
}

/** Der abgelegte Stand, noch ungeprüft: Seine Form prüft, wer ihn liest. */
export function tabstandLesen(konto: string, vorgang: string): unknown {
  try {
    const wert = speicher()?.getItem(schluessel(konto, vorgang));
    return wert ? (JSON.parse(wert) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** Leert alle Stände, außer denen eines Kontos oder nur dem eines seiner Vorgänge. */
export function tabstaendeLeeren(ausser?: { konto: string; vorgang?: string }): void {
  const ablage = speicher();
  if (!ablage) return;
  const behalten = (key: string) =>
    ausser !== undefined &&
    (ausser.vorgang === undefined
      ? key.startsWith(`${PRAEFIX}${ausser.konto}:`)
      : key === schluessel(ausser.konto, ausser.vorgang));
  try {
    // Erst sammeln, dann löschen: Beim Löschen ändert sich die Reihenfolge der Schlüssel.
    const weg: string[] = [];
    for (let i = 0; i < ablage.length; i += 1) {
      const key = ablage.key(i);
      if (key?.startsWith(PRAEFIX) && !behalten(key)) weg.push(key);
    }
    for (const key of weg) ablage.removeItem(key);
  } catch {
    // Ohne Speicher liegt nichts, das zu leeren wäre.
  }
}
