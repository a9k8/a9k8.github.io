/* Interactive latent-manifold background
 * Lightweight Three.js scene: one continuous hyperbolic surface with
 * restrained drafting lines and a soft cursor-induced deformation.
 */
(function () {
    if (!window.THREE) return;

    const host = document.getElementById('manifold-bg');
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 1.7, 9.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const group = new THREE.Group();
    group.rotation.x = -0.32;
    group.rotation.z = -0.035;
    scene.add(group);

    const cols = 150;
    const rows = 54;
    const positions = new Float32Array(cols * rows * 3);
    const base = new Float32Array(cols * rows * 3);
    const colors = new Float32Array(cols * rows * 3);
    const indices = [];

    const c1 = new THREE.Color('#537ea8');
    const c2 = new THREE.Color('#76658f');
    const c3 = new THREE.Color('#b27670');
    const c4 = new THREE.Color('#d49a50');

    function colorAt(t) {
        const out = new THREE.Color();
        if (t < 0.42) out.lerpColors(c1, c2, t / 0.42);
        else if (t < 0.72) out.lerpColors(c2, c3, (t - 0.42) / 0.30);
        else out.lerpColors(c3, c4, (t - 0.72) / 0.28);
        return out;
    }

    function surface(u, v) {
        // u: longitudinal direction, v: transverse direction.
        // The central term v^2 - u^2 gives the surface a genuine saddle-like
        // negative-curvature character; the envelope creates the funnel/wave.
        const envelope = 0.48 + 0.72 * Math.exp(-0.08 * (u + 2.5) ** 2) + 0.14 * Math.cos(0.75 * u);
        const vv = v * envelope;
        const z =
            0.44 * (vv * vv - 0.20 * u * u) +
            0.34 * Math.sin(1.12 * u) * (0.48 + 0.52 * Math.abs(v)) +
            0.10 * Math.cos(2.2 * v + 0.35 * u);
        const y = vv;
        return { x: u, y, z };
    }

    let p = 0;
    for (let i = 0; i < cols; i++) {
        const u = -5.2 + (10.4 * i) / (cols - 1);
        const t = i / (cols - 1);
        const col = colorAt(t);
        for (let j = 0; j < rows; j++) {
            const v = -1.45 + (2.9 * j) / (rows - 1);
            const s = surface(u, v);
            const k = p * 3;
            positions[k] = base[k] = s.x;
            positions[k + 1] = base[k + 1] = s.y;
            positions[k + 2] = base[k + 2] = s.z;
            colors[k] = col.r;
            colors[k + 1] = col.g;
            colors[k + 2] = col.b;
            p++;
        }
    }

    for (let i = 0; i < cols - 1; i++) {
        for (let j = 0; j < rows - 1; j++) {
            const a = i * rows + j;
            const b = (i + 1) * rows + j;
            const c = (i + 1) * rows + j + 1;
            const d = i * rows + j + 1;
            indices.push(a, b, d, b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const surfaceMaterial = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
    group.add(surfaceMesh);

    const wireMaterial = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.34,
        depthWrite: false
    });
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), wireMaterial);
    group.add(wire);

    // A few longitudinal curves make the mathematical construction read clearly
    // without turning the background into a dense particle animation.
    const curveGroup = new THREE.Group();
    curveGroup.position.y = -0.02;
    group.add(curveGroup);

    function addGuide(v, opacity) {
        const pts = [];
        for (let i = 0; i < 130; i++) {
            const u = -5.2 + (10.4 * i) / 129;
            const s = surface(u, v);
            pts.push(new THREE.Vector3(s.x, s.y, s.z + 0.018));
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        curveGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({
            color: 0x5d6670,
            transparent: true,
            opacity,
            depthWrite: false
        })));
    }
    [-1.05, -0.52, 0.52, 1.05].forEach(v => addGuide(v, 0.28));

    const mouse = new THREE.Vector2(99, 99);
    const smoothMouse = new THREE.Vector2(99, 99);
    const clock = new THREE.Clock();

    function onPointerMove(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    function resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        const scale = Math.max(0.86, Math.min(1.28, w / 1180));
        group.scale.set(scale, scale, scale);
        group.position.y = w < 700 ? -0.25 : -0.10;
    }
    window.addEventListener('resize', resize);
    resize();

    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        smoothMouse.lerp(mouse, 0.045);

        // Gentle idle motion keeps the manifold alive without looking like a screensaver.
        group.rotation.y = -0.08 + Math.sin(t * 0.18) * 0.018;
        group.rotation.x = -0.32 + Math.sin(t * 0.13) * 0.008;

        const pos = geometry.attributes.position.array;
        for (let i = 0; i < pos.length; i += 3) {
            const x = base[i];
            const y = base[i + 1];
            const mx = smoothMouse.x * 5.0;
            const my = smoothMouse.y * 2.4;
            const dx = x - mx;
            const dy = y - my;
            const d2 = dx * dx + dy * dy;
            const influence = Math.exp(-d2 / 1.65);
            const ambient = Math.sin(t * 0.7 + x * 0.72) * 0.018 * (0.25 + 0.75 * Math.abs(y));
            pos[i] = x;
            pos[i + 1] = y;
            pos[i + 2] = base[i + 2] + influence * 0.30 + ambient;
        }
        geometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
    }

    // Respect reduced-motion preferences.
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        animate();
    } else {
        renderer.render(scene, camera);
    }
})();
