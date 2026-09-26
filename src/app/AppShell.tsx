import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { SubNav } from '@/components/ui/SubNav';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { type CurrentUser } from '@/features/session/types';
import { Funktionssuche } from './Funktionssuche';
import { useAbmeldeanfrage } from './abmeldeschutz';
import { aktiverBereich, arbeitsbereiche, mehrSymbol, tableiste } from './navigation';
import { Verbindungsanzeige } from './Verbindungsanzeige';

/**
 * Rahmen der angemeldeten Anwendung.
 *
 * Die globale Navigation zeigt ausschließlich die sechs Arbeitsbereiche und
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
 */
const seitenLink =
  'flex min-h-11 items-center gap-3 rounded-button px-3 text-[0.9375rem] transition-colors ' +
  'text-salbei hover:bg-accent hover:text-surface ' +
  'aria-[current=page]:bg-accent aria-[current=page]:font-medium ' +
  'aria-[current=page]:text-surface';

const tabLink =
  'text-ink-muted aria-[current=page]:text-accent flex min-h-14 flex-col items-center justify-center ' +
  'gap-0.5 px-1 text-[0.6875rem] transition-colors aria-[current=page]:font-medium';

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
  const bereiche = arbeitsbereiche(user);
  const aktuell = aktiverBereich(bereiche, pathname);
  const { sichtbar, weitere } = tableiste(bereiche);
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

  return (
    <div className="min-h-dvh sm:flex">
      <a
        href="#inhalt"
        className="focus:bg-surface focus:border-line-strong focus:rounded-button sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:border focus:px-4 focus:py-2"
      >
        Zum Inhalt springen
      </a>

      {/* Seitenleiste (DS-001): 248 px in Tiefgrün, ab sm sichtbar. Zwischen
          640 und 1024 px bleiben davon 72 px als Symbolspalte — genau der
          Bereich, in dem ein halbiertes Fenster landet. Darunter tritt die
          Tableiste am unteren Rand an ihre Stelle. */}
      <nav
        aria-label="Arbeitsbereiche"
        className="bg-surface-inverse sticky top-0 hidden h-dvh w-18 shrink-0 flex-col gap-8 px-3 py-7 sm:flex lg:w-62 lg:px-5"
      >
        <Link
          to="/"
          aria-label="Own Motion, zur Startseite"
          className="inline-flex min-h-11 shrink-0 items-center lg:px-3"
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
                className={seitenLink}
              >
                {bereich.icon}
                {/* In der Symbolspalte bleibt die Beschriftung für
                    Vorlesesoftware erhalten, auch wenn sie niemand sieht. */}
                <span className="sr-only truncate lg:not-sr-only">{bereich.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Ueber der Kopfleiste, damit der Hinweis nicht in der Seite untergeht
            und beim Scrollen sichtbar bleibt (UI-000, ANN-015). */}
        <div className="sticky top-0 z-40">
          <Verbindungsanzeige />
        </div>

        <header className="border-line bg-surface sticky top-0 z-30 border-b">
          {/* Ab sm eine Zeile, auf dem Telefon zwei — durch Umbruch, nicht
              durch ein zweites Suchfeld. Bis UX-013 stand die Suche zweimal
              im Baum, einmal je Breite; mit Tastenkürzel und Trefferliste
              wäre das zweimal dasselbe Feld, von dem nur eines zu sehen ist.
              Das Konto steht deshalb auf dem Telefon in der ersten Zeile
              neben der Marke; die Suche bricht erst nach einem Tipp auf die
              Lupe darunter um (BEF-039) - sonst bleibt es bei einer Zeile. */}
          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2 sm:min-h-14 sm:flex-nowrap sm:py-0">
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
            <div className="order-1 flex min-w-0 flex-1 items-center gap-3 sm:hidden">
              <Link
                to="/"
                aria-label="Own Motion, zur Startseite"
                className="rounded-button inline-flex min-h-11 shrink-0 items-center"
              >
                <Wortmarke hoehe={26} />
              </Link>
              {/* Seit der Lupe (BEF-039) ist die Zeile unter 400 px zu eng
                  für den Bereichsnamen; dort sagt ihn die Tableiste. */}
              {aktuell ? (
                <p className="text-ink-subtle truncate text-xs max-[399px]:hidden">
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
            <div className="order-2 flex items-center gap-2 sm:order-3">
              {/* Der Name ist zugleich der Weg zum eigenen Konto: Kennwort,
                zweiter Faktor, Sitzungen (STAFF-004). Auf dem Telefon bleibt
                der Text weg, der Weg aber erhalten. */}
              <Link
                to="/mein-konto"
                className="text-ink-muted hover:text-ink rounded-button hidden min-h-11 items-center px-2 text-sm sm:inline-flex"
              >
                {user.profile.display_name}
              </Link>
              <button
                type="button"
                aria-label={sucheOffen ? 'Suche schließen' : 'Suche öffnen'}
                aria-expanded={sucheOffen}
                aria-controls="kopf-suche"
                onClick={() => setSucheOffen((offen) => !offen)}
                className="text-ink-muted hover:text-ink rounded-button inline-flex size-11 items-center justify-center sm:hidden"
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
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.5 4.5" />
                </svg>
              </button>
              <Link
                to="/mein-konto"
                aria-label="Mein Konto"
                className="text-ink-muted hover:text-ink rounded-button inline-flex min-h-11 items-center px-2 text-sm sm:hidden"
              >
                Konto
              </Link>
              {/* Der Knopf fragt, statt selbst abzumelden: Steht in einem
                  Dokumentationsformular ungespeicherter Text, übernimmt dessen
                  Wache die Rückfrage (FIX-014). Ohne eingerichteten Schutz -
                  in Tests und Vorschauen - bleibt es beim unmittelbaren
                  Abmelden. */}
              <Button variant="quiet" onClick={anfordern ?? onSignOut}>
                Abmelden
              </Button>
            </div>
          </div>
        </header>

        {/* Der Inhalt hält 1200 px und steht mittig in der Fläche neben der
            Seitenleiste (DS-001). Die Kappung ist die eine Stelle, an der
            eine Zahl entscheidet: ohne sie liefe eine Listenzeile auf einem
            1920er Bildschirm über 1670 px, und der Status stünde einen
            halben Meter vom Namen entfernt. Der Rahmen bleibt dabei auf
            jeder Seite derselbe — gesprungen wird nirgends mehr. */}
        <main
          id="inhalt"
          className="max-w-inhalt mx-auto w-full min-w-0 px-5 py-8 pb-28 sm:px-8 sm:pb-10"
        >
          {aktuell && aktuell.unterpunkte.length > 0 ? (
            <SubNav eintraege={aktuell.unterpunkte} label={`Bereich ${aktuell.label}`} />
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
