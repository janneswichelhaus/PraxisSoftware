import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import type { CurrentUser } from '@/features/session/types';
import { FLOTTE_SCHLUESSEL, recordCheckup, type BikeDetail } from './api';
import { BikeModel3D, type BikeFocus } from './bike3d/BikeModel3D';
import {
  CHECK_ITEMS,
  CHECK_ITEM_VIEWS,
  checkRatingLabels,
  isZoneKey,
  zoneCheckItem,
  zoneLabel,
  zonesOfCheckItem,
  type BikePick,
  type CheckItemKey,
  type CheckRating,
  type Severity,
  type ZoneKey,
} from './bike3d/zones';
import {
  ABSCHLUSS,
  PRUEFPUNKTE,
  START,
  bewertungen,
  fortschritt,
  nachDerAntwort,
  punktSeite,
  vorigeSeite,
  zusammenfassung,
  type Antwort,
  type Antworten,
  type Seite,
} from './checkupablauf';
import { fotoText, uebertrageFotos, type Fotoauftrag } from './fotoauftraege';
import { Fotovormerkung } from './Fotovormerkung';
import { Einstufung, Nadel } from './Nadel';
import { Entwurfsfeld } from './Stellenerfassung';
import { nummerDerStelle, radBild, useStellenerfassung, type Stelle } from './stellen';

/**
 * Der geführte Check-Up am 3D-Rad (FLT-005, ANN-562): ein Fenster, eine Seite
 * je Prüfpunkt, kein Scrollen.
 *
 * Oben das Rad - es fliegt zu den Bauteilen des Punkts und hebt sie hervor -,
 * darunter die Frage. „In Ordnung“ führt gleich zum nächsten Punkt;
 * „Beobachten“ und „Problem“ fragen „Wo genau?“ (am Rad antippen oder ein
 * Bauteil wählen) und „Was ist aufgefallen?“, dann „Weiter“. Ein Tipp aufs Rad
 * gleich auf der Frage ist die Abkürzung für „Problem an dieser Stelle“.
 *
 * Gespeichert wird wie im früheren Formular (ANN-553, ANN-555): zwölf
 * Bewertungen, Notizen, Stellen und Fotos, erst mit dem Haken. Neu ist nur,
 * dass kein Punkt mehr auf „In Ordnung“ vorbelegt ist - jeder wird bestätigt.
 * Wer einen Punkt neu bewertet, ersetzt dessen neue Stelle.
 */
