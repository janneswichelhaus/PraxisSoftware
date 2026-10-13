import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { Objektkopf, Warnzeile } from '@/components/ui/Objektkopf';
import { Feldgruppe, Section } from '@/components/ui/Section';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { roleLabels } from '@/components/ui/roleLabels';
import { isOwner, type CurrentUser } from '@/features/session/types';
import {
  depotName,
  meldungImVerlauf,
  mitarbeiterName,
  useVorschau,
} from '@/features/preview/vorschauContext';
import { formatZeitpunkt } from '@/features/preview/format';
import { vorschauId } from '@/features/preview/vorschauZustand';
import {
  radstatusLabels,
  wochentage,
  wochentagLabels,
  type Belegung,
  type Rad,
  type Radstatus,
} from '@/features/preview/types';

/**
 * Rad anlegen und bearbeiten.
 *
 * Felder und Reihenfolge folgen der Team-App-Vorlage. Zwei Unterschiede:
 * Stammnutzer:in und aktuelle:r Nutzer:in sind Auswahllisten aus dem
 * gemeinsamen Mitarbeiterstamm statt Freitext - Tippfehler ordnen sonst ein
 * Rad einer nicht existierenden Person zu. Und der Schlüsselcode ist an die
 * administrative Praxisrolle gebunden statt an eine PIN im Browser.
 *
 * Nach dem Speichern und nach dem Entfernen geht es zurück in die Radflotte,
 * und die Zustandsmeldung reist mit (VOR-01): Bis dahin stand dort keine, und
 * ein geändertes oder verschwundenes Rad sah aus wie ein echter Vorgang.
 *
 * **Seit Welle B (B7) die Seite des Rads** (DESIGN.md „Objekt“): Objektkopf
 * mit Panne und Check-Up, die Angaben als Formular mit Formularfuss, darunter
 * die Verläufe, die bis dahin auf der Karte in der Liste standen, und leise
 * am Ende „Rad entfernen“. Fachlich ändert sich nichts; die Verläufe zeigen
 * den gespeicherten Stand.
 */

const AKKUTYPEN = ['Akku Typ A', 'Akku Typ B'];

const ZUR_FLOTTE = '/betrieb/flotte';

function leeresRad(depotId: string): Rad {
  return {
    id: vorschauId('rad'),
    name: '',
    stammdepotId: depotId,
    depotId,
    sonderstandort: '',
    ersatzrad: false,
    stammnutzerId: null,
    status: 'verfuegbar',
    aktuellerNutzerId: null,
    akku: '',
    schluesselcode: '',
    wochenplan: {
      mo: 'frei',
      di: 'frei',
      mi: 'frei',
      do: 'frei',
      fr: 'frei',
      sa: 'frei',
      so: 'frei',
    },
    notiz: '',
    schluesselInhaber: null,
    schluesselSeit: null,
    schluesselverlauf: [],
    pannenverlauf: [],
    checkups: [],
  };
}

