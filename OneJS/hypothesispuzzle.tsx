import { emo } from "onejs/styled"
import { h } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { InfoIcon, InfoTip, Tip } from "infotip"
import { HintPopup } from "puzzlehint"
// OneJS-Global (per ScriptEngine.SetValue("resource", ...)); loadImage(path) -> Texture2D
declare const resource: { loadImage(path: string): any }

// Texturen selbst laden + FilterMode.Point + cachen (wie pipeleakpuzzle.tsx): ein an backgroundImage
// übergebener Pfad-String würde bilinear gefiltert -> matschige Kanten statt harter Pixel.
const _texCache: { [name: string]: any } = {}
const IMG = (name: string) => {
    let t = _texCache[name]
    if (t === undefined) { // undefined = noch nicht versucht; null = fehlt (nicht erneut laden)
        try {
            t = resource.loadImage(__dirname + "/img/puzzle_4/" + name + ".png")
            if (t) t.filterMode = 0 // FilterMode.Point (numerisch, robuster über die Interop)
        } catch (e) { t = null }
        _texCache[name] = t || null
    }
    return t
}

// Farb-Teilmenge, lokal (wie in den anderen Puzzle-Dateien).
const COL = {
    panel: "rgb(28, 32, 40)",
    border: "rgb(78, 88, 104)",
    accent: "rgb(69, 52, 39)", // Button-Braun statt Blau (Blau passte nicht zur Tempel-Palette)
    text: "rgb(235, 238, 242)",
    dim: "rgb(150, 156, 166)",
    backdrop: "rgb(10, 12, 16)",
    good: "rgb(90, 200, 120)",
    bad: "rgb(220, 90, 84)",
    highlight: "rgb(220, 190, 90)",
    node: "rgb(52, 46, 62)",
    empty: "rgb(235, 238, 242)", // weiße Kugel/Slot = leer/unbekannt (wie im Mockup)
}

// ─────────────────────────────────────────────────────────────────────────────
// RÄTSEL 4: Hypothesen-Maschine (Scientific Debugging, Zeller Kap. 6).
// BEWUSST OHNE TEXT, wie Rätsel 1/2: nur Symbole und visuelles Feedback.
// Eine Kette von Einheiten (Anzahl VARIIERT je Stufe: 2/3/4) transformiert
// drei farbige Kugeln; jeder Zustand ist eine MULTIMENGE (intern sortiert für
// Vergleiche/Logs) und wird in ZUFÄLLIGER Reihenfolge ANGEZEIGT: welcher
// Eingabeball zu welchem Ausgabeball wurde, bleibt verborgen. Oben je Einheit eine
// Hypothesen-Tafel (Eingabefarbe -> vermutete Ausgabefarbe). EINE Interaktion
// überall: Farben per DRAG-AND-DROP aus der Palette in einen Tafel-Slot bzw.
// in den Trichter ziehen; Klick auf Slot/Kugel leert sie wieder. Der
// SOLLZUSTAND hängt als eigenes Missions-Panel rechts neben der Maschine
// (Auftrag, kein Maschinenteil). ZWEI PHASEN, gewählt über die Tab-Leiste,
// verankern den Zyklus mechanisch; Hypothesen sind PFLICHT, nichts ist
// direkt ablesbar.
//   EXPERIMENTIERPHASE (Pip-Tab ·/··/...): getestet wird immer genau EINE
//   Einheit, allein an den Trichter geschaltet; die Pip-Tabs wechseln die
//   Einheit MITSAMT ihrer Hypothesen-Tafel (nur die aktive Tafel ist
//   sichtbar). Beliebig viele Läufe. Die Eingabe MUSS aus drei VERSCHIEDENEN
//   Farben bestehen: die Regeln sind PERMUTATIONEN und erhalten
//   Verschiedenheit, jede sortierte Beobachtung bleibt damit mehrdeutig (bis
//   zu 6 konsistente Zuordnungen je Lauf); erst das Schneiden mehrerer
//   GEPLANTER Läufe grenzt ein. Es gibt KEINEN Ziel-Abgleich: gewinnen kann
//   man hier nicht. Unter der Tafel gleicht ✓/✗ die Hypothese laufend mit
//   ALLEN Beobachtungen dieser Einheit ab (verwerfen/anpassen).
//   LÖSUNGSPHASE (Ketten-Tab): ALLE Einheiten werden HINTEREINANDER-
//   GESCHALTET (alle Tafeln sichtbar) und laufen VERDECKT (dunkle Kugeln).
//   Am Maschinen-Ende zeigen Geister-Kugeln die VORHERSAGE der Tafeln für
//   die gewählte Eingabe; ▶ bleibt gesperrt, bis die Tafeln den Pfad der
//   Eingabe vollständig abdecken (leere Slots blinken sonst rot). Duplikate
//   sind nur hier erlaubt (Stufe 3 braucht sie). End-Output == Sollzustand =
//   gelöst (✓ am Ende); Fehlversuch deckt die Zustände auf, wandert ins Log
//   (widerlegte Tafeln kippen auf ✗) und wirft in die Experimentierphase
//   zurück: der Umweg macht jeden Rateversuch zum falsifizierten Experiment,
//   statt stumpfem Durchprobieren direkt am Ziel.
// Alle Zustände (Einheiten-Output, Vorhersage, Sollzustand) stehen als REIHE
// nebeneinander. Der Output jedes Schritts erscheint NEBEN der Einheiten-Box
// (Rohr -> Box -> Rohr -> Ausgabe); die Box selbst ist ein reines Maschinen-
// teil (nur Pips) und dreht sich während eines Laufs kurz.
// Sprites liegen in img/puzzle_4/ (16×16 Murmeln ×2, 32×32 Einheiten-Box ×2,
// Trichter/Rohr); Alternativ-Varianten unter TileProposals/puzzle_4/.
// ─────────────────────────────────────────────────────────────────────────────

