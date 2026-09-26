import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { Field } from '@/components/ui/Field';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { BausteinAuswahl } from './bausteinauswahl';
import {
  ERGEBNIS_TEXT,
  NOTIZ_MAX,
  SEITEN,
  istMesswert,
  jeSeiteGemessen,
  kennungenDes,
  MESSSEITEN,
  seitenKennung,
  ungueltigeMesswerte,
  type Angabe,
  type Auswahl,
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
 * Befund aus Bausteinen (FRB-003b, Phase P3).
 *
 * Region wählen, Block aufklappen, Ergebnis antippen — darunter steht der
 * Dokumentationstext als Vorschlag, und ein Tap übernimmt ihn in den Eintrag.
 * Gerendert wird nach dem Schema, nie nach einem Test: Eine neue Region ist
 * eine Datei (Leitprinzip des Arbeitsauftrags).
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
  const { regionen, auswahl, setzen, leeren, text } = bausteine;
  const [regionId, setRegionId] = useState<string | null>(null);
  const region = regionen.find((r) => r.id === regionId);
  const anzahl = Object.values(auswahl).filter((a) => a.ergebnis !== 'nicht_durchgefuehrt').length;
  const messwertFalsch = ungueltigeMesswerte(regionen, auswahl);

  // Eine Meldung, die in einem zugeklappten Feld steht, liest niemand — und
  // „Übernehmen" und „Verwerfen" wären unsichtbar.
  const feldRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (meldung && feldRef.current) feldRef.current.open = true;
  }, [meldung]);

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
            const zahl = angabenIn(r, auswahl);
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

        {region ? (
          <div className="flex flex-col gap-2">
            {region.blocks.map((block) => (
              <Block
                key={`${region.id}.${block.id}`}
                block={block}
                auswahl={auswahl}
                setzen={setzen}
              />
            ))}
          </div>
        ) : (
          <p className="text-ink-muted text-sm">Region wählen, um die Tests aufzuklappen.</p>
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

function angabenIn(region: BausteinRegion, auswahl: Auswahl): number {
  return region.blocks
    .flatMap((block) => block.items.flatMap(kennungenDes))
    .filter((kennung) => auswahl[kennung] !== undefined).length;
}

function Block({
  block,
  auswahl,
  setzen,
}: {
  block: BausteinBlock;
  auswahl: Auswahl;
  setzen: BausteinAuswahl['setzen'];
}) {
  const zahl = block.items.flatMap(kennungenDes).filter((k) => auswahl[k] !== undefined).length;
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
        {block.items.map((item) =>
          jeSeiteGemessen(item) ? (
            // Links und rechts je mit eigenem Ergebnis, Wert und Notiz
            // (Jannes, 2026-09-26) — der Seitenvergleich ist der Sinn der Messung.
            <Gruppe key={item.id} item={item}>
              {MESSSEITEN.map((seite) => {
                const kennung = seitenKennung(item.id, seite);
                return (
                  <Zeile
                    key={kennung}
                    kennung={kennung}
                    label={seite}
                    vorsatz={`${item.label}, `}
                    hint={undefined}
                    item={item}
                    seiteFest
                    angabe={auswahl[kennung]}
                    setzen={setzen}
                  />
                );
              })}
            </Gruppe>
          ) : item.subitems ? (
            <Gruppe key={item.id} item={item}>
              {item.subitems.map((subitem) => (
                <Zeile
                  key={subitem.id}
                  kennung={subitem.id}
                  label={subitem.label}
                  hint={subitem.hint}
                  item={item}
                  angabe={auswahl[subitem.id]}
                  setzen={setzen}
                />
              ))}
            </Gruppe>
          ) : (
            <Zeile
              key={item.id}
              kennung={item.id}
              label={item.label}
              hint={item.hint}
              item={item}
              angabe={auswahl[item.id]}
              setzen={setzen}
            />
          ),
        )}
      </div>
    </details>
  );
}

/** Ein Item mit Unterpunkten oder mit je einer Zeile für links und rechts. */
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

/**
 * Ein Test oder eine Technik. `memo`, weil ein Tap sonst jede Zeile des
 * Blocks neu zeichnet; dafür bleibt `setzen` über die Seite stabil.
 */
const Zeile = memo(function Zeile({
  kennung,
  label,
  vorsatz,
  hint,
  item,
  seiteFest = false,
  angabe,
  setzen,
}: {
  kennung: string;
  label: string;
  /** Vor den Namen der Gruppe gesetzt: aus „links" wird „Knee to Wall Test, links". */
  vorsatz?: string;
  hint: string | undefined;
  /** Typ, Seitigkeit und Messfeld gelten auch für die Unterpunkte. */
  item: BausteinItem;
  /** Die Seite steht schon fest — keine Auswahl links/rechts/beidseits. */
  seiteFest?: boolean;
  angabe: Angabe | undefined;
  setzen: BausteinAuswahl['setzen'];
}) {
  const titelId = useId();
  const ergebnisse = (item.type === 'technik' ? TECHNIK_ERGEBNISSE : BEFUND_ERGEBNISSE).filter(
    (e) => e !== 'nicht_durchgefuehrt',
  );

  return (
    <div
      role="group"
      {...(vorsatz ? { 'aria-label': `${vorsatz}${label}` } : { 'aria-labelledby': titelId })}
      className="flex flex-col gap-2"
    >
      <p id={titelId} className="text-ink text-sm wrap-anywhere">
        {label}
        {hint ? <span className="text-ink-muted"> – {hint}</span> : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {ergebnisse.map((ergebnis) => {
          const gewaehlt = angabe?.ergebnis === ergebnis;
          return (
            <button
              key={ergebnis}
              type="button"
              aria-pressed={gewaehlt}
              onClick={() =>
                setzen(kennung, gewaehlt ? undefined : { ...(angabe ?? {}), ergebnis })
              }
              className={kartenAktionKlassen(gewaehlt ? 'primary' : 'secondary')}
            >
              {ERGEBNIS_TEXT[ergebnis]}
            </button>
          );
        })}
      </div>

      {angabe ? (
        <Einzelheiten
          kennung={kennung}
          item={item}
          seiteFest={seiteFest}
          angabe={angabe}
          setzen={setzen}
        />
      ) : null}
    </div>
  );
});

/** Seite, Messwert und Notiz — erst, wenn ein Ergebnis gewählt ist. */
function Einzelheiten({
  kennung,
  item,
  seiteFest,
  angabe,
  setzen,
}: {
  kennung: string;
  item: BausteinItem;
  seiteFest: boolean;
  angabe: Angabe;
  setzen: BausteinAuswahl['setzen'];
}) {
  const aendern = (teil: Partial<Angabe>) => setzen(kennung, { ...angabe, ...teil });

  return (
    <div className="flex flex-col gap-2">
      {item.bilateral && !seiteFest ? (
        <div role="group" aria-label="Seite" className="flex flex-wrap gap-2">
          {SEITEN.map((seite) => (
            <button
              key={seite}
              type="button"
              aria-pressed={angabe.seite === seite}
              onClick={() => aendern({ seite: angabe.seite === seite ? undefined : seite })}
              className={kartenAktionKlassen(angabe.seite === seite ? 'primary' : 'quiet')}
            >
              {seite}
            </button>
          ))}
        </div>
      ) : null}
      {item.value_field ? (
        <Messwert
          messfeld={item.value_field}
          wert={angabe.messwert ?? ''}
          onChange={(messwert) => aendern({ messwert })}
        />
      ) : null}
      <Field
        label="Notiz"
        value={angabe.notiz ?? ''}
        maxLength={NOTIZ_MAX}
        onChange={(event) => aendern({ notiz: event.target.value })}
      />
    </div>
  );
}

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