export function CheckupFenster({
  detail,
  user,
  zurueck,
}: {
  detail: BikeDetail;
  user: CurrentUser;
  zurueck: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { bike } = detail;
  const offen = detail.spots.filter((spot) => spot.resolved_at === null);

  const erfassung = useStellenerfassung({ art: 'checkup' });
  const { stellen, entwurf } = erfassung;
  const [seite, setSeite] = useState<Seite>(START);
  const [antworten, setAntworten] = useState<Antworten>({});
  const [zurUebersicht, setZurUebersicht] = useState(false);
  const [fokus, setFokus] = useState<BikeFocus>(() => fokusFuer(START, 1));
  // Ein Tipp auf ein Bauteil, das zu einem anderen Punkt gehört.
  const [fremd, setFremd] = useState<string | null>(null);
  const [notiz, setNotiz] = useState('');
  const [weitereFotos, setWeitereFotos] = useState<Blob[]>([]);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [ausstehend, setAusstehend] = useState<{
    auftraege: Fotoauftrag[];
    grund: string | null;
  } | null>(null);

  const bewertet = bewertungen(antworten, stellen);

  const ungespeichert =
    ausstehend === null &&
    (Object.keys(antworten).length > 0 ||
      stellen.length > 0 ||
      entwurf !== null ||
      notiz.trim() !== '' ||
      weitereFotos.length > 0 ||
      bestaetigt);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    kompakt: true,
    nichtSicherbar:
      ausstehend && ausstehend.auftraege.length > 0
        ? `${fotoText(ausstehend.auftraege.length)} sind noch nicht übertragen und gehen beim Weitergehen verloren.`
        : undefined,
    texte: { ...EINGABETEXTE, bezeichnung: 'Ungespeicherter Check-Up' },
  });

  function zumRad(meldung: string) {
    freigeben();
    void navigate(`/betrieb/flotte/rad/${bike.id}?bereich=stellen`, {
      replace: true,
      state: { meldung },
    });
  }

  const speichern = useMutation({
    mutationFn: async () => {
      const ergebnis = await recordCheckup({
        bikeId: bike.id,
        items: CHECK_ITEMS.map((item) => ({
          key: item.key,
          rating: bewertet[item.key],
          note: bewertet[item.key] === 'ok' ? '' : (antworten[item.key]?.note.trim() ?? ''),
        })),
        note: notiz.trim(),
        spots: stellen.map((stelle) => ({
          zone: stelle.zone,
          severity: stelle.severity,
          point: stelle.point,
          note: stelle.note,
        })),
      });
      const auftraege: Fotoauftrag[] = [
        ...stellen.flatMap((stelle: Stelle, index) =>
          stelle.fotos.map((foto) => ({
            spotId: ergebnis.spotIds[index] ?? null,
            checkupId: null,
            foto,
          })),
        ),
        ...weitereFotos.map((foto) => ({ spotId: null, checkupId: ergebnis.checkupId, foto })),
      ].filter((auftrag) => auftrag.spotId !== null || auftrag.checkupId !== null);
      const uebertragung = await uebertrageFotos(auftraege);
      return { anzahl: auftraege.length, ...uebertragung };
    },
    onSuccess: async ({ anzahl, fehlgeschlagen, grund }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (fehlgeschlagen.length === 0) {
        zumRad(
          anzahl > 0 ? `Check-Up gespeichert, mit ${fotoText(anzahl)}.` : 'Check-Up gespeichert.',
        );
      } else {
        setAusstehend({ auftraege: fehlgeschlagen, grund });
      }
    },
  });

  const erneut = useMutation({
    mutationFn: () => uebertrageFotos(ausstehend?.auftraege ?? []),
    onSuccess: async ({ fehlgeschlagen, grund }) => {
      await queryClient.invalidateQueries({ queryKey: FLOTTE_SCHLUESSEL });
      if (fehlgeschlagen.length === 0) zumRad('Check-Up gespeichert, Fotos übertragen.');
      else setAusstehend({ auftraege: fehlgeschlagen, grund });
    },
  });

  // ---------------------------------------------------------------------------
  // Seitenwechsel
  // ---------------------------------------------------------------------------

  function gehe(neu: Seite) {
    setFremd(null);
    const andererOrt =
      neu.art !== seite.art ||
      (neu.art === 'punkt' && seite.art === 'punkt' && neu.index !== seite.index);
    if (andererOrt) setFokus((vorher) => fokusFuer(neu, vorher.token + 1));
    if (neu.art === 'abschluss') setZurUebersicht(false);
    setSeite(neu);
  }

  function zurueckGehen() {
    const ziel = vorigeSeite(seite, zurUebersicht);
    if (!ziel) return;
    // Wer „Wo genau?“ verlässt, nimmt die offene Stelle nicht mit; aus
    // „Was ist aufgefallen?“ zurück bleibt sie, um sie zu versetzen.
    if (seite.art !== 'punkt' || seite.teil === 'wo') erfassung.verwerfen();
    gehe(ziel);
  }

  function eigeneStellen(key: CheckItemKey) {
    return stellen.filter((stelle) => zoneCheckItem(stelle.zone) === key);
  }

  function setzeAntwort(key: CheckItemKey, teil: Partial<Antwort>) {
    setAntworten((vorher) => ({
      ...vorher,
      [key]: { rating: 'ok', note: '', ...vorher[key], ...teil },
    }));
  }

  function bewerte(index: number, rating: CheckRating) {
    const item = CHECK_ITEMS[index]!;
    const eigene = eigeneStellen(item.key);
    if (rating === 'ok') {
      erfassung.entferneStellen(eigene.map((stelle) => stelle.key));
      erfassung.verwerfen();
      setzeAntwort(item.key, { rating: 'ok', note: '' });
      gehe(nachDerAntwort(index, zurUebersicht));
      return;
    }
    setzeAntwort(item.key, { rating });
    const erste = eigene[0];
    if (erste) {
      // Schon markiert: gleich zur Stelle, mit der neuen Einstufung.
      erfassung.bearbeite(erste.key);
      erfassung.aendere({ severity: rating });
      gehe(punktSeite(index, 'was'));
    } else {
      erfassung.verwerfen();
      gehe(punktSeite(index, 'wo'));
    }
  }

  function amRad(treffer: BikePick | null) {
    if (!treffer || !isZoneKey(treffer.zone) || seite.art === 'abschluss') return;
    if (seite.art === 'weitere') {
      erfassung.tippen(treffer);
      return;
    }
    const item = CHECK_ITEMS[seite.index]!;
    if (zoneCheckItem(treffer.zone) !== item.key) {
      setFremd(treffer.zone);
      return;
    }
    setFremd(null);
    // Eine Nadel aus einer früheren Meldung bleibt, wie sie ist.
    if (treffer.markerId && !stellen.some((stelle) => stelle.key === treffer.markerId)) return;
    const vorher = antworten[item.key];
    const rating: Severity = vorher && vorher.rating !== 'ok' ? vorher.rating : 'problem';
    if (seite.teil === 'bewerten') {
      // Die Abkürzung: Antippen heißt „Problem an dieser Stelle“.
      setzeAntwort(item.key, { rating });
      const erste = eigeneStellen(item.key)[0];
      if (erste && !treffer.markerId) erfassung.bearbeite(erste.key);
      erfassung.tippen(treffer);
      erfassung.aendere({ severity: rating });
      zumBauteil(treffer.zone);
      gehe(punktSeite(seite.index, 'was'));
      return;
    }
    // „Wo genau?“ und „Was ist aufgefallen?“: setzt oder versetzt die Nadel.
    erfassung.tippen(treffer);
    erfassung.aendere({ severity: rating });
    if (seite.teil === 'wo') {
      zumBauteil(treffer.zone);
      gehe(punktSeite(seite.index, 'was'));
    }
  }

  function waehleBauteil(index: number, zone: ZoneKey) {
    const item = CHECK_ITEMS[index]!;
    const rating = antworten[item.key]?.rating;
    erfassung.tippen({ zone, point: null });
    erfassung.aendere({ severity: rating && rating !== 'ok' ? rating : 'problem' });
    zumBauteil(zone);
    gehe(punktSeite(index, 'was'));
  }

  /** Die Kamera an die gewählte Stelle - „Was ist aufgefallen?“ zeigt das Bild kleiner. */
  function zumBauteil(zone: string) {
    setFokus((vorher) => ({ zones: [zone], token: vorher.token + 1 }));
  }

  function ohneStelle(index: number) {
    const item = CHECK_ITEMS[index]!;
    erfassung.entferneStellen(eigeneStellen(item.key).map((stelle) => stelle.key));
    erfassung.verwerfen();
    gehe(punktSeite(index, 'was'));
  }

  function weiterNachWas(index: number) {
    const item = CHECK_ITEMS[index]!;
    if (entwurf) {
      setzeAntwort(item.key, { rating: entwurf.severity, note: entwurf.note });
      erfassung.uebernehmen();
    }
    gehe(nachDerAntwort(index, zurUebersicht));
  }

  function aendern(index: number) {
    setZurUebersicht(true);
    erfassung.verwerfen();
    setFremd(null);
    setFokus((vorher) => fokusFuer(punktSeite(index), vorher.token + 1));
    setSeite(punktSeite(index));
  }

  // ---------------------------------------------------------------------------
  // Was die Seite zeigt
  // ---------------------------------------------------------------------------

  const punkt = seite.art === 'punkt' ? CHECK_ITEMS[seite.index]! : null;
  const { markers, draft, aktivNummer } = radBild(erfassung, offen, bike.bike_type);
  const zonenDesPunkts = punkt ? zonesOfCheckItem(punkt.key) : [];
  const highlight =
    seite.art === 'punkt'
      ? seite.teil === 'was' && entwurf?.zone
        ? [entwurf.zone]
        : zonenDesPunkts
      : entwurf?.zone
        ? [entwurf.zone]
        : [];
  const hinweis = fremd
    ? `${zoneLabel(fremd)}: anderer Prüfpunkt`
    : seite.art === 'punkt'
      ? seite.teil === 'bewerten'
        ? 'Antippen markiert eine Stelle'
        : seite.teil === 'wo'
          ? 'Betroffene Stelle antippen'
          : 'Antippen versetzt die Nadel'
      : seite.art === 'weitere'
        ? entwurf
          ? 'Antippen versetzt die Nadel'
          : 'Bauteil am Rad antippen'
        : 'Ziehen dreht das Rad';
  const titel =
    seite.art === 'punkt'
      ? punkt!.label
      : seite.art === 'weitere'
        ? 'Weitere Stelle'
        : ausstehend
          ? 'Check-Up gespeichert'
          : 'Alles geprüft?';
  const stand = fortschritt(seite);
  const zurueckZiel = ausstehend ? null : vorigeSeite(seite, zurUebersicht);
  const ansage =
    seite.art === 'abschluss'
      ? `Abschluss: ${zusammenfassung(bewertet, stellen)}`
      : seite.art === 'punkt'
        ? `${stand.text}: ${titel}${seite.teil === 'wo' ? ', wo genau?' : seite.teil === 'was' ? ', was ist aufgefallen?' : ''}`
        : titel;

  // Bühne und Fragefläche teilen sich die Höhe des Fensters: Auf den Fragen
  // bekommt das Rad den Rest, im Abschluss die Zusammenfassung mit Haken und
  // Speichern (am Telefon das Rad klein darüber), eine lange Stelle einen
  // Rollbereich.
  const abschlussZeigen = seite.art === 'abschluss' && !ausstehend;
  const buehne = abschlussZeigen ? 'h-28 shrink-0 lg:h-auto' : 'min-h-36 flex-1';
  const flaeche = abschlussZeigen
    ? 'min-h-0 flex-1 lg:flex-none'
    : seite.art === 'weitere' && entwurf
      ? 'max-h-[60%] shrink-0 lg:max-h-none'
      : 'shrink-0';

  return (
    <Dialogfenster
      vollbild
      titel={titel}
      onSchliessen={() => void navigate(zurueck)}
      schliessenBeschriftung="Check-Up abbrechen"
    >
      <p className="sr-only" aria-live="polite">
        {ansage}
      </p>
      <div className="shrink-0 px-4 pt-2">
        <div className="flex min-h-11 items-center gap-3">
          {zurueckZiel ? (
            <Button variant="quiet" groesse="kompakt" onClick={zurueckGehen}>
              ← Zurück
            </Button>
          ) : null}
          <p className="text-ink-muted ml-auto text-sm">
            {stand.text} · {bike.name}
          </p>
        </div>
        <ProgressBar wert={stand.wert} von={PRUEFPUNKTE} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={`flex flex-col px-4 pt-3 pb-2 lg:min-h-0 lg:flex-1 lg:p-4 ${buehne}`}>
          <BikeModel3D
            hoehe="100%"
            ansichten={false}
            markers={markers}
            draft={draft}
            activeMarkerId={entwurf?.key ?? null}
            highlight={highlight}
            focus={fokus}
            hinweis={hinweis}
            onPick={amRad}
          />
        </div>

        <div
          className={`lg:border-line overflow-y-auto px-4 pt-2 pb-4 lg:w-96 lg:shrink-0 lg:border-l lg:pt-4 ${flaeche}`}
        >
          {schutz}
          {ausstehend ? (
            <div className="flex flex-col gap-4">
              <Rueckmeldung>Check-Up gespeichert.</Rueckmeldung>
              <Statusmeldung ton="fehler">
                {`${fotoText(ausstehend.auftraege.length)} konnte${ausstehend.auftraege.length === 1 ? '' : 'n'} nicht übertragen werden.`}
                {ausstehend.grund ? ` ${ausstehend.grund}` : ''}
              </Statusmeldung>
              <Formularfuss>
                <Button onClick={() => erneut.mutate()} disabled={erneut.isPending}>
                  {erneut.isPending ? 'Wird übertragen …' : 'Erneut versuchen'}
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => zumRad('Check-Up gespeichert, ohne die übrigen Fotos.')}
                >
                  Ohne diese Fotos weiter
                </Button>
              </Formularfuss>
            </div>
          ) : seite.art === 'punkt' ? (
            <Punktseite
              index={seite.index}
              teil={seite.teil}
              antwort={antworten[punkt!.key]}
              erfassung={erfassung}
              aktivNummer={aktivNummer}
              offen={offen.filter((spot) => zoneCheckItem(spot.zone) === punkt!.key)}
              onBewerten={(rating) => bewerte(seite.index, rating)}
              onBauteil={(zone) => waehleBauteil(seite.index, zone)}
              onOhneStelle={() => ohneStelle(seite.index)}
              onAntwort={(teil) => setzeAntwort(punkt!.key, teil)}
              onWeiter={() => weiterNachWas(seite.index)}
            />
          ) : seite.art === 'weitere' ? (
            entwurf ? (
              <Entwurfsfeld
                zustand={{
                  ...erfassung,
                  uebernehmen: () => {
                    erfassung.uebernehmen();
                    gehe(ABSCHLUSS);
                  },
                  verwerfen: () => {
                    erfassung.verwerfen();
                    gehe(ABSCHLUSS);
                  },
                  entfernen: () => {
                    erfassung.entfernen();
                    gehe(ABSCHLUSS);
                  },
                }}
                entwurf={entwurf}
                nummer={aktivNummer}
              />
            ) : (
              <div className="flex flex-col items-start gap-3">
                <Button variant="secondary" onClick={erfassung.ohneModell} data-autofocus>
                  Bauteil aus Liste wählen
                </Button>
              </div>
            )
          ) : (
            <Abschluss
              user={user}
              bewertet={bewertet}
              antworten={antworten}
              stellen={stellen}
              offeneAnzahl={offen.filter((spot) => spot.number !== null).length}
              notiz={notiz}
              onNotiz={setNotiz}
              weitereFotos={weitereFotos}
              onWeitereFotos={setWeitereFotos}
              bestaetigt={bestaetigt}
              onBestaetigt={setBestaetigt}
              onAendern={aendern}
              onStelleAendern={(key) => {
                erfassung.bearbeite(key);
                gehe({ art: 'weitere' });
              }}
              onWeitereStelle={() => gehe({ art: 'weitere' })}
              fehler={speichern.isError ? speichern.error.message : null}
              speichert={speichern.isPending}
              onSpeichern={() => speichern.mutate()}
            />
          )}
        </div>
      </div>
    </Dialogfenster>
  );
}

