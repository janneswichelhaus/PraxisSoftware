import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { BausteinAuswahl } from './bausteinauswahl';
import {
  ERGEBNIS_TEXT,
  ERGEBNIS_ZEICHEN,
  NOTIZ_MAX,
  REGIONSSEITEN,
  angabenImBlock,
  istMesswert,
  seitenDes,
  seitenKennung,
  seitlicheRegion,
  ungueltigeMesswerte,
  type Angabe,
  type Auswahl,
  type Regionsseite,
  type Seite,
} from './dokumentationstext';
import {
  BEFUND_ERGEBNISSE,
  TECHNIK_ERGEBNISSE,
  type BausteinBlock,
  type BausteinItem,
  type BausteinRegion,
  type Messfeld,
} from './schema';

/**
 * Befund aus Bausteinen (FRB-003b, Phase P3; Seitenwahl und Textform seit
 * 2026-09-26, **ANN-129**, **ANN-130**).
 *
 * Region wählen, an Extremitäten und Kiefer einmal die Seite, Block
 * aufklappen, Ergebnis antippen — darunter steht der Dokumentationstext als
 * Vorschlag, und ein Tap übernimmt ihn in den Eintrag. Gerendert wird nach
 * dem Schema, nie nach einem Test: Eine neue Region ist eine Datei
 * (Leitprinzip des Arbeitsauftrags).
 *
 * Das Feld ist zugeklappt und steht **unter** dem Textfeld: Es soll den
 * Freitext nicht nach unten schieben (BEF-001). Ein zweiter Tipp auf ein
 * gewähltes Ergebnis hebt es wieder auf.
 *
 * Während die Seite schreibt, ist das Feld gesperrt: Was danach angetippt
 * oder übernommen würde, stünde auf dem Bildschirm, aber nicht in dem, was
 * gerade gespeichert oder festgeschrieben wird (§13, ADR-016 Punkt 4).
 */
