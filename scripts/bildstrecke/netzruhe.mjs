// -----------------------------------------------------------------------------
// Netzruhe nach einem Wechsel innerhalb der Anwendung: Dort hilft `goto` mit `networkidle` nicht,
// die Bildstrecke führt die offenen Anfragen deshalb selbst.
// -----------------------------------------------------------------------------

/** Ruhig ist eine Seite, wenn so lange keine Anfrage offen war. */
export const RUHE_MS = 500;

/** Hängt die Zählung an eine Playwright-Seite; `ruhig()` sagt, ob RUHE_MS lang nichts offen war. */
export function netzBeobachten(seite) {
  const offen = new Set();
  let zuletzt = Date.now();
  const bei = (ereignis, aendern) =>
    seite.on(ereignis, (anfrage) => {
      aendern(anfrage);
      zuletzt = Date.now();
    });
  bei('request', (anfrage) => offen.add(anfrage));
  bei('requestfinished', (anfrage) => offen.delete(anfrage));
  bei('requestfailed', (anfrage) => offen.delete(anfrage));
  // Anfragen, die ein neues Dokument abbricht, meldet Chromium oft weder als fertig noch als
  // gescheitert. `framenavigated` käme auch bei jedem Wechsel im Verlauf, wo Offenes noch zählt.
  bei('domcontentloaded', () => offen.clear());
  return { ruhig: () => offen.size === 0 && Date.now() - zuletzt >= RUHE_MS };
}
