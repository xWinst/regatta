import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Group,
    Vector3,
    PlaneGeometry,
    TextureLoader,
    RepeatWrapping,
    PMREMGenerator,
    MathUtils,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    Mesh,
    Object3D,
    BoxGeometry,
    Clock,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { Water, Sky, Floater } from "utils";
import { waterNormals, green } from "textures";
import { boat } from "models";

const getWater = () => {
    const waterGeometry = new PlaneGeometry(4096, 4096, 256, 256);
    const texture = new TextureLoader().load(waterNormals, (texture) => {
        texture.wrapS = texture.wrapT = RepeatWrapping;
    });

    const water = new Water(waterGeometry, {
        textureWidth: 512,
        textureHeight: 512,
        waterNormals: texture,
        sunDirection: new Vector3(),
        sunColor: 0xffffff,
        waterColor: 0x001e0f,
        distortionScale: 8,
        fog: undefined,
    });

    const waves = [
        { direction: 0, steepness: 0.15, wavelength: 100 },
        { direction: 30, steepness: 0.15, wavelength: 50 },
        { direction: 60, steepness: 0.15, wavelength: 25 },
    ];

    water.material.wireframe = false;
    water.rotation.x = -Math.PI / 2;
    water.material.onBeforeCompile = (shader) => {
        shader.uniforms.offsetX = { value: 0 };
        shader.uniforms.offsetZ = { value: 0 };
        shader.uniforms.waveA = {
            value: [
                Math.sin((waves[0].direction * Math.PI) / 180),
                Math.cos((waves[0].direction * Math.PI) / 180),
                waves[0].steepness,
                waves[0].wavelength,
            ],
        };
        shader.uniforms.waveB = {
            value: [
                Math.sin((waves[1].direction * Math.PI) / 180),
                Math.cos((waves[1].direction * Math.PI) / 180),
                waves[1].steepness,
                waves[1].wavelength,
            ],
        };
        shader.uniforms.waveC = {
            value: [
                Math.sin((waves[2].direction * Math.PI) / 180),
                Math.cos((waves[2].direction * Math.PI) / 180),
                waves[2].steepness,
                waves[2].wavelength,
            ],
        };
        shader.vertexShader = `
            uniform mat4 textureMatrix;
            uniform float time;

            varying vec4 mirrorCoord;
            varying vec4 worldPosition;

            #include <common>
            #include <fog_pars_vertex>
            #include <shadowmap_pars_vertex>
            #include <logdepthbuf_pars_vertex>

            uniform vec4 waveA;
            uniform vec4 waveB;
            uniform vec4 waveC;

            uniform float offsetX;
            uniform float offsetZ;

            vec3 GerstnerWave (vec4 wave, vec3 p) {
                float steepness = wave.z;
                float wavelength = wave.w;
                float k = 2.0 * PI / wavelength;
                float c = sqrt(9.8 / k);
                vec2 d = normalize(wave.xy);
                float f = k * (dot(d, vec2(p.x, p.y)) - c * time);
                float a = steepness / k;

                return vec3(
                    d.x * (a * cos(f)),
                    d.y * (a * cos(f)),
                    a * sin(f)
                );
            }

            void main() {

                mirrorCoord = modelMatrix * vec4( position, 1.0 );
                worldPosition = mirrorCoord.xyzw;
                mirrorCoord = textureMatrix * mirrorCoord;

                vec3 gridPoint = position.xyz;
                vec3 tangent = vec3(1, 0, 0);
                vec3 binormal = vec3(0, 0, 1);
                vec3 p = gridPoint;
                gridPoint.x += offsetX;//*2.0;
                gridPoint.y -= offsetZ;//*2.0;
                p += GerstnerWave(waveA, gridPoint);
                p += GerstnerWave(waveB, gridPoint);
                p += GerstnerWave(waveC, gridPoint);
                gl_Position = projectionMatrix * modelViewMatrix * vec4( p.x, p.y, p.z, 1.0);

                #include <beginnormal_vertex>
                #include <defaultnormal_vertex>
                #include <logdepthbuf_vertex>
                #include <fog_vertex>
                #include <shadowmap_vertex>
            }`;

        shader.fragmentShader = `
            uniform sampler2D mirrorSampler;
            uniform float alpha;
            uniform float time;
            uniform float size;
            uniform float distortionScale;
            uniform sampler2D normalSampler;
            uniform vec3 sunColor;
            uniform vec3 sunDirection;
            uniform vec3 eye;
            uniform vec3 waterColor;

            varying vec4 mirrorCoord;
            varying vec4 worldPosition;

            uniform float offsetX;
            uniform float offsetZ;

            vec4 getNoise( vec2 uv ) {
                vec2 uv0 = ( uv / 103.0 ) + vec2(time / 17.0, time / 29.0);
                vec2 uv1 = uv / 107.0-vec2( time / -19.0, time / 31.0 );
                vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
                vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
                vec4 noise = texture2D( normalSampler, uv0 ) +
                    texture2D( normalSampler, uv1 ) +
                    texture2D( normalSampler, uv2 ) +
                    texture2D( normalSampler, uv3 );
                return noise * 0.5 - 1.0;
            }

            void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
                vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
                float direction = max( 0.0, dot( eyeDirection, reflection ) );
                specularColor += pow( direction, shiny ) * sunColor * spec;
                diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
            }

            #include <common>
            #include <packing>
            #include <bsdfs>
            #include <fog_pars_fragment>
            #include <logdepthbuf_pars_fragment>
            #include <lights_pars_begin>
            #include <shadowmap_pars_fragment>
            #include <shadowmask_pars_fragment>

            void main() {

                #include <logdepthbuf_fragment>

                vec4 noise = getNoise( (worldPosition.xz) + vec2(offsetX/12.25,offsetZ/12.25) * size );
                vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

                vec3 diffuseLight = vec3(0.0);
                vec3 specularLight = vec3(0.0);

                vec3 worldToEye = eye-worldPosition.xyz;
                vec3 eyeDirection = normalize( worldToEye );
                sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

                float distance = length(worldToEye);

                vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / distance ) * distortionScale;
                vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );

                float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
                float rf0 = 0.3;
                float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );
                vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
                vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);
                vec3 outgoingLight = albedo;
                gl_FragColor = vec4( outgoingLight, alpha );

                #include <tonemapping_fragment>
                #include <fog_fragment>
            }`;
        shader.uniforms.size.value = 10.0;
    };

    return water;
};

