import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';
import {
  SUCHE_MINDESTLAENGE,
  searchPatients,
  type PatientSearchHit,
} from '@/features/patients/api';
import { funktionskatalog, sucheFunktionen, type Funktion } from './funktionen';

/**
 * Die Suche in der Kopfleiste (UX-013).
 *
 * Ein Feld, zwei Gruppen in **fester** Reihenfolge:
 *
 *   1. **Bereiche und Vorgänge** — aus `funktionen.ts`, im Browser, ohne
 *      Anfrage, ab dem ersten Zeichen.
 *   2. **Patient:innen** — serverseitig wie in UX-004 (`search_patients`, ab
 *      drei Zeichen, Obergrenze in der Datenbank), nach einer Tipppause.
 *
 * **Die Reihenfolge ist fest, und das ist der Grund für den Aufbau.** Die
 * Namenstreffer kommen eine Anfrage später als die Funktionstreffer. Würde die
 * Liste nach Güte gemischt, verschöbe sich die Auswahl unter den Pfeiltasten
 * genau in dem Moment, in dem die Antwort eintrifft — wer „kal" tippt und
 * einmal nach unten drückt, landete auf einem Namen. Deshalb wachsen die
 * Namen **unten an**, und die getroffene Auswahl bleibt, wo sie war.
 *
 * Gefiltert wird auf das, was die Rolle aufrufen darf. Das ist **Relevanz,
 * keine Zugriffskontrolle** (§4.7): `search_patients` prüft die Rolle selbst,
 * und eine eingetippte Adresse führt zu einer Seite, die vom Server nichts
 * bekommt (ADR-004).
 *
 * In der Adresszeile steht nie ein Name — ein Treffer führt auf die Kennung
 * der Akte, und der Rückweg trägt Pfade (ADR-011, UX-012b).
 */

/** Wartezeit, bis eine Eingabe zu einer Anfrage wird (wie in der Patientensuche). */
const TIPPPAUSE_MS = 250;

/**
 * Das Kürzel, wie es auf der Tastatur steht: am Mac ⌘, sonst Strg (NAV-16).
 * Die Suche selbst hört auf beide Tasten.
 */
const TASTENKUERZEL =
  typeof navigator !== 'undefined' && /Macintosh|Mac OS X|iPhone|iPad/.test(navigator.userAgent)
    ? '⌘ K'
    : 'Strg K';

type Eintrag =
  { art: 'funktion'; funktion: Funktion } | { art: 'patient'; patient: PatientSearchHit };

