import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { SubNav } from '@/components/ui/SubNav';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';
import { Patientensuche } from '@/features/patients/Patientensuche';
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

  // Die ausgeblendete Suche ist keine Zugriffskontrolle: `search_patients`
  // prueft die Rolle selbst und liefert einem Patientenkonto nichts (ADR-004).
  const darfSuchen = canReadPatientDirectory(user.roles);

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
          <div className="flex min-h-14 w-full items-center justify-between gap-3 px-5">
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
            <div className="flex min-w-0 items-center gap-3 sm:hidden">
              <Link
                to="/"
                aria-label="Own Motion, zur Startseite"
                className="rounded-button inline-flex min-h-11 shrink-0 items-center"
              >
                <Wortmarke hoehe={26} />
              </Link>
              {aktuell ? <p className="text-ink-subtle truncate text-xs">{aktuell.label}</p> : null}
            </div>
            {/* Ab sm hat die Kopfleiste Platz für das Suchfeld in derselben
              Zeile; darunter bekommt es eine eigene (siehe unten). */}
            {darfSuchen ? (
              <div className="hidden min-w-0 flex-1 justify-center sm:flex">
                <div className="w-full max-w-sm">
                  <Patientensuche />
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              {/* Der Name ist zugleich der Weg zum eigenen Konto: Kennwort,
                zweiter Faktor, Sitzungen (STAFF-004). Auf dem Telefon bleibt
                der Text weg, der Weg aber erhalten. */}
              <Link
                to="/mein-konto"
                className="text-ink-muted hover:text-ink rounded-button hidden min-h-11 items-center px-2 text-sm sm:inline-flex"
              >
                {user.profile.display_name}
              </Link>
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

          {/* Auf dem Telefon eine eigene Zeile: das Suchfeld ist der einzige Weg
            von Kalender und Übersicht in eine Akte, und dafür muss es ohne
            Aufklappen erreichbar sein (UX-004). */}
          {darfSuchen ? (
            <div className="w-full px-5 pb-2 sm:hidden">
              <Patientensuche />
            </div>
          ) : null}
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
