/**
 * Vertretung auf der Plattform (POR-EPIC-001b, ADR-023 Punkte 13 bis 15).
 *
 * Die Wörter für Arten und Grundlagen und der **Wortlaut der Einwilligung zur
 * Begleitung** stehen hier, weil Praxis und Plattform sie beide zeigen. Die
 * Plattform darf nur `src/lib` und Komponenten importieren
 * (`src/features/platform/trennung.test.ts`).
 *
 * ANN-206: Der Wortlaut ist ein Vorschlag bis zur Prüfung in B2. Er ist
 * versioniert: Die Datenbank kennt die geltende Fassung
 * (`app.platform_companion_consent_version`), ein Test hält beide gleich. Wer
 * den Text ändert, vergibt eine neue Kennung — eine erteilte Einwilligung
 * bleibt an ihrer Fassung.
 */

export type Vertretungsart = 'legal_representative' | 'companion';
export type Rechtsgrundlage = 'custody' | 'guardianship' | 'power_of_attorney';
export type Nachweisdokument =
  'identity_document' | 'custody_proof' | 'guardianship_certificate' | 'power_of_attorney';

export const VERTRETUNGSART: Record<Vertretungsart, string> = {
  legal_representative: 'Rechtliche Vertretung',
  companion: 'Begleitung',
};

export const RECHTSGRUNDLAGE: Record<Rechtsgrundlage, string> = {
  custody: 'Sorgerecht',
  guardianship: 'Betreuung',
  power_of_attorney: 'Vorsorgevollmacht',
};

/** Was die Praxis angesehen hat — nie gespeichert, nur vermerkt (ANN-205). */
export const NACHWEISDOKUMENT: Record<Nachweisdokument, string> = {
  identity_document: 'Ausweis der vertretenden Person',
  custody_proof: 'Sorgerechtsnachweis',
  guardianship_certificate: 'Betreuerausweis',
  power_of_attorney: 'Vollmacht',
};

/** Das Dokument, das eine rechtliche Vertretung belegt. */
export function vollmachtsdokument(grundlage: Rechtsgrundlage): Nachweisdokument {
  if (grundlage === 'custody') return 'custody_proof';
  if (grundlage === 'guardianship') return 'guardianship_certificate';
  return 'power_of_attorney';
}

/** Kennung der geltenden Fassung; dieselbe steht in der Datenbank. */
export const EINWILLIGUNG_BEGLEITUNG_FASSUNG = 'begleitung-2026-10-02';

/**
 * Der Wortlaut der Einwilligung zur Begleitung (Art. 9 Abs. 2 lit. a DSGVO,
 * zugleich Entbindung von der Schweigepflicht nach § 203 StGB). Konkret:
 * Er nennt die begleitende Person, den Umfang und ob frühere Nachrichten
 * sichtbar sind (ADR-023 Punkt 13, Fassung 2).
 */
export function einwilligungBegleitung(angaben: {
  begleitung: string;
  praxis: string;
  fruehereNachrichten: boolean;
}): string[] {
  const name = angaben.begleitung.trim() || '…';
  return [
    `Ich möchte, dass ${name} mich auf der Plattform von ${angaben.praxis} begleitet und dafür ein eigenes Konto bekommt.`,
    `${name} sieht meine Termine, meine Rechnungen und die Unterlagen, die die Praxis für mich freigibt, und kann für mich Terminwünsche und Nachrichten an die Praxis schreiben.`,
    angaben.fruehereNachrichten
      ? `${name} sieht auch meine früheren Nachrichten mit den Antworten der Praxis.`
      : `${name} sieht nur Nachrichten ab heute, nicht meine früheren.`,
    `${name} kann für mich keine Einwilligung erteilen oder widerrufen und keine Kopie meiner Daten anfordern. Befund und Behandlungsdokumentation sieht ${name} nicht.`,
    `Dafür entbinde ich die Praxis gegenüber ${name} von der Schweigepflicht.`,
    'Die Einwilligung ist freiwillig. Ohne sie behandelt mich die Praxis genauso. Ich kann sie jederzeit widerrufen, bei der Praxis oder, wenn ich ein eigenes Konto habe, unter „Ich“. Der Widerruf gilt ab dann.',
  ];
}
