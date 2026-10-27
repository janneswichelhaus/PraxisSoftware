import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Section } from '@/components/ui/Section';
import { Badge } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Card';
import { Datenliste, type Datenspalte } from '@/components/ui/Datenliste';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Textlink } from '@/components/ui/Textlink';
import { paragraf } from '@/lib/begriffe';
import {
  ANKER_TEXTE,
  DATENKLASSEN,
  GRUNDLAGE_TEXTE,
  LOESCHWEG_TEXTE,
  OBERGRENZE_TEXTE,
  fristText,
} from './klassen';
import {
  fetchDeletionRuns,
  fetchLegalHolds,
  fetchRetentionSchedule,
  formatZeitpunkt,
  type Datenklasse,
  type Loeschlauf,
} from './api';
import {
  useDateiabgleich,
  useLoeschauftraege,
  useLoeschauftraegeAusfuehren,
  useVerwaisteVormerken,
} from '@/features/patients/files/dateien';
import { aktenortDerDatei } from '@/features/patients/files/dokumentarten';
import type { CurrentUser } from '@/features/core/session/types';

/**
 * Aufbewahrung und Löschung (LOE-002b).
 *
 * Die Seite beantwortet drei Fragen, die vor dem Produktivstart schriftlich
 * beantwortet sein müssen (ADR-007, Löschkonzept im DSFA-Paket): Was wird wie
 * lange aufbewahrt? Was ist gerade von der Löschung ausgenommen? Und was wurde
 * tatsächlich gelöscht?
 *
 * Sie ist eine reine Lesesicht. Eine Frist ändert sich über eine Migration,
 * nicht über einen Klick — nur so bleibt die Änderung nachvollziehbar
 * (ADR-008, ADR-013). Sichtbar ist sie nur für `owner`; die Rollenprüfung
 * steuert hier die Darstellung, verbindlich sind die Serverfunktionen
 * (ADR-004).
 *
 * UXR-011 ändert nur die Darstellung: Frist, Löschweg, Aufträge und Abgleich
 * laufen unverändert über dieselben Funktionen.
 *
 * **Für die Praxisleitung im Alltag, der Nachweis als Zusatz (UX-009b,
 * BEF-065, Entscheidung Jannes 2026-10-09).** Oben steht, was zu tun ist:
 * offene Löschaufträge und der Abgleich der Dateiablage - und wenn beides
 * leer ist, eine Zeile. Danach Löschsperren, Plan und Journal. Eine Frist auf
 * Annahme heißt „Annahme – Prüfung offen“, die Kennung steht daneben; die
 * Verweise auf ADRs liegen in der aufklappbaren Zeile „Grundlagen“ am Ende.
 *
 * **Liste und Detail (Welle B, B7).** Der Plan stand als 26 Karten
 * untereinander, am Telefon rund 10 000 px. Jetzt ist er eine Zeilenliste -
 * Datenklasse, Frist, ab wann - und eine Zeile öffnet die Klasse
 * (`?klasse=…`, dieselbe Route) mit Umfang, Grundlage, Obergrenze und den
 * betroffenen Tabellen. Inhalt und Wortlaut der Regeln sind unverändert;
 * die erklärenden Sätze unter den Abschnitten stehen jetzt unter
 * „Grundlagen“.
 */

/** Der nächste Schritt nach einem Ladefehler (WRT-01). */
const ERNEUT_LADEN = 'Bitte die Verbindung prüfen und später erneut versuchen.';

/** Die Adresse der Seite; eine Datenklasse öffnet sich mit `?klasse=…`. */
const SEITE = '/praxis/sicherheit/aufbewahrung';
const KLASSE_PARAM = 'klasse';

/**
 * So viele Einträge holt `fetchDeletionRuns` (`p_limit` in `api.ts`). Die
 * Seite sagt es, statt eine gekürzte Liste als vollständigen Nachweis
 * auszugeben (ORG-22).
 */
const JOURNAL_EINTRAEGE = 50;

function klasseTexte(key: string) {
  return DATENKLASSEN[key] ?? { label: key, beschreibung: '' };
}