/** Wohin die Kamera auf einer Seite schaut: zum Punkt oder schräg aufs ganze Rad. */
function fokusFuer(seite: Seite, token: number): BikeFocus {
  if (seite.art === 'punkt') {
    const item = CHECK_ITEMS[seite.index]!;
    const ansicht = CHECK_ITEM_VIEWS[item.key];
    return { zones: zonesOfCheckItem(item.key), ...(ansicht ? { view: ansicht } : {}), token };
  }
  return { zones: [], preset: 'schraeg', token };
}

const STELLE_BEWERTEN = [
  { wert: 'beobachten', text: 'Beobachten' },
  { wert: 'problem', text: 'Problem' },
] as const;

function Punktseite({
  index,
  teil,
  antwort,
  erfassung,
  aktivNummer,
  offen,
  onBewerten,
  onBauteil,
  onOhneStelle,
  onAntwort,
  onWeiter,
}: {
  index: number;
  teil: 'bewerten' | 'wo' | 'was';
  antwort: Antwort | undefined;
  erfassung: ReturnType<typeof useStellenerfassung>;
  aktivNummer: number;
  offen: BikeDetail['spots'];
  onBewerten: (rating: CheckRating) => void;
  onBauteil: (zone: ZoneKey) => void;
  onOhneStelle: () => void;
  onAntwort: (teil: Partial<Antwort>) => void;
  onWeiter: () => void;
}) {
  const item = CHECK_ITEMS[index]!;
  const zonen = zonesOfCheckItem(item.key);
  const { entwurf } = erfassung;

  if (teil === 'bewerten') {
    const knopf = (rating: CheckRating, variant: 'primary' | 'secondary') => {
      const an = antwort?.rating === rating;
      return (
        <Button
          variant={variant}
          aria-pressed={an}
          className="w-full"
          onClick={() => onBewerten(rating)}
          {...(rating === 'ok' ? { 'data-autofocus': true } : {})}
        >
          {an ? <span aria-hidden="true">✓ </span> : null}
          {checkRatingLabels[rating]}
        </Button>
      );
    };
    return (
      <div className="flex flex-col gap-3">
        <p className="text-ink-muted text-sm">{zonen.map((zone) => zoneLabel(zone)).join(' · ')}</p>
        {/* Schon offen aus früheren Meldungen: eine Zeile je Stelle mit ihrer
            Nadel - sie bleibt offen, bis die Teamleitung freigibt (ANN-555). */}
        {offen.map((spot) => (
          <p key={spot.id} className="flex items-center gap-2 text-sm">
            <Nadel nummer={spot.number ?? 0} einstufung={spot.severity} />
            <span className="text-ink-muted">Schon offen: {spot.note || zoneLabel(spot.zone)}</span>
          </p>
        ))}
        {knopf('ok', 'primary')}
        <div className="grid grid-cols-2 gap-2">
          {knopf('beobachten', 'secondary')}
          {knopf('problem', 'secondary')}
        </div>
      </div>
    );
  }

  if (teil === 'wo') {
    return (
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-ink text-liste mb-1 font-semibold">
          Wo genau? Am Rad antippen oder wählen:
        </legend>
        <div className="flex flex-wrap gap-2">
          {zonen.map((zone, nummer) => (
            <Button
              key={zone}
              variant="secondary"
              groesse="kompakt"
              onClick={() => onBauteil(zone)}
              {...(nummer === 0 ? { 'data-autofocus': true } : {})}
            >
              {zoneLabel(zone)}
            </Button>
          ))}
        </div>
        <div>
          <Button variant="quiet" groesse="kompakt" onClick={onOhneStelle}>
            Ohne genaue Stelle weiter
          </Button>
        </div>
      </fieldset>
    );
  }

  // „Was ist aufgefallen?“ - mit Stelle an ihr, sonst am Prüfpunkt.
  const severity: Severity = entwurf
    ? entwurf.severity
    : antwort && antwort.rating !== 'ok'
      ? antwort.rating
      : 'problem';
  return (
    <div className="flex flex-col gap-4">
      {entwurf && isZoneKey(entwurf.zone) ? (
        <div className="flex items-center gap-3">
          <Nadel nummer={aktivNummer} einstufung={entwurf.severity} neu={!entwurf.key} />
          <p className="text-ink text-liste font-semibold">{zoneLabel(entwurf.zone)}</p>
        </div>
      ) : (
        <p className="text-ink-muted text-sm">Ohne genaue Stelle am Rad</p>
      )}
      <Wahlreihe
        legende="Einstufung"
        legendeSichtbar={false}
        wahlen={STELLE_BEWERTEN}
        gewaehlt={severity}
        onWaehlen={(wert) => {
          if (entwurf) erfassung.aendere({ severity: wert });
          onAntwort({ rating: wert });
        }}
      />
      <Field
        label="Was ist aufgefallen?"
        placeholder="z. B. Deckel klemmt"
        hint="Keine Angaben zu Patient:innen."
        maxLength={entwurf ? 500 : 300}
        value={entwurf ? entwurf.note : (antwort?.note ?? '')}
        onChange={(event) =>
          entwurf
            ? erfassung.aendere({ note: event.target.value })
            : onAntwort({ note: event.target.value })
        }
        data-autofocus
      />
      {entwurf ? (
        <Fotovormerkung
          fotos={entwurf.fotos}
          onFotos={(fotos) => erfassung.aendere({ fotos })}
          titel={`Foto zu Stelle ${aktivNummer}`}
          bezug={`zu Stelle ${aktivNummer}`}
        />
      ) : null}
      <Button className="w-full" onClick={onWeiter}>
        Weiter
      </Button>
    </div>
  );
}

