import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * jsdom kennt kein Layout und deshalb kein `scrollIntoView`.
 *
 * Die Fehlerzusammenfassung rollt das angesprungene Feld ins Bild (UX-012).
 * Ohne diese Attrappe stürbe der Aufruf in jedem Test, der einen Eintrag
 * anklickt - an der Bedienung im Browser liegt es nicht.
 */
const elementPrototyp: { scrollIntoView?: () => void } = Element.prototype;
elementPrototyp.scrollIntoView ??= () => {
  /* jsdom rollt nichts; der Aufruf muss nur überleben. */
};

afterEach(() => {
  cleanup();
});