export function BikeEditPage({ user }: { user: CurrentUser }) {
  const { radId } = useParams();
  const navigate = useNavigate();
  const { zustand, simuliere } = useVorschau();
  const neuAnlegen = radId === 'neu';
  const vorhanden = zustand.raeder.find((rad) => rad.id === radId);

  const [entwurf, setEntwurf] = useState<Rad>(
    () => vorhanden ?? leeresRad(zustand.depots[0]?.id ?? 'd1'),
  );

  if (!neuAnlegen && !vorhanden) {
    return (
      <>
        {/* Auch aus dem Fehler führt ein Weg zurück (VOR-21). */}
        <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
        <PageHeader title="Rad bearbeiten" />
        <ErrorState
          title="Dieses Rad gibt es in der Vorschau nicht."
          description="Der Vorschaustand wird bei jedem Neuladen zurückgesetzt. Bitte das Rad in der Radflotte neu wählen."
        />
      </>
    );
  }

  function aendere<K extends keyof Rad>(feld: K, wert: Rad[K]) {
    setEntwurf((aktuell) => ({ ...aktuell, [feld]: wert }));
  }

  function speichern() {
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: neuAnlegen
          ? `Rad angelegt: ${entwurf.name || 'ohne Namen'}`
          : `Rad geändert: ${entwurf.name}`,
        folgen: [
          'Angaben im Vorschaustand dieser Sitzung übernommen',
          entwurf.status === 'reparatur'
            ? 'Das Rad steht in der Vorschau nicht für die Planung zur Verfügung'
            : 'Das Rad steht in der Vorschau für die Planung zur Verfügung',
        ],
        nichtGeschehen: [
          'Nichts gespeichert – ein Neuladen stellt die Ausgangsdaten wieder her',
          'Keine Benachrichtigung an das Team',
        ],
      },
      (stand) => ({
        ...stand,
        raeder: neuAnlegen
          ? [...stand.raeder, entwurf]
          : stand.raeder.map((rad) => (rad.id === entwurf.id ? entwurf : rad)),
      }),
    );
    void navigate(ZUR_FLOTTE, { state: meldungImVerlauf(eintrag) });
  }

  function loeschen() {
    const eintrag = simuliere(
      {
        bereich: 'Radflotte',
        vorgang: `Rad entfernt: ${entwurf.name}`,
        folgen: ['Aus der Vorschauliste entfernt'],
        nichtGeschehen: [
          'Nichts gelöscht – in einer echten Anbindung wäre das ein prüfpflichtiger Vorgang',
        ],
      },
      (stand) => ({ ...stand, raeder: stand.raeder.filter((rad) => rad.id !== entwurf.id) }),
    );
    void navigate(ZUR_FLOTTE, { state: meldungImVerlauf(eintrag) });
  }

  const sonderstandort = entwurf.depotId === 'd3';

  return (
    <>
      {vorhanden && !neuAnlegen ? (
        <>
          {/* Ab 640 px als Zeile über dem Kopf, darunter als Pfeil vor dem
              Namen (Objektkopf, RAH-007). */}
          <Rueckweg
            standard={ZUR_FLOTTE}
            beschriftung="Zurück zur Radflotte"
            className="mb-3 max-sm:hidden"
          />
          <Radkopf rad={vorhanden} />
        </>
      ) : (
        <>
          <Rueckweg standard={ZUR_FLOTTE} beschriftung="Zurück zur Radflotte" />
          <PageHeader title="Rad hinzufügen" />
        </>
      )}

      <div className={`max-w-formular ${neuAnlegen ? '' : 'mt-6'}`.trim()}>
        <Section titel="Angaben">
          <Feldgruppe>
            <Field
              label="Name / Kennzeichnung"
              placeholder="z. B. Lastenrad 9"
              value={entwurf.name}
              onChange={(event) => aendere('name', event.target.value)}
            />

            <Select
              label="Stammdepot"
              hint="Wo das Rad eigentlich hingehört."
              value={entwurf.stammdepotId}
              onChange={(event) => aendere('stammdepotId', event.target.value)}
            >
              {zustand.depots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </Select>

            <Select
              label="Aktueller Standort"
              hint="Wo das Rad gerade wirklich steht."
              value={entwurf.depotId}
              onChange={(event) => aendere('depotId', event.target.value)}
            >
              {zustand.depots.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </Select>

            {sonderstandort ? (
              <Field
                label="Bezeichnung des Sonderstandorts"
                placeholder="z. B. Privatgarage Teamleitung"
                value={entwurf.sonderstandort}
                onChange={(event) => aendere('sonderstandort', event.target.value)}
              />
            ) : null}

            {/* Das Kästchen des Systems (VOR-12, wo die Bedienung leidet): Das
            eigene maß samt Beschriftung 23 px Höhe. */}
            <Checkbox
              label="Dies ist das Ersatzrad (keine feste Stammnutzer:in)"
              checked={entwurf.ersatzrad}
              onChange={(event) => aendere('ersatzrad', event.target.checked)}
            />

            {!entwurf.ersatzrad ? (
              <Select
                label="Stammnutzer:in"
                value={entwurf.stammnutzerId ?? ''}
                onChange={(event) => aendere('stammnutzerId', event.target.value || null)}
              >
                <option value="">– keine Stammnutzer:in –</option>
                {zustand.mitarbeitende.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </Select>
            ) : null}

            <Select
              label="Status"
              value={entwurf.status}
              onChange={(event) => aendere('status', event.target.value as Radstatus)}
            >
              {(Object.keys(radstatusLabels) as Radstatus[]).map((status) => (
                <option key={status} value={status}>
                  {radstatusLabels[status]}
                </option>
              ))}
            </Select>

            <Select
              label="Aktuell gefahren von"
              hint="Nur ausfüllen, wenn jemand anderes als die Stammnutzer:in fährt."
              value={entwurf.aktuellerNutzerId ?? ''}
              onChange={(event) => aendere('aktuellerNutzerId', event.target.value || null)}
            >
              <option value="">– Stammnutzer:in fährt –</option>
              {zustand.mitarbeitende.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>

            <Select
              label="Akku-Typ"
              value={entwurf.akku}
              onChange={(event) => aendere('akku', event.target.value)}
            >
              <option value="">– auswählen –</option>
              {AKKUTYPEN.map((typ) => (
                <option key={typ} value={typ}>
                  {typ}
                </option>
              ))}
            </Select>

            {isOwner(user.roles) ? (
              <Field
                label="Schlüsselcode"
                hint={`Für die Nachbestellung eines Ersatzschlüssels. Nur für ${roleLabels.owner} sichtbar.`}
                value={entwurf.schluesselcode}
                onChange={(event) => aendere('schluesselcode', event.target.value)}
              />
            ) : null}

            {/* Ohne Rahmen um die Gruppe (Formular, Leitfaden L2); der Satz bleibt,
            weil er sagt, was „Frei“ bei der Eingabe bedeutet. */}
            <fieldset>
              <legend className="text-ink mb-1 text-sm font-medium">Wochenplan</legend>
              <p className="text-ink-muted mb-3 text-sm">„Frei“ heißt: für andere planbar.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {wochentage.map((tag) => (
                  <Select
                    key={tag}
                    label={wochentagLabels[tag]}
                    value={entwurf.wochenplan[tag]}
                    onChange={(event) =>
                      aendere('wochenplan', {
                        ...entwurf.wochenplan,
                        [tag]: event.target.value as Belegung,
                      })
                    }
                  >
                    <option value="frei">Frei</option>
                    <option value="belegt">Belegt</option>
                  </Select>
                ))}
              </div>
            </fieldset>

            <TextArea
              rows={3}
              label="Notiz"
              placeholder="z. B. Reparaturdetails, Ort des Schlüssels"
              value={entwurf.notiz}
              onChange={(event) => aendere('notiz', event.target.value)}
            />
          </Feldgruppe>
        </Section>

        {/* Hauptknopf zuerst, Abbrechen leise (Formularfuss). */}
        <Formularfuss>
          <Button onClick={speichern} disabled={entwurf.name.trim() === ''}>
            In die Vorschau übernehmen
          </Button>
          <ButtonLink to={ZUR_FLOTTE} variant="quiet">
            Abbrechen
          </ButtonLink>
        </Formularfuss>
      </div>

      {vorhanden && !neuAnlegen ? (
        <Verlaeufe rad={vorhanden} zeitzone={user.organizationTimeZone} />
      ) : null}

      {/* Entfernen leise am Ende und nur nach Rückfrage (VOR-10; DESIGN.md
          Zerstörendes): Bei 390 px stand es 12 px über „In die Vorschau
          übernehmen" und wirkte mit einem Tipp. */}
      {!neuAnlegen ? (
        <div className="border-line max-w-formular mt-8 border-t pt-6">
          <Rueckfrage
            ausloeser="Rad entfernen"
            ausloeserVariante="quiet"
            bestaetigen="Ja, Rad entfernen"
            onBestaetigen={loeschen}
          >
            <p>
              {entwurf.name || 'Das Rad'} verschwindet aus der Radflotte dieser Vorschau. Gelöscht
              wird nichts – ein Neuladen stellt das Rad wieder her.
            </p>
          </Rueckfrage>
        </div>
      ) : null}
    </>
  );
}

/**
 * Der Kopf des Rads: Name, Standort und Stammnutzer:in, „In Reparatur“ als
 * Ausnahme, Panne und Check-Up für genau dieses Rad (bis Welle B Knöpfe auf
 * der Karte in der Liste) und die Warnung, wenn es nicht im Stammdepot steht.
 * Zeigt den gespeicherten Stand, nicht den Entwurf.
 */
function Radkopf({ rad }: { rad: Rad }) {
  const { zustand } = useVorschau();
  const stammnutzer = rad.ersatzrad
    ? 'Ersatzrad'
    : rad.stammnutzerId
      ? mitarbeiterName(zustand, rad.stammnutzerId)
      : '';
  return (
    <Objektkopf
      titel={rad.name}
      rueckweg={{ to: ZUR_FLOTTE, beschriftung: 'Zurück zur Radflotte' }}
      meta={[depotName(zustand, rad, 'aktuell'), stammnutzer].filter(Boolean).join(' · ')}
      status={
        rad.status === 'reparatur' ? (
          <Badge ton="kritisch">{radstatusLabels[rad.status]}</Badge>
        ) : null
      }
      aktionen={
        <>
          <ButtonLink to={`/betrieb/flotte/panne?rad=${rad.id}`} variant="secondary">
            Panne melden
          </ButtonLink>
          <ButtonLink to={`/betrieb/flotte/checkup?rad=${rad.id}`} variant="secondary">
            Check-Up
          </ButtonLink>
        </>
      }
      hinweise={
        rad.depotId !== rad.stammdepotId ? (
          <Warnzeile>
            Steht nicht im Stammdepot. Gehört zu {depotName(zustand, rad, 'stamm')}.
          </Warnzeile>
        ) : null
      }
    />
  );
}

/**
 * Schlüssel-, Pannen- und Check-Up-Verlauf des Rads, je die letzten drei,
 * zugeklappt (bis Welle B auf der Karte in der Liste). Ohne Verlauf kein
 * Abschnitt.
 */
function Verlaeufe({ rad, zeitzone }: { rad: Rad; zeitzone: string | null }) {
  if (
    rad.schluesselverlauf.length === 0 &&
    rad.pannenverlauf.length === 0 &&
    rad.checkups.length === 0
  ) {
    return null;
  }
  return (
    <div className="max-w-formular mt-8">
      <Section titel="Verlauf">
        {rad.schluesselverlauf.length > 0 ? (
          <Disclosure summary={`Schlüsselverlauf (${rad.schluesselverlauf.length})`}>
            <ul className="text-ink-muted space-y-1 text-sm">
              {rad.schluesselverlauf
                .slice(-3)
                .reverse()
                .map((vorgang) => (
                  <li key={vorgang.id}>
                    {vorgang.inhaber} – {formatZeitpunkt(vorgang.entnommen, zeitzone)}
                    {vorgang.zurueckgelegt
                      ? ` bis ${formatZeitpunkt(vorgang.zurueckgelegt, zeitzone)}`
                      : ' (noch entnommen)'}
                  </li>
                ))}
            </ul>
          </Disclosure>
        ) : null}

        {rad.pannenverlauf.length > 0 ? (
          <Disclosure summary={`Pannenverlauf (${rad.pannenverlauf.length})`}>
            <ul className="text-ink-muted space-y-2 text-sm">
              {rad.pannenverlauf
                .slice(-3)
                .reverse()
                .map((meldung) => (
                  <li key={meldung.id}>
                    <span className="text-ink-muted block text-xs">
                      {formatZeitpunkt(meldung.zeitpunkt, zeitzone)}
                      {meldung.gesperrt ? ' · Rad gesperrt' : ' · ohne Sperre'}
                    </span>
                    {meldung.text}
                  </li>
                ))}
            </ul>
          </Disclosure>
        ) : null}

        {rad.checkups.length > 0 ? (
          <Disclosure summary={`Check-Up-Verlauf (${rad.checkups.length})`}>
            <ul className="space-y-2 text-sm">
              {rad.checkups
                .slice(-3)
                .reverse()
                .map((checkup) => {
                  const probleme = checkup.befunde.filter(
                    (befund) => befund.bewertung === 'problem',
                  );
                  const beobachten = checkup.befunde.filter(
                    (befund) => befund.bewertung === 'beobachten',
                  );
                  return (
                    <li key={checkup.id}>
                      <span className="text-ink-muted block text-xs">
                        {formatZeitpunkt(checkup.zeitpunkt, zeitzone)} · {checkup.geprueftVon}
                      </span>
                      {probleme.length > 0 ? (
                        <span className="text-danger block">
                          Problem: {probleme.map((befund) => befund.frage).join(', ')}
                        </span>
                      ) : null}
                      {beobachten.length > 0 ? (
                        <span className="text-warnung block">
                          Beobachten: {beobachten.map((befund) => befund.frage).join(', ')}
                        </span>
                      ) : null}
                      {probleme.length === 0 && beobachten.length === 0 ? (
                        <span className="text-positiv block">Alles in Ordnung</span>
                      ) : null}
                      {checkup.notiz ? (
                        <span className="text-ink-muted block">Notiz: {checkup.notiz}</span>
                      ) : null}
                      {checkup.fotos > 0 ? (
                        <span className="text-ink-muted block text-xs">
                          {checkup.fotos} Foto{checkup.fotos === 1 ? '' : 's'} angehängt (bleibt in
                          dieser Sitzung)
                        </span>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </Disclosure>
        ) : null}
      </Section>
    </div>
  );
}
