/* ============================================================
   Interactive Latent Manifold Background
   ------------------------------------------------------------
   - Full-screen continuous manifold
   - Sparse / readable
   - Continuous idle movement
   - Mouse-controlled rotation
   - Mouse-controlled local deformation
   - Does not block page interaction
   ============================================================ */

(function () {
    if (!window.THREE) return;

    const host = document.getElementById("manifold-bg");
    if (!host) return;

    /* ---------------------------------------------------------
       Scene
       --------------------------------------------------------- */

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        42,
        window.innerWidth / window.innerHeight,
        0.1,
        100
    );

    camera.position.set(0, 2.6, 13);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance"
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 1.5)
    );

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.setClearColor(0x000000, 0);

    renderer.domElement.style.pointerEvents = "none";

    host.appendChild(renderer.domElement);

    /* ---------------------------------------------------------
       Main manifold group
       --------------------------------------------------------- */

    const manifold = new THREE.Group();

    manifold.position.set(0, -0.2, 0);

    /*
     * Start with a slight perspective so the surface
     * feels three-dimensional rather than flat.
     */
    manifold.rotation.x = -0.48;

    scene.add(manifold);

    /* ---------------------------------------------------------
       Manifold resolution
       --------------------------------------------------------- */

    const COLS = 82;
    const ROWS = 24;

    const WIDTH = 18.5;
    const DEPTH = 7.2;

    const vertexCount = COLS * ROWS;

    const positions = new Float32Array(
        vertexCount * 3
    );

    const originalPositions = new Float32Array(
        vertexCount * 3
    );

    const colors = new Float32Array(
        vertexCount * 3
    );

    const indices = [];

    /* ---------------------------------------------------------
       Palette
       --------------------------------------------------------- */

    const blue = new THREE.Color("#537fa3");
    const indigo = new THREE.Color("#68658b");
    const violet = new THREE.Color("#91718b");
    const ochre = new THREE.Color("#c4935b");

    function getColor(t) {

        const color = new THREE.Color();

        if (t < 0.42) {

            color.lerpColors(
                blue,
                indigo,
                t / 0.42
            );

        } else if (t < 0.72) {

            color.lerpColors(
                indigo,
                violet,
                (t - 0.42) / 0.30
            );

        } else {

            color.lerpColors(
                violet,
                ochre,
                (t - 0.72) / 0.28
            );
        }

        return color;
    }

    /* ---------------------------------------------------------
       Parametric latent manifold
       --------------------------------------------------------- */

    function manifoldSurface(u, v) {

        /*
         * Broad asymmetric hyperbolic structure.
         *
         * The left side has a stronger funnel,
         * while the center/right becomes a smoother
         * saddle-like latent landscape.
         */

        const leftFunnel =
            1.0 +
            0.90 *
            Math.exp(
                -Math.pow(
                    (u + 6.2) / 2.5,
                    2
                )
            );

        const transverse =
            v * leftFunnel;

        /*
         * Hyperbolic / saddle component.
         */
        let z =
            0.31 *
            (
                transverse * transverse / 2.8
                -
                0.065 * u * u
            );

        /*
         * Large-scale flowing waves.
         */
        z +=
            0.25 *
            Math.sin(
                u * 0.72
            ) *
            (
                0.35 +
                0.65 *
                Math.abs(v) / 3.6
            );

        /*
         * Small irregularity so the surface
         * does not look perfectly synthetic.
         */
        z +=
            0.055 *
            Math.cos(
                u * 0.38 +
                v * 1.05
            );

        return {
            x: u,
            y: transverse,
            z: z
        };
    }

    /* ---------------------------------------------------------
       Create vertices
       --------------------------------------------------------- */

    let vertex = 0;

    for (let i = 0; i < COLS; i++) {

        const u =
            -WIDTH / 2 +
            WIDTH * i / (COLS - 1);

        const color =
            getColor(
                i / (COLS - 1)
            );

        for (let j = 0; j < ROWS; j++) {

            const v =
                -DEPTH / 2 +
                DEPTH * j / (ROWS - 1);

            const point =
                manifoldSurface(
                    u,
                    v
                );

            const k =
                vertex * 3;

            positions[k] =
                originalPositions[k] =
                point.x;

            positions[k + 1] =
                originalPositions[k + 1] =
                point.y;

            positions[k + 2] =
                originalPositions[k + 2] =
                point.z;

            colors[k] =
                color.r;

            colors[k + 1] =
                color.g;

            colors[k + 2] =
                color.b;

            vertex++;
        }
    }

    /* ---------------------------------------------------------
       Triangle topology
       --------------------------------------------------------- */

    for (let i = 0; i < COLS - 1; i++) {

        for (let j = 0; j < ROWS - 1; j++) {

            const a =
                i * ROWS + j;

            const b =
                (i + 1) * ROWS + j;

            const c =
                (i + 1) * ROWS + j + 1;

            const d =
                i * ROWS + j + 1;

            indices.push(
                a, b, d,
                b, c, d
            );
        }
    }

    const geometry =
        new THREE.BufferGeometry();

    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
            positions,
            3
        )
    );

    geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(
            colors,
            3
        )
    );

    geometry.setIndex(indices);

    /* ---------------------------------------------------------
       Very subtle manifold surface
       --------------------------------------------------------- */

    const surfaceMaterial =
        new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.035,
            side: THREE.DoubleSide,
            depthWrite: false
        });

    const surface =
        new THREE.Mesh(
            geometry,
            surfaceMaterial
        );

    manifold.add(surface);

    /* ---------------------------------------------------------
       Wireframe
       --------------------------------------------------------- */

    const wireGeometry =
        new THREE.WireframeGeometry(
            geometry
        );

    const wireMaterial =
        new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.14,
            depthWrite: false
        });

    const wire =
        new THREE.LineSegments(
            wireGeometry,
            wireMaterial
        );

    manifold.add(wire);

    /* ---------------------------------------------------------
       Sparse longitudinal guide curves
       --------------------------------------------------------- */

    const guideGroup =
        new THREE.Group();

    manifold.add(guideGroup);

    function createGuide(v, opacity) {

        const points = [];

        for (let i = 0; i < 120; i++) {

            const u =
                -WIDTH / 2 +
                WIDTH * i / 119;

            const p =
                manifoldSurface(
                    u,
                    v
                );

            points.push(
                new THREE.Vector3(
                    p.x,
                    p.y,
                    p.z + 0.035
                )
            );
        }

        const guideGeometry =
            new THREE.BufferGeometry()
                .setFromPoints(points);

        const guideMaterial =
            new THREE.LineBasicMaterial({
                color: 0x66717b,
                transparent: true,
                opacity: opacity,
                depthWrite: false
            });

        guideGroup.add(
            new THREE.Line(
                guideGeometry,
                guideMaterial
            )
        );
    }

    /*
     * Only three guide curves.
     * This keeps the background sparse.
     */
    createGuide(-2.15, 0.10);
    createGuide(0, 0.12);
    createGuide(2.15, 0.10);

    /* ---------------------------------------------------------
       Mouse state
       --------------------------------------------------------- */

    const mouse =
        new THREE.Vector2(
            0,
            0
        );

    const smoothMouse =
        new THREE.Vector2(
            0,
            0
        );

    /*
     * Mouse position in manifold coordinates.
     */
    const manifoldMouse =
        new THREE.Vector2(
            0,
            0
        );

    const smoothManifoldMouse =
        new THREE.Vector2(
            0,
            0
        );

    /* ---------------------------------------------------------
       Mouse movement
       --------------------------------------------------------- */

    window.addEventListener(
        "pointermove",
        function (event) {

            mouse.x =
                (
                    event.clientX /
                    window.innerWidth
                ) * 2 - 1;

            mouse.y =
                -(
                    event.clientY /
                    window.innerHeight
                ) * 2 + 1;

        },
        {
            passive: true
        }
    );

    /* ---------------------------------------------------------
       Resize
       --------------------------------------------------------- */

    function resize() {

        const width =
            window.innerWidth;

        const height =
            window.innerHeight;

        camera.aspect =
            width / height;

        camera.updateProjectionMatrix();

        renderer.setSize(
            width,
            height,
            false
        );

        /*
         * Make the manifold intentionally wider
         * than the viewport so there are no empty
         * regions at the sides.
         */

        const scale =
            width < 600
                ? 0.86
                : 1.05;

        manifold.scale.set(
            scale,
            scale,
            scale
        );
    }

    window.addEventListener(
        "resize",
        resize
    );

    resize();

    /* ---------------------------------------------------------
       Animation
       --------------------------------------------------------- */

    const clock =
        new THREE.Clock();

    function animate() {

        requestAnimationFrame(
            animate
        );

        const time =
            clock.getElapsedTime();

        /* ---------------------------------------------
           Smooth mouse
           --------------------------------------------- */

        smoothMouse.lerp(
            mouse,
            0.045
        );

        /* ---------------------------------------------
           Mouse → manifold coordinates
           --------------------------------------------- */

        manifoldMouse.set(
            smoothMouse.x *
                (WIDTH * 0.48),

            smoothMouse.y *
                (DEPTH * 0.45)
        );

        smoothManifoldMouse.lerp(
            manifoldMouse,
            0.055
        );

        /* ---------------------------------------------
           DEFAULT CONTINUOUS ROTATION
           ---------------------------------------------

           The manifold moves even when the mouse
           is completely stationary.
        */

        const idleRotationY =
            Math.sin(
                time * 0.18
            ) * 0.085;

        const idleRotationZ =
            Math.sin(
                time * 0.13
            ) * 0.018;

        const idleRotationX =
            Math.sin(
                time * 0.11
            ) * 0.014;

        /* ---------------------------------------------
           MOUSE CONTROLLED ROTATION
           --------------------------------------------- */

        const mouseRotationY =
            smoothMouse.x *
            0.20;

        const mouseRotationX =
            smoothMouse.y *
            0.085;

        const mouseRotationZ =
            smoothMouse.x *
            0.035;

        manifold.rotation.y =
            idleRotationY +
            mouseRotationY;

        manifold.rotation.x =
            -0.48 +
            idleRotationX +
            mouseRotationX;

        manifold.rotation.z =
            -0.025 +
            idleRotationZ +
            mouseRotationZ;

        /* ---------------------------------------------
           Gentle horizontal drift
           --------------------------------------------- */

        manifold.position.x =
            Math.sin(
                time * 0.10
            ) * 0.18;

        manifold.position.y =
            -0.20 +
            Math.cos(
                time * 0.13
            ) * 0.035;

        /* ---------------------------------------------
           Local cursor deformation
           --------------------------------------------- */

        const pos =
            geometry.attributes
                .position.array;

        for (
            let i = 0;
            i < pos.length;
            i += 3
        ) {

            const x =
                originalPositions[i];

            const y =
                originalPositions[i + 1];

            const dx =
                x -
                smoothManifoldMouse.x;

            const dy =
                y -
                smoothManifoldMouse.y;

            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );

            /*
             * Broad influence area.
             */
            const influence =
                Math.exp(
                    -(
                        distance *
                        distance
                    ) / 3.8
                );

            /*
             * Moving ripple.
             */
            const ripple =
                Math.sin(
                    distance * 2.1 -
                    time * 2.5
                ) *
                0.075 *
                influence;

            /*
             * Lift toward the cursor.
             */
            const lift =
                0.30 *
                influence +
                ripple;

            /*
             * Slight sideways displacement
             * makes the surface feel alive.
             */
            const displacement =
                0.035 *
                influence;

            pos[i] =
                x +
                dx *
                displacement;

            pos[i + 1] =
                y +
                dy *
                displacement;

            pos[i + 2] =
                originalPositions[i + 2] +
                lift;
        }

        geometry.attributes
            .position
            .needsUpdate = true;

        /* ---------------------------------------------
           Render
           --------------------------------------------- */

        renderer.render(
            scene,
            camera
        );
    }

    /* ---------------------------------------------------------
       Reduced motion
       --------------------------------------------------------- */

    const reducedMotion =
        window.matchMedia(
            "(prefers-reduced-motion: reduce)"
        );

    if (reducedMotion.matches) {

        renderer.render(
            scene,
            camera
        );

    } else {

        animate();
    }

})();
