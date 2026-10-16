import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialogfenster, Fenstertitel } from '@/components/ui/Dialogfenster';
import { Field } from '@/components/ui/Field';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Medienbild } from '@/components/ui/Medienbild';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Wahlreihe } from '@/components/ui/Wahlreihe';
import {
  EINGABETEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/features/documentation/Textverlustschutz';
import { Kameradialog } from '@/features/files/Kameradialog';
import type { CurrentUser } from '@/features/session/types';
import { FLOTTE_SCHLUESSEL, recordCheckup, type BikeDetail } from './api';
import { BikeModel3D, type BikeFocus } from './bike3d/BikeModel3D';
import {
  CHECK_ITEMS,
  CHECK_ITEM_VIEWS,
  ZONE_KEYS,
  bikeTypeLabels,
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
  BEISPIEL,
  SCHRITTE,
  SEITEN,
  START,
  WERBUNG,
  alleSeiten,
  bewertungen,
  einzigesBauteil,
  fortschritt,
  fotoSeite,
  nachDemFoto,
  nachDerAntwort,
  nachDerWerbung,
  punktSeite,
  vorigeSeite,
  wasSeite,
  werbeflaechenText,
  zusammenfassung,
  type Antwort,
  type Antworten,
  type Seite,
  type Seitenfotos,
  type Teil,
  type Werbeflaechen,
} from './checkupablauf';
import { fotoText, uebertrageFotos, type Fotoauftrag } from './fotoauftraege';
import { Fotovormerkung } from './Fotovormerkung';
import { useObjektadressen } from './objektadressen';
import { Einstufung, Nadel, Nadelform } from './Nadel';
import { Entwurfsfeld, SchonOffen } from './Stellenerfassung';
import { nummerDerStelle, radBild, useStellenerfassung, type Stelle } from './stellen';

/**
 * Der geführte Check-Up am 3D-Rad (FLT-005, ANN-563): ein Fenster, eine Seite
 * je Prüfpunkt, kein Scrollen.
 *
 * Oben das Rad - es fliegt zu den Bauteilen des Punkts und hebt sie hervor -,
 * darunter die Frage. „In Ordnung“ führt gleich zum nächsten Punkt;
 * „Beobachten“ und „Problem“ fragen „Wo genau?“ (am Rad antippen oder ein
 * Bauteil wählen; bei einem Punkt mit nur einem Bauteil entfällt die Frage)
 * und „Was ist aufgefallen?“, dann „Weiter“. Ein Tipp aufs Rad gleich auf der
 * Frage ist die Abkürzung für „Problem an dieser Stelle“.
 *
 * Nach dem Praxis-Review: Eine Antwort gilt erst mit „Weiter“; „← Zurück“ und
 * die Zurückgeste des Telefons führen dorthin, woher man kam. Nach jedem
 * Seitenwechsel nimmt die Fragefläche kurz keinen Tipp an, und die nächste
 * Seite sagt, was gerade notiert wurde. „In Ordnung“ über einer Stelle mit
 * Notiz oder Foto fragt, bevor es sie verwirft.
 *
 * Gespeichert wird wie im früheren Formular (ANN-553, ANN-555): zwölf
 * Bewertungen, Notizen, Stellen und Fotos, erst mit dem Haken. Neu ist nur,
 * dass kein Punkt mehr auf „In Ordnung“ vorbelegt ist - jeder wird bestätigt.
 * Wer einen Punkt neu bewertet, ersetzt dessen neue Stelle.
 *
 * Nach den zwölf Punkten (FLT-007, ANN-568): jede Werbefläche abwischen -
 * oder sagen, warum es nicht ging - und je ein Foto von links, vorne, rechts
 * und hinten. Die Überschrift steht unter dem Rad, direkt über den Antworten
 * (Jannes 2026-10-16); oben bleiben Rad und „Check-Up abbrechen“.
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
  // Die Antwort auf den Punkt, solange „Wo genau?“ und „Was ist aufgefallen?“
  // laufen. Sie gilt erst mit „Weiter“; wer zurückgeht, nimmt sie nicht mit.
  const [vorlaeufig, setVorlaeufig] = useState<{ rating: Severity; note: string } | null>(null);
  const [zurUebersicht, setZurUebersicht] = useState(false);
  const [fokus, setFokus] = useState<BikeFocus>(() => fokusFuer(START, 1));
  // Ein Tipp auf ein Bauteil, das zu einem anderen Punkt gehört.
  const [fremd, setFremd] = useState<string | null>(null);
  // Was zuletzt beantwortet wurde - sichtbar auf der Seite danach.
  const [quittung, setQuittung] = useState<{ fuer: string; inhalt: ReactNode } | null>(null);
  const [gesperrt, setGesperrt] = useState(false);
  const sperre = useRef<number | undefined>(undefined);
  const [notiz, setNotiz] = useState('');
  const [weitereFotos, setWeitereFotos] = useState<Blob[]>([]);
  const [werbeflaechen, setWerbeflaechen] = useState<Werbeflaechen | null>(null);
  const [seitenfotos, setSeitenfotos] = useState<Seitenfotos>({});
  const [bestaetigt, setBestaetigt] = useState(false);
  const [ausstehend, setAusstehend] = useState<{
    auftraege: Fotoauftrag[];
    grund: string | null;
  } | null>(null);

  useEffect(() => () => window.clearTimeout(sperre.current), []);

  const bewertet = bewertungen(antworten, stellen);
  const zurueckZiel = ausstehend ? null : vorigeSeite(seite, zurUebersicht);

  const ungespeichert =
    ausstehend === null &&
    (Object.keys(antworten).length > 0 ||
      vorlaeufig !== null ||
      stellen.length > 0 ||
      entwurf !== null ||
      notiz.trim() !== '' ||
      weitereFotos.length > 0 ||
      werbeflaechen !== null ||
      Object.keys(seitenfotos).length > 0 ||
      bestaetigt);
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert,
    kompakt: true,
    nichtSicherbar:
      ausstehend && ausstehend.auftraege.length > 0
        ? `${fotoText(ausstehend.auftraege.length)} sind noch nicht übertragen und gehen beim Weitergehen verloren.`
        : undefined,
    texte: CHECKUPTEXTE,
    // Das Fenster hängt an `?rad=`: Fällt der Parameter weg - mit der
    // Zurückgeste -, gingen sonst alle Antworten mit.
    auchSuchparameter: true,
    schrittZurueck: zurueckZiel ? () => zurueckGehen() : undefined,
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
        werbeflaechen: werbeflaechen ?? { wert: 'wiped' },
      });
      const auftraege: Fotoauftrag[] = [
        ...stellen.flatMap((stelle: Stelle, index) =>
          stelle.fotos.map((foto) => ({
            spotId: ergebnis.spotIds[index] ?? null,
            checkupId: null,
            foto,
          })),
        ),
        ...SEITEN.flatMap((seite) => {
          const foto = seitenfotos[seite.key];
          return foto
            ? [{ spotId: null, checkupId: ergebnis.checkupId, side: seite.key, foto }]
            : [];
        }),
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

  /** Die Fragefläche nimmt für die Dauer des Kameraflugs keinen Tipp an. */
  function sperren() {
    setGesperrt(true);
    window.clearTimeout(sperre.current);
    sperre.current = window.setTimeout(() => setGesperrt(false), TIPPSPERRE_MS);
  }

  function gehe(neu: Seite) {
    setFremd(null);
    const andererOrt =
      neu.art !== seite.art ||
      (neu.art === 'punkt' && seite.art === 'punkt' && neu.index !== seite.index) ||
      (neu.art === 'foto' && seite.art === 'foto' && neu.index !== seite.index);
    if (andererOrt) setFokus((vorher) => fokusFuer(neu, vorher.token + 1));
    if (neu.art === 'abschluss') setZurUebersicht(false);
    setSeite(neu);
    sperren();
  }

  function zurueckGehen() {
    const ziel = vorigeSeite(seite, zurUebersicht);
    if (!ziel) return;
    // Aus „Was ist aufgefallen?“ zurück nach „Wo genau?“ bleibt die Stelle -
    // ein anderes Bauteil versetzt sie samt Notiz. Sonst gilt nicht, was noch
    // nicht mit „Weiter“ bestätigt war.
    const zuWo = seite.art === 'punkt' && seite.teil === 'was' && seite.vonWo;
    if (!zuWo) {
      erfassung.verwerfen();
      setVorlaeufig(null);
    }
    gehe(ziel);
  }

  function eigeneStellen(key: CheckItemKey) {
    return stellen.filter((stelle) => zoneCheckItem(stelle.zone) === key);
  }

  function nummerVon(key: string) {
    return nummerDerStelle(
      stellen.findIndex((stelle) => stelle.key === key),
      offeneAnzahl,
    );
  }

  function setzeAntwort(key: CheckItemKey, antwort: Antwort) {
    setAntworten((vorher) => ({ ...vorher, [key]: antwort }));
  }

  /** Die Antwort steht, die nächste Seite sagt es. */
  function weiter(index: number, rating: CheckRating) {
    const ziel = nachDerAntwort(index, zurUebersicht);
    setQuittung({
      fuer: seitenSchluessel(ziel),
      inhalt: (
        <>
          {CHECK_ITEMS[index]!.label}: <Bewertungswort rating={rating} />
        </>
      ),
    });
    gehe(ziel);
  }

  function werbungFertig(wert: Werbeflaechen) {
    setWerbeflaechen(wert);
    const ziel = nachDerWerbung(zurUebersicht);
    setQuittung({
      fuer: seitenSchluessel(ziel),
      inhalt: `Werbeflächen: ${werbeflaechenText(wert)}`,
    });
    gehe(ziel);
  }

  /** Ein Foto steht, die nächste Seite sagt es; „← Zurück“ zeigt es wieder. */
  function fotoAufgenommen(index: number, foto: Blob) {
    const seiteDesRads = SEITEN[index]!;
    setSeitenfotos((vorher) => ({ ...vorher, [seiteDesRads.key]: foto }));
    const ziel = nachDemFoto(index, zurUebersicht);
    setQuittung({ fuer: seitenSchluessel(ziel), inhalt: `${seiteDesRads.titel}: aufgenommen` });
    gehe(ziel);
  }

  function fotoWeiter(index: number) {
    setQuittung(null);
    gehe(nachDemFoto(index, zurUebersicht));
  }

  function inOrdnung(index: number) {
    const item = CHECK_ITEMS[index]!;
    erfassung.entferneStellen(eigeneStellen(item.key).map((stelle) => stelle.key));
    erfassung.verwerfen();
    setVorlaeufig(null);
    setzeAntwort(item.key, { rating: 'ok', note: '' });
    weiter(index, 'ok');
  }

  function abweichung(index: number, rating: Severity) {
    const item = CHECK_ITEMS[index]!;
    const vorher = antworten[item.key];
    setVorlaeufig({ rating, note: vorher && vorher.rating !== 'ok' ? vorher.note : '' });
    const erste = eigeneStellen(item.key)[0];
    if (erste) {
      // Schon markiert: gleich zur Stelle, mit der neuen Einstufung.
      erfassung.bearbeite(erste.key);
      erfassung.aendere({ severity: rating });
      gehe(wasSeite(index, false));
      return;
    }
    erfassung.verwerfen();
    const bauteil = einzigesBauteil(item.key);
    if (bauteil) {
      // Nur ein Bauteil: kein „Wo genau?“, die Stelle sitzt gleich daran.
      erfassung.tippen({ zone: bauteil, point: null });
      erfassung.aendere({ severity: rating });
      zumBauteil(bauteil);
      gehe(wasSeite(index, false));
      return;
    }
    gehe(punktSeite(index, 'wo'));
  }

  function amRad(treffer: BikePick | null) {
    if (
      !treffer ||
      !isZoneKey(treffer.zone) ||
      seite.art === 'abschluss' ||
      seite.art === 'werbung' ||
      seite.art === 'foto'
    ) {
      return;
    }
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
    if (seite.teil === 'bewerten') {
      // Die Abkürzung: Antippen heißt „Problem an dieser Stelle“.
      const vorher = antworten[item.key];
      const rating: Severity = vorher && vorher.rating !== 'ok' ? vorher.rating : 'problem';
      setVorlaeufig({ rating, note: vorher && vorher.rating !== 'ok' ? vorher.note : '' });
      const erste = eigeneStellen(item.key)[0];
      if (!erste) erfassung.verwerfen();
      else if (!treffer.markerId) erfassung.bearbeite(erste.key);
      erfassung.tippen(treffer);
      erfassung.aendere({ severity: rating });
      zumBauteil(treffer.zone);
      gehe(wasSeite(seite.index, false));
      return;
    }
    // „Wo genau?“ und „Was ist aufgefallen?“: setzt oder versetzt die Stelle;
    // eine Notiz ohne Stelle wandert mit an sie.
    erfassung.tippen(treffer);
    erfassung.aendere({
      severity: vorlaeufig?.rating ?? 'problem',
      ...(entwurf ? {} : { note: vorlaeufig?.note ?? '' }),
    });
    if (seite.teil === 'wo') {
      zumBauteil(treffer.zone);
      gehe(wasSeite(seite.index, true));
    }
  }

  function waehleBauteil(index: number, zone: ZoneKey) {
    erfassung.tippen({ zone, point: null });
    erfassung.aendere({
      severity: vorlaeufig?.rating ?? 'problem',
      ...(entwurf ? {} : { note: vorlaeufig?.note ?? '' }),
    });
    zumBauteil(zone);
    gehe(wasSeite(index, true));
  }

  /** Die Kamera an die gewählte Stelle - „Was ist aufgefallen?“ zeigt das Bild kleiner. */
  function zumBauteil(zone: string) {
    setFokus((vorher) => ({ zones: [zone], token: vorher.token + 1 }));
  }

  function ohneStelle(index: number) {
    if (entwurf) {
      // Was an der Stelle schon stand, bleibt: die Notiz am Punkt, die Fotos
      // beim ganzen Rad.
      const { note, fotos } = entwurf;
      setVorlaeufig((vorher) => vorher && { ...vorher, note: note || vorher.note });
      if (fotos.length > 0) setWeitereFotos((vorher) => [...vorher, ...fotos]);
    }
    erfassung.verwerfen();
    gehe(wasSeite(index, true));
  }

  function weiterNachWas(index: number) {
    const item = CHECK_ITEMS[index]!;
    const rating = entwurf ? entwurf.severity : (vorlaeufig?.rating ?? 'problem');
    setzeAntwort(item.key, { rating, note: entwurf ? entwurf.note : (vorlaeufig?.note ?? '') });
    if (entwurf) erfassung.uebernehmen();
    setVorlaeufig(null);
    weiter(index, rating);
  }

  /** Aus dem Abschluss einen Schritt ändern - danach geht es dorthin zurück. */
  function aendern(ziel: Seite) {
    setZurUebersicht(true);
    erfassung.verwerfen();
    setVorlaeufig(null);
    setQuittung(null);
    setFremd(null);
    setFokus((vorher) => fokusFuer(ziel, vorher.token + 1));
    setSeite(ziel);
    sperren();
  }

  /**
   * Was „In Ordnung“ verwürfe, als Frage für die Rückfrage - oder `null`, wenn
   * nichts verloren geht als eine Nadel (Praxis-Review FLT-005).
   */
  function verlust(key: CheckItemKey): string | null {
    const teile = eigeneStellen(key)
      .filter((stelle) => stelle.note.trim() !== '' || stelle.fotos.length > 0)
      .map((stelle) => `Stelle ${nummerVon(stelle.key)}${beschreibe(stelle)}`);
    if (
      entwurf &&
      !entwurf.key &&
      zoneCheckItem(entwurf.zone) === key &&
      (entwurf.note.trim() !== '' || entwurf.fotos.length > 0)
    ) {
      teile.push(`Die neue Stelle${beschreibe(entwurf)}`);
    }
    const antwort = antworten[key];
    const notizAmPunkt = (
      vorlaeufig?.note ?? (antwort && antwort.rating !== 'ok' ? antwort.note : '')
    ).trim();
    if (teile.length === 0 && notizAmPunkt) teile.push(`Die Notiz „${notizAmPunkt}“`);
    return teile.length > 0 ? `${teile.join(' und ')} verwerfen?` : null;
  }

  // ---------------------------------------------------------------------------
  // Was die Seite zeigt
  // ---------------------------------------------------------------------------

  const punkt = seite.art === 'punkt' ? CHECK_ITEMS[seite.index]! : null;
  const { markers, draft, aktivNummer, offene } = radBild(erfassung, offen, bike.bike_type);
  const offeneAnzahl = offene.length;
  const zonenDesPunkts = punkt ? zonesOfCheckItem(punkt.key) : [];
  const highlight =
    seite.art === 'punkt'
      ? seite.teil === 'was' && entwurf?.zone
        ? [entwurf.zone]
        : zonenDesPunkts
      : seite.art === 'werbung'
        ? ['transportbox']
        : entwurf?.zone
          ? [entwurf.zone]
          : [];
  const hinweis = fremd
    ? `${zoneLabel(fremd)}: anderer Prüfpunkt`
    : seite.art === 'punkt'
      ? seite.teil === 'bewerten'
        ? 'Problem? Stelle antippen'
        : seite.teil === 'wo'
          ? 'Betroffene Stelle antippen'
          : entwurf
            ? 'Andere Stelle? Antippen'
            : 'Doch eine Stelle? Antippen'
      : seite.art === 'weitere'
        ? entwurf
          ? 'Andere Stelle? Antippen'
          : 'Bauteil am Rad antippen'
        : seite.art === 'foto'
          ? `So ungefähr: ${SEITEN[seite.index]!.label}`
          : 'Ziehen dreht das Rad';
  const titel = ausstehend
    ? 'Check-Up gespeichert'
    : seite.art === 'punkt'
      ? punkt!.label
      : seite.art === 'weitere'
        ? 'Weitere Stelle'
        : seite.art === 'werbung'
          ? 'Werbeflächen abwischen'
          : seite.art === 'foto'
            ? SEITEN[seite.index]!.titel
            : 'Alles geprüft?';
  const stand = fortschritt(seite);
  const ansage =
    seite.art === 'abschluss'
      ? `Abschluss: ${zusammenfassung(bewertet, stellen)}`
      : seite.art === 'punkt'
        ? `${stand.text}: ${titel}${seite.teil === 'wo' ? ', wo genau?' : seite.teil === 'was' ? ', was ist aufgefallen?' : ''}`
        : seite.art === 'foto'
          ? `${stand.text}: ${titel}`
          : titel;
  const quittungHier =
    quittung && quittung.fuer === seitenSchluessel(seite) ? quittung.inhalt : null;

  // Bühne und Fragefläche teilen sich die Höhe des Fensters. Auf den Fragen
  // bekommt das Rad den Rest; im Abschluss rollt die Zusammenfassung, Haken
  // und Speichern stehen fest darunter, und am Telefon entfällt das Rad
  // (Praxis- und Design-Review FLT-005). Eine lange Stelle bekommt einen
  // Rollbereich.
  const abschlussZeigen = seite.art === 'abschluss' && !ausstehend;
  const buehne = abschlussZeigen
    ? 'hidden lg:flex lg:min-h-0 lg:flex-1'
    : 'flex min-h-36 flex-1 lg:min-h-0';
  const flaeche = abschlussZeigen
    ? 'flex min-h-0 flex-1 flex-col lg:flex-none'
    : `overflow-y-auto px-4 pt-2 pb-4 lg:pt-4 ${
        seite.art === 'weitere' && entwurf ? 'max-h-[60%] shrink-0 lg:max-h-none' : 'shrink-0'
      }`;

  return (
    <Dialogfenster
      vollbild
      titel={titel}
      beschreibung={`${bike.name} · ${bikeTypeLabels[bike.bike_type].kurz}`}
      onSchliessen={() => void navigate(zurueck)}
      schliessenBeschriftung="Check-Up abbrechen"
      titelImInhalt
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
          <p className="text-ink-muted ml-auto text-sm">{stand.text}</p>
        </div>
        <ProgressBar wert={stand.wert} von={SCHRITTE} />
      </div>
      {/* Die Rückfrage vor dem Weggehen, gleich unter dem Kopf: dort, wo
          „Check-Up abbrechen“ liegt, und auf jeder Seite ohne Rollen. */}
      <div className="shrink-0">{schutz}</div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className={`flex-col px-4 pt-3 pb-2 lg:p-4 ${buehne}`}>
          <BikeModel3D
            hoehe="100%"
            ansichten={seite.art === 'abschluss' || seite.art === 'weitere'}
            ersatz="Alle Schritte gehen auch über die Knöpfe."
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
          className={`lg:border-line lg:w-96 lg:shrink-0 lg:border-l ${flaeche} ${
            gesperrt ? 'pointer-events-none' : ''
          }`.trim()}
        >
          {/* Die Überschrift unter dem Rad, direkt über den Antworten - wo der
              Daumen ist und der Blick als Nächstes hinwill (Jannes 2026-10-16). */}
          {abschlussZeigen ? (
            <div className="shrink-0 px-4 pt-3 lg:pt-4">
              <Fenstertitel />
            </div>
          ) : (
            <div className="mb-3">
              <Fenstertitel />
            </div>
          )}
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
              bewertung={antworten[punkt!.key] ? bewertet[punkt!.key] : undefined}
              notizOhneStelle={
                eigeneStellen(punkt!.key).length === 0 ? (antworten[punkt!.key]?.note ?? '') : ''
              }
              neueStellen={eigeneStellen(punkt!.key).map((stelle) => ({
                stelle,
                nummer: nummerVon(stelle.key),
              }))}
              quittung={quittungHier}
              verlust={verlust(punkt!.key)}
              erfassung={erfassung}
              aktivNummer={aktivNummer}
              offen={offene.filter((spot) => zoneCheckItem(spot.zone) === punkt!.key)}
              vorlaeufig={vorlaeufig}
              onInOrdnung={() => inOrdnung(seite.index)}
              onAbweichung={(rating) => abweichung(seite.index, rating)}
              onBauteil={(zone) => waehleBauteil(seite.index, zone)}
              onOhneStelle={() => ohneStelle(seite.index)}
              onVorlaeufig={(teil) =>
                setVorlaeufig((vorher) => ({ rating: 'problem', note: '', ...vorher, ...teil }))
              }
              onWeiter={() => weiterNachWas(seite.index)}
            />
          ) : seite.art === 'werbung' ? (
            <Werbungsseite
              key="werbung"
              quittung={quittungHier}
              bisher={werbeflaechen}
              onFertig={werbungFertig}
            />
          ) : seite.art === 'foto' ? (
            <Fotoseite
              key={`foto-${seite.index}`}
              index={seite.index}
              quittung={quittungHier}
              foto={seitenfotos[SEITEN[seite.index]!.key] ?? null}
              onAufnahme={(foto) => fotoAufgenommen(seite.index, foto)}
              onWeiter={() => fotoWeiter(seite.index)}
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
                rahmen={false}
                hauptknopf
              />
            ) : (
              <div className="flex flex-col gap-3">
                {/* Die Nadeln am Rad: Form und Farbe mit Wort (Regel 5). */}
                <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Nadelform einstufung="problem" />
                    <span className="text-ink">Problem</span>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Nadelform einstufung="beobachten" />
                    <span className="text-ink">Beobachten</span>
                  </span>
                </p>
                <Button className="w-full" onClick={erfassung.ohneModell} data-autofocus>
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
              offene={offene}
              nummerVon={nummerVon}
              notiz={notiz}
              onNotiz={setNotiz}
              weitereFotos={weitereFotos}
              onWeitereFotos={setWeitereFotos}
              werbeflaechen={werbeflaechen}
              seitenfotos={seitenfotos}
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

/**
 * Nach jedem Seitenwechsel nimmt die Fragefläche so lange keinen Tipp an, wie
 * die Kamera fliegt (Praxis-Review FLT-005): Ein prellender Handschuh oder ein
 * ungeduldiger zweiter Tipp träfe sonst den Knopf an derselben Stelle der
 * nächsten Seite, und ein Punkt stünde ungesehen auf „In Ordnung“.
 */
const TIPPSPERRE_MS = 700;

/** Die Rückfrage vor dem Weggehen spricht vom Check-Up, nicht von „Text“. */
const CHECKUPTEXTE: Verlustschutztexte = {
  ...EINGABETEXTE,
  bezeichnung: 'Ungespeicherter Check-Up',
  zeile: {
    weitergehen: 'Check-Up noch nicht gespeichert.',
    abmelden: 'Check-Up noch nicht gespeichert – abmelden?',
    bleiben: 'Weiter prüfen',
  },
};

/** Wohin die Kamera auf einer Seite schaut: zum Punkt oder schräg aufs ganze Rad. */
function fokusFuer(seite: Seite, token: number): BikeFocus {
  if (seite.art === 'punkt') {
    const item = CHECK_ITEMS[seite.index]!;
    const ansicht = CHECK_ITEM_VIEWS[item.key];
    return { zones: zonesOfCheckItem(item.key), ...(ansicht ? { view: ansicht } : {}), token };
  }
  if (seite.art === 'werbung') return { zones: ['transportbox'], token };
  // Das ganze Rad von der Seite, die fotografiert wird.
  if (seite.art === 'foto') return { zones: ZONE_KEYS, view: SEITEN[seite.index]!.blick, token };
  return { zones: [], preset: 'schraeg', token };
}

/** Schlüssel einer Seite des Ablaufs - wohin eine Quittung gehört. */
function seitenSchluessel(seite: Seite): string {
  return seite.art === 'punkt' || seite.art === 'foto' ? `${seite.art}-${seite.index}` : seite.art;
}

/** „ „Belag schleift“ mit einem Foto“ - was eine Stelle mitbringt. */
function beschreibe(stelle: { note: string; fotos: readonly Blob[] }): string {
  const note = stelle.note.trim();
  const fotos = stelle.fotos.length;
  return `${note ? ` „${note}“` : ''}${fotos > 0 ? ` mit ${fotos === 1 ? 'einem Foto' : `${fotos} Fotos`}` : ''}`;
}

function fotoZahl(anzahl: number): string {
  return anzahl === 1 ? '1 Foto' : `${anzahl} Fotos`;
}

/** Die Bewertung als Zeichen und Wort (DESIGN.md Regel 5), auch „In Ordnung“. */
function Bewertungswort({ rating }: { rating: CheckRating }) {
  return rating === 'ok' ? (
    <span className="text-positiv font-medium">
      <span aria-hidden="true">✓ </span>
      {checkRatingLabels.ok}
    </span>
  ) : (
    <Einstufung einstufung={rating} />
  );
}

const STELLE_BEWERTEN = [
  { wert: 'beobachten', text: 'Beobachten' },
  { wert: 'problem', text: 'Problem' },
] as const;

/**
 * „In Ordnung“ - verwirft es Notiz oder Fotos, erst nach einer Rückfrage am
 * Klickort (`Rueckfrage`, DESIGN.md 9.16).
 */
function InOrdnungKnopf({
  beschriftung,
  haupt,
  gewaehlt,
  verlust,
  onInOrdnung,
}: {
  beschriftung: string;
  /** Der Hauptknopf der Frageseite, in voller Breite; sonst leise. */
  haupt: boolean;
  gewaehlt: boolean;
  verlust: string | null;
  onInOrdnung: () => void;
}) {
  if (verlust) {
    return (
      <Rueckfrage
        ausloeser={beschriftung}
        ausloeserVariante={haupt ? 'primary' : 'quiet'}
        ausloeserGroesse={haupt ? 'normal' : 'kompakt'}
        ausloeserBreit={haupt}
        ausloeserAutofokus={haupt}
        bezeichnung="Verwerfen?"
        bestaetigen="Verwerfen"
        abbrechen="Behalten"
        onBestaetigen={onInOrdnung}
      >
        {verlust}
      </Rueckfrage>
    );
  }
  return (
    <Button
      variant={haupt ? 'primary' : 'quiet'}
      groesse={haupt ? 'normal' : 'kompakt'}
      aria-pressed={haupt ? gewaehlt : undefined}
      className={haupt ? 'w-full' : undefined}
      onClick={onInOrdnung}
      {...(haupt ? { 'data-autofocus': true } : {})}
    >
      {gewaehlt ? <span aria-hidden="true">✓ </span> : null}
      {beschriftung}
    </Button>
  );
}

function Punktseite({
  index,
  teil,
  bewertung,
  notizOhneStelle,
  neueStellen,
  quittung,
  verlust,
  erfassung,
  aktivNummer,
  offen,
  vorlaeufig,
  onInOrdnung,
  onAbweichung,
  onBauteil,
  onOhneStelle,
  onVorlaeufig,
  onWeiter,
}: {
  index: number;
  teil: Teil;
  /** Die Bewertung des Punkts mit seinen Stellen; ohne Antwort `undefined`. */
  bewertung: CheckRating | undefined;
  notizOhneStelle: string;
  neueStellen: readonly { stelle: Stelle; nummer: number }[];
  quittung: ReactNode;
  verlust: string | null;
  erfassung: ReturnType<typeof useStellenerfassung>;
  aktivNummer: number;
  offen: BikeDetail['spots'];
  vorlaeufig: { rating: Severity; note: string } | null;
  onInOrdnung: () => void;
  onAbweichung: (rating: Severity) => void;
  onBauteil: (zone: ZoneKey) => void;
  onOhneStelle: () => void;
  onVorlaeufig: (teil: Partial<{ rating: Severity; note: string }>) => void;
  onWeiter: () => void;
}) {
  const item = CHECK_ITEMS[index]!;
  const zonen = zonesOfCheckItem(item.key);
  const { entwurf } = erfassung;

  if (teil === 'bewerten') {
    const abweichend = (rating: Severity) => {
      const an = bewertung === rating;
      return (
        <Button
          variant="secondary"
          aria-pressed={an}
          className="w-full"
          onClick={() => onAbweichung(rating)}
        >
          {an ? <span aria-hidden="true">✓ </span> : null}
          {checkRatingLabels[rating]}
        </Button>
      );
    };
    return (
      <div className="flex flex-col gap-3">
        {/* Was gerade notiert wurde: Wer zu schnell weitergetippt hat, sieht
            es hier, nicht erst im Abschluss. */}
        {quittung ? <Statusmeldung>{quittung}</Statusmeldung> : null}
        <p className="text-ink-muted text-sm">{zonen.map((zone) => zoneLabel(zone)).join(' · ')}</p>
        {/* Schon offen aus früheren Meldungen - sie bleiben offen, bis die
            Teamleitung freigibt (ANN-555) - und was dieser Check-Up am Punkt
            schon notiert hat: je eine Zeile mit Nadel und Wort (Regel 5). */}
        {offen.map((spot) => (
          <p key={spot.id} className="flex items-center gap-2 text-sm">
            <Nadel nummer={spot.number ?? 0} einstufung={spot.severity} />
            <span className="text-ink-muted min-w-0">
              <Einstufung einstufung={spot.severity} /> · Schon offen:{' '}
              {spot.note || zoneLabel(spot.zone)}
            </span>
          </p>
        ))}
        {neueStellen.map(({ stelle, nummer }) => (
          <p key={stelle.key} className="flex items-center gap-2 text-sm">
            <Nadel nummer={nummer} einstufung={stelle.severity} />
            <span className="text-ink-muted min-w-0">
              <Einstufung einstufung={stelle.severity} /> · Neu:{' '}
              {stelle.note.trim() || zoneLabel(stelle.zone)}
              {stelle.fotos.length > 0 ? ` · ${fotoZahl(stelle.fotos.length)}` : ''}
            </span>
          </p>
        ))}
        {notizOhneStelle.trim() ? (
          <p className="text-ink-muted text-sm">Notiz: {notizOhneStelle.trim()}</p>
        ) : null}
        <InOrdnungKnopf
          beschriftung="In Ordnung"
          haupt
          gewaehlt={bewertung === 'ok'}
          verlust={verlust}
          onInOrdnung={onInOrdnung}
        />
        <div className="grid grid-cols-2 gap-2">
          {abweichend('beobachten')}
          {abweichend('problem')}
        </div>
      </div>
    );
  }

  if (teil === 'wo') {
    return (
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="text-ink text-liste mb-1 font-semibold">Wo genau?</legend>
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
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" groesse="kompakt" onClick={onOhneStelle}>
            Ohne genaue Stelle
          </Button>
          {/* Der Weg zurück nach einem Fehltipp auf „Problem“, im Daumenbereich. */}
          <InOrdnungKnopf
            beschriftung="Doch in Ordnung"
            haupt={false}
            gewaehlt={false}
            verlust={verlust}
            onInOrdnung={onInOrdnung}
          />
        </div>
      </fieldset>
    );
  }

  // „Was ist aufgefallen?“ - mit Stelle an ihr, sonst am Prüfpunkt.
  const severity: Severity = entwurf ? entwurf.severity : (vorlaeufig?.rating ?? 'problem');
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
          onVorlaeufig({ rating: wert });
        }}
      />
      <Field
        label="Was ist aufgefallen?"
        placeholder={BEISPIEL[item.key]}
        hint="Keine Angaben zu Patient:innen."
        maxLength={entwurf ? 500 : 300}
        value={entwurf ? entwurf.note : (vorlaeufig?.note ?? '')}
        onChange={(event) =>
          entwurf
            ? erfassung.aendere({ note: event.target.value })
            : onVorlaeufig({ note: event.target.value })
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

/**
 * Werbeflächen abwischen (FLT-007, ANN-568): „Abgewischt“ führt weiter;
 * „Nicht möglich“ fragt nach dem Grund - der Arbeitgeber sieht ihn in den
 * Meldungen, statt dass der Check-Up an einem fehlenden Tuch hängt.
 */
function Werbungsseite({
  quittung,
  bisher,
  onFertig,
}: {
  quittung: ReactNode;
  bisher: Werbeflaechen | null;
  onFertig: (wert: Werbeflaechen) => void;
}) {
  const [nichtMoeglich, setNichtMoeglich] = useState(bisher?.wert === 'not_possible');
  const [grund, setGrund] = useState(bisher?.wert === 'not_possible' ? bisher.grund : '');
  const [fehlt, setFehlt] = useState(false);

  if (nichtMoeglich) {
    return (
      <div className="flex flex-col gap-4">
        <Field
          label="Warum nicht?"
          placeholder="z. B. kein Tuch im Depot"
          hint="Keine Angaben zu Patient:innen."
          maxLength={200}
          value={grund}
          error={fehlt ? 'Bitte kurz den Grund nennen.' : undefined}
          onChange={(event) => {
            setGrund(event.target.value);
            setFehlt(false);
          }}
          data-autofocus
        />
        <Button
          className="w-full"
          onClick={() => {
            if (!grund.trim()) setFehlt(true);
            else onFertig({ wert: 'not_possible', grund: grund.trim() });
          }}
        >
          Weiter
        </Button>
        <Button variant="quiet" groesse="kompakt" onClick={() => setNichtMoeglich(false)}>
          Doch abgewischt
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {quittung ? <Statusmeldung>{quittung}</Statusmeldung> : null}
      <p className="text-ink">
        Jede Werbefläche mit einem Desinfektions- oder Reinigungstuch abwischen.
      </p>
      <Button
        className="w-full"
        aria-pressed={bisher?.wert === 'wiped'}
        onClick={() => onFertig({ wert: 'wiped' })}
        data-autofocus
      >
        {bisher?.wert === 'wiped' ? <span aria-hidden="true">✓ </span> : null}
        Abgewischt
      </Button>
      <Button variant="secondary" className="w-full" onClick={() => setNichtMoeglich(true)}>
        Nicht möglich
      </Button>
    </div>
  );
}

/**
 * Ein Foto von einer Seite des Rads (FLT-007, ANN-568): Pflicht, eines je
 * Seite. Nach dem Auslösen geht es gleich zur nächsten Seite; „← Zurück“
 * zeigt das Foto wieder, mit „Neu aufnehmen“. Über den Kameradialog der
 * Anwendung, nur im Arbeitsspeicher bis zum Speichern (ANN-552).
 */
function Fotoseite({
  index,
  quittung,
  foto,
  onAufnahme,
  onWeiter,
}: {
  index: number;
  quittung: ReactNode;
  foto: Blob | null;
  onAufnahme: (foto: Blob) => void;
  onWeiter: () => void;
}) {
  const seite = SEITEN[index]!;
  const [kamera, setKamera] = useState(false);
  // Eine feste Liste je Foto - sonst entstünde bei jedem Zeichnen eine neue Adresse.
  const liste = useMemo(() => (foto ? [foto] : []), [foto]);
  const [adresse] = useObjektadressen(liste);

  return (
    <div className="flex flex-col gap-3">
      {quittung ? <Statusmeldung>{quittung}</Statusmeldung> : null}
      {foto ? (
        <>
          <Medienbild
            vorschau
            einpassen="fuellen"
            src={adresse ?? null}
            alt={`${seite.titel}, aufgenommen`}
          />
          <Button className="w-full" onClick={onWeiter} data-autofocus>
            Weiter
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => setKamera(true)}>
            Neu aufnehmen
          </Button>
        </>
      ) : (
        <>
          <p className="text-ink">Das ganze Rad im Bild, keine Personen.</p>
          <Button className="w-full" onClick={() => setKamera(true)} data-autofocus>
            Foto aufnehmen
          </Button>
        </>
      )}
      {kamera ? (
        <Kameradialog
          titel={seite.titel}
          hinweis="Nur das Rad fotografieren – keine Personen, keine Hausnummern, keine Unterlagen."
          onAufnahme={(aufnahme) => {
            setKamera(false);
            onAufnahme(aufnahme);
          }}
          onSchliessen={() => setKamera(false)}
        />
      ) : null}
    </div>
  );
}

function Abschluss({
  user,
  bewertet,
  antworten,
  stellen,
  offene,
  nummerVon,
  notiz,
  onNotiz,
  weitereFotos,
  onWeitereFotos,
  werbeflaechen,
  seitenfotos,
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
  offene: BikeDetail['spots'];
  nummerVon: (key: string) => number;
  notiz: string;
  onNotiz: (text: string) => void;
  weitereFotos: Blob[];
  onWeitereFotos: (fotos: Blob[]) => void;
  werbeflaechen: Werbeflaechen | null;
  seitenfotos: Seitenfotos;
  bestaetigt: boolean;
  onBestaetigt: (an: boolean) => void;
  onAendern: (seite: Seite) => void;
  onStelleAendern: (key: string) => void;
  onWeitereStelle: () => void;
  fehler: string | null;
  speichert: boolean;
  onSpeichern: () => void;
}) {
  const abweichend = CHECK_ITEMS.map((item, index) => ({ item, index })).filter(
    ({ item }) => bewertet[item.key] !== 'ok',
  );
  const inOrdnung = CHECK_ITEMS.map((item, index) => ({ item, index })).filter(
    ({ item }) => bewertet[item.key] === 'ok',
  );
  // Je Punkt steht seine erste Stelle in seiner Zeile; jede weitere - auch eine
  // zweite am selben Punkt - bekommt eine eigene (Design-Review FLT-005, B8).
  const ersteJePunkt = new Set(
    CHECK_ITEMS.map((item) => stellen.find((stelle) => zoneCheckItem(stelle.zone) === item.key))
      .filter((stelle): stelle is Stelle => stelle !== undefined)
      .map((stelle) => stelle.key),
  );
  const weitere = stellen.filter((stelle) => !ersteJePunkt.has(stelle.key));

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4 lg:pt-4">
        <div className="flex flex-col gap-3">
          {/* Der Fokus beginnt bei der Zusammenfassung, nicht beim Haken. */}
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
                          {stelle && stelle.fotos.length > 0
                            ? ` · ${fotoZahl(stelle.fotos.length)}`
                            : ''}
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
                        onClick={() => onAendern(punktSeite(index))}
                      >
                        Ändern
                      </Button>
                    }
                  />
                );
              })}
              {weitere.map((stelle) => {
                const pruefpunkt = zoneCheckItem(stelle.zone);
                return (
                  <ListRow
                    key={stelle.key}
                    zeit={<Nadel nummer={nummerVon(stelle.key)} einstufung={stelle.severity} />}
                    titel={zoneLabel(stelle.zone)}
                    meta={
                      <>
                        <span className="block">
                          <Einstufung einstufung={stelle.severity} />
                          {pruefpunkt
                            ? ` · ${CHECK_ITEMS.find((item) => item.key === pruefpunkt)!.label}`
                            : ' · weitere Stelle'}
                          {stelle.fotos.length > 0 ? ` · ${fotoZahl(stelle.fotos.length)}` : ''}
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
                );
              })}
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
                        onClick={() => onAendern(punktSeite(index))}
                      >
                        Ändern
                      </Button>
                    }
                  />
                ))}
              </ListRows>
            </Disclosure>
          ) : null}

          {/* Werbeflächen und die vier Seitenfotos (ANN-568), je mit „Ändern“. */}
          <ListRows rahmen={false} beschriftung="Reinigung und Fotos">
            <ListRow
              titel="Werbeflächen"
              meta={werbeflaechen ? werbeflaechenText(werbeflaechen) : 'Fehlt noch'}
              aktion={
                <Button
                  variant="secondary"
                  groesse="kompakt"
                  aria-label="Werbeflächen ändern"
                  onClick={() => onAendern(WERBUNG)}
                >
                  Ändern
                </Button>
              }
            />
            {SEITEN.map((seite, index) => (
              <SeitenfotoZeile
                key={seite.key}
                titel={seite.titel}
                foto={seitenfotos[seite.key] ?? null}
                onAendern={() => onAendern(fotoSeite(index))}
              />
            ))}
          </ListRows>

          {/* Ohne 3D-Rad die einzige Stelle, an der sie stehen. */}
          <SchonOffen offene={offene} />

          {/* Selten gebraucht, deshalb zusammen eingeklappt (DESIGN.md
              Grundsatz 4). */}
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
        </div>
      </div>

      {/* Fest unter der Zusammenfassung: Haken und Speichern bleiben am
          Telefon ohne Rollen im Bild, wie viel auch auffiel. */}
      <div className="border-line shrink-0 border-t px-4 pt-2 pb-4">
        <Checkbox
          label={`Ich, ${user.profile.display_name}, habe das ganze Rad gründlich auf Sicherheit geprüft.`}
          checked={bestaetigt}
          onChange={(event) => onBestaetigt(event.target.checked)}
        />
        {fehler ? (
          <Statusmeldung ton="fehler" className="mt-2">
            {fehler}
          </Statusmeldung>
        ) : null}
        {/* Der Grund für den gesperrten Knopf für Vorlesesoftware; sichtbar
            steht der Haken gleich darüber. */}
        {!bestaetigt ? (
          <span id="checkup-fehlt" className="sr-only">
            Die Bestätigung fehlt noch.
          </span>
        ) : null}
        <Formularfuss dicht>
          <Button
            onClick={onSpeichern}
            disabled={!bestaetigt || speichert || !werbeflaechen || !alleSeiten(seitenfotos)}
            aria-describedby={!bestaetigt ? 'checkup-fehlt' : undefined}
          >
            {speichert ? 'Wird gespeichert …' : 'Check-Up speichern'}
          </Button>
        </Formularfuss>
      </div>
    </>
  );
}

/** Ein Seitenfoto im Abschluss: klein, mit „Ändern“. */
function SeitenfotoZeile({
  titel,
  foto,
  onAendern,
}: {
  titel: string;
  foto: Blob | null;
  onAendern: () => void;
}) {
  // Eine feste Liste je Foto - sonst entstünde bei jedem Zeichnen eine neue Adresse.
  const liste = useMemo(() => (foto ? [foto] : []), [foto]);
  const [adresse] = useObjektadressen(liste);
  return (
    <ListRow
      zeit={
        foto ? (
          <Medienbild vorschau einpassen="fuellen" src={adresse ?? null} alt={titel} />
        ) : undefined
      }
      titel={titel}
      meta={foto ? 'Aufgenommen' : 'Fehlt noch'}
      aktion={
        <Button
          variant="secondary"
          groesse="kompakt"
          aria-label={`${titel} ändern`}
          onClick={onAendern}
        >
          Ändern
        </Button>
      }
    />
  );
}
