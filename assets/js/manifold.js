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
  // Ripple system
  // ------------------------------------------------------------

  const RIPPLE_LIFETIME = 1.8;

  const ripples = [];

  function createRipple(x, y) {
    ripples.push({
      x,
      y,
      age: 0,
      strength: 0.22,
      speed: 1.8,
      width: 0.14
    });

    // Keep the effect lightweight.
    if (ripples.length > 10) {
      ripples.shift();
    }
  }

  let lastRippleX = 0;
  let lastRippleY = 0;
  let rippleTimer = 0;

  // ------------------------------------------------------------
  // Convert mouse movement into ripples
  // ------------------------------------------------------------

  function updateRippleCreation(delta) {
    if (!mouseActive) {
      rippleTimer = 0;
      return;
    }

    rippleTimer += delta;

    const dx = targetMouse.x - lastRippleX;
    const dy = targetMouse.y - lastRippleY;

    const distance = Math.sqrt(dx * dx + dy * dy);

    // Create a ripple as the cursor moves.
    if (distance > 0.035 && rippleTimer > 0.045) {
      createRipple(targetMouse.x, targetMouse.y);

      lastRippleX = targetMouse.x;
      lastRippleY = targetMouse.y;

      rippleTimer = 0;
    }
  }

  // ------------------------------------------------------------
  // Advance ripple ages once per frame and report total energy
  // ------------------------------------------------------------

  function advanceRipples(delta) {
    let energy = 0;

    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];

      ripple.age += delta;

      if (ripple.age > RIPPLE_LIFETIME) {
        ripples.splice(i, 1);
        continue;
      }

      const fade = Math.exp(-ripple.age * 1.8);
      energy += fade * ripple.strength;
    }

    return energy;
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
    // Mouse-following soft deformation
    // ----------------------------------------------------------

    if (mouseActive) {
      const dx = nx - targetMouse.x;
      const dy = ny - targetMouse.y;

      const distance = Math.sqrt(dx * dx + dy * dy);

      const influence =
        Math.exp(-distance * distance * 7.0);

      z += influence * 0.12;
    }

    // ----------------------------------------------------------
    // Propagating ripples
    // ----------------------------------------------------------

    for (let i = ripples.length - 1; i >= 0; i--) {
      const ripple = ripples[i];

      const dx = nx - ripple.x;
      const dy = ny - ripple.y;

      const distance = Math.sqrt(dx * dx + dy * dy);

      const radius = ripple.age * ripple.speed;

      const ringDistance = distance - radius;

      // Gaussian ring.
      const ring =
        Math.exp(
          -(ringDistance * ringDistance) /
          (ripple.width * ripple.width)
        );

      // Fade with age.
      const fade = Math.exp(-ripple.age * 1.8);

      z +=
        Math.sin(ringDistance * 24) *
        ring *
        fade *
        ripple.strength;
    }

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

    const elapsed = clock.getElapsedTime();
    const delta = clock.getDelta();

    // Smooth mouse movement.
    mouse.lerp(targetMouse, 0.055);

    updateRippleCreation(delta);
    const rippleEnergy = advanceRipples(delta);
    updateGeometry(elapsed);

    // ----------------------------------------------------------
    // Ripple glow: brighten the mesh while ripples are active.
    // ----------------------------------------------------------

    const glow = Math.min(rippleEnergy, 1);

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
