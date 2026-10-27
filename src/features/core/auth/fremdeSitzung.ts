/**
 * Der Hinweis, wenn beim Öffnen eines Links schon jemand angemeldet ist
 * (AUTH-04).
 *
 * Bis UXR-002 behauptete er fest, der Link gehöre zu einem **anderen** Zugang
 * und Eingaben gingen verloren. Vor dem Einlösen weiß die Seite aber nicht,
 * wem der Link gehört - und der häufigste Fall ist der eigene: am
 * Praxisrechner angefordert, am eigenen, angemeldeten Telefon geöffnet. Dann
 * endet keine Sitzung, der `SessionProvider` räumt bei gleicher Kennung
 * nichts ab. Der Satz nennt deshalb das angemeldete Konto und sagt, was
 * **wenn** geschieht.
 *
 * Die Adresse steht nur hier, auf dem Gerät, auf dem das Konto ohnehin
 * angemeldet ist - sie verrät niemandem etwas Neues.
 */
export function hinweisAngemeldet(konto: string | undefined): string {
  const wer = konto
    ? `Auf diesem Gerät ist ${konto} angemeldet.`
    : 'Auf diesem Gerät ist bereits ein Konto angemeldet.';
  return `${wer} Gehört der Link zu einem anderen Konto, endet diese Sitzung; nicht gespeicherte Eingaben gehen dann verloren.`;
}
