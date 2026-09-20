import * as THREE from 'three'

// UVs run across each road ribbon. Keep its authored/nav width but feather the
// visible edge into the terrain; world-space grain avoids stretched road noise.
export function forestPathMaterial(main: boolean) {
  const material = new THREE.MeshStandardMaterial({
    color: main ? 0x665941 : 0x505744, roughness: 1,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 trailUv; varying vec2 trailWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntrailUv=uv; trailWorld=position.xz;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 trailUv; varying vec2 trailWorld;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain=sin(trailWorld.x*4.7+sin(trailWorld.y*2.3))*sin(trailWorld.y*6.1);
        float edge=min(trailUv.x,1.0-trailUv.x);
        diffuseColor.a *= smoothstep(.015,.24+grain*.035,edge);
        diffuseColor.rgb *= .94+grain*.09;`)
  }
  material.customProgramCacheKey = () => 'forest-trail-v2'
  return material
}

export function forestWaterMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: .28, metalness: .15,
    emissive: 0x123b42, emissiveIntensity: .1,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  material.onBeforeCompile = shader => {
    const time = { value: 0 }
    shader.uniforms.forestWaterTime = time
    material.userData.forestWaterTime = time
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 streamUv; varying vec2 streamWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nstreamUv=uv; streamWorld=position.xz;')
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float forestWaterTime; varying vec2 streamUv; varying vec2 streamWorld;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float t=forestWaterTime;
        float ripple=sin(streamWorld.x*3.2+streamWorld.y*2.1-t*1.3+sin(streamWorld.y*1.8+t*.4));
        float crossRipple=sin(streamWorld.x*1.7-streamWorld.y*4.3+t*.9);
        float glint=pow(max(0.0,ripple*crossRipple),10.0);
        float bank=smoothstep(.32,.5,abs(streamUv.x-.5));
        float foam=bank*smoothstep(.55,.95,ripple)*.28;
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.19,.42,.44),.28);
        diffuseColor.rgb += vec3(.28,.43,.40)*(glint*.38+foam);
        diffuseColor.rgb *= .94+ripple*.06;`)
  }
  material.customProgramCacheKey = () => 'forest-stream-v2'
  return material
}

export function forestGlow(color: number, size: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 glowUv; void main(){glowUv=uv;
      vec4 center=modelViewMatrix*vec4(0.,0.,0.,1.);
      center.xy+=position.xy;gl_Position=projectionMatrix*center;}`,
    fragmentShader: `varying vec2 glowUv; uniform vec3 tint;
      void main(){float r=length(glowUv-.5)*2.;float a=pow(max(0.,1.-r),3.);
      gl_FragColor=vec4(tint,a*.42);}`,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size,size),material)
  mesh.name = 'Soft ambient glow'
  return mesh
}
