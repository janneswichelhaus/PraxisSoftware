import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { alsFormularfehler } from '@/lib/formularfehler';
import { LebensmittelSuche } from './LebensmittelSuche';
import type { Lebensmittel } from './lebensmittel';
import {
  MAX_ZUTATEN,
  REZEPT_BESCHRIFTUNG,
  REZEPT_FELDER,
  rezeptPruefen,
  vorschauJePortion,
  zutatAnfang,
  zutatMenge,
  type JePortion,
  type RezeptAngaben,
  type RezeptFeld,
  type RezeptWerte,
  type Zutat,
  type ZutatLebensmittel,
} from './rezepte';
import {
  energieDerMenge,
  FREIE_MENGE,
  kcal,
  mengePruefen,
  vorbelegung,
  type Mengenangabe,
} from './tagebuch';
import { zahl } from './texte';

const feldId = (feld: RezeptFeld) => `rezept-${feld}`;

/**
 * Ein Rezept aus Zutaten für Praxis und Person (ADR-027 Punkt 9). „Hinzufügen“ zeigt die Suche an
 * der Stelle des Formulars, damit am Telefon nichts verloren geht; je Portion rechnet der Server.
 */
export function RezeptFormular({
  anfang,
  speichernText,
  laeuft,
  fehlermeldung,
  onSpeichern,
  onAbbrechen,
  unten,
  beschriftung,
  suchen,
  schluessel,
  eigene,
  zusatz,
}: {
  anfang: RezeptWerte;
  speichernText: string;
  laeuft: boolean;
  fehlermeldung?: string | undefined;
  onSpeichern: (angaben: RezeptAngaben, freigeben: () => void) => void;
  onAbbrechen: () => void;
  /** Zerstörendes leise am Ende (DESIGN.md Regel 10). */
  unten?: ReactNode;
  beschriftung: string;
  suchen: (begriff: string) => Promise<Lebensmittel[]>;
  schluessel: readonly unknown[];
  /** Eigene Lebensmittel der Person (Plattform). */
  eigene?: readonly Lebensmittel[];
  /** Geht mit den Angaben an den Server, etwa der Schlüssel eines mitgelieferten Rezepts. */
  zusatz?: Pick<RezeptAngaben, 'starter_key'>;
}) {
  const [werte, setWerte] = useState<RezeptWerte>(anfang);
  const [fehler, setFehler] = useState<Partial<Record<RezeptFeld, string>>>({});
  const [waehlen, setWaehlen] = useState(false);
  const [offen, setOffen] = useState<number | null>(null);
  const geaendert = JSON.stringify(werte) !== JSON.stringify(anfang);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: EINGABETEXTE,
  });
  const vorschau = vorschauJePortion(werte.zutaten, werte.portionen);

  function absenden(event: FormEvent) {
    event.preventDefault();
    const ergebnis = rezeptPruefen(werte);
    if ('fehler' in ergebnis) {
      setFehler(ergebnis.fehler);
      return;
    }
    setFehler({});
    onSpeichern(zusatz ? { ...ergebnis.angaben, ...zusatz } : ergebnis.angaben, freigeben);
  }

  function zutatSetzen(index: number, zutat: Zutat) {
    setWerte((w) => ({ ...w, zutaten: w.zutaten.map((z, i) => (i === index ? zutat : z)) }));
  }

  if (waehlen) {
    return (
      <div className="max-w-formular">
        <Section
          titel="Zutat hinzufügen"
          aktion={
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              onClick={() => setWaehlen(false)}
            >
              Zurück zum Rezept
            </Button>
          }
        >
          <LebensmittelSuche
            suchen={suchen}
            schluessel={schluessel}
            {...(eigene ? { eigene } : {})}
            fensterInhalt={(f, schliessen) => (
              <ZutatMenge
                f={f}
                knopf="Hinzufügen"
                onAbbrechen={schliessen}
                onFertig={(angabe, menge) => {
                  setWerte((w) => ({
                    ...w,
                    zutaten: [...w.zutaten, { lebensmittel: f, angabe, menge }],
                  }));
                  setFehler(({ zutaten: _weg, ...rest }) => rest);
                  schliessen();
                  setWaehlen(false);
                }}
              />
            )}
          />
        </Section>
        {schutz}
      </div>
    );
  }

  const bearbeitet = offen === null ? null : werte.zutaten[offen];
  return (
    <>
      <form onSubmit={absenden} noValidate className="max-w-formular" aria-label={beschriftung}>
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(REZEPT_FELDER, REZEPT_BESCHRIFTUNG, fehler, feldId)}
        />
        <Section titel="Rezept">
          <Feldgruppe>
            <Field
              feldId={feldId('name')}
              label={REZEPT_BESCHRIFTUNG.name}
              autoComplete="off"
              value={werte.name}
              error={fehler.name}
              onChange={(event) => setWerte((w) => ({ ...w, name: event.target.value }))}
            />
            <Field
              feldId={feldId('portionen')}
              label={REZEPT_BESCHRIFTUNG.portionen}
              inputMode="numeric"
              autoComplete="off"
              value={werte.portionen}
              error={fehler.portionen}
              onChange={(event) => setWerte((w) => ({ ...w, portionen: event.target.value }))}
            />
          </Feldgruppe>
        </Section>
        <Section
          titel={REZEPT_BESCHRIFTUNG.zutaten}
          aktion={
            werte.zutaten.length < MAX_ZUTATEN ? (
              <Button
                id={feldId('zutaten')}
                type="button"
                variant="secondary"
                groesse="kompakt"
                onClick={() => setWaehlen(true)}
              >
                Hinzufügen
              </Button>
            ) : null
          }
        >
          {werte.zutaten.length > 0 ? (
            <ListRows beschriftung="Zutaten">
              {werte.zutaten.map((z, i) => (
                <ListRow
                  key={`${z.lebensmittel.kind}-${z.lebensmittel.id}-${i}`}
                  titel={z.lebensmittel.name}
                  meta={`${zutatMenge(z)} · ${kcal(energieDerMenge(z.lebensmittel, z.menge))}`}
                  onClick={() => setOffen(i)}
                  aktion={
                    <Symbolknopf
                      beschriftung={`${z.lebensmittel.name} entfernen`}
                      variant="quiet"
                      onClick={() =>
                        setWerte((w) => ({ ...w, zutaten: w.zutaten.filter((_, j) => j !== i) }))
                      }
                    >
                      <span aria-hidden="true" className="text-lg">
                        ✕
                      </span>
                    </Symbolknopf>
                  }
                />
              ))}
            </ListRows>
          ) : (
            <p className="text-ink-muted">Noch keine Zutaten.</p>
          )}
          {fehler.zutaten ? (
            <p className="feldfehler text-danger text-sm">{fehler.zutaten}</p>
          ) : null}
        </Section>
        {vorschau ? <JePortionAbschnitt werte={vorschau} /> : null}
        <Section titel={REZEPT_BESCHRIFTUNG.zubereitung}>
          <TextArea
            feldId={feldId('zubereitung')}
            label={REZEPT_BESCHRIFTUNG.zubereitung}
            labelVersteckt
            rows={6}
            value={werte.zubereitung}
            error={fehler.zubereitung}
            onChange={(event) => setWerte((w) => ({ ...w, zubereitung: event.target.value }))}
          />
        </Section>
        {fehlermeldung ? (
          <Statusmeldung ton="fehler" className="mt-4">
            {fehlermeldung}
          </Statusmeldung>
        ) : null}
        <Formularfuss>
          <Button type="submit" disabled={laeuft}>
            {laeuft ? 'Wird gespeichert …' : speichernText}
          </Button>
          <Button type="button" variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </Formularfuss>
        {schutz}
      </form>
      {unten ? <div className="max-w-formular mt-8">{unten}</div> : null}
      {bearbeitet && offen !== null ? (
        <Dialogfenster titel={bearbeitet.lebensmittel.name} onSchliessen={() => setOffen(null)}>
          <ZutatMenge
            f={bearbeitet.lebensmittel}
            anfang={zutatAnfang(bearbeitet)}
            knopf="Übernehmen"
            onAbbrechen={() => setOffen(null)}
            onFertig={(angabe, menge) => {
              zutatSetzen(offen, { lebensmittel: bearbeitet.lebensmittel, angabe, menge });
              setOffen(null);
            }}
          />
        </Dialogfenster>
      ) : null}
    </>
  );
}

