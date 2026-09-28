import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, DataList, DataRow, Inhaltsflaeche } from '@/components/ui/Card';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { roleLabel } from '@/components/ui/roleLabels';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { fetchPatient, fullName, type Patient } from '@/features/patients/api';
import { FotoHerausgabe } from '@/features/files/FotoHerausgabe';
import { DATENKLASSEN } from '@/features/retention/klassen';
import {
  fetchAufbewahrungsstand,
  fetchAuskunft,
  type Aufbewahrungsklasse,
  type Auskunft,
} from './api';
import { dateiname, sichereAlsDatei } from './datei';
import { AUSKUNFT_KATEGORIEN, kategorieLabel } from './kategorien';
import { paragraf } from '@/lib/begriffe';
import { ablehnungstext } from './vorlage';

/**
 * Betroffenenrechte zu einer Akte (OPS-006 minimal).
 *
 * Zwei Vorgänge, die im Alltag zusammen auftreten: Jemand verlangt Auskunft,
 * und jemand verlangt Löschung. Die Seite bedient beide — die eine mit einer
 * Kopie, die andere mit einem begründeten Entwurf. Das Verfahren drumherum,
 * einschließlich Fristen und Identitätsprüfung, steht in
 * `docs/datenschutz/betroffenenrechte.md`; diese Seite ersetzt es nicht.
 *
 * **Die Auskunft entsteht auf Knopfdruck und nicht beim Öffnen der Seite.**
 * Jede erstellte Kopie ist ein auditpflichtiger Export klinischer Daten
 * (ADR-010 Punkt 2); eine Seite, die beim Blättern exportiert, macht das
 * Protokoll wertlos. Der Aufbewahrungsstand darunter gibt keine Inhalte heraus
 * und lädt deshalb sofort.
 *
 * Sichtbar nur für `owner`. Die Rollenprüfung hier steuert die Darstellung;
 * verbindlich prüfen die beiden Serverfunktionen (ADR-004).
 */

/** Einzahl und Mehrzahl, statt „1 Einträge" (PAT-17, WRT-19). */
function eintraege(anzahl: number): string {
  return anzahl === 1 ? '1 Eintrag' : `${anzahl} Einträge`;
}

