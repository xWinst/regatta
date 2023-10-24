import { useRef, useEffect, useState, useCallback } from "react";
import { initialScene } from "utils";
import s from "./Canvas.module.css";

const Canvas = () => {
    // const [scene, setScene] = useState();
    // const [camera, setCamera] = useState();
    // const [renderer, setRenderer] = useState();
    const [floaters, setFloaters] = useState();

    const canvasRef = useRef();

    // const controlBoat = useCallback(
    //     (event) => {
    //         const boat = scene.children[0].children.filter(({ name }) => name === "boat")[0];

    //         if (event.code === "KeyA") {
    //             boat.rotation.set([boat.rotation.x + 1, boat.rotation.y, boat.rotation.z]);
    //         }
    //         console.log("boat.rotation: ", boat.rotation);
    //         console.log("boat.rotation.x: ", boat.rotation.x);
    //         console.log("boat.rotation.y: ", boat.rotation.y);
    //         console.log("boat.rotation.z: ", boat.rotation.z);
    //     },
    //     [scene]
    // );

    const addFloaters = (floaters) => {
        console.log("floaters: ", floaters);
        setFloaters(floaters);
    };

    const controlBoat = useCallback(
        function (event) {
            if (event.code === "KeyA") floaters[0].heading += 0.02;
            if (event.code === "KeyD") floaters[0].heading -= 0.02;
            if (event.code === "KeyW" && floaters[0].power < 2) floaters[0].power += 0.2;
            if (event.code === "KeyS" && floaters[0].power > -1) floaters[0].power -= 0.2;
        },
        [floaters]
    );

    useEffect(() => {
        const canvas = canvasRef.current;
        const { camera, renderer } = initialScene(canvas, addFloaters);

        const resize = () => {
            camera.aspect = canvas.offsetWidth / canvas.offsetHeight;
            renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
            // renderer.render(scene, camera);
        };

        // const controlBoat = (event) => {
        //     const boat = scene.children[0].children.filter(({ name }) => name === "boat")[0];
        //     console.log("boat: ", boat);

        //     if (event.code === "KeyA") {
        //         boat.rotateOnAxis(new Vector3(0, 1, 0), 0.05);
        //     }
        //     if (event.code === "KeyD") {
        //         boat.rotateOnAxis(new Vector3(0, 1, 0), -0.05);
        //     }
        //     if (event.code === "KeyW") {
        //         boat.position.set(boat.position.x + 1, boat.position.y, boat.position.z);
        //     }
        // };

        window.addEventListener("resize", resize);

        // setScene(scene);
        // setFloaters(floaters);
        // setCamera(camera);
        // setRenderer(renderer);

        return () => {
            window.removeEventListener("resize", resize);
        };
    }, []);

    useEffect(() => {
        window.addEventListener("keydown", controlBoat);
        return () => {
            window.removeEventListener("keydown", controlBoat);
        };
    }, [controlBoat]);

    return (
        <>
            <canvas className={s.canvas} ref={canvasRef} />
        </>
    );
};

export default Canvas;
