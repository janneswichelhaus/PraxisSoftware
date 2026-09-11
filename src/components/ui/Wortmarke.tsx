import { MARKE_MINDESTHOEHE, MARKE_SEITENVERHAELTNIS } from './markeRegeln';

/**
 * Wortmarke „Own Motion".
 *
 * Zeigt die Datei aus `marke/logo/` als Bild — bewusst **kein** Inline-SVG mit
 * dem Pfad im Quelltext. Zwei Gründe:
 *
 * 1. `marke/README.md` legt fest, dass es keine zweite Fassung an anderer
 *    Stelle gibt. Ein eingebetteter Pfad im TSX wäre genau das, und er liefe
 *    still auseinander, sobald die Zeichnung sich ändert. Die ausgelieferte
 *    Datei ist byte-gleich mit der Quelle (`src/marke.test.ts`).
 * 2. Die Marke darf nicht umgefärbt werden. Die Farbe steckt in der Datei;
 *    ein Inline-SVG mit `currentColor` würde die Marke jede beliebige
 *    Textfarbe annehmen lassen — genau das Verbot.
 *
 * Der Preis dafür: die Marke erscheint nicht im Ausdruck, weil die Druckregeln
 * in `src/index.css` `header` ohnehin ausblenden und ein Bild nicht von
 * `currentColor` lebt. Für Papier ist die schwarze Fassung vorgesehen; sie
 * kommt mit der Rechnung (ABR-000).
 *
 * Maße und Regeln stehen in `markeRegeln.ts`.
 */
/**
 * Fassungen der Marke nach `marke/README.md`, Abschnitt „Dateien".
 *
 * `farbig` steht auf Papier oder heller Fläche, `papier` auf Tiefgrün oder
 * der Hauptfarbe. Umgefärbt wird nie — deshalb zwei Dateien statt einer mit
 * `currentColor`.
 */
export type Markenfassung = 'farbig' | 'papier';

const DATEI: Record<Markenfassung, string> = {
  farbig: '/marke/own-motion-block-farbig.svg',
  papier: '/marke/own-motion-block-papier.svg',
};

export function Wortmarke({
  hoehe = MARKE_MINDESTHOEHE,
  fassung = 'farbig',
  className = '',
}: {
  /** Höhe in Pixeln, mindestens 24. Die Breite folgt dem Seitenverhältnis. */
  hoehe?: number;
  /** Welche Fassung — bestimmt durch den Grund, auf dem die Marke steht. */
  fassung?: Markenfassung;
  className?: string;
}) {
  if (hoehe < MARKE_MINDESTHOEHE) {
    throw new Error(
      `Die Wortmarke braucht mindestens ${MARKE_MINDESTHOEHE} px Höhe (marke/README.md, ` +
        `Mindestgröße); ${hoehe} px wurden angefragt. Wo es kleiner werden muss, gehört ` +
        `das App-Symbol hin, nicht die verkleinerte Wortmarke.`,
    );
  }

  return (
    <img
      src={DATEI[fassung]}
      alt="Own Motion"
      // Beide Maße stehen am Element, damit der Platz schon vor dem Laden der
      // Datei stimmt und die Kopfzeile nicht springt. `width: auto` im Stil
      // lässt anschließend die Höhe führen — gedehnt wird die Marke nie.
      height={hoehe}
      width={Math.round(hoehe * MARKE_SEITENVERHAELTNIS)}
      style={{ height: hoehe, width: 'auto' }}
      // `shrink-0` gehört zur Marke, nicht zur aufrufenden Stelle: in einer
      // Flex-Zeile neben einem langen Text würde die Marke sonst gestaucht,
      // und Dehnen ist nach `marke/README.md` verboten. Heute hält das
      // Seitenverhältnis auch ohne die Klasse, weil ein Bild mit eigenen Maßen
      // nicht unter seine Inhaltsgröße schrumpft — darauf soll sich aber keine
      // künftige Kopfzeile verlassen müssen.
      className={`shrink-0 ${className}`.trim()}
    />
  );
}
