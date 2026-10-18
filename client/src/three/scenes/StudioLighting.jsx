import { Environment, Lightformer } from "@react-three/drei";

/**
 * Iluminación de estudio renderizada EN MEMORIA con Lightformers.
 *
 * El cromo necesita algo que reflejar: en lugar de descargar un HDRI
 * externo (dependencia de red + megas extra), este "estudio" se
 * renderiza una sola vez a un cubo de 256/512px (frames={1}) con tiras
 * de luz blancas y plata neutra — key superior, contraluz, reflejo de
 * piso y rim de acero — que dibujan los reflejos alargados típicos
 * del metal pulido sobre negro puro.
 */
export default function StudioLighting({ background = "#000000", resolution = 256 }) {
  return (
    <>
      <ambientLight intensity={0.06} />
      <directionalLight position={[6, 8, 4]} intensity={0.5} color="#f6f6f6" />
      <Environment resolution={resolution} frames={1}>
        <color attach="background" args={[background]} />
        {/* Softbox frontal amplio: el cuerpo del espejo sigue visible entre
            las tiras, sin iluminación difusa que lo vuelva aluminio mate. */}
        <Lightformer
          form="rect"
          intensity={0.6}
          position={[0, 0, 7]}
          scale={[12, 8, 1]}
          color="#ffffff"
        />
        {/* Key light superior: dibuja el brillo principal del cromo. */}
        <Lightformer
          form="rect"
          intensity={3.4}
          position={[0, 6, 1]}
          rotation-x={Math.PI / 2}
          scale={[10, 3, 1]}
          color="#ffffff"
        />
        {/* Contraluz izquierdo, plata neutra. */}
        <Lightformer
          form="rect"
          intensity={1.7}
          position={[-6, 0.5, 2]}
          rotation-y={Math.PI / 2}
          scale={[8, 2.4, 1]}
          color="#e3e3e3"
        />
        {/* Tira frontal estrecha: reflejo nítido, no una superficie mate. */}
        <Lightformer
          form="rect"
          intensity={5}
          position={[2.6, 1.2, 5]}
          scale={[0.45, 6, 1]}
          color="#ffffff"
        />
        {/* Bandera negra: crea el corte de horizonte entre los softboxes. */}
        <Lightformer
          form="rect"
          intensity={0}
          position={[0, -0.6, 4]}
          scale={[9, 0.7, 1]}
          color="#000000"
        />
        {/* Reflejo de piso, tenue, para asentar la escena. */}
        <Lightformer
          form="circle"
          intensity={1.4}
          position={[0, -5.5, -2]}
          scale={4.5}
          color="#cecece"
        />
        {/* Rim derecho de acero: separa el metal del fondo negro. */}
        <Lightformer
          form="rect"
          intensity={1.1}
          position={[6, -1, 0]}
          rotation-y={-Math.PI / 2}
          scale={[6, 2, 1]}
          color="#b3b3b3"
        />
      </Environment>
    </>
  );
}
