/**
 * Gate: Die Menge der Aktionen des Auditlogs ändert sich nur mit Freigabe
 * (LOG-EPIC-001, ADR-010).
 *
 * `supabase/audit-aktionen.txt` ist der abschließende Katalog: eine Aktion je
 * Zeile, deckungsgleich mit der Check-Constraint `audit_log_action_check` und
 * mit `AUDIT_ACTIONS` (beides prüfen Tests). Dieses Skript vergleicht die
 * Datei des Pull Requests mit der Basis. Weicht die Menge ab, ist der Lauf rot
 * - außer der Pull Request trägt das Label `freigabe-audit` und es zuletzt
 * gesetzt hat die freigebende Person (der Inhaber des Repositorys). Neue
 * Protokollierung braucht eine ADR-Änderung und diese Freigabe.
 *
 * Bewusst ohne Abhängigkeiten, wie `migrationen-check.mjs`.
 *
 * Aufruf: `node scripts/audit-aktionen-check.mjs <basis>`. Für die Freigabe
 * liest es `GITHUB_TOKEN`, `REPOSITORY`, `PR_NUMMER` und `FREIGEBENDE`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const KATALOG = 'supabase/audit-aktionen.txt';
export const LABEL = 'freigabe-audit';

/** Die Aktionen einer Katalogdatei; Leerzeilen und `#`-Kommentare zählen nicht. */
export function aktionen(text) {
  return new Set(
    text
      .split('\n')
      .map((zeile) => zeile.replace(/#.*/, '').trim())
      .filter(Boolean),
  );
}

/** Was hinzukam und was wegfiel. */
export function unterschied(basis, kopf) {
  return {
    neu: [...kopf].filter((a) => !basis.has(a)).sort(),
    entfallen: [...basis].filter((a) => !kopf.has(a)).sort(),
  };
}

/**
 * Freigegeben, wenn das Label am Pull Request steht und das letzte Setzen
 * dieses Labels von der freigebenden Person kam.
 *
 * @param {{ event: string, label?: { name: string }, actor?: { login: string } }[]} ereignisse
 * @param {string[]} labels - die Labels, die jetzt am Pull Request stehen
 * @param {string} freigebende - Login der Person, die freigeben darf
 */
export function freigegeben(ereignisse, labels, freigebende) {
  if (!labels.includes(LABEL)) return false;
  const gesetzt = ereignisse.filter((e) => e.event === 'labeled' && e.label?.name === LABEL);
  const letztes = gesetzt.at(-1);
  return letztes !== undefined && letztes.actor?.login?.toLowerCase() === freigebende.toLowerCase();
}

function git(...argumente) {
  return execFileSync('git', argumente, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

async function holen(pfad, token) {
  const ergebnis = [];
  for (let seite = 1; seite <= 10; seite += 1) {
    const antwort = await fetch(`https://api.github.com${pfad}?per_page=100&page=${seite}`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
    });
    if (!antwort.ok) throw new Error(`GitHub-API ${pfad}: ${antwort.status}`);
    const teil = await antwort.json();
    ergebnis.push(...teil);
    if (teil.length < 100) break;
  }
  return ergebnis;
}

async function main() {
  const basisRef = process.argv[2] || 'origin/main';
  const basis = git('merge-base', basisRef, 'HEAD').trim();
  let basisText = '';
  try {
    basisText = git('show', `${basis}:${KATALOG}`);
  } catch {
    // Die Basis kennt den Katalog noch nicht: Er entsteht mit diesem Pull
    // Request (LOG-EPIC-001) und gilt ab dann.
    console.log(`Katalog-Gate gruen: ${KATALOG} entsteht mit dieser Aenderung.`);
    return;
  }
  const { neu, entfallen } = unterschied(
    aktionen(basisText),
    aktionen(readFileSync(KATALOG, 'utf8')),
  );
  if (neu.length === 0 && entfallen.length === 0) {
    console.log('Katalog-Gate gruen: die Aktionen des Auditlogs sind unveraendert.');
    return;
  }

  const { GITHUB_TOKEN, REPOSITORY, PR_NUMMER, FREIGEBENDE } = process.env;
  let frei = false;
  if (GITHUB_TOKEN && REPOSITORY && PR_NUMMER && FREIGEBENDE) {
    const ereignisse = await holen(`/repos/${REPOSITORY}/issues/${PR_NUMMER}/events`, GITHUB_TOKEN);
    const labels = (
      await holen(`/repos/${REPOSITORY}/issues/${PR_NUMMER}/labels`, GITHUB_TOKEN)
    ).map((l) => l.name);
    frei = freigegeben(ereignisse, labels, FREIGEBENDE);
  }

  const zeilen = [...neu.map((a) => `  + ${a}`), ...entfallen.map((a) => `  - ${a}`)];
  if (frei) {
    console.log(`Katalog-Gate gruen mit Freigabe (${LABEL}):\n${zeilen.join('\n')}`);
    return;
  }
  console.error(
    `Katalog-Gate rot: Die Aktionen des Auditlogs aendern sich ohne Freigabe.\n${zeilen.join('\n')}\n` +
      `Neue Protokollierung nur mit ADR-010-Aenderung und dem Label "${LABEL}", ` +
      'gesetzt von der freigebenden Person.',
  );
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
