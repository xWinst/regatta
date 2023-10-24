import * as THREE from "three";

export default class Floater {
    earth;
    object;
    gerstnerWater;
    cogHelper;
    velocityHelper;
    waveNormalHelpers = [];
    gravityHelpers = [];
    gravitySlideHelpers = [];
    floatPoints = [];
    down = new THREE.Vector3(0, -1, 0);
    heading = 0;
    power = 0;
    isPlayerFloater = false;
    collisionSphere;
    //sphereMesh
    //boxHelper: THREE.Box3Helper
    lastPosition = new THREE.Vector3();
    velocity = new THREE.Vector3();
    ms = 0;
    forces = [];

    constructor(earth, object, water, isPlayerFloater = false) {
        this.earth = earth;
        this.object = object;
        this.water = water;
        this.waves = [
            { direction: 0, steepness: 0.15, wavelength: 100 },
            { direction: 30, steepness: 0.15, wavelength: 50 },
            { direction: 60, steepness: 0.15, wavelength: 25 },
        ];
        this.isPlayerFloater = isPlayerFloater;

        this.object.traverse((child) => {
            if (child.name.startsWith("floatPoint")) {
                this.floatPoints.push(child);
            }
        });
        if (!this.floatPoints.length) {
            //then create one in the middle that we can use
            const floatPoint = new THREE.Object3D();
            //floatPoint.name = 'floatPoint'
            this.object.add(floatPoint);
            this.floatPoints.push(floatPoint);
        }

        //;(this.object as THREE.Mesh).geometry.computeBoundingBox()
        const aabb = new THREE.Box3().setFromObject(this.object);
        this.collisionSphere = new THREE.Sphere();
        aabb.getBoundingSphere(this.collisionSphere);
        // this.sphereMesh = new THREE.Mesh(
        //     new THREE.SphereGeometry(this.collisionSphere.radius, 8, 8),
        //     new THREE.MeshBasicMaterial({
        //         color: 0xff0000,
        //         transparent: true,
        //         opacity: 0.25,
        //         visible: false,
        //     })
        // )
        // this.object.add(this.sphereMesh)

        //console.log(this.collisionSphere)

        //this.object.add(this.boxHelper)

        this.cogHelper = new THREE.ArrowHelper(
            new THREE.Vector3(),
            new THREE.Vector3(),
            7.5,
            0x00ff00
        );
        // earth.add(this.cogHelper);

        this.velocityHelper = new THREE.ArrowHelper(
            new THREE.Vector3(),
            new THREE.Vector3(),
            7.5,
            0xff00ff
        );
        // earth.add(this.velocityHelper);

        this.floatPoints.forEach((fp) => {
            const waveNormalHelper = new THREE.ArrowHelper(
                new THREE.Vector3(),
                new THREE.Vector3(),
                5,
                0xffff00
            );
            waveNormalHelper.position.copy(fp.position);
            this.waveNormalHelpers.push(waveNormalHelper);
            // earth.add(waveNormalHelper);

            const gravitySlideHelper = new THREE.ArrowHelper(
                new THREE.Vector3(0, 1, 0),
                new THREE.Vector3(),
                5,
                0x00ffff
            );
            gravitySlideHelper.position.copy(fp.position);
            this.gravitySlideHelpers.push(gravitySlideHelper);
            // earth.add(gravitySlideHelper);
        });
    }

    getWaveInfo(offsetX, offsetZ, x, z, time) {
        const pos = new THREE.Vector3();
        const tangent = new THREE.Vector3(1, 0, 0);
        const binormal = new THREE.Vector3(0, 0, 1);
        this.waves.forEach((w) => {
            const k = (Math.PI * 2.0) / w.wavelength;
            const c = Math.sqrt(9.8 / k);
            const d = new THREE.Vector2(
                Math.sin((w.direction * Math.PI) / 180),
                -Math.cos((w.direction * Math.PI) / 180)
            );
            const f = k * (d.dot(new THREE.Vector2(x, z)) - c * time);
            const a = w.steepness / k;

            pos.x += d.x * (a * Math.cos(f));
            pos.y += a * Math.sin(f);
            pos.z += d.y * (a * Math.cos(f));

            tangent.x += -d.x * d.x * (w.steepness * Math.sin(f));
            tangent.y += d.x * (w.steepness * Math.cos(f));
            tangent.z += -d.x * d.y * (w.steepness * Math.sin(f));

            binormal.x += -d.x * d.y * (w.steepness * Math.sin(f));
            binormal.y += d.y * (w.steepness * Math.cos(f));
            binormal.z += -d.y * d.y * (w.steepness * Math.sin(f));
        });

        const normal = binormal.cross(tangent).normalize();
        return { position: pos, normal: normal };
    }

