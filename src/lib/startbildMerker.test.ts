import { beforeEach, describe, expect, it } from 'vitest';
import {
  STARTBILD_MERKER,
  startbildFaellig,
  startbildVormerken,
  startbildZuruecksetzen,
} from './startbildMerker';

/** Einmal je Sitzung (Handoff Rahmen vom 2026-10-05, Abschnitt 6; ANN-243). */
describe('startbildMerker', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('ist in einer neuen Sitzung fällig und nach dem Vormerken nicht mehr', () => {
    expect(startbildFaellig()).toBe(true);
    startbildVormerken();
    expect(startbildFaellig()).toBe(false);
    // Ein Wahrheitswert im Sitzungsspeicher - kein Inhalt, kein localStorage.
    expect(window.sessionStorage.getItem(STARTBILD_MERKER)).toBe('1');
    expect(window.localStorage.getItem(STARTBILD_MERKER)).toBeNull();
  });

  it('wird beim Abmelden zurückgesetzt', () => {
    startbildVormerken();
    startbildZuruecksetzen();
    expect(startbildFaellig()).toBe(true);
    expect(window.sessionStorage.getItem(STARTBILD_MERKER)).toBeNull();
  });
});
