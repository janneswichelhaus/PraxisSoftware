import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { usePortalZiel } from '@/components/ui/portalZiel';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { Textlink } from '@/components/ui/Textlink';
import { useSperrsicherung } from '@/features/auth/sitzungssperre/sperrsicherung';
import { aufnahmedauer, useAufnahme } from '@/features/documentation/aufnahme';
import { Kameradialog } from '@/features/files/Kameradialog';
import { DATEI_ACCEPT } from '@/features/files/dokumentarten';
import { useKamera } from '@/features/files/kamera';
import { EntwurfsAnhaenge } from './Anhaenge';
import { anhaengeBinden, anhaengen, aufnahmeName, useEntwurfsanhaenge } from './entwurfsanhaenge';
import {
  ANHAENGE_MAX,
  GEPLANT_KEY,
  TEAMCHAT_KEY,
  fetchMitglieder,
  kanalTitel,
  mitgliederKey,
  type Kanal,
  type Sendeauftrag,
} from './api';
import { ausgangEntfernen, einreihen, useAusgang } from './ausgang';
import { entwurfSetzen, useEntwurf } from './entwuerfe';
import {
  NACHRICHT_MAX,
  alleErwaehnt,
  alleMoeglich,
  angefangeneErwaehnung,
  erwaehnte,
  passendePersonen,
  vervollstaendigeErwaehnungen,
} from './erwaehnung';
import { ENTWUERFE } from './pfade';
import {
  AUFNAHMEFEHLER,
  SPRACHNACHRICHT_HOECHSTDAUER_S,
  sprachnachrichtMoeglich,
} from './sprachnachricht';
import { Bueroklammer, Mikrofon, Uhr } from './Zeichen';
import { Zeitwahl } from './Zeitwahl';
import { geplantFuer, planvorschlaege } from './zeit';

/** Eine neue Kennung für eine Nachricht - vergeben vom Gerät (ANN-641). */
function neueKennung(): string {
  return crypto.randomUUID();
}

/** Am Rechner sendet Enter (wie Slack), am Telefon macht es eine neue Zeile. */
function enterSendet(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;
}

/** Planen geht eine Minute bis 30 Tage im Voraus (ANN-643) - wie am Server. */
const PLANEN_AB_MS = 60_000;
const PLANEN_BIS_MS = 30 * 24 * 3_600_000;

/** Der Platzhalter: kurz genug für eine Zeile am Telefon. */
function platzhalter(kanal: Kanal, threadId: string | null): string {
  if (threadId) return 'Antworten';
  const titel = kanalTitel(kanal);
  return titel.length <= 24 ? `Nachricht an ${titel}` : 'Nachricht schreiben';
}

const FORMATE = [
  { zeichen: '*', name: 'Fett', symbol: 'F' },
  { zeichen: '_', name: 'Kursiv', symbol: 'K' },
  { zeichen: '~', name: 'Durchgestrichen', symbol: 'S' },
  { zeichen: '`', name: 'Code', symbol: '</>' },
] as const;

/**
 * Die Eingabe am Fuß eines Gesprächs oder Threads (TEAM-002, ANN-648): oben
 * das Feld, darunter eine Reihe mit „@“, „Aa“ (Formatierung) und „Später
 * senden“ links und „Senden“ rechts im Daumenbereich - zwei Reihen, damit
 * das Feld am Telefon die volle Breite behält (wie Slack mobil).
 *
 * * **Der Entwurf** gehört zu Konto, Gespräch und Thread (`entwuerfe.ts`);
 *   die Komponente steht je Gespräch unter eigenem Schlüssel, nichts wandert
 *   beim Wechsel mit.
 * * **Senden** reiht in den Ausgang (`ausgang.ts`): Die Nachricht steht sofort
 *   im Gespräch, das Feld ist frei, ohne Netz geht sie beim nächsten Empfang.
 * * **Enter** sendet am Rechner, Umschalt+Enter macht eine neue Zeile; am
 *   Telefon sendet nur der Knopf. Strg/⌘+Enter sendet überall. ↑ im leeren
 *   Feld bearbeitet die letzte eigene Nachricht.
 * * **Erwähnen** über „@“ in der Reihe oder getippt: Ein „@“ am Wortanfang
 *   öffnet die Namen, jeder Buchstabe grenzt ein, ein Tipp setzt den ganzen
 *   Namen (am Rechner auch Enter oder Tab den ersten).
 * * **Anhängen** (TEAM-003, ADR-017 Abschnitt M): Die Büroklammer bietet
 *   „Foto aufnehmen“ und „Foto oder PDF wählen“, ohne Kamera gleich den
 *   Dateiwähler. Eine Datei lädt hoch, sobald sie gewählt ist (`entwurfsanhaenge.ts`);
 *   „Senden“ geht schon währenddessen, die Nachricht wartet dann im Ausgang
 *   (TEAM-005, ANN-654). Mit Anhängen darf der Text leer sein (ANN-653),
 *   geplant wird dann nicht.
 * * **Sprachnachricht** (TEAM-004, ADR-017 Abschnitt N): Das Mikrofon in der
 *   Reihe nimmt auf - mit derselben Aufnahme wie das Diktat, sichtbar mit
 *   ihrer Zeit, höchstens zwei Minuten. „Fertig“ hängt sie an den Entwurf wie
 *   ein Foto; „Verwerfen“ wirft sie nach Rückfrage fort. Wer das Gespräch
 *   verlässt, verwirft sie; wird die Seite verborgen oder kommt die
 *   Sitzungssperre, ist sie fertig und hängt am Entwurf.
 */
