import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { dayKey, formatDate } from '@/lib/datum';
import {
  aboAdressen,
  beendeAbo,
  erzeugeAbo,
  fetchEigenesAbo,
  useAboDienst,
  type EigenesAbo,
} from './kalenderabo-api';

const ABO = ['kalender-abo', 'eigenes'] as const;

/**
 * Die eigenen Termine im Kalender des Telefons (ANN-838). In der Oberfläche heißt die geheime
 * Adresse „Link“, weil „Adresse“ in der Anwendung die Anschrift ist (Praxis-Review).
 */
export function KalenderAboAbschnitt() {
  const dienst = useAboDienst();
  return (
    <Section titel="Kalender-Abo" hinweis="Eigene Termine im Kalender des Telefons.">
      <Abfragezustand
        abfrage={dienst}
        laden="Das Kalender-Abo wird gefragt …"
        fehler="Das Kalender-Abo konnte nicht gefragt werden."
        leer={{
          wenn: (eingerichtet) => !eingerichtet,
          titel: 'Das Kalender-Abo ist hier noch nicht eingerichtet.',
        }}
      >
        {() => <Abo />}
      </Abfragezustand>
    </Section>
  );
}

function Abo() {
  const queryClient = useQueryClient();
  const abo = useQuery({ queryKey: ABO, queryFn: fetchEigenesAbo, retry: false });
  // Nur im Speicher dieser Seite: Nach dem Verlassen ist der Link fort, auch hier.
  const [neu, setNeu] = useState<{ link: string; ersetzt: boolean } | null>(null);
  const [verloren, setVerloren] = useState<'erstellt' | 'ersetzt' | null>(null);

  async function neuLaden() {
    await queryClient.invalidateQueries({ queryKey: ABO });
  }

  const erstellen = useMutation({
    mutationFn: (_ersetzen: boolean) => erzeugeAbo(),
    onMutate: () => {
      setVerloren(null);
      return abo.data?.seit ?? null;
    },
    onSuccess: async (link, ersetzen) => {
      setNeu({ link, ersetzt: ersetzen });
      await neuLaden();
    },
    // Kam nur die Antwort nicht an, gilt der neue Link am Server schon; der bisherige nicht mehr.
    onError: async (_fehler, ersetzen, vorher) => {
      const { data } = await abo.refetch();
      if (data !== undefined && (data?.seit ?? null) !== (vorher ?? null)) {
        setVerloren(ersetzen ? 'ersetzt' : 'erstellt');
      }
    },
  });
  const beenden = useMutation({
    mutationFn: beendeAbo,
    onSuccess: async () => {
      setNeu(null);
      setVerloren(null);
      await neuLaden();
    },
  });

  const fehlerErstellen = erstellen.isError
    ? verloren === 'ersetzt'
      ? 'Der neue Link kam nicht an, der bisherige gilt schon nicht mehr. Bitte noch einmal erstellen.'
      : `Der Link konnte nicht erstellt werden. ${VERBINDUNG_PRUEFEN}`
    : undefined;

  return (
    <Abfragezustand
      abfrage={abo}
      laden="Das Kalender-Abo wird geladen …"
      fehler="Das Kalender-Abo konnte nicht geladen werden."
    >
      {(stand) => (
        <div className="flex flex-col gap-4">
          {neu ? <NeuerLink link={neu.link} ersetzt={neu.ersetzt} /> : null}
          {stand && !neu ? <Aktiv abo={stand} /> : null}
          {stand && !neu && verloren === 'erstellt' ? (
            <Statusmeldung ton="fehler">
              Der Link kam nicht an. Bitte einen neuen erstellen.
            </Statusmeldung>
          ) : null}
          {stand === null && !neu ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                disabled={erstellen.isPending}
                onClick={() => erstellen.mutate(false)}
              >
                {erstellen.isPending ? 'Wird erstellt …' : 'Abo-Link erstellen'}
              </Button>
              {fehlerErstellen ? (
                <Statusmeldung ton="fehler" className="mt-2">
                  {fehlerErstellen}
                </Statusmeldung>
              ) : null}
            </div>
          ) : null}
          {stand || neu ? (
            <div className="flex flex-wrap gap-3">
              {neu ? null : (
                <Rueckfrage
                  ausloeser="Neuen Link erstellen"
                  bestaetigen="Neuen Link erstellen"
                  bestaetigenLaeuft="Wird erstellt …"
                  unterDerReihe
                  fehler={erstellen.variables === true ? fehlerErstellen : undefined}
                  onBestaetigen={() => erstellen.mutateAsync(true)}
                  onAbbrechen={() => erstellen.reset()}
                >
                  Der bisherige Link gilt danach nicht mehr; das alte Abo im Kalender des Telefons
                  bleibt leer stehen.
                </Rueckfrage>
              )}
              <Rueckfrage
                ausloeser="Abo beenden"
                ausloeserVariante="quiet"
                bestaetigen="Abo beenden"
                bestaetigenLaeuft="Wird beendet …"
                unterDerReihe
                fehler={
                  beenden.isError
                    ? `Das Abo konnte nicht beendet werden. ${VERBINDUNG_PRUEFEN}`
                    : undefined
                }
                onBestaetigen={() => beenden.mutateAsync()}
                onAbbrechen={() => beenden.reset()}
              >
                Der Link gilt danach nicht mehr; das Abo im Kalender des Telefons bleibt leer stehen
                und lässt sich dort löschen.
              </Rueckfrage>
            </div>
          ) : null}
          <Disclosure summary="So geht’s">
            <p className="text-ink-muted max-w-prose text-sm">
              Nach dem Erstellen: iPhone und Mac: „Im Kalender öffnen“ und das Abo bestätigen.
              Android: den Link kopieren und am Computer in Google Kalender bei „Weitere Kalender“,
              „Per URL“ einfügen; das Telefon zeigt die Termine danach von selbst. Outlook:
              „Kalender hinzufügen“, „Aus dem Internet abonnieren“. Absagen und Änderungen kommen
              dort erst beim nächsten Abruf an, bei Google oft erst nach Stunden; maßgeblich bleibt
              der Kalender hier.
            </p>
          </Disclosure>
        </div>
      )}
    </Abfragezustand>
  );
}

