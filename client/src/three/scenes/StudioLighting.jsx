import { Environment, Lightformer } from "@react-three/drei";

/**
 * Iluminación de estudio renderizada EN MEMORIA con Lightformers.
 *
 * El cromo necesita algo que reflejar: en lugar de descargar un HDRI
 * externo (dependencia de red + megas extra), este "estudio" se
 * renderiza una sola vez a un cubo de 256px (frames={1}) con tiras
 * de luz blancas y plata fría — key superior, contraluz, reflejo de
 * piso y rim de acero — que dibujan los reflejos alargados típicos
 * del metal pulido sobre negro puro.
 */
export default function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.16} />
      <directionalLight position={[6, 8, 4]} intensity={0.5} color="#f4f6f8" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#060607"]} />
        {/* Key light superior: dibuja el brillo principal del cromo. */}
        <Lightformer
          form="rect"
          intensity={3.4}
          position={[0, 6, 1]}
          rotation-x={Math.PI / 2}
          scale={[10, 3, 1]}
          color="#ffffff"
        />
        {/* Contraluz izquierdo, plata fría. */}
        <Lightformer
          form="rect"
          intensity={1.7}
          position={[-6, 0.5, 2]}
          rotation-y={Math.PI / 2}
          scale={[8, 2.4, 1]}
          color="#dfe4ea"
        />
        {/* Reflejo de piso, tenue, para asentar la escena. */}
        <Lightformer
          form="circle"
          intensity={1.4}
          position={[0, -5.5, -2]}
          scale={4.5}
          color="#c9ced6"
        />
        {/* Rim derecho de acero: separa el metal del fondo negro. */}
        <Lightformer
          form="rect"
          intensity={1.1}
          position={[6, -1, 0]}
          rotation-y={-Math.PI / 2}
          scale={[6, 2, 1]}
          color="#aab4c0"
        />
      </Environment>
    </>
  );
}
