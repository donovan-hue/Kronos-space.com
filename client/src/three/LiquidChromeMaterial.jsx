import { useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { injectLiquidChrome, LIQUID_CHROME, liquidChromeCacheKey } from './liquidChrome';

/** Reflejo PBR real del estudio, con ondulación muy lenta tipo mercurio. */
export default function LiquidChromeMaterial({ reducedMotion = false }) {
  const time = useRef({ value: 0 });
  const compile = useCallback((shader) => injectLiquidChrome(shader, time.current), []);

  useFrame((_, delta) => {
    if (!reducedMotion) time.current.value += Math.min(delta, 0.05);
  });

  return (
    <meshStandardMaterial
      {...LIQUID_CHROME}
      onBeforeCompile={compile}
      customProgramCacheKey={liquidChromeCacheKey}
    />
  );
}
