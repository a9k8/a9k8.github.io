/* Full-screen interactive latent manifold
 * Sparse, continuous mathematical surface designed to sit behind readable content.
 * The surface reacts to the pointer without intercepting page clicks.
 */
(function () {
    if (!window.THREE) return;

    const host = document.getElementById('manifold-bg');
    if (!host) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 2.8, 12.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.5)
    );

    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');

    host.appendChild(renderer.domElement);

    /* ---------------------------------------------------------
       Main manifold
       --------------------------------------------------------- */

    const group = new THREE.Group();

    group.rotation.x = -0.48;
    group.rotation.z = -0.025;
    group.position.y = -0.15;

    scene.add(group);

    /*
     * Broad surface:
     * - wide enough to reach the viewport edges
     * - shallow enough not to dominate the text
     * - relatively low mesh density
     */
    const cols = 78;
    const rows = 22;

    const width = 16.8;
    const depth = 7.0;

    const positions = new Float32Array(
        cols * rows * 3
    );

    const base = new Float32Array(
        cols * rows * 3
    );

    const colors = new Float32Array(
        cols * rows * 3
    );

    const indices = [];

    /* ---------------------------------------------------------
       Color palette
       --------------------------------------------------------- */

    const c1 = new THREE.Color('#527fa5');
    const c2 = new THREE.Color('#71668e');
    const c3 = new THREE.Color('#9b7180');
    const c4 = new THREE.Color('#c99555');

    function colorAt(t) {
        const out = new THREE.Color();

        if (t < 0.42) {
            out.lerpColors(
                c1,
                c2,
                t / 0.42
            );
        } else if (t < 0.72) {
            out.lerpColors(
                c2,
                c3,
                (t - 0.42) / 0.30
            );
        } else {
            out.lerpColors(
                c3,
                c4,
                (t - 0.72) / 0.28
            );
        }

        return out;
    }

    /* ---------------------------------------------------------
       Parametric manifold
       --------------------------------------------------------- */

    function surface(u, v) {

        /*
         * Left-side hyperbolic opening.
         * The rest transitions into a broad saddle-like latent
         * landscape rather than forming multiple disconnected
         * objects.
         */

        const funnel =
            1.0 +
            0.95 *
            Math.exp(
                -Math.pow(
                    (u + 6.0) / 2.35,
                    2
                )
            );

        const vv = v * funnel;

        const z =
            0.30 *
            (
                vv * vv / 2.9 -
                0.075 * u * u
            )

            +

            0.30 *
            Math.sin(u * 0.78) *
            (
                0.35 +
                0.65 *
                Math.abs(v) / 3.5
            )

            +

            0.07 *
            Math.cos(
                v * 1.15 +
                u * 0.28
            );

        return {
            x: u,
            y: vv,
            z: z
        };
    }

    /* ---------------------------------------------------------
       Generate vertices
       --------------------------------------------------------- */

    let p = 0;

    for (let i = 0; i < cols; i++) {

        const u =
            -width / 2 +
            width * i / (cols - 1);

        const t =
            i / (cols - 1);

        const col =
            colorAt(t);

        for (let j = 0; j < rows; j++) {

            const v =
                -depth / 2 +
                depth * j / (rows - 1);

            const s =
                surface(u, v);

            const k =
                p * 3;

            positions[k] =
                base[k] =
                s.x;

            positions[k + 1] =
                base[k + 1] =
                s.y;

            positions[k + 2] =
                base[k + 2] =
                s.z;

            colors[k] =
                col.r;

            colors[k + 1] =
                col.g;

            colors[k + 2] =
                col.b;

            p++;
        }
    }

    /* ---------------------------------------------------------
       Triangle indices
       --------------------------------------------------------- */

    for (let i = 0; i < cols - 1; i++) {

        for (let j = 0; j < rows - 1; j++) {

            const a =
                i * rows + j;

            const b =
                (i + 1) * rows + j;

            const c =
                (i + 1) * rows + j + 1;

            const d =
                i * rows + j + 1;

            indices.push(
                a,
                b,
                d,
                b,
                c,
                d
            );
        }
    }

    const geometry =
        new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(
            positions,
            3
        )
    );

    geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(
            colors,
            3
        )
    );

    geometry.setIndex(indices);

    /* ---------------------------------------------------------
       Very subtle surface fill
       --------------------------------------------------------- */

    const surfaceMaterial =
        new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.045,
            side: THREE.DoubleSide,
            depthWrite: false
        });

    group.add(
        new THREE.Mesh(
            geometry,
            surfaceMaterial
        )
    );

    /* ---------------------------------------------------------
       Sparse wireframe
       --------------------------------------------------------- */

    const wireMaterial =
        new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.17,
            depthWrite: false
        });

    const wire =
        new THREE.LineSegments(
            new THREE.WireframeGeometry(
                geometry
            ),
            wireMaterial
        );

    group.add(wire);

    /* ---------------------------------------------------------
       A few mathematical guide curves
       --------------------------------------------------------- */

    const guideGroup =
        new THREE.Group();

    group.add(guideGroup);

    function addGuide(v, opacity) {

        const pts = [];

        for (let i = 0; i < 110; i++) {

            const u =
                -width / 2 +
                width * i / 109;

            const s =
                surface(u, v);

            pts.push(
                new THREE.Vector3(
                    s.x,
                    s.y,
                    s.z + 0.035
                )
            );
        }

        const g =
            new THREE.BufferGeometry()
                .setFromPoints(pts);

        guideGroup.add(
            new THREE.Line(
                g,
                new THREE.LineBasicMaterial({
                    color: 0x65707a,
                    transparent: true,
                    opacity: opacity,
                    depthWrite: false
                })
            )
        );
    }

    [-2.1, 0, 2.1].forEach(
        v => addGuide(v, 0.13)
    );

    /* ---------------------------------------------------------
       Pointer interaction
       --------------------------------------------------------- */

    const pointer =
        new THREE.Vector2(99, 99);

    const smoothPointer =
        new THREE.Vector2(99, 99);

    let active = false;

    /*
     * The canvas itself uses pointer-events:none.
     * Therefore it never blocks website links.
     * We listen on window instead.
     */

    function onPointerMove(event) {

        pointer.x =
            (event.clientX /
                window.innerWidth) *
            2 - 1;

        pointer.y =
            -(event.clientY /
                window.innerHeight) *
            2 + 1;

        active = true;
    }

    function onPointerLeave() {

        active = false;

        pointer.set(
            99,
            99
        );
    }

    window.addEventListener(
        'pointermove',
        onPointerMove,
        { passive: true }
    );

    window.addEventListener(
        'blur',
        onPointerLeave
    );

    /* ---------------------------------------------------------
       Resize
       --------------------------------------------------------- */

    function resize() {

        const w =
            window.innerWidth;

        const h =
            window.innerHeight;

        renderer.setSize(
            w,
            h,
            false
        );

        camera.aspect =
            w / h;

        camera.updateProjectionMatrix();

        /*
         * Desktop: manifold deliberately extends beyond
         * the viewport edges.
         *
         * Mobile: slightly reduce its scale.
         */

        const scale =
            w < 600
                ? 0.88
                : Math.max(
                    1,
                    Math.min(
                        1.12,
                        w / 1280
                    )
                );

        group.scale.set(
            scale,
            scale,
            scale
        );

        group.position.y =
            w < 600
                ? -0.28
                : -0.15;
    }

    window.addEventListener(
        'resize',
        resize
    );

    resize();

    /* ---------------------------------------------------------
       Animation
       --------------------------------------------------------- */

    const clock =
        new THREE.Clock();

    function renderStatic() {

        renderer.render(
            scene,
            camera
        );
    }

    function animate() {

        requestAnimationFrame(
            animate
        );

        const t =
            clock.getElapsedTime();

        smoothPointer.lerp(
            pointer,
            active
                ? 0.075
                : 0.025
        );

        /*
         * Very subtle idle movement.
         * Cursor interaction remains the dominant motion.
         */

        group.rotation.y =
            Math.sin(t * 0.10) *
            0.012;

        group.rotation.x =
            -0.48 +
            Math.sin(t * 0.08) *
            0.006;

        const pos =
            geometry.attributes
                .position.array;

        /*
         * Map pointer to manifold coordinates.
         */

        const mx =
            smoothPointer.x *
            (width * 0.48);

        const my =
            smoothPointer.y *
            (depth * 0.42);

        for (
            let i = 0;
            i < pos.length;
            i += 3
        ) {

            const x =
                base[i];

            const y =
                base[i + 1];

            const dx =
                x - mx;

            const dy =
                y - my;

            const d2 =
                dx * dx +
                dy * dy;

            const influence =
                active
                    ? Math.exp(
                        -d2 / 2.0
                    )
                    : 0;

            /*
             * Local hover deformation:
             * a visible but smooth lift,
             * plus a subtle ripple.
             */

            const ripple =
                Math.sin(
                    Math.sqrt(d2) *
                    2.4 -
                    t * 2.1
                ) *
                0.08 *
                influence;

            const lift =
                0.46 *
                influence +
                ripple;

            pos[i] =
                x +
                dx *
                influence *
                0.012;

            pos[i + 1] =
                y +
                dy *
                influence *
                0.018;

            pos[i + 2] =
                base[i + 2] +
                lift;
        }

        geometry.attributes
            .position
            .needsUpdate = true;

        renderer.render(
            scene,
            camera
        );
    }

    /* Respect accessibility settings. */

    if (
        window.matchMedia(
            '(prefers-reduced-motion: reduce)'
        ).matches
    ) {
        renderStatic();
    } else {
        animate();
    }

})();
