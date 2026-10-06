import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import type { BausteinAuswahl } from './bausteinauswahl';
import { ohneAbsenden } from './darstellung';
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
  verworfeneAngaben,
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
 * gewähltes Ergebnis hebt es wieder auf - trägt es Messwert oder Notiz, erst
 * nach einer Rückfrage, wie „Verwerfen" für alle Angaben (BEF-01).
 *
 * Während die Seite schreibt, ist das Feld gesperrt: Was danach angetippt
 * oder übernommen würde, stünde auf dem Bildschirm, aber nicht in dem, was
 * gerade gespeichert oder festgeschrieben wird (§13, ADR-016 Punkt 4).
 *
 * **Aufklappzeichen in verschachtelten Aufklappern.** Das Feld und jeder
 * Block darin sind `<details>`. Das `Aufklappzeichen` dreht sich mit dem
 * nächsten offenen `group` - bei zwei geschachtelten drehten sich die Zeichen
 * der Blöcke schon mit dem Feld. Die Drehung kommt hier deshalb aus benannten
 * Gruppen (`group/feld`, `group/block`) an einer Hülle um das Zeichen.
 */
export function BausteinFeld({
  bausteine,
  onUebernehmen,
  gesperrt,
  meldung,
  ebene = 2,
  streifen,
}: {
  bausteine: BausteinAuswahl;
  onUebernehmen: (text: string) => void;
  /** Solange die Seite schreibt. */
  gesperrt: boolean;
  /** Warum die Seite gerade nicht speichert oder abschließt; öffnet das Feld. */
  meldung?: string | undefined;
  /**
   * Ebene der Überschrift des Vorschlags (BEF-18): Auf den Dokumentationsseiten
   * folgt das Feld unmittelbar auf den Seitentitel (h1), also h2.
   */
  ebene?: 2 | 3;
  /**
   * Als Streifen unter der Chipzeile der Schreibseite (Design-Handoff
   * 2026-10-01, Abschnitt 6a): kein eigener Aufklapper - geöffnet wird über
   * den Chip „+ Befund" der Seite. Ausgeblendet bleibt das Feld eingehängt,
   * damit Region und Angaben beim Zuklappen nicht verloren gehen.
   */
  streifen?: { offen: boolean } | undefined;
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

  const inhalt = (
    <fieldset
      disabled={gesperrt}
      aria-label="Befund aus Bausteinen"
      className={`m-0 flex min-w-0 flex-col gap-4 border-0 px-4 ${streifen ? 'py-3' : 'pb-4'}`}
    >
      <div role="group" aria-label="Region" className="flex flex-wrap gap-2">
        {regionen.map((r) => {
          const zahl = r.blocks.reduce((summe, b) => summe + angabenImBlock(b, auswahl), 0);
          return (
            <Button
              key={r.id}
              type="button"
              groesse="kompakt"
              variant={r.id === regionId ? 'primary' : 'secondary'}
              aria-pressed={r.id === regionId}
              onClick={() => setRegionId(r.id === regionId ? null : r.id)}
            >
              {zahl > 0 ? `${r.label} · ${zahl}` : r.label}
            </Button>
          );
        })}
      </div>

      {region && seitlicheRegion(region) ? (
        <SeitenWahl
          region={region}
          wahl={wahl}
          auswahl={auswahl}
          onWahl={(seite) => seiteWaehlen(region, seite)}
        />
      ) : null}

      {region === undefined ? (
        <p className="text-ink-muted text-sm">Region wählen, um die Tests aufzuklappen.</p>
      ) : wartetAufSeite ? (
        <p className="text-ink-muted text-sm">
          Seite wählen – sie gilt für alle Tests und Techniken der Region.
        </p>
      ) : (
        // Blöcke durch Linien getrennt, nicht als Kasten im Kasten
        // (Leitfaden L2, BEF-057 Option 2).
        <div className="border-line flex flex-col border-y">
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
        <Section titel="Vorschlag für den Eintrag" ebene={ebene}>
          <div className="flex flex-col gap-3">
            {/* Eine Auskunft, kein vertiefter Bedienbereich: auf Papier mit
                  Linie (UI-002c, BEF-18). */}
            <p className="bg-surface border-line rounded-card text-ink border p-3 text-sm wrap-anywhere whitespace-pre-wrap">
              {text}
            </p>
            {streifen ? null : (
              <p className="text-ink-muted text-sm">
                Gespeichert und abgeschlossen wird erst, wenn der Vorschlag im Text steht oder
                verworfen ist. Nur wer die Seite verlässt und dort „Speichern und weitergehen“
                wählt, bekommt ihn an den Entwurf angehängt, damit nichts verloren geht.
              </p>
            )}
            {meldung ? <Statusmeldung ton="fehler">{meldung}</Statusmeldung> : null}
            {messwertFalsch ? (
              <Statusmeldung ton="warnung">
                Ein Messwert ist keine Zahl. Bitte korrigieren, dann übernehmen.
              </Statusmeldung>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant={streifen ? 'primary' : 'secondary'}
                groesse={streifen ? 'kompakt' : 'normal'}
                disabled={messwertFalsch}
                onClick={() => {
                  onUebernehmen(text);
                  leeren();
                }}
              >
                {streifen ? 'Übernehmen' : 'In den Text übernehmen'}
              </Button>
              {/* Verwerfen nimmt Regionen, Seitenwahl, Messwerte und Notizen
                    auf einmal - erst nach einer Rückfrage (BEF-01). */}
              <Rueckfrage
                ausloeser="Verwerfen"
                ausloeserVariante="quiet"
                bezeichnung="Alle Angaben aus den Bausteinen verwerfen"
                bestaetigen="Ja, alle Angaben verwerfen"
                onBestaetigen={leeren}
              >
                Alle gewählten Ergebnisse, Messwerte, Notizen und die Seitenwahl werden verworfen.
                Im Text steht davon nichts.
              </Rueckfrage>
            </div>
          </div>
        </Section>
      ) : null}
    </fieldset>
  );

  if (streifen) {
    return (
      <div
        id="befund-streifen"
        hidden={!streifen.offen}
        className="nicht-drucken bg-canvas border-line border-b"
      >
        {inhalt}
      </div>
    );
  }

  return (
    <details
      ref={feldRef}
      className="nicht-drucken group/feld border-line-strong rounded-card mt-4 border"
    >
      <summary className={`${aufklappKopfKlassen} text-ink text-liste min-h-12 px-4 font-medium`}>
        <Zeichen gruppe="feld" />
        Befund aus Bausteinen
        {anzahl > 0 ? <Badge ton="akzent">{`${anzahl} angegeben`}</Badge> : null}
      </summary>
      {inhalt}
    </details>
  );
}

/**
 * Das `Aufklappzeichen` eines der beiden geschachtelten Aufklapper. Die Hülle
 * dreht mit ihrer benannten Gruppe; das Zeichen selbst hat keine unbenannte
 * `group` über sich und bleibt ohne eigene Drehung.
 */
function Zeichen({ gruppe }: { gruppe: 'feld' | 'block' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex transition-transform motion-reduce:transition-none ${
        gruppe === 'feld' ? 'group-open/feld:rotate-90' : 'group-open/block:rotate-90'
      }`}
    >
      <Aufklappzeichen />
    </span>
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
  auswahl,
  onWahl,
}: {
  region: BausteinRegion;
  wahl: Regionsseite | undefined;
  auswahl: Auswahl;
  onWahl: (seite: Regionsseite) => void;
}) {
  // Von „beidseits" auf eine Seite fielen die Angaben der anderen weg: erst
  // fragen, nie still (ABN-015, BEF-103 Punkt 2).
  const [frage, setFrage] = useState<{ seite: Regionsseite; anzahl: number } | null>(null);
  const bestaetigenRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (frage) bestaetigenRef.current?.focus();
  }, [frage]);

  function waehlen(seite: Regionsseite) {
    const anzahl = verworfeneAngaben(region, auswahl, wahl, seite);
    if (anzahl > 0) setFrage({ seite, anzahl });
    else onWahl(seite);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={`Seite ${region.label}`}
        className="flex flex-wrap items-center gap-2"
      >
        <span aria-hidden="true" className="text-ink text-sm font-medium">
          Seite
        </span>
        {REGIONSSEITEN.map((seite) => (
          <Button
            key={seite}
            type="button"
            groesse="kompakt"
            variant={wahl === seite ? 'primary' : 'secondary'}
            aria-pressed={wahl === seite}
            disabled={frage !== null}
            onClick={() => waehlen(seite)}
          >
            {seite}
          </Button>
        ))}
      </div>
      {frage ? (
        <div
          role="group"
          aria-label="Seite wechseln"
          className="border-line rounded-card bg-surface flex flex-col gap-2 border p-3 text-sm"
        >
          <p className="text-ink">
            Nur {frage.seite}: {frage.anzahl === 1 ? 'Eine Angabe' : `${frage.anzahl} Angaben`} der
            anderen Seite {frage.anzahl === 1 ? 'geht' : 'gehen'} dabei verloren.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={bestaetigenRef}
              type="button"
              groesse="kompakt"
              onClick={() => {
                onWahl(frage.seite);
                setFrage(null);
              }}
            >
              Ja, nur {frage.seite}
            </Button>
            <Button
              type="button"
              groesse="kompakt"
              variant="secondary"
              onClick={() => setFrage(null)}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}
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
    <details className="group/block border-line border-b last:border-b-0">
      <summary
        className={`${aufklappKopfKlassen} text-ink flex-wrap text-sm font-medium wrap-anywhere`}
      >
        <Zeichen gruppe="block" />
        {block.label}
        {zahl > 0 ? <Badge ton="akzent">{String(zahl)}</Badge> : null}
        {offen ? <Badge ton="warnung">Vorlage unvollständig</Badge> : null}
      </summary>
      <div className="flex flex-col gap-4 pb-3">
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

/** Trägt die Angabe etwas, das beim Abwählen verloren ginge? */
function mitEingaben(angabe: Angabe | undefined): boolean {
  return (angabe?.notiz ?? '').trim() !== '' || (angabe?.messwert ?? '').trim() !== '';
}

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
  // Abwählen eines Ergebnisses mit Messwert oder Notiz fragt erst (BEF-01).
  const [abwaehlenFragen, setAbwaehlenFragen] = useState(false);
  const ergebnisse = item.type === 'technik' ? TECHNIK_ERGEBNISSE : BEFUND_ERGEBNISSE;
  const notizSichtbar = angabe !== undefined && (notizGewuenscht || !!angabe.notiz);
  const knoepfeRef = useRef<HTMLDivElement>(null);
  const abwaehlenRef = useRef<HTMLButtonElement>(null);
  /**
   * BEF-076: Ein abgehakter Test klappt auf eine Zeile ein - Name, Ergebnis,
   * Messwert, Notiz und „Ändern". Bei einer vollständigen Basisuntersuchung
   * wuchs die Seite sonst mit jedem Test um alle Schaltflächen. Ein Test mit
   * Messfeld bleibt offen, bis der Wert eingetragen ist; eine gewünschte
   * Notiz ebenso.
   */
  const [eingeklappt, setEingeklappt] = useState(() => angabe !== undefined);
  const aendernRef = useRef<HTMLButtonElement>(null);
  // Nach dem Tipp auf ein Ergebnis ist dessen Knopf fort; der Fokus geht auf „Ändern".
  const fokusAufAendern = useRef(false);
  useEffect(() => {
    if (eingeklappt && fokusAufAendern.current) {
      fokusAufAendern.current = false;
      aendernRef.current?.focus();
    }
  }, [eingeklappt]);
  const zuklappbar =
    angabe !== undefined &&
    !abwaehlenFragen &&
    !notizGewuenscht &&
    (!item.value_field || (angabe.messwert ?? '').trim() !== '');

  // Wer „Notiz" antippt, will schreiben.
  const fokusAufNotiz = useRef(false);
  useEffect(() => {
    if (notizSichtbar && fokusAufNotiz.current) {
      fokusAufNotiz.current = false;
      document.getElementById(notizId)?.focus();
    }
  }, [notizSichtbar, notizId]);

  // Die Rückfrage erscheint am Tipp; der Fokus geht auf „Ja, abwählen".
  useEffect(() => {
    if (abwaehlenFragen) abwaehlenRef.current?.focus();
  }, [abwaehlenFragen]);

  const aendern = (teil: Partial<Angabe>) => {
    if (angabe) setzen(schluessel, { ...angabe, ...teil });
  };

  function abwaehlen() {
    setAbwaehlenFragen(false);
    setNotizGewuenscht(false);
    setzen(schluessel, undefined);
    knoepfeRef.current?.querySelector('button')?.focus();
  }

  if (eingeklappt && zuklappbar) {
    const zeichen = ERGEBNIS_ZEICHEN[angabe.ergebnis];
    return (
      <div
        role="group"
        {...(name ? { 'aria-label': name } : { 'aria-labelledby': titelId })}
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        {titel ? (
          <span id={titelId} className="text-ink text-sm wrap-anywhere">
            {titel}
          </span>
        ) : null}
        {seite ? (
          <span aria-hidden="true" className="text-ink-muted w-7 text-sm font-medium">
            {SEITE_MARKE[seite]}
          </span>
        ) : null}
        <span className="text-ink text-sm font-semibold">
          {zeichen ? <span aria-hidden="true">{`${zeichen} `}</span> : null}
          {ERGEBNIS_TEXT[angabe.ergebnis]}
          {angabe.messwert ? ` · ${angabe.messwert}` : ''}
        </span>
        {angabe.notiz ? (
          <span className="text-ink-muted min-w-0 truncate text-sm">· {angabe.notiz}</span>
        ) : null}
        <Button
          ref={aendernRef}
          type="button"
          groesse="kompakt"
          variant="quiet"
          onClick={() => {
            setEingeklappt(false);
            // Der Fokus geht auf das gewählte Ergebnis.
            requestAnimationFrame(() =>
              knoepfeRef.current
                ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
                ?.focus(),
            );
          }}
        >
          Ändern
        </Button>
        {!angabe.notiz ? (
          <Button
            type="button"
            groesse="kompakt"
            variant="quiet"
            onClick={() => {
              fokusAufNotiz.current = true;
              setNotizGewuenscht(true);
              setEingeklappt(false);
            }}
          >
            <span>
              <span aria-hidden="true">+ </span>Notiz
            </span>
          </Button>
        ) : null}
      </div>
    );
  }

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
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
        {seite ? (
          // Am Handy über der Knopfreihe (BEF-057 Option 2): Als eigene
          // Spalte nahm die Marke den Knöpfen die Breite, und die Zeile brach
          // in zwei Reihen. Ab 640 px wieder als Spalte davor.
          <span
            aria-hidden="true"
            className="text-ink-muted flex shrink-0 items-center text-sm font-medium sm:min-h-11 sm:w-7"
          >
            {SEITE_MARKE[seite]}
          </span>
        ) : null}
        {/* Am Handy die Ergebnisse gleich breit in einer Reihe, „+ Notiz“
            darunter; ab 640 px fließend wie bisher. */}
        <div
          ref={knoepfeRef}
          className="flex flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
        >
          <div
            data-testid="ergebnis-knoepfe"
            className="grid w-full auto-cols-fr grid-flow-col gap-1 sm:flex sm:w-auto sm:flex-wrap sm:gap-2"
          >
            {ergebnisse.map((ergebnis) => {
              const gewaehlt = angabe?.ergebnis === ergebnis;
              const zeichen = ERGEBNIS_ZEICHEN[ergebnis];
              return (
                <Button
                  key={ergebnis}
                  type="button"
                  groesse="kompakt"
                  variant={gewaehlt ? 'primary' : 'secondary'}
                  className="max-sm:px-1.5"
                  aria-pressed={gewaehlt}
                  onClick={() => {
                    if (!gewaehlt) {
                      setAbwaehlenFragen(false);
                      setzen(schluessel, { ...(angabe ?? {}), ergebnis });
                      // Ohne Messfeld ist ein unauffälliger Test mit dem Tipp
                      // erledigt. „positiv" bleibt offen: Dort folgt meist die
                      // Notiz.
                      if (ergebnis !== 'positiv' && !item.value_field && !notizSichtbar) {
                        fokusAufAendern.current = true;
                        setEingeklappt(true);
                      }
                    } else if (mitEingaben(angabe)) {
                      setAbwaehlenFragen(true);
                    } else {
                      abwaehlen();
                    }
                  }}
                >
                  {/* Ein Textblock: Der Abstand zwischen Zeichen und Wort ist ein
                  Leerzeichen, nicht die Lücke der Schaltfläche. */}
                  <span>
                    {zeichen ? <span aria-hidden="true">{`${zeichen} `}</span> : null}
                    {ERGEBNIS_TEXT[ergebnis]}
                  </span>
                </Button>
              );
            })}
          </div>
          {angabe && !notizSichtbar ? (
            <Button
              type="button"
              groesse="kompakt"
              variant="quiet"
              onClick={() => {
                fokusAufNotiz.current = true;
                setNotizGewuenscht(true);
              }}
            >
              <span>
                <span aria-hidden="true">+ </span>Notiz
              </span>
            </Button>
          ) : null}
        </div>
      </div>

      {abwaehlenFragen ? (
        <div
          role="group"
          aria-label="Ergebnis abwählen"
          className="flex flex-wrap items-center gap-2"
        >
          <p className="text-ink text-sm">Abwählen verwirft auch Messwert und Notiz.</p>
          <Button
            ref={abwaehlenRef}
            type="button"
            groesse="kompakt"
            variant="secondary"
            onClick={abwaehlen}
          >
            Ja, abwählen
          </Button>
          <Button
            type="button"
            groesse="kompakt"
            variant="quiet"
            onClick={() => {
              setAbwaehlenFragen(false);
              knoepfeRef.current
                ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
                ?.focus();
            }}
          >
            Behalten
          </Button>
        </div>
      ) : null}

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
          // Return schließt die Tastatur, schickt aber nicht das Formular der
          // Seite ab (BEF-09).
          enterKeyHint="done"
          onKeyDown={ohneAbsenden}
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
      enterKeyHint="done"
      onKeyDown={ohneAbsenden}
      error={ungueltig ? 'Bitte eine Zahl eingeben, etwa 1,5.' : undefined}
      onChange={(event) => onChange(event.target.value)}
      className="max-w-40"
    />
  );
}
