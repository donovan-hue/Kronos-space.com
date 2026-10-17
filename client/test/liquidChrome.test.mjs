import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib } from 'three';
import { injectLiquidChrome, LIQUID_CHROME, liquidChromeCacheKey } from '../src/three/liquidChrome.js';

test('el material es conductor espejo, no pintura difusa satinada', () => {
  assert.equal(LIQUID_CHROME.metalness, 1);
  assert.equal(LIQUID_CHROME.color, '#ffffff');
  assert.ok(LIQUID_CHROME.roughness > 0 && LIQUID_CHROME.roughness <= 0.04);
  assert.ok(LIQUID_CHROME.envMapIntensity >= 1);
  assert.equal(liquidChromeCacheKey(), liquidChromeCacheKey());
});

test('la onda altera geometría y normales sobre el shader real instalado', () => {
  const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader };
  const time = { value: 0 };
  for (const chunk of ['common', 'beginnormal_vertex', 'begin_vertex']) {
    assert.ok(shader.vertexShader.includes(`#include <${chunk}>`), `Three cambió ${chunk}`);
  }
  injectLiquidChrome(shader, time);
  assert.equal(shader.uniforms.uLiquidTime, time);
  assert.match(shader.vertexShader, /uniform float uLiquidTime;/);
  assert.match(shader.vertexShader, /objectNormal = normalize\(objectNormal -/);
  assert.match(shader.vertexShader, /transformed \+= normalize\(normal\) \* kLiquidField\(position\)/);
  assert.match(shader.vertexShader, /vec3 kLiquidGradient\(vec3 p\)/);
  assert.ok(!shader.vertexShader.includes('texture2D'), 'Sin imagen pintada ni descarga de textura');
  time.value = 1.5;
  assert.equal(shader.uniforms.uLiquidTime.value, 1.5);
});
