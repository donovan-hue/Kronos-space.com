// Shading-only ripples move the studio reflections, not the letter outlines.
// The entire name shares one clock, material and continuous wave field.
export function createMetallicRipple() {
  const uniforms = { uRippleTime: { value: 0 } };
  const shader = front => compiled => {
    Object.assign(compiled.uniforms, uniforms);
    compiled.vertexShader = 'varying vec3 vRipplePosition; varying float vLetterHeight;\n' + compiled.vertexShader;
    compiled.vertexShader = compiled.vertexShader.replace('#include <project_vertex>', `
      #include <project_vertex>
      vRipplePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vLetterHeight = position.y;
    `);
    compiled.fragmentShader = 'varying vec3 vRipplePosition; varying float vLetterHeight; uniform float uRippleTime;\n' + compiled.fragmentShader;
    if (front) {
      compiled.fragmentShader = compiled.fragmentShader.replace('#include <clearcoat_normal_fragment_maps>', `
        #include <clearcoat_normal_fragment_maps>
        float wave = vRipplePosition.x * 2.6 - uRippleTime * 1.15 + vRipplePosition.y * 1.3;
        vec3 rippleNormal = vec3(.10 * sin(wave) + .035 * sin(wave * 1.8), .055 * cos(wave * .8), 0.0);
        normal = normalize(normal + rippleNormal);
        #ifdef USE_CLEARCOAT
          clearcoatNormal = normalize(clearcoatNormal + rippleNormal);
        #endif
      `);
    }
    compiled.fragmentShader = compiled.fragmentShader.replace('#include <tonemapping_fragment>', `
      float waveLight = sin(vRipplePosition.x * 2.6 - uRippleTime * 1.15 + vRipplePosition.y * 1.3);
      float height = vLetterHeight * (vRipplePosition.y < -.2 ? 4.0 : 1.0);
      float middle = ${front ? '.28' : '0.0'} * exp(-pow((height + waveLight * .025) / .10, 2.0));
      gl_FragColor.rgb *= (1.0 - middle) * (1.0 + .12 * waveLight);
      #include <tonemapping_fragment>
    `);
  };
  return { uniforms, front: shader(true), edge: shader(false), update(time) { uniforms.uRippleTime.value = time; } };
}
