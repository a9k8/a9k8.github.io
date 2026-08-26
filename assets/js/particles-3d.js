// 3D cube "particles" background (Three.js) - a drop-in replacement for the
// previous particles.js field, with the same functionality (drifting motion,
// nearby-node connecting lines, mouse hover-repulse) but rendered as small
// tumbling cubes instead of flat circles.

(function initParticles3D() {
    const container = document.getElementById('particles-3d-container');
    if (!container || typeof THREE === 'undefined') return;

    // Matches the previous particles.js config: 80 particles, teal accent,
    // 150px link distance, 80px hover-repulse radius.
    const CUBE_COUNT = 80;
    const CUBE_COLOR = 0x4ec9b0;
    const LINK_DISTANCE_PX = 150;
    const LINE_OPACITY = 0.5;
    const REPULSE_RADIUS_PX = 80;
    const REPULSE_STRENGTH = 0.02;
    const DRIFT_SPEED = 0.004; // world units/frame, roughly matching the old "speed: 3" feel

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 14);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Visible frustum half-extents at a given depth (z), used both to scatter
    // cubes across the full viewport and to bounce them off its edges.
    function halfExtentsAtZ(z) {
        const dist = camera.position.z - z;
        const halfHeight = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const halfWidth = halfHeight * camera.aspect;
        return { halfWidth, halfHeight };
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({
        color: CUBE_COLOR,
        transparent: true,
        opacity: 0.7
    });

    const cubes = [];
    for (let i = 0; i < CUBE_COUNT; i++) {
        const z = (Math.random() - 0.5) * 4; // slight depth spread for parallax
        const { halfWidth, halfHeight } = halfExtentsAtZ(z);
        const mesh = new THREE.Mesh(geometry, material.clone());
        const size = 0.09 + Math.random() * 0.09; // small, size varies like the old random particle size
        mesh.scale.setScalar(size);
        mesh.position.set(
            (Math.random() * 2 - 1) * halfWidth,
            (Math.random() * 2 - 1) * halfHeight,
            z
        );
        mesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 0);
        scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        cubes.push({
            mesh,
            vx: Math.cos(angle) * DRIFT_SPEED * (0.5 + Math.random()),
            vy: Math.sin(angle) * DRIFT_SPEED * (0.5 + Math.random()),
            spinX: (Math.random() - 0.5) * 0.02,
            spinY: (Math.random() - 0.5) * 0.02,
            screenX: 0,
            screenY: 0
        });
    }

    // Connecting lines between nearby cubes, rebuilt every frame - same
    // "constellation" look as particles.js's line_linked option.
    const MAX_LINE_VERTICES = CUBE_COUNT * CUBE_COUNT; // worst case, every pair linked
    const linePositions = new Float32Array(MAX_LINE_VERTICES * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({
        color: CUBE_COLOR,
        transparent: true,
        opacity: LINE_OPACITY
    });
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    lineSegments.frustumCulled = false;
    scene.add(lineSegments);

    let mouseScreenX = -9999;
    let mouseScreenY = -9999;
    window.addEventListener('mousemove', (e) => {
        mouseScreenX = e.clientX;
        mouseScreenY = e.clientY;
    });
    window.addEventListener('mouseleave', () => {
        mouseScreenX = -9999;
        mouseScreenY = -9999;
    });

    const _tmpVec = new THREE.Vector3();

    function toScreen(worldPos) {
        _tmpVec.copy(worldPos).project(camera);
        return {
            x: (_tmpVec.x * 0.5 + 0.5) * window.innerWidth,
            y: (1 - (_tmpVec.y * 0.5 + 0.5)) * window.innerHeight
        };
    }

    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    function animate() {
        requestAnimationFrame(animate);

        cubes.forEach((c) => {
            const { halfWidth, halfHeight } = halfExtentsAtZ(c.mesh.position.z);

            c.mesh.position.x += c.vx;
            c.mesh.position.y += c.vy;
            if (c.mesh.position.x > halfWidth || c.mesh.position.x < -halfWidth) c.vx *= -1;
            if (c.mesh.position.y > halfHeight || c.mesh.position.y < -halfHeight) c.vy *= -1;

            c.mesh.rotation.x += c.spinX;
            c.mesh.rotation.y += c.spinY;

            const screen = toScreen(c.mesh.position);
            c.screenX = screen.x;
            c.screenY = screen.y;

            // Hover-repulse: push cubes away from the cursor in screen space,
            // then translate that into a world-space nudge.
            const dx = c.screenX - mouseScreenX;
            const dy = c.screenY - mouseScreenY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < REPULSE_RADIUS_PX && dist > 0) {
                const force = (1 - dist / REPULSE_RADIUS_PX) * REPULSE_STRENGTH;
                c.mesh.position.x += (dx / dist) * force;
                c.mesh.position.y += (dy / dist) * force;
            }
        });

        // Rebuild the link-line buffer from scratch each frame.
        let vertexIndex = 0;
        for (let i = 0; i < cubes.length; i++) {
            for (let j = i + 1; j < cubes.length; j++) {
                const dx = cubes[i].screenX - cubes[j].screenX;
                const dy = cubes[i].screenY - cubes[j].screenY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < LINK_DISTANCE_PX) {
                    const a = cubes[i].mesh.position;
                    const b = cubes[j].mesh.position;
                    linePositions[vertexIndex++] = a.x;
                    linePositions[vertexIndex++] = a.y;
                    linePositions[vertexIndex++] = a.z;
                    linePositions[vertexIndex++] = b.x;
                    linePositions[vertexIndex++] = b.y;
                    linePositions[vertexIndex++] = b.z;
                }
            }
        }
        lineGeometry.setDrawRange(0, vertexIndex / 3);
        lineGeometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
    }
    animate();
})();
