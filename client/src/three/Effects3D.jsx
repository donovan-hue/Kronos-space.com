import { Bloom, EffectComposer } from "@react-three/postprocessing";

/**
 * Postprocessing cinematográfico de KRONOS.
 *
 * Un solo efecto y con función concreta: Bloom con mipmapBlur (la
 * variante más barata en GPU) para que los reflejos del cromo
 * conserven un halo mínimo sobre negro. Un bloom fuerte difumina
 * el horizonte y hace que el metal parezca plástico o neón.
 *
 * Este módulo viaja en un chunk SEPARADO que solo se descarga cuando
 * un dispositivo de gama media/alta monta una escena con
 * postprocessing activo. Los móviles (tier "low") jamás lo piden.
 */
export default function Effects3D({ tier = "medium" }) {
  return (
    <EffectComposer multisampling={tier === "high" ? 4 : 0}>
      <Bloom
        mipmapBlur
        intensity={0.16}
        luminanceThreshold={1.05}
        luminanceSmoothing={0.15}
        radius={0.3}
      />
    </EffectComposer>
  );
}
