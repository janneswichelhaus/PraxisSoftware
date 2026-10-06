import { NavLink } from 'react-router-dom';
import { BEGRIFFE } from '@/lib/begriffe';

/**
 * Die zwei Seiten hinter „Sicherheit und Aufbewahrung" (Handoff Rahmen vom
 * 2026-10-05, RAH-005).
 *
 * Bis dahin standen Protokoll und Aufbewahrung als zwei Punkte im Untermenü
 * von Organisatorisches; am Telefon machte das die Leiste um einen Bildschirm
 * länger. Jetzt ist es ein Punkt, und die beiden Seiten wechseln hier - mit
 * denselben Adressen wie zuvor, damit Lesezeichen und Tests gelten.
 *
 * Pillen wie die Bereiche der Akte (`PatientRecordLayout`): Auswahl ist
 * „Akzentfläche, Hauptfarbe, 600", kein zweiter Unterstrich unter dem des
 * Untermenüs. Kein `<ul>`: Die Seiten darunter nennen ihre Ergebniszeilen als
 * `listitem`, und eine Liste im Kopf zählte dort mit.
 */
const reiter =
  'text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft ' +
  'aria-[current=page]:text-accent text-liste flex min-h-11 items-center px-3 whitespace-nowrap ' +
  'transition-colors aria-[current=page]:font-semibold';

export function SicherheitReiter() {
  return (
    <nav aria-label="Sicherheit und Aufbewahrung" className="mb-4 flex gap-1 overflow-x-auto">
      <NavLink to="/praxis/sicherheit/audit" end className={reiter}>
        {BEGRIFFE.protokoll}
      </NavLink>
      <NavLink to="/praxis/sicherheit/aufbewahrung" end className={reiter}>
        Aufbewahrung
      </NavLink>
    </nav>
  );
}
