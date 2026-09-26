import { paragraf } from '@/lib/begriffe';
import { formatDate } from '@/lib/datum';
import type { Aufbewahrungsklasse, Aufbewahrungsstand } from './api';

/**
 * Die begründete Ablehnung eines Löschverlangens (OPS-006, ADR-008).
 *
 * ADR-008 Punkt 2 stellt gesetzliche Aufbewahrungspflichten vor die reguläre
 * Löschung, und seine Konsequenzen verlangen ausdrücklich, dass das Verfahren
 * für Betroffenenrechte „diese Ablehnung begründet ausgeben" kann. Eine
 * Ablehnung ist begründet, wenn sie Grundlage, Anker und Datum nennt — nicht,
 * wenn sie auf Aufbewahrungspflichten im Allgemeinen verweist.
 *
 * Deshalb ist die Vorlage hier **kein feststehender Text**, sondern einer, der
 * aus dem Aufbewahrungsstand dieser einen Akte entsteht: Ist die Versorgung
 * nicht abgeschlossen, gibt es kein Löschdatum und der Text sagt genau das.
 * Die Fristen kommen aus `retention_classes` (ANN-001); ein geänderter
 * Aufbewahrungsplan ändert diesen Brief mit.
 *
 * Was hier **nicht** entschieden wird: ob abgelehnt wird. Das entscheidet die
 * Praxisleitung anhand des Verfahrens (`docs/datenschutz/betroffenenrechte.md`);
 * dieser Text ist der Entwurf für den Fall, dass eine Frist entgegensteht.
 */

function klasse(stand: Aufbewahrungsstand, key: string): Aufbewahrungsklasse | undefined {
  return stand.klassen.find((k) => k.key === key);
}

/** Zeitpunkt aus der Datenbank als Kalendertag der Praxiszeitzone. */
function tag(zeitpunkt: string, zeitzone: string): string {
  const datum = new Date(zeitpunkt);
  if (Number.isNaN(datum.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: zeitzone }).format(
    datum,
  );
}

/**
 * Der Entwurf des Antwortschreibens.
 *
 * Fließtext, kein Formular: Er wird kopiert, gelesen und angepasst. Die Praxis
 * setzt Briefkopf, Datum und Unterschrift selbst darunter — die Anwendung
 * verschickt nichts (B13, ANN-025).
 */
export function ablehnungstext(name: string, stand: Aufbewahrungsstand): string {
  const akte = klasse(stand, 'patientenakte');
  const abrechnung = klasse(stand, 'abrechnungsdaten');
  const teile: string[] = [];

  teile.push(`Guten Tag ${name},`);
  teile.push(
    'vielen Dank für Ihren Antrag auf Löschung Ihrer Daten. Wir haben ihn geprüft. ' +
      'Einem Teil Ihrer Daten können wir derzeit nicht entsprechen, weil wir gesetzlich ' +
      'zur Aufbewahrung verpflichtet sind. Welche Daten das sind und wie lange die ' +
      'Aufbewahrung dauert, steht nachfolgend.',
  );

  const fundstelleAkte = paragraf(akte?.legal_reference ?? null) || '§ 630f Abs. 3 BGB';
  if (!stand.versorgung_abgeschlossen_am) {
    teile.push(
      `Behandlungsdokumentation. Wir sind verpflichtet, Ihre Patientenakte aufzubewahren ` +
        `(${fundstelleAkte}). Ihre Behandlung ist bei uns nicht abgeschlossen; die ` +
        `Aufbewahrungsfrist beginnt erst mit dem Abschluss der Behandlung. Ein Termin für ` +
        `die Löschung steht deshalb noch nicht fest. Sobald die Behandlung abgeschlossen ` +
        `ist, nennen wir ihn Ihnen auf Anfrage.`,
    );
  } else {
    teile.push(
      `Behandlungsdokumentation. Wir sind verpflichtet, Ihre Patientenakte aufzubewahren ` +
        `(${fundstelleAkte}). Ihre Behandlung haben wir am ` +
        `${formatDate(stand.versorgung_abgeschlossen_am)} abgeschlossen. Die Aufbewahrungsfrist ` +
        `endet am ${formatDate(akte?.frist_ende ?? null)}; danach löschen wir diese Daten.`,
    );
  }
  teile.push(
    'Ihr Recht auf Löschung nach Art. 17 Abs. 1 DSGVO besteht für diese Daten deshalb ' +
      'nicht: Art. 17 Abs. 3 lit. b DSGVO nimmt Daten aus, deren Verarbeitung zur ' +
      'Erfüllung einer rechtlichen Verpflichtung erforderlich ist.',
  );

  if (abrechnung?.frist_ende) {
    const fundstelle = paragraf(abrechnung.legal_reference) || '§ 147 Abs. 3 AO';
    teile.push(
      `Rechnungen und Buchungsbelege. Für die Rechnungen, die wir Ihnen gestellt haben, ` +
        `gilt eine eigene steuerliche Aufbewahrungsfrist (${fundstelle}). Sie endet am ` +
        `${formatDate(abrechnung.frist_ende)}.`,
    );
  }

  if (stand.loeschsperre) {
    teile.push(
      `Laufender Vorgang. Zu Ihren Daten liegt seit dem ` +
        `${tag(stand.loeschsperre.seit, stand.zeitzone)} ein Vorgang vor, für den wir die ` +
        `Daten zusätzlich aufbewahren müssen. Wir heben diese Sperre auf, sobald der ` +
        `Vorgang abgeschlossen ist.`,
    );
  }

  teile.push(
    'Unberührt bleiben Ihre übrigen Rechte: Auskunft über die gespeicherten Daten ' +
      '(Art. 15 DSGVO), Berichtigung unrichtiger Angaben (Art. 16 DSGVO) und die ' +
      'Einschränkung der Verarbeitung (Art. 18 Abs. 1 lit. b DSGVO) — wir verarbeiten die ' +
      'Daten dann nur noch zur Aufbewahrung. Sie können sich außerdem jederzeit bei der ' +
      'zuständigen Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO).',
  );
  teile.push('Mit freundlichen Grüßen');
  teile.push('[Praxis, Ort, Datum, Unterschrift]');

  return teile.join('\n\n');
}
