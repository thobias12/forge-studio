import * as THREE from 'three'

const surfaceNoise = `
float surfaceHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float surfaceNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(surfaceHash(i),surfaceHash(i+vec2(1,0)),f.x),mix(surfaceHash(i+vec2(0,1)),surfaceHash(i+vec2(1,1)),f.x),f.y);}
float surfaceFbm(vec2 p){return surfaceNoise(p)*.57+surfaceNoise(p*2.07)*.28+surfaceNoise(p*4.13)*.15;}
`

export function forestPathMaterial(main:boolean) {
  const material=new THREE.MeshStandardMaterial({
    color:main?0x786851:0x716d52,roughness:1,transparent:true,depthWrite:false,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  })
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 trailUv; varying vec2 trailWorld;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntrailUv=uv;trailWorld=position.xz;')
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 trailUv; varying vec2 trailWorld;\n'+surfaceNoise)
      .replace('#include <color_fragment>',`#include <color_fragment>
        float broad=surfaceFbm(trailWorld*.8);
        float grit=surfaceNoise(trailWorld*18.);
        float edge=min(trailUv.x,1.-trailUv.x);
        float ragged=surfaceNoise(trailWorld*3.)*.065+surfaceNoise(trailWorld*.6)*.045;
        diffuseColor.a*=smoothstep(ragged,.20+ragged,edge);
        float wear=1.-smoothstep(.05,.32,abs(trailUv.x-.5)+(broad-.5)*.12);
        float pebble=smoothstep(.77,.87,grit);
        float fineFade=1.-smoothstep(.08,.32,length(fwidth(trailWorld)));
        diffuseColor.rgb*=.61+broad*.38+wear*.17+(grit-.5)*.10*fineFade;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.32,pebble*.35*fineFade);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.66,.8,.62),(1.-smoothstep(.06,.27,edge))*.22);`)
  }
  material.customProgramCacheKey=()=> 'forest-trail-v3'
  return material
}

export function forestWaterMaterial() {
  const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.42,metalness:0,
    emissive:0x071d22,emissiveIntensity:.08,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})
  material.onBeforeCompile=shader=>{
    const time={value:0};shader.uniforms.forestWaterTime=time;material.userData.forestWaterTime=time
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 streamUv; varying vec2 streamWorld;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nstreamUv=uv;streamWorld=position.xz;')
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float forestWaterTime; varying vec2 streamUv; varying vec2 streamWorld;\n'+surfaceNoise)
      .replace('#include <color_fragment>',`#include <color_fragment>
        float t=forestWaterTime;
        vec2 flow=vec2(streamUv.x*7.,streamUv.y*.65-t*.32);
        float ripples=surfaceFbm(flow*vec2(1.5,2.));
        float bank=pow(abs(streamUv.x*2.-1.),3.);
        vec3 deep=vec3(.025,.105,.125), shallow=vec3(.14,.24,.19);
        diffuseColor.rgb=mix(deep,shallow,bank*.85);
        float reflection=surfaceFbm(vec2(streamWorld.x*.38,streamWorld.y*.38+t*.012));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.29,.31),smoothstep(.38,.72,reflection)*.15);
        float streak=smoothstep(.64,.78,ripples);
        float foam=bank*smoothstep(.63,.80,surfaceNoise(flow*2.))* .18;
        diffuseColor.rgb+=vec3(.23,.34,.32)*(streak*.25+foam);
        diffuseColor.rgb*=.90+ripples*.2;`)
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float wave=surfaceNoise(vec2(streamUv.x*12.,streamUv.y*1.3-forestWaterTime*.65));
        normal=normalize(normal+vec3(dFdx(wave),dFdy(wave),0.)*.035);`)
  }
  material.customProgramCacheKey=()=> 'forest-stream-v3'
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
