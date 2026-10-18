import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { TextArea } from '@/components/ui/TextArea';
import {
  GEPLANT_KEY,
  TEAMCHAT_KEY,
  fetchMitglieder,
  kanalTitel,
  mitgliederKey,
  type Kanal,
  type Sendeauftrag,
} from './api';
import { einreihen } from './ausgang';
import { entwurfSetzen, useEntwurf } from './entwuerfe';
import { NACHRICHT_MAX, alleErwaehnt, alleMoeglich, erwaehnte } from './erwaehnung';
import { ENTWUERFE } from './pfade';
import { Uhr } from './Zeichen';
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
  const [werkzeug, setWerkzeug] = useState<'erwaehnen' | 'format' | null>(null);
  const [planen, setPlanen] = useState(false);
  const [auchImKanal, setAuchImKanal] = useState(false);
  const [geplant, setGeplant] = useState<string | null>(null);
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

  // Wer zurückkommt, findet den Entwurf; wer wechselt, nimmt nichts mit -
  // das Feld liest nur den Entwurf seiner Stelle (`useEntwurf`).
  function aendern(neu: string) {
    entwurfSetzen(kontoId, kanal.id, threadId, neu);
  }

  function absenden(e?: FormEvent, um: string | null = null) {
    e?.preventDefault();
    const inhalt = text.trim();
    if (!inhalt) return;
    const auftrag: Sendeauftrag = {
      id: neueKennung(),
      kanalId: kanal.id,
      threadId,
      text: inhalt,
      erwaehnt: erwaehnte(inhalt, personen),
      alle: alleErwaehnt(inhalt, kanal.kind),
      auchImKanal: threadId !== null && auchImKanal,
      um,
    };
    einreihen(kontoId, eigeneId, auftrag, () => {
      void queryClient.invalidateQueries({ queryKey: TEAMCHAT_KEY });
      if (um) void queryClient.invalidateQueries({ queryKey: GEPLANT_KEY });
    });
    aendern('');
    setWerkzeug(null);
    setAuchImKanal(false);
    setGeplant(um);
    if (!um) onGesendet?.();
    feld.current?.focus();
  }

  function erwaehnen(name: string) {
    const davor = text === '' || /\s$/.test(text) ? '' : ' ';
    aendern(`${text}${davor}@${name} `);
    setWerkzeug(null);
    feld.current?.focus();
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
  const mitAlle = alleMoeglich(kanal.kind);
  return (
    <form
      onSubmit={absenden}
      aria-label={beschriftung}
      className="bg-surface border-line shrink-0 border-t px-4 pt-2 pb-2 sm:px-6"
    >
      {werkzeug === 'erwaehnen' ? (
        <div className="mb-2 max-h-56 overflow-y-auto">
          <ListRows beschriftung="Erwähnen">
            {mitAlle ? (
              <ListRow
                dicht
                titel="@alle"
                meta="Alle, die hier lesen"
                onClick={() => erwaehnen('alle')}
              />
            ) : null}
            {personen
              .filter((p) => p.staff_member_id !== eigeneId)
              .map((person) => (
                <ListRow
                  key={person.staff_member_id}
                  dicht
                  titel={person.name}
                  onClick={() => erwaehnen(person.name)}
                />
              ))}
          </ListRows>
        </div>
      ) : null}
      {geplant ? (
        <Statusmeldung ton="erfolg">
          Geplant für {geplantFuer(geplant, zeitzone)} ·{' '}
          <Link to={ENTWUERFE} className="underline">
            Ansehen
          </Link>
        </Statusmeldung>
      ) : null}
      <TextArea
        ref={feld}
        label={beschriftung}
        labelVersteckt
        placeholder={threadId ? 'Antworten' : `Nachricht an ${kanalTitel(kanal)}`}
        value={text}
        maxLength={NACHRICHT_MAX}
        rows={zeilen}
        className="resize-none"
        onChange={(e) => {
          aendern(e.target.value);
          if (geplant) setGeplant(null);
        }}
        onKeyDown={taste}
      />
      {werkzeug === 'format' ? (
        <div role="group" aria-label="Formatierung" className="mt-2 flex flex-wrap gap-1">
          {FORMATE.map((f) => (
            <Symbolknopf key={f.name} beschriftung={f.name} onClick={() => auszeichnen(f.zeichen)}>
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
        {threadId ? (
          <div className="ml-1 min-w-0">
            <Checkbox
              label="Auch im Gespräch"
              checked={auchImKanal}
              onChange={(e) => setAuchImKanal(e.target.checked)}
            />
          </div>
        ) : (
          <Symbolknopf
            beschriftung="Später senden"
            disabled={!text.trim()}
            onClick={() => setPlanen(true)}
          >
            <Uhr />
          </Symbolknopf>
        )}
        <div className="ml-auto">
          <Button type="submit" groesse="kompakt" disabled={!text.trim()}>
            Senden
          </Button>
        </div>
      </div>
      {text.length > NACHRICHT_MAX - 400 ? (
        <p className="text-ink-muted mt-1 text-sm" aria-live="polite">
          Noch {NACHRICHT_MAX - text.length} Zeichen
        </p>
      ) : null}
      <Kleingedrucktes>Befunde und Diagnosen gehören in die Akte, nicht hierher.</Kleingedrucktes>
      {planen ? (
        <Zeitwahl
          titel="Später senden"
          vorschlaege={planvorschlaege(zeitzone)}
          zeitzone={zeitzone}
          bestaetigen="Planen"
          laeuft={false}
          onSchliessen={() => setPlanen(false)}
          onWaehlen={(um) => {
            setPlanen(false);
            absenden(undefined, um);
          }}
        />
      ) : null}
    </form>
  );
}
