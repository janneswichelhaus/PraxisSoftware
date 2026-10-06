import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SubNav } from '@/components/ui/SubNav';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { type CurrentUser } from '@/features/session/types';
import { Funktionssuche } from './Funktionssuche';
import { useAbmeldeanfrage, useAbmeldung } from './abmeldeschutz';
import {
  aktiverBereich,
  arbeitsbereiche,
  istRandlos,
  mehrSymbol,
  tableiste,
  zeigtUnterleiste,
} from './navigation';
import { useSeitenwechsel } from './seitenwechsel';
import { Verbindungsanzeige } from './Verbindungsanzeige';

/**
 * Rahmen der angemeldeten Anwendung.
 *
 * Die globale Navigation zeigt ausschließlich die Arbeitsbereiche und
 * ist auf allen Seiten identisch. Alles Bereichsinterne steht als lokales
 * Untermenü direkt über dem Inhalt, damit ein Wechsel innerhalb einer Aufgabe
 * nicht durch die globale Ebene führt.
 *
 * Mobil: Kopfzeile plus Tableiste am unteren Rand, damit die Hauptbereiche mit
 * dem Daumen erreichbar sind. Ab sm: seitliche Navigation.
 *
 * **Eine Breite für alle Seiten (UI-001).** Bis 2026-09-11 bekam allein der
 * Kalender die breite Spalte, alles andere eine schmalere. Beim Wechsel
 * zwischen zwei Seiten sprang damit das ganze Gerüst — Kopfzeile, Navigation
 * und Inhalt zugleich. Das Gerüst nutzt jetzt überall die volle Fensterbreite;
 * gespart wird der Platz nirgends mehr.
 *
 * Die Lesbarkeit hängt damit nicht mehr an der Seitenbreite, sondern an der
 * Zeilenlänge: Fließtext begrenzt sich selbst auf ein lesbares Maß
 * (`max-w-prose`), Listen und Gitter dürfen die Breite nutzen. Das ist die
 * Aufteilung, die eine gemeinsame Breite überhaupt erst zulässt.
 */

/**
 * Ein Arbeitsbereich in der tiefgrünen Seitenleiste (DS-001).
 *
 * Unbenutzt steht die Beschriftung in Salbei — die einzige Stelle, an der
 * das System diese Farbe für Text zulässt, weil sie hier auf Tiefgrün liegt
 * (5.86:1). Der ausgewählte Bereich ist mit der Hauptfarbe gefüllt und trägt
 * Papier; das System nennt „Hauptfarbe gefüllt" als Auswahlzustand.
 * Gewichte nach dem Design-Handoff vom 2026-10-01: 500 in Ruhe, 600 aktiv.
 *
 * Vier Zustände, jeder an etwas anderem erkennbar (Handoff Rahmen vom
 * 2026-10-05, RAH-002): Hover hebt nur den Text auf Papier und füllt **keine**
 * Fläche mehr — bis dahin sahen Hover und Auswahl gleich aus (1,35:1
 * zwischen beiden). Die Auswahl trägt zusätzlich einen Salbei-Strich 3 px am
 * linken Rand der Leiste (`auswahlstrich`); `aria-current="page"` bleibt das
 * Zeichen, der Strich ist Darstellung.
 *
 * Zwischen 640 und 1024 px ist derselbe Eintrag ein Feld der beschrifteten
 * Symbolspalte (Variante 2b): 56 hoch, Symbol oben, darunter die Kurzform aus
 * der Tableiste in `text-leiste`. Ab lg die Zeile mit vollem Namen in 15 px.
 */
const seitenLink =
  'relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-button px-1 ' +
  'text-leiste font-medium transition-colors text-salbei hover:text-surface ' +
  'aria-[current=page]:bg-accent aria-[current=page]:font-semibold ' +
  'aria-[current=page]:text-surface ' +
  'lg:h-auto lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-liste';

/**
 * Der Strich der Auswahl: 3 px Salbei am linken Rand der Leiste, über die
 * ganze Höhe des Eintrags. Er steht am Rand der Leiste, nicht am Rand des
 * Eintrags - in der Symbolspalte fallen beide zusammen (die Einträge nehmen
 * die ganzen 84 px, 56 × 84 nach dem Handoff), in der Seitenleiste ist er um
 * deren Innenabstand (20) nach links versetzt. Die rechten Ecken rund: `pill`
 * auf 3 px Breite ergibt genau die zwei Pixel Radius des Handoffs, und das
 * System kennt keinen eigenen Radius dafür.
 */