export function BausteinFeld({
  bausteine,
  onUebernehmen,
  gesperrt,
  meldung,
}: {
  bausteine: BausteinAuswahl;
  onUebernehmen: (text: string) => void;
  /** Solange die Seite schreibt. */
  gesperrt: boolean;
  /** Warum die Seite gerade nicht speichert oder abschließt; öffnet das Feld. */
  meldung?: string | undefined;
}) {
  const { regionen, auswahl, seitenwahl, setzen, seiteWaehlen, leeren, text } = bausteine;
  const [regionId, setRegionId] = useState<string | null>(null);
  const region = regionen.find((r) => r.id === regionId);
  const anzahl = Object.keys(auswahl).length;
  const messwertFalsch = ungueltigeMesswerte(regionen, auswahl);

  // Eine Meldung, die in einem zugeklappten Feld steht, liest niemand — und
  // „Übernehmen" und „Verwerfen" wären unsichtbar.
  const feldRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (meldung && feldRef.current) feldRef.current.open = true;
  }, [meldung]);

  const wahl = region ? seitenwahl[region.id] : undefined;
  const wartetAufSeite = region !== undefined && seitlicheRegion(region) && wahl === undefined;

  return (
    <details ref={feldRef} className="nicht-drucken border-line-strong rounded-card mt-4 border">
      <summary className="text-ink flex min-h-12 cursor-pointer items-center gap-2 px-4 text-[0.9375rem] font-medium">
        Befund aus Bausteinen
        {anzahl > 0 ? <Badge ton="akzent">{`${anzahl} angegeben`}</Badge> : null}
      </summary>

      <fieldset
        disabled={gesperrt}
        aria-label="Befund aus Bausteinen"
        className="m-0 flex min-w-0 flex-col gap-4 border-0 px-4 pb-4"
      >
        <div role="group" aria-label="Region" className="flex flex-wrap gap-2">
          {regionen.map((r) => {
            const zahl = r.blocks.reduce((summe, b) => summe + angabenImBlock(b, auswahl), 0);
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={r.id === regionId}
                onClick={() => setRegionId(r.id === regionId ? null : r.id)}
                className={kartenAktionKlassen(r.id === regionId ? 'primary' : 'secondary')}
              >
                {zahl > 0 ? `${r.label} · ${zahl}` : r.label}
              </button>
            );
          })}
        </div>

        {region && seitlicheRegion(region) ? (
          <SeitenWahl region={region} wahl={wahl} onWahl={(seite) => seiteWaehlen(region, seite)} />
        ) : null}

        {region === undefined ? (
          <p className="text-ink-muted text-sm">Region wählen, um die Tests aufzuklappen.</p>
        ) : wartetAufSeite ? (
          <p className="text-ink-muted text-sm">
            Seite wählen — sie gilt für alle Tests und Techniken der Region.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {region.blocks.map((block) => (
              <Block
                key={`${region.id}.${block.id}`}
                region={region}
                block={block}
                wahl={wahl}
                auswahl={auswahl}
                setzen={setzen}
              />
            ))}
          </div>
        )}

        {text ? (
          <section aria-label="Vorschlag für den Eintrag" className="flex flex-col gap-3">
            <h3 className="text-ink text-sm font-medium">Vorschlag für den Eintrag</h3>
            <p className="bg-surface-sunken rounded-field text-ink p-3 text-sm wrap-anywhere whitespace-pre-wrap">
              {text}
            </p>
            <p className="text-ink-muted text-xs">
              Gespeichert und abgeschlossen wird erst, wenn der Vorschlag im Text steht oder
              verworfen ist. Nur wer die Seite verlässt und dort „Speichern“ wählt, bekommt ihn an
              den Entwurf angehängt, damit nichts verloren geht.
            </p>
            {meldung ? <Statusmeldung ton="fehler">{meldung}</Statusmeldung> : null}
            {messwertFalsch ? (
              <Statusmeldung ton="warnung">
                Ein Messwert ist keine Zahl. Bitte korrigieren, dann übernehmen.
              </Statusmeldung>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={messwertFalsch}
                onClick={() => {
                  onUebernehmen(text);
                  leeren();
                }}
              >
                In den Text übernehmen
              </Button>
              <Button type="button" variant="quiet" onClick={leeren}>
                Verwerfen
              </Button>
            </div>
          </section>
        ) : null}
      </fieldset>
    </details>
  );
}

/**
 * Die Seite einer Region mit lauter seitengetrennten Tests (**ANN-129**):
 * einmal wählen statt an jedem Test. Ohne Vorauswahl — eine falsche Seite in
 * der Akte ist schlimmer als ein Tipp mehr.
 */
