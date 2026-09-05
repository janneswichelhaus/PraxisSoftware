import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { Badge, type Ton } from '@/components/ui/Badge';
import { Card, CardGrid } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Feedback';
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
import {
  Abschnitt,
  Klappbereich,
  OffeneEntscheidung,
  SimulationsMeldung,
  VorschauBanner,
} from '@/features/preview/ui';
import { formatDatum } from '@/features/preview/format';
import {
  urlaubsstatusLabels,
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

      <VorschauBanner bereich="Urlaub" />
      <SimulationsMeldung eintrag={meldung} />

      {entscheidungsrecht ? (
        <Abschnitt
          titel={`Offene Anträge (${offene.length})`}
          beschreibung="Zur Entscheidung durch Leitung oder Teamleitung."
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

      <Wochenuebersicht />

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

      <Abschnitt titel="Alle Anträge" beschreibung="Team-Übersicht der Abwesenheiten.">
        <CardGrid>
          {zustand.urlaub.map((antrag) => (
            <Antragskarte
              key={antrag.id}
              antrag={antrag}
              zustand={zustand}
              onGenehmigen={
                entscheidungsrecht && antrag.status === 'beantragt'
                  ? () => setEntscheidung({ antrag, art: 'genehmigen' })
                  : undefined
              }
              onAblehnen={
                entscheidungsrecht && antrag.status === 'beantragt'
                  ? () => setEntscheidung({ antrag, art: 'ablehnen' })
                  : undefined
              }
            />
          ))}
        </CardGrid>
      </Abschnitt>

      <OffeneEntscheidung titel="Genehmigung und Terminplan">
        Eine genehmigte Abwesenheit ist die verlässliche Quelle für Kapazität und Radverfügbarkeit.
        Ob und wie bestehende Termine im Zeitraum abgesagt, verschoben oder vertreten werden, bleibt
        eine bewusste Entscheidung mit Patientenabstimmung – das passiert nicht automatisch
        (PROJECT_PRINCIPLES.md 8).
      </OffeneEntscheidung>
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
          <p className="text-ink truncate text-[0.9375rem] font-semibold">
            {mitarbeiterName(zustand, antrag.mitarbeiterId)}
          </p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {formatDatum(antrag.von)} – {formatDatum(antrag.bis)} · {antrag.tage} Tage
          </p>
        </div>
        <Badge ton={statusTon[antrag.status]}>{urlaubsstatusLabels[antrag.status]}</Badge>
      </div>

      {antrag.grund ? <p className="text-ink-muted mt-2 text-sm">Grund: {antrag.grund}</p> : null}

      {antrag.status === 'abgelehnt' && antrag.ablehnungsgrund ? (
        <p className="text-danger mt-2 text-sm">Ablehnung: {antrag.ablehnungsgrund}</p>
      ) : null}

      {antrag.status === 'genehmigt' ? (
        <p className="text-ink-subtle mt-2 text-sm">
          Genehmigt von {antrag.entschiedenVon} am {formatDatum(antrag.entschiedenAm)}
          {antrag.unterschrift ? ' · Bestätigung liegt vor' : ''}
        </p>
      ) : null}

      {zeitgleich.length > 0 ? (
        <p className="text-warnung bg-warnung-soft mt-2 rounded-lg px-3 py-2 text-sm">
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
      Anspruch {konto.anspruch} Tage + {konto.uebertrag} Übertrag · genehmigt {konto.genehmigt} ·
      beantragt {konto.beantragt} ·{' '}
      <strong className="text-ink">verbleibend {konto.rest} Tage</strong>
    </p>
  );
}

/**
 * Wochenübersicht: wer wann Urlaub hat.
 *
 * Zeilen sind Wochen, Spalten Personen - wie in der Vorlage. Der Umfang der
 * Abwesenheit steht als Zahl in der Zelle, die Farbe ergänzt sie nur.
 */
function Wochenuebersicht() {
  const { zustand } = useVorschau();
  const [vergangeneAusblenden, setVergangeneAusblenden] = useState(true);

  const start = montagDerWoche(zustand.stichtag);
  const wochen = Array.from({ length: WOCHEN_VORAUS }, (_, index) =>
    plusTage(vergangeneAusblenden ? start : plusTage(start, -28), index * 7),
  );

  function ton(tage: number): string {
    if (tage >= 5) return 'bg-danger-soft text-danger';
    if (tage >= 3) return 'bg-warnung-soft text-warnung';
    if (tage >= 1) return 'bg-accent-soft text-accent';
    return 'bg-positiv-soft text-positiv';
  }

  return (
    <Klappbereich
      titel="Wochenübersicht – wer wann Urlaub hat"
      beschreibung="Zahl der genehmigten Urlaubswerktage je Woche."
      offen
    >
      <label className="text-ink-muted mb-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={vergangeneAusblenden}
          onChange={(event) => setVergangeneAusblenden(event.target.checked)}
          className="size-4"
        />
        Vergangene Wochen ausblenden
      </label>

      <div className="-mx-4 overflow-x-auto px-4">
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
                <th key={person.id} scope="col" className="text-ink-muted font-medium">
                  {person.name.split(' ')[0]}
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
                  const tage = urlaubstageInWoche(zustand.urlaub, person.id, montag);
                  return (
                    <td key={person.id} className="text-center">
                      <span
                        className={`inline-flex min-w-9 justify-center rounded px-2 py-1 text-xs ${ton(tage)}`}
                      >
                        {tage === 0 ? '–' : tage}
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
  const [tage, setTage] = useState('');
  const [grund, setGrund] = useState('');

  const berechnet = von && bis ? werktageImZeitraum(von, bis) : 0;
  const kollisionen =
    mitarbeiterId && von && bis
      ? ueberschneidungen(zustand.urlaub, mitarbeiterId, { von, bis })
      : [];
  const person = zustand.mitarbeitende.find((eintrag) => eintrag.id === mitarbeiterId);
  const konto = person ? urlaubskonto(person, zustand.urlaub, Number(von.slice(0, 4)) || 0) : null;
  const gueltig = mitarbeiterId !== '' && von !== '' && bis !== '' && bis >= von;

  function absenden() {
    const beantragteTage = Number(tage) || berechnet;
    const eintrag = simuliere(
      {
        bereich: 'Urlaub',
        vorgang: `Urlaub beantragt: ${mitarbeiterName(zustand, mitarbeiterId)}, ${formatDatum(von)} – ${formatDatum(bis)}`,
        folgen: [
          `${beantragteTage} Tage als beantragt vorgemerkt`,
          'Der Antrag steht in der Liste der offenen Anträge',
        ],
        nichtGeschehen: [
          'Keine Benachrichtigung an Leitung oder Teamleitung versendet',
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
      <VorschauBanner bereich="Urlaub" />

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
            Verbleibend {konto.rest} Tage (Anspruch {konto.anspruch} + Übertrag {konto.uebertrag},
            genehmigt {konto.genehmigt}).
          </p>
        ) : null}

        <Field
          label="Von"
          type="date"
          value={von}
          onChange={(event) => setVon(event.target.value)}
        />
        <Field
          label="Bis"
          type="date"
          value={bis}
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
          value={tage}
          onChange={(event) => setTage(event.target.value)}
        />

        {bis !== '' && von !== '' && bis < von ? (
          <p className="text-danger text-sm">Das Ende liegt vor dem Beginn.</p>
        ) : null}

        {kollisionen.length > 0 ? (
          <p className="text-warnung bg-warnung-soft rounded-lg px-3 py-2 text-sm">
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
        description={`${mitarbeiterName(zustand, antrag.mitarbeiterId)} · ${formatDatum(antrag.von)} – ${formatDatum(antrag.bis)} · ${antrag.tage} Tage`}
      />

      <VorschauBanner bereich="Urlaub" />

      <div className="flex max-w-xl flex-col gap-4">
        {konto ? (
          <p className="text-ink-muted text-sm">
            Nach dieser Entscheidung verbleiben rechnerisch{' '}
            {art === 'genehmigen' ? konto.rest - antrag.tage : konto.rest} von{' '}
            {konto.anspruch + konto.uebertrag} Tagen.
          </p>
        ) : null}

        {zeitgleich.length > 0 ? (
          <p className="text-warnung bg-warnung-soft rounded-lg px-3 py-2 text-sm">
            Zeitgleich bereits abwesend:{' '}
            {zeitgleich
              .map((eintrag) => mitarbeiterName(zustand, eintrag.mitarbeiterId))
              .join(', ')}
          </p>
        ) : null}

        {art === 'genehmigen' ? (
          <p className="text-ink-muted rounded-lg border border-dashed px-3 py-2 text-sm">
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
          <SignaturFeld
            beschriftung="Bestätigung der Genehmigung"
            unterschrieben={unterschrieben}
            onChange={setUnterschrieben}
          />
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