const auswahlstrich =
  'bg-salbei w-auswahlstrich rounded-r-pill pointer-events-none absolute inset-y-0 left-0 lg:-left-5';

/**
 * Ein Ziel der Tableiste am unteren Rand (unter 640 px).
 *
 * Der aktive Bereich trägt neben Farbe und Gewicht einen Strich in der
 * Hauptfarbe am oberen Rand (NAV-04). Unter 400 px ist die Tableiste die
 * einzige Ortsangabe, und ein Unterschied nur im Farbton - ink-muted gegen
 * accent, 1,66:1 - ist am Lenker und in der Sonne kaum zu sehen. Der Strich
 * ist ein Rand, kein Schatten (DS-001); inaktiv ist er durchsichtig, damit
 * beim Wechsel nichts springt. Die Beschriftung bleibt bei 11 px (ANN-111),
 * seit RAH-001 als Token `text-leiste` (BEF-068, Option 2).
 */
const tabLink =
  'text-ink-muted aria-[current=page]:text-accent flex min-h-14 flex-col items-center justify-center ' +
  'gap-0.5 border-t-3 border-transparent px-1 text-leiste transition-colors ' +
  'aria-[current=page]:border-accent aria-[current=page]:font-semibold';

/**
 * Die Wege zum eigenen Konto in der Kopfzeile (NAV-17).
 *
 * „Mein Konto" gehört zu keinem Arbeitsbereich; bis UXR-002 zeigte deshalb
 * auf dieser Seite nichts im Rahmen, wo man ist. Dort tragen beide Wege
 * `aria-current` und den Unterstrich in der Hauptfarbe wie ein Punkt des
 * Untermenüs.
 */
const kontoLink =
  'text-ink-muted hover:text-ink min-h-11 items-center gap-1.5 border-b-2 border-transparent ' +
  'px-2 text-sm aria-[current=page]:border-accent aria-[current=page]:text-accent';

/**
 * „Abmelden" in der Kopfzeile: leise wie der Weg zum Konto (Design-Handoff
 * 2026-10-01).
 *
 * Bis dahin stand der Knopf in der Hauptfarbe und fett - auf jeder Seite das
 * lauteste Element der Kopfzeile, für den seltensten Vorgang des Tages. Jetzt
 * 14 px in 400 und `ink-muted`; das Tippziel bleibt 44 px hoch. Eigene Klassen
 * statt `Button`: Dessen Varianten sind alle fett und in der Hauptfarbe, und
 * eine vierte Variante nur für diese eine Stelle wäre ein Baustein ohne
 * zweiten Nutzer.
 *
 * Unter 640 px ein Symbolknopf 44 × 44 in `line-strong` (Handoff Rahmen vom
 * 2026-10-05, Variante 1b, RAH-003): Das Wort nahm dort neben Marke,
 * Bereichsname, Lupe und „Konto" den Platz, der dem Bereichsnamen fehlte.
 * **Ein** Knopf für beide Breiten, nicht zwei: Symbol und Wort liegen
 * nebeneinander im selben Element, und CSS blendet je Breite eines aus. Zwei
 * Knöpfe desselben Namens hießen für Vorlesesoftware zweimal „Abmelden".
 * Abstand davor: 8 am Telefon, 24 ab sm (zuzüglich der 2 px der Reihe).
 */
const abmeldeKnopf =
  'nicht-drucken text-line-strong hover:text-ink hover:bg-surface-sunken rounded-button ' +
  'ml-1.5 inline-flex size-11 shrink-0 items-center justify-center transition-colors ' +
  'sm:text-ink-muted sm:ml-5.5 sm:size-auto sm:min-h-11 sm:px-2.5 sm:text-sm';

/**
 * Die Höhe der klebenden Kopfzeile als CSS-Variable `--kopfzeile-hoehe`
 * (KAL-02).
 *
 * Wer unter ihr selbst klebt - der Kopf des Kalenderrasters -, braucht sie
 * als Abstand nach oben; sonst schöbe er sich unter die Kopfzeile. Gemessen
 * statt gerechnet: Sie wächst mit der Verbindungsanzeige und mit der
 * aufgeklappten Suche am Telefon. Gesetzt am Rahmen, damit sie für alles
 * darin gilt; außerhalb davon hat sie keine Bedeutung.
 */
