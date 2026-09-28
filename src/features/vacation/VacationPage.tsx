import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Card, CardGrid } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
import { roleLabels } from '@/components/ui/roleLabels';
import type { CurrentUser } from '@/features/session/types';
import { montagDerWoche, plusTage } from '@/features/preview/demodaten';
import {
  mitarbeiterName,
  useVorschau,
  type Protokolleintrag,
  type Vorschauzustand,
} from '@/features/preview/vorschauContext';
import { vorschauId } from '@/features/preview/vorschauZustand';
import { darfEntscheiden, vorschauidentitaet } from '@/features/preview/identitaet';
import { SignaturFeld } from '@/features/preview/SignaturFeld';
import { Abschnitt, Klappbereich, SimulationsMeldung } from '@/features/preview/ui';
import { formatDatum } from '@/features/preview/format';
import {
  urlaubsstatusLabels,
  type Mitarbeitende,
  type Urlaubsantrag,
  type Urlaubsstatus,
} from '@/features/preview/types';
import {
  ueberschneidungen,
  urlaubskonto,
  urlaubstageInWoche,
  werktageImZeitraum,
  zeitgleicheAbwesenheiten,
} from './urlaub';

/**
 * Urlaub.
 *
 * Übernahme aus der Team-App: Antrag, Wochenübersicht, offene Anträge,
 * Genehmigung und Ablehnung mit Begründung und Unterschrift, Überschneidungs-
 * warnung und Resturlaubsanzeige.
 *
 * Der wichtigste Unterschied betrifft nicht die Oberfläche: In der Vorlage
 * löste jede Genehmigung eine separate E-Mail aus, damit jemand von Hand den
 * Terminplan sperrt. Hier ist die genehmigte Abwesenheit selbst die Quelle -
 * sie wirkt unmittelbar auf Kapazität und Radverfügbarkeit. Bestehende Termine
 * im Zeitraum werden dabei ausdrücklich NICHT automatisch abgesagt oder
 * verschoben; sie werden zur Bearbeitung angezeigt.
 */

const statusTon: Record<Urlaubsstatus, Ton> = {
  beantragt: 'warnung',
  genehmigt: 'positiv',
  abgelehnt: 'kritisch',
};

const WOCHEN_VORAUS = 14;

/** Wer entscheidet - mit den Anzeigenamen der Rollen (VOR-25). */
const ENTSCHEIDENDE = `${roleLabels.owner} oder ${roleLabels.team_lead}`;

/** „10 Tage" ohne Umbruch zwischen Zahl und Einheit (VOR-24). */
function tage(anzahl: number): string {
  return `${anzahl}\u00a0Tage`;
}

