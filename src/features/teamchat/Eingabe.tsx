import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import { Textlink } from '@/components/ui/Textlink';
import { Kameradialog } from '@/features/files/Kameradialog';
import { DATEI_ACCEPT } from '@/features/files/dokumentarten';
import { useKamera } from '@/features/files/kamera';
import { EntwurfsAnhaenge } from './Anhaenge';
import { anhaengeAbgeben, anhaengen, useEntwurfsanhaenge } from './anhaenge';
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
import { Bueroklammer, Uhr } from './Zeichen';
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

/** Der Name eines Fotos aus dem Kameradialog: Tag und Uhrzeit der Aufnahme. */
function fotoName(zeitzone: string): string {
  const zeit = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: zeitzone,
  }).format(new Date());
  return `Foto ${zeit}`;
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
 *   Dateiwähler. Eine Datei lädt hoch, sobald sie gewählt ist (`anhaenge.ts`);
 *   gesendet wird erst, wenn alle oben bereit sind. Mit Anhängen darf der Text
 *   leer sein (ANN-653), geplant wird dann nicht.
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
  const text = useEntwurf(kontoId, kanal.id, threadId);
  const [werkzeug, setWerkzeug] = useState<'erwaehnen' | 'format' | 'anhaengen' | null>(null);
  const dateiwahl = useRef<HTMLInputElement>(null);
  const kamera = useKamera();
  const [kameraOffen, setKameraOffen] = useState(false);
  const [anhangHinweis, setAnhangHinweis] = useState<string | null>(null);
  const entwurfsanhaenge = useEntwurfsanhaenge(kontoId, kanal.id, threadId);
  const hatAnhaenge = entwurfsanhaenge.length > 0;
  const anhaengeOffen = entwurfsanhaenge.some((a) => a.zustand !== 'bereit');
  const kannSenden = (text.trim() !== '' || hatAnhaenge) && !anhaengeOffen;
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
    // Erst wenn alle Anhänge oben bereit sind; geplant wird ohne Anhang.
    if (!kannSenden || (um && hatAnhaenge)) return;
    const anhaenge = anhaengeAbgeben(kontoId, kanal.id, threadId);
    const auftrag: Sendeauftrag = {
      id: neueKennung(),
      kanalId: kanal.id,
      threadId,
      text: inhalt,
      erwaehnt: erwaehnte(inhalt, personen),
      alle: alleErwaehnt(inhalt, kanal.kind),
      auchImKanal: threadId !== null && auchImKanal,
      um,
      anhaenge,
    };
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
  function anhaengenAusWahl(neue: readonly { datei: Blob; name: string }[]) {
    setWerkzeug(null);
    if (neue.length === 0) return;
    const uebrig = anhaengen(kontoId, kanal.id, threadId, neue);
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

  function erwaehnen(name: string) {
    setWerkzeug(null);
    setAnfrage(null);
    if (getippt && anfrage) {
      // Das getippte „@…“ wird zum ganzen Namen, die Schreibmarke steht dahinter.
      const vorher = text.slice(0, anfrage.von);
      const nachher = text.slice(anfrage.von + anfrage.wort.length + 1).replace(/^ /, '');
      const eingesetzt = `@${name} `;
      aendern(`${vorher}${eingesetzt}${nachher}`);
      const marke = vorher.length + eingesetzt.length;
      requestAnimationFrame(() => {
        feld.current?.focus();
        feld.current?.setSelectionRange(marke, marke);
      });
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
    aendern(neu);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(von + zeichen.length, bis + zeichen.length);
    });
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
        {anhangHinweis ? (
          <Statusmeldung ton="warnung" className="mb-2">
            {anhangHinweis}
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
        {text.length > NACHRICHT_MAX - 400 ? (
          <p className="text-ink-muted mt-1 text-sm" aria-live="polite">
            Noch {NACHRICHT_MAX - text.length} Zeichen
          </p>
        ) : null}
        <Kleingedrucktes>Befunde und Diagnosen gehören in die Akte.</Kleingedrucktes>
      </form>
      {kameraOffen ? (
        <Kameradialog
          titel="Foto anhängen"
          hinweis="Keine Fotos von Patient:innen und keine Befunde – die gehören in die Akte."
          onAufnahme={(foto) => {
            setKameraOffen(false);
            anhaengenAusWahl([{ datei: foto, name: fotoName(zeitzone) }]);
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