// Murmel-Sprite je Palettenfarbe (16×16, img/puzzle_4/); dazu ball_empty (weiß = leer/
// unbekannt) und ball_covered (dunkel = verdeckt in der Lösungsphase).
const BALL_IMG = ["ball_red", "ball_orange", "ball_yellow", "ball_green", "ball_blue", "ball_cyan", "ball_violet", "ball_pink"]

const BALLS = 3 // Kugeln pro Durchlauf

// rules[u][c] = Ausgabefarbe der Einheit u für Eingabefarbe c (Permutation!);
// rules.length = Anzahl der Einheiten (VARIIERT je Stufe: 2/3/4).
// target = gewünschter End-Output (als Multimenge; Reihenfolge egal).
// hint: Vorgehens-Popup beim Betreten der Stufe (s. puzzlehint.tsx).
type HypoRound = { colorCount: number, rules: number[][], target: number[], hint: string }

const room4Rounds: HypoRound[] = [
    // Stufe 1 (leicht): 4 Farben, NUR 2 EINHEITEN. Regeln: +1-Shift, Umkehrung.
    // Gesamt F = [2,1,0,3]; Ziel {0,1,3} <- Input {1,2,3}.
    {
        colorCount: 4,
        rules: [
            [1, 2, 3, 0], // Einheit 1: rot->orange->gelb->grün->rot
            [3, 2, 1, 0], // Einheit 2: Reihenfolge umkehren
        ],
        target: [0, 1, 3],
        hint: [
            "Drag a color from the palette onto a slot to fill in a hypothesis, or onto an input ball to choose what runs through the machine.",
            "",
            "Use the pip tabs to test one unit at a time and watch its output — that's how you form a hypothesis about what it does. Only switch to the chain tab once you're ready to test the whole thing against the target.",
        ].join("\n"),
    },
    // Stufe 2 (mittel): 5 Farben, 3 Einheiten. Gesamt F = [3,0,1,4,2];
    // Ziel {2,3,4} <- Input {0,3,4}.
    {
        colorCount: 5,
        rules: [
            [2, 3, 4, 0, 1], // +2-Shift
            [0, 2, 1, 4, 3], // 1<->2, 3<->4
            [4, 3, 2, 1, 0], // Umkehrung
        ],
        target: [2, 3, 4],
        hint: [
            "A single run of one unit rarely tells you the whole rule — run it with a few different inputs and check whether your hypothesis still holds for all of them.",
            "",
            "A wrong attempt isn't wasted, though: the machine's real output becomes a new observation you can use to refine the hypothesis.",
        ].join("\n"),
    },
    // Stufe 3 (schwer): 6 Farben, 4 EINHEITEN, Ziel MIT Doppel-Farbe (zwingt
    // zur Einsicht, dass Eingaben wiederholt werden dürfen). Gesamt
    // F = [2,0,5,3,1,4]; Ziel {1,1,3} <- Input {3,4,4}.
    {
        colorCount: 6,
        rules: [
            [3, 4, 5, 0, 1, 2], // +3-Shift
            [1, 2, 3, 4, 5, 0], // +1-Shift
            [0, 2, 4, 1, 3, 5], // *2-Verschränkung (0,2,4 nach vorn)
            [5, 4, 3, 2, 1, 0], // Umkehrung
        ],
        target: [1, 1, 3],
        hint: [
            "Four units is too many to guess as a whole — confirm each one on its own tab first, with multiple runs, before you ever attempt the full chain.",
            "",
            "A wrong attempt on the chain isn't a loss either: it reveals every unit's real output, which usually confirms or breaks a hypothesis.",
        ].join("\n"),
    },
]

// Regel auf eine Kugelmenge anwenden und SORTIEREN: die Anzeige (und jeder
// Vergleich) arbeitet auf Multimengen, die Zuordnung bleibt so verborgen.
function applyRule(rule: number[], balls: number[]): number[] {
    const out = balls.map(c => rule[c])
    out.sort((a, b) => a - b)
    return out
}

function arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

// Anzeige-Reihenfolge eines Outputs mischen (Fisher-Yates): die Maschine wirft
// die Kugeln UNGEORDNET aus. Intern (Logs, Vergleiche, Vorhersage, Ziel) bleibt
// alles sortiert; gemischt wird nur die beim Aufdecken gespeicherte Anzeige-
// Kopie, damit sie nicht bei jedem Re-Render neu würfelt.
function shuffled(arr: number[]): number[] {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const t = a[i]; a[i] = a[j]; a[j] = t
    }
    return a
}

