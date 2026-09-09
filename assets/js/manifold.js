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
  // Manifold parameters
  // ------------------------------------------------------------

  const SEG_X = 120;
  const SEG_Y = 68;

  // Extra size beyond the exact camera frustum so that the slow
  // rotation and mouse tilt never reveal an edge of the mesh.
  const FILL_MARGIN = 1.45;

  // How pronounced the saddle (hyperbolic paraboloid) curvature is.
  const CURVE_STRENGTH = 0.85;

  let WIDTH = 1;
  let HEIGHT = 1;

  function computeFillSize() {
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight =
      2 * Math.tan(vFov / 2) * Math.abs(camera.position.z);

    const visibleWidth = visibleHeight * camera.aspect;

    return {
      width: visibleWidth * FILL_MARGIN,
      height: visibleHeight * FILL_MARGIN
    };
  }

  // ------------------------------------------------------------
  // Create manifold
  // ------------------------------------------------------------

  const material = new THREE.MeshBasicMaterial({
    color: 0x5264a8,
    transparent: true,
    opacity: 0.045,
    side: THREE.DoubleSide,
    wireframe: false
  });

  const surface = new THREE.Mesh(new THREE.BufferGeometry(), material);

  surface.rotation.x = -0.22;

  scene.add(surface);

  let positions = null;
  let basePositions = null;

  function rebuildSurfaceGeometry(width, height) {
    const geometry = new THREE.PlaneGeometry(
      width,
      height,
      SEG_X,
      SEG_Y
    );

    positions = geometry.attributes.position;
    basePositions = new Float32Array(positions.array);

    surface.geometry.dispose();
    surface.geometry = geometry;
  }

  // ------------------------------------------------------------
  // Live wireframe
  // ------------------------------------------------------------

  const baseWireOpacity = 0.22;
  const glowWireOpacity = 0.5;

  const baseColor = new THREE.Color(0x5868a0);
  const glowColor = new THREE.Color(0x8fb2ff);

  const wireMaterial = new THREE.LineBasicMaterial({
    color: baseColor.clone(),
    transparent: true,
    opacity: baseWireOpacity
  });

  const wirePositions = [];

  // Horizontal lines
  for (let y = 0; y <= SEG_Y; y++) {
    for (let x = 0; x < SEG_X; x++) {
      const a = y * (SEG_X + 1) + x;
      const b = a + 1;

      wirePositions.push(a, b);
    }
  }

  // Vertical lines
  for (let y = 0; y < SEG_Y; y++) {
    for (let x = 0; x <= SEG_X; x++) {
      const a = y * (SEG_X + 1) + x;
      const b = a + SEG_X + 1;

      wirePositions.push(a, b);
    }
  }

  const wireVertexCount = wirePositions.length;

  const wireArray = new Float32Array(wireVertexCount * 3);

  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(wireArray, 3)
  );

  const wireframe = new THREE.LineSegments(
    wireGeometry,
    wireMaterial
  );

  wireframe.rotation.copy(surface.rotation);

  scene.add(wireframe);

  // ------------------------------------------------------------
  // Mouse state
  // ------------------------------------------------------------

  const mouse = new THREE.Vector2(0, 0);
  const targetMouse = new THREE.Vector2(0, 0);

  let mouseActive = false;

  window.addEventListener("mousemove", (event) => {
    targetMouse.x =
      (event.clientX / window.innerWidth) * 2 - 1;

    targetMouse.y =
      -(event.clientY / window.innerHeight) * 2 + 1;

    mouseActive = true;
  });

  window.addEventListener("mouseleave", () => {
    mouseActive = false;
  });

  document.addEventListener("mouseleave", () => {
    mouseActive = false;
  });

  // ------------------------------------------------------------
  // Ripple system: a small 2D wave-equation fluid grid, the same
  // technique water-ripple plugins (e.g. jquery.ripples) use on a
  // WebGL texture -- height + velocity fields updated with a
  // discrete Laplacian, sampled by the mesh instead of a shader.
  // ------------------------------------------------------------

  const CELL_SIZE = 0.25;
  const WAVE_SPREAD = 2.0;
  const DAMPING = 0.985;
  const DROP_RADIUS = 1.1;
  const DROP_STRENGTH = 1.1;
  const RIPPLE_Z_SCALE = 0.32;

  let gridW = 1;
  let gridH = 1;

  let heightA = new Float32Array(1);
  let velocityA = new Float32Array(1);
  let heightB = new Float32Array(1);
  let velocityB = new Float32Array(1);

  function rebuildFluidGrid(width, height) {
    gridW = Math.max(4, Math.round(width / CELL_SIZE));
    gridH = Math.max(4, Math.round(height / CELL_SIZE));

    const size = gridW * gridH;

    heightA = new Float32Array(size);
    velocityA = new Float32Array(size);
    heightB = new Float32Array(size);
    velocityB = new Float32Array(size);
  }

  function cellAt(field, gx, gy) {
    const cx = gx < 0 ? 0 : gx >= gridW ? gridW - 1 : gx;
    const cy = gy < 0 ? 0 : gy >= gridH ? gridH - 1 : gy;

    return field[cy * gridW + cx];
  }

  // World-space (mesh-local) coordinates to fractional grid coordinates.
  function worldToGrid(x, y) {
    return {
      gx: (x / WIDTH + 0.5) * (gridW - 1),
      gy: (y / HEIGHT + 0.5) * (gridH - 1)
    };
  }

  function stepFluid() {
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const i = gy * gridW + gx;

        const average =
          (cellAt(heightA, gx - 1, gy) +
            cellAt(heightA, gx + 1, gy) +
            cellAt(heightA, gx, gy - 1) +
            cellAt(heightA, gx, gy + 1)) *
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
  function injectDrop(x, y, radius, strength) {
    const { gx: cgx, gy: cgy } = worldToGrid(x, y);
    const cellRadius = radius / CELL_SIZE;

    const minGx = Math.max(0, Math.floor(cgx - cellRadius));
    const maxGx = Math.min(gridW - 1, Math.ceil(cgx + cellRadius));
    const minGy = Math.max(0, Math.floor(cgy - cellRadius));
    const maxGy = Math.min(gridH - 1, Math.ceil(cgy + cellRadius));

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const dx = gx - cgx;
        const dy = gy - cgy;

        const dist = Math.sqrt(dx * dx + dy * dy) / cellRadius;

        if (dist > 1) continue;

        const drop = 0.5 - Math.cos(dist * Math.PI) * 0.5;

        heightA[gy * gridW + gx] += drop * strength;
      }
    }
  }

  // Bilinear-sample the height field at a world-space coordinate.
  function sampleRipple(x, y) {
    const { gx, gy } = worldToGrid(x, y);

    const gx0 = Math.floor(gx);
    const gy0 = Math.floor(gy);

    const tx = gx - gx0;
    const ty = gy - gy0;

    const h00 = cellAt(heightA, gx0, gy0);
    const h10 = cellAt(heightA, gx0 + 1, gy0);
    const h01 = cellAt(heightA, gx0, gy0 + 1);
    const h11 = cellAt(heightA, gx0 + 1, gy0 + 1);

    const top = h00 + (h10 - h00) * tx;
    const bottom = h01 + (h11 - h01) * tx;

    return top + (bottom - top) * ty;
  }

  let lastDropX = 0;
  let lastDropY = 0;
  let dropTimer = 0;

  function mouseWorldPosition() {
    // The mesh extends past the camera frustum by FILL_MARGIN, so
    // screen-space NDC only covers the inner 1 / FILL_MARGIN of it.
    return {
      x: (targetMouse.x * WIDTH) / (2 * FILL_MARGIN),
      y: (targetMouse.y * HEIGHT) / (2 * FILL_MARGIN)
    };
  }

  function updateDropInjection(delta) {
    if (!mouseActive) {
      dropTimer = 0;
      return;
    }

    dropTimer += delta;

    const { x, y } = mouseWorldPosition();

    const dx = x - lastDropX;
    const dy = y - lastDropY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > CELL_SIZE * 0.8 && dropTimer > 0.04) {
      injectDrop(x, y, DROP_RADIUS, DROP_STRENGTH);

      lastDropX = x;
      lastDropY = y;
      dropTimer = 0;
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
  // Surface deformation
  // ------------------------------------------------------------

  function deformVertex(x, y, time) {
    let z = 0;

    // ----------------------------------------------------------
    // Saddle curvature: makes this an actual curved manifold
    // instead of a flat plane with waves on top.
    // ----------------------------------------------------------

    const nx = x / (WIDTH * 0.5);
    const ny = y / (HEIGHT * 0.5);

    z += (nx * nx - ny * ny) * CURVE_STRENGTH;

    // ----------------------------------------------------------
    // Base manifold waves
    // ----------------------------------------------------------

    const baseWave =
      Math.sin(x * 1.15 + time * 0.35) *
      0.08 *
      Math.exp(-Math.abs(y) * 0.25);

    const secondaryWave =
      Math.sin(y * 2.2 - time * 0.25) *
      0.035;

    z += baseWave + secondaryWave;

    // ----------------------------------------------------------
    // Fluid ripples
    // ----------------------------------------------------------

    z += sampleRipple(x, y) * RIPPLE_Z_SCALE;

    return z;
  }

  // ------------------------------------------------------------
  // Update geometry
  // ------------------------------------------------------------

  function updateGeometry(time) {
    for (let i = 0; i < positions.count; i++) {
      const baseIndex = i * 3;

      const x = basePositions[baseIndex];
      const y = basePositions[baseIndex + 1];

      const z = deformVertex(x, y, time);

      positions.array[baseIndex] = x;
      positions.array[baseIndex + 1] = y;
      positions.array[baseIndex + 2] = z;
    }

    positions.needsUpdate = true;
    surface.geometry.computeBoundingSphere();

    // ----------------------------------------------------------
    // Update wireframe from the SAME deformed surface
    // ----------------------------------------------------------

    let w = 0;

    for (let i = 0; i < wirePositions.length; i++) {
      const vertexIndex = wirePositions[i];

      const baseIndex = vertexIndex * 3;

      const x = basePositions[baseIndex];
      const y = basePositions[baseIndex + 1];

      const z = deformVertex(x, y, time);

      wireArray[w++] = x;
      wireArray[w++] = y;
      wireArray[w++] = z + 0.002;
    }

    wireGeometry.attributes.position.needsUpdate = true;
    wireGeometry.computeBoundingSphere();
  }

  // ------------------------------------------------------------
  // Animation
  // ------------------------------------------------------------

  const clock = new THREE.Clock();
  const tmpColor = new THREE.Color();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsed = clock.elapsedTime;

    // Smooth mouse movement.
    mouse.lerp(targetMouse, 0.055);

    updateDropInjection(delta);
    stepFluid();
    updateGeometry(elapsed);

    // ----------------------------------------------------------
    // Ripple glow: brighten the mesh while ripples are active.
    // ----------------------------------------------------------

    const glow = Math.min(rippleEnergy() * 1.4, 1);

    wireMaterial.opacity =
      baseWireOpacity + glow * (glowWireOpacity - baseWireOpacity);

    tmpColor.copy(baseColor).lerp(glowColor, glow);
    wireMaterial.color.copy(tmpColor);

    material.opacity = 0.045 + glow * 0.05;

    // ----------------------------------------------------------
    // Continuous slow rotation
    // ----------------------------------------------------------

    surface.rotation.y =
      Math.sin(elapsed * 0.16) * 0.22;

    surface.rotation.z =
      Math.sin(elapsed * 0.11) * 0.035;

    surface.rotation.x =
      -0.22 +
      Math.cos(elapsed * 0.13) * 0.025;

    // Same orientation for wireframe.
    wireframe.rotation.copy(surface.rotation);

    // ----------------------------------------------------------
    // Mouse-controlled orientation
    // ----------------------------------------------------------

    surface.rotation.y += mouse.x * 0.10;
    surface.rotation.x += mouse.y * 0.055;

    wireframe.rotation.copy(surface.rotation);

    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------
  // Sizing: keep the manifold spanning the full viewport
  // ------------------------------------------------------------

  function applyFillSize() {
    const size = computeFillSize();

    WIDTH = size.width;
    HEIGHT = size.height;

    rebuildSurfaceGeometry(WIDTH, HEIGHT);
    rebuildFluidGrid(WIDTH, HEIGHT);
  }

  applyFillSize();
  animate();

  // ------------------------------------------------------------
  // Resize
  // ------------------------------------------------------------

  window.addEventListener("resize", () => {
    camera.aspect =
      window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );

    applyFillSize();
  });

})();
