import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate, todayInTimeZone } from '@/lib/datum';
import { fetchAssignableTherapists } from '@/features/appointments/api';
import { dateLong } from '@/features/working-time/format';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { canManageWorkingHours, type CurrentUser } from '@/features/session/types';
import {
  WOCHENTAGE,
  bloeckeText,
  fetchWorkingHourExceptions,
  fetchWorkingHours,
  saveWorkingHourException,
  saveWorkingWeek,
  wochenBloecke,
  wochentagLabels,
  type Wochentag,
  type Zeitblock,
} from './api';
import {
  LEERER_BLOCK,
  abweichungenNachDatum,
  gleicheBloecke,
  halbeBloecke,
  ohneLeere,
  type AbweichungsTag,
  type Blockfehler,
} from './zeitbloecke';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/**
 * Arbeitszeiten und Planungseinstellungen der Praxis (CAL-005).
 *
 * Zwei Dinge auf einer Seite, weil beide dieselbe Frage beantworten: wann
 * kann überhaupt geplant werden. Das Raster gilt für die ganze Praxis und darf
 * nur von owner geändert werden; die Arbeitszeiten gehören zur einzelnen
 * Person und werden von owner, team_lead und office gepflegt.
 *
 * Die Seite heißt wie ihr Menüpunkt, „Arbeitszeiten" (ORG-07, TER-22); bis
 * UXR-011 stand über ihr „Planung". Die Reihenfolge - Praxiseinstellungen vor
 * den Arbeitszeiten - bleibt, bis Jannes über ORG-06 entschieden hat.
 *
 * **Nichts verschwindet still (ORG-02, ORG-03).** Ein halb ausgefüllter Block
 * ist ein Feldfehler und wird nicht gespeichert; ein Tag, der Blöcke hatte,
 * wird erst nach einer Rückfrage leer gespeichert; ein geöffneter Tag bleibt
 * offen, bis er gespeichert ist; ein Wechsel der Person mit ungespeicherten
 * Blöcken fragt, und ein Seitenwechsel läuft durch
 * den Schutz der Formulare (ANN-046, ohne Entwurf nur Verwerfen und Bleiben).
 *
 * Die Rollenprüfung hier steuert nur die Darstellung. Verbindlich prüfen
 * `set_appointment_grid`, `set_staff_working_week` (je Tag
 * `set_staff_working_hours`) und `set_staff_working_hour_exception` (ADR-004).
 */

/** Die Rückfrage vor dem Weggehen, mit den Sätzen für Formulare (ANN-046). */
const SCHUTZTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherte Arbeitszeiten',
};

/** Was nach einem gescheiterten Speichern zu tun ist (WRT-01). */
const ERNEUT_SPEICHERN = 'Bitte die Verbindung prüfen und erneut speichern.';