    //r = 0
    update(delta) {
        //this.boxHelper.updateMatrixWorld(true)

        const t = this.water.material.uniforms["time"].value;

        const accumulatedPosition = new THREE.Vector3(); // this.object.position.clone()

        const accumulatedNormal = new THREE.Vector3(0, 0, 0);

        this.floatPoints.forEach((fp, i) => {
            const fpWorldPos = new THREE.Vector3();

            fp.getWorldPosition(fpWorldPos);
            fpWorldPos.sub(this.earth.position);

            const waveInfo = this.getWaveInfo(
                this.object.position.x,
                this.object.position.z,
                fpWorldPos.x,
                fpWorldPos.z,
                t
            );

            this.waveNormalHelpers[i].setDirection(waveInfo.normal);
            this.waveNormalHelpers[i].position.copy(fpWorldPos);

            const gravitySlideDirection = new THREE.Vector3(0, -1, 0)
                .add(waveInfo.normal)
                .divideScalar(2)
                .normalize();

            this.gravitySlideHelpers[i].setDirection(gravitySlideDirection);
            this.gravitySlideHelpers[i].position.copy(fpWorldPos);

            accumulatedPosition.y += waveInfo.position.y;
            if (this.isPlayerFloater) {
                accumulatedPosition.x += this.object.position.x + waveInfo.normal.x;
                accumulatedPosition.z += this.object.position.z + waveInfo.normal.z;
            } else {
                accumulatedPosition.x += this.object.position.x;
                accumulatedPosition.z += this.object.position.z;
            }

            accumulatedNormal.add(waveInfo.normal);
        });

        //average all floatPoints directions
        accumulatedPosition.divideScalar(this.floatPoints.length);

        //this.object.position.y = accumulatedPosition.y

        // //apply any forces
        if (this.forces.length) {
            this.forces.forEach((f) => {
                //console.log(f)
                //accumulatedPosition.add(new THREE.Vector3(f.x, f.y, f.z))
                accumulatedPosition.x += f.x;
                accumulatedPosition.z += f.z;
                //accumulatedPosition.sub(f)
            });
            this.forces = [];
        }

        accumulatedPosition.x += Math.sin(this.heading) * this.power;
        accumulatedPosition.z += Math.cos(this.heading) * this.power;

        //console.log(this.object.position.x,accumulatedPosition.x)
        //this.object.position.copy(accumulatedPosition)//
        this.object.position.lerp(accumulatedPosition, 0.25);

        this.velocity = this.lastPosition.clone().sub(accumulatedPosition).negate();
        this.velocityHelper.setDirection(this.velocity);
        this.velocityHelper.position.set(
            accumulatedPosition.x,
            accumulatedPosition.y + 1,
            accumulatedPosition.z
        );

        const dist = accumulatedPosition.distanceTo(this.lastPosition);
        this.ms = dist * 1000 * delta;
        this.velocityHelper.setLength(this.ms);
        this.lastPosition = accumulatedPosition;

        this.collisionSphere.center.copy(this.object.position);

        accumulatedNormal.divideScalar(this.floatPoints.length).normalize();

        this.cogHelper.setDirection(accumulatedNormal);
        this.cogHelper.position.copy(accumulatedPosition);

        this.object.children[0].rotation.y = this.heading;
        this.object.quaternion.rotateTowards(this.cogHelper.quaternion, delta * 0.2);

        if (this.isPlayerFloater) {
            this.water.position.x = -this.earth.position.x;
            this.water.position.z = -this.earth.position.z;
            this.water.material.uniforms["offsetX"].value = -this.earth.position.x;
            this.water.material.uniforms["offsetZ"].value = -this.earth.position.z;
        }
    }
}
