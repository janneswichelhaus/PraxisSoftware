import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Terminliste } from '@/components/ui/Terminliste';
import { aendern, kannZurueck, zurueck, type Abfolge } from '@/components/ui/abfolge';
import { useTextverlustschutz } from '@/app/Textverlustschutz';
import { wuenscheSchluessel, terminWuenschen, type Plattformzugang } from './api';
import { PLATTFORM_PFAD } from './pfade';
import {
  NICHTS_GEWAEHLT,
  WUNSCHTAGE,
  beginneWunsch,
  notizFehler,
  stand,
  ungespeichert,
  wannFehlt,
  wunschtage,
  wunschzeiten,
  zurZusammenfassung,
  type Seite,
  type Wann,
} from './terminablauf';
import {
  Nachricht,
  Sendefuss,
  Wannangabe,
  Wunschfelder,
  Zusammenfassungsanfang,
} from './Wunschfelder';
import { WUNSCHSCHUTZ } from './wunschtexte';
import { naechsteWerktage } from './zeit';

/**
 * „Termin wünschen“ in zwei Schritten (Handoff „Termine“ 5.3): „Wann passt es Ihnen?“, dann die
 * Zusammenfassung; danach steht der Wunsch in der Liste. Einen Termin macht daraus die Praxis (§8),
 * das steht direkt über dem Knopf.
 */
export function Terminwunsch({ zugang }: { zugang: Plattformzugang }) {
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  const queryClient = useQueryClient();
  const terminliste = `${PLATTFORM_PFAD}/termine${suche.toString() ? `?${suche.toString()}` : ''}`;

  const [abfolge, setAbfolge] = useState(beginneWunsch);
  const [wann, setWann] = useState<Wann>(NICHTS_GEWAEHLT);
  const [notiz, setNotiz] = useState('');
  const [hinweis, setHinweis] = useState<string | null>(null);
  // Einmal je Ablauf: Was die Zusammenfassung zeigt, geht so auch an den Server.
  const [werktage] = useState(() => naechsteWerktage(WUNSCHTAGE));
  const { seite } = abfolge;

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: ungespeichert(abfolge, wann, notiz),
    kompakt: true,
    texte: WUNSCHSCHUTZ,
    ohneVerbindungImFuss: true,
    // Die Zurückgeste des Telefons geht einen Schritt zurück, nicht aus dem Ablauf.
    schrittZurueck: kannZurueck(abfolge) ? () => zurueckGehen() : undefined,
  });

  const senden = useMutation({
    mutationFn: () =>
      terminWuenschen({
        zugangId: zugang.access_id,
        tage: wunschtage(wann.tage, werktage),
        zeiten: wunschzeiten(wann.zeiten),
        notiz,
      }),
    onSuccess: () => {
      freigeben();
      // Zur Liste mit Rückmeldung: Dort steht der Wunsch gleich unter „Ihre Wünsche“ (ANN-784).
      void navigate(`${terminliste}${terminliste.includes('?') ? '&' : '?'}gesendet=1`, {
        replace: true,
      });
      void queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) });
    },
  });

  function gehe(neu: Abfolge<Seite>) {
    setHinweis(null);
    senden.reset();
    setAbfolge(neu);
  }

  function zurueckGehen() {
    const vorher = zurueck(abfolge);
    if (vorher) gehe(vorher);
  }

  function wannWeiter() {
    const fehlt = wannFehlt(wann);
    if (fehlt) {
      setHinweis(fehlt);
      return;
    }
    gehe(zurZusammenfassung(abfolge));
  }

  function absenden() {
    // Die Seite davor lässt ohne Tag nicht weiter; geprüft wird trotzdem hier,
    // bevor etwas das Gerät verlässt.
    const fehlt = wannFehlt(wann) ?? notizFehler(notiz);
    if (fehlt) {
      setHinweis(fehlt);
      return;
    }
    setHinweis(null);
    senden.mutate();
  }

  const fehler = hinweis ?? (senden.isError ? senden.error.message : null);
  const fehlerzeile = fehler ? (
    <Statusmeldung ton="fehler" className="mb-2">
      {fehler}
    </Statusmeldung>
  ) : null;

  return (
    <GefuehrterAblauf
      titel={seite === 'wann' ? 'Wann passt es Ihnen?' : 'Ist alles richtig?'}
      objekt="Termin wünschen"
      schliessen="Abbrechen"
      onSchliessen={() => void navigate(terminliste)}
      seite={seite}
      stand={stand('wunsch', null, seite)}
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      abschluss={seite === 'zusammenfassung'}
      balkenJeSchritt
      plattform
      schmal
      fuss={
        seite === 'wann' ? (
          <>
            {fehlerzeile}
            <Button className="w-full" onClick={wannWeiter}>
              Weiter
            </Button>
          </>
        ) : (
          <>
            {fehlerzeile}
            {/* §8: Ein Wunsch ist kein Termin - das steht direkt über dem Knopf. */}
            <Sendefuss
              hinweis={
                <p className="text-ink-muted">
                  Die Praxis sucht einen Termin und meldet sich bei Ihnen. Ein vereinbarter Termin
                  ist das noch nicht.
                </p>
              }
              knopf="Wunsch senden"
              laeuft={senden.isPending}
              onSenden={absenden}
            />
          </>
        )
      }
    >
      {seite === 'wann' ? (
        <Wunschfelder
          wann={wann}
          werktage={werktage}
          onWann={(neu) => {
            setHinweis(null);
            setWann(neu);
          }}
        />
      ) : (
        <div className="flex flex-col gap-5">
          <Zusammenfassungsanfang />
          <Terminliste>
            <Wannangabe
              titel="Wann"
              wann={wann}
              werktage={werktage}
              onAendern={() => gehe(aendern(abfolge, 'wann'))}
            />
          </Terminliste>
          <Nachricht frage="Was sollen wir noch wissen?" wert={notiz} onWert={setNotiz} />
        </div>
      )}
    </GefuehrterAblauf>
  );
}