/** Frist und Anker als eine Zeile: „10 Jahre · ab Abschluss der Versorgung“. */
function Fristzeile({ klasse }: { klasse: Datenklasse }) {
  if (klasse.retention_interval === null) return <span>Keine automatische Löschung</span>;
  return (
    <>
      <span>{fristText(klasse.retention_interval)}</span>
      {' · '}
      <span>{ANKER_TEXTE[klasse.anchor] ?? klasse.anchor}</span>
    </>
  );
}

/** Das Abzeichen einer Frist auf Annahme (BEF-065): das Wort für die Praxisleitung. */
function Annahme() {
  return <Badge ton="warnung">Annahme – Prüfung offen</Badge>;
}

function Aufbewahrungsplan() {
  const abfrage = useQuery({
    queryKey: ['retention', 'schedule'],
    queryFn: fetchRetentionSchedule,
  });

  return (
    <Section titel="Aufbewahrungsplan">
      <Abfragezustand
        abfrage={abfrage}
        laden="Aufbewahrungsplan wird geladen …"
        fehler="Der Aufbewahrungsplan konnte nicht geladen werden."
        inKarte
      >
        {(daten) => (
          // Eine Zeile je Art von Daten; die Zeile öffnet die Klasse.
          <ListRows>
            {daten.map((klasse) => (
              <ListRow
                key={klasse.key}
                to={`${SEITE}?${KLASSE_PARAM}=${encodeURIComponent(klasse.key)}`}
                titel={klasseTexte(klasse.key).label}
                // Das Abzeichen unter der Frist statt rechts daneben: rechts
                // ließ es dem Namen am Telefon ein Drittel der Zeile.
                meta={
                  <>
                    <Fristzeile klasse={klasse} />
                    {klasse.assumption_key ? (
                      <span className="mt-1.5 block">
                        <Annahme />
                      </span>
                    ) : null}
                  </>
                }
              />
            ))}
          </ListRows>
        )}
      </Abfragezustand>
    </Section>
  );
}

/**
 * Eine Datenklasse im Detail: Umfang, Frist, Obergrenze, Grundlage und die
 * Tabellen, die sie trägt (Welle B, B7). Dieselben Angaben, die bis dahin
 * auf der Karte im Plan standen.
 */
