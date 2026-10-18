import { useId } from 'react';
import MirrorMetalDefs from './MirrorMetalDefs';

export default function MirrorWordmark() {
  const id = `wordmark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const letters = <><tspan x="20" textLength="460" lengthAdjust="spacingAndGlyphs" fontWeight="650">KRONOS</tspan><tspan x="480" textLength="460" lengthAdjust="spacingAndGlyphs" fontWeight="250">-SPACE</tspan></>;
  return (
    <h1 className="brand-title k-mirror-wordmark" aria-label="KRONOS-SPACE">
      <svg viewBox="0 0 960 125" aria-hidden="true" focusable="false">
        <MirrorMetalDefs id={id} />
        {/* Talón oscuro + arista pulida: el bisel tiene espesor, no glow. */}
        <text y="100" transform="translate(1.3 1.8)" className="k-mirror-letters" fill="#080808" stroke="#383838" strokeWidth="2.8">{letters}</text>
        <text y="100" className="k-mirror-letters" fill={`url(#${id}-face)`} stroke={`url(#${id}-edge)`} strokeWidth="1.5" paintOrder="stroke fill" filter={`url(#${id}-bevel)`}>{letters}</text>
      </svg>
    </h1>
  );
}
