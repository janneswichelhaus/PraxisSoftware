import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { alsFormularfehler } from '@/lib/formularfehler';
import { LebensmittelSuche } from './LebensmittelSuche';
import type { Lebensmittel } from './lebensmittel';
import {
  leererTag,
  MAX_JE_MAHLZEIT,
  MAX_TAGE,
  PLAN_BESCHRIFTUNG,
  PLAN_FELDER,
  planPruefen,
  positionsEnergie,
  tagesEnergie,
  type Entwurfsposition,
  type PlanAngaben,
  type PlanFeld,
  type Planentwurf,
} from './plaene';
import { rezeptAlsLebensmittel, rezeptMeta, zutatAnfang, zutatMenge, type Rezept } from './rezepte';
import { ZutatMenge } from './RezeptFormular';
import { kcal, MAHLZEIT_NAMEN, MAHLZEITEN, type Mahlzeit } from './tagebuch';

const feldId = (feld: PlanFeld) => `plan-${feld}`;

/**
 * Ein Plan oder Tagesvorschlag (ADR-027 Punkt 14) mit ein bis sieben Tagen; die Beratung wählt
 * Rezepte der Praxis und Lebensmittel selbst aus. „Hinzufügen“ zeigt die Auswahl an der Stelle.
 */
export function PlanFormular({
  anfang,
  speichernText,
  laeuft,
  fehlermeldung,
  onSpeichern,
  onAbbrechen,
  unten,
  oben,
  beschriftung,
  rezepte,
  suchen,
  schluessel,
  ziel,
}: {
  anfang: Planentwurf;
  speichernText: string;
  laeuft: boolean;
  fehlermeldung?: string | undefined;
  onSpeichern: (angaben: PlanAngaben, freigeben: () => void) => void;
  onAbbrechen: () => void;
  /** Zerstörendes leise am Ende (DESIGN.md Regel 10). */
  unten?: ReactNode;
  /** Unter dem Titel, etwa der Beginn beim Zuweisen. */
  oben?: ReactNode;
  beschriftung: string;
  /** Die Rezepte der Praxis zur Wahl. */
  rezepte: readonly Rezept[];
  suchen: (begriff: string) => Promise<Lebensmittel[]>;
  schluessel: readonly unknown[];
  /** Das Energieziel der Person zur Orientierung, wenn der Plan an einer Beratung hängt. */
  ziel?: number | undefined;
}) {
  const [entwurf, setEntwurf] = useState<Planentwurf>(anfang);
  const [tag, setTag] = useState(0);
  const [fehler, setFehler] = useState<Partial<Record<PlanFeld, string>>>({});
  const [waehlen, setWaehlen] = useState<Mahlzeit | null>(null);
  const [offen, setOffen] = useState<{ mahlzeit: Mahlzeit; index: number } | null>(null);
  const geaendert = JSON.stringify(entwurf) !== JSON.stringify(anfang);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: EINGABETEXTE,
  });
  const aktuell = entwurf.tage[tag] ?? leererTag();
  const zurWahl = rezepte.map(rezeptAlsLebensmittel);

  function tagSetzen(mahlzeit: Mahlzeit, positionen: Entwurfsposition[]) {
    setEntwurf((e) => ({
      ...e,
      tage: e.tage.map((t, i) => (i === tag ? { ...t, [mahlzeit]: positionen } : t)),
    }));
  }

  function absenden(event: FormEvent) {
    event.preventDefault();
    const ergebnis = planPruefen(entwurf);
    if ('fehler' in ergebnis) {
      setFehler(ergebnis.fehler);
      return;
    }
    setFehler({});
    onSpeichern(ergebnis.angaben, freigeben);
  }

  if (waehlen) {
    return (
      <div className="max-w-formular">
        <Section
          titel={`${MAHLZEIT_NAMEN[waehlen]} · Tag ${tag + 1}`}
          aktion={
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              onClick={() => setWaehlen(null)}
            >
              Zurück zum Plan
            </Button>
          }
        >
          <LebensmittelSuche
            suchen={suchen}
            schluessel={schluessel}
            eigene={zurWahl}
            ohneBegriff={(oeffnen) => (
              <Listenabschnitt
                titel="Rezepte der Praxis"
                anzahl={rezepte.length}
                leer={{ titel: 'Noch keine Rezepte. Lebensmittel suchen, etwa „Apfel“.' }}
              >
                {rezepte.map((r, i) => (
                  <ListRow
                    key={r.id}
                    titel={r.name}
                    meta={rezeptMeta(r)}
                    onClick={() => oeffnen(zurWahl[i]!)}
                  />
                ))}
              </Listenabschnitt>
            )}
            fensterInhalt={(f, schliessen) => (
              <ZutatMenge
                f={f}
                knopf="Hinzufügen"
                onAbbrechen={schliessen}
                onFertig={(angabe, menge) => {
                  tagSetzen(waehlen, [...aktuell[waehlen], { lebensmittel: f, angabe, menge }]);
                  setFehler(({ tage: _weg, ...rest }) => rest);
                  schliessen();
                  setWaehlen(null);
                }}
              />
            )}
          />
        </Section>
        {schutz}
      </div>
    );
  }

  const energie = tagesEnergie(aktuell);
  const bearbeitet = offen ? aktuell[offen.mahlzeit][offen.index] : undefined;
  return (
    <>
      <form onSubmit={absenden} noValidate className="max-w-formular" aria-label={beschriftung}>
        <Fehlerzusammenfassung
          fehler={alsFormularfehler(PLAN_FELDER, PLAN_BESCHRIFTUNG, fehler, feldId)}
        />
        <Section titel="Plan">
          <Feldgruppe>
            <Field
              feldId={feldId('titel')}
              label={PLAN_BESCHRIFTUNG.titel}
              hint="etwa „Tagesvorschlag“ oder „Woche 1“"
              autoComplete="off"
              value={entwurf.titel}
              error={fehler.titel}
              onChange={(event) => setEntwurf((e) => ({ ...e, titel: event.target.value }))}
            />
            {oben}
          </Feldgruppe>
        </Section>
        <Section titel={PLAN_BESCHRIFTUNG.tage}>
          <div id={feldId('tage')} className="flex flex-col gap-3">
            {entwurf.tage.length > 1 ? (
              <Segment
                beschriftung="Tag wählen"
                wahlen={entwurf.tage.map((_, i) => ({ wert: String(i), text: `Tag ${i + 1}` }))}
                gewaehlt={String(tag)}
                onWaehlen={(wert: string) => setTag(Number(wert))}
              />
            ) : null}
            <p className="text-ink-muted tabular-nums" aria-live="polite">
              {`Tag ${tag + 1} · ${kcal(energie)}`}
              {ziel ? ` · Ziel ${kcal(ziel)}` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              {entwurf.tage.length < MAX_TAGE ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    groesse="kompakt"
                    onClick={() => {
                      setEntwurf((e) => ({ ...e, tage: [...e.tage, leererTag()] }));
                      setTag(entwurf.tage.length);
                    }}
                  >
                    Tag hinzufügen
                  </Button>
                  <Button
                    type="button"
                    variant="quiet"
                    groesse="kompakt"
                    onClick={() => {
                      setEntwurf((e) => ({ ...e, tage: [...e.tage, structuredClone(aktuell)] }));
                      setTag(entwurf.tage.length);
                    }}
                  >
                    Tag kopieren
                  </Button>
                </>
              ) : null}
              {entwurf.tage.length > 1 ? (
                <Button
                  type="button"
                  variant="quiet"
                  groesse="kompakt"
                  onClick={() => {
                    setEntwurf((e) => ({ ...e, tage: e.tage.filter((_, i) => i !== tag) }));
                    setTag(Math.max(0, tag - 1));
                  }}
                >
                  Tag entfernen
                </Button>
              ) : null}
            </div>
            {fehler.tage ? <p className="feldfehler text-danger text-sm">{fehler.tage}</p> : null}
          </div>
          {MAHLZEITEN.map((mahlzeit) => (
            <div key={mahlzeit} className="border-line mt-4 border-t pt-3">
              <Zwischentitel
                aktion={
                  aktuell[mahlzeit].length < MAX_JE_MAHLZEIT ? (
                    <Button
                      type="button"
                      variant="secondary"
                      groesse="kompakt"
                      aria-label={`${MAHLZEIT_NAMEN[mahlzeit]} hinzufügen`}
                      onClick={() => setWaehlen(mahlzeit)}
                    >
                      Hinzufügen
                    </Button>
                  ) : null
                }
              >
                {MAHLZEIT_NAMEN[mahlzeit]}
              </Zwischentitel>
              {aktuell[mahlzeit].length > 0 ? (
                <ListRows beschriftung={MAHLZEIT_NAMEN[mahlzeit]}>
                  {aktuell[mahlzeit].map((p, i) => (
                    <ListRow
                      key={`${p.lebensmittel.kind}-${p.lebensmittel.id}-${i}`}
                      titel={p.lebensmittel.name}
                      meta={`${zutatMenge(p)} · ${kcal(positionsEnergie(p))}`}
                      onClick={() => setOffen({ mahlzeit, index: i })}
                      aktion={
                        <Symbolknopf
                          beschriftung={`${p.lebensmittel.name} entfernen`}
                          variant="quiet"
                          onClick={() =>
                            tagSetzen(
                              mahlzeit,
                              aktuell[mahlzeit].filter((_, j) => j !== i),
                            )
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
              ) : null}
            </div>
          ))}
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
      {offen && bearbeitet ? (
        <Dialogfenster titel={bearbeitet.lebensmittel.name} onSchliessen={() => setOffen(null)}>
          <ZutatMenge
            f={bearbeitet.lebensmittel}
            anfang={zutatAnfang(bearbeitet)}
            knopf="Übernehmen"
            onAbbrechen={() => setOffen(null)}
            onFertig={(angabe, menge) => {
              tagSetzen(
                offen.mahlzeit,
                aktuell[offen.mahlzeit].map((p, j) =>
                  j === offen.index ? { lebensmittel: p.lebensmittel, angabe, menge } : p,
                ),
              );
              setOffen(null);
            }}
          />
        </Dialogfenster>
      ) : null}
    </>
  );
}
