import type { ReactNode } from 'react';

/**
 * Die Knöpfe am Ende eines Formulars (Design-Fundament, DESIGN.md Seitentyp
 * „Formular“, Lücke 9.5).
 *
 * Bis dahin stand die Knopfzeile in jeder Datei neu - `mt-6` hier, `mt-8`
 * dort, mal mit, mal ohne Umbruch, und am Telefon zwei halbe Knöpfe
 * nebeneinander, deren Wörter umbrachen. Jetzt gilt:
 *
 *   * **Reihenfolge:** Hauptknopf zuerst, dann Sekundär, dann leise
 *     („Abbrechen“); so liest die Tastatur sie auch.
 *   * **Am Telefon untereinander in voller Breite**, 48 px hoch: der
 *     Hauptknopf liegt im Daumenbereich und ist nicht zu verfehlen. Ab 640 px
 *     nebeneinander, so breit wie ihr Text.
 *   * 32 px Abstand zum letzten Feld; mit `trenner` eine Linie darüber (nach
 *     langen Bögen).
 *   * `zusatz`: ein Satz über den Knöpfen, der sagt, was der Hauptknopf
 *     bewirkt („Schreibt den Eintrag als Version 1 fest …“) - nur, wenn die
 *     Folge nicht offensichtlich ist.
 *
 * Für Arbeitsseiten mit langem Textfeld ist die klebende `Aktionsleiste` da.
 */
export function Formularfuss({
  children,
  zusatz,
  trenner = false,
}: {
  children: ReactNode;
  zusatz?: ReactNode;
  trenner?: boolean;
}) {
  return (
    <div className={trenner ? 'border-line mt-8 border-t pt-6' : 'mt-8'}>
      {zusatz ? <div className="text-ink-muted mb-3 max-w-prose text-sm">{zusatz}</div> : null}
      <div className="flex flex-col gap-3 *:w-full sm:flex-row sm:flex-wrap sm:items-center sm:*:w-auto">
        {children}
      </div>
    </div>
  );
}
