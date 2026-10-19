// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { vorDerFlaeche } from './flaeche';

/**
 * Die Chatfläche misst neu, wenn sich über ihr etwas ändert (BEF-187): Kopf
 * mit dem Hinweis ohne Netz, die Unterleiste über der Liste. Den Ablauf am
 * Bildschirm prüft `teamchat.spec.ts` bei 375 × 667; hier, was beobachtet wird.
 */

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Was vor der Chatfläche steht (BEF-187)', () => {
  it('nennt auf jeder Ebene die Geschwister davor, nichts danach und nichts darin', () => {
    document.body.innerHTML = `
      <a id="sprung"></a>
      <div id="spalte">
        <div id="kopf"><div id="hinweis"></div></div>
        <main id="inhalt">
          <div id="unterleiste"></div>
          <div id="flaeche"><div id="gespraech"></div></div>
          <div id="danach"></div>
        </main>
      </div>
      <nav id="tableiste"></nav>`;
    const ids = vorDerFlaeche(document.getElementById('flaeche')!).map((el) => el.id);
    expect(ids.sort()).toEqual(['kopf', 'sprung', 'unterleiste']);
  });
});
