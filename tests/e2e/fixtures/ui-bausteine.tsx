import { useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Chip, Filterchips } from '@/components/ui/Chip';
import { Datenliste } from '@/components/ui/Datenliste';
import { Field } from '@/components/ui/Field';
import { Filterleiste } from '@/components/ui/Filterleiste';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Medienbild } from '@/components/ui/Medienbild';
import { Objektkopf, Warnzeile } from '@/components/ui/Objektkopf';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reiterleiste } from '@/components/ui/Reiterleiste';
import { SearchField } from '@/components/ui/SearchField';
import { Section } from '@/components/ui/Section';
import { Segment } from '@/components/ui/Segment';
import { Select } from '@/components/ui/Select';
import { useSeitenziel } from '@/components/ui/seitenUebergang';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { Zweispalter } from '@/components/ui/Zweispalter';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { NowMarker } from '@/components/ui/NowMarker';
import { ProgressDots } from '@/components/ui/ProgressDots';
import { StatusMark } from '@/components/ui/StatusMark';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { TravelBar } from '@/components/ui/TravelBar';
import { zeitstrahlRaster, zeitstrahlSchiene } from '@/components/ui/timelineStile';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `ui-bausteine.html` (UI-Redesign, Schritt 2).
 *
 * Die Bausteine aus dem Design-Handoff vom 2026-10-01 in allen Zuständen, mit
 * erfundenen Angaben und ohne Server. Was hier steht, ist keine Seite der
 * Anwendung - die Übersicht, der Termin und die Akte setzen die Bausteine in
 * den folgenden Schritten ein.
 *
 * Darunter, in voller Inhaltsbreite, die Bausteine des Design-Fundaments
 * (`docs/design/DESIGN.md`): Seitenkopf, Objektkopf mit Reitern,
 * Zwischentitel, Umschalter, Filterleiste, Zeilen mit Bild, Betrag und
 * Aktion, Listenabschnitt, Datenliste, Medienbild, Abfragezustand,
 * Zweispalter, Formularfuß und Aktionsleiste. Die Namen wiederholen keine der
 * oberen Abschnitte, damit die Prüfungen eindeutig bleiben.
 */
function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-ink-muted tracking-label mb-3 text-xs font-semibold uppercase">
        {titel}
      </h2>
      {children}
    </section>
  );
}

/** Ein Termin im Zeitstrahl, nur so weit, wie die Jetzt-Marke ihn braucht. */
function Eintrag({ zeit, children }: { zeit: string; children: ReactNode }) {
  return (
    <li className={zeitstrahlRaster}>
      <span className="text-liste text-ink pt-0.5 font-semibold tabular-nums">{zeit}</span>
      <span aria-hidden="true" className="relative flex justify-center">
        <span className={zeitstrahlSchiene} />
        <span className="border-line-strong bg-surface-sunken rounded-pill relative mt-1.5 size-3.5 border-2" />
      </span>
      <div className="min-w-0 pb-[18px]">{children}</div>
    </li>
  );
}

export function Seite() {
  // Wie der Rahmen der Anwendung meldet der Inhalt die neue Seite - das Ziel
  // von „Zeile öffnet sich zur Seite“ (ANN-567, `tests/e2e/bewegung.spec.ts`).
  const inhalt = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useSeitenziel(inhalt, pathname);
  return (
    <main ref={inhalt}>
      <Handoff />
      <Fundament />
    </main>
  );
}