function SeitenWahl({
  region,
  wahl,
  onWahl,
}: {
  region: BausteinRegion;
  wahl: Regionsseite | undefined;
  onWahl: (seite: Regionsseite) => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Seite ${region.label}`}
      className="flex flex-wrap items-center gap-2"
    >
      <span aria-hidden="true" className="text-ink text-sm font-medium">
        Seite
      </span>
      {REGIONSSEITEN.map((seite) => (
        <button
          key={seite}
          type="button"
          aria-pressed={wahl === seite}
          onClick={() => onWahl(seite)}
          className={kartenAktionKlassen(wahl === seite ? 'primary' : 'secondary')}
        >
          {seite}
        </button>
      ))}
    </div>
  );
}

function Block({
  region,
  block,
  wahl,
  auswahl,
  setzen,
}: {
  region: BausteinRegion;
  block: BausteinBlock;
  wahl: Regionsseite | undefined;
  auswahl: Auswahl;
  setzen: BausteinAuswahl['setzen'];
}) {
  const zahl = angabenImBlock(block, auswahl);
  const offen = block.status === 'unvollstaendig';

  return (
    <details className="border-line rounded-card border">
      <summary className="text-ink flex min-h-11 cursor-pointer flex-wrap items-center gap-2 px-3 text-sm font-medium wrap-anywhere">
        {block.label}
        {zahl > 0 ? <Badge ton="akzent">{String(zahl)}</Badge> : null}
        {offen ? <Badge ton="warnung">Vorlage unvollständig</Badge> : null}
      </summary>
      <div className="flex flex-col gap-4 px-3 pb-3">
        {offen ? (
          <p className="text-ink-muted text-sm">
            In der Vorlage fehlen hier Einträge. Sie werden nicht ergänzt, bis die Praxis sie
            nachliefert.
          </p>
        ) : null}
        {block.items.map((item) => {
          const seiten = seitenDes(region, item, wahl);
          return item.subitems ? (
            <Gruppe key={item.id} item={item}>
              {item.subitems.map((subitem) => (
                <Pruefpunkt
                  key={subitem.id}
                  kennung={subitem.id}
                  label={subitem.label}
                  hint={subitem.hint}
                  item={item}
                  seiten={seiten}
                  auswahl={auswahl}
                  setzen={setzen}
                />
              ))}
            </Gruppe>
          ) : (
            <Pruefpunkt
              key={item.id}
              kennung={item.id}
              label={item.label}
              hint={item.hint}
              item={item}
              seiten={seiten}
              auswahl={auswahl}
              setzen={setzen}
            />
          );
        })}
      </div>
    </details>
  );
}

/** Ein Item mit Unterpunkten — eine Ausgangsstellung oder eine Testgruppe. */
function Gruppe({ item, children }: { item: BausteinItem; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm font-medium wrap-anywhere">
        {item.label}
        {item.hint ? <span className="text-ink-muted font-normal"> – {item.hint}</span> : null}
      </p>
      <div className="border-line flex flex-col gap-4 border-l-2 pl-3">{children}</div>
    </div>
  );
}

function Hinweis({ label, hint }: { label: string; hint: string | undefined }) {
  return (
    <>
      {label}
      {hint ? <span className="text-ink-muted"> – {hint}</span> : null}
    </>
  );
}

/**
 * Ein Test oder eine Technik: mit einer Seite (oder ohne) eine Zeile, mit
 * beiden Seiten eine Zeile je Seite unter dem gemeinsamen Namen.
 */
function Pruefpunkt({
  kennung,
  label,
  hint,
  item,
  seiten,
  auswahl,
  setzen,
}: {
  kennung: string;
  label: string;
  hint: string | undefined;
  /** Typ und Messfeld gelten auch für die Unterpunkte. */
  item: BausteinItem;
  seiten: readonly (Seite | undefined)[];
  auswahl: Auswahl;
  setzen: BausteinAuswahl['setzen'];
}) {
  const [nurEine] = seiten;
  if (seiten.length === 1) {
    const schluessel = seitenKennung(kennung, nurEine);
    return (
      <Eingabe
        schluessel={schluessel}
        titel={label}
        hint={hint}
        item={item}
        angabe={auswahl[schluessel]}
        setzen={setzen}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink text-sm wrap-anywhere">
        <Hinweis label={label} hint={hint} />
      </p>
      {seiten.map((seite) => {
        const schluessel = seitenKennung(kennung, seite);
        return (
          <Eingabe
            key={schluessel}
            schluessel={schluessel}
            name={seite ? `${label}, ${seite}` : label}
            seite={seite}
            item={item}
            angabe={auswahl[schluessel]}
            setzen={setzen}
          />
        );
      })}
    </div>
  );
}

const SEITE_MARKE: Record<Seite, string> = { links: 'li.', rechts: 're.' };

/**
 * Die Schaltflächen eines Tests auf einer Seite, darunter Messwert und Notiz.
 * `memo`, weil ein Tap sonst jede Zeile des Blocks neu zeichnet; dafür bleibt
 * `setzen` über die Seite stabil.
 */
const Eingabe = memo(function Eingabe({
  schluessel,
  titel,
  hint,
  name,
  seite,
  item,
  angabe,
  setzen,
}: {
  schluessel: string;
  /** Sichtbarer Name, wenn die Zeile allein steht. */
  titel?: string;
  hint?: string | undefined;
  /** Name der Zeile, wenn sie eine von zwei Seiten ist: „Knee to Wall Test, links". */
  name?: string;
  seite?: Seite | undefined;
  item: BausteinItem;
  angabe: Angabe | undefined;
  setzen: BausteinAuswahl['setzen'];
}) {
  const titelId = useId();
  const notizId = useId();
  const [notizGewuenscht, setNotizGewuenscht] = useState(false);
  const ergebnisse = item.type === 'technik' ? TECHNIK_ERGEBNISSE : BEFUND_ERGEBNISSE;
  const notizSichtbar = angabe !== undefined && (notizGewuenscht || !!angabe.notiz);

  // Wer „Notiz" antippt, will schreiben.
  const fokusAufNotiz = useRef(false);
  useEffect(() => {
    if (notizSichtbar && fokusAufNotiz.current) {
      fokusAufNotiz.current = false;
      document.getElementById(notizId)?.focus();
    }
  }, [notizSichtbar, notizId]);

  const aendern = (teil: Partial<Angabe>) => {
    if (angabe) setzen(schluessel, { ...angabe, ...teil });
  };

  return (
    <div
      role="group"
      {...(name ? { 'aria-label': name } : { 'aria-labelledby': titelId })}
      className="flex flex-col gap-2"
    >
      {titel ? (
        <p id={titelId} className="text-ink text-sm wrap-anywhere">
          <Hinweis label={titel} hint={hint} />
        </p>
      ) : null}
      <div className="flex items-start gap-2">
        {seite ? (
          // Eigene Spalte: Bricht die Zeile auf dem Telefon um, steht der Rest
          // unter den Schaltflächen und nicht unter „li.".
          <span
            aria-hidden="true"
            className="text-ink-muted flex min-h-11 w-7 shrink-0 items-center text-sm font-medium"
          >
            {SEITE_MARKE[seite]}
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {ergebnisse.map((ergebnis) => {
            const gewaehlt = angabe?.ergebnis === ergebnis;
            const zeichen = ERGEBNIS_ZEICHEN[ergebnis];
            return (
              <button
                key={ergebnis}
                type="button"
                aria-pressed={gewaehlt}
                onClick={() => {
                  if (gewaehlt) setNotizGewuenscht(false);
                  setzen(schluessel, gewaehlt ? undefined : { ...(angabe ?? {}), ergebnis });
                }}
                className={kartenAktionKlassen(gewaehlt ? 'primary' : 'secondary')}
              >
                {/* Ein Textblock: Der Abstand zwischen Zeichen und Wort ist ein
                  Leerzeichen, nicht die Lücke der Schaltfläche. */}
                <span>
                  {zeichen ? <span aria-hidden="true">{`${zeichen} `}</span> : null}
                  {ERGEBNIS_TEXT[ergebnis]}
                </span>
              </button>
            );
          })}
          {angabe && !notizSichtbar ? (
            <button
              type="button"
              onClick={() => {
                fokusAufNotiz.current = true;
                setNotizGewuenscht(true);
              }}
              className={kartenAktionKlassen('quiet')}
            >
              <span>
                <span aria-hidden="true">+ </span>Notiz
              </span>
            </button>
          ) : null}
        </div>
      </div>

      {angabe && item.value_field ? (
        <Messwert
          messfeld={item.value_field}
          wert={angabe.messwert ?? ''}
          onChange={(messwert) => aendern({ messwert })}
        />
      ) : null}
      {notizSichtbar ? (
        <Field
          feldId={notizId}
          label="Notiz"
          value={angabe?.notiz ?? ''}
          maxLength={NOTIZ_MAX}
          onChange={(event) => aendern({ notiz: event.target.value })}
        />
      ) : null}
    </div>
  );
});

function Messwert({
  messfeld,
  wert,
  onChange,
}: {
  messfeld: Messfeld;
  wert: string;
  onChange: (wert: string) => void;
}) {
  const ungueltig = wert.trim() !== '' && !istMesswert(wert.trim(), messfeld.input);
  return (
    <Field
      label={`${messfeld.label} (${messfeld.unit})`}
      inputMode="decimal"
      value={wert}
      maxLength={10}
      error={ungueltig ? 'Bitte eine Zahl eingeben, etwa 1,5.' : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="max-w-40"
    />
  );
}