function useKopfzeilenhoehe(
  kopf: RefObject<HTMLElement | null>,
  rahmen: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const kopfzeile = kopf.current;
    const ziel = rahmen.current;
    if (!kopfzeile || !ziel || typeof ResizeObserver === 'undefined') return;
    const setzen = () => {
      ziel.style.setProperty('--kopfzeile-hoehe', `${kopfzeile.offsetHeight}px`);
    };
    setzen();
    const beobachter = new ResizeObserver(setzen);
    beobachter.observe(kopfzeile);
    return () => beobachter.disconnect();
  }, [kopf, rahmen]);
}

export function AppShell({
  user,
  onSignOut,
  children,
}: {
  user: CurrentUser;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const anfordern = useAbmeldeanfrage();
  /**
   * „Wird abgemeldet …" (RAH-003): Mit Abmeldeschutz sagt der Schutz, wann
   * die Sitzung wirklich endet - erst dann, nicht schon beim Tap, den eine
   * Wache noch anhält. Ohne Schutz (Tests, Vorschauen) meldet die Kopfzeile
   * selbst unmittelbar ab und merkt es sich selbst.
   */
  const abmeldungImSchutz = useAbmeldung();
  const [abmeldungUnmittelbar, setAbmeldungUnmittelbar] = useState(false);
  const abmeldung = abmeldungImSchutz || abmeldungUnmittelbar;
  const abmelden = () => {
    if (anfordern) {
      anfordern();
      return;
    }
    setAbmeldungUnmittelbar(true);
    onSignOut();
  };
  const bereiche = arbeitsbereiche(user);
  const aktuell = aktiverBereich(bereiche, pathname);
  const { sichtbar, weitere } = tableiste(bereiche);
  const aufKonto = pathname === '/mein-konto';
  /**
   * Am Telefon ist die Suche eine Lupe neben „Konto" (BEF-039, ANN-109): Das
   * Feld kostete dort eine eigene Zeile über jeder Seite. Ab sm steht es wie
   * bisher in der Kopfzeile. Ein Seitenwechsel klappt es wieder ein.
   */
  const [sucheOffen, setSucheOffen] = useState(false);
  const sucheRef = useRef<HTMLDivElement>(null);
  useEffect(() => setSucheOffen(false), [pathname]);
  useEffect(() => {
    if (sucheOffen) sucheRef.current?.querySelector('input')?.focus();
  }, [sucheOffen]);

  const rahmen = useRef<HTMLDivElement>(null);
  const kopf = useRef<HTMLDivElement>(null);
  const inhalt = useRef<HTMLElement>(null);
  useKopfzeilenhoehe(kopf, rahmen);
  useSeitenwechsel(inhalt);

  return (
    <div ref={rahmen} className="min-h-dvh sm:flex">
      <a
        href="#inhalt"
        className="focus:bg-surface focus:border-line-strong focus:rounded-button sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:border focus:px-4 focus:py-2"
      >
        Zum Inhalt springen
      </a>

      {/* Seitenleiste (DS-001): 248 px in Tiefgrün, ab sm sichtbar. Zwischen
          640 und 1024 px bleiben davon 84 px als beschriftete Symbolspalte
          (Variante 2b, RAH-002; bis dahin 72 ohne Beschriftung) — genau der
          Bereich, in dem ein halbiertes Fenster landet. Darunter tritt die
          Tableiste am unteren Rand an ihre Stelle. */}
      <nav
        aria-label="Arbeitsbereiche"
        className="bg-surface-inverse w-symbolspalte sticky top-0 hidden h-dvh shrink-0 flex-col gap-8 py-7 sm:flex lg:w-62 lg:px-5"
      >
        <Link
          to="/"
          aria-label="Own Motion, zur Startseite"
          // Landeplatz des Startbilds (RAH-009, `Startbild.tsx`): Die Marke
          // des Intros wandert hierher.
          data-startbild-ziel="seitenleiste"
          className="inline-flex min-h-11 shrink-0 items-center justify-center lg:justify-start lg:px-3"
        >
          {/* Auf Tiefgrün die Papier-Fassung — die Marke wird nie umgefärbt,
              es gibt für jeden Grund eine eigene Datei (marke/README.md).
              In der Symbolspalte ersetzt das Monogramm die Wortmarke, weil
              sie dort unter ihre Mindestgröße fiele. */}
          <Wortmarke hoehe={36} fassung="papier" className="hidden lg:block" />
          <img
            src="/marke/own-motion-monogramm.svg"
            alt=""
            width={40}
            height={40}
            className="block size-10 lg:hidden"
          />
        </Link>

        <ul className="flex min-w-0 flex-col gap-1">
          {bereiche.map((bereich) => (
            <li key={bereich.id}>
              {/* Bewusst Link statt NavLink: aktiv ist der ganze Bereich,
                  nicht nur seine Einstiegsroute. */}
              <Link
                to={bereich.to}
                aria-current={aktuell?.id === bereich.id ? 'page' : undefined}
                title={bereich.kurz === bereich.label ? undefined : bereich.kurz}
                className={seitenLink}
              >
                {aktuell?.id === bereich.id ? (
                  <span aria-hidden="true" className={auswahlstrich} />
                ) : null}
                {bereich.icon}
                {/* Die Symbolspalte zeigt die Kurzform aus der Tableiste
                    („Patienten"); der volle Name („Patient:innen") bleibt der
                    zugängliche Name des Links auf jeder Breite, deshalb ist
                    die Kurzform für Vorlesesoftware ausgeblendet. Der Tooltip
                    trägt denselben Wortlaut wie der sichtbare Text. */}
                <span aria-hidden="true" className="max-w-full truncate lg:hidden">
                  {bereich.kurz}
                </span>
                <span className="sr-only truncate lg:not-sr-only">{bereich.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Verbindungsanzeige und Kopfzeile kleben zusammen (NAV-11, RSP-10).
            Bis UXR-002 klebten sie als Geschwister beide bei top-0, und nach
            einem Bildlauf lag der Hinweis über der Kopfzeile - genau im
            Funkloch verschwanden Suche, Konto und Abmelden darunter. Jetzt
            steht der Hinweis über der Kopfzeile und schiebt sie hinunter; die
            Messung der Suche in `Funktionssuche.tsx` gilt unverändert. */}
        <div ref={kopf} className="sticky top-0 z-30">
          <Verbindungsanzeige />

          <header className="nicht-drucken border-line bg-surface border-b">
            {/* Ab sm eine Zeile, auf dem Telefon zwei — durch Umbruch, nicht
                durch ein zweites Suchfeld. Bis UX-013 stand die Suche zweimal
                im Baum, einmal je Breite; mit Tastenkürzel und Trefferliste
                wäre das zweimal dasselbe Feld, von dem nur eines zu sehen ist.
                Das Konto steht deshalb auf dem Telefon in der ersten Zeile
                neben der Marke; die Suche bricht erst nach einem Tipp auf die
                Lupe darunter um (BEF-039) - sonst bleibt es bei einer Zeile.

                56 px hoch auf jeder Breite (Design-Handoff 2026-10-01): am
                Telefon 44 px Tippziel plus 6 oben und unten. Links 16 wie
                der Inhalt darunter, damit Marke und Seitentitel auf einer
                Kante stehen. */}
            <div className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-2 py-1.5 pr-3 pl-4 sm:flex-nowrap sm:py-0">
              {/* Die Marke steht überall statt des Organisationsnamens. Nach
                ADR-003 ist Mandantenfähigkeit ausdrücklich keine
                Produktfunktion — es gibt genau eine Praxis, und die heißt Own
                Motion (PRODUCT_VISION §6a). Der Name aus den Stammdaten wäre
                daneben eine zweite Antwort auf dieselbe Frage; im Seed lautet er
                „Test Praxis Tuebingen" und stünde dann unter der Marke. Siehe
                ANN-023 für den Weg zurück.

                Auf dem Telefon trägt die Kopfzeile die Marke, weil es dort
                keine Seitenleiste gibt. Ab sm steht sie oben in der
                Seitenleiste und wäre hier eine zweite Fassung derselben Sache.
                Der Link auf die Übersicht ist die Erwartung an ein Logo oben
                links; das Ziel steht zusätzlich im zugänglichen Namen, sonst
                hieße der Link für eine Vorlesehilfe bloß „Own Motion". */}
              <div className="order-1 flex min-w-0 flex-1 items-center gap-2.5 sm:hidden">
                <Link
                  to="/"
                  aria-label="Own Motion, zur Startseite"
                  data-startbild-ziel="kopfzeile"
                  className="rounded-button inline-flex min-h-11 shrink-0 items-center"
                >
                  {/* 24 px: die Mindesthöhe der Marke (`markeRegeln.ts`). */}
                  <Wortmarke hoehe={24} />
                </Link>
                {/* Der Bereichsname in 14 px (Design-Handoff 2026-10-01); ein
                    langer Name wird gekürzt. Seit der Lupe (BEF-039) ist die
                    Zeile unter 360 px zu eng dafür; dort sagt ihn die
                    Tableiste. Bis zum Handoff lag die Grenze bei 400 px -
                    Konto und „Abmelden" waren breiter. */}
                {aktuell ? (
                  <p className="text-ink-muted truncate text-sm max-[359px]:hidden">
                    {aktuell.label}
                  </p>
                ) : null}
              </div>
              {/* Die Suche steht jeder angemeldeten Rolle offen: Sie sucht
                zuerst Funktionen und Bereiche, und die hat auch ein
                Patientenkonto. Ob Namen dazukommen, entscheidet die Suche
                selbst — und verbindlich der Server (UX-013, ADR-004). */}
              <div
                id="kopf-suche"
                ref={sucheRef}
                className={`order-3 w-full min-w-0 sm:order-2 sm:flex sm:w-auto sm:flex-1 sm:justify-center ${sucheOffen ? '' : 'max-sm:hidden'}`}
              >
                <div className="w-full sm:max-w-sm">
                  <Funktionssuche user={user} />
                </div>
              </div>
              <div className="order-2 flex shrink-0 items-center gap-0.5 sm:order-3">
                {/* Der Weg zum eigenen Konto: Kennwort, zweiter Faktor,
                    Sitzungen (STAFF-004). Ab sm heißt er wie auf dem Telefon
                    und wie die Seite, „Mein Konto" (NAV-17) - bis UXR-002 stand
                    dort nur der Name, und nichts verriet, dass er ein Weg ist.
                    Der Name bleibt als Zusatz, wo Platz ist: Er sagt am
                    Praxisrechner, wer angemeldet ist. */}
                <Link
                  to="/mein-konto"
                  aria-current={aufKonto ? 'page' : undefined}
                  aria-label={`Mein Konto, ${user.profile.display_name}`}
                  className={`${kontoLink} hidden sm:inline-flex`}
                >
                  <span className="font-semibold">Mein Konto</span>
                  <span className="hidden min-w-0 items-center gap-1.5 md:inline-flex">
                    <span aria-hidden="true">·</span>
                    <span className="max-w-48 truncate">{user.profile.display_name}</span>
                  </span>
                </Link>
                {/* Die Lupe als Symbolknopf (UIK-01); offen wird sie zum
                    Kreuz, damit man die bildschirmfüllende Liste ohne Auswahl
                    wieder los wird (NAV-08). */}
                <Symbolknopf
                  beschriftung={sucheOffen ? 'Suche schließen' : 'Suche öffnen'}
                  aria-expanded={sucheOffen}
                  aria-controls="kopf-suche"
                  onClick={() => setSucheOffen((offen) => !offen)}
                  className="sm:hidden"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    {sucheOffen ? (
                      <path d="M6 6l12 12M18 6 6 18" />
                    ) : (
                      <>
                        <circle cx="11" cy="11" r="6.5" />
                        <path d="m16 16 4.5 4.5" />
                      </>
                    )}
                  </svg>
                </Symbolknopf>
                <Link
                  to="/mein-konto"
                  aria-label="Mein Konto"
                  aria-current={aufKonto ? 'page' : undefined}
                  className={`${kontoLink} inline-flex font-semibold sm:hidden`}
                >
                  Konto
                </Link>
                {/* Der Knopf fragt, statt selbst abzumelden: Stehen in einem
                    Formular ungespeicherte Eingaben, übernimmt dessen Wache die
                    Rückfrage (FIX-014, NAV-01). Ohne eingerichteten Schutz -
                    in Tests und Vorschauen - bleibt es beim unmittelbaren
                    Abmelden. */}
                <button
                  type="button"
                  aria-label="Abmelden"
                  title="Abmelden"
                  className={abmeldeKnopf}
                  onClick={abmelden}
                >
                  {/* Tür mit Pfeil nach rechts, nur unter 640 px. */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="size-5 sm:hidden"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8" />
                    <path d="M11.5 6.5 15 10l-3.5 3.5M15 10H7.5" />
                  </svg>
                  <span className="sr-only sm:not-sr-only">Abmelden</span>
                </button>
              </div>
            </div>
          </header>

          {/* „Wird abgemeldet …" (RAH-003): Unter der Kopfzeile, sobald die
              Sitzung wirklich endet, bis die Anmeldemaske steht. Bis dahin
              blieb nach dem Tap alles, wie es war - am Telefon ohne Wort am
              Knopf doppelt stumm. Akzentfläche, Radius 14, 15/600 in der
              Hauptfarbe, vorn ein Kreis, der sich dreht, wo Bewegung
              erlaubt ist. `role="status"`: wird vorgelesen, unterbricht
              nicht. Auf der Fläche der Seite, weil die Hülle klebt und sonst
              Inhalt durchschiene. */}
          {abmeldung ? (
            <div role="status" className="bg-canvas px-4 pt-2 pb-1 sm:px-6 lg:px-8">
              <p className="bg-accent-soft text-accent rounded-card text-liste flex min-h-11 items-center gap-2.5 px-4 font-semibold">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="size-5 shrink-0 animate-spin motion-reduce:animate-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="10" cy="10" r="7" opacity="0.3" />
                  <path d="M17 10a7 7 0 0 0-7-7" />
                </svg>
                Wird abgemeldet …
              </p>
            </div>
          ) : null}
        </div>

        {/* Der Inhalt hält 1200 px und steht mittig in der Fläche neben der
            Seitenleiste (DS-001). Die Kappung ist die eine Stelle, an der
            eine Zahl entscheidet: ohne sie liefe eine Listenzeile auf einem
            1920er Bildschirm über 1670 px, und der Status stünde einen
            halben Meter vom Namen entfernt.

            Flächen-Ansichten wie der Kalender sind davon ausgenommen
            (BEF-043, ANN-114): Sie reichen von Rand zu Rand, mit gerade so
            viel Abstand, dass nichts an der Kante klebt. Der Abstand unter
            der Kopfzeile ist überall auf das Nötige geschrumpft (BEF-044).

            Innenabstand nach dem Design-Handoff vom 2026-10-01: 16 am
            Telefon, 24 mit Symbolspalte, 24/32 mit Seitenleiste. Unten am
            Telefon bleibt der Platz für die Tableiste.

            `tabIndex={-1}`: Nach einem Seitenwechsel bekommt der Inhalt den
            Fokus (NAV-09, `seitenwechsel.ts`), und der Sprunglink oben
            landet wirklich hier. Er ist kein Bedienelement und zeigt deshalb
            keinen Fokusrahmen. */}
        <main
          ref={inhalt}
          id="inhalt"
          tabIndex={-1}
          className={
            istRandlos(pathname)
              ? 'w-full min-w-0 px-2 pt-2 pb-28 focus:outline-none sm:px-3 sm:pt-3 sm:pb-4'
              : 'max-w-inhalt mx-auto w-full min-w-0 px-4 pt-4 pb-28 focus:outline-none sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pb-12'
          }
        >
          {aktuell && aktuell.unterpunkte.length > 0 && zeigtUnterleiste(pathname) ? (
            // Eigener Schlüssel je Bereich: Eine aufgeklappte Vorschau bleibt
            // nicht offen, wenn man den Bereich wechselt (UX-002h).
            <SubNav
              key={aktuell.id}
              eintraege={aktuell.unterpunkte}
              label={`Bereich ${aktuell.label}`}
            />
          ) : null}
          {children}
        </main>
      </div>

      <nav
        aria-label="Arbeitsbereiche"
        className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="flex">
          {sichtbar.map((bereich) => (
            <li key={bereich.id} className="flex-1">
              <Link
                to={bereich.to}
                aria-current={aktuell?.id === bereich.id ? 'page' : undefined}
                className={tabLink}
              >
                {bereich.icon}
                {bereich.kurz}
              </Link>
            </li>
          ))}
          {weitere.length > 0 ? (
            <li className="flex-1">
              <Link
                to="/bereiche"
                aria-current={
                  pathname === '/bereiche' || weitere.some((bereich) => bereich.id === aktuell?.id)
                    ? 'page'
                    : undefined
                }
                className={tabLink}
              >
                {mehrSymbol}
                Mehr
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}