function Handoff() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-accent text-h2-mobil sm:text-h2 tracking-display mb-6 font-extrabold">
        Oberflächen-Bausteine
      </h1>

      <Abschnitt titel="Gesperrte Knöpfe - Fläche, Papier, vertieft (BEF-069)">
        <div className="flex flex-col gap-3">
          {(
            [
              '',
              'bg-surface border-line rounded-card border',
              'bg-surface-sunken rounded-card',
            ] as const
          ).map((grund) => (
            <div key={grund || 'flaeche'} className={`flex flex-wrap gap-3 p-4 ${grund}`}>
              <Button disabled>Als Entwurf speichern</Button>
              <Button variant="secondary" disabled>
                Zweitens
              </Button>
              <Button variant="quiet" disabled>
                Abbrechen
              </Button>
              <Button variant="secondary">Aktiv daneben</Button>
            </div>
          ))}
        </div>
      </Abschnitt>

      <Abschnitt titel="Fortschrittspunkte">
        <ProgressDots punkte={['erledigt', 'nicht_angetroffen', 'naechster', 'offen', 'abgesagt']}>
          1 von 5 Besuchen erledigt
        </ProgressDots>
      </Abschnitt>

      <Abschnitt titel="Wegbalken, groß - vier Stufen">
        <div className="flex flex-col gap-2">
          <TravelBar
            von={{ zeit: '08:30', label: 'Ende Erika Beispiel' }}
            bis={{ zeit: '09:10', label: 'Max Mustermann' }}
            fahrtMin={12}
          />
          <TravelBar
            titel="Nächster Weg danach"
            von={{ zeit: '10:10', label: 'Ende Max Mustermann' }}
            bis={{ zeit: '10:26', label: 'Berta Bestand' }}
            fahrtMin={12}
          />
          <TravelBar
            von={{ zeit: '11:00', label: 'Ende Berta Bestand' }}
            bis={{ zeit: '11:15', label: 'Carl Muster' }}
            fahrtMin={12}
          />
          <TravelBar
            von={{ zeit: '12:00', label: 'Ende Carl Muster mit einem sehr langen Namen' }}
            bis={{ zeit: '12:08', label: 'Dora Probe mit einem ebenso langen Namen' }}
            fahrtMin={12}
          />
          <TravelBar
            von={{ zeit: '07:45', label: 'Start am Rad' }}
            bis={{ zeit: '08:30', label: 'Erika Beispiel' }}
            fahrtMin={9}
          />
        </div>
      </Abschnitt>

      <Abschnitt titel="Zeitstrahl mit Jetzt-Marke und Übergängen">
        <ol>
          <Eintrag zeit="08:30">
            <p className="text-base font-semibold">Erika Beispiel</p>
            <p className="text-ink-muted text-sm">Testweg 7 · Anfahrt ≈ 9 min</p>
          </Eintrag>
          <NowMarker zeit="09:42" />
          <Eintrag zeit="10:00">
            <TravelBar
              size="klein"
              von={{ zeit: '09:30', label: '' }}
              bis={{ zeit: '10:00', label: '' }}
              fahrtMin={9}
            />
            <p className="text-base font-semibold">Max Mustermann</p>
            <p className="text-ink-muted text-sm">Beispielstrasse 12 · Anfahrt ≈ 9 min</p>
          </Eintrag>
          <Eintrag zeit="11:15">
            <TravelBar
              size="klein"
              von={{ zeit: '11:00', label: '' }}
              bis={{ zeit: '11:15', label: '' }}
              fahrtMin={12}
            />
            <p className="text-base font-semibold">Berta Bestand</p>
            <p className="text-ink-muted text-sm">Musterweg 3 · Anfahrt ≈ 12 min</p>
          </Eintrag>
          <Eintrag zeit="12:30">
            <TravelBar
              size="klein"
              von={{ zeit: '12:15', label: '' }}
              bis={{ zeit: '12:30', label: '' }}
              fahrtMin={19}
            />
            <p className="text-base font-semibold">Carl Muster</p>
            <p className="text-ink-muted text-sm">Probeweg 1 · Anfahrt ≈ 19 min</p>
          </Eintrag>
        </ol>
      </Abschnitt>

      <Abschnitt titel="Kacheln">
        <TileGrid spalte="kachel">
          <Tile label="Wann" zusatz="09:10–10:10 · 60 min">
            Do 01.10.2026
          </Tile>
          <Tile
            label="Anschrift"
            zusatz="72070 Tuebingen"
            aktion={
              <Textlink alleinstehend to="/navigation">
                Navigation starten →
              </Textlink>
            }
          >
            Beispielstrasse 12
          </Tile>
          <Tile label="Grundlage" ton="akzent" zusatz="✓ gedeckt · Verordnung">
            Termin 2 von 6
          </Tile>
          <Tile label="Erstaufnahme offen" ton="warnung" zusatz="Einwilligung, Anamnese">
            2 Angaben fehlen
          </Tile>
        </TileGrid>
      </Abschnitt>

      <Abschnitt titel="Zeilen in einer Karte">
        <ListRows>
          <ListRow
            zeit="10:00"
            titel="Max Mustermann"
            meta="Beispielstrasse 12 · Liege · Anfahrt ≈ 9 min"
            status={<span aria-hidden="true">→</span>}
            to="/termine/1"
          />
          <ListRow
            zeit="11:15"
            titel="Berta Bestand"
            meta="Musterweg 3 · Anfahrt ≈ 12 min"
            status={<Badge ton="warnung">Nicht angetroffen</Badge>}
            onClick={() => undefined}
          />
          <ListRow
            zeit="08:30"
            titel="Erika Beispiel"
            meta="Testweg 7"
            status={<Badge ton="positiv">Dokumentiert</Badge>}
            gedaempft
          />
        </ListRows>
      </Abschnitt>

      <Abschnitt titel="Aufklapper">
        <div className="flex flex-col gap-3">
          <Disclosure summary="Erledigt heute" anzahl={3} kopf="betont">
            <p className="text-sm">Drei Besuche sind abgeschlossen.</p>
          </Disclosure>
          <Disclosure summary="Tagesplan des Teams" anzahl={4} kopf="label" inKarte offen>
            <ListRows rahmen={false}>
              <ListRow
                dicht
                zeit="08:00"
                titel="Frida Test mit einem langen Nachnamen-Doppelnamen"
                meta="Tim Teamleitung · Praxis"
                status={<StatusMark ton="positiv">erledigt</StatusMark>}
              />
              <ListRow
                dicht
                zeit="09:15"
                titel="Gustav Vorlage"
                meta="Tim Teamleitung"
                status={<StatusMark ton="warnung">nicht angetroffen</StatusMark>}
              />
              <ListRow
                dicht
                zeit="10:30"
                titel="Dora Probe"
                meta="Nina Neu · Video"
                status={<StatusMark ton="kritisch">abgesagt</StatusMark>}
              />
              <ListRow dicht zeit="11:45" titel="Carl Muster" meta="Nina Neu" />
            </ListRows>
          </Disclosure>
          <Disclosure summary="Alle Angaben" kopf="label" inKarte offenAb="lg">
            <p className="text-sm">Am Rechner von Anfang an offen, am Telefon zu.</p>
          </Disclosure>
        </div>
      </Abschnitt>
    </div>
  );
}