export function VacationPage({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  const entscheidungsrecht = darfEntscheiden(user);

  const [meldung, setMeldung] = useState<Protokolleintrag | null>(null);
  const [formular, setFormular] = useState(false);
  const [entscheidung, setEntscheidung] = useState<{
    antrag: Urlaubsantrag;
    art: 'genehmigen' | 'ablehnen';
  } | null>(null);

  const offene = zustand.urlaub.filter((antrag) => antrag.status === 'beantragt');
  const eigene = identitaet
    ? zustand.urlaub.filter((antrag) => antrag.mitarbeiterId === identitaet.person.id)
    : [];

  if (formular) {
    return (
      <Antragsformular
        user={user}
        onFertig={(eintrag) => {
          setMeldung(eintrag);
          setFormular(false);
        }}
        onAbbrechen={() => setFormular(false)}
      />
    );
  }

  if (entscheidung) {
    return (
      <Entscheidungsformular
        antrag={entscheidung.antrag}
        art={entscheidung.art}
        user={user}
        onFertig={(eintrag) => {
          setMeldung(eintrag);
          setEntscheidung(null);
        }}
        onAbbrechen={() => setEntscheidung(null)}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Urlaub"
        description="Abwesenheiten planen, beantragen und entscheiden."
        actions={<Button onClick={() => setFormular(true)}>Urlaub beantragen</Button>}
      />

      <SimulationsMeldung eintrag={meldung} />

      {entscheidungsrecht ? (
        <Abschnitt
          titel={`Offene Anträge (${offene.length})`}
          beschreibung={`Zur Entscheidung durch ${ENTSCHEIDENDE}.`}
        >
          {offene.length === 0 ? (
            <EmptyState title="Keine offenen Anträge" />
          ) : (
            <CardGrid>
              {offene.map((antrag) => (
                <Antragskarte
                  key={antrag.id}
                  antrag={antrag}
                  zustand={zustand}
                  onGenehmigen={() => setEntscheidung({ antrag, art: 'genehmigen' })}
                  onAblehnen={() => setEntscheidung({ antrag, art: 'ablehnen' })}
                />
              ))}
            </CardGrid>
          )}
        </Abschnitt>
      ) : null}

      {identitaet ? (
        <Abschnitt
          titel="Meine Anträge"
          beschreibung={`Anträge von ${identitaet.person.name}${identitaet.ueberNamen ? '' : ' (Demoperson zur Rolle)'}.`}
        >
          <Konto personId={identitaet.person.id} />
          {eigene.length === 0 ? (
            <EmptyState title="Noch keine eigenen Anträge" />
          ) : (
            <CardGrid>
              {eigene.map((antrag) => (
                <Antragskarte key={antrag.id} antrag={antrag} zustand={zustand} />
              ))}
            </CardGrid>
          )}
        </Abschnitt>
      ) : null}

      {/* Nach den eigenen Anträgen und zugeklappt (VOR-16): Offen schob sie
          bei 390 px rund 600 px Tabelle vor den eigenen Stand. */}
      <Wochenuebersicht />

      {/* Entschieden wird oben unter „Offene Anträge"; dieselbe Karte mit
          Knöpfen stand hier ein zweites Mal (VOR-16). */}
      <Abschnitt titel="Alle Anträge" beschreibung="Team-Übersicht der Abwesenheiten.">
        <CardGrid>
          {zustand.urlaub.map((antrag) => (
            <Antragskarte key={antrag.id} antrag={antrag} zustand={zustand} />
          ))}
        </CardGrid>
      </Abschnitt>
    </>
  );
}

// -----------------------------------------------------------------------------
// Karten und Übersichten
// -----------------------------------------------------------------------------

function Antragskarte({
  antrag,
  zustand,
  onGenehmigen,
  onAblehnen,
}: {
  antrag: Urlaubsantrag;
  zustand: Vorschauzustand;
  onGenehmigen?: (() => void) | undefined;
  onAblehnen?: (() => void) | undefined;
}) {
  const zeitgleich = zeitgleicheAbwesenheiten(zustand.urlaub, antrag, antrag.mitarbeiterId);

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-liste truncate font-semibold">
            {mitarbeiterName(zustand, antrag.mitarbeiterId)}
          </p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {formatDatum(antrag.von)} – {formatDatum(antrag.bis)} · {tage(antrag.tage)}
          </p>
        </div>
        <Badge ton={statusTon[antrag.status]}>{urlaubsstatusLabels[antrag.status]}</Badge>
      </div>

      {antrag.grund ? <p className="text-ink-muted mt-2 text-sm">Grund: {antrag.grund}</p> : null}

      {antrag.status === 'abgelehnt' && antrag.ablehnungsgrund ? (
        <p className="text-danger mt-2 text-sm">Ablehnung: {antrag.ablehnungsgrund}</p>
      ) : null}

      {antrag.status === 'genehmigt' ? (
        <p className="text-ink-muted mt-2 text-sm">
          Genehmigt von {antrag.entschiedenVon} am {formatDatum(antrag.entschiedenAm)}
          {antrag.unterschrift ? ' · Bestätigung liegt vor' : ''}
        </p>
      ) : null}

      {zeitgleich.length > 0 ? (
        <p className="text-warnung bg-warnung-soft rounded-card mt-2 px-3 py-2 text-sm">
          Zeitgleich abwesend:{' '}
          {zeitgleich.map((eintrag) => mitarbeiterName(zustand, eintrag.mitarbeiterId)).join(', ')}
        </p>
      ) : null}

      {onGenehmigen || onAblehnen ? (
        <div className="border-line mt-3 flex flex-wrap gap-3 border-t pt-3">
          {onGenehmigen ? (
            <Button variant="secondary" onClick={onGenehmigen}>
              Genehmigen
            </Button>
          ) : null}
          {onAblehnen ? (
            <Button variant="quiet" onClick={onAblehnen}>
              Ablehnen
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function Konto({ personId }: { personId: string }) {
  const { zustand } = useVorschau();
  const person = zustand.mitarbeitende.find((eintrag) => eintrag.id === personId);
  if (!person) return null;
  const jahr = Number(zustand.stichtag.slice(0, 4));
  const konto = urlaubskonto(person, zustand.urlaub, jahr);

  return (
    <p className="text-ink-muted mb-3 text-sm">
      Anspruch {tage(konto.anspruch)} + {konto.uebertrag} Übertrag · genehmigt {konto.genehmigt} ·
      beantragt {konto.beantragt} ·{' '}
      <strong className="text-ink">verbleibend {tage(konto.rest)}</strong>
    </p>
  );
}

/**
 * Spaltenkopf der Wochenübersicht (VOR-16).
 *
 * Der Vorname reicht, solange er eindeutig ist. Teilen ihn zwei Personen -
 * die Demodaten haben Lena Hartmann und Lena Hartung absichtlich -, kommt ein
 * Kürzel des Nachnamens dazu: sein erster Buchstabe und der erste, an dem er
 * sich von den anderen unterscheidet („Lena Hm.", „Lena Hu."). Den vollen
 * Namen trägt der Spaltenkopf für Vorlesesoftware und als Hinweis beim Zeigen.
 */
function spaltenname(person: Mitarbeitende, alle: Mitarbeitende[]): string {
  const [vorname = person.name, ...rest] = person.name.split(' ');
  const nachname = rest.join(' ');
  const andere = alle
    .filter((eintrag) => eintrag.id !== person.id && eintrag.name.split(' ')[0] === vorname)
    .map((eintrag) => eintrag.name.split(' ').slice(1).join(' '));
  if (andere.length === 0 || nachname === '') return vorname;
  const initiale = nachname.charAt(0);
  if (andere.every((name) => name.charAt(0) !== initiale)) return `${vorname} ${initiale}.`;
  for (let stelle = 1; stelle < nachname.length; stelle += 1) {
    const zeichen = nachname.charAt(stelle);
    if (andere.every((name) => name.charAt(stelle) !== zeichen)) {
      return `${vorname} ${initiale}${zeichen}.`;
    }
  }
  return person.name;
}

/**
 * Wochenübersicht: wer wann Urlaub hat.
 *
 * Zeilen sind Wochen, Spalten Personen - wie in der Vorlage. Der Umfang der
 * Abwesenheit steht als Zahl in der Zelle; die Fläche hebt jede Abwesenheit
 * gleich hervor, ohne Stufen nach Anzahl (VOR-13): Fünf Urlaubstage sind kein
 * Fehler und drei keine Warnung.
 */
function Wochenuebersicht() {
  const { zustand } = useVorschau();
  const [vergangeneAusblenden, setVergangeneAusblenden] = useState(true);

  const start = montagDerWoche(zustand.stichtag);
  const wochen = Array.from({ length: WOCHEN_VORAUS }, (_, index) =>
    plusTage(vergangeneAusblenden ? start : plusTage(start, -28), index * 7),
  );

  return (
    <Klappbereich
      titel="Wochenübersicht – wer wann Urlaub hat"
      beschreibung="Zahl der genehmigten Urlaubswerktage je Woche."
    >
      {/* Das Kästchen des Systems mit 44 px Trefferfläche (VOR-11, RSP-13). */}
      <div className="mb-3">
        <Checkbox
          label="Vergangene Wochen ausblenden"
          checked={vergangeneAusblenden}
          onChange={(event) => setVergangeneAusblenden(event.target.checked)}
        />
      </div>

      {/* Per Tastatur erreichbar und benannt (VOR-02, UIK-24). */}
      <div
        className="-mx-4 overflow-x-auto px-4"
        tabIndex={0}
        role="region"
        aria-label="Wochenübersicht Urlaub"
      >
        <table className="w-full min-w-[36rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th
                scope="col"
                className="text-ink-muted bg-surface sticky left-0 text-left font-medium"
              >
                Woche
              </th>
              {zustand.mitarbeitende.map((person) => (
                // Den vollen Namen trägt der Spaltenkopf als Bezeichnung, nicht
                // als ausgeblendeter Text: Ein absolut gesetztes `sr-only`
                // stünde außerhalb des Scrollbereichs und machte die Seite
                // am Telefon breiter.
                <th
                  key={person.id}
                  scope="col"
                  aria-label={person.name}
                  className="text-ink-muted font-medium"
                >
                  <abbr title={person.name}>{spaltenname(person, zustand.mitarbeitende)}</abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {wochen.map((montag) => (
              <tr key={montag}>
                <th
                  scope="row"
                  className="text-ink bg-surface sticky left-0 pr-2 text-left font-medium whitespace-nowrap"
                >
                  ab {formatDatum(montag)}
                </th>
                {zustand.mitarbeitende.map((person) => {
                  const anzahl = urlaubstageInWoche(zustand.urlaub, person.id, montag);
                  return (
                    <td key={person.id} className="text-center">
                      <span
                        className={`rounded-pill inline-flex min-w-9 justify-center px-2 py-1 text-xs ${
                          anzahl === 0
                            ? 'bg-surface-sunken text-ink-muted'
                            : 'bg-accent-soft text-accent'
                        }`}
                      >
                        {anzahl === 0 ? '–' : anzahl}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Klappbereich>
  );
}

// -----------------------------------------------------------------------------
// Antrag
// -----------------------------------------------------------------------------

function Antragsformular({
  user,
  onFertig,
  onAbbrechen,
}: {
  user: CurrentUser;
  onFertig: (eintrag: Protokolleintrag) => void;
  onAbbrechen: () => void;
}) {
  const { zustand, simuliere } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);

  const [mitarbeiterId, setMitarbeiterId] = useState(identitaet?.person.id ?? '');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [tageEingabe, setTageEingabe] = useState('');
  const [grund, setGrund] = useState('');

  const berechnet = von && bis ? werktageImZeitraum(von, bis) : 0;
  const kollisionen =
    mitarbeiterId && von && bis
      ? ueberschneidungen(zustand.urlaub, mitarbeiterId, { von, bis })
      : [];
  const person = zustand.mitarbeitende.find((eintrag) => eintrag.id === mitarbeiterId);
  // Ohne Datum gilt das laufende Jahr der Vorschau (VOR-15). Bis dahin rechnete
  // das Konto dann mit dem Jahr 0 und zeigte zu viel Resturlaub.
  const konto = person
    ? urlaubskonto(person, zustand.urlaub, Number((von || zustand.stichtag).slice(0, 4)))
    : null;
  const endeVorBeginn = bis !== '' && von !== '' && bis < von;
  const gueltig = mitarbeiterId !== '' && von !== '' && bis !== '' && !endeVorBeginn;

  function absenden() {
    const beantragteTage = Number(tageEingabe) || berechnet;
    const eintrag = simuliere(
      {
        bereich: 'Urlaub',
        vorgang: `Urlaub beantragt: ${mitarbeiterName(zustand, mitarbeiterId)}, ${formatDatum(von)} – ${formatDatum(bis)}`,
        folgen: [
          `${beantragteTage} Tage als beantragt vorgemerkt`,
          'Der Antrag steht in der Liste der offenen Anträge',
        ],
        nichtGeschehen: [
          `Keine Benachrichtigung an ${ENTSCHEIDENDE} versendet`,
          'Keine Abwesenheit im Kalender eingetragen – das passiert erst mit der Genehmigung',
        ],
      },
      (stand) => ({
        ...stand,
        urlaub: [
          {
            id: vorschauId('urlaub'),
            mitarbeiterId,
            von,
            bis,
            tage: beantragteTage,
            grund,
            status: 'beantragt' as const,
            eingereichtAm: stand.stichtag,
            entschiedenVon: '',
            entschiedenAm: '',
            ablehnungsgrund: '',
            unterschrift: false,
          },
          ...stand.urlaub,
        ],
      }),
    );
    onFertig(eintrag);
  }

  return (
    <>
      <PageHeader title="Urlaub beantragen" />
      <div className="flex max-w-xl flex-col gap-4">
        <Select
          label="Person"
          value={mitarbeiterId}
          onChange={(event) => setMitarbeiterId(event.target.value)}
        >
          <option value="">– auswählen –</option>
          {zustand.mitarbeitende.map((eintrag) => (
            <option key={eintrag.id} value={eintrag.id}>
              {eintrag.name}
            </option>
          ))}
        </Select>

        {konto ? (
          <p className="text-ink-muted text-sm">
            Verbleibend {tage(konto.rest)} (Anspruch {konto.anspruch} + Übertrag {konto.uebertrag},
            genehmigt {konto.genehmigt}).
          </p>
        ) : null}

        <Field
          label="Von"
          type="date"
          value={von}
          onChange={(event) => setVon(event.target.value)}
        />
        {/* Der Zeitraumfehler steht am Feld „Bis" (VOR-15): Das Feld trägt ihn
            dann als Beschreibung und gilt als ungültig; als loser Absatz wurde
            er nicht vorgelesen. */}
        <Field
          label="Bis"
          type="date"
          value={bis}
          error={endeVorBeginn ? 'Das Ende liegt vor dem Beginn.' : undefined}
          onChange={(event) => setBis(event.target.value)}
        />

        <Field
          label="Urlaubstage"
          type="number"
          inputMode="numeric"
          hint={
            berechnet > 0
              ? `Werktage im Zeitraum: ${berechnet}. Feiertage sind nicht berücksichtigt.`
              : undefined
          }
          placeholder={berechnet > 0 ? String(berechnet) : ''}
          value={tageEingabe}
          onChange={(event) => setTageEingabe(event.target.value)}
        />

        {kollisionen.length > 0 ? (
          <p className="text-warnung bg-warnung-soft rounded-card px-3 py-2 text-sm">
            Überschneidung mit einem bestehenden Antrag:{' '}
            {kollisionen
              .map((antrag) => `${formatDatum(antrag.von)} – ${formatDatum(antrag.bis)}`)
              .join(', ')}
          </p>
        ) : null}

        <TextArea
          rows={3}
          label="Grund"
          hint="Optional. Private Gründe müssen nicht angegeben werden."
          value={grund}
          onChange={(event) => setGrund(event.target.value)}
        />

        <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={absenden} disabled={!gueltig}>
            Antrag in die Vorschau übernehmen
          </Button>
          <Button variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Entscheidung
// -----------------------------------------------------------------------------

function Entscheidungsformular({
  antrag,
  art,
  user,
  onFertig,
  onAbbrechen,
}: {
  antrag: Urlaubsantrag;
  art: 'genehmigen' | 'ablehnen';
  user: CurrentUser;
  onFertig: (eintrag: Protokolleintrag) => void;
  onAbbrechen: () => void;
}) {
  const { zustand, simuliere } = useVorschau();
  const [entschiedenVon, setEntschiedenVon] = useState(user.profile.display_name);
  const [ablehnungsgrund, setAblehnungsgrund] = useState('');
  const [unterschrieben, setUnterschrieben] = useState(false);

  const person = zustand.mitarbeitende.find((eintrag) => eintrag.id === antrag.mitarbeiterId);
  const konto = person
    ? urlaubskonto(person, zustand.urlaub, Number(antrag.von.slice(0, 4)))
    : null;
  const zeitgleich = zeitgleicheAbwesenheiten(zustand.urlaub, antrag, antrag.mitarbeiterId);
  const betroffeneRaeder = zustand.raeder.filter(
    (rad) => rad.stammnutzerId === antrag.mitarbeiterId,
  );

  function bestaetigen() {
    const name = mitarbeiterName(zustand, antrag.mitarbeiterId);
    const folgen =
      art === 'genehmigen'
        ? [
            `Abwesenheit ${formatDatum(antrag.von)} – ${formatDatum(antrag.bis)} gilt in der Vorschau als genehmigt`,
            'Die Planungskapazität dieser Person entfällt im Zeitraum',
            betroffeneRaeder.length > 0
              ? `Stammrad ${betroffeneRaeder.map((rad) => rad.name).join(', ')} ist im Zeitraum als frei markiert`
              : 'Kein Stammrad betroffen',
          ]
        : [`Antrag als abgelehnt vermerkt: ${ablehnungsgrund || 'ohne Angabe'}`];

    const eintrag = simuliere(
      {
        bereich: 'Urlaub',
        vorgang: art === 'genehmigen' ? `Urlaub genehmigt: ${name}` : `Urlaub abgelehnt: ${name}`,
        folgen,
        nichtGeschehen: [
          'Keine E-Mail zur Sperrung des Terminplans versendet – die genehmigte Abwesenheit ist selbst die Quelle',
          'Keine bestehenden Termine abgesagt, verschoben oder vertreten',
          'Keine Benachrichtigung an die betroffene Person',
        ],
      },
      (stand) => ({
        ...stand,
        urlaub: stand.urlaub.map((eintragAntrag) =>
          eintragAntrag.id === antrag.id
            ? {
                ...eintragAntrag,
                status: art === 'genehmigen' ? ('genehmigt' as const) : ('abgelehnt' as const),
                entschiedenVon: entschiedenVon.trim(),
                entschiedenAm: stand.stichtag,
                ablehnungsgrund: art === 'ablehnen' ? ablehnungsgrund : '',
                unterschrift: unterschrieben,
              }
            : eintragAntrag,
        ),
      }),
    );
    onFertig(eintrag);
  }

  return (
    <>
      <PageHeader
        title={art === 'genehmigen' ? 'Urlaub genehmigen' : 'Urlaub ablehnen'}
        description={`${mitarbeiterName(zustand, antrag.mitarbeiterId)} · ${formatDatum(antrag.von)} – ${formatDatum(antrag.bis)} · ${tage(antrag.tage)}`}
      />

      <div className="flex max-w-xl flex-col gap-4">
        {konto ? (
          <p className="text-ink-muted text-sm">
            Nach dieser Entscheidung verbleiben rechnerisch{' '}
            {art === 'genehmigen' ? konto.rest - antrag.tage : konto.rest} von{' '}
            {`${konto.anspruch + konto.uebertrag}\u00a0Tagen`}.
          </p>
        ) : null}

        {zeitgleich.length > 0 ? (
          <p className="text-warnung bg-warnung-soft rounded-card px-3 py-2 text-sm">
            Zeitgleich bereits abwesend:{' '}
            {zeitgleich
              .map((eintrag) => mitarbeiterName(zustand, eintrag.mitarbeiterId))
              .join(', ')}
          </p>
        ) : null}

        {art === 'genehmigen' ? (
          <p className="text-ink-muted rounded-card border border-dashed px-3 py-2 text-sm">
            Termine im Zeitraum müssen anschließend bewusst bearbeitet werden. Sie werden nicht
            automatisch abgesagt.{' '}
            <Link
              to={`/kalender?ansicht=tag&datum=${antrag.von}`}
              className="text-accent hover:text-accent-hover underline"
            >
              Kalender ab {formatDatum(antrag.von)} öffnen
            </Link>
          </p>
        ) : null}

        <Field
          label="Entscheidung durch"
          value={entschiedenVon}
          onChange={(event) => setEntschiedenVon(event.target.value)}
        />

        {art === 'ablehnen' ? (
          <TextArea
            rows={3}
            label="Grund der Ablehnung"
            placeholder="z. B. Zeitraum bereits durch zwei Abwesenheiten belegt"
            value={ablehnungsgrund}
            onChange={(event) => setAblehnungsgrund(event.target.value)}
          />
        ) : (
          <SignaturFeld beschriftung="Bestätigung der Genehmigung" onChange={setUnterschrieben} />
        )}

        <div className="border-line flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            onClick={bestaetigen}
            disabled={
              entschiedenVon.trim() === '' || (art === 'ablehnen' && ablehnungsgrund.trim() === '')
            }
          >
            {art === 'genehmigen' ? 'Genehmigung übernehmen' : 'Ablehnung übernehmen'}
          </Button>
          <Button variant="quiet" onClick={onAbbrechen}>
            Abbrechen
          </Button>
        </div>
      </div>
    </>
  );
}
