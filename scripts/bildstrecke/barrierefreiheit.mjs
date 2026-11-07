// Barrierefreiheit je Seite (G17) für Bildstrecke und barrierefreiheit.spec.ts: axe mit Kontrast
// nach WCAG 2.1 A/AA und Ziele unter 44 px am Telefon (DESIGN.md Grundsatz 3).
import { createRequire } from 'node:module';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Steht die Bewegung? Mitten in einer Einblendung rechnet axe zu schwachen Kontrast. */
async function bewegungAbwarten(seite) {
  await seite
    .waitForFunction(
      () =>
        // eslint-disable-next-line no-undef -- laeuft im Browser
        document
          .getAnimations()
          .filter((b) => b.effect?.getTiming().iterations !== Infinity)
          .every((b) => !b.pending && b.playState !== 'running'),
      null,
      { timeout: 3_000 },
    )
    .catch(() => undefined);
}

/** axe-Verstöße als kurze Zeilen: Regel, Zahl der Stellen, erste Stelle. */
export async function axeVerstoesse(seite) {
  await bewegungAbwarten(seite);
  // eslint-disable-next-line no-undef -- laeuft im Browser
  const vorhanden = await seite.evaluate(() => 'axe' in window);
  if (!vorhanden) await seite.addScriptTag({ path: AXE });
  const verstoesse = await seite.evaluate(async (tags) => {
    // eslint-disable-next-line no-undef -- laeuft im Browser
    const ergebnis = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return ergebnis.violations.map((v) => ({
      id: v.id,
      stellen: v.nodes.map((n) => n.target.join(' ')).slice(0, 3),
      zahl: v.nodes.length,
      beispiel: (v.nodes[0]?.html ?? '').replace(/\s+/g, ' ').slice(0, 120),
    }));
  }, WCAG_TAGS);
  return verstoesse.map((v) => `${v.id} (${v.zahl}×): ${v.stellen[0] ?? ''} – ${v.beispiel}`);
}

/**
 * Bedienelemente unter 44 px Höhe oder Breite. Ein Kästchen zählt mit seiner
 * Zeile. Ausgenommen nach WCAG 2.5.8: ein Link im Fließtext, Kacheln im
 * Zeitraster (ihre Höhe ist die Dauer) und die Wochenpfeile (ANN-849).
 */
/* eslint-disable no-undef -- laeuft im Browser */
export function kleineZiele() {
  const funde = [];
  const auswahl =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [role="option"]';
  for (const el of document.querySelectorAll(auswahl)) {
    if (el.closest('[aria-hidden="true"], [inert], .sr-only, [data-druckblatt]')) continue;
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    if (el.closest('[style*="top"][style*="height"]')) continue;
    if (el.matches('nav[aria-label="Tag wählen"] > a')) continue;
    if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue;
    const stil = getComputedStyle(el);
    if (el.matches('a') && stil.display === 'inline') {
      const umgebung = el.parentElement?.innerText?.trim() ?? '';
      if (umgebung.length > (el.innerText ?? '').trim().length + 1) continue;
    }
    const ziel = el.matches('input[type="radio"], input[type="checkbox"]')
      ? (el.closest('label') ?? el)
      : el.matches('.hero-ziel')
        ? (el.closest('section') ?? el)
        : el;
    const box = ziel.getBoundingClientRect();
    if (box.width <= 2 || box.height <= 2) continue;
    if (box.height < 43.5 || box.width < 43.5) {
      const name = (
        ziel.getAttribute('aria-label') ||
        ziel.innerText ||
        ziel.getAttribute('title') ||
        ziel.outerHTML
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      funde.push(`${Math.round(box.width)}×${Math.round(box.height)} px: ${name}`);
    }
  }
  return [...new Set(funde)].slice(0, 12);
}
/* eslint-enable no-undef */