export function Eingabe({
  kontoId,
  eigeneId,
  kanal,
  threadId = null,
  zeitzone,
  gesperrt,
  onGesendet,
  onLetzteBearbeiten,
}: {
  kontoId: string;
  /** Die eigene Kennung im Team - für die Kennung der Nachricht und „nicht sich selbst erwähnen“. */
  eigeneId: string | null;
  kanal: Kanal;
  threadId?: string | null;
  zeitzone: string;
  /** Satz statt Eingabe - archiviert oder die andere Person ist fort. */
  gesperrt?: string | null;
  onGesendet?: () => void;
  onLetzteBearbeiten?: () => void;
}) {
  const queryClient = useQueryClient();
  const feld = useRef<HTMLTextAreaElement>(null);
  // Wohin die Schreibmarke nach einem eingesetzten Namen oder Zeichen gehört.
  // Gesetzt, sobald React den Text ins Feld geschrieben hat - nicht erst im
  // nächsten Bild: Sonst landet ein schnell getippter Buchstabe an der alten
  // Stelle (Praxis-Sichtung, Test unter Last).
  const markeNachher = useRef<{ von: number; bis: number } | null>(null);
  useLayoutEffect(() => {
    const marke = markeNachher.current;
    if (!marke || !feld.current) return;
    markeNachher.current = null;
    feld.current.focus();
    feld.current.setSelectionRange(marke.von, marke.bis);
  });
  const text = useEntwurf(kontoId, kanal.id, threadId);
  const [werkzeug, setWerkzeug] = useState<'erwaehnen' | 'format' | 'anhaengen' | null>(null);
  const dateiwahl = useRef<HTMLInputElement>(null);
  const kamera = useKamera();
  const [kameraOffen, setKameraOffen] = useState(false);
  const [anhangHinweis, setAnhangHinweis] = useState<string | null>(null);
  const entwurfsanhaenge = useEntwurfsanhaenge(kontoId, kanal.id, threadId);
  const hatAnhaenge = entwurfsanhaenge.length > 0;
  // Senden geht, während Anhänge laden (ANN-654) - nicht mit einem, der
  // endgültig gescheitert ist, und nicht mit mehr als fünf (nach „Bearbeiten“).
  const anhangGescheitert = entwurfsanhaenge.some((a) => a.zustand === 'fehler' && !a.erneut);
  const zuVieleAnhaenge = entwurfsanhaenge.length > ANHAENGE_MAX;
  // Das Mikrofon steht nur da, wo das Gerät aufnehmen kann und der Server das
  // Format nimmt (Punkt 84).
  const [mitSprache] = useState(sprachnachrichtMoeglich);
  const aufnahme = useAufnahme({
    hoechstdauerS: SPRACHNACHRICHT_HOECHSTDAUER_S,
    onFertig: ({ audio, dauerS }) => {
      // Ohne Grenze: Füllte „Bearbeiten“ den Entwurf während der Aufnahme,
      // ginge sie sonst verloren (Zweitreview TEAM-005).
      anhaengenAusWahl(
        [
          {
            datei: audio,
            name: aufnahmeName(
              'Sprachnachricht',
              zeitzone,
              entwurfsanhaenge.map((a) => a.name),
            ),
            dauer: dauerS,
          },
        ],
        Number.POSITIVE_INFINITY,
      );
    },
    onFehler: (fehler) => setAnhangHinweis(AUFNAHMEFEHLER[fehler]),
  });
  const nimmtAuf = aufnahme.zustand !== 'bereit';
  const aufnahmeRef = useRef(aufnahme);
  aufnahmeRef.current = aufnahme;

  /** Die Aufnahme endet: was da ist, an den Entwurf; beim Öffnen des Mikrofons gibt es nichts. */
  function aufnahmeBeenden() {
    const laufend = aufnahmeRef.current;
    if (laufend.zustand === 'startet') laufend.abbrechen();
    else laufend.beenden();
  }

  // Vor der Sitzungssperre (ADR-025 Punkt 4) endet eine laufende Aufnahme -
  // hinter der Sperre gäbe es keine Anzeige mehr (Punkt 83). Die Sperre wartet,
  // bis sie wirklich vorbei ist und am Entwurf hängt; alle, die warten, auch
  // wenn der letzte Stopp schon unterwegs war (Zweitreview TEAM-004b, B2).
  const nachAufnahme = useRef<(() => void)[]>([]);
  useEffect(() => {
    if (!nimmtAuf) for (const fertig of nachAufnahme.current.splice(0)) fertig();
  }, [nimmtAuf]);
  useSperrsicherung(() => {
    if (aufnahmeRef.current.zustand === 'bereit') return Promise.resolve(true);
    return new Promise<boolean>((fertig) => {
      nachAufnahme.current.push(() => fertig(true));
      aufnahmeBeenden();
    });
  });

  // Ein Fenster darüber verdeckt die Anzeige der Aufnahme und sperrt den Rest
  // der Seite: Dann ist sie fertig wie beim Verbergen der Seite (Punkt 83,
  // Zweitreview TEAM-004b, B1). Fenster zeichnen sich ans Portalziel.
  const portalZiel = usePortalZiel();
  useEffect(() => {
    if (!nimmtAuf || typeof MutationObserver === 'undefined') return;
    const verdeckt = () => {
      if (portalZiel.querySelector('[aria-modal="true"]')) aufnahmeBeenden();
    };
    const beobachter = new MutationObserver(verdeckt);
    beobachter.observe(portalZiel, { childList: true });
    verdeckt();
    return () => beobachter.disconnect();
  }, [nimmtAuf, portalZiel]);
  const kannSenden =
    (text.trim() !== '' || hatAnhaenge) && !anhangGescheitert && !zuVieleAnhaenge && !nimmtAuf;
  // Ein getipptes „@…“ vor der Schreibmarke.
  const [anfrage, setAnfrage] = useState<{ von: number; wort: string } | null>(null);
  const [planen, setPlanen] = useState(false);
  const [auchImKanal, setAuchImKanal] = useState(false);
  // Die zuletzt geplante Nachricht: ihr Zustand im Ausgang, danach „Geplant für …“.
  const [geplant, setGeplant] = useState<{ id: string; um: string } | null>(null);
  const [planfehler, setPlanfehler] = useState<string | null>(null);
  const ausgang = useAusgang(kontoId, kanal.id, threadId);
  const planEintrag = geplant ? ausgang.find((e) => e.id === geplant.id) : undefined;
  const mitglieder = useQuery({
    queryKey: mitgliederKey(kanal.id),
    queryFn: () => fetchMitglieder(kanal.id),
    staleTime: 300_000,
    enabled: !gesperrt,
  });
  const personen = useMemo(
    () => (mitglieder.data ?? []).filter((m) => m.active),
    [mitglieder.data],
  );
  const beschriftung = threadId ? 'Antwort' : `Nachricht an ${kanalTitel(kanal)}`;
  const mitAlle = alleMoeglich(kanal.kind);
  const andere = personen.filter((p) => p.staff_member_id !== eigeneId);
  // Gilt nur, solange das „@…“ noch so im Feld steht.
  const getippt =
    anfrage && text.slice(anfrage.von, anfrage.von + anfrage.wort.length + 1) === `@${anfrage.wort}`
      ? {
          alle: mitAlle && 'alle'.startsWith(anfrage.wort.toLocaleLowerCase('de')),
          personen: passendePersonen(andere, anfrage.wort),
        }
      : null;
  const namenOffen =
    werkzeug === 'erwaehnen' || (getippt !== null && (getippt.alle || getippt.personen.length > 0));

  // Wer zurückkommt, findet den Entwurf; wer wechselt, nimmt nichts mit -
  // das Feld liest nur den Entwurf seiner Stelle (`useEntwurf`).
  function aendern(neu: string) {
    entwurfSetzen(kontoId, kanal.id, threadId, neu);
  }

  function absenden(e?: FormEvent, um: string | null = null) {
    e?.preventDefault();
    const inhalt = vervollstaendigeErwaehnungen(text.trim(), andere);
    // Geplant wird ohne Anhang.
    if (!kannSenden || (um && hatAnhaenge)) return;
    const auftrag: Sendeauftrag = {
      id: neueKennung(),
      kanalId: kanal.id,
      threadId,
      text: inhalt,
      erwaehnt: erwaehnte(inhalt, personen),
      alle: alleErwaehnt(inhalt, kanal.kind),
      auchImKanal: threadId !== null && auchImKanal,
      um,
      anhaenge: [],
    };
    // Die Anhänge gehen mit der Nachricht in den Ausgang, auch wenn sie noch
    // laden; dort geht sie, sobald alle oben sind (ANN-654).
    anhaengeBinden(kontoId, kanal.id, threadId, auftrag.id);
    einreihen(kontoId, eigeneId, auftrag, () => {
      void queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      if (um) void queryClient.invalidateQueries({ queryKey: GEPLANT_KEY });
    });
    aendern('');
    setWerkzeug(null);
    setAnfrage(null);
    setAuchImKanal(false);
    setAnhangHinweis(null);
    setGeplant(um ? { id: auftrag.id, um } : null);
    if (!um) onGesendet?.();
    feld.current?.focus();
  }

  /** Gewählte oder aufgenommene Dateien an den Entwurf - höchstens fünf (ADR-017 Punkt 71). */
  function anhaengenAusWahl(
    neue: readonly { datei: Blob; name: string; dauer?: number }[],
    grenze = ANHAENGE_MAX,
  ) {
    setWerkzeug(null);
    if (neue.length === 0) return;
    const uebrig = anhaengen(kontoId, kanal.id, threadId, neue, grenze);
    setAnhangHinweis(uebrig > 0 ? `Höchstens ${ANHAENGE_MAX} Anhänge je Nachricht.` : null);
  }

  /** Mit Kamera eine Wahl zwischen Foto und Datei, ohne gleich der Dateiwähler. */
  function bueroklammer() {
    if (kamera === 'ohneSchnittstelle' || kamera === 'keine') {
      dateiwahl.current?.click();
      return;
    }
    setWerkzeug(werkzeug === 'anhaengen' ? null : 'anhaengen');
  }

  /** Nur auf diesen Tipp öffnet sich das Mikrofon (Punkt 83). */
  function sprachnachrichtAufnehmen() {
    setWerkzeug(null);
    setAnhangHinweis(null);
    void aufnahme.starten();
  }

  function erwaehnen(name: string) {
    setWerkzeug(null);
    setAnfrage(null);
    if (getippt && anfrage) {
      // Das getippte „@…“ wird zum ganzen Namen, die Schreibmarke steht dahinter.
      const vorher = text.slice(0, anfrage.von);
      const nachher = text.slice(anfrage.von + anfrage.wort.length + 1).replace(/^ /, '');
      const eingesetzt = `@${name} `;
      const marke = vorher.length + eingesetzt.length;
      markeNachher.current = { von: marke, bis: marke };
      aendern(`${vorher}${eingesetzt}${nachher}`);
      return;
    }
    const davor = text === '' || /\s$/.test(text) ? '' : ' ';
    aendern(`${text}${davor}@${name} `);
    feld.current?.focus();
  }

  /** Liest das „@…“ vor der Schreibmarke - nach jeder Eingabe und jedem Versetzen. */
  function schreibmarke(el: HTMLTextAreaElement) {
    setAnfrage(angefangeneErwaehnung(el.value, el.selectionStart));
  }

  function auszeichnen(zeichen: string) {
    const el = feld.current;
    const von = el?.selectionStart ?? text.length;
    const bis = el?.selectionEnd ?? text.length;
    const auswahl = text.slice(von, bis);
    const neu = `${text.slice(0, von)}${zeichen}${auswahl}${zeichen}${text.slice(bis)}`;
    markeNachher.current = { von: von + zeichen.length, bis: bis + zeichen.length };
    aendern(neu);
  }

  function zeilenAnfang(vorsatz: string) {
    const el = feld.current;
    const von = el?.selectionStart ?? text.length;
    const anfang = text.lastIndexOf('\n', von - 1) + 1;
    aendern(`${text.slice(0, anfang)}${vorsatz}${text.slice(anfang)}`);
    requestAnimationFrame(() => el?.focus());
  }

  function taste(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (anfrage && getippt && werkzeug !== 'erwaehnen' && namenOffen) {
      // Erst Personen, „@alle“ nur, wenn es allein passt - und nie auf ein bloßes „@“.
      const erster = getippt.personen[0]?.name ?? (getippt.alle ? 'alle' : undefined);
      if (e.key === 'Escape') {
        e.preventDefault();
        setAnfrage(null);
        return;
      }
      const waehlt = e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && enterSendet());
      if (erster && anfrage.wort !== '' && waehlt) {
        e.preventDefault();
        erwaehnen(erster);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey || enterSendet())) {
      e.preventDefault();
      absenden();
      return;
    }
    if (e.key === 'ArrowUp' && text === '' && onLetzteBearbeiten) {
      e.preventDefault();
      onLetzteBearbeiten();
    }
  }

  if (gesperrt) {
    return (
      <Aktionsleiste einbettung="rahmen">
        <p className="text-ink-muted text-liste py-2">{gesperrt}</p>
      </Aktionsleiste>
    );
  }

  // Das Feld wächst mit dem Text bis sechs Zeilen; darüber rollt es.
  const zeilen = Math.min(6, Math.max(1, text.split('\n').length));
  const zeigeAlle = werkzeug === 'erwaehnen' ? mitAlle : (getippt?.alle ?? false);
  const zeigePersonen = werkzeug === 'erwaehnen' ? andere : (getippt?.personen ?? []);
  return (
    <>
      <form
        onSubmit={absenden}
        aria-label={beschriftung}
        className="bg-surface border-line shrink-0 border-t px-4 pt-2 pb-2 sm:px-6"
      >
        {namenOffen ? (
          <div className="rounded-card border-line bg-surface mb-2 max-h-56 overflow-y-auto border px-4">
            <ListRows beschriftung="Erwähnen" rahmen={false}>
              {zeigePersonen.map((person) => (
                <ListRow
                  key={person.staff_member_id}
                  dicht
                  titel={person.name}
                  onClick={() => erwaehnen(person.name)}
                />
              ))}
              {zeigeAlle ? (
                <ListRow
                  dicht
                  titel="@alle"
                  meta="Alle, die hier lesen"
                  onClick={() => erwaehnen('alle')}
                />
              ) : null}
            </ListRows>
          </div>
        ) : null}
        {geplant ? (
          planEintrag?.zustand === 'abgelehnt' ? (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Statusmeldung ton="fehler">
                Nicht geplant: {planEintrag.fehler ?? 'Der Server hat abgelehnt.'}
              </Statusmeldung>
              <Button
                type="button"
                variant="quiet"
                groesse="kompakt"
                onClick={() => {
                  const eintrag = ausgangEntfernen(geplant.id);
                  setGeplant(null);
                  if (eintrag) aendern(text ? `${text}\n${eintrag.text}` : eintrag.text);
                }}
              >
                Zurück ins Feld
              </Button>
            </div>
          ) : planEintrag?.zustand === 'wartet' ? (
            <Statusmeldung ton="warnung">
              Kein Netz – wird geplant, sobald Empfang da ist und die App läuft.
            </Statusmeldung>
          ) : planEintrag ? (
            <Statusmeldung>Wird geplant …</Statusmeldung>
          ) : (
            <Statusmeldung ton="erfolg">
              Geplant für {geplantFuer(geplant.um, zeitzone)} ·{' '}
              <Textlink to={ENTWUERFE}>Ansehen</Textlink>
            </Statusmeldung>
          )
        ) : null}
        {zuVieleAnhaenge || anhangHinweis ? (
          <Statusmeldung ton="warnung" className="mb-2">
            {zuVieleAnhaenge
              ? `Höchstens ${ANHAENGE_MAX} Anhänge je Nachricht – bitte entfernen, was zu viel ist.`
              : anhangHinweis}
          </Statusmeldung>
        ) : null}
        <EntwurfsAnhaenge anhaenge={entwurfsanhaenge} />
        <TextArea
          ref={feld}
          label={beschriftung}
          labelVersteckt
          placeholder={platzhalter(kanal, threadId)}
          value={text}
          maxLength={NACHRICHT_MAX}
          rows={zeilen}
          className="resize-none"
          onChange={(e) => {
            aendern(e.target.value);
            schreibmarke(e.target);
            if (geplant && !planEintrag) setGeplant(null);
          }}
          onSelect={(e) => schreibmarke(e.currentTarget)}
          onKeyDown={taste}
        />
        {threadId ? (
          // Eine eigene Zeile wie bei Slack: neben @, Aa und der Büroklammer
          // bräche das Wort bei 375 px um, und „Senden“ steht wie im Kanal.
          <div className="mt-1">
            <Checkbox
              label="Auch im Gespräch"
              checked={auchImKanal}
              onChange={(e) => setAuchImKanal(e.target.checked)}
            />
          </div>
        ) : null}
        {werkzeug === 'anhaengen' ? (
          <div role="group" aria-label="Anhängen" className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => {
                setWerkzeug(null);
                setKameraOffen(true);
              }}
            >
              Foto aufnehmen
            </Button>
            <Button
              type="button"
              variant="secondary"
              groesse="kompakt"
              onClick={() => dateiwahl.current?.click()}
            >
              Foto oder PDF wählen
            </Button>
          </div>
        ) : null}
        <input
          ref={dateiwahl}
          type="file"
          accept={DATEI_ACCEPT}
          multiple
          aria-label="Foto oder PDF anhängen"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const gewaehlt = [...(e.target.files ?? [])].map((datei) => ({
              datei,
              name: datei.name,
            }));
            // Dieselbe Datei soll sich gleich noch einmal wählen lassen.
            e.target.value = '';
            anhaengenAusWahl(gewaehlt);
          }}
        />
        {werkzeug === 'format' ? (
          <div role="group" aria-label="Formatierung" className="mt-2 flex flex-wrap gap-1">
            {FORMATE.map((f) => (
              <Symbolknopf
                key={f.name}
                beschriftung={f.name}
                onClick={() => auszeichnen(f.zeichen)}
              >
                <span
                  className={
                    f.zeichen === '*'
                      ? 'font-bold'
                      : f.zeichen === '_'
                        ? 'italic'
                        : f.zeichen === '~'
                          ? 'line-through'
                          : 'font-mono text-sm'
                  }
                >
                  {f.symbol}
                </span>
              </Symbolknopf>
            ))}
            <Symbolknopf beschriftung="Zitat" onClick={() => zeilenAnfang('> ')}>
              ❝
            </Symbolknopf>
            <Symbolknopf beschriftung="Liste" onClick={() => zeilenAnfang('- ')}>
              •
            </Symbolknopf>
          </div>
        ) : null}
        {aufnahme.zustand === 'startet' ? (
          <div className="mt-2 flex min-h-11 items-center gap-3">
            <Statusmeldung>Mikrofon wird geöffnet …</Statusmeldung>
            <Button
              type="button"
              variant="quiet"
              groesse="kompakt"
              className="ml-auto"
              onClick={aufnahme.abbrechen}
            >
              Abbrechen
            </Button>
          </div>
        ) : aufnahme.zustand === 'laeuft' ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Wie beim Diktat: ein roter Punkt und „Aufnahme 0:12“, Zeichen
                und Wort. Vorgelesen wird der Beginn, nicht jede Sekunde. */}
            <p role="status" className="text-danger flex items-center gap-2 text-base font-bold">
              <span
                aria-hidden="true"
                className="bg-danger rounded-pill size-3 shrink-0 motion-safe:animate-pulse"
              />
              <span>
                Aufnahme{' '}
                <span aria-live="off" className="tabular-nums">
                  {aufnahmedauer(aufnahme.sekunden)}
                </span>
              </span>
            </p>
            {/* Verwerfen nur mit Rückfrage und weit weg von „Fertig“. */}
            <div className="ml-auto">
              <Rueckfrage
                ausloeser="Verwerfen"
                ausloeserVariante="quiet"
                ausloeserGroesse="kompakt"
                bezeichnung="Sprachnachricht verwerfen"
                bestaetigen="Ja, verwerfen"
                onBestaetigen={aufnahme.abbrechen}
              >
                Die Aufnahme ist nicht gespeichert und lässt sich danach nicht zurückholen.
              </Rueckfrage>
            </div>
            <Button
              type="button"
              className="w-full basis-full sm:w-auto sm:basis-auto"
              onClick={aufnahme.beenden}
            >
              Fertig
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-1">
            <Symbolknopf
              beschriftung="Jemanden erwähnen"
              variant={werkzeug === 'erwaehnen' ? 'primary' : 'quiet'}
              aria-expanded={werkzeug === 'erwaehnen'}
              onClick={() => setWerkzeug(werkzeug === 'erwaehnen' ? null : 'erwaehnen')}
            >
              @
            </Symbolknopf>
            <Symbolknopf
              beschriftung="Formatierung"
              variant={werkzeug === 'format' ? 'primary' : 'quiet'}
              aria-expanded={werkzeug === 'format'}
              onClick={() => setWerkzeug(werkzeug === 'format' ? null : 'format')}
            >
              Aa
            </Symbolknopf>
            <Symbolknopf
              beschriftung="Anhängen"
              variant={werkzeug === 'anhaengen' ? 'primary' : 'quiet'}
              aria-expanded={werkzeug === 'anhaengen'}
              disabled={entwurfsanhaenge.length >= ANHAENGE_MAX}
              onClick={bueroklammer}
            >
              <Bueroklammer />
            </Symbolknopf>
            {mitSprache ? (
              <Symbolknopf
                beschriftung="Sprachnachricht aufnehmen"
                disabled={entwurfsanhaenge.length >= ANHAENGE_MAX}
                onClick={sprachnachrichtAufnehmen}
              >
                <Mikrofon />
              </Symbolknopf>
            ) : null}
            {threadId ? null : (
              <Symbolknopf
                beschriftung="Später senden"
                disabled={!text.trim() || hatAnhaenge}
                onClick={() => setPlanen(true)}
              >
                <Uhr />
              </Symbolknopf>
            )}
            <div className="ml-auto">
              <Button type="submit" groesse="kompakt" disabled={!kannSenden}>
                Senden
              </Button>
            </div>
          </div>
        )}
        {text.length > NACHRICHT_MAX - 400 ? (
          <p className="text-ink-muted mt-1 text-sm" aria-live="polite">
            Noch {NACHRICHT_MAX - text.length} Zeichen
          </p>
        ) : null}
        <Kleingedrucktes>
          {nimmtAuf
            ? 'Höchstens zwei Minuten. Keine Gespräche mit Patient:innen und keine Befunde – die gehören in die Akte.'
            : 'Befunde und Diagnosen gehören in die Akte.'}
        </Kleingedrucktes>
      </form>
      {kameraOffen ? (
        <Kameradialog
          titel="Foto anhängen"
          hinweis="Keine Fotos von Patient:innen und keine Befunde – die gehören in die Akte."
          onAufnahme={(foto) => {
            setKameraOffen(false);
            anhaengenAusWahl([
              {
                datei: foto,
                name: aufnahmeName(
                  'Foto',
                  zeitzone,
                  entwurfsanhaenge.map((a) => a.name),
                ),
              },
            ]);
          }}
          onSchliessen={() => setKameraOffen(false)}
        />
      ) : null}
      {planen ? (
        <Zeitwahl
          titel="Später senden"
          vorschlaege={planvorschlaege(zeitzone)}
          zeitzone={zeitzone}
          bestaetigen="Planen"
          laeuft={false}
          fehler={planfehler ?? undefined}
          onSchliessen={() => {
            setPlanen(false);
            setPlanfehler(null);
          }}
          onWaehlen={(um) => {
            // Dieselbe Grenze wie am Server (ANN-643) - sonst stünde die
            // Ablehnung erst nach dem Senden da.
            const abstand = Date.parse(um) - Date.now();
            if (!(abstand >= PLANEN_AB_MS && abstand <= PLANEN_BIS_MS)) {
              setPlanfehler('Planen geht eine Minute bis 30 Tage im Voraus.');
              return;
            }
            setPlanen(false);
            setPlanfehler(null);
            absenden(undefined, um);
          }}
        />
      ) : null}
    </>
  );
}