function Aktiv({ abo }: { abo: EigenesAbo }) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // Neutral: Ob ein Kalender abonniert hat, weiß hier niemand; der Abruf wird nicht festgehalten.
  return <Statusmeldung>Link erstellt am {formatDate(dayKey(abo.seit, zone))}.</Statusmeldung>;
}

function NeuerLink({ link, ersetzt }: { link: string; ersetzt: boolean }) {
  const { https, webcal } = aboAdressen(link);
  const [kopiert, setKopiert] = useState<'ja' | 'nein' | null>(null);

  async function kopieren() {
    setKopiert(null);
    try {
      await navigator.clipboard.writeText(https);
      setKopiert('ja');
    } catch {
      setKopiert('nein');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Statusmeldung ton="warnung">
        Der Link steht nur jetzt hier. Wer ihn kennt, sieht Ihre Termine, ohne Namen und Anschrift.
      </Statusmeldung>
      {ersetzt ? (
        <Statusmeldung>
          Das alte Abo im Kalender des Telefons bleibt leer stehen; bitte dort löschen.
        </Statusmeldung>
      ) : null}
      <Field
        label="Abo-Link"
        value={https}
        readOnly
        autoComplete="off"
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => void kopieren()}>
          Link kopieren
        </Button>
        <Textlink alleinstehend href={webcal}>
          Im Kalender öffnen
        </Textlink>
      </div>
      {kopiert === 'ja' ? <Statusmeldung ton="erfolg">Kopiert.</Statusmeldung> : null}
      {kopiert === 'nein' ? (
        <Statusmeldung ton="fehler">
          Der Link ließ sich nicht kopieren. Bitte im Feld markieren und kopieren.
        </Statusmeldung>
      ) : null}
    </div>
  );
}