export function Funktionssuche({ user }: { user: CurrentUser }) {
  const navigate = useNavigate();
  const ort = useLocation();
  const feldId = useId();
  const listeId = `${feldId}-liste`;
  const feldRef = useRef<HTMLInputElement>(null);
  const huelle = useRef<HTMLDivElement>(null);

  const [eingabe, setEingabe] = useState('');
  const [begriff, setBegriff] = useState('');
  const [offen, setOffen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState(-1);
  const [unterkante, setUnterkante] = useState(0);

  const katalog = useMemo(() => funktionskatalog(user), [user]);
  const funktionen = useMemo(() => sucheFunktionen(katalog, eingabe), [katalog, eingabe]);

  // Ausgeblendet ist keine Zugriffskontrolle: `search_patients` prüft die Rolle
  // selbst und liefert einem Patientenkonto nichts (ADR-004).
  const darfPatienten = canReadPatientDirectory(user.roles);

  // Eine Anfrage je Tipppause statt je Tastendruck. Die Funktionstreffer
  // stehen ohne Pause da - sie kosten keine Anfrage.
  useEffect(() => {
    const zeit = setTimeout(() => setBegriff(eingabe.trim()), TIPPPAUSE_MS);
    return () => clearTimeout(zeit);
  }, [eingabe]);

  const langGenug = begriff.length >= SUCHE_MINDESTLAENGE;
  const { data, isFetching, isError } = useQuery({
    queryKey: ['patient-search', begriff],
    queryFn: () => searchPatients(begriff),
    enabled: darfPatienten && langGenug,
    retry: false,
    staleTime: 30_000,
  });

  const patienten = darfPatienten && langGenug ? (data ?? []) : [];
  const getippt = eingabe.trim().length > 0;

  const treffer: Eintrag[] = useMemo(
    () => [
      ...funktionen.map((funktion): Eintrag => ({ art: 'funktion', funktion })),
      ...patienten.map((patient): Eintrag => ({ art: 'patient', patient })),
    ],
    [funktionen, patienten],
  );

  /**
   * Der hervorgehobene Treffer.
   *
   * Steht etwas im Feld, ist der erste Treffer vorgewählt — die Eingabetaste
   * führt damit ohne Umweg aus, und weil die Zeile dabei sichtbar
   * hervorgehoben ist, springt niemand irgendwohin, den er nicht gesehen hat.
   * Bei leerem Feld (die Liste zeigt dann die Bereiche) ist nichts vorgewählt:
   * Wer die Suche nur öffnet, soll mit der Eingabetaste nirgends landen.
   */
  const aktiv = gewaehlt >= 0 ? Math.min(gewaehlt, treffer.length - 1) : getippt ? 0 : -1;
  const aktiverEintrag = aktiv >= 0 ? treffer[aktiv] : undefined;

  // Eine neue Eingabe macht die bisherige Auswahl gegenstandslos. Ausdrücklich
  // NICHT bei neuen Treffern: Die Namen treffen später ein und hängen sich
  // unten an - wer schon gewählt hat, behält seine Zeile.
  useEffect(() => {
    setGewaehlt(-1);
  }, [eingabe]);

  useEffect(() => {
    if (!offen) return;
    function ausserhalb(event: MouseEvent) {
      if (!huelle.current?.contains(event.target as Node)) setOffen(false);
    }
    document.addEventListener('mousedown', ausserhalb);
    return () => document.removeEventListener('mousedown', ausserhalb);
  }, [offen]);

  // Ein Seitenwechsel schließt die Liste (NAV-08), wie die Suchzeile am
  // Telefon (AppShell). Bis UXR-002 stand sie nach Enter auf einem anderen
  // Link weiter über Titel und Untermenü der neuen Seite.
  useEffect(() => {
    setOffen(false);
    setGewaehlt(-1);
  }, [ort.pathname]);

  // Der Treffer unter den Pfeiltasten gehört ins Bild der Liste, wie in
  // `SearchCombobox` (UIK-08). `nearest` rollt nur, wenn er es nicht schon ist.
  useEffect(() => {
    if (!offen || aktiv < 0) return;
    document.getElementById(`${feldId}-${aktiv}`)?.scrollIntoView({ block: 'nearest' });
  }, [offen, aktiv, feldId]);

  /**
   * Öffnen ohne Zeigegerät (Strg/Cmd + K).
   *
   * Der erste Schritt des Tastaturwegs. Ohne ihn führt er von einer beliebigen
   * Seite aus erst durch die sechs Bereiche der Seitenleiste.
   */
  useEffect(() => {
    function tasten(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k') return;
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      feldRef.current?.focus();
      feldRef.current?.select();
      setOffen(true);
    }
    document.addEventListener('keydown', tasten);
    return () => document.removeEventListener('keydown', tasten);
  }, []);

  const zeigeListe = offen;

  /**
   * Wo die Liste anfängt.
   *
   * Bei ~375 px nimmt sie den Rest des Bildschirms ein, statt die Seite zu
   * überlagern (UX-013). Dafür braucht sie die Unterkante des Feldes, und die
   * hängt an der Höhe der Kopfleiste — die wiederum wächst, sobald die
   * Verbindungsanzeige darüber etwas zu sagen hat. Gemessen statt gerechnet;
   * ab `sm` überschreibt `sm:top-full` den Wert wieder.
   */
  useLayoutEffect(() => {
    if (!zeigeListe) return;
    function messen() {
      const masse = feldRef.current?.getBoundingClientRect();
      if (masse) setUnterkante(Math.round(masse.bottom));
    }
    messen();
    window.addEventListener('resize', messen);
    return () => window.removeEventListener('resize', messen);
  }, [zeigeListe]);

  function ausfuehren(eintrag: Eintrag) {
    setOffen(false);
    setGewaehlt(-1);
    setEingabe('');
    setBegriff('');
    const hier = `${ort.pathname}${ort.search}`;
    if (eintrag.art === 'patient') {
      // Wie in der Patientensuche: zurück geht es genau dorthin, wo gesucht
      // wurde, samt Ansicht, Datum und Filtern (UX-012).
      void navigate(mitRueckweg(`/patienten/${eintrag.patient.id}`, hier));
      return;
    }
    const { ziel, rueckweg } = eintrag.funktion;
    void navigate(rueckweg ? mitRueckweg(ziel, hier) : ziel);
  }

  function tastatur(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOffen(false);
      setGewaehlt(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (treffer.length === 0) return;
      event.preventDefault();
      setOffen(true);
      const schritt = event.key === 'ArrowDown' ? 1 : -1;
      const naechster = aktiv + schritt;
      if (naechster < 0) setGewaehlt(treffer.length - 1);
      else if (naechster >= treffer.length) setGewaehlt(0);
      else setGewaehlt(naechster);
      return;
    }
    if (event.key === 'Enter' && aktiverEintrag) {
      event.preventDefault();
      ausfuehren(aktiverEintrag);
    }
  }

  /** Der Zustand der Namensgruppe als Satz — eine leere Fläche erklärt sich nicht. */
  function namensZustand(): string | undefined {
    if (!darfPatienten || !getippt) return undefined;
    if (!langGenug) return `Namen ab ${SUCHE_MINDESTLAENGE} Zeichen.`;
    if (isFetching && !data) return 'Wird gesucht …';
    // Ein Fehlschlag ist kein leeres Ergebnis (UX-012).
    if (isError) {
      return 'Die Namenssuche ist fehlgeschlagen. Das heißt nicht, dass es keinen Treffer gibt – bitte erneut versuchen.';
    }
    if (patienten.length === 0) return 'Kein Name gefunden.';
    return undefined;
  }

  const namenZustand = namensZustand();

  /**
   * Die Liste trägt ausschließlich Optionen.
   *
   * Eine `listbox` darf nur Optionen und Gruppen besitzen — eine Überschrift
   * oder ein Zustandssatz darin ist ein Verstoß, den `pnpm test` über axe
   * meldet (`aria-required-children`). Die Überschriften sind deshalb für
   * Vorlesesoftware ausgeblendet (die Gruppe trägt denselben Text als
   * `aria-label`), und ein Zustandssatz steht **neben** der Liste, nie darin.
   * Weil die Namensgruppe immer unten steht, bleibt die Reihenfolge auf dem
   * Bildschirm dabei dieselbe.
   */
  const hatOptionen = funktionen.length > 0 || patienten.length > 0;

  // Wer keine Namen suchen kann, liest es auch nicht im Feld (NAV-16): Das
  // Patientenkonto und die Betreuung fanden bis UXR-002 unter „… oder Name"
  // nie einen.
  const gesucht = darfPatienten ? 'Funktion, Bereich oder Name' : 'Funktion oder Bereich';

  return (
    <div
      ref={huelle}
      className="relative"
      // Verlässt der Fokus die Suche - Tab, ein anderer Link -, schließt die
      // Liste (NAV-08), wie in `SearchCombobox`. Ein Tipp in die Liste nimmt
      // dem Feld den Fokus nicht (siehe `onMouseDown` unten), und ein Fokus
      // innerhalb der Hülle zählt nicht als Verlassen.
      onBlur={(event) => {
        if (!huelle.current?.contains(event.relatedTarget)) {
          setOffen(false);
          setGewaehlt(-1);
        }
      }}
    >
      <label htmlFor={feldId} className="sr-only">
        {`${gesucht} suchen`}
      </label>
      <input
        id={feldId}
        ref={feldRef}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-expanded={zeigeListe}
        {...(zeigeListe && hatOptionen ? { 'aria-controls': listeId } : {})}
        aria-autocomplete="list"
        aria-activedescendant={aktiverEintrag ? `${feldId}-${aktiv}` : undefined}
        className="border-line-strong bg-surface-field text-ink placeholder:text-ink-muted rounded-field h-bedienhoehe w-full border px-4 text-base sm:pointer-fine:pr-20"
        placeholder={gesucht}
        value={eingabe}
        onChange={(event) => {
          setEingabe(event.target.value);
          setOffen(true);
        }}
        onFocus={() => setOffen(true)}
        onKeyDown={tastatur}
      />
      {/* Das Kürzel steht am Feld, sonst wüsste niemand davon. Für
          Vorlesesoftware ausgeblendet: Sie liest die Beschriftung, und ein
          Tastenkürzel im zugänglichen Namen wäre dort nur Text. Nur mit
          feinem Zeiger (RSP-09): Am Telefon und am Touch-Tablet gibt es keine
          Strg-Taste. Am Mac heißt sie ⌘ (NAV-16). */}
      <kbd
        aria-hidden="true"
        className="border-line text-ink-muted bg-surface rounded-pill pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 border px-1.5 py-0.5 text-[0.6875rem] sm:pointer-fine:block"
      >
        {TASTENKUERZEL}
      </kbd>

      {zeigeListe ? (
        <div
          // Schmal: vom Feld bis zum unteren Rand, also bildschirmfüllend.
          // Ab sm: eine Liste unter dem Feld, ohne Schlagschatten (DS-001) -
          // dass sie über der Seite liegt, tragen Rand und Fläche.
          style={{ '--oben': `${unterkante}px` } as CSSProperties}
          className="border-line-strong bg-surface sm:rounded-card fixed inset-x-0 top-[var(--oben)] bottom-0 z-50 overflow-y-auto border-t pb-20 sm:absolute sm:inset-x-0 sm:top-full sm:bottom-auto sm:mt-1 sm:max-h-104 sm:border sm:pb-0"
          // Ein Tipp irgendwo in die Liste - auf eine Gruppenüberschrift, den
          // Zustandssatz - lässt den Fokus im Feld. Sonst schlösse der
          // Fokusverlust die Liste unter dem Finger.
          onMouseDown={(event) => event.preventDefault()}
        >
          {funktionen.length === 0 ? (
            <>
              <Gruppenkopf text="Bereiche und Vorgänge" />
              <Zustandssatz text="Keine Funktion gefunden." />
            </>
          ) : null}

          {hatOptionen ? (
            <div id={listeId} role="listbox" aria-label="Suchergebnisse">
              {funktionen.length > 0 ? (
                <div role="group" aria-label={getippt ? 'Bereiche und Vorgänge' : 'Bereiche'}>
                  <Gruppenkopf text={getippt ? 'Bereiche und Vorgänge' : 'Bereiche'} />
                  {funktionen.map((funktion, index) => (
                    <Trefferzeile
                      key={funktion.id}
                      id={`${feldId}-${index}`}
                      aktiv={index === aktiv}
                      bezeichnung={funktion.bezeichnung}
                      zusatz={
                        [
                          funktion.art === 'Bereich' ? undefined : funktion.bereich,
                          funktion.hinweis,
                        ]
                          .filter(Boolean)
                          .join(' · ') || undefined
                      }
                      abzeichen={
                        <span className="text-ink-muted shrink-0 text-xs">
                          {funktion.vorschau ? 'Vorschau' : funktion.art}
                        </span>
                      }
                      onWaehlen={() => ausfuehren({ art: 'funktion', funktion })}
                    />
                  ))}
                </div>
              ) : null}

              {patienten.length > 0 ? (
                <div role="group" aria-label="Patient:innen">
                  <Gruppenkopf text="Patient:innen" />
                  {patienten.map((patient, index) => (
                    <Trefferzeile
                      key={patient.id}
                      id={`${feldId}-${funktionen.length + index}`}
                      aktiv={funktionen.length + index === aktiv}
                      bezeichnung={`${patient.given_name} ${patient.family_name}`}
                      // Das Geburtsdatum unterscheidet zwei Namensgleiche -
                      // dafür steht es hier und für nichts sonst. „geb." wie
                      // im Aktenkopf und in der Patientensuche (WRT-15).
                      zusatz={
                        patient.date_of_birth
                          ? `geb. ${formatDate(patient.date_of_birth)}`
                          : undefined
                      }
                      abzeichen={
                        patient.status === 'inactive' ? (
                          <span className="text-ink-muted shrink-0 text-xs">
                            Nicht in Versorgung
                          </span>
                        ) : undefined
                      }
                      onWaehlen={() => ausfuehren({ art: 'patient', patient })}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {namenZustand ? (
            <>
              <Gruppenkopf text="Patient:innen" />
              <Zustandssatz text={namenZustand} />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Die Aufschrift einer Gruppe.
 *
 * Für Vorlesesoftware ausgeblendet: Sie hört denselben Text als `aria-label`
 * der Gruppe, und in der Liste wäre die Überschrift ein Kind, das dort nicht
 * stehen darf.
 */
function Gruppenkopf({ text }: { text: string }) {
  return (
    <p
      aria-hidden="true"
      className="text-ink-muted border-line bg-surface-sunken border-y px-3 py-1.5 text-xs font-medium first:border-t-0"
    >
      {text}
    </p>
  );
}

/** Der Zustand als Satz - eine leere Fläche erklärt sich nicht (UX-012). */
function Zustandssatz({ text }: { text: string }) {
  return (
    <p role="status" className="text-ink-muted px-3 py-2.5 text-sm">
      {text}
    </p>
  );
}

function Trefferzeile({
  id,
  aktiv,
  bezeichnung,
  zusatz,
  abzeichen,
  onWaehlen,
}: {
  id: string;
  aktiv: boolean;
  bezeichnung: string;
  zusatz?: string | undefined;
  abzeichen?: React.ReactNode;
  onWaehlen: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={aktiv}
      className={`border-line flex min-h-11 cursor-pointer items-center gap-3 border-t px-3 py-2 first:border-t-0 ${
        aktiv ? 'bg-accent-soft' : 'hover:bg-surface-sunken'
      }`}
      // mousedown statt click: click käme erst nach dem Blur des Feldes, und
      // das schließt die Liste bereits.
      onMouseDown={(event) => {
        event.preventDefault();
        onWaehlen();
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="text-ink text-liste block truncate font-medium">{bezeichnung}</span>
        {zusatz ? <span className="text-ink-muted block truncate text-sm">{zusatz}</span> : null}
      </span>
      {abzeichen}
    </div>
  );
}
