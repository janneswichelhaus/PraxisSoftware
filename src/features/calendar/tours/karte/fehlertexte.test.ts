import { describe, expect, it } from 'vitest';
import { FEHLERTEXTE } from './fehlertexte';

/**
 * Die Meldungen des Kartendienstes in der Sprache der Praxis (TER-07,
 * WRT-03, WRT-13): Sie stehen vor Therapeutin und Büro, nicht vor der
 * Entwicklung.
 */
describe('Fehlertexte des Kartendienstes', () => {
  const saetze = Object.entries(FEHLERTEXTE).map(
    ([code, text]) => [code, `${text.titel}. ${text.erklaerung}`] as const,
  );

  it.each(saetze)('%s nennt keine Einrichtungsdetails', (_code, satz) => {
    // Secrets, Umgebungsvariablen, Dateien und Funktionsnamen gehören in die
    // Entwicklerdokumentation.
    expect(satz).not.toMatch(
      /Secret|LOCATION_|PTV_|\.env|Repository|Serverschlüssel|Routenfunktion|ADR-/,
    );
  });

  it.each(saetze)('%s spricht mit „Sie" oder unpersönlich, nie mit „du"', (_code, satz) => {
    expect(satz).not.toMatch(/\b(du|dich|dir|dein\w*|Melde)\b/);
  });

  it.each(saetze)('%s nutzt den Gedankenstrich „–" (WRT-07)', (_code, satz) => {
    expect(satz).not.toContain('—');
  });

  it('nennt die Auslastung nicht „Kontingent" - das ist in der Praxis die Verordnung', () => {
    expect(FEHLERTEXTE.rate_limited.titel).not.toMatch(/Kontingent/);
    expect(FEHLERTEXTE.rate_limited.titel).toBe('Der Kartendienst ist gerade ausgelastet');
  });

  it('bleibt beim Schuldigen: Ohne Antwort der eigenen Berechnung war es nicht der Kartendienst (BEF-027)', () => {
    expect(FEHLERTEXTE.function_unavailable.erklaerung).toMatch(
      /Kartendienst wurde .*nicht gefragt/,
    );
  });
});