function Abschluss({
  user,
  bewertet,
  antworten,
  stellen,
  offeneAnzahl,
  notiz,
  onNotiz,
  weitereFotos,
  onWeitereFotos,
  bestaetigt,
  onBestaetigt,
  onAendern,
  onStelleAendern,
  onWeitereStelle,
  fehler,
  speichert,
  onSpeichern,
}: {
  user: CurrentUser;
  bewertet: Record<CheckItemKey, CheckRating>;
  antworten: Antworten;
  stellen: readonly Stelle[];
  offeneAnzahl: number;
  notiz: string;
  onNotiz: (text: string) => void;
  weitereFotos: Blob[];
  onWeitereFotos: (fotos: Blob[]) => void;
  bestaetigt: boolean;
  onBestaetigt: (an: boolean) => void;
  onAendern: (index: number) => void;
  onStelleAendern: (key: string) => void;
  onWeitereStelle: () => void;
  fehler: string | null;
  speichert: boolean;
  onSpeichern: () => void;
}) {
  const nummerVon = (key: string) =>
    nummerDerStelle(
      stellen.findIndex((stelle) => stelle.key === key),
      offeneAnzahl,
    );
  const abweichend = CHECK_ITEMS.map((item, index) => ({ item, index })).filter(
    ({ item }) => bewertet[item.key] !== 'ok',
  );
  const inOrdnung = CHECK_ITEMS.map((item, index) => ({ item, index })).filter(
    ({ item }) => bewertet[item.key] === 'ok',
  );
  const weitere = stellen.filter((stelle) => zoneCheckItem(stelle.zone) === null);

  return (
    <div className="flex flex-col gap-3">
      {/* Der Fokus beginnt bei der Zusammenfassung, nicht beim Haken: sonst
          rollte die Fläche ans Ende und versteckte, was auffiel. */}
      <div tabIndex={-1} data-autofocus className="focus:outline-none">
        <Statusmeldung>{zusammenfassung(bewertet, stellen)}</Statusmeldung>
      </div>

      {abweichend.length > 0 || weitere.length > 0 ? (
        <ListRows rahmen={false} beschriftung="Auffällig">
          {abweichend.map(({ item, index }) => {
            const stelle = stellen.find((eintrag) => zoneCheckItem(eintrag.zone) === item.key);
            const rating = bewertet[item.key] as Severity;
            return (
              <ListRow
                key={item.key}
                zeit={
                  stelle ? (
                    <Nadel nummer={nummerVon(stelle.key)} einstufung={stelle.severity} />
                  ) : undefined
                }
                titel={item.label}
                meta={
                  <>
                    <span className="block">
                      <Einstufung einstufung={rating} />
                    </span>
                    <span className="block">
                      {antworten[item.key]?.note.trim() || stelle?.note.trim() || 'Ohne Notiz'}
                    </span>
                  </>
                }
                aktion={
                  <Button
                    variant="secondary"
                    groesse="kompakt"
                    aria-label={`${item.label} ändern`}
                    onClick={() => onAendern(index)}
                  >
                    Ändern
                  </Button>
                }
              />
            );
          })}
          {weitere.map((stelle) => (
            <ListRow
              key={stelle.key}
              zeit={<Nadel nummer={nummerVon(stelle.key)} einstufung={stelle.severity} />}
              titel={zoneLabel(stelle.zone)}
              meta={
                <>
                  <span className="block">
                    <Einstufung einstufung={stelle.severity} /> · weitere Stelle
                  </span>
                  <span className="block">{stelle.note.trim() || 'Ohne Notiz'}</span>
                </>
              }
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label={`Stelle ${nummerVon(stelle.key)} ändern: ${zoneLabel(stelle.zone)}`}
                  onClick={() => onStelleAendern(stelle.key)}
                >
                  Ändern
                </Button>
              }
            />
          ))}
        </ListRows>
      ) : null}

      {inOrdnung.length > 0 ? (
        <Disclosure summary="In Ordnung" anzahl={inOrdnung.length}>
          <ListRows rahmen={false} beschriftung="In Ordnung">
            {inOrdnung.map(({ item, index }) => (
              <ListRow
                key={item.key}
                titel={item.label}
                aktion={
                  <Button
                    variant="secondary"
                    groesse="kompakt"
                    aria-label={`${item.label} ändern`}
                    onClick={() => onAendern(index)}
                  >
                    Ändern
                  </Button>
                }
              />
            ))}
          </ListRows>
        </Disclosure>
      ) : null}

      {/* Selten gebraucht, deshalb zusammen eingeklappt (DESIGN.md
          Grundsatz 4): So bleiben Haken und Speichern am Telefon ohne
          Scrollen im Bild. */}
      <Disclosure summary="Notiz, Fotos, weitere Stelle">
        <div className="flex flex-col gap-4">
          <div>
            <Button variant="secondary" groesse="kompakt" onClick={onWeitereStelle}>
              Weitere Stelle markieren
            </Button>
          </div>
          <TextArea
            rows={3}
            label="Notiz zum ganzen Rad"
            placeholder="Weitere Auffälligkeiten"
            hint="Keine Angaben zu Patient:innen."
            maxLength={1000}
            value={notiz}
            onChange={(event) => onNotiz(event.target.value)}
          />
          <Fotovormerkung
            fotos={weitereFotos}
            onFotos={onWeitereFotos}
            titel="Foto vom ganzen Rad"
            bezug="vom ganzen Rad"
          />
        </div>
      </Disclosure>

      <Checkbox
        label={`Ich, ${user.profile.display_name}, habe das ganze Rad gründlich auf Sicherheit geprüft.`}
        checked={bestaetigt}
        onChange={(event) => onBestaetigt(event.target.checked)}
      />

      {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}

      {/* Der Grund für den gesperrten Knopf für Vorlesesoftware; sichtbar
          steht der Haken gleich darüber. */}
      {!bestaetigt ? (
        <span id="checkup-fehlt" className="sr-only">
          Die Bestätigung fehlt noch.
        </span>
      ) : null}
      <Formularfuss>
        <Button
          onClick={onSpeichern}
          disabled={!bestaetigt || speichert}
          aria-describedby={!bestaetigt ? 'checkup-fehlt' : undefined}
        >
          {speichert ? 'Wird gespeichert …' : 'Check-Up speichern'}
        </Button>
      </Formularfuss>
    </div>
  );
}