function AuskunftErgebnis({ auskunft }: { auskunft: Auskunft }) {
  const abschnitte = Object.keys(AUSKUNFT_KATEGORIEN).filter(
    (key) => (auskunft.tabellen[key]?.length ?? 0) > 0,
  );
  const leer = Object.keys(AUSKUNFT_KATEGORIEN).length - abschnitte.length;

  return (
    <div className="mt-6">
      {/* Kartenbreite wie ein Formular (PAT-16): Über die volle Breite lagen
          Bezeichnung und Anzahl am Desktop rund 1000 px auseinander. */}
      <Card className="max-w-xl">
        <DataList>
          {abschnitte.map((key) => (
            <DataRow key={key} label={kategorieLabel(key)}>
              {eintraege(auskunft.tabellen[key]!.length)}
            </DataRow>
          ))}
        </DataList>
        {leer > 0 ? (
          <p className="text-ink-muted mt-4 text-sm">
            {leer === 1
              ? '1 weiterer Abschnitt ist in der Datei enthalten und leer.'
              : `${leer} weitere Abschnitte sind in der Datei enthalten und leer.`}
          </p>
        ) : null}
      </Card>

      {/* Nach dem Erstellen der einzige Hauptknopf (PAT-23). Er heißt, was er
          tut: Die Datei wird heruntergeladen (WRT-10). */}
      <div className="mt-4">
        <Button
          type="button"
          onClick={() =>
            sichereAlsDatei(
              dateiname(auskunft.patient_id, auskunft.erstellt_am),
              JSON.stringify(auskunft, null, 2),
            )
          }
        >
          Kopie herunterladen
        </Button>
      </div>

      <Section titel="Nicht enthalten" ebene={3}>
        <ul className="text-ink-muted space-y-2 text-sm leading-relaxed">
          {auskunft.nicht_enthalten.map((hinweis) => (
            <li key={hinweis.was}>
              <span className="text-ink font-medium">{hinweis.was}:</span> {hinweis.grund}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function AuskunftAbschnitt({ patient }: { patient: Patient }) {
  const mutation = useMutation({
    mutationFn: () => fetchAuskunft(patient.id),
  });
  const erstellt = mutation.data !== undefined;

  return (
    <Section
      titel="Auskunft nach Art. 15 DSGVO"
      hinweis="Erstellt eine Kopie aller Daten dieser Akte. Jede Auskunft wird protokolliert."
    >
      {/* Nach dem Erstellen tritt der Knopf zurück (PAT-23): Jeder weitere Tipp
          ist ein neuer, protokollierter Export, und zwei gleich starke Knöpfe
          ließen offen, was als Nächstes zu tun ist. */}
      <Button
        type="button"
        variant={erstellt ? 'quiet' : 'primary'}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Wird erstellt …' : erstellt ? 'Neu erstellen' : 'Auskunft erstellen'}
      </Button>

      {mutation.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Die Auskunft konnte nicht erstellt werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
          />
        </div>
      ) : null}

      {mutation.data ? <AuskunftErgebnis auskunft={mutation.data} /> : null}
    </Section>
  );
}

/**
 * Die Frist im Klartext, mit der Fundstelle dahinter (PAT-17).
 *
 * Nur „§ 630f Abs. 3 BGB" sagte der Praxisinhaber:in nicht, welche Daten
 * gemeint sind, und fehlte die Fundstelle, stand der interne Schlüssel da. Die
 * Namen sind die der Aufbewahrungsübersicht - gleiche Sache, gleiches Wort.
 * Die Fundstelle bricht nicht in sich um: „§" am Zeilenende und „630f" in der
 * nächsten Zeile läse niemand als eine Angabe.
 */
function fristBezeichnung(klasse: Aufbewahrungsklasse): string {
  const name = DATENKLASSEN[klasse.key]?.label;
  const fundstelle = paragraf(klasse.legal_reference).replaceAll(' ', ' ');
  if (name && fundstelle) return `${name} (${fundstelle})`;
  return name ?? (fundstelle || 'Aufbewahrungsfrist');
}

/**
 * Der Entwurf der Antwort als Text zum Lesen und Kopieren (PAT-23).
 *
 * Vorher ein schreibgeschütztes Feld im Aussehen eines bearbeitbaren, mit 18
 * Zeilen und eigenem Bildlauf - am Telefon war „alles markieren" darin
 * mühsam. Jetzt steht der Brief als Auskunft da, und ein Knopf kopiert ihn.
 * „Kopiert." erscheint erst, wenn die Zwischenablage ihn angenommen hat.
 */
function AntwortEntwurf({ text }: { text: string }) {
  const [kopiert, setKopiert] = useState<'ja' | 'nein' | null>(null);

  async function kopieren() {
    setKopiert(null);
    try {
      await navigator.clipboard.writeText(text);
      setKopiert('ja');
    } catch {
      setKopiert('nein');
    }
  }

  return (
    // Fließtext in lesbarer Zeilenlänge (PAT-16): Über die volle Breite
    // standen rund 170 Zeichen in einer Zeile.
    <div className="mt-6 max-w-prose">
      <Section
        titel="Entwurf der Antwort"
        ebene={3}
        hinweis="Briefkopf, Datum und Unterschrift kommen aus der Praxis – die Anwendung verschickt nichts."
        aktion={
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            onClick={() => void kopieren()}
          >
            Text kopieren
          </Button>
        }
        rahmen
      >
        <p className="text-ink leading-relaxed whitespace-pre-line">{text}</p>
      </Section>
      {kopiert === 'ja' ? (
        <Statusmeldung ton="erfolg" className="mt-2">
          Kopiert.
        </Statusmeldung>
      ) : null}
      {kopiert === 'nein' ? (
        <Statusmeldung ton="fehler" className="mt-2">
          Der Text ließ sich nicht kopieren. Bitte den Entwurf markieren und von Hand kopieren.
        </Statusmeldung>
      ) : null}
    </div>
  );
}

function LoeschverlangenAbschnitt({ patient }: { patient: Patient }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['datenschutz', 'aufbewahrung', patient.id],
    queryFn: () => fetchAufbewahrungsstand(patient.id),
  });

  return (
    <Section
      titel="Löschverlangen nach Art. 17 DSGVO"
      hinweis="Welche Fristen der Löschung entgegenstehen – und ein Entwurf der Antwort."
    >
      {isPending ? <LoadingState label="Aufbewahrungsstand wird geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Der Aufbewahrungsstand konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und später erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}

      {data ? (
        <>
          {/* Bezeichnung und Frist untereinander bzw. in fester Spalte statt
              rechtsbündig über die ganze Breite (PAT-16). */}
          <Inhaltsflaeche className="max-w-xl">
            <DetailList>
              {data.klassen.map((klasse) => (
                <DetailRow key={klasse.key} label={fristBezeichnung(klasse)}>
                  {klasse.frist_ende
                    ? `aufzubewahren bis ${formatDate(klasse.frist_ende)}`
                    : 'Frist läuft noch nicht'}
                </DetailRow>
              ))}
              {data.loeschsperre ? (
                <DetailRow label="Löschsperre">{data.loeschsperre.grund}</DetailRow>
              ) : null}
            </DetailList>
          </Inhaltsflaeche>

          <AntwortEntwurf text={ablehnungstext(fullName(patient), data)} />
        </>
      ) : null}
    </Section>
  );
}

export function BetroffenenrechtePage() {
  const { patientId = '' } = useParams();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: Boolean(patientId),
  });

  return (
    <>
      {/* Rückweg und Überschrift stehen vor jedem Zustand: Auch im Fehlerfall
          gibt es einen Weg hinaus und einen Titel (PAT-22, ZST-08). */}
      <Rueckweg
        standard={`/patienten/${patientId}/stammdaten`}
        beschriftung="Zurück zu den Stammdaten"
      />

      <PageHeader
        title="Auskunft und Löschverlangen"
        description={
          data
            ? `${fullName(data)} · Vorgänge nach dem Verfahren für Betroffenenrechte, vorbehalten der Rolle „${roleLabel('owner')}“.`
            : undefined
        }
      />

      {/* Ein Ladefehler ist etwas anderes als eine Akte, die es nicht gibt
          (ZST-08): Der eine bietet einen neuen Versuch an, die andere nicht. */}
      {isPending ? <LoadingState label="Akte wird geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Akte konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und später erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {data ? (
        <>
          <AuskunftAbschnitt patient={data} />
          {/* DOK-006d: Der Inhalt der Fotos kommt nicht mit der Auskunft,
              sondern je Foto getrennt (ADR-017 Punkt 40). */}
          <FotoHerausgabe patientId={data.id} />
          <LoeschverlangenAbschnitt patient={data} />
        </>
      ) : null}
    </>
  );
}