function Klassendetail({ schluessel }: { schluessel: string }) {
  const abfrage = useQuery({
    queryKey: ['retention', 'schedule'],
    queryFn: fetchRetentionSchedule,
  });
  const klasse = abfrage.data?.find((eintrag) => eintrag.key === schluessel);
  const texte = klasseTexte(schluessel);

  return (
    <>
      <Rueckweg standard={SEITE} beschriftung="Zurück zum Aufbewahrungsplan" />
      <PageHeader
        kicker="Datenklasse"
        title={klasse ? texte.label : 'Datenklasse'}
        description={
          klasse?.assumption_key ? (
            // BEF-065: das Wort für die Praxisleitung, die Kennung für die
            // Prüfung daneben.
            <span className="flex flex-wrap items-center gap-1.5">
              <Annahme />
              <span>{klasse.assumption_key}</span>
            </span>
          ) : undefined
        }
      />
      <Abfragezustand
        abfrage={abfrage}
        laden="Aufbewahrungsplan wird geladen …"
        fehler="Der Aufbewahrungsplan konnte nicht geladen werden."
        inKarte
      >
        {() =>
          klasse ? (
            <div className="lg:max-w-spalte">
              <Section titel="Frist" rahmen>
                <DetailList>
                  {texte.beschreibung ? (
                    <DetailRow label="Umfasst">{texte.beschreibung}</DetailRow>
                  ) : null}
                  <DetailRow label="Frist">
                    {klasse.retention_interval === null
                      ? 'Keine automatische Löschung'
                      : fristText(klasse.retention_interval)}
                  </DetailRow>
                  <DetailRow label="Gerechnet">
                    {ANKER_TEXTE[klasse.anchor] ?? klasse.anchor}
                  </DetailRow>
                  {klasse.upper_bound_anchor && klasse.upper_bound_interval ? (
                    <DetailRow label="Spätestens">
                      {fristText(klasse.upper_bound_interval)}{' '}
                      {OBERGRENZE_TEXTE[klasse.upper_bound_anchor] ?? klasse.upper_bound_anchor}
                    </DetailRow>
                  ) : null}
                  <DetailRow label="Grundlage">
                    {paragraf(klasse.legal_reference) ||
                      GRUNDLAGE_TEXTE[klasse.basis] ||
                      klasse.basis}
                  </DetailRow>
                </DetailList>
              </Section>

              {/* Für die Datenschutzprüfung: welche Tabellen diese Klasse
                  trägt. Tabellennamen sind technische Bezeichner und stehen
                  deshalb unübersetzt - übersetzt wäre die Zuordnung nicht mehr
                  nachprüfbar. Seltenes, deshalb zugeklappt. */}
              <div className="mt-8">
                <Disclosure summary={`Betroffene Tabellen (${klasse.tabellen.length})`}>
                  <ul className="text-ink-muted space-y-1 text-sm">
                    {klasse.tabellen.map((tabelle) => (
                      <li key={tabelle.name}>
                        <code className="text-ink text-[0.8125rem]">{tabelle.name}</code>
                        {' – '}
                        {LOESCHWEG_TEXTE[tabelle.modus] ?? tabelle.modus}
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              </div>
            </div>
          ) : (
            <ErrorState
              title="Diese Datenklasse gibt es im Aufbewahrungsplan nicht."
              description="Bitte im Aufbewahrungsplan neu wählen."
            />
          )
        }
      </Abfragezustand>
    </>
  );
}

/**
 * Worauf eine Sperre wirkt: eine Akte (ANN-033) oder die Beschäftigtendaten
 * einer Person des Teams (BEF-178, ANN-674). Ohne die Angabe wären eine
 * Patientin und eine Kollegin gleichen Namens in der Liste nicht zu trennen.
 */
function sperrgegenstand(subjectType: string): string {
  return subjectType === 'staff_member' ? 'Beschäftigtendaten' : 'Akte';
}

function Loeschsperren() {
  const abfrage = useQuery({
    queryKey: ['retention', 'legal-holds'],
    queryFn: fetchLegalHolds,
  });

  return (
    <Section titel="Löschsperren">
      <Abfragezustand
        abfrage={abfrage}
        laden="Löschsperren werden geladen …"
        fehler="Die Löschsperren konnten nicht geladen werden."
        inKarte
        // Ein Leerzustand in der Karte, ohne Erklärsatz - was eine Sperre
        // bewirkt, steht unter „Grundlagen“.
        leer={{ wenn: (daten) => daten.length === 0, titel: 'Keine laufende Löschsperre' }}
      >
        {(daten) => (
          <ListRows>
            {daten.map((sperre) => (
              <ListRow
                key={sperre.id}
                titel={sperre.subject_name ?? sperrgegenstand(sperre.subject_type)}
                meta={
                  <>
                    <span className="block">{sperre.reason}</span>
                    <span className="block">
                      {sperrgegenstand(sperre.subject_type)} · seit{' '}
                      {formatZeitpunkt(sperre.placed_at)} · gesetzt von{' '}
                      <span>{sperre.placed_by_name ?? 'Unbekannt'}</span>
                    </span>
                  </>
                }
                status={<Badge ton="warnung">Gesperrt</Badge>}
              />
            ))}
          </ListRows>
        )}
      </Abfragezustand>
    </Section>
  );
}

/**
 * Die Spalten des Löschjournals als `Datenliste` (Welle B): Spalten erst ab
 * 1024 px (ORG-12), darunter Zeilen; jede Angabe trägt ihre Bezeichnung für
 * Vorlesesoftware (UIK-24), der Zeitpunkt als Kopf der Zeile bringt sie
 * selbst mit.
 */
const JOURNALSPALTEN: readonly Datenspalte<Loeschlauf>[] = [
  {
    titel: 'Zeitpunkt',
    breite: '11rem',
    telefon: 'kopf',
    inhalt: (lauf) => (
      <span className="text-ink-muted tabular-nums">
        <span className="sr-only">Zeitpunkt: </span>
        {formatZeitpunkt(lauf.deleted_at)}
      </span>
    ),
  },
  {
    titel: 'Datenklasse',
    inhalt: (lauf) => (
      <span className="text-liste block min-w-0 wrap-anywhere">
        {klasseTexte(lauf.retention_class).label}
        <span className="text-ink-muted">
          {' · '}
          <code className="text-[0.8125rem]">{lauf.target_table}</code>
        </span>
      </span>
    ),
  },
  {
    titel: 'Anzahl',
    breite: '8rem',
    telefon: 'ende',
    rechts: true,
    inhalt: (lauf) => (
      <span className="text-ink-muted text-sm font-normal">
        {lauf.record_count} {lauf.record_count === 1 ? 'Datensatz' : 'Datensätze'}
      </span>
    ),
  },
];

function Loeschjournal() {
  const abfrage = useQuery({
    queryKey: ['retention', 'runs'],
    queryFn: fetchDeletionRuns,
  });

  return (
    <Section titel="Löschjournal">
      <Abfragezustand
        abfrage={abfrage}
        laden="Löschjournal wird geladen …"
        fehler="Das Löschjournal konnte nicht geladen werden."
        inKarte
        leer={{ wenn: (daten) => daten.length === 0, titel: 'Es wurde noch nichts gelöscht' }}
      >
        {(daten) => (
          <>
            <Datenliste
              spalten={JOURNALSPALTEN}
              zeilen={daten}
              schluessel={(lauf) => `${lauf.run_id}-${lauf.retention_class}-${lauf.target_table}`}
              beschriftung="Löschjournal"
            />
            {daten.length >= JOURNAL_EINTRAEGE ? (
              <Statusmeldung className="mt-3">
                Angezeigt werden die letzten {JOURNAL_EINTRAEGE} Einträge; ältere bleiben im Journal
                erhalten.
              </Statusmeldung>
            ) : null}
          </>
        )}
      </Abfragezustand>
    </Section>
  );
}

/**
 * Offene Löschaufträge für den Objektspeicher (DAT-002, ADR-017 Punkt 25).
 *
 * Der Gegenpol zum Löschjournal: Dort steht, welche Zeile weg ist, hier,
 * welches Objekt noch nicht. Ein Auftrag entsteht automatisch, sobald eine
 * Dateizeile fällt — durch den Löschlauf, durch eine gelöschte Verordnung
 * oder von Hand. Ausführen kann ihn nur ein angemeldeter Vorgang, weil eine
 * Datenbankfunktion kein Objekt löschen kann und eine Edge Function für
 * produktive Gesundheitsdaten nicht freigegeben ist (ADR-015 Punkt 20).
 *
 * **Die Quittung wird verdient, nicht behauptet.** Der Server prüft nach dem
 * Entfernen selbst, dass das Objekt weg ist; sonst bleibt der Auftrag offen.
 * Deshalb kann hier nichts als „erledigt" dastehen, was es nicht ist.
 *
 * **Endgültig erst nach Rückfrage (ORG-21, ZST-14).** Das Ausführen entfernt
 * alle offenen Objekte unwiederbringlich; ein Fehlgriff beim Scrollen am
 * Telefon genügte bis UXR-011. Die Löschung an der Datei ist zwar schon
 * bestätigt, sie kann aber Wochen zurückliegen und von einer anderen Person
 * stammen. Der Vorgang selbst bleibt derselbe.
 */
function Loeschauftraege({
  user,
  ausfuehren,
}: {
  user: CurrentUser;
  ausfuehren: ReturnType<typeof useLoeschauftraegeAusfuehren>;
}) {
  const queryClient = useQueryClient();
  const { auftraege, isPending, isError, verborgen } = useLoeschauftraege(user);

  if (verborgen) return null;
  if (isPending) return <LoadingState label="Löschaufträge werden geladen …" />;
  if (isError) {
    return (
      <ErrorState
        title="Die offenen Löschaufträge konnten nicht geladen werden."
        description={ERNEUT_LADEN}
        onErneut={() =>
          void queryClient.invalidateQueries({ queryKey: ['storage-deletion-orders'] })
        }
      />
    );
  }

  if (auftraege.length === 0) {
    return (
      <EmptyState
        title="Nichts offen"
        description="Zu jeder gelöschten Datei ist auch die abgelegte Fassung entfernt und quittiert."
      />
    );
  }

  const ergebnis = ausfuehren.data;
  const anzahl = auftraege.length;

  return (
    <>
      <Statusmeldung ton="warnung">
        {anzahl === 1
          ? 'Eine Datei ist aus der Akte entfernt, liegt aber noch in der Ablage.'
          : `${anzahl} Dateien sind aus der Akte entfernt, liegen aber noch in der Ablage.`}{' '}
        Erst das Ausführen schließt die Löschung ab.
      </Statusmeldung>

      <ListRows rahmen={false} className="mt-2">
        {auftraege.map((auftrag) => (
          <ListRow
            key={auftrag.id}
            titel={`Ablage „${auftrag.bucket_id}“`}
            meta={
              <>
                Beauftragt {formatZeitpunkt(auftrag.ordered_at)} ·{' '}
                {auftrag.object_present
                  ? 'Datei liegt noch in der Ablage'
                  : 'Datei ist bereits weg, nur die Quittung fehlt'}
              </>
            }
          />
        ))}
      </ListRows>

      <div className="mt-4">
        <Rueckfrage
          ausloeser={`Alle ${anzahl} ausführen und quittieren`}
          ausloeserVariante="primary"
          bestaetigen="Endgültig entfernen"
          bestaetigenLaeuft="Wird ausgeführt …"
          laeuft={ausfuehren.isPending}
          onBestaetigen={() => ausfuehren.mutateAsync(auftraege)}
          onAbbrechen={() => ausfuehren.reset()}
        >
          <p>
            {anzahl === 1
              ? 'Eine Datei endgültig aus der Ablage entfernen?'
              : `${anzahl} Dateien endgültig aus der Ablage entfernen?`}{' '}
            Rückgängig machen lässt sich das nicht.
          </p>
        </Rueckfrage>
      </div>

      {ergebnis && ergebnis.fehler.length > 0 ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {ergebnis.erledigt} erledigt, {ergebnis.fehler.length} offen geblieben:{' '}
          {ergebnis.fehler[0]}
        </Statusmeldung>
      ) : null}
      {ergebnis && ergebnis.fehler.length === 0 && ergebnis.erledigt > 0 ? (
        <Statusmeldung ton="erfolg" className="mt-2">
          {ergebnis.erledigt} Löschung{ergebnis.erledigt === 1 ? '' : 'en'} abgeschlossen und
          quittiert.
        </Statusmeldung>
      ) : null}
      {ausfuehren.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {ausfuehren.error.message}
        </Statusmeldung>
      ) : null}
    </>
  );
}

/**
 * Abgleich zwischen Datenbank und Ablage (DAT-003, ADR-017 Punkt 27).
 *
 * Zwei Zustände, die es nicht geben darf, und beide sind hier keine Statistik,
 * sondern eine Arbeitsaufgabe:
 *
 *   * **Eine Datei ohne Objekt** ist ein Verlust. Sie steht mit Akte und Namen
 *     da, damit jemand nachsehen kann — eine Zahl allein wäre unbrauchbar.
 *     An der einzelnen Datei meldet die Akte denselben Befund (§13).
 *   * **Ein Objekt ohne Datei** ist Abfall. Es wird über denselben Löschweg
 *     entfernt wie alles andere, mit Auftrag und Quittung — nicht über eine
 *     zweite, stille Abkürzung.
 *
 * Der Abgleich läuft nicht von allein: Er wird gerechnet, wenn diese Seite
 * geöffnet wird. Die Anwendung verschickt nichts (CAL-013), und einen
 * Meldeweg zu bauen wäre ein eigener Auftrag. Deshalb gehört der Blick hierher
 * bei Anlass hierher (ADR-010 Punkt 19).
 *
 * **Deckungsgleich erst nach den Aufträgen (ORG-22).** Vorgemerkte Objekte
 * zählt der Abgleich nicht mehr mit, sie liegen aber noch in der Ablage. Bis
 * UXR-011 sprang der Abschnitt nach „Zur Löschung vormerken" auf
 * „deckungsgleich". Solange Aufträge offen sind, sagt er, was noch fehlt.
 */
function Dateiabgleich({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const { fehlende, verwaiste, isPending, isError, verborgen } = useDateiabgleich(user);
  const offen = useLoeschauftraege(user);
  const vormerken = useVerwaisteVormerken();

  if (verborgen) return null;
  if (isPending) return <LoadingState label="Abgleich wird gerechnet …" />;
  if (isError) {
    return (
      <ErrorState
        title="Der Abgleich konnte nicht gerechnet werden."
        description={ERNEUT_LADEN}
        onErneut={() =>
          void queryClient.invalidateQueries({ queryKey: ['patient-file-reconciliation'] })
        }
      />
    );
  }

  if (fehlende.length === 0 && verwaiste === 0) {
    return offen.auftraege.length > 0 ? (
      <EmptyState
        title="Deckungsgleich, sobald die offenen Löschaufträge oben ausgeführt sind"
        description="Die vorgemerkten Objekte liegen bis dahin noch in der Ablage."
      />
    ) : (
      <EmptyState
        title="Beide Speicher sind deckungsgleich"
        description="Zu jeder Datei in einer Akte liegt genau ein Objekt in der Ablage – und umgekehrt."
      />
    );
  }

  return (
    <>
      {fehlende.length > 0 ? (
        <>
          <Statusmeldung ton="fehler">
            {fehlende.length === 1
              ? 'Zu einer Datei in einer Akte fehlt die abgelegte Fassung.'
              : `Zu ${fehlende.length} Dateien in Akten fehlt die abgelegte Fassung.`}{' '}
            Das ist ein Verlust und kein Aufräumfall – bitte prüfen, ob eine Wiederherstellung nötig
            ist.
          </Statusmeldung>
          <ListRows rahmen={false} className="mt-2">
            {fehlende.map((datei) => (
              <ListRow
                key={datei.file_id}
                titel={datei.display_name}
                meta={
                  <>
                    {datei.patient_name}
                    {datei.uploaded_at
                      ? ` · hinzugefügt ${formatZeitpunkt(datei.uploaded_at)}`
                      : ''}
                  </>
                }
                aktion={
                  <Textlink
                    to={aktenortDerDatei(datei.patient_id, datei.document_type)}
                    alleinstehend
                    className="text-sm"
                  >
                    Akte öffnen
                  </Textlink>
                }
              />
            ))}
          </ListRows>
        </>
      ) : null}

      {verwaiste > 0 ? (
        <div className={fehlende.length > 0 ? 'mt-6' : ''}>
          <Statusmeldung ton="warnung">
            {verwaiste === 1
              ? 'Ein Objekt in der Ablage gehört zu keiner Datei mehr.'
              : `${verwaiste} Objekte in der Ablage gehören zu keiner Datei mehr.`}{' '}
            Sie sind Abfall und werden über einen gewöhnlichen Löschauftrag entfernt.
          </Statusmeldung>
          <div className="mt-3">
            <Button type="button" disabled={vormerken.isPending} onClick={() => vormerken.mutate()}>
              {vormerken.isPending ? 'Wird vorgemerkt …' : 'Zur Löschung vormerken'}
            </Button>
          </div>
          {vormerken.isSuccess ? (
            <Statusmeldung ton="erfolg" className="mt-2">
              {vormerken.data} Löschauftr{vormerken.data === 1 ? 'ag' : 'äge'} angelegt – oben unter
              „Offene Löschaufträge“ ausführen.
            </Statusmeldung>
          ) : null}
          {vormerken.isError ? (
            <Statusmeldung ton="fehler" className="mt-2">
              {vormerken.error.message}
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * Was zu tun ist (BEF-065): offene Löschaufträge und der Abgleich der
 * Dateiablage - die einzigen Arbeitsaufgaben der Seite. Bis UX-009b standen
 * sie nach 15 Planungskarten, am Telefon nach rund 5 500 px.
 *
 * Ist nichts offen, steht eine Zeile da. Nach dem Ausführen bleibt das
 * Ergebnis in dieser Zeile stehen, auch wenn die Abschnitte darüber mit dem
 * letzten Auftrag verschwinden.
 */
function ZuTun({ user }: { user: CurrentUser }) {
  const offen = useLoeschauftraege(user);
  const abgleich = useDateiabgleich(user);
  const ausfuehren = useLoeschauftraegeAusfuehren();

  if (offen.verborgen) return null;

  const nichtsOffen =
    !offen.isPending &&
    !offen.isError &&
    !abgleich.isPending &&
    !abgleich.isError &&
    offen.auftraege.length === 0 &&
    abgleich.fehlende.length === 0 &&
    abgleich.verwaiste === 0;

  if (nichtsOffen) {
    const erledigt = ausfuehren.data?.erledigt ?? 0;
    return (
      <Section titel="Zu tun">
        <Statusmeldung ton="erfolg">
          {erledigt > 0
            ? `${erledigt} Löschung${erledigt === 1 ? '' : 'en'} abgeschlossen und quittiert. `
            : ''}
          Nichts offen, beide Speicher deckungsgleich.
        </Statusmeldung>
      </Section>
    );
  }

  return (
    <>
      {/* Ohne Satz unter der Überschrift (Regel 6): Was offen ist und was
          das Ausführen bewirkt, sagt die Meldung im Abschnitt; der Rest steht
          unter „Grundlagen“. */}
      <Section titel="Offene Löschaufträge" rahmen>
        <Loeschauftraege user={user} ausfuehren={ausfuehren} />
      </Section>

      <Section titel="Abgleich der Dateiablage" rahmen>
        <Dateiabgleich user={user} />
      </Section>
    </>
  );
}

/**
 * Die Verweise für die Prüfung, zugeklappt am Ende (BEF-065): Sie belegen,
 * woher Frist und Löschweg kommen, und sind für die Arbeit an der Seite
 * nicht nötig.
 */
function Grundlagen() {
  return (
    <div className="mt-8 max-w-prose">
      <Disclosure summary="Grundlagen">
        <ul className="text-ink-muted list-inside list-disc space-y-1 text-sm">
          <li>Datenklassen, Fristen und Löschsperren: ADR-008 (Aufbewahrung und Löschung).</li>
          <li>
            Eine Löschsperre hält eine Akte oder die Beschäftigtendaten einer Person – Urlaub,
            Arbeitszeit, Zeitkonto, Erstattungen – von der automatischen Löschung zurück, solange
            ein rechtlicher Vorgang läuft. Gesperrtes wird nicht gelöscht, bleibt aber vollständig
            benutzbar.
          </li>
          <li>
            Fristen auf Annahme: Annahmenregister (Kennung ANN-NNN), bestätigt erst durch die
            Datenschutzprüfung (ADR-007). „Annahme – Prüfung offen“ heißt: Die Frist ist begründet
            festgelegt und wartet auf die Datenschutzprüfung.
          </li>
          <li>
            Löschaufträge und Abgleich der Dateiablage: ADR-017 Punkte 25 und 27. Eine Datei, die
            aus einer Akte entfernt ist, ist erst mit der Quittung gelöscht. Akten und Dateiablage
            können auseinanderlaufen; der Abgleich wird beim Öffnen dieser Seite gerechnet.
          </li>
          <li>
            Löschjournal und Wiederherstellung: ADR-008 Punkt 8, ADR-012 Punkt 12 (Backups 30 Tage,
            Journal 60 Tage). Das Journal ist der Nachweis der ausgeführten Löschungen, angezeigt
            die letzten {JOURNAL_EINTRAEGE} Einträge. Es überlebt eine Wiederherstellung und wird
            danach erneut angewendet; sobald eine Frist abläuft, hält der tägliche Löschlauf dort
            fest, was er gelöscht hat.
          </li>
          <li>
            Eine Frist ändert sich nur über eine Programmänderung, nicht auf dieser Seite – so
            bleibt jede Änderung nachvollziehbar (ADR-013).
          </li>
        </ul>
      </Disclosure>
    </div>
  );
}

export function AufbewahrungPage({ user }: { user: CurrentUser }) {
  const [suche] = useSearchParams();
  const klasse = suche.get(KLASSE_PARAM);
  // Liste und Detail auf derselben Route (Welle B): Eine Zeile des Plans
  // öffnet die Datenklasse, der Rückweg führt in die Liste.
  if (klasse) return <Klassendetail key={klasse} schluessel={klasse} />;

  return (
    <>
      {/* Ansicht unter Praxis (ORG-001). Ohne Satz unter dem Titel: Die
          Abschnitte sagen selbst, was sie sind. */}
      <PageHeader title="Aufbewahrung und Löschung" />

      <ZuTun user={user} />
      <Loeschsperren />
      <Aufbewahrungsplan />
      <Loeschjournal />
      <Grundlagen />
    </>
  );
}
