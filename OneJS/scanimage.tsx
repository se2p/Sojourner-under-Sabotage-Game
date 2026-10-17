import { emo } from "onejs/styled"
import { h } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
// OneJS-Global (per ScriptEngine.SetValue("resource", ...)); loadImage(path) -> Texture2D
declare const resource: { loadImage(path: string): any }

// scanDisplay ist nur im Debug-Strang registriert (per-Szene _objects-Eintrag). Da scanimage in der
// gemeinsamen index.tsx hängt, wird dieses Modul auch in Game.unity geladen, wo scanDisplay fehlt — der
// require würde dort das ganze Overlay crashen. Deshalb defensiv: fehlt es, bleibt das Overlay inaktiv.
let scanDisplay: any = null
try { scanDisplay = require("scanDisplay") } catch (e) { /* in dieser Szene nicht registriert */ }

// Pixel-Art-Szene: galaxy.png ist die 16:9-Basis (320×180), der Planet (96×96) sitzt darin. Die ganze
// Szene wird als Block einheitlich skaliert -> Galaxy- und Planet-Pixel sind automatisch exakt gleich groß.
const SCENE_W = 320, SCENE_H = 180
const PLANET_W = 96, PLANET_H = 96
const PLANET_X = Math.round((SCENE_W - PLANET_W) / 2)  // 112 — Planet zentriert in der Szene
const PLANET_Y = Math.round((SCENE_H - PLANET_H) / 2)  // 42
const BACKGROUND = "galaxy.png"  // fester Hintergrund hinter dem (per Telescope.scanImage gesetzten) Planeten

// Texturen selbst laden und auf FilterMode.Point stellen (sonst lädt der Style-Prozessor sie bilinear -> Blur),
// dann cachen. Eine direkt übergebene Texture2D behält ihren filterMode -> pixelgenaue Kanten beim Hochskalieren.
const _texCache: { [path: string]: any } = {}
const IMG = (file: string) => {
    const path = __dirname + "/img/" + file
    let t = _texCache[path]
    if (t === undefined) { // undefined = noch nicht versucht; null = fehlt (nicht erneut laden)
        try {
            t = resource.loadImage(path)
            if (t) t.filterMode = 0 // FilterMode.Point — numerisch statt Enum-Member (robuster über die Interop)
        } catch (e) { t = null }
        _texCache[path] = t || null
    }
    return t
}

// Vollbild-Bild beim Teleskop-Scan: ScanDisplay.Show(image) zeigt den Planeten (Pfad relativ zu img/, z. B.
// "planet.png") auf dem Galaxy-Hintergrund, ScanDisplay.Hide() blendet alles aus.
// Liegt in index.tsx VOR <Dialogue/>, damit die Dialogbox über dem Bild gezeichnet wird.
const ScanImage = () => {
    const [image, setImage] = useState<string | null>(null)
    const [scale, setScale] = useState(1)
    const rootRef = useRef<any>()

    function show(img: string) { setImage(img) }
    function hide() { setImage(null) }

    useEffect(() => {
        if (!scanDisplay) return  // nicht registriert (z. B. Game.unity) -> Overlay inaktiv

        scanDisplay.add_OnShowImage(show)
        scanDisplay.add_OnHideImage(hide)

        onEngineReload(() => {  // Cleanup für Live Reload
            scanDisplay.remove_OnShowImage(show)
            scanDisplay.remove_OnHideImage(hide)
        })

        return () => {  // Cleanup beim Unmount
            scanDisplay.remove_OnShowImage(show)
            scanDisplay.remove_OnHideImage(hide)
        }
    }, [])

    // Cover-Skalierung: die 320×180-Szene so groß ziehen, dass sie den Bildschirm füllt (überstehende
    // Ränder werden vom Panel beschnitten). generateVisualContent dient hier nur als Geometrie-Hook (wie
    // in minigame.tsx) — er feuert bei Layout-/Größenänderungen, sodass wir bei Resize neu skalieren.
    useEffect(() => {
        if (!rootRef.current || !rootRef.current.ve) return
        rootRef.current.ve.generateVisualContent = measure
        rootRef.current.ve.MarkDirtyRepaint()
    }, [image])

    function measure() {
        if (!rootRef.current || !rootRef.current.ve) return
        const w = rootRef.current.ve.layout.width
        const h = rootRef.current.ve.layout.height
        if (w > 0 && h > 0) {
            const f = Math.max(w / SCENE_W, h / SCENE_H)
            setScale(prev => Math.abs(prev - f) > 0.001 ? f : prev) // nur bei echter Änderung -> kein Repaint-Loop
        }
    }

    if (!image) return null

    return <div
        ref={rootRef}
        class={emo`
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #000;
            align-items: center;
            justify-content: center;
        `}>
        {/* Die 320×180-Szene als ein skalierter Block (scale wirkt um die Mitte -> bleibt zentriert). */}
        <div
            class={emo`
                width: ${SCENE_W}px;
                height: ${SCENE_H}px;
                scale: ${scale};
            `}
            style={{ backgroundImage: IMG(BACKGROUND), unityBackgroundScaleMode: "StretchToFill" }}>
            {/* Planet in nativer Größe an seiner Position in der Szene; skaliert mit dem Block mit. */}
            <div
                class={emo`
                    position: absolute;
                    width: ${PLANET_W}px;
                    height: ${PLANET_H}px;
                    left: ${PLANET_X}px;
                    top: ${PLANET_Y}px;
                `}
                style={{ backgroundImage: IMG(image), unityBackgroundScaleMode: "StretchToFill" }}>
            </div>
        </div>
    </div>
}

export default ScanImage
