/**
 * Einrichtung für reine Logiktests (Projekt `logik`, ohne jsdom).
 *
 * Eine Datei, die doch ein DOM braucht, wählt es mit
 * `// @vitest-environment jsdom` in der ersten Zeile; dann gilt für sie
 * dieselbe Einrichtung wie für die Komponententests.
 */
export {};

if (typeof window !== 'undefined') await import('./test-setup');
