import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontData from './orbitron-3d.json';
import { Environment, Lightformer } from '@react-three/drei';
import { createMetallicRipple } from './metallicRipple';

const font = new FontLoader().parse(fontData);
function createText(text, size, depth) {
  const geometry = new TextGeometry(text, { font, size, depth, curveSegments: 16,
    bevelEnabled: true, bevelThickness: size * .026, bevelSize: size * .022, bevelSegments: 8 });
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const width = max.x - min.x;
  geometry.translate(-min.x, -(min.y + max.y) / 2, -depth / 2);
  return { geometry, width };
}
function Letters({ paused, light }) {
  const root = useRef();
  const ripple = useMemo(createMetallicRipple, []);
  const time = useRef(0);
  const { camera, size, invalidate, gl } = useThree();
  const layout = useMemo(() => {
    const name = createText('KRONOS', 1, .34);
    const space = createText('S P A C E', .25, .12);
    return { name, space, width: name.width };
  }, []);
  useEffect(() => () => { layout.name.geometry.dispose(); layout.space.geometry.dispose(); }, [layout]);
  useLayoutEffect(() => {
    // Perspective varies the reflected view direction across the lettering,
    // avoiding the uniform grey face produced by an orthographic mirror.
    const visibleHeight = 2 * Math.tan(camera.fov * Math.PI / 360) * 8;
    camera.zoom = Math.min(visibleHeight * size.width / size.height / (layout.width + .5), visibleHeight / 2.05);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, layout.width, invalidate]);
  useFrame((_, delta) => {
    if (!paused) time.current += Math.min(delta, .05);
    ripple.update(time.current);
    gl.domElement.dataset.rippleTime = time.current.toFixed(3);
    root.current.position.y = Math.sin(time.current * .55) * .035;
    root.current.rotation.set(.13 + Math.sin(time.current * .3) * .025, -.22 + Math.sin(time.current * .25) * .055, 0);
  });
  const materials = <>
    <meshPhysicalMaterial attach="material-0" color={light ? '#101216' : '#f8f9fc'} metalness={light ? .92 : .78}
      roughness={light ? .025 : .155} clearcoat={.85} clearcoatRoughness={.012}
      envMapIntensity={light ? 2.8 : 1.55} onBeforeCompile={ripple.front} customProgramCacheKey={() => 'ripple-front-v1'} />
    <meshPhysicalMaterial attach="material-1" color={light ? '#343943' : '#f1f4f8'} metalness={1}
      roughness={.015} clearcoat={1} clearcoatRoughness={.012} envMapIntensity={2.1}
      onBeforeCompile={ripple.edge} customProgramCacheKey={() => 'ripple-edge-v1'} />
  </>;
  return <>
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#71757b']} />
      <Lightformer form="rect" intensity={1.8} position={[-2, -1, 5]} rotation={[0, Math.PI, -.22]} scale={[11, 5, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={1} position={[-2, -.7, 4.8]} rotation={[0, Math.PI, -.22]} scale={[12, .65, 1]} color="#090a0c" />
      {/* White softboxes separated by dark studio space create mirror contrast,
          rather than increasing exposure until every face becomes white. */}
      <Lightformer form="rect" intensity={3.5} position={[-2, 2.5, 5]} rotation={[0, Math.PI, -.32]} scale={[8, 1.4, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={2.5} position={[1, -1.8, 5]} rotation={[0, Math.PI, -.32]} scale={[8, 1, 1]} color="#f3f5fa" />
      <Lightformer form="rect" intensity={3} position={[5, 0, 2]} rotation={[0, -Math.PI / 2, 0]} scale={[2, 6, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={2.5} position={[-5, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={[1, 5, 1]} color="#dce3ed" />
      <Lightformer form="rect" intensity={2} position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 2, 1]} color="#ffffff" />
    </Environment>
    <directionalLight position={[-3, 4, 6]} intensity={2.5} color="#ffffff" />
    <group ref={root}>
      <mesh geometry={layout.name.geometry} position={[-layout.name.width / 2, .26, 0]}
        onAfterRender={() => {
          gl.domElement.dataset.wordmark = 'floating-3d';
          gl.domElement.dataset.letters = 'KRONOS';
          gl.domElement.dataset.metal = light ? 'black-lacquer' : 'white-metal';
        }}>
        {materials}
      </mesh>
      <mesh geometry={layout.space.geometry} position={[-layout.space.width / 2, -.67, 0]}>{materials}</mesh>
    </group>
  </>;
}
export default function FloatingWordmark({ paused, light }) {
  return <Canvas camera={{ position: [0, 0, 8], fov: 35 }} dpr={[1, 2]}
    gl={{ alpha: true, antialias: true }} frameloop={paused ? 'demand' : 'always'}>
    <Letters paused={paused} light={light} />
  </Canvas>;
}
