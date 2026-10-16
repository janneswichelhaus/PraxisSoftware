import { useEffect, useState } from 'react';

/** Objekt-Adressen für Bilder im Speicher; frei, sobald das Bild geht. */
export function useObjektadressen(fotos: readonly Blob[]): string[] {
  const [adressen, setAdressen] = useState<string[]>([]);
  useEffect(() => {
    const neu = fotos.map((foto) => URL.createObjectURL(foto));
    setAdressen(neu);
    return () => neu.forEach((adresse) => URL.revokeObjectURL(adresse));
  }, [fotos]);
  return adressen;
}
