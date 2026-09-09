(() => {
  if (typeof THREE === "undefined") {
    console.error("Three.js is required for manifold.js");
    return;
  }

  const container = document.getElementById("manifold-bg");

  if (!container) {
    console.error("Missing #manifold-bg container");
    return;
  }

  // ------------------------------------------------------------
  // Scene
  // ------------------------------------------------------------

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );

  camera.position.set(0, 0, 7.5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  container.appendChild(renderer.domElement);

  renderer.domElement.style.position = "fixed";
  renderer.domElement.style.inset = "0";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.pointerEvents = "none";
  renderer.domElement.style.zIndex = "-1";

  // ------------------------------------------------------------
  // Pseudosphere parameters
  //
  // The pseudosphere (tractricoid) is the classic 3D embedding of a
  // patch of the hyperbolic plane: a surface of revolution with
  // constant negative Gaussian curvature everywhere. Parametrized by
  // u (along the horn, 0 = wide rim, U_MAX = tapered tip) and v
  // (angle around the axis):
  //
  //   r(u) = sech(u)            radius at u
  //   h(u) = u - tanh(u)        axial position at u
  //   x = r(u) * cos(v)
  //   y = h(u)
  //   z = r(u) * sin(v)
  // ------------------------------------------------------------

  const U_SEGMENTS = 90;
  const V_SEGMENTS = 56;
  const U_MAX = 3.3;

  const ROWS = U_SEGMENTS + 1;
  const COLS = V_SEGMENTS + 1; // last column duplicates column 0 (seam) for clean UVs

  const H_MAX = U_MAX - Math.tanh(U_MAX);

  // How tall (in world units) the whole horn should be; recomputed
  // per viewport so it stays a prominent, well-framed centerpiece.
  const TARGET_HEIGHT_FRACTION = 0.85;

  let SCALE = 1;

  function computeScale() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight =
      2 * Math.tan(vFov / 2) * Math.abs(camera.position.z);

    return (visibleHeight * TARGET_HEIGHT_FRACTION) / H_MAX;
  }

  // Static (u, v) parameters per vertex -- the undeformed lattice.
  const paramU = new Float32Array(ROWS * COLS);
  const paramV = new Float32Array(ROWS * COLS);

  for (let i = 0; i < ROWS; i++) {
    const u = (i / U_SEGMENTS) * U_MAX;

    for (let j = 0; j < COLS; j++) {
      const v = ((j % V_SEGMENTS) / V_SEGMENTS) * Math.PI * 2;

      const idx = i * COLS + j;
      paramU[idx] = u;
      paramV[idx] = v;
    }
  }

  // ------------------------------------------------------------
  // Geometry: a real surface-of-revolution mesh, not a flat grid.
  // ------------------------------------------------------------

  const vertexCount = ROWS * COLS;
  const positionArray = new Float32Array(vertexCount * 3);
  const uvArray = new Float32Array(vertexCount * 2);

  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < COLS; j++) {
      const idx = i * COLS + j;
      uvArray[idx * 2] = i / U_SEGMENTS;
      uvArray[idx * 2 + 1] = j / V_SEGMENTS;
    }
  }

  const indices = [];
  for (let i = 0; i < U_SEGMENTS; i++) {
    for (let j = 0; j < V_SEGMENTS; j++) {
      const a = i * COLS + j;
      const b = i * COLS + j + 1;
      const c = (i + 1) * COLS + j;
      const d = (i + 1) * COLS + j + 1;

      indices.push(a, b, d, a, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positionArray, 3)
  );
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvArray, 2));
  geometry.setIndex(indices);

  const material = new THREE.MeshBasicMaterial({
    color: 0x5264a8,
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    wireframe: false
  });

  const surface = new THREE.Mesh(geometry, material);

  scene.add(surface);

  // ------------------------------------------------------------
  // Live wireframe (same deformed vertices, drawn as line segments)
  // ------------------------------------------------------------

  const baseWireOpacity = 0.24;
  const glowWireOpacity = 0.55;

  const baseColor = new THREE.Color(0x5868a0);
  const glowColor = new THREE.Color(0x8fb2ff);

  const wireMaterial = new THREE.LineBasicMaterial({
    color: baseColor.clone(),
    transparent: true,
    opacity: baseWireOpacity
  });

  const wirePositions = [];

  // Circumferential rings (v-direction).
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < V_SEGMENTS; j++) {
      wirePositions.push(i * COLS + j, i * COLS + j + 1);
    }
  }

  // Longitudinal ribs (u-direction).
  for (let j = 0; j < COLS; j++) {
    for (let i = 0; i < U_SEGMENTS; i++) {
      wirePositions.push(i * COLS + j, (i + 1) * COLS + j);
    }
  }

  const wireArray = new Float32Array(wirePositions.length * 3);

  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(wireArray, 3)
  );

  const wireframe = new THREE.LineSegments(wireGeometry, wireMaterial);

  scene.add(wireframe);

  // ------------------------------------------------------------
  // Mouse state
  // ------------------------------------------------------------

  const mouse = new THREE.Vector2(0, 0);
  const targetMouse = new THREE.Vector2(0, 0);

  let mouseActive = false;

  window.addEventListener("mousemove", (event) => {
    targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    mouseActive = true;
  });

  window.addEventListener("mouseleave", () => {
    mouseActive = false;
  });

  document.addEventListener("mouseleave", () => {
    mouseActive = false;
  });

  // ------------------------------------------------------------
  // Ripple system: a 2D wave-equation fluid grid living directly on
  // the (u, v) parameter space of the horn -- same technique
  // water-ripple plugins (e.g. jquery.ripples) run on a flat WebGL
  // texture, except here the domain is curved into 3D by the
  // pseudosphere formulas above. v wraps around (it's an angle);
  // u is clamped (the horn has two open, non-periodic ends.
  // ------------------------------------------------------------

  const WAVE_SPREAD = 2.0;
  const DAMPING = 0.985;
  const DROP_RADIUS_CELLS = 4.2;
  const DROP_STRENGTH = 1.1;
  const RIPPLE_RADIAL_SCALE = 0.22;

  const fluidSize = ROWS * V_SEGMENTS;
  let heightA = new Float32Array(fluidSize);
  let velocityA = new Float32Array(fluidSize);
  let heightB = new Float32Array(fluidSize);
  let velocityB = new Float32Array(fluidSize);

  function fluidAt(field, row, col) {
    const r = row < 0 ? 0 : row >= ROWS ? ROWS - 1 : row;
    const c = ((col % V_SEGMENTS) + V_SEGMENTS) % V_SEGMENTS;

    return field[r * V_SEGMENTS + c];
  }

  function stepFluid() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < V_SEGMENTS; col++) {
        const i = row * V_SEGMENTS + col;

        const average =
          (fluidAt(heightA, row - 1, col) +
            fluidAt(heightA, row + 1, col) +
            fluidAt(heightA, row, col - 1) +
            fluidAt(heightA, row, col + 1)) *
          0.25;

        let vel = velocityA[i] + (average - heightA[i]) * WAVE_SPREAD;
        vel *= DAMPING;

        heightB[i] = heightA[i] + vel;
        velocityB[i] = vel;
      }
    }

    const tmpH = heightA;
    heightA = heightB;
    heightB = tmpH;

    const tmpV = velocityA;
    velocityA = velocityB;
    velocityB = tmpV;
  }

  // Raised-cosine bump, same shape jquery.ripples uses for a drop.
  // (uNorm, vNorm) are fractional grid coordinates in [0, 1).
  function injectDrop(uNorm, vNorm, radiusCells, strength) {
    const cgu = uNorm * U_SEGMENTS;
    const cgv = vNorm * V_SEGMENTS;

    const minRow = Math.max(0, Math.floor(cgu - radiusCells));
    const maxRow = Math.min(ROWS - 1, Math.ceil(cgu + radiusCells));

    for (let row = minRow; row <= maxRow; row++) {
      for (
        let col = Math.floor(cgv - radiusCells);
        col <= Math.ceil(cgv + radiusCells);
        col++
      ) {
        const du = row - cgu;
        const dv = col - cgv;

        const dist = Math.sqrt(du * du + dv * dv) / radiusCells;

        if (dist > 1) continue;

        const drop = 0.5 - Math.cos(dist * Math.PI) * 0.5;
        const wrappedCol = ((col % V_SEGMENTS) + V_SEGMENTS) % V_SEGMENTS;

        heightA[row * V_SEGMENTS + wrappedCol] += drop * strength;
      }
    }
  }

  function rippleEnergy() {
    let maxAbs = 0;

    for (let i = 0; i < heightA.length; i++) {
      const abs = Math.abs(heightA[i]);
      if (abs > maxAbs) maxAbs = abs;
    }

    return maxAbs;
  }

  // ------------------------------------------------------------
  // Mouse picking: raycast against the real (rotating) mesh so
  // ripples land exactly where the cursor points, regardless of
  // how the horn is currently oriented.
  // ------------------------------------------------------------

  const raycaster = new THREE.Raycaster();

  let lastDropU = -1;
  let lastDropV = -1;
  let dropTimer = 0;

  function updateDropInjection(delta) {
    if (!mouseActive) {
      dropTimer = 0;
      return;
    }

    dropTimer += delta;
    if (dropTimer < 0.04) return;
    dropTimer = 0;

    raycaster.setFromCamera(targetMouse, camera);
    const hits = raycaster.intersectObject(surface, false);

    if (!hits.length || !hits[0].uv) return;

    const uNorm = hits[0].uv.x;
    const vNorm = hits[0].uv.y;

    if (lastDropU >= 0) {
      const du = uNorm - lastDropU;
      let dv = vNorm - lastDropV;
      if (dv > 0.5) dv -= 1;
      if (dv < -0.5) dv += 1;

      const distance = Math.sqrt(du * du + dv * dv);

      if (distance < 0.012) return;
    }

    injectDrop(uNorm, vNorm, DROP_RADIUS_CELLS, DROP_STRENGTH);

    lastDropU = uNorm;
    lastDropV = vNorm;
  }

  // ------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------

  const clock = new THREE.Clock();
  const tmpColor = new THREE.Color();

  function sech(x) {
    return 1 / Math.cosh(x);
  }

  function computeVertices(time) {
    const hOffset = H_MAX / 2;

    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < COLS; j++) {
        const idx = i * COLS + j;

        const u = paramU[idx];
        const v = paramV[idx];

        const simCol = j % V_SEGMENTS;
        const ripple = heightA[i * V_SEGMENTS + simCol];

        const liveWave =
          0.02 * Math.sin(u * 3.5 + time * 0.4) * Math.cos(v * 3);

        const radiusMod = 1 + liveWave + ripple * RIPPLE_RADIAL_SCALE;

        const r = sech(u) * SCALE * radiusMod;
        const h = (u - Math.tanh(u) - hOffset) * SCALE;

        positionArray[idx * 3] = r * Math.cos(v);
        positionArray[idx * 3 + 1] = h;
        positionArray[idx * 3 + 2] = r * Math.sin(v);
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingSphere();

    for (let k = 0; k < wirePositions.length; k++) {
      const vi = wirePositions[k];

      wireArray[k * 3] = positionArray[vi * 3];
      wireArray[k * 3 + 1] = positionArray[vi * 3 + 1];
      wireArray[k * 3 + 2] = positionArray[vi * 3 + 2];
    }

    wireGeometry.attributes.position.needsUpdate = true;
    wireGeometry.computeBoundingSphere();
  }

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    // Smooth mouse movement.
    mouse.lerp(targetMouse, 0.055);

    // ----------------------------------------------------------
    // Slow continuous tumble, plus a mouse-driven tilt.
    // ----------------------------------------------------------

    surface.rotation.y = elapsed * 0.09 + mouse.x * 0.35;

    surface.rotation.z =
      Math.sin(elapsed * 0.11) * 0.06;

    surface.rotation.x =
      0.32 +
      Math.cos(elapsed * 0.13) * 0.04 +
      mouse.y * 0.2;

    surface.updateMatrixWorld(true);
    wireframe.rotation.copy(surface.rotation);

    updateDropInjection(delta);
    stepFluid();
    computeVertices(elapsed);

    // ----------------------------------------------------------
    // Ripple glow: brighten the mesh while ripples are active.
    // ----------------------------------------------------------

    const glow = Math.min(rippleEnergy() * 1.4, 1);

    wireMaterial.opacity =
      baseWireOpacity + glow * (glowWireOpacity - baseWireOpacity);

    tmpColor.copy(baseColor).lerp(glowColor, glow);
    wireMaterial.color.copy(tmpColor);

    material.opacity = 0.05 + glow * 0.05;

    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------
  // Sizing
  // ------------------------------------------------------------

  function applySize() {
    SCALE = computeScale();
  }

  applySize();
  animate();

  // ------------------------------------------------------------
  // Resize
  // ------------------------------------------------------------

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    applySize();
  });

})();
