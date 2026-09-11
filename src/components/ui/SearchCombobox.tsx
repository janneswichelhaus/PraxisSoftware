import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Suchfeld mit Trefferliste darunter (UX-004).
 *
 * `SearchField` filtert eine Liste, die schon auf der Seite steht. Hier ist es
 * umgekehrt: Die Treffer kommen erst durch das Tippen und führen woanders hin.
 * Das ist ein anderes Bedienmuster (ARIA „combobox") und braucht deshalb einen
 * eigenen Baustein statt eines Sonderwegs in einer Fachkomponente.
 *
 * Was der Baustein zusichert:
 *
 *   * Tastatur: Pfeil runter/hoch wandert durch die Treffer, Eingabe wählt
 *     aus, Escape schließt. Der Fokus bleibt dabei im Eingabefeld -
 *     `aria-activedescendant` sagt der Vorlesesoftware, welcher Treffer
 *     gerade dran ist.
 *   * Eine Beschriftung, auch wenn sie nicht zu sehen ist. Ein Platzhalter
 *     allein ist keine Beschriftung (WCAG 3.3.2).
 *   * Der Zustand steht als Text: „Mindestens drei Zeichen", „Kein Treffer",
 *     „Wird gesucht …" - nicht als leere Liste, die man sich selbst erklären
 *     muss.
 *   * Ein Klick außerhalb schließt die Liste, ein erneuter Klick ins Feld
 *     öffnet sie wieder.
 */

export interface Suchtreffer {
  id: string;
  /** Erste Zeile - der Name. */
  bezeichnung: string;
  /** Zweite Zeile, etwa zur Unterscheidung Namensgleicher. */
  zusatz?: string | undefined;
  /** Kurzes Abzeichen rechts, etwa ein Status. */
  abzeichen?: ReactNode | undefined;
}

export function SearchCombobox({
  label,
  placeholder,
  wert,
  onChange,
  treffer,
  onAuswahl,
  zustand,
  labelSichtbar = false,
}: {
  label: string;
  placeholder?: string | undefined;
  wert: string;
  onChange: (wert: string) => void;
  treffer: readonly Suchtreffer[];
  onAuswahl: (treffer: Suchtreffer) => void;
  /** Text statt Trefferliste: Hinweis, Ladezustand oder „Kein Treffer". */
  zustand?: string | undefined;
  labelSichtbar?: boolean;
}) {
  const feldId = useId();
  const listeId = `${feldId}-liste`;
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const huelle = useRef<HTMLDivElement>(null);

  // Ein neuer Suchbegriff macht die bisherige Auswahl gegenstandslos.
  useEffect(() => {
    setAktiv(-1);
  }, [wert, treffer]);

  useEffect(() => {
    if (!offen) return;
    function ausserhalb(event: MouseEvent) {
      if (!huelle.current?.contains(event.target as Node)) setOffen(false);
    }
    document.addEventListener('mousedown', ausserhalb);
    return () => document.removeEventListener('mousedown', ausserhalb);
  }, [offen]);

  const zeigeListe = offen && (treffer.length > 0 || Boolean(zustand));

  function waehlen(eintrag: Suchtreffer) {
    setOffen(false);
    setAktiv(-1);
    onAuswahl(eintrag);
  }

  function tastatur(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOffen(false);
      setAktiv(-1);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (treffer.length === 0) return;
      event.preventDefault();
      setOffen(true);
      setAktiv((bisher) => {
        const schritt = event.key === 'ArrowDown' ? 1 : -1;
        const naechster = bisher + schritt;
        if (naechster < 0) return treffer.length - 1;
        if (naechster >= treffer.length) return 0;
        return naechster;
      });
      return;
    }
    if (event.key === 'Enter' && aktiv >= 0 && treffer[aktiv]) {
      event.preventDefault();
      waehlen(treffer[aktiv]);
    }
  }

  return (
    <div ref={huelle} className="relative">
      <label
        htmlFor={feldId}
        className={labelSichtbar ? 'text-ink-muted mb-1 block text-sm font-medium' : 'sr-only'}
      >
        {label}
      </label>
      <input
        id={feldId}
        type="search"
        role="combobox"
        autoComplete="off"
        aria-expanded={zeigeListe}
        aria-controls={listeId}
        aria-autocomplete="list"
        aria-activedescendant={aktiv >= 0 && treffer[aktiv] ? `${feldId}-${aktiv}` : undefined}
        className="border-line-strong bg-surface text-ink placeholder:text-ink-subtle min-h-11 w-full rounded-lg border px-3 text-base"
        {...(placeholder === undefined ? {} : { placeholder })}
        value={wert}
        onChange={(event) => {
          onChange(event.target.value);
          setOffen(true);
        }}
        onFocus={() => setOffen(true)}
        onKeyDown={tastatur}
      />

      {/* Ohne Schlagschatten (DS-001): dass die Liste über der Seite liegt,
          tragen der kräftige Rahmen und die hellere Fläche. */}
      {zeigeListe ? (
        <div className="border-line-strong bg-surface absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border">
          {treffer.length === 0 ? (
            // `role="status"` sagt den Zustand an, ohne den Fokus zu holen.
            // Ein zweiter, unsichtbarer Bereich mit demselben Text würde ihn
            // doppelt vorlesen.
            <p role="status" className="text-ink-muted px-3 py-2.5 text-sm">
              {zustand}
            </p>
          ) : (
            <ul id={listeId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
              {treffer.map((eintrag, index) => (
                <li
                  key={eintrag.id}
                  id={`${feldId}-${index}`}
                  role="option"
                  aria-selected={index === aktiv}
                  className={`border-line flex min-h-11 cursor-pointer items-center gap-3 border-t px-3 py-2 first:border-t-0 ${
                    index === aktiv ? 'bg-accent-soft' : 'hover:bg-surface-sunken'
                  }`}
                  // mousedown statt click: click käme erst nach dem Blur des
                  // Feldes, und das schließt die Liste bereits.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    waehlen(eintrag);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-[0.9375rem] font-medium">
                      {eintrag.bezeichnung}
                    </span>
                    {eintrag.zusatz ? (
                      <span className="text-ink-muted block truncate text-sm">
                        {eintrag.zusatz}
                      </span>
                    ) : null}
                  </span>
                  {eintrag.abzeichen}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
