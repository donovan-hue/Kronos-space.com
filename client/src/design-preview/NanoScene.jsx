import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { createPyramidSkin, updatePyramidSkin } from './pyramidSkin';
import StudioLighting from '../three/scenes/StudioLighting';
import { createHexTube, updateHexTube } from './hexTubeGeometry';

function HexagonalBody({ light, paused }) {
  const group = useRef();
  const skin = useMemo(createPyramidSkin, []);
  const gl = useThree(state => state.gl);
  const time = useRef(0);
  const surface = useMemo(createHexTube, []);
  useEffect(() => () => { surface.geometry.dispose(); skin.geometry.dispose(); }, [surface, skin]);
  useFrame((_, delta) => {
    if (!paused) {
      time.current += Math.min(delta, .05);
      updateHexTube(surface, time.current);
    }
    updatePyramidSkin(skin, surface, time.current);
    group.current.rotation.set(.42 + Math.sin(time.current * .2) * .07, .32 + time.current * .065, .1);
  });
  return <>
    <StudioLighting background="#777d85" />
    <directionalLight position={[3, -1, -4]} intensity={.65} color="#e5edff" />
    <group ref={group} rotation={[.42, .32, .1]} scale={.9}>
      <mesh geometry={skin.geometry} frustumCulled={false}
        onAfterRender={() => {
          gl.domElement.dataset.rendered = 'true';
          gl.domElement.dataset.surface = 'hexagonal-tube';
          gl.domElement.dataset.texture = 'continuous-pyramids';
        }}>
        <meshPhysicalMaterial color="#262a30" metalness={1} roughness={.16}
          envMapIntensity={light ? 2.2 : 2.8} clearcoat={1} clearcoatRoughness={.055} />
      </mesh>
    </group>
  </>;
}
export default function NanoScene({ light, paused }) {
  return <Canvas camera={{ position: [0, .35, 7.6], fov: 44 }} dpr={[1, 1.5]} gl={{ alpha: true, antialias: true }} frameloop={paused ? 'demand' : 'always'} aria-hidden="true">
    <HexagonalBody light={light} paused={paused} />
  </Canvas>;
}
