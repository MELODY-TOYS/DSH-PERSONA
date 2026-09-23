import { WebGLRenderer, Scene, OrthographicCamera, SphereGeometry, Mesh, ShaderMaterial, FrontSide, NormalBlending } from 'three';

const vertexShader = /* glsl */`
uniform float uTime;
uniform float uPhase;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vec3 n = normalize(normal);
  float t = uTime * 1.5 + uPhase;
  float a = dot(n, vec3(4.1, 2.3, 1.7)) + t;
  float b = dot(n, vec3(-2.4, 5.3, 3.1)) - t * .71;
  float wave = sin(a) * sin(b) * .010;
  vec3 gradient = .010 * (cos(a) * sin(b) * vec3(4.1, 2.3, 1.7) + sin(a) * cos(b) * vec3(-2.4, 5.3, 3.1));
  vec3 perturbed = normalize(n - (gradient - n * dot(gradient, n)));
  vec3 p = position * (1.0 + wave);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vNormal = normalize(normalMatrix * perturbed);
  vView = -mv.xyz;
  vLocal = n;
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */`
uniform float uTime;
uniform float uPhase;
uniform float uOpacity;
uniform float uLight;
uniform vec2 uPointer;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;

mat3 yaw(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
mat3 pitch(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
float softbox(vec3 ray, vec3 direction, vec2 size) {
  vec3 forward = normalize(direction);
  vec3 right = normalize(cross(vec3(0., 1., 0.), forward));
  vec3 up = cross(forward, right);
  float z = dot(ray, forward);
  vec2 q = vec2(dot(ray, right), dot(ray, up)) / max(z, .01);
  vec2 d = abs(q) - size;
  float sdf = length(max(d, 0.)) + min(max(d.x, d.y), 0.);
  return (1. - smoothstep(-.035, .04, sdf)) * smoothstep(.1, .3, z);
}
void main() {
  vec3 n = normalize(vNormal);
  // Orthographic view rays remain parallel; the curved surface supplies the reflection angle.
  vec3 view = vec3(0., 0., 1.);
  float nv = clamp(dot(n, view), 0., 1.);
  float time = uTime;
  float flow = sin(vLocal.y * 6. + time * 1.6 + uPhase) * sin(vLocal.x * 5. - time * .9);
  vec3 bend = vec3(cos(vLocal.y * 6. + time * 1.6 + uPhase), sin(vLocal.x * 5. - time * .9), 0.);
  n = normalize(n + bend * (.015 + .007 * flow));
  vec3 reflected = reflect(-view, n);
  float sweep = sin(time * .83 + uPhase) * .28 + uPointer.x * .20;
  mat3 environment = pitch(sin(time * .56 + uPhase) * .12 + uPointer.y * .15) * yaw(sweep);
  vec3 ray = environment * reflected;
  float key = softbox(ray, vec3(-1.25, 1.25, .65), vec2(.17, .58));
  float keySoft = softbox(ray, vec3(-1.27, 1.21, .63), vec2(.23, .62));
  float strip = softbox(ray, vec3(1.5, -.15, .22), vec2(.085, .82));
  float top = softbox(ray, vec3(.20, 1.55, -.65), vec2(.50, .065));
  vec3 backRay = environment * reflect(-view, vec3(-n.xy, n.z));
  float back = softbox(backRay, vec3(-1.25, 1.25, .65), vec2(.065, .30)) * .16;

  float fresnel = .020 + .980 * pow(1. - nv, 3.25);
  float thickness = 325. + 42. * sin(vLocal.y * 4. + time * 1.2 + uPhase) + 19. * flow;
  float cosFilm = sqrt(max(.01, 1. - (1. - nv * nv) / (1.33 * 1.33)));
  vec3 phase = (12.56637 * 1.33 * thickness * cosFilm) / vec3(650., 510., 475.);
  vec3 film = .5 + .5 * cos(phase);
  film = mix(vec3(.25, .78, 1.), film, .24);

  float edge = pow(1. - nv, 6.);
  float thinRim = 1. - smoothstep(.025, .20, nv);
  float rimLight = .40 + .60 * pow(abs(dot(n.xy, normalize(vec2(-.65, .75)))), 2.);
  float alpha = .006 + fresnel * .14 + thinRim * rimLight * .64 + key * .68 + keySoft * .05 + strip * .32 + top * .20 + back;
  vec3 base = mix(vec3(.32, .72, .88), vec3(.03, .30, .43), uLight);
  vec3 color = mix(base, film, .50 + .20 * fresnel);
  color = mix(color, vec3(.95, 1., 1.), min(1., key * .96 + keySoft * .22 + back * 1.8));
  color += vec3(.08, .32, .39) * strip + vec3(.28, .24, .36) * top;
  color = mix(color, mix(vec3(.73, .94, 1.), vec3(.07, .46, .63), uLight), max(edge * .55, thinRim * .90));
  gl_FragColor = vec4(clamp(color, 0., 1.), clamp(alpha * uOpacity, 0., .93));
}`;


export function createHighBubbles(canvas) {
  let renderer = null, geometry = null, broken = false, disposed = false;
  const meshes = [], scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 2500); camera.position.z = 1000;
  function dispose() {
    if (disposed) return; disposed = true;
    for (const mesh of meshes) mesh.material.dispose();
    scene.clear(); geometry?.dispose();
    canvas.removeEventListener('webglcontextlost', lost);
    renderer?.dispose(); renderer?.forceContextLoss();
    canvas.width = canvas.height = 1;
  }
  function lost(event) { event.preventDefault(); broken = true; }
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.debug.onShaderError = () => { broken = true; };
    geometry = new SphereGeometry(1, 64, 48);
    canvas.addEventListener('webglcontextlost', lost);
  } catch (error) { dispose(); throw error; }
  function meshAt(index) {
    if (meshes[index]) return meshes[index];
    const material = new ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false, depthTest: false,
      side: FrontSide, blending: NormalBlending,
      uniforms: { uTime: { value: 0 }, uPhase: { value: 0 }, uOpacity: { value: 0 }, uLight: { value: 0 }, uPointer: { value: { x: 0, y: 0 } } }
    });
    const mesh = new Mesh(geometry, material); mesh.frustumCulled = false;
    meshes.push(mesh); scene.add(mesh); return mesh;
  }
  return {
    resize(width, height, ratio) {
      renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
      camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix();
    },
    clear() { if (!disposed && !broken) renderer.clear(); },
    draw(bubbles, { width, height, light, pointer }) {
      if (broken) throw new Error('Bubble WebGL renderer unavailable');
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i], mesh = meshAt(i), u = mesh.material.uniforms;
        mesh.visible = true;
        mesh.position.set(b.x - width / 2, height / 2 - b.y, i * .01);
        mesh.scale.set(b.r * (1 + b.wobble), b.r * (1 - b.wobble * .8), b.r);
        mesh.rotation.set(Math.sin(b.age / 340 + b.phase) * .20, b.age / 1500, 0);
        u.uTime.value = b.age / 1000; u.uPhase.value = b.phase; u.uOpacity.value = b.alpha; u.uLight.value = light ? 1 : 0;
        u.uPointer.value.x = pointer.x; u.uPointer.value.y = pointer.y;
      }
      for (let i = bubbles.length; i < meshes.length; i++) meshes[i].visible = false;
      renderer.render(scene, camera);
      if (broken) throw new Error('Bubble shader compilation failed');
    },
    dispose,
  };
}