// Verzögerung über requestAnimationFrame (Time.timeScale=0, daher nie Unity-Zeit).
function rafDelay(ms: number, fn: () => void) {
    const start = Date.now()
    const loop = () => { if (Date.now() - start >= ms) fn(); else requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
}

// PixelPanel-Rahmen: 9-slice-Sprite (wie stateobservationpuzzle.tsx).
const PANEL_SLICE = 10
const PANEL_SLICE_SCALE = 2

// Vollflächiger Kachel-Hintergrund (aus pipeleakpuzzle.tsx übernommen, gleiche 64×32-Textur/2:1-Aspekt).
const BG_ASPECT = 2
const BG_TILE = 384

// Hover-Erklärungen der einzelnen Panels (siehe InfoIcon/InfoTip in infotip.tsx).
// Das Rätsel bleibt sonst textfrei; die Erklärungen erscheinen nur beim Hover über dem "i".
const TIPS = {
    hypo: "Guessed output per input color\nDrag from palette, click clears\ncheck/cross = fits/contradicts observations",
    palette: "Drag colors onto input balls\nor hypothesis slots",
    machine: "Tabs: one unit or the whole chain\nFill the input balls, the play button runs",
    target: "The chain must output these balls\n(any order) to solve the puzzle",
}

// Statische Layout-Klassen einmal beim Import registrieren (emo nie pro Frame aufrufen).
const S4 = {
    root: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${COL.backdrop}; align-items: center; justify-content: center;`,
    // Gekachelter Hintergrund hinter dem gesamten Rätsel (wie pipeleakpuzzle.tsx).
    bgTile: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-repeat: repeat; background-size: ${BG_TILE * BG_ASPECT}px ${BG_TILE}px;`,
    wrap: emo`align-items: center; justify-content: center;`,
    rowTop: emo`flex-direction: row; align-items: flex-start; justify-content: center;`,
    rowBottom: emo`flex-direction: row; align-items: center; justify-content: center; margin-top: 18px;`,
    col: emo`align-items: center; margin-left: 10px; margin-right: 10px;`,
    abs: emo`position: absolute;`,
    panelOuter: emo`align-items: stretch;`,
    panelInnerStretch: emo`padding: 14px; align-items: stretch;`,
    panelInnerCenter: emo`padding: 14px; align-items: center;`,
    // Hypothesen-Tafel: Zellen im Raster, je Zelle Farbe -> Pfeil -> Slot.
    hypoRow: emo`flex-direction: row; align-items: flex-start; justify-content: center;`,
    hypoCell: emo`align-items: center; margin-left: 6px; margin-right: 6px; margin-top: 4px; margin-bottom: 4px;`,
    inDot: emo`width: 20px; height: 20px; border-radius: 10px; flex-shrink: 0;`,
    arrowImg: emo`width: 16px; height: 16px; flex-shrink: 0; margin-top: 1px; margin-bottom: 1px;`,
    slot: emo`width: 32px; height: 32px; border-radius: 16px; border-width: 2px; border-color: ${COL.border}; flex-shrink: 0;`,
    verdictImg: emo`width: 16px; height: 16px; flex-shrink: 0; margin-top: 8px;`,
    // Palette (Drag-Quelle für Slots und Trichter-Kugeln). Alle Kugeln sind 16×16-
    // Murmel-Sprites, ganzzahlig ×2 (FilterMode.Point -> scharfe Pixel).
    palRow: emo`flex-direction: row; align-items: center; justify-content: center;`,
    palCell: emo`width: 32px; height: 32px; flex-shrink: 0; margin: 4px;`,
    // Maschine: Trichter (Eingabe) -> Einheiten -> Ziel; Rohr-Stücke dazwischen.
    machineRow: emo`flex-direction: row; align-items: center; justify-content: center;`,
    ballCol: emo`align-items: center; justify-content: center;`,
    ballRow: emo`flex-direction: row; align-items: center; justify-content: center;`,
    ball: emo`width: 32px; height: 32px; border-radius: 16px; border-width: 2px; flex-shrink: 0; margin: 3px;`,
    // Einheiten-Box: 32×32-Gehäuse-Sprite ×2; die Pips liegen über der ruhigen Mitte.
    unitBox: emo`width: 64px; height: 64px; flex-shrink: 0; align-items: center; justify-content: center;`,
    pipe: emo`width: 32px; height: 16px; flex-shrink: 0; margin-left: 4px; margin-right: 4px;`,
    resultImg: emo`width: 16px; height: 16px; flex-shrink: 0; margin-top: 6px;`,
    // Geister-Kugeln der Tafel-Vorhersage am Maschinen-Ende.
    ballMini: emo`width: 16px; height: 16px; border-radius: 8px; flex-shrink: 0; margin: 2px; opacity: 0.9;`,
    // Pip-Kennung (1..n Punkte): verbindet Einheit, Tafel und Tab miteinander.
    pipRow: emo`flex-direction: row; align-items: center; justify-content: center; margin-bottom: 5px;`,
    pip: emo`width: 6px; height: 6px; border-radius: 3px; flex-shrink: 0; margin-left: 2px; margin-right: 2px;`,
    // Tab-Leiste: Einheit einzeln testen (Pip-Tabs) oder alle in Reihe (Ketten-Tab).
    tabRow: emo`flex-direction: row; align-items: center; justify-content: center; margin-bottom: 10px;`,
    tab: emo`min-width: 44px; height: 30px; border-radius: 6px; padding-left: 8px; padding-right: 8px; margin-left: 5px; margin-right: 5px; align-items: center; justify-content: center; border-width: 2px;`,
    // Mini-Kette im Ketten-Tab: Kästchen + Verbindungsstücke.
    chainRow: emo`flex-direction: row; align-items: center; justify-content: center;`,
    chainBox: emo`width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; background-color: ${COL.text};`,
    chainLink: emo`width: 5px; height: 2px; flex-shrink: 0; background-color: ${COL.dim};`,
    // Steuerleiste: der Start-Knopf.
    ctrlRow: emo`flex-direction: row; align-items: center; justify-content: center; margin-top: 12px;`,
    btn: emo`width: 44px; height: 44px; flex-shrink: 0;`,
    // Ghost der gezogenen Paletten-Farbe (folgt dem Zeiger).
    ghost: emo`position: absolute; top: 0; left: 0; opacity: 0.9;`,
    ghostBall: emo`width: 32px; height: 32px; flex-shrink: 0;`,
}

// Pixel-Panel (9-slice-Sprite panel_box.png, wie stateobservationpuzzle.tsx).
const PixelPanel = ({ minWidth, center, marginTop, children }: { minWidth?: number, center?: boolean, marginTop?: number, children?: any }) =>
    <div class={S4.panelOuter} style={{
        minWidth: minWidth || 0, marginTop: marginTop || 0, backgroundImage: IMG("panel_box_stone"),
        unitySliceLeft: PANEL_SLICE, unitySliceRight: PANEL_SLICE, unitySliceTop: PANEL_SLICE, unitySliceBottom: PANEL_SLICE,
        unitySliceScale: PANEL_SLICE_SCALE,
    }}>
        <div class={center ? S4.panelInnerCenter : S4.panelInnerStretch}>{children}</div>
    </div>

// Pip-Kennung einer Einheit (1..3 Punkte): verbindet Maschine, Tafel und Tab
// miteinander, ganz ohne Text.
const Pips = ({ n, color }: { n: number, color?: string }) => {
    const dots: any[] = []
    for (let i = 0; i < n; i++) dots.push(<div key={"p" + i} class={S4.pip} style={{ backgroundColor: color || COL.dim }}></div>)
    return <div class={S4.pipRow}>{dots}</div>
}

// Eine Beobachtung an EINER Einheit: Eingabe + ihr (sortierter) Output.
type Obs = { inp: number[], out: number[] }

const HypothesisPuzzle = ({ config, solved }: { config: HypoRound, solved: () => void }) => {
    const cc = config.colorCount
    const units = config.rules.length // Anzahl der Einheiten (variiert je Stufe)
    const target = config.target.slice().sort((a, b) => a - b)
    // hypo[u][c] = vermutete Ausgabefarbe der Einheit u für Eingabefarbe c (-1 = leer).
    const [hypo, setHypo] = useState<number[][]>(() => {
        const m: number[][] = []
        for (let u = 0; u < units; u++) { const r: number[] = []; for (let c = 0; c < cc; c++) r.push(-1); m.push(r) }
        return m
    })
    const [input, setInput] = useState<number[]>(() => { const a: number[] = []; for (let i = 0; i < BALLS; i++) a.push(-1); return a })
    // Experimentierphase: shown[0] = Output der aktiven Einheit; Lösungsphase:
    // shown[u] = Zustand nach Einheit u (erst nach dem Versuch aufgedeckt).
    // Immer die GEMISCHTE Anzeige-Kopie (zufällige Reihenfolge), nie das Log.
    const [shown, setShown] = useState<number[][]>([])
    // Beobachtungs-Log JE EINHEIT (für die Verdikte): gefüttert von den Einzel-
    // Läufen und von aufgedeckten Lösungsversuchen (liefern alle Übergänge).
    const [obs, setObs] = useState<Obs[][]>(() => { const a: Obs[][] = []; for (let u = 0; u < units; u++) a.push([]); return a })
    const [activeUnit, setActiveUnit] = useState(0)          // welche Einheit gerade am Trichter hängt
    const [running, setRunning] = useState(false)
    const [won, setWon] = useState(false)
    const [result, setResult] = useState<null | "win" | "fail">(null)
    const [phase, setPhase] = useState<"explore" | "solve">("explore")
    const [inputFlash, setInputFlash] = useState(false)      // rotes Blinken: Eingabe unvollständig/nicht verschieden
    const [hypoFlash, setHypoFlash] = useState(false)        // rotes Blinken leerer Slots: Vorhersage unvollständig
    // Kurze Drehanimation der Einheiten-Boxen während des Laufs. Rotation als
    // INLINE-Zahl (StyleRotate in Grad), NICHT per emo (siehe ValveWheel in
    // pipeleakpuzzle.tsx: emo pro Frame bläht das Panel-Stylesheet auf -> Lag).
    const [spin, setSpin] = useState(0)
    const lastSpinRef = useRef(0)
    // Drag-and-Drop (Muster aus brewpuzzle.tsx): pointerDown auf einer Paletten-
    // Farbe, Ghost folgt dem Zeiger; Ablage auf einer Trichter-Kugel ODER einem
    // Hypothesen-Slot setzt sie. Die Palette ist reine Drag-Quelle.
    const dragRef = useRef<any>({ down: false, color: 0, startX: 0, startY: 0, x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
    const [tip, setTip] = useState<Tip | null>(null) // aktive Hover-Erklärung (InfoIcon/InfoTip)
    const inputRefs = useRef<any[]>([])
    const slotRefs = useRef<any[]>([]) // flach indiziert: u * cc + c

    function flashInput() { setInputFlash(true); rafDelay(450, () => setInputFlash(false)) }
    function flashHypo() { setHypoFlash(true); rafDelay(450, () => setHypoFlash(false)) }

    // Dreh-Loop: startet mit dem Lauf und dreht die Einheiten-Boxen bis genau zur
    // Aufdeckung (Dauer = das rafDelay des Laufs) ganzzahlig auf 360° zurück; die
    // Schleife beendet sich selbst (running bleibt nach einem Fehlversuch länger
    // true, die Drehung soll aber mit der Aufdeckung stoppen). Smoothstep-Easing,
    // Re-Render nur bei ganzzahliger Winkeländerung (wie ValveWheel).
    useEffect(() => {
        if (!running) { lastSpinRef.current = 0; setSpin(0); return }
        const dur = phase === "solve" ? 700 : 450
        const turns = phase === "solve" ? 2 : 1
        const start = Date.now()
        // Flag statt cancelAnimationFrame: OneJS-rAF-Ids sind Listenindizes, ein Cancel mit
        // veralteter Id kann den Callback einer ANDEREN Komponente aus der Frame-Queue löschen.
        let cancelled = false
        const step = () => {
            if (cancelled) return
            const t = Math.min(1, (Date.now() - start) / dur)
            const e = t * t * (3 - 2 * t)
            const r = Math.round(360 * turns * e) % 360
            if (r !== lastSpinRef.current) { lastSpinRef.current = r; setSpin(r) }
            if (t < 1) requestAnimationFrame(step)
            else if (lastSpinRef.current !== 0) { lastSpinRef.current = 0; setSpin(0) }
        }
        requestAnimationFrame(step)
        return () => { cancelled = true }
    }, [running])

    // Beobachtungen an das Log der jeweiligen Einheit anhängen.
    function logObs(entries: { u: number, inp: number[], out: number[] }[]) {
        setObs(prev => {
            const n = prev.map(l => l.slice())
            for (let i = 0; i < entries.length; i++)
                n[entries[i].u] = n[entries[i].u].concat([{ inp: entries[i].inp, out: entries[i].out }])
            return n
        })
    }

    // Pip-Tab: Einheit (mitsamt Tafel) an den Trichter schalten; aus der
    // Lösungsphase heraus wechselt das zugleich zurück in die Experimentierphase.
    function selectUnit(u: number) {
        if (running || won) return
        if (phase === "explore" && u === activeUnit) return
        setPhase("explore")
        setActiveUnit(u)
        setShown([])
        setResult(null)
    }

    // Ketten-Tab: alle Einheiten hintereinanderschalten (Lösungsphase).
    function goSolve() {
        if (running || won || phase === "solve") return
        setPhase("solve")
        setShown([])
        setResult(null)
    }

    // Slot in der Hypothesen-Tafel setzen (per Drop) bzw. leeren (per Klick).
    function setHypoSlot(u: number, c: number, v: number) {
        if (running || won) return
        setHypo(prev => {
            const n = prev.map(r => r.slice())
            n[u][c] = v
            return n
        })
    }

    // Trichter-Kugel setzen (per Drop aus der Palette) bzw. leeren (per Klick).
    function setInputBall(i: number, c: number) {
        if (running || won) return
        setInput(prev => { const n = prev.slice(); n[i] = c; return n })
    }

    function onPaletteDown(c: number, evt: any) {
        if (running || won) return
        dragRef.current = { down: true, color: c, startX: evt.position.x, startY: evt.position.y, x: evt.position.x, y: evt.position.y }
    }
    function onRootMove(evt: any) {
        const d = dragRef.current
        if (!d.down) return
        d.x = evt.position.x; d.y = evt.position.y
        if (!dragging && (Math.abs(d.x - d.startX) + Math.abs(d.y - d.startY)) > 6) setDragging(true)
        setDragPos({ x: d.x, y: d.y })
    }
    // Trifft (x,y) das Element? (etwas Toleranz um die kleinen Kugeln/Slots herum)
    function hitBall(el: any, x: number, y: number): boolean {
        if (!el || !el.ve) return false
        const wb = el.ve.worldBound
        return x >= wb.x - 8 && x <= wb.x + wb.width + 8 && y >= wb.y - 8 && y <= wb.y + wb.height + 8
    }
    function onRootUp() {
        const d = dragRef.current
        if (!d.down) return
        d.down = false
        if (!dragging) return // einfacher Klick auf die Palette: nichts (reine Drag-Quelle)
        setDragging(false)
        // Ablage auf einer Trichter-Kugel?
        for (let i = 0; i < BALLS; i++)
            if (hitBall(inputRefs.current[i], d.x, d.y)) { setInputBall(i, d.color); return }
        // Ablage auf einem Hypothesen-Slot?
        for (let u = 0; u < units; u++)
            for (let c = 0; c < cc; c++)
                if (hitBall(slotRefs.current[u * cc + c], d.x, d.y)) { setHypoSlot(u, c, d.color); return }
    }
    function onRootLeave() {
        if (!dragRef.current.down) return
        dragRef.current.down = false
        setDragging(false)
    }

    // Laufender Abgleich (Schritt 4 des Zyklus): die Tafel der Einheit u gegen ALLE
    // Beobachtungen dieser Einheit prüfen. Nur Beobachtungen zählen, deren sämtliche
    // Eingabefarben in der Tafel gefüllt sind (sonst gibt es keine Vorhersage).
    //   "bad"  = mindestens eine Vorhersage widerspricht einer Beobachtung
    //   "ok"   = mindestens eine Vorhersage geprüft, keine widerspricht
    //   "none" = noch nichts prüfbar (keine Beobachtungen oder Tafel zu leer)
    function verdict(u: number): "none" | "ok" | "bad" {
        let seen = false
        const list = obs[u]
        for (let i = 0; i < list.length; i++) {
            const inp = list[i].inp
            let complete = true
            for (let k = 0; k < inp.length; k++) if (hypo[u][inp[k]] < 0) { complete = false; break }
            if (!complete) continue
            seen = true
            if (!arraysEqual(applyRule(hypo[u], inp), list[i].out)) return "bad"
        }
        return seen ? "ok" : "none"
    }

    // Vorhersage der Tafeln für die aktuelle Eingabe (Schritt 2 des Zyklus):
    // Kette hypo1 -> hypo2 -> hypo3, am Ende sortiert. null, solange die Eingabe
    // unvollständig ist oder ein benötigter Slot entlang des Pfades leer ist.
    function predictFinal(): number[] | null {
        let cur = input.slice()
        for (let i = 0; i < cur.length; i++) if (cur[i] < 0) return null
        for (let u = 0; u < units; u++) {
            const next: number[] = []
            for (let i = 0; i < cur.length; i++) {
                const v = hypo[u][cur[i]]
                if (v < 0) return null
                next.push(v)
            }
            cur = next
        }
        cur.sort((a, b) => a - b)
        return cur
    }

    // Experiment (Schritt 3): ein Lauf durch die AKTIVE Einheit allein; ihr
    // Output wird aufgedeckt und geloggt. KEIN Ziel-Abgleich (erschließen,
    // nicht raten). Die Eingabe muss aus drei VERSCHIEDENEN Farben bestehen:
    // Doppel-Farben verraten sich im sortierten Output und machten die
    // Zuordnung direkt ablesbar (Monochrom-Lauf = Regel gratis).
    function runExplore() {
        for (let i = 0; i < input.length; i++) if (input[i] < 0) { flashInput(); return }
        for (let i = 0; i < input.length; i++)
            for (let k = i + 1; k < input.length; k++)
                if (input[i] === input[k]) { flashInput(); return }
        const u = activeUnit
        const out = applyRule(config.rules[u], input)
        const inputCopy = input.slice()
        setRunning(true)
        setShown([])
        setResult(null)
        rafDelay(450, () => {
            setShown([shuffled(out)]) // Anzeige zufällig; das Log behält die sortierte Multimenge
            logObs([{ u: u, inp: inputCopy, out: out }])
            setRunning(false)
        })
    }

    // Lösungsversuch: nur mit vollständiger Tafel-Vorhersage für die Eingabe
    // (Hypothesen sind Pflicht). Die Maschine läuft verdeckt; erst das Ergebnis
    // deckt die Zustände auf. Treffer = gelöst; Fehlversuch = falsifiziertes
    // Experiment: wandert ins Log (Verdikte kippen ggf. auf ✗) und wirft in die
    // Experimentierphase zurück.
    function runSolve() {
        for (let i = 0; i < input.length; i++) if (input[i] < 0) { flashInput(); return }
        if (!predictFinal()) { flashHypo(); return }
        const states: number[][] = []
        let cur = input.slice()
        for (let u = 0; u < units; u++) { cur = applyRule(config.rules[u], cur); states.push(cur) }
        const inputCopy = input.slice()
        setRunning(true)
        setShown([])
        setResult(null)
        rafDelay(700, () => {
            const win = arraysEqual(states[units - 1], target)
            setShown(states.map(shuffled)) // Anzeige zufällig; Vergleich/Log auf den sortierten states
            setResult(win ? "win" : "fail")
            // Der aufgedeckte Versuch liefert eine Beobachtung je Einheit.
            const entries: { u: number, inp: number[], out: number[] }[] = []
            for (let u = 0; u < units; u++) entries.push({ u: u, inp: u === 0 ? inputCopy : states[u - 1], out: states[u] })
            logObs(entries)
            if (win) { setWon(true); setRunning(false); rafDelay(1200, solved) }
            // running bleibt bis zum Phasenwechsel true: der Spieler sieht den
            // aufgedeckten Fehlversuch, ohne dazwischenfunken zu können.
            // shown mit leeren: sonst zeigt die Experimentierphase shown[0] (Zustand
            // nach Einheit 1 des Fehlversuchs) als Output der aktiven Einheit an.
            else rafDelay(1400, () => { setResult(null); setPhase("explore"); setShown([]); setRunning(false) })
        })
    }

    function run() {
        if (running || won) return
        if (phase === "solve") runSolve(); else runExplore()
    }

    // Farbige Kugel/Slot als Murmel-Sprite: -1 = leer (weiße ball_empty-Murmel).
    function ballStyle(c: number, borderColor?: string): any {
        return {
            backgroundImage: IMG(c >= 0 ? BALL_IMG[c] : "ball_empty"),
            backgroundColor: "rgba(0,0,0,0)",
            borderColor: borderColor || "rgba(0,0,0,0)",
        }
    }

    // ── Hypothesen-Tafeln (eine je Einheit), Zellen in zwei Reihen wie im Mockup.
    const perRow = Math.ceil(cc / 2)
    const hypoPanels: any[] = []
    for (let u = 0; u < units; u++) {
        const rows: any[] = []
        // Pip-Kennung + Info-"i" nebeneinander, vertikal zentriert (ein Ecken-Icon
        // würde im schmalen Panel die Slots überlappen).
        rows.push(<div key={"pp" + u} class={S4.ballRow}>
            <Pips n={u + 1} color={COL.dim} />
            <InfoIcon text={TIPS.hypo} setTip={setTip} style={{ marginLeft: 8, marginBottom: 5 }} />
        </div>)
        for (let r = 0; r * perRow < cc; r++) {
            const cells: any[] = []
            for (let c = r * perRow; c < Math.min(cc, (r + 1) * perRow); c++) {
                const cIdx = c, uIdx = u
                // Slot = Drop-Ziel (Ref für den Hit-Test); Klick leert ihn.
                cells.push(<div key={"h" + u + "-" + c} class={S4.hypoCell}>
                    <div class={S4.inDot} style={{ backgroundImage: IMG(BALL_IMG[c]), backgroundColor: "rgba(0,0,0,0)" }}></div>
                    <div class={S4.arrowImg} style={{ backgroundImage: IMG("arrow_down") }}></div>
                    <div ref={(el: any) => { slotRefs.current[uIdx * cc + cIdx] = el }}
                        onClick={() => setHypoSlot(uIdx, cIdx, -1)} class={S4.slot}
                        style={ballStyle(hypo[u][c], hypoFlash && hypo[u][c] < 0 ? COL.bad : undefined)}></div>
                </div>)
            }
            rows.push(<div key={"hr" + u + "-" + r} class={S4.hypoRow}>{cells}</div>)
        }
        const v = verdict(u)
        rows.push(<div key={"hv" + u} class={S4.verdictImg}
            style={{ backgroundImage: IMG(v === "ok" ? "check" : v === "bad" ? "cross" : "dash") }}></div>)
        hypoPanels.push(<div key={"hp" + u} class={S4.col}><PixelPanel center>{rows}</PixelPanel></div>)
    }

    // ── Palette (reine Drag-Quelle), zwei Reihen wie im Mockup.
    const palRows: any[] = []
    for (let r = 0; r * perRow < cc; r++) {
        const cells: any[] = []
        for (let c = r * perRow; c < Math.min(cc, (r + 1) * perRow); c++) {
            const cIdx = c
            cells.push(<div key={"p" + c} onPointerDown={(e: any) => onPaletteDown(cIdx, e)} class={S4.palCell}
                style={{ backgroundImage: IMG(BALL_IMG[c]) }}></div>)
        }
        palRows.push(<div key={"pr" + r} class={S4.palRow}>{cells}</div>)
    }
    // Info-"i" als eigene Reihe unter der Palette (ein Ecken-Icon würde die oberste Farbzelle überlappen).
    palRows.push(<div key="pi" class={S4.palRow} style={{ marginTop: 4 }}>
        <InfoIcon text={TIPS.palette} setTip={setTip} />
    </div>)

    // ── Maschine: Eingabe-Trichter -> je Einheit Box + Ausgabe -> Maschinen-Ende.
    const inputBalls: any[] = []
    for (let i = 0; i < BALLS; i++) {
        const iIdx = i
        // Drop-Ziel (Ref für den Hit-Test beim Ablegen); Klick leert die Kugel.
        inputBalls.push(<div key={"in" + i} ref={(el: any) => { inputRefs.current[iIdx] = el }}
            onClick={() => setInputBall(iIdx, -1)} class={S4.ball}
            style={ballStyle(input[i], inputFlash ? COL.bad : COL.accent)}></div>)
    }
    // Kugel-Divs einer Einheiten-Box: Zustand, weiß (leer) oder verdeckt (dunkle Murmel).
    function unitBallDivs(st: number[] | null, covered: boolean): any[] {
        const balls: any[] = []
        for (let i = 0; i < BALLS; i++)
            balls.push(<div key={"b" + i} class={S4.ball}
                style={st ? ballStyle(st[i]) : (covered
                    ? { backgroundImage: IMG("ball_covered"), backgroundColor: "rgba(0,0,0,0)", borderColor: "rgba(0,0,0,0)" } // verdeckt
                    : ballStyle(-1))}></div>)
        return balls
    }
    // Experimentierphase: genau EINE Einheit hängt am Trichter (Tabs wechseln
    // sie); Lösungsphase: alle hintereinandergeschaltet, verdeckt bis zum
    // Ergebnis des Versuchs. Je Schritt: Rohr -> Einheiten-Box (reines
    // Maschinenteil mit Pips, dreht sich beim Lauf) -> Rohr -> Ausgabe-Reihe
    // NEBEN der Box.
    const unitBoxes: any[] = []
    function pushUnit(u: number, st: number[] | null, covered: boolean, key: string) {
        unitBoxes.push(<div key={key + "p1"} class={S4.pipe} style={{ backgroundImage: IMG("pipe") }}></div>)
        unitBoxes.push(<div key={key + "box"} class={S4.unitBox} style={{ backgroundImage: IMG("unitbox"), rotate: spin }}>
            <Pips n={u + 1} color={COL.text} />
        </div>)
        unitBoxes.push(<div key={key + "p2"} class={S4.pipe} style={{ backgroundImage: IMG("pipe") }}></div>)
        unitBoxes.push(<div key={key + "out"} class={S4.ballRow}>{unitBallDivs(st, covered)}</div>)
    }
    if (phase === "explore") pushUnit(activeUnit, shown.length > 0 ? shown[0] : null, false, "x")
    else for (let u = 0; u < units; u++) pushUnit(u, u < shown.length ? shown[u] : null, true, "u" + u)
    // Tabs: je Einheit ein Pip-Tab (einzeln testen) + der Ketten-Tab (alle
    // hintereinanderschalten = Lösungsphase). Immer sichtbar.
    const tabs: any[] = []
    for (let u = 0; u < units; u++) {
        const uIdx = u
        tabs.push(<div key={"tab" + u} onClick={() => selectUnit(uIdx)} class={S4.tab}
            style={{ backgroundColor: "rgb(69, 52, 39)", borderColor: phase === "explore" && u === activeUnit ? COL.highlight : "rgba(0,0,0,0)" }}>
            <Pips n={u + 1} color={COL.text} />
        </div>)
    }
    const chainBits: any[] = []
    for (let u = 0; u < units; u++) {
        if (u > 0) chainBits.push(<div key={"l" + u} class={S4.chainLink}></div>)
        chainBits.push(<div key={"b" + u} class={S4.chainBox}></div>)
    }
    tabs.push(<div key="tabchain" onClick={goSolve} class={S4.tab}
        style={{ backgroundColor: "rgb(69, 52, 39)", borderColor: phase === "solve" ? COL.highlight : "rgba(0,0,0,0)" }}>
        <div class={S4.chainRow}>{chainBits}</div>
    </div>)
    const targetBalls: any[] = []
    for (let i = 0; i < target.length; i++)
        targetBalls.push(<div key={"t" + i} class={S4.ball} style={ballStyle(target[i], COL.highlight)}></div>)
    // Info-"i" inline hinter den Kugeln (das Missions-Panel ist zu klein für ein Ecken-Icon).
    targetBalls.push(<InfoIcon key="ti" text={TIPS.target} setTip={setTip} style={{ marginLeft: 8 }} />)
    // Vorhersage-Reihe (nur Lösungsphase): was die Tafeln für die aktuelle
    // Eingabe versprechen; weiß (leer), solange der Pfad nicht abgedeckt ist.
    const pred = phase === "solve" ? predictFinal() : null
    const predBalls: any[] = []
    if (phase === "solve")
        for (let i = 0; i < BALLS; i++)
            predBalls.push(<div key={"pb" + i} class={S4.ballMini} style={ballStyle(pred ? pred[i] : -1)}></div>)

    return <div class={S4.root} onPointerMove={onRootMove} onPointerUp={onRootUp} onPointerLeave={onRootLeave}>
        <div class={S4.bgTile} style={{ backgroundImage: IMG("puzzle_1_background") }}></div>
        <div class={S4.wrap}>
            {/* Oben: Hypothesen-Tafel(n). Experimentierphase: nur die Tafel der
                aktiven Einheit (sie wechselt mit der Maschine); Lösungsphase: alle drei. */}
            <div class={S4.rowTop}>{phase === "explore" ? hypoPanels[activeUnit] : hypoPanels}</div>

            <div class={S4.rowBottom}>
                {/* Links: Palette; Farben von hier auf Slots/Eingabe-Kugeln ziehen. */}
                <div class={S4.col}>
                    <PixelPanel center>{palRows}</PixelPanel>
                </div>

                {/* Die Maschine selbst. */}
                <div class={S4.col}>
                    <PixelPanel center>
                        {/* Info-"i" in der Panel-Ecke (das Panel ist breit genug, nichts liegt oben rechts). */}
                        <InfoIcon text={TIPS.machine} setTip={setTip} corner />
                        {/* Tabs: Einheit einzeln testen oder (Ketten-Tab) alles in Reihe. */}
                        <div class={S4.tabRow}>{tabs}</div>
                        <div class={S4.machineRow}>
                            {/* Eingabe-Trichter: anklickbare Kugeln (blauer Rand = editierbar). */}
                            <div class={S4.ballCol}>
                                <div class={S4.ballRow}>{inputBalls}</div>
                            </div>
                            {/* Array in eigenem Container (h erlaubt Array nur als einziges Kind). */}
                            <div class={S4.machineRow}>{unitBoxes}</div>
                            {/* Maschinen-Ende (nur Lösungsphase): Geister-Grüppchen = Vorhersage
                                der Tafeln für die Eingabe, darunter ✓/✗ des letzten Versuchs. */}
                            {phase === "solve"
                                ? <div class={S4.machineRow}>
                                    <div class={S4.pipe} style={{ backgroundImage: IMG("pipe") }}></div>
                                    <div class={S4.ballCol}>
                                        <div class={S4.ballRow}>{predBalls}</div>
                                        <div class={S4.resultImg} style={{ backgroundImage: IMG(result === "win" ? "check" : result === "fail" ? "cross" : "dash") }}></div>
                                    </div>
                                </div>
                                : <div></div>}
                        </div>
                        {/* Start. In der Lösungsphase ist der Play-Knopf gesperrt, bis die
                            Tafeln die Eingabe vollständig vorhersagen (pred != null). */}
                        <div class={S4.ctrlRow}>
                            <div onClick={(running || (phase === "solve" && !pred)) ? undefined : run} class={S4.btn}
                                style={{ backgroundImage: IMG("play"), backgroundColor: "rgba(0,0,0,0)", opacity: (running || (phase === "solve" && !pred)) ? 0.4 : 1 }}></div>
                        </div>
                    </PixelPanel>
                </div>

                {/* Rechts: der Sollzustand als eigenes Missions-Panel (Auftrag,
                    kein Maschinenteil), in beiden Phasen sichtbar. */}
                <div class={S4.col}>
                    <PixelPanel center>
                        <div class={S4.ballRow}>{targetBalls}</div>
                    </PixelPanel>
                </div>
            </div>
        </div>

        {dragging
            ? <div class={S4.ghost} style={{ translate: [dragPos.x - 16, dragPos.y - 16] }}>
                <div class={S4.ghostBall} style={{ backgroundImage: IMG(BALL_IMG[dragRef.current.color]) }}></div>
            </div>
            : <div></div>}

        {/* Hover-Erklärung — als letztes Kind, damit sie über allen Panels liegt (wie der Ghost) */}
        <InfoTip tip={tip} />

        {/* Vorgehens-Popup beim Betreten der Stufe — ganz zuletzt, liegt über allem (auch der InfoTip). */}
        <HintPopup text={config.hint} />
    </div>
}

// Default-Export: spielt alle Stufen des Hypothesen-Bereichs hintereinander in einer Sitzung ab
// (subLevel = Startstufe, 1-basiert; im normalen Spiel immer 1). Erst nach der letzten Stufe ruft sie
// die übergebene solved() auf — frühere Stufen schalten intern zur nächsten weiter.
const Puzzle4 = ({ subLevel, solved }: { subLevel: number, solved: () => void }) => {
    const start = Math.max(0, Math.min(room4Rounds.length - 1, (subLevel || 1) - 1))
    const [idx, setIdx] = useState(start)
    function roundSolved() {
        if (idx < room4Rounds.length - 1) setIdx(idx + 1)
        else solved()
    }
    return <HypothesisPuzzle key={idx} config={room4Rounds[idx]} solved={roundSolved} />
}
export default Puzzle4