/** Energie und Makronährstoffe je Portion - im Formular als Vorschau, sonst vom Server. */
export function JePortionAbschnitt({
  werte,
  titel = 'Je Portion',
}: {
  werte: JePortion;
  titel?: string;
}) {
  return (
    <Section titel={titel} rahmen>
      <DetailList>
        <DetailRow label="Energie">{kcal(werte.energy_kcal)}</DetailRow>
        <DetailRow label="Eiweiß">{`${zahl(werte.protein_g, 1)} g`}</DetailRow>
        <DetailRow label="Kohlenhydrate">{`${zahl(werte.carbohydrate_g, 1)} g`}</DetailRow>
        <DetailRow label="Fett">{`${zahl(werte.fat_g, 1)} g`}</DetailRow>
      </DetailList>
    </Section>
  );
}

/** Die Menge einer Zutat: Portion mit Anzahl oder g bzw. ml, vorbelegt, mit ihrer Energie. */
export function ZutatMenge({
  f,
  anfang,
  knopf,
  onFertig,
  onAbbrechen,
}: {
  f: ZutatLebensmittel;
  anfang?: { einheit: string; wert: string };
  knopf: string;
  onFertig: (angabe: Mengenangabe, menge: number) => void;
  onAbbrechen: () => void;
}) {
  const start = anfang ?? vorbelegung(f);
  const [einheit, setEinheit] = useState(start.einheit);
  const [wert, setWert] = useState(start.wert);
  const [fehler, setFehler] = useState<string | undefined>();
  const geprueft = mengePruefen(f, einheit, wert);
  const wahlen = [
    ...f.portions.map((p) => ({ wert: p.label, text: p.label })),
    { wert: FREIE_MENGE, text: f.base_unit === 'ml' ? 'Milliliter' : 'Gramm' },
  ];
  return (
    <form
      aria-label="Menge wählen"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if ('fehler' in geprueft) {
          setFehler(geprueft.fehler);
          return;
        }
        onFertig(geprueft.angabe, geprueft.menge);
      }}
    >
      {wahlen.length > 1 ? (
        <Wahlreihe
          legende="Einheit"
          wahlen={wahlen}
          gewaehlt={einheit}
          onWaehlen={(neu) => {
            setEinheit(neu);
            setWert(neu === FREIE_MENGE ? '100' : '1');
          }}
        />
      ) : null}
      <Field
        label={einheit === FREIE_MENGE ? `Menge (${f.base_unit})` : 'Anzahl'}
        hint={
          einheit !== FREIE_MENGE && 'menge' in geprueft
            ? `${zahl(geprueft.menge, geprueft.menge % 1 === 0 ? 0 : 1)} ${f.base_unit}`
            : undefined
        }
        inputMode="decimal"
        autoComplete="off"
        value={wert}
        error={fehler}
        onChange={(event) => setWert(event.target.value)}
      />
      {'menge' in geprueft ? (
        <p className="text-ink text-base font-semibold" aria-live="polite">
          {kcal(energieDerMenge(f, geprueft.menge))}
        </p>
      ) : null}
      <Formularfuss dicht>
        <Button type="submit">{knopf}</Button>
        <Button type="button" variant="quiet" onClick={onAbbrechen}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