/** Kalendertag ein Jahr später, über UTC gerechnet – keine Ortszeit im Spiel. */
function einJahrSpaeter(tag: string): string {
  const d = new Date(`${tag}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/** Setzt den Fokus auf das Element mit dieser Kennung, sofern es im Dokument steht. */
function fokussieren(id: string) {
  document.getElementById(id)?.focus();
}

/** Das erste Feld mit Fehler - dorthin wandert der Fokus (ORG-02). */
function ersterFehler(praefix: string, fehler: readonly Blockfehler[]): string | null {
  for (const [index, eintrag] of fehler.entries()) {
    if (eintrag.von) return `${praefix}-${index}-von`;
    if (eintrag.bis) return `${praefix}-${index}-bis`;
  }
  return null;
}

/**
 * Rückfrage vor einem Wechsel, der ungespeicherte Eingaben verwerfen würde
 * (ORG-03).
 *
 * Tag und Person wechseln ohne Seitenwechsel; der Schutz der Formulare sieht
 * davon nichts. Bis UXR-011 setzte ein Wechsel die Blöcke still zurück - wer
 * vor dem Speichern den Wochentag umstellte, verlor die Eingabe und merkte es
 * erst beim Zurückwechseln. Der Kasten steht an der Auswahl, die den Wechsel
 * auslöst, und nimmt den Fokus. Ohne Entwurfszustand gibt es wie beim Schutz
 * der Formulare nur Verwerfen und Bleiben (ANN-046).
 */
function Wechselrueckfrage({
  children,
  onVerwerfen,
  onBleiben,
}: {
  children: ReactNode;
  onVerwerfen: () => void;
  onBleiben: () => void;
}) {
  return (
    <Dialogfenster titel="Noch nicht gespeichert" onSchliessen={onBleiben}>
      <div role="group" aria-label={SCHUTZTEXTE.bezeichnung}>
        <p className="text-ink text-sm leading-relaxed">{children}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={onVerwerfen}>
            Verwerfen und wechseln
          </Button>
          <Button type="button" variant="quiet" data-autofocus onClick={onBleiben}>
            Hier bleiben
          </Button>
        </div>
      </div>
    </Dialogfenster>
  );
}

// -----------------------------------------------------------------------------
// Zeitblöcke
// -----------------------------------------------------------------------------

function BlockFelder({
  bloecke,
  fehler,
  onChange,
  legende,
  // Wochenplan und Abweichung stehen auf derselben Seite. Ohne eigene
  // Beschriftung hätten ihre Felder identische Labels - für Screenreader
  // nicht unterscheidbar.
  blockLabel,
  // Feste Kennungen, damit der Fokus auf das erste fehlerhafte Feld springen
  // kann (ORG-02).
  idPraefix,
  gesperrt = false,
}: {
  bloecke: Zeitblock[];
  fehler: Blockfehler[] | null;
  onChange: (bloecke: Zeitblock[]) => void;
  legende: string;
  blockLabel: string;
  idPraefix: string;
  gesperrt?: boolean;
}) {
  function setzen(index: number, feld: keyof Zeitblock, wert: string) {
    onChange(bloecke.map((b, i) => (i === index ? { ...b, [feld]: wert } : b)));
  }

  /**
   * Einen Block entfernen (ORG-05). Bis UXR-011 ließen sich Blöcke nur
   * hinzufügen; wer einen zu viel hatte, musste ihn leeren und die Regel
   * kennen, dass leere Blöcke wegfallen. Der letzte Block bleibt als leere
   * Zeile stehen, damit sofort wieder etwas eingetragen werden kann.
   */
  function entfernen(index: number) {
    const rest = bloecke.filter((_, i) => i !== index);
    onChange(rest.length > 0 ? rest : [{ ...LEERER_BLOCK }]);
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-ink text-sm font-medium">{legende}</legend>
      <div className="mt-2 flex flex-col gap-6 sm:gap-3">
        {bloecke.map((block, index) => {
          const nummer = `${blockLabel} ${index + 1}`;
          const entfernbar = bloecke.length > 1 || block.von !== '' || block.bis !== '';
          return (
            // Ein Block: von, bis und Entfernen (Design-Rollout B2) - vorher
            // stand unter jedem Block ein eigener Knopf „Block n entfernen“.
            // ANN-489: Nebeneinander erst ab 640 px (DESIGN.md, Formular), am
            // Telefon untereinander wie Beginn und Ende einer Fehlzeit; das
            // Entfernen steht dort neben „von“. Die Blöcke trennt der größere
            // Abstand (24 statt 12 px). Sichtbar steht nur „von“/„bis“,
            // vorgelesen wird der ganze Name mit Block und Nummer (T6).
            <div
              key={index}
              data-testid="zeitblock"
              className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <div className="col-start-1 row-start-1">
                <Field
                  label="von"
                  aria-label={`${nummer} von`}
                  feldId={`${idPraefix}-${index}-von`}
                  type="time"
                  value={block.von}
                  error={fehler?.[index]?.von}
                  disabled={gesperrt}
                  onChange={(e) => setzen(index, 'von', e.target.value)}
                />
              </div>
              <div className="col-start-1 row-start-2 sm:col-start-2 sm:row-start-1">
                <Field
                  label="bis"
                  aria-label={`${nummer} bis`}
                  feldId={`${idPraefix}-${index}-bis`}
                  type="time"
                  value={block.bis}
                  error={fehler?.[index]?.bis}
                  disabled={gesperrt}
                  onChange={(e) => setzen(index, 'bis', e.target.value)}
                />
              </div>
              {/* Die Spalte bleibt, auch ohne Knopf: So fluchten die Felder. */}
              <div className="col-start-2 row-start-1 mb-0.5 size-11 sm:col-start-3">
                {entfernbar ? (
                  <Symbolknopf
                    beschriftung={`${nummer} entfernen`}
                    disabled={gesperrt}
                    onClick={() => entfernen(index)}
                  >
                    <span className="text-xl leading-none">×</span>
                  </Symbolknopf>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2">
        <Button
          type="button"
          variant="quiet"
          groesse="kompakt"
          disabled={gesperrt}
          onClick={() => onChange([...bloecke, { ...LEERER_BLOCK }])}
        >
          Weiteren Block hinzufügen
        </Button>
      </div>
    </fieldset>
  );
}

// -----------------------------------------------------------------------------
// Wochenplan
// -----------------------------------------------------------------------------

/**
 * Was im Wochenplan gerade eingegeben ist (Wochenplan in einem Zug).
 *
 * Je Wochentag die eingegebenen Blöcke, nur für Tage, an denen jemand etwas
 * eingegeben hat. Bis zum Praxis-Review der Überholung Organisation
 * speicherte jeder Tag für sich; jetzt öffnet man die Tage, die sich ändern,
 * und speichert sie mit einem Knopf - alle oder keiner
 * (`set_staff_working_week`). Ein geöffneter Tag bleibt offen, bis er
 * gespeichert ist; so steht eine Eingabe nie unsichtbar im Formular.
 */
interface Wochenstand {
  bearbeitung: Partial<Record<Wochentag, Zeitblock[]>>;
  offen: Wochentag[];
  fehler: Partial<Record<Wochentag, Blockfehler[]>>;
  /**
   * Zuletzt gespeichert, bis die Liste den neuen Stand geladen hat (ORG-04).
   * Scheitert das Nachladen, gilt weiter das, was der Server bestätigt hat.
   */
  gesichert: { bloecke: Partial<Record<Wochentag, Zeitblock[]>>; stand: number } | null;
  meldung: { text: string; nr: number } | null;
}

const FRISCHER_STAND: Wochenstand = {
  bearbeitung: {},
  offen: [],
  fehler: {},
  gesichert: null,
  meldung: null,
};

/** „Montag“, „Montag und Mittwoch“, „Montag, Mittwoch und Freitag“. */
function tageText(tage: readonly Wochentag[]): string {
  const namen = tage.map((t) => wochentagLabels[t]);
  if (namen.length <= 1) return namen[0] ?? '';
  return `${namen.slice(0, -1).join(', ')} und ${namen.at(-1)}`;
}

/**
 * Wochenplan einer Person.
 *
 * Die Seite setzt je Person eine neue Instanz (`key`) - verworfene Eingaben
 * einer Person tauchen so beim Zurückwechseln nicht wieder auf.
 */
function Wochenplan({
  staffMemberId,
  darfPflegen,
  heute,
  onUngespeichert,
}: {
  staffMemberId: string;
  darfPflegen: boolean;
  /** Gepflegt wird die Fassung, die heute gilt (AZ-001, ANN-589). */
  heute: string;
  onUngespeichert: (ungespeichert: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [stand, setStand] = useState<Wochenstand>(FRISCHER_STAND);

  const zeiten = useQuery({
    queryKey: ['working-hours'],
    queryFn: fetchWorkingHours,
    retry: false,
  });

  // Für die Rückmeldung nach dem Speichern: welcher Stand der Liste geladen war.
  const datenstandRef = useRef(zeiten.dataUpdatedAt);
  datenstandRef.current = zeiten.dataUpdatedAt;

  const daten = zeiten.data ?? [];
  // Eine schon genehmigte künftige Fassung (AZ-001): Sie steht als Hinweis da,
  // gepflegt wird hier der Plan bis dahin.
  const kuenftigAb =
    daten
      .filter((w) => w.staff_member_id === staffMemberId && w.valid_from && w.valid_from > heute)
      .map((w) => w.valid_from!)
      .sort()[0] ?? null;

  const referenz = (w: Wochentag): Zeitblock[] => {
    const gesichert =
      stand.gesichert && stand.gesichert.stand === zeiten.dataUpdatedAt
        ? stand.gesichert.bloecke[w]
        : undefined;
    return gesichert ?? wochenBloecke(daten, staffMemberId, w, heute);
  };
  const angezeigt = (w: Wochentag): Zeitblock[] => {
    const vorher = referenz(w);
    return stand.bearbeitung[w] ?? (vorher.length > 0 ? vorher : [{ ...LEERER_BLOCK }]);
  };
  const geaendert = WOCHENTAGE.filter((w) => {
    const eingabe = stand.bearbeitung[w];
    return eingabe !== undefined && !gleicheBloecke(ohneLeere(eingabe), referenz(w));
  });
  const ungespeichert = geaendert.length > 0;
  // Ein Tag, der Blöcke hatte, wird nur nach Rückfrage leer gespeichert (ORG-02).
  const geleert = geaendert.filter(
    (w) => ohneLeere(angezeigt(w)).length === 0 && referenz(w).length > 0,
  );
  const halbeVorhanden = geaendert.some((w) => halbeBloecke(angezeigt(w)) !== null);

  useEffect(() => {
    onUngespeichert(ungespeichert);
  }, [ungespeichert, onUngespeichert]);
  useEffect(() => () => onUngespeichert(false), [onUngespeichert]);

  const mutation = useMutation({
    mutationFn: (tage: { tag: Wochentag; bloecke: Zeitblock[] }[]) =>
      saveWorkingWeek(staffMemberId, tage),
    onSuccess: (_, tage) => {
      setStand((vorher) => {
        const bearbeitung = { ...vorher.bearbeitung };
        const gesichert: Partial<Record<Wochentag, Zeitblock[]>> = {};
        for (const { tag, bloecke } of tage) {
          gesichert[tag] = bloecke;
          // Wer während des Speicherns weitergetippt hat, behält seine Eingabe.
          const eingabe = bearbeitung[tag];
          if (eingabe === undefined || gleicheBloecke(ohneLeere(eingabe), bloecke)) {
            delete bearbeitung[tag];
          }
        }
        return {
          bearbeitung,
          offen: vorher.offen.filter((w) => bearbeitung[w] !== undefined),
          fehler: {},
          gesichert: { bloecke: gesichert, stand: datenstandRef.current },
          meldung: {
            text: `Wochenplan gespeichert: ${tageText(tage.map((t) => t.tag))}.`,
            nr: (vorher.meldung?.nr ?? 0) + 1,
          },
        };
      });
      // Nicht abwarten (ZST-B01): Gespeichert ist es mit der Antwort des
      // Servers. Hängt das Nachladen, stünde sonst sekundenlang „Wird
      // gespeichert …" da.
      void queryClient.invalidateQueries({ queryKey: ['working-hours'] });
    },
  });

  const auftrag = () => geaendert.map((w) => ({ tag: w, bloecke: ohneLeere(angezeigt(w)) }));

  function speichern() {
    if (mutation.isPending || !ungespeichert) return;
    const fehler: Partial<Record<Wochentag, Blockfehler[]>> = {};
    for (const w of geaendert) {
      const halbe = halbeBloecke(angezeigt(w));
      if (halbe) fehler[w] = halbe;
    }
    const erster = WOCHENTAGE.find((w) => fehler[w]);
    if (erster) {
      setStand((vorher) => ({ ...vorher, fehler }));
      const ziel = ersterFehler(`wochenplan-${erster}`, fehler[erster]!);
      if (ziel) fokussieren(ziel);
      return;
    }
    setStand((vorher) => ({ ...vorher, fehler: {} }));
    mutation.mutate(auftrag());
  }

  function oeffnen(w: Wochentag) {
    mutation.reset();
    setStand((vorher) => ({
      ...vorher,
      offen: vorher.offen.includes(w) ? vorher.offen : [...vorher.offen, w],
    }));
  }

  if (zeiten.isPending) return <LoadingState label="Arbeitszeiten werden geladen …" />;
  // Nur ohne Daten ersetzt der Fehler den Plan (ZST-03): Scheitert ein
  // Nachladen, bleibt der zuletzt geladene Stand samt Eingabe stehen.
  if (zeiten.isError && !zeiten.data) {
    return (
      <ErrorState
        title="Die Arbeitszeiten konnten nicht geladen werden."
        description={VERBINDUNG_PRUEFEN}
        onErneut={() => void zeiten.refetch()}
      />
    );
  }

  return (
    // Ohne Erklärsatz (DESIGN.md Regel 6): Die Zeitzone nennt das
    // Kleingedruckte am Seitenende.
    <Section titel="Wochenplan">
      {zeiten.isError ? (
        <NachladeHinweis
          className="mb-4"
          laeuft={zeiten.isFetching}
          onErneut={() => void zeiten.refetch()}
        />
      ) : null}
      {kuenftigAb ? (
        <Statusmeldung ton="neutral" className="mb-4">
          Ab {dateLong(kuenftigAb)} gilt ein geänderter Wochenplan (genehmigte Änderung). Hier
          gepflegt wird der Plan bis dahin.
        </Statusmeldung>
      ) : null}

      <div className="max-w-spalte flex flex-col gap-4">
        {/* Die Wochentage als Zeilen des Systems (DESIGN.md Regel 3): Tag und
            Zeiten, daneben „Bearbeiten“; der geöffnete Tag trägt seine
            Felder unter der Zeile. */}
        <ListRows>
          {WOCHENTAGE.map((w) => {
            const label = wochentagLabels[w];
            const offen = darfPflegen && stand.offen.includes(w);
            const istGeaendert = geaendert.includes(w);
            return (
              <ListRow
                key={w}
                titel={label}
                meta={bloeckeText(istGeaendert ? ohneLeere(angezeigt(w)) : referenz(w))}
                status={istGeaendert ? <Badge ton="warnung">Nicht gespeichert</Badge> : undefined}
                aktion={
                  darfPflegen && !offen ? (
                    <Button
                      type="button"
                      variant="quiet"
                      aria-label={`${label} bearbeiten`}
                      disabled={mutation.isPending}
                      onClick={() => oeffnen(w)}
                    >
                      Bearbeiten
                    </Button>
                  ) : undefined
                }
                darunter={
                  offen ? (
                    <div className="pb-4">
                      <BlockFelder
                        bloecke={angezeigt(w)}
                        fehler={stand.fehler[w] ?? null}
                        onChange={(neu) =>
                          // Einmal gezeigte Fehler laufen mit der Eingabe mit: Ist
                          // der Block vollständig oder ganz leer, verschwindet der
                          // Hinweis.
                          setStand((vorher) => {
                            const fehler = { ...vorher.fehler };
                            if (fehler[w]) {
                              const halbe = halbeBloecke(neu);
                              if (halbe) fehler[w] = halbe;
                              else delete fehler[w];
                            }
                            return {
                              ...vorher,
                              bearbeitung: { ...vorher.bearbeitung, [w]: neu },
                              fehler,
                            };
                          })
                        }
                        legende={`Zeitblöcke am ${label}`}
                        blockLabel={`${label}, Block`}
                        idPraefix={`wochenplan-${w}`}
                        gesperrt={mutation.isPending}
                      />
                    </div>
                  ) : undefined
                }
              />
            );
          })}
        </ListRows>

        {darfPflegen ? (
          <>
            {mutation.isError && geleert.length === 0 ? (
              <Statusmeldung ton="fehler">
                {mutation.error.message} Die Eingaben stehen noch im Formular.
              </Statusmeldung>
            ) : null}
            {stand.meldung && !ungespeichert ? (
              <Rueckmeldung key={stand.meldung.nr}>{stand.meldung.text}</Rueckmeldung>
            ) : null}
            {stand.offen.length > 0 ? (
              // Ein Speichern für die ganze Woche: Einen Tag leert man, indem
              // man seine Blöcke entfernt; was das bedeutet, sagt die
              // Rückfrage beim Speichern (ANN-435). „Verwerfen“ schließt alle
              // geöffneten Tage ohne zu speichern (Design-Review).
              <Formularfuss dicht>
                {geleert.length > 0 && !halbeVorhanden ? (
                  <Rueckfrage
                    ausloeser="Wochenplan speichern"
                    ausloeserVariante="primary"
                    bezeichnung={`${tageText(geleert)} ohne Arbeitszeit speichern`}
                    bestaetigen="Ohne Arbeitszeit speichern"
                    bestaetigenLaeuft="Wird gespeichert …"
                    fehler={mutation.isError ? mutation.error.message : undefined}
                    onBestaetigen={() => mutation.mutateAsync(auftrag())}
                    onAbbrechen={() => mutation.reset()}
                  >
                    <p>
                      {tageText(geleert)} ohne Arbeitszeit speichern? Danach sind an{' '}
                      {geleert.length === 1 ? 'diesem Wochentag' : 'diesen Wochentagen'} keine
                      Termine vorgesehen.
                    </p>
                  </Rueckfrage>
                ) : (
                  <Button
                    type="button"
                    disabled={mutation.isPending || !ungespeichert}
                    onClick={speichern}
                  >
                    {mutation.isPending ? 'Wird gespeichert …' : 'Wochenplan speichern'}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="quiet"
                  disabled={mutation.isPending}
                  onClick={() => {
                    mutation.reset();
                    setStand((vorher) => ({ ...FRISCHER_STAND, meldung: vorher.meldung }));
                  }}
                >
                  {ungespeichert ? 'Änderungen verwerfen' : 'Schließen'}
                </Button>
              </Formularfuss>
            ) : null}
          </>
        ) : (
          <p className="text-ink-muted text-sm">
            Für das Ändern des Wochenplans fehlt Ihrem Zugang die Berechtigung.
          </p>
        )}
      </div>
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Datumsbezogene Abweichungen
// -----------------------------------------------------------------------------

interface Abweichungsform {
  datum: string;
  abwesend: boolean;
  bloecke: Zeitblock[];
}

const LEERE_FORM: Abweichungsform = { datum: '', abwesend: false, bloecke: [{ ...LEERER_BLOCK }] };

function gleicheForm(a: Abweichungsform, b: Abweichungsform): boolean {
  return (
    a.datum === b.datum &&
    a.abwesend === b.abwesend &&
    gleicheBloecke(ohneLeere(a.bloecke), ohneLeere(b.bloecke))
  );
}

function alsForm(tag: AbweichungsTag): Abweichungsform {
  return {
    datum: tag.datum,
    abwesend: tag.frei,
    bloecke: tag.frei || tag.bloecke.length === 0 ? [{ ...LEERER_BLOCK }] : tag.bloecke,
  };
}

interface Abweichungsauftrag {
  datum: string;
  abwesend: boolean;
  bloecke: Zeitblock[];
  /** Entfernen ist dieselbe Serverfunktion mit leeren Blöcken. */
  art: 'speichern' | 'entfernen';
  /** Wo die Rückmeldung erscheint: an der Liste oder am Formular. */
  ort: 'liste' | 'formular';
  /** Das Formular zum Zeitpunkt des Speicherns - danach gilt es als gesichert. */
  quelle: Abweichungsform | null;
}

interface Abweichungsmeldung {
  text: string;
  ort: 'liste' | 'formular';
  nr: number;
}

function Abweichungen({
  staffMemberId,
  darfPflegen,
  heute,
  onUngespeichert,
}: {
  staffMemberId: string;
  darfPflegen: boolean;
  heute: string | undefined;
  onUngespeichert: (ungespeichert: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Abweichungsform>(LEERE_FORM);
  // Wovon die Eingabe ausging: leer oder eine geladene Abweichung (ORG-05).
  const [ausgang, setAusgang] = useState<Abweichungsform>(LEERE_FORM);
  const [fehler, setFehler] = useState<Blockfehler[] | null>(null);
  const [meldung, setMeldung] = useState<Abweichungsmeldung | null>(null);
  const [ladenFrage, setLadenFrage] = useState<Abweichungsform | null>(null);
  /** Das Datum, dessen Abweichung nach Rückfrage entfernt werden soll. */
  const [entfernenFrage, setEntfernenFrage] = useState<string | null>(null);
  const formular = useRef<HTMLDivElement>(null);

  // Ein knappes Fenster nach vorn: die Pflege betrifft die kommende Planung,
  // nicht die Vergangenheit. Gerechnet über ein Date statt über die
  // Jahreszahl im Text - der 29. Februar plus ein Jahr wäre sonst der
  // 29. Februar eines Nichtschaltjahres und damit gar kein Datum.
  const von = heute ?? '';
  const bis = heute ? einJahrSpaeter(heute) : '';

  const ausnahmen = useQuery({
    queryKey: ['working-hour-exceptions', von, bis],
    queryFn: () => fetchWorkingHourExceptions(von, bis),
    enabled: Boolean(heute),
    retry: false,
  });

  const tage = abweichungenNachDatum(
    (ausnahmen.data ?? []).filter((a) => a.staff_member_id === staffMemberId),
  );
  const bestehend = tage.some((t) => t.datum === form.datum);
  // Ohne Häkchen und ohne Blöcke wird nichts eingetragen - eine bestehende
  // Abweichung wird damit entfernt (ORG-02).
  const leer = !form.abwesend && ohneLeere(form.bloecke).length === 0;
  const ungespeichert = !gleicheForm(form, ausgang);
  const datumText = form.datum ? formatDate(form.datum) : '';

  useEffect(() => {
    onUngespeichert(ungespeichert);
  }, [ungespeichert, onUngespeichert]);
  useEffect(() => () => onUngespeichert(false), [onUngespeichert]);

  const mutation = useMutation({
    mutationFn: (auftrag: Abweichungsauftrag) =>
      saveWorkingHourException(staffMemberId, auftrag.datum, auftrag.abwesend, auftrag.bloecke),
    onSuccess: (_, auftrag) => {
      const text =
        auftrag.art === 'entfernen'
          ? `Die Abweichung am ${formatDate(auftrag.datum)} ist entfernt.`
          : `Die Abweichung am ${formatDate(auftrag.datum)} ist gespeichert.`;
      setMeldung((vorher) => ({ text, ort: auftrag.ort, nr: (vorher?.nr ?? 0) + 1 }));
      // Was gespeichert ist, gilt nicht mehr als ungespeichert.
      if (auftrag.quelle) setAusgang(auftrag.quelle);
      void queryClient.invalidateQueries({ queryKey: ['working-hour-exceptions'] });
    },
  });

  function setzeForm(teil: Partial<Abweichungsform>) {
    const neu = { ...form, ...teil };
    setForm(neu);
    // Einmal gezeigte Fehler laufen mit der Eingabe mit.
    if (fehler) setFehler(halbeBloecke(neu.bloecke));
    setMeldung(null);
  }

  function laden(neu: Abweichungsform) {
    setLadenFrage(null);
    setForm(neu);
    setAusgang(neu);
    setFehler(null);
    setMeldung(null);
    mutation.reset();
    formular.current?.focus();
  }

  function speichern() {
    if (mutation.isPending || form.datum === '' || leer) return;
    if (!form.abwesend) {
      const halbe = halbeBloecke(form.bloecke);
      if (halbe) {
        setFehler(halbe);
        const ziel = ersterFehler('abweichung', halbe);
        if (ziel) fokussieren(ziel);
        return;
      }
    }
    setFehler(null);
    mutation.mutate({
      datum: form.datum,
      abwesend: form.abwesend,
      bloecke: form.abwesend ? [] : ohneLeere(form.bloecke),
      art: 'speichern',
      ort: 'formular',
      quelle: form,
    });
  }

  function liste() {
    // Ohne Zeitzone der Praxis gibt es kein „heute" und damit kein Fenster.
    // Bis UXR-011 stand hier dann „keine Abweichung hinterlegt" (ORG-14).
    if (!heute) {
      return (
        <Statusmeldung ton="warnung">
          Die Zeitzone der Praxis fehlt. Ohne sie lassen sich die Abweichungen nicht anzeigen.
        </Statusmeldung>
      );
    }
    if (ausnahmen.isPending) return <LoadingState label="Abweichungen werden geladen …" />;
    if (ausnahmen.isError && !ausnahmen.data) {
      return (
        <ErrorState
          title="Die Abweichungen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void ausnahmen.refetch()}
        />
      );
    }

    return (
      <>
        {ausnahmen.isError ? (
          <NachladeHinweis
            className="mb-4"
            laeuft={ausnahmen.isFetching}
            onErneut={() => void ausnahmen.refetch()}
          />
        ) : null}
        {/* Erst nach dem Schließen des Fensters: Dann nimmt die Bestätigung
            den Fokus, nicht der Knopf, der das Fenster geöffnet hatte. */}
        {meldung?.ort === 'liste' && entfernenFrage === null ? (
          <Rueckmeldung key={meldung.nr} className="mb-3">
            {meldung.text}
          </Rueckmeldung>
        ) : null}
        {tage.length > 0 ? (
          // Datum und Zeit als Zeile des Systems (ORG-29, DESIGN.md Regel 3),
          // mehrere Blöcke eines Tages in einer Zeile (ORG-05). Die Arbeit
          // steht daneben; das Entfernen fragt in einem Fenster nach, weil
          // die Zeile für eine Rückfrage an Ort und Stelle zu schmal ist.
          <ListRows>
            {tage.map((t) => {
              const datum = formatDate(t.datum);
              return (
                <ListRow
                  key={t.datum}
                  titel={<span className="tabular-nums">{datum}</span>}
                  meta={t.frei ? 'Keine Termine' : bloeckeText(t.bloecke)}
                  aktion={
                    darfPflegen ? (
                      <span
                        role="group"
                        aria-label={`Abweichung am ${datum}`}
                        className="flex items-center gap-1"
                      >
                        <Button
                          type="button"
                          variant="quiet"
                          disabled={mutation.isPending}
                          onClick={() => {
                            const neu = alsForm(t);
                            if (ungespeichert) setLadenFrage(neu);
                            else laden(neu);
                          }}
                        >
                          Ändern
                        </Button>
                        <Button
                          type="button"
                          variant="quiet"
                          disabled={mutation.isPending}
                          onClick={() => {
                            mutation.reset();
                            setEntfernenFrage(t.datum);
                          }}
                        >
                          Entfernen
                        </Button>
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
          </ListRows>
        ) : (
          // Der Leerzustand in der Karte (DESIGN.md Regel 8).
          <EmptyState inKarte title="Für das kommende Jahr ist keine Abweichung hinterlegt." />
        )}

        {entfernenFrage !== null ? (
          <EntfernenFenster
            datum={formatDate(entfernenFrage)}
            fehler={
              mutation.isError && mutation.variables?.ort === 'liste'
                ? mutation.error.message
                : undefined
            }
            onBestaetigen={() =>
              mutation.mutateAsync({
                datum: entfernenFrage,
                abwesend: false,
                bloecke: [],
                art: 'entfernen',
                ort: 'liste',
                quelle: null,
              })
            }
            onSchliessen={() => {
              setEntfernenFrage(null);
              mutation.reset();
            }}
          />
        ) : null}
      </>
    );
  }

  const formularFehler = mutation.isError && mutation.variables?.ort === 'formular';

  return (
    // Ohne Erklärsatz (DESIGN.md Regel 6): Was eine Abweichung bewirkt, sagen
    // die Rückfragen dort, wo es ansteht.
    <Section titel="Abweichungen an einzelnen Tagen">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div>{liste()}</div>

        {darfPflegen ? (
          <div
            ref={formular}
            tabIndex={-1}
            role="group"
            aria-label="Abweichung eintragen"
            className="flex flex-col gap-4 outline-none"
          >
            {ladenFrage ? (
              <Wechselrueckfrage
                onVerwerfen={() => laden(ladenFrage)}
                onBleiben={() => setLadenFrage(null)}
              >
                Die Eingaben im Formular sind noch nicht gespeichert und gehen beim Wechsel zur
                Abweichung am {formatDate(ladenFrage.datum)} verloren.
              </Wechselrueckfrage>
            ) : null}

            <Field
              label="Datum"
              feldId="abweichung-datum"
              type="date"
              value={form.datum}
              min={heute}
              // Später als das Fenster der Liste wäre die Abweichung
              // gespeichert, aber nirgends zu sehen (ORG-05).
              max={bis || undefined}
              onChange={(e) => setzeForm({ datum: e.target.value })}
            />

            {/* Der Baustein trägt die Trefferfläche von 44 px (ORG-17,
                RSP-13) - davon hängt ab, ob ein ganzer Tag gesperrt wird. */}
            <Checkbox
              label="An diesem Tag keine Termine"
              checked={form.abwesend}
              onChange={(e) => setzeForm({ abwesend: e.target.checked })}
            />

            {!form.abwesend ? (
              <BlockFelder
                bloecke={form.bloecke}
                fehler={fehler}
                onChange={(neu) => setzeForm({ bloecke: neu })}
                legende="Abweichende Zeitblöcke"
                blockLabel="Abweichender Block"
                idPraefix="abweichung"
                gesperrt={mutation.isPending}
              />
            ) : null}

            {formularFehler && !(leer && bestehend) ? (
              <Statusmeldung ton="fehler">
                {mutation.error?.message} Die Eingaben stehen noch im Formular.
              </Statusmeldung>
            ) : null}
            {meldung?.ort === 'formular' ? (
              <Rueckmeldung key={meldung.nr}>{meldung.text}</Rueckmeldung>
            ) : null}

            {form.datum !== '' && leer && !bestehend ? (
              <p className="text-ink-muted text-sm">
                Für den {datumText} ist keine Abweichung hinterlegt. Bitte das Häkchen setzen oder
                Zeitblöcke eintragen.
              </p>
            ) : null}

            <div className="flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
              {form.datum !== '' && leer && bestehend ? (
                <Rueckfrage
                  ausloeser="Abweichung speichern"
                  ausloeserVariante="primary"
                  bezeichnung={`Abweichung am ${datumText} entfernen`}
                  bestaetigen="Abweichung entfernen"
                  bestaetigenLaeuft="Wird entfernt …"
                  fehler={formularFehler ? mutation.error?.message : undefined}
                  onBestaetigen={() =>
                    mutation.mutateAsync({
                      datum: form.datum,
                      abwesend: false,
                      bloecke: [],
                      art: 'entfernen',
                      ort: 'formular',
                      quelle: form,
                    })
                  }
                  onAbbrechen={() => mutation.reset()}
                >
                  <p>
                    Ohne Häkchen und ohne Blöcke wird die Abweichung am {datumText} entfernt. Danach
                    gilt für diesen Tag wieder der Wochenplan.
                  </p>
                </Rueckfrage>
              ) : (
                <Button
                  type="button"
                  disabled={mutation.isPending || form.datum === '' || leer}
                  onClick={speichern}
                >
                  {mutation.isPending ? 'Wird gespeichert …' : 'Abweichung speichern'}
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * Rückfrage vor dem Entfernen einer Abweichung aus der Liste (ORG-05), als
 * Fenster: In der Zeile neben Datum und Zeit ist für die Frage kein Platz
 * (Design-Rollout B2). Der Knopf wartet auf den Server; scheitert er, bleibt
 * das Fenster offen und nennt den Fehler (ZST-06).
 */
function EntfernenFenster({
  datum,
  fehler,
  onBestaetigen,
  onSchliessen,
}: {
  datum: string;
  fehler: string | undefined;
  onBestaetigen: () => Promise<unknown>;
  onSchliessen: () => void;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [gescheitert, setGescheitert] = useState(false);

  async function bestaetigen() {
    if (laeuft) return;
    setLaeuft(true);
    setGescheitert(false);
    try {
      await onBestaetigen();
      onSchliessen();
    } catch {
      setGescheitert(true);
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Dialogfenster titel={`Abweichung am ${datum} entfernen`} onSchliessen={onSchliessen}>
      <p className="text-ink mt-2 text-sm">Danach gilt für diesen Tag wieder der Wochenplan.</p>
      {gescheitert ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {fehler ?? 'Das hat nicht geklappt.'} {ERNEUT_SPEICHERN}
        </Statusmeldung>
      ) : null}
      <div className="mt-4 flex flex-col gap-3 *:w-full sm:flex-row sm:*:w-auto">
        <Button
          type="button"
          data-autofocus
          disabled={laeuft}
          onClick={() => {
            void bestaetigen();
          }}
        >
          {laeuft ? 'Wird entfernt …' : 'Abweichung entfernen'}
        </Button>
        <Button type="button" variant="quiet" disabled={laeuft} onClick={onSchliessen}>
          Abbrechen
        </Button>
      </div>
    </Dialogfenster>
  );
}

// -----------------------------------------------------------------------------
// Seite
// -----------------------------------------------------------------------------

/**
 * Die Arbeitszeit je Person (ORG-003): Personenwahl, Wochenplan und
 * Abweichungen - für owner, Teamleitung und Büro bearbeitbar, für die übrigen
 * lesbar. Seit ORG-003 ohne eigene Seite: Sie steht auf „Arbeitszeit"
 * (`WorkingTimePage`) unter Team, zusammen mit dem eigenen Plan und den
 * eigenen Anträgen. Bis dahin gab es zwei Bereiche für Arbeitszeiten - die
 * Planung je Person und die eigene Arbeitszeit -, acht Reiter auseinander.
 *
 * `eigenerPlan` ersetzt den Wochenplan, wenn die eigene Person gewählt ist
 * und nicht gepflegt werden darf (der eigene Plan mit Stunden und
 * Wochensumme); `eigenesDanach` steht unter den Abweichungen, wenn die
 * eigene Person gewählt ist (künftige Fassung, eigene Anträge).
 */
export function ArbeitszeitJePerson({
  user,
  eigenerPlan,
  eigenesDanach,
}: {
  user: CurrentUser;
  eigenerPlan?: ReactNode;
  eigenesDanach?: ReactNode;
}) {
  const darfPflegen = canManageWorkingHours(user.roles);
  const zone = user.organizationTimeZone;
  const heute = zone ? todayInTimeZone(zone) : undefined;

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  /**
   * Die gewählte Person steht in der Adresszeile (UX-012).
   *
   * Damit führt ein Weg aus dem Mitarbeiterdatensatz direkt auf **diese**
   * Arbeitszeiten, statt auf die Seite mit der ersten Person – und der Stand
   * überlebt ein Neuladen wie im Kalender. Ein unbekannter oder verstellter
   * Wert fällt still auf die Vorwahl zurück.
   */
  const [suche, setSuche] = useSearchParams();
  const gewuenscht = suche.get('person');

  const [person, setPerson] = useState('');
  const [planOffen, setPlanOffen] = useState(false);
  const [abweichungOffen, setAbweichungOffen] = useState(false);
  const [personWechsel, setPersonWechsel] = useState<string | null>(null);

  const ungespeichert = planOffen || abweichungOffen;
  const { schutz } = useTextverlustschutz({ ungespeichert, texte: SCHUTZTEXTE });

  // Vorwahl (ORG-30): die Person aus der Adresse, sonst die eigene, wenn sie
  // selbst behandelt, sonst die erste der Liste. Therapeut:innen sahen bis
  // UXR-011 zuerst die Zeiten einer Kollegin und mussten sich selbst suchen.
  useEffect(() => {
    const liste = therapeuten.data;
    if (!liste || liste.length === 0) return;
    const ausAdresse = liste.find((t) => t.staff_member_id === gewuenscht);
    const eigene = liste.find((t) => t.staff_member_id === user.staffMemberId);
    setPerson((bisher) => {
      if (ausAdresse) return ausAdresse.staff_member_id;
      if (bisher !== '') return bisher;
      return (eigene ?? liste[0]!).staff_member_id;
    });
  }, [therapeuten.data, gewuenscht, user.staffMemberId]);

  function wechslePerson(staffMemberId: string) {
    setPersonWechsel(null);
    setPerson(staffMemberId);
    const naechste = new URLSearchParams(suche);
    naechste.set('person', staffMemberId);
    setSuche(naechste, { replace: true });
  }

  function personWaehlen(staffMemberId: string) {
    if (staffMemberId === person) return;
    // Ein Personenwechsel ist kein Seitenwechsel - der Schutz der Formulare
    // sieht ihn nicht. Er fragt deshalb hier (ORG-03).
    if (ungespeichert) {
      setPersonWechsel(staffMemberId);
      return;
    }
    wechslePerson(staffMemberId);
  }

  const name = (staffMemberId: string) =>
    therapeuten.data?.find((t) => t.staff_member_id === staffMemberId)?.display_name ?? '';

  return (
    <>
      {therapeuten.isPending ? <LoadingState label="Personen werden geladen …" /> : null}
      {therapeuten.isError && !therapeuten.data ? (
        <ErrorState
          title="Die behandelnden Personen konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void therapeuten.refetch()}
        />
      ) : null}

      {/* Ohne behandelnde Person stand bis UXR-011 nur die Fußnote da (ORG-30). */}
      {therapeuten.data && therapeuten.data.length === 0 ? (
        <EmptyState
          title="Noch keine behandelnde Person"
          description="Arbeitszeiten gibt es für Personen mit Zugang und der Rolle Therapeut:in oder Teamleitung."
          aktion={
            darfPflegen ? (
              <ButtonLink to="/praxis/team" variant="secondary">
                Zu den Mitarbeitenden
              </ButtonLink>
            ) : undefined
          }
        />
      ) : null}

      {therapeuten.data && therapeuten.data.length > 0 ? (
        <>
          <div className="max-w-formular mb-8 flex flex-col gap-4">
            <Select
              label="Person"
              feldId="planung-person"
              value={person}
              onChange={(e) => personWaehlen(e.target.value)}
            >
              {therapeuten.data.map((t) => (
                <option key={t.staff_member_id} value={t.staff_member_id}>
                  {t.display_name}
                </option>
              ))}
            </Select>
            {personWechsel ? (
              <Wechselrueckfrage
                onVerwerfen={() => {
                  wechslePerson(personWechsel);
                  fokussieren('planung-person');
                }}
                onBleiben={() => {
                  setPersonWechsel(null);
                  fokussieren('planung-person');
                }}
              >
                Die Änderungen an den Arbeitszeiten von {name(person)} sind noch nicht gespeichert
                und gehen beim Wechsel zu {name(personWechsel)} verloren.
              </Wechselrueckfrage>
            ) : null}
            {therapeuten.isError ? (
              <NachladeHinweis
                laeuft={therapeuten.isFetching}
                onErneut={() => void therapeuten.refetch()}
              />
            ) : null}
          </div>

          {/* Die Rückfrage vor dem Weggehen (ANN-046). */}
          {schutz}

          {person ? (
            <>
              {person === user.staffMemberId && !darfPflegen && eigenerPlan ? (
                eigenerPlan
              ) : (
                <Wochenplan
                  key={`plan-${person}`}
                  staffMemberId={person}
                  darfPflegen={darfPflegen}
                  heute={heute ?? ''}
                  onUngespeichert={setPlanOffen}
                />
              )}
              <Abweichungen
                key={`abweichung-${person}`}
                staffMemberId={person}
                darfPflegen={darfPflegen}
                heute={heute}
                onUngespeichert={setAbweichungOffen}
              />
              {person === user.staffMemberId ? eigenesDanach : null}
            </>
          ) : null}
        </>
      ) : null}

      <Kleingedrucktes className="mt-10">
        Alle Zeiten gelten in der Zeitzone der Praxis{zone ? ` (${zone})` : ''}. Arbeitszeiten sind
        organisatorische Angaben zur Planung – keine Arbeitszeiterfassung.
      </Kleingedrucktes>
    </>
  );
}
