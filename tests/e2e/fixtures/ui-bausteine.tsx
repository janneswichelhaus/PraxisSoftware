import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
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
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
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
    </main>
  );
}

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');
createRoot(wurzel).render(
  <MemoryRouter>
    <Seite />
  </MemoryRouter>,
);