/** Eine gezeichnete Übung, Strich 2, Tinte auf Weiß - nur für die Schau. */
function Wandsitz() {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink"
    >
      <path d="M40 8v104M30 112h110" className="text-line-strong" />
      <circle cx="52" cy="30" r="8" />
      <path d="M48 39v32h32v34M48 50l22 10" />
      <path d="M80 71l4 34" className="text-accent" />
    </svg>
  );
}

type Rechnung = { id: string; nummer: string; person: string; zustand: string; betrag: string };

const RECHNUNGEN: Rechnung[] = [
  { id: 'r1', nummer: '2026-014', person: 'Gerda Beispiel', zustand: 'Offen', betrag: '126,40 €' },
  { id: 'r2', nummer: '2026-015', person: 'Hans Muster', zustand: 'Bezahlt', betrag: '84,00 €' },
  { id: 'r3', nummer: '2026-016', person: 'Ida Probe', zustand: 'Entwurf', betrag: '1.204,00 €' },
];

/** Ein Stand der Abfrage für die Schau - ohne Server. */
function stand<T>(teil: { data?: T; isPending?: boolean; isError?: boolean }) {
  return {
    data: teil.data,
    isPending: teil.isPending ?? false,
    isError: teil.isError ?? false,
    isFetching: false,
    refetch: () => undefined,
  };
}