export const initialScene = (canvas, cb) => {
    console.log("init");
    const scene = new Scene();
    const camera = new PerspectiveCamera(45, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);

    const renderer = new WebGLRenderer({ antialias: true, canvas });
    renderer.shadowMap.enabled = true;
    renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);

    // let cameraLerp = false;
    // let controlsChanging = false;

    // const controls = new OrbitControls(camera, canvas);

    // controls.addEventListener("change", () => {
    //     renderer.render(scene, camera);
    // });
    // controls.update();

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxDistance = 100;
    // controls.addEventListener("start", () => {
    //     controlsChanging = true;
    //     cameraLerp = false;
    // });
    // controls.addEventListener("end", () => {
    //     controlsChanging = false;
    // });
    controls.update();

    const earth = new Group();
    scene.add(earth);

    const sun = new Vector3();
    const water = getWater();

    earth.add(water);

    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);

    const skyUniforms = sky.material.uniforms;

    skyUniforms["turbidity"].value = 10;
    skyUniforms["rayleigh"].value = 2;
    skyUniforms["mieCoefficient"].value = 0.005;
    skyUniforms["mieDirectionalG"].value = 0.8;

    const parameters = {
        elevation: 10,
        azimuth: 180,
    };

    const pmremGenerator = new PMREMGenerator(renderer);

    function updateSun() {
        const phi = MathUtils.degToRad(90 - parameters.elevation);
        const theta = MathUtils.degToRad(parameters.azimuth);

        sun.setFromSphericalCoords(1, phi, theta);

        sky.material.uniforms["sunPosition"].value.copy(sun);
        water.material.uniforms["sunDirection"].value.copy(sun);

        scene.environment = pmremGenerator.fromScene(sky).texture;
    }

    updateSun();

    const divisor = -46080;
    const divisorMultiplier = 1.40625;

    const planes = {};
    let visibleId = "";
    // let locationDataText = "";
    // const locationDataElem = document.getElementById("locationData");
    // const textureLoader = new TextureLoader();

    //============

    function makeVisible(layerId, divisor) {
        const tileX = Math.floor(-earth.position.x / divisor);
        const tileY = Math.floor(-earth.position.z / divisor);
        let adjacentX = 0;
        let adjacentY = 0;
        if (tileX === Math.round(-earth.position.x / divisor)) {
            adjacentX = tileX - 1;
        } else {
            adjacentX = tileX + 1;
        }
        if (tileY === Math.round(-earth.position.z / divisor)) {
            adjacentY = tileY - 1;
        } else {
            adjacentY = tileY + 1;
        }
        visibleId = layerId + "," + tileX + "," + tileY;
        if (!planes[visibleId]) {
            createPlane(layerId, tileX, tileY, divisor);
        }
        planes[visibleId].visible = true;
        visibleId = layerId + "," + adjacentX + "," + tileY;
        if (!planes[visibleId]) {
            createPlane(layerId, adjacentX, tileY, divisor);
        }
        planes[visibleId].visible = true;
        visibleId = layerId + "," + adjacentX + "," + adjacentY;
        if (!planes[visibleId]) {
            createPlane(layerId, adjacentX, adjacentY, divisor);
        }
        planes[visibleId].visible = true;
        visibleId = layerId + "," + tileX + "," + adjacentY;
        if (!planes[visibleId]) {
            createPlane(layerId, tileX, adjacentY, divisor);
        }
        planes[visibleId].visible = true;
    }

    function createPlane(layerId, x, y, divisor) {
        const id = layerId + "," + x.toString() + "," + y.toString();
        planes[id] = new Mesh(
            new PlaneGeometry(divisor, divisor, 107, 107),
            new MeshPhysicalMaterial() //wireframe: true })
        );
        planes[id].rotateX(-Math.PI / 2);
        planes[id].position.x = x * divisor + divisor / 2;
        planes[id].position.z = y * divisor + divisor / 2;
        earth.add(planes[id]);
        // let offsetX = 128;
        // let offsetY = 64;
        const hgtImage = new Image();
        hgtImage.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 108;
            canvas.height = 108;
            const context = canvas.getContext("2d");
            context.drawImage(hgtImage, 0, 0);
            const data = context.getImageData(0, 0, 108, 108);
            let dataOffset = 0;
            let ele = 0;
            for (let i = 2; i < planes[id].geometry.attributes.position.array.length; i = i + 3) {
                let b0 = data.data[dataOffset + 0];
                let b1 = data.data[dataOffset + 1];
                ele = ((b1 << 8) | b0) - 32767;
                planes[id].geometry.attributes.position.array[i] = ele;
                dataOffset += 4;
            }
            planes[id].geometry.computeVertexNormals();
            planes[id].geometry.attributes.position.needsUpdate = true;
        };

        // const hgtSrc = getTexture(y + offsetY, x + offsetX, "p");
        // console.log("hgtSrc: ", hgtSrc);

        // hgtImage.src = "/textures/" + layerId + "_" + (y + offsetY) + "_" + (x + offsetX) + ".png";
        // hgtImage.src = hgtSrc;
        hgtImage.src = green;
        // console.log("y + offsetY: ", y + offsetY);

        // const tileUrl = "/textures/" + layerId + "_" + (y + offsetY) + "_" + (x + offsetX) + ".jpg";
        // const tileUrl = getTexture(y + offsetY, x + offsetX, "j");
        // console.log("x + offsetX: ", x + offsetX);
        // textureLoader.load(tileUrl, (t) => {
        //     planes[id].material.map = t;
        //     planes[id].material.needsUpdate = true;
        // });
    }

    //boat
    let controlledBoatId = 0;
    const followCamPivot = new Object3D();
    const lat = 15.0302;
    const lon = -24.4485;
    // const lat = 15;
    // const lon = 20;
    // let boatDataText = "";
    // const boatDataElem = document.getElementById("boatData");
    const startX = (lon * divisor) / divisorMultiplier;
    const startZ = -(lat * divisor) / divisorMultiplier;

    let floaters = [];

    // main user boat
    const loader = new GLTFLoader();
    loader.load(
        boat,
        function (gltf) {
            gltf.scene.traverse(function (child) {
                if (child.isMesh) {
                    child.material = new MeshStandardMaterial({ roughness: 0, color: "#997709" });
                }
            });

            gltf.scene.scale.set(2.0, 2.0, 2.0);
            const group = new Group();
            group.add(gltf.scene);
            const floater = new Floater(earth, group, water, true);
            floaters.push(floater);
            controlledBoatId = floaters.length - 1;

            gltf.scene.add(followCamPivot);
            // followCamPivot.position.set(0, 5, -7.5);
            followCamPivot.position.set(0, 10, -15);

            group.position.x = startX;
            group.position.z = startZ;
            group.name = "boat";

            camera.position.set(group.position.x, 100, group.position.z - 100);

            earth.add(group);

            // cameraLerp = true;

            // loadTestBoxes();
            loadTestBoat(-30, 0);
            loadTestBoat(-60, 0);

            camera.position.set(0, 100, -100);

            cb(floaters);
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
        },
        (error) => {
            console.log(error);
        }
    );

    const box = new Mesh(new BoxGeometry(100, 20, 5), new MeshStandardMaterial({ roughness: 0 }));
    box.position.set(startX - 30, -5, startZ - 25);
    const box2 = new Mesh(new BoxGeometry(5, 20, 30), new MeshStandardMaterial({ roughness: 0 }));
    box2.position.set(startX + 20, -5, startZ - 12.5);
    const box3 = new Mesh(new BoxGeometry(5, 20, 30), new MeshStandardMaterial({ roughness: 0 }));
    box3.position.set(startX - 80, -5, startZ - 12.5);
    earth.add(box, box2, box3);

    // floating boxes
    // function loadTestBoxes() {
    //     const boxGeometry = new BoxGeometry(1, 1, 1);

    //     for (let i = 0; i < 10; i++) {
    //         const box = new Mesh(boxGeometry.clone(), new MeshStandardMaterial({ roughness: 0 }));
    //         const group = new Group();
    //         group.position.set(startX + (i * 10 - 30), 0, startZ + (i * 10 - 50));
    //         group.add(box.clone());
    //         const floater = new Floater(earth, group, water);
    //         floaters.push(floater);
    //         earth.add(group);
    //     }
    // }

    function loadTestBoat(x, z) {
        loader.load(
            boat,
            function (gltf) {
                gltf.scene.scale.set(2.0, 2.0, 2.0);

                const group = new Group();
                group.position.set(startX + x, 0, startZ + z);
                group.add(gltf.scene);
                const floater = new Floater(earth, group, water);
                floaters.push(floater);
                earth.add(group);
            },
            (xhr) => {
                console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
            },
            (error) => {
                console.log(error);
            }
        );
    }

    // function loadTestBoat2() {
    //     loader.load(
    //         boat3,
    //         function (gltf) {
    //             for (let i = 0; i < 1; i++) {
    //                 const group = new Group();
    //                 group.position.set(startX - 40, 0, startZ + 40);
    //                 group.add(gltf.scene);
    //                 const floater = new Floater(earth, group, water);
    //                 floaters.push(floater);
    //                 earth.add(group);
    //             }
    //         },
    //         (xhr) => {
    //             console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
    //         },
    //         (error) => {
    //             console.log(error);
    //         }
    //     );
    // }

    const clock = new Clock();
    let delta = 0;

    function animate() {
        requestAnimationFrame(animate);
        delta = clock.getDelta();

        floaters.forEach((f) => {
            f.update(delta);
            // f.sphereMesh.visible = false
            // floaters.forEach((f2) => {
            //     if (f !== f2 && f.collisionSphere.intersectsSphere(f2.collisionSphere)) {
            //         f.sphereMesh.visible = true
            //     }
            // })
        });

        if (floaters[controlledBoatId]) {
            earth.position.x = -floaters[controlledBoatId].object.position.x;
            earth.position.z = -floaters[controlledBoatId].object.position.z;

            // boatDataText =
            //     "pwr:" +
            //     floaters[controlledBoatId].power.toFixed(2) +
            //     " ms:" +
            //     floaters[controlledBoatId].ms.toFixed(2) +
            //     ` kts:` +
            //     (floaters[controlledBoatId].ms * 1.94384).toFixed(2) +
            //     " hdg:" +
            //     -((floaters[controlledBoatId].heading / Math.PI) * 180).toFixed(2);
            // boatDataElem.innerText = boatDataText;

            // if (cameraLerp) {
            //     const v = new Vector3();
            //     followCamPivot.getWorldPosition(v);
            //     camera.position.lerp(v, 0.025);
            //     controls.target.y = floaters[controlledBoatId].object.position.y + 2;
            // }
        }

        controls.update();

        water.material.uniforms["time"].value += delta;

        render();

        makeVisible(7, divisor);
    }

    function render() {
        renderer.render(scene, camera);
    }

    animate();

    // function animate() {
    //     requestAnimationFrame(animate);
    //     // const { x, y, z } = camera.position;
    //     // controls.target.set(x, y, z);
    //     // console.log("controls.target: ", controls.target);
    //     controls.update();
    //     renderer.render(scene, camera);
    // }

    // animate();

    return { scene, camera, renderer };
};
