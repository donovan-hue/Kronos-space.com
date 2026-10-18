/** Metal vectorial original: entorno reflejado, bisel y arista especular.
 * No usa la imagen de referencia, mapas de bits, URLs ni texturas externas.
 */
export default function MirrorMetalDefs({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}-face`} x1="0" y1="0" x2="0.03" y2="1">
        <stop offset="0" stopColor="#d0d0d0" />
        <stop offset=".16" stopColor="#bdbdbd" />
        <stop offset=".32" stopColor="#c7c7c7" />
        <stop offset=".40" stopColor="#d5d5d5" />
        <stop offset=".455" stopColor="#7c7c7c" />
        <stop offset=".48" stopColor="#1c1c1c" />
        <stop offset=".53" stopColor="#080808" />
        <stop offset=".63" stopColor="#181818" />
        <stop offset=".73" stopColor="#343434" />
        <stop offset=".79" stopColor="#181818" />
        <stop offset="1" stopColor="#080808" />
      </linearGradient>
      <linearGradient id={`${id}-edge`} x1="0" y1="0" x2=".75" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".22" stopColor="#a3a3a3" />
        <stop offset=".43" stopColor="#eeeeee" />
        <stop offset=".49" stopColor="#303030" />
        <stop offset=".65" stopColor="#777777" />
        <stop offset=".83" stopColor="#e5e5e5" />
        <stop offset="1" stopColor="#3b3b3b" />
      </linearGradient>
      <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f5f5f5" />
        <stop offset=".25" stopColor="#9a9a9a" />
        <stop offset=".47" stopColor="#ffffff" />
        <stop offset=".51" stopColor="#121212" />
        <stop offset=".78" stopColor="#b8b8b8" />
        <stop offset="1" stopColor="#fafafa" />
      </linearGradient>
      <radialGradient id={`${id}-sphere`} cx=".32" cy=".2" r=".8">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".18" stopColor="#ededed" />
        <stop offset=".34" stopColor="#777777" />
        <stop offset=".44" stopColor="#090909" />
        <stop offset=".57" stopColor="#141414" />
        <stop offset=".76" stopColor="#c7c7c7" />
        <stop offset=".83" stopColor="#f5f5f5" />
        <stop offset="1" stopColor="#161616" />
      </radialGradient>
      <filter id={`${id}-bevel`} x="-4%" y="-10%" width="108%" height="125%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="0.7" result="edge" />
        <feSpecularLighting in="edge" surfaceScale="2.8" specularConstant="1.15" specularExponent="28" lightingColor="#ffffff" result="light">
          <feDistantLight azimuth="230" elevation="48" />
        </feSpecularLighting>
        <feComposite in="light" in2="SourceAlpha" operator="in" result="clipped" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="clipped" />
        </feMerge>
      </filter>
    </defs>
  );
}