function Fundament() {
  const [ansicht, setAnsicht] = useState<'woche' | 'team'>('woche');
  const [regionen, setRegionen] = useState<string[]>(['knie']);
  const [suche, setSuche] = useState('');
  const [ausruestung, setAusruestung] = useState('');
  const gesetzt = regionen.length + (ausruestung ? 1 : 0);

  return (
    <div className="max-w-inhalt mx-auto px-4 pt-2 pb-24">
      <Abschnitt titel="Seitenkopf mit kompakten Aktionen">
        <PageHeader
          title="Mitarbeitende"
          description="Kopf einer Liste: Aktionen ohne Angabe kompakt."
          actions={<ButtonLink to="/neu">Anlegen</ButtonLink>}
        />
      </Abschnitt>

      <Abschnitt titel="Objektkopf mit Reitern">
        <Objektkopf
          titel="Karla Vorlage"
          rueckweg={{ to: '/liste', beschriftung: 'Zurück zur Liste' }}
          meta="geb. 03.04.1958 · 68 Jahre · Rottenburg"
          status={<Badge ton="warnung">Vertrag ruht</Badge>}
          abzeichen={
            <>
              <Badge>Training · Selbstzahler</Badge>
              <Badge ton="akzent">Liege mitnehmen</Badge>
            </>
          }
          aktionen={
            <>
              <ButtonLink to="/objekt/1/einheit/neu">Einheit planen</ButtonLink>
              <ButtonLink to="/objekt/1/plan/neu" variant="secondary">
                Plan erstellen
              </ButtonLink>
            </>
          }
          hinweise={
            <>
              <Warnzeile aktion={<Textlink href="#einwilligung">Einholen</Textlink>}>
                Einwilligung Gesundheitsangaben fehlt
              </Warnzeile>
              <Disclosure kopf="label" summary="Hinweise">
                <p className="text-sm">Klingel Vorlage, 2. OG links.</p>
              </Disclosure>
            </>
          }
          reiter={
            <Reiterleiste
              label="Teile der Kundin"
              reiter={[
                { to: '/objekt/1/einheiten', label: 'Einheiten' },
                { to: '/objekt/1/plaene', label: 'Pläne' },
                { to: '/objekt/1/verlauf', label: 'Verlauf' },
                { to: '/objekt/1/vertrag', label: 'Vertrag' },
                { to: '/objekt/1/stammdaten', label: 'Stammdaten' },
              ]}
            />
          }
        />
      </Abschnitt>

      <Abschnitt titel="Zwischentitel im Block">
        <Section titel="Person" rahmen>
          <Zwischentitel>Kontakt</Zwischentitel>
          <p className="text-liste">0151 2345678</p>
          <Zwischentitel aktion={<Textlink href="#anschrift">Bearbeiten</Textlink>}>
            Anschrift der Kundin
          </Zwischentitel>
          <p className="text-liste">Probeweg 4, 72108 Rottenburg</p>
        </Section>
      </Abschnitt>

      <Abschnitt titel="Umschalter">
        <div className="flex flex-col gap-4">
          <Segment
            beschriftung="Ansicht der Schau"
            wahlen={[
              { wert: 'woche', text: 'Woche' },
              { wert: 'team', text: 'Team' },
            ]}
            gewaehlt={ansicht}
            onWaehlen={setAnsicht}
          />
          <div className="flex flex-wrap gap-2">
            <Chip href="#monat-september">September 2026</Chip>
            <Chip href="#monat-august">August 2026</Chip>
          </div>
        </div>
      </Abschnitt>

      <Abschnitt titel="Filterleiste">
        <Filterleiste
          beschriftung="Übungen filtern"
          suche={
            <SearchField
              label="Übungen durchsuchen"
              placeholder="Bezeichnung, auch in Alltagssprache"
              value={suche}
              onChange={setSuche}
            />
          }
          gesetzt={gesetzt}
          onZuruecksetzen={() => {
            setRegionen([]);
            setAusruestung('');
          }}
          ergebnis="24 Übungen"
        >
          <Select
            label="Ausrüstung"
            value={ausruestung}
            onChange={(event) => setAusruestung(event.target.value)}
          >
            <option value="">Alle</option>
            <option value="ohne">Ohne Ausrüstung</option>
            <option value="band">Theraband</option>
          </Select>
          <Filterchips
            beschriftung="Körperregion"
            wahlen={[
              { wert: 'knie', text: 'Knie' },
              { wert: 'huefte', text: 'Hüfte' },
              { wert: 'schulter', text: 'Schulter' },
              { wert: 'ruecken', text: 'Rücken' },
            ]}
            gewaehlt={regionen}
            onAendern={setRegionen}
          />
        </Filterleiste>
      </Abschnitt>

      <Abschnitt titel="Zeilen mit Bild, Betrag und Aktion">
        <ListRows>
          <ListRow
            bild={
              <Medienbild vorschau alt="Wandsitz">
                <Wandsitz />
              </Medienbild>
            }
            titel="Wandsitz"
            meta="3 × 30 s · Pause 60 s"
            to="/uebungen/wandsitz"
          />
          <ListRow
            bild={<Medienbild vorschau alt="Seitstütz" />}
            titel="Seitstütz"
            meta="Noch ohne Bild"
            to="/uebungen/seitstuetz"
          />
          <ListRow
            titel="Rechnung 2026-014"
            meta="Gerda Beispiel · fällig 26.10."
            betrag="126,40 €"
            status={<Badge ton="warnung">Offen</Badge>}
            to="/rechnungen/r1"
          />
          <ListRow
            zeit="14:30"
            titel="Jonas Test"
            meta="Lindenweg 2 · Anfahrt ≈ 7 min"
            to="/termine/j1"
            aktion={
              <>
                <Button type="button" variant="secondary">
                  Doku
                </Button>
                <Symbolknopf beschriftung="Termin von Jonas Test abschließen" variant="secondary">
                  <HakenSymbol />
                </Symbolknopf>
              </>
            }
          />
        </ListRows>
      </Abschnitt>

      <Abschnitt titel="Listenabschnitt">
        <Listenabschnitt
          titel="Offene Aufgaben"
          anzahl={2}
          ebene={3}
          aktion={
            <Textlink alleinstehend href="#aufgabe">
              Aufgabe anlegen
            </Textlink>
          }
        >
          <ListRow
            titel="Verordnung von Lena Beispiel prüfen"
            meta="bis Freitag"
            to="/aufgaben/1"
          />
          <ListRow titel="Rückruf Hans Muster" meta="heute" to="/aufgaben/2" />
        </Listenabschnitt>
        <Listenabschnitt
          titel="Erledigte Aufgaben"
          ebene={3}
          leer={{
            titel: 'Noch nichts erledigt',
            beschreibung: 'Erledigtes steht hier eine Woche.',
          }}
        />
      </Abschnitt>

      <Abschnitt titel="Datenliste">
        <Datenliste
          beschriftung="Rechnungen der Schau"
          zeilen={RECHNUNGEN}
          schluessel={(rechnung) => rechnung.id}
          spalten={[
            {
              titel: 'Nummer',
              breite: '10rem',
              inhalt: (rechnung) => <Textlink href={`#${rechnung.id}`}>{rechnung.nummer}</Textlink>,
            },
            { titel: 'Person', inhalt: (rechnung) => rechnung.person },
            {
              titel: 'Zustand',
              breite: '12rem',
              inhalt: (rechnung) => <Badge>{rechnung.zustand}</Badge>,
            },
            {
              titel: 'Betrag',
              breite: '8rem',
              rechts: true,
              telefon: 'ende',
              inhalt: (rechnung) => rechnung.betrag,
            },
          ]}
        />
      </Abschnitt>

      <Abschnitt titel="Medienbild">
        <div className="grid gap-4 sm:grid-cols-2">
          <Medienbild
            alt="Wandsitz: Rücken an der Wand, Knie über den Füßen"
            beschriftung="Wandsitz"
          >
            <Wandsitz />
          </Medienbild>
          <Medienbild alt="Seitstütz" beschriftung="Platzhalter, solange kein Bild da ist" />
        </div>
      </Abschnitt>

      <Abschnitt titel="Abfragezustand">
        <div className="flex flex-col gap-4">
          <Abfragezustand
            abfrage={stand<string[]>({ isPending: true })}
            laden="Übungen werden geladen …"
            fehler="Die Übungen konnten nicht geladen werden."
            inKarte
            kacheln={2}
          >
            {() => null}
          </Abfragezustand>
          <Abfragezustand
            abfrage={stand<string[]>({ isError: true })}
            laden="Übungen werden geladen …"
            fehler="Die Übungen konnten nicht geladen werden."
          >
            {() => null}
          </Abfragezustand>
          <Abfragezustand
            abfrage={stand({ data: ['Wandsitz', 'Seitstütz'], isError: true })}
            laden="Übungen werden geladen …"
            fehler="Die Übungen konnten nicht geladen werden."
          >
            {(daten) => <p className="text-liste">{daten.join(', ')}</p>}
          </Abfragezustand>
        </div>
      </Abschnitt>

      <Abschnitt titel="Zweispalter">
        <Zweispalter
          kontextBreite="schmal"
          kontext={
            <>
              <Section titel="Kontakt der Schau" rahmen>
                <p className="text-liste">0151 2345678</p>
              </Section>
              <Section titel="Grundlage der Schau" rahmen>
                <p className="text-liste">Selbstzahler · 10er-Karte</p>
              </Section>
            </>
          }
        >
          <Section titel="Hauptspalte" rahmen>
            <p className="text-liste">Ab 900 px Inhaltsbreite steht rechts die Kontextspalte.</p>
          </Section>
        </Zweispalter>
      </Abschnitt>

      <Abschnitt titel="Formularfuß">
        <form onSubmit={(event) => event.preventDefault()} className="max-w-formular">
          <Field label="Bezeichnung der Schau" defaultValue="Wandsitz" />
          <Formularfuss>
            <Button type="submit">Speichern</Button>
            <ButtonLink to="/zurueck" variant="quiet">
              Abbrechen
            </ButtonLink>
          </Formularfuss>
        </form>
      </Abschnitt>

      <Abschnitt titel="Aktionsleiste">
        <p className="text-ink-muted text-sm">
          Klebt am unteren Rand, solange dieser Abschnitt im Bild ist.
        </p>
        <div className="min-h-dvh" />
        <Aktionsleiste>
          <Button type="button" variant="secondary">
            Verlauf
          </Button>
          <Button type="button" variant="quiet" className="ml-auto">
            Entwurf
          </Button>
          <Button type="button">Festschreiben</Button>
        </Aktionsleiste>
      </Abschnitt>
    </div>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(
  // Ein Pfad unter dem Objekt, damit die Reiterleiste einen offenen Reiter zeigt.
  <MemoryRouter initialEntries={['/objekt/1/einheiten']}>
    <Seite />
  </MemoryRouter>,
);
