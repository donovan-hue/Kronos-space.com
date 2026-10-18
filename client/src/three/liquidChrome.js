// Cromo conductor, no pintura gris ni capa de plástico. Las zonas oscuras
// proceden del entorno reflejado; las ondas sólo desvían la superficie.
export const LIQUID_CHROME = Object.freeze({
  color: '#ffffff',
  metalness: 1,
  roughness: 0.025,
  envMapIntensity: 1.15,
});

export const liquidChromeCacheKey = () => 'kronos-liquid-chrome-v1';

/** Deformación y normal analítica comparten campo: el reflejo sigue la onda.
 * No texturas externas, copias del entorno por frame ni trabajo CPU por vértice.
 * El uniform lo controla React; al pausar conserva exactamente la misma pose.
 */
export function injectLiquidChrome(shader, time) {
  shader.uniforms.uLiquidTime = time;
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `
    #include <common>
    uniform float uLiquidTime;
    float kLiquidField(vec3 p) {
      vec3 q = p * vec3(1.7, 2.1, 1.5) + uLiquidTime * vec3(0.27, -0.17, 0.11);
      return 0.035 * sin(q.x) * sin(q.y) * sin(q.z);
    }
    vec3 kLiquidGradient(vec3 p) {
      vec3 q = p * vec3(1.7, 2.1, 1.5) + uLiquidTime * vec3(0.27, -0.17, 0.11);
      return 0.035 * vec3(
        1.7 * cos(q.x) * sin(q.y) * sin(q.z),
        2.1 * sin(q.x) * cos(q.y) * sin(q.z),
        1.5 * sin(q.x) * sin(q.y) * cos(q.z)
      );
    }
  `).replace('#include <beginnormal_vertex>', `
    #include <beginnormal_vertex>
    vec3 kGradient = kLiquidGradient(position);
    objectNormal = normalize(objectNormal - (kGradient - dot(kGradient, objectNormal) * objectNormal));
  `).replace('#include <begin_vertex>', `
    #include <begin_vertex>
    transformed += normalize(normal) * kLiquidField(position);
  `);
}
