import { useEffect, useMemo, useState } from "react";
import { getFeatureFlags } from "../services/flagsService";

/**
 * Feature flags que gobiernan la visibilidad de destinos de navegación.
 *
 * Compartido por la barra lateral, la barra móvil y el mapa orbital:
 * los tres sistemas deben mostrar EXACTAMENTE el mismo conjunto de
 * destinos. Si el backend no responde, el servicio degrada a "todo
 * encendido" (defaults) y aquí ningún fallo oculta funciones: el catch
 * deja los defaults intactos.
 */
export function useNavFlags() {
  const [flags, setFlags] = useState(null);

  useEffect(() => {
    let active = true;
    getFeatureFlags()
      .then((value) => {
        if (active) setFlags(value);
      })
      .catch(() => {
        /* el servicio ya degrada a "todo encendido"; si aun así
           fallara, la navegación conserva los defaults y nunca rompe. */
      });
    return () => {
      active = false;
    };
  }, []);

  const filterItems = useMemo(
    () => (items) =>
      !flags ? items : items.filter((item) => !item.flag || flags[item.flag] !== false),
    [flags]
  );

  return { flags, filterItems };
}
