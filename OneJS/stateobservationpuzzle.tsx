import { emo } from "onejs/styled"
import { h } from "preact"
import { useState, useRef } from "preact/hooks"
import { InfoIcon, InfoTip, Tip } from "infotip"
import { HintPopup } from "puzzlehint"
// OneJS-Global (per ScriptEngine.SetValue("resource", ...)); loadImage(path) -> Texture2D
declare const resource: { loadImage(path: string): any }

// Farb-Teilmenge, lokal (vormals zentral in debugpuzzle.tsx).
const COL = {
    panel: "rgb(28, 32, 40)",
    border: "rgb(78, 88, 104)", // heller Rahmen des Pixel-Panels (gegen den dunklen Hintergrund sichtbar)
    pipeClosed: "rgb(70, 76, 86)",
    accent: "rgb(69, 52, 39)", // Button-Braun statt Blau (Blau passte nicht zur Tempel-Palette)
    text: "rgb(235, 238, 242)",
    backdrop: "rgb(10, 12, 16)",
}

// ─────────────────────────────────────────────────────────────────────────────
// RÄTSEL 2 — "Beobachtung von Programmzuständen" (Observing Facts, Zeller Kap. 8).
// Ein blockbasiertes "Programm" läuft top→bottom. Jeder Block setzt EINE Variable auf
// eine Zielfarbe ("X → Farbe"). Die Ausgangsfarbe ist der aktuelle Zustand zur Laufzeit
// (steht nicht auf der Kachel). Variablen sind als farbige Lampen sichtbar. Manche
// Blöcke sind verdeckt ("?"). Eigene Kacheln baut der Spieler im Builder (Variable +
// Zielfarbe) und zieht sie zwischen die Blöcke. Es gibt REGELN für erlaubte Farbübergänge
// (Legende): ist der Schritt Ist-Farbe→Zielfarbe nicht erlaubt, BRICHT das Programm dort ab
// und zeigt den unerlaubten Übergang. Gewonnen = Lauf komplett + Ziel-Zustand erreicht.
// ─────────────────────────────────────────────────────────────────────────────

// Zustandswert -> Farb-Sprite (16×16, ×3 = 48px). Index = Zustandswert (0 = aus).
const VAL_IMG = ["gray", "red", "green", "blue", "yellow"]
// Variablen-Identität -> Form-Sprite (statt Buchstabe A/B/C). Index = Variablennummer.
const VAR_IMG = ["circle", "star", "triangle", "plus"]
// Fallback-Farben, falls eine Wert-Textur fehlt (sonst nur farbiges Quadrat).
const SCOL = ["rgb(70,76,86)", "rgb(200,70,66)", "rgb(70,170,100)", "rgb(70,120,200)", "rgb(210,190,80)"]

// Texturen selbst laden + FilterMode.Point + cachen (wie pipeleakpuzzle.tsx): ein an backgroundImage
// übergebener Pfad-String würde intern bilinear gefiltert -> dunkle Säume an den Kanten. Eine direkt
// gereichte Texture2D behält Point + ganzzahlige Skalierung -> pixelgenau.
const _texCache: { [name: string]: any } = {}
const IMG = (name: string) => {
    let t = _texCache[name]
    if (t === undefined) { // undefined = noch nicht versucht; null = fehlt
        try {
            t = resource.loadImage(__dirname + "/img/puzzle_2/" + name + ".png")
            if (t) t.filterMode = 0 // FilterMode.Point (numerisch, robuster über die Interop)
        } catch (e) { t = null }
        _texCache[name] = t || null
    }
    return t
}

// PixelPanel-Rahmen: 9-slice-Sprite (32×32, panel_box.png) statt gestapelter Farb-Boxen.
// PANEL_SLICE = Rand in Textur-Pixeln, der die Ecken/Rivets fix hält (Mitte wird gestreckt);
// PANEL_SLICE_SCALE = Bildschirm-Vielfaches des Randes (entspricht der bisherigen 6px-Rahmendicke).
const PANEL_SLICE = 10
const PANEL_SLICE_SCALE = 2

// Vollflächiger Kachel-Hintergrund (aus pipeleakpuzzle.tsx übernommen, gleiche 64×32-Textur/2:1-Aspekt).
const BG_ASPECT = 2
const BG_TILE = 384

// Erlaubte Farbübergänge (Regeln) — in der Legende sichtbar.
// Zyklus: aus(0)→rot(1)→blau(3)→grün(2)→gelb(4)→rot(1). Jeder Block setzt aktiv, daher
// ist auch das Setzen auf die gleiche Farbe (from==to, z.B. rot→rot) NICHT erlaubt.
const TRANSITIONS: { [from: number]: number[] } = {
    0: [1], // aus  -> rot
    1: [3], // rot  -> blau
    3: [2], // blau -> grün
    2: [4], // grün -> gelb
    4: [1], // gelb -> rot
}
function isLegal(from: number, to: number): boolean {
    const outs = TRANSITIONS[from]
    return !!outs && outs.indexOf(to) >= 0
}

type SBlock = { target: number, to: number, hidden: boolean } // "Variable target := Farbe to"
type Item = { fixed: boolean, block: SBlock } // fixed = vom Programm vorgegeben (gesperrt), sonst Spieler-Kachel
// hint: Vorgehens-Popup beim Betreten der Stufe (s. puzzlehint.tsx).
type StateRound = { colorCount: number, initial: number[], program: SBlock[], goal: number[], tileBudget: number, hint: string }

function arraysEqual(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
    return true
}

// Verzögerung über requestAnimationFrame (Time.timeScale=0 -> nur rAF/Date.now, nie Unity-Zeit).
function rafDelay(ms: number, fn: () => void) {
    const start = Date.now()
    const loop = () => { if (Date.now() - start >= ms) fn(); else requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
}

// Hover-Erklärungen der einzelnen Panels/Felder (siehe InfoIcon/InfoTip in infotip.tsx).
const TIPS = {
    vars: "Current value of each variable\nThe blocks recolor them",
    goal: "Required colors after a full run",
    program: "Runs top to bottom\nPlay runs all, arrows: one step\nClick a green tile to remove it",
    builder: "Click shape / color to change them\nDrag the tile into the program",
    legend: "Allowed color changes\nAnything else aborts the run",
}

// Statische Layout-Klassen einmal beim Import registrieren (emo nie pro Frame aufrufen).
const S2 = {
    root: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${COL.backdrop}; align-items: center; justify-content: center;`,
    // Gekachelter Hintergrund hinter dem gesamten Rätsel (wie pipeleakpuzzle.tsx).
    bgTile: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-repeat: repeat; background-size: ${BG_TILE * BG_ASPECT}px ${BG_TILE}px;`,
    wrap: emo`flex-direction: row; align-items: center; justify-content: center;`,
    col: emo`align-items: center; margin-left: 24px; margin-right: 24px;`,
    title: emo`color: ${COL.text}; font-size: 16px; -unity-font-style: bold; margin-bottom: 10px; -unity-text-align: middle-center;`,
    // Titel + Info-"i" nebeneinander (der Titel gibt seinen unteren Rand an die Reihe ab, s. inline marginBottom: 0).
    titleRow: emo`flex-direction: row; align-items: center; justify-content: center; margin-bottom: 10px;`,
    lampRow: emo`flex-direction: row; align-items: flex-start; justify-content: center;`,
    lampCell: emo`align-items: center; margin-left: 8px; margin-right: 8px;`,
    lampImg: emo`width: 48px; height: 48px; flex-shrink: 0;`,            // aktuelle Variablen-Lampe (Wert-Sprite)
    labelImg: emo`width: 28px; height: 28px; flex-shrink: 0; margin-top: 5px;`, // Variablen-Form unter der Lampe
    // Kachel = Form(Variable) -> Pfeil -> Farbe(Ziel). Alles Sprites.
    tileRow: emo`flex-direction: row; align-items: center; justify-content: center;`,
    img48: emo`width: 48px; height: 48px; flex-shrink: 0;`,
    img32: emo`width: 32px; height: 32px; flex-shrink: 0;`,
    arrow48: emo`width: 32px; height: 32px; flex-shrink: 0; margin-left: 6px; margin-right: 6px;`,
    arrow32: emo`width: 24px; height: 24px; flex-shrink: 0; margin-left: 4px; margin-right: 4px;`,
    // Pixel-Panel: gestapelte absolute Boxen bilden den Rahmen; der Inhalt liegt darüber.
    abs: emo`position: absolute;`,
    panelOuter: emo`align-items: stretch;`,
    panelInnerStretch: emo`padding: 18px; align-items: stretch;`,
    panelInnerCenter: emo`padding: 18px; align-items: center;`,
    progHeader: emo`flex-direction: row; align-items: center; justify-content: flex-start; margin-bottom: 6px;`,
    progBody: emo`align-items: stretch;`,
    btn: emo`width: 44px; height: 44px; flex-shrink: 0; margin-right: 8px;`,
    itemRow: emo`flex-direction: row; align-items: center; justify-content: flex-start; margin-top: 2px; margin-bottom: 2px;`,
    itemBox: emo`padding: 6px 12px; border-radius: 8px; align-items: center;`,
    gap: emo`height: 14px; justify-content: center; align-items: stretch;`,
    gapLine: emo`height: 3px; border-radius: 2px; margin-left: 4px; margin-right: 4px;`,
    budget: emo`color: ${COL.text}; font-size: 14px; margin-top: 10px; -unity-text-align: middle-center;`,
    legendItem: emo`margin-top: 3px; margin-bottom: 3px; align-items: center;`,
    ghost: emo`position: absolute; top: 0; left: 0; opacity: 0.9;`,
    resultText: emo`font-size: 15px; -unity-font-style: bold; margin-top: 12px; -unity-text-align: middle-center;`,
    errBox: emo`flex-direction: row; align-items: center; justify-content: center; margin-top: 12px; padding: 6px 10px; border-radius: 8px; border-width: 2px; border-color: rgb(220,90,84);`,
}

// Pixel-Panel: 9-slice-Sprite (panel_box.png, Ecken/Rivets bleiben fix, Mitte wird gestreckt)
// als Rahmen, der Inhalt (panelInner mit Padding) liegt darüber.
const PixelPanel = ({ minWidth, center, marginTop, children }: { minWidth?: number, center?: boolean, marginTop?: number, children?: any }) =>
    <div class={S2.panelOuter} style={{
        minWidth: minWidth || 0, marginTop: marginTop || 0, backgroundImage: IMG("panel_box_stone"),
        unitySliceLeft: PANEL_SLICE, unitySliceRight: PANEL_SLICE, unitySliceTop: PANEL_SLICE, unitySliceBottom: PANEL_SLICE,
        unitySliceScale: PANEL_SLICE_SCALE,
    }}>
        <div class={center ? S2.panelInnerCenter : S2.panelInnerStretch}>{children}</div>
    </div>

// Stufen für Raum 2 (steigende Schwierigkeit). Blöcke = "Variable target := Farbe to".
const room2Rounds: StateRound[] = [
    // Stufe 1 (leicht): 2 Lampen, KEINE verdeckten Blöcke. Die A-Schritte dienen als Vorlage.
    // Einzufügen: B→blau, B→grün -> [grün, grün].
    {
        colorCount: 4,
        initial: [1, 1],
        program: [
            { target: 0, to: 3, hidden: false }, // A -> blau (aus rot)
            { target: 0, to: 2, hidden: false }, // A -> grün (aus blau)
        ],
        goal: [2, 2],
        tileBudget: 2,
        hint: [
            "Drag map tiles between the program's steps to fill the gaps. The play button runs the whole program; the step arrows run it one block at a time.",
            "",
            "Watch the Variables panel while it runs — each block recolors one variable. Your goal is to reach the colors shown under Goal.",
        ].join("\n"),
    },
    // Stufe 2 (mittel): 2 Lampen, längeres Programm (4 verdeckt/3 offen), damit man wirklich
    // mitlaufen/-steppen muss. Beide Variablen laufen am Ende der vorgegebenen Blöcke NICHT
    // schon zufällig auf den Zielwert (sonst müsste man eine Variable gar nicht beeinflussen).
    // Einzufügen: A(gelb→rot), B(grün→gelb) -> [rot, gelb].
    {
        colorCount: 5,
        initial: [0, 0],
        program: [
            { target: 0, to: 1, hidden: false }, // A -> rot (aus aus)
            { target: 1, to: 1, hidden: true },  // B -> rot (verdeckt)
            { target: 0, to: 3, hidden: true },  // A -> blau (verdeckt)
            { target: 1, to: 3, hidden: false }, // B -> blau
            { target: 0, to: 2, hidden: false }, // A -> grün
            { target: 1, to: 2, hidden: true },  // B -> grün (verdeckt)
            { target: 0, to: 4, hidden: true },  // A -> gelb (verdeckt)
        ],
        goal: [1, 4],
        tileBudget: 2,
        hint: [
            "Some blocks are hidden (\"?\") — you can't read them directly.",
            "",
            "Step through the program one block at a time and watch which variable changes color at each hidden step. Combined with the Allowed transitions legend, that's usually enough to work out what a hidden block does without ever seeing it.",
        ].join("\n"),
    },
    // Stufe 3 (schwer): 3 Lampen, noch längeres Programm (5 verdeckt/4 offen). Block 7 (A -> gelb,
    // verdeckt) ist absichtlich "kaputt" ohne Eingriff: A steht davor auf blau, blau->gelb ist kein
    // erlaubter Übergang -> Abbruch, bis man vorher A -> grün einfügt. B und C erreichen ihr Ziel
    // ebenfalls nicht von allein, sondern brauchen je einen eigenen Schritt am Ende.
    // Einzufügen: A(blau→grün, vor Block 7), B(gelb→rot), C(grün→gelb).
    {
        colorCount: 5,
        initial: [0, 1, 0],
        program: [
            { target: 0, to: 1, hidden: false }, // A -> rot (aus aus)
            { target: 1, to: 3, hidden: true },  // B -> blau (verdeckt)
            { target: 2, to: 1, hidden: false }, // C -> rot (aus aus)
            { target: 0, to: 3, hidden: true },  // A -> blau (verdeckt)
            { target: 1, to: 2, hidden: false }, // B -> grün
            { target: 2, to: 3, hidden: true },  // C -> blau (verdeckt)
            { target: 0, to: 4, hidden: true },  // A -> gelb (verdeckt, bricht ohne Eingriff ab)
            { target: 1, to: 4, hidden: true },  // B -> gelb (verdeckt)
            { target: 2, to: 2, hidden: false }, // C -> grün
        ],
        goal: [4, 1, 4],
        tileBudget: 3,
        hint: [
            "Three variables and a longer program — tracking every block by eye gets hard.",
            "",
            "Step one block at a time and note only the variable that just changed; ignore the others until it's their turn. Treat each hidden block as an unknown to eliminate with the legend, not a guess.",
        ].join("\n"),
    },
]

// Variablen-Badge (Form-Sprite). Anklickbar (Builder) zum Durchrotieren; sonst statisch.
const Badge = ({ index, hidden, big, onClick }: { index: number, hidden?: boolean, big?: boolean, onClick?: () => void }) =>
    <div onClick={onClick} class={big ? S2.img48 : S2.img32}
        style={{ backgroundImage: hidden ? IMG("questionmark") : IMG(VAR_IMG[index] || VAR_IMG[0]), backgroundColor: "rgba(0,0,0,0)" }}></div>

// Ein Farb-Wert (Sprite). Anklickbar (Builder) zum Durchrotieren; sonst statisch.
const Circle = ({ color, hidden, big, onClick }: { color: number, hidden?: boolean, big?: boolean, onClick?: () => void }) => {
    const tex = hidden ? IMG("questionmark") : IMG(VAL_IMG[color] || VAL_IMG[0])
    return <div onClick={onClick} class={big ? S2.img48 : S2.img32}
        style={{ backgroundImage: tex, backgroundColor: tex ? "rgba(0,0,0,0)" : (hidden ? COL.pipeClosed : (SCOL[color] || SCOL[0])) }}></div>
}

const Arrow = ({ big }: { big?: boolean }) =>
    <div class={big ? S2.arrow48 : S2.arrow32} style={{ backgroundImage: IMG("arrow"), backgroundColor: "rgba(0,0,0,0)" }}></div>

// Eine Kachel: Form(Variable) -> Pfeil -> Farbe(Zielfarbe). on*-Handler nur im Builder.
const MapTile = ({ target, to, hidden, big, onTarget, onTo }: { target: number, to: number, hidden?: boolean, big?: boolean, onTarget?: () => void, onTo?: () => void }) =>
    <div class={S2.tileRow}>
        <Badge index={target} hidden={hidden} big={big} onClick={onTarget} />
        <Arrow big={big} />
        <Circle color={to} hidden={hidden} big={big} onClick={onTo} />
    </div>

const StateObservationPuzzle = ({ config, solved }: { config: StateRound, solved: () => void }) => {
    const cc = config.colorCount
    const vc = config.initial.length                       // Anzahl Variablen (A, B, ...)
    const [items, setItems] = useState<Item[]>(() => config.program.map(b => ({ fixed: true, block: b })))
    const [vars, setVars] = useState<number[]>(() => config.initial.slice())
    const [pc, setPc] = useState(0)                        // bereits ausgeführte Blöcke (eingerückte Zeile = pc)
    const [budget, setBudget] = useState(config.tileBudget)
    const [hoverGap, setHoverGap] = useState(-1)
    const [bTarget, setBTarget] = useState(0)              // Builder: Zielvariable
    const [bTo, setBTo] = useState(3)                      // Builder: Zielfarbe
    const [running, setRunning] = useState(false)
    const [result, setResult] = useState<null | "win" | "fail" | "illegal">(null)
    const [badTrans, setBadTrans] = useState<{ from: number, to: number } | null>(null) // unerlaubter Übergang
    const gapRefs = useRef<any[]>([])
    const dragRef = useRef<any>({ down: false, startX: 0, startY: 0, x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
    const [tip, setTip] = useState<Tip | null>(null) // aktive Hover-Erklärung (InfoIcon/InfoTip)

    const len = items.length

    function resetExec() { setVars(config.initial.slice()); setPc(0); setResult(null); setBadTrans(null) }

    function cycleTarget() { if (!running) setBTarget(t => (t + 1) % vc) }
    function cycleTo() { if (!running) setBTo(t => (t + 1) % cc) }

    function step() {
        if (running || pc >= len) return
        const b = items[pc].block
        const old = vars[b.target]
        if (!isLegal(old, b.to)) { setBadTrans({ from: old, to: b.to }); setResult("illegal"); return } // Abbruch
        const nv = vars.slice(); nv[b.target] = b.to
        setVars(nv)
        const np = pc + 1
        setPc(np)
        if (np >= len) {
            const w = arraysEqual(nv, config.goal)
            setResult(w ? "win" : "fail")
            if (w) rafDelay(800, solved) // auch ein erschrittener Sieg zählt (wie run)
        }
    }

    function stepBack() {
        if (running || pc <= 0) return
        const np = pc - 1
        let cur = config.initial.slice()
        for (let i = 0; i < np; i++) { const b = items[i].block; cur[b.target] = b.to }
        setVars(cur); setPc(np); setResult(null); setBadTrans(null)
    }

    function run() {
        if (running) return
        let cur = config.initial.slice()
        setVars(cur); setPc(0); setResult(null); setBadTrans(null); setRunning(true)
        let i = 0
        const tick = () => {
            const b = items[i].block
            const old = cur[b.target]
            if (!isLegal(old, b.to)) { // unerlaubter Übergang -> Programm bricht hier ab
                setPc(i); setRunning(false); setBadTrans({ from: old, to: b.to }); setResult("illegal")
                return
            }
            cur = cur.slice(); cur[b.target] = b.to
            setVars(cur); setPc(i + 1)
            i++
            if (i < len) rafDelay(500, tick)
            else {
                setRunning(false)
                const w = arraysEqual(cur, config.goal)
                setResult(w ? "win" : "fail")
                if (w) rafDelay(800, solved)
            }
        }
        rafDelay(500, tick)
    }

    function insertAt(gap: number) {
        if (running || budget <= 0) return
        const tile: Item = { fixed: false, block: { target: bTarget, to: bTo, hidden: false } }
        setItems(prev => { const n = prev.slice(); n.splice(gap, 0, tile); return n })
        setBudget(b => b - 1); setHoverGap(-1); resetExec()
    }

    function removeAt(i: number) {
        if (running) return
        setItems(prev => { const n = prev.slice(); n.splice(i, 1); return n })
        setBudget(b => b + 1); resetExec()
    }

    function nearestGap(y: number): number {
        let best = -1, bestD = Infinity
        for (let g = 0; g <= len; g++) {
            const el = gapRefs.current[g]
            if (!el || !el.ve) continue
            const wb = el.ve.worldBound
            const d = Math.abs(y - (wb.y + wb.height / 2))
            if (d < bestD) { bestD = d; best = g }
        }
        return best
    }

    function onBuilderDown(evt: any) {
        if (running || budget <= 0) return
        dragRef.current = { down: true, startX: evt.position.x, startY: evt.position.y, x: evt.position.x, y: evt.position.y }
    }
    function onRootMove(evt: any) {
        const d = dragRef.current
        if (!d.down) return
        d.x = evt.position.x; d.y = evt.position.y
        if (!dragging && (Math.abs(d.x - d.startX) + Math.abs(d.y - d.startY)) > 6) setDragging(true)
        setDragPos({ x: d.x, y: d.y })
        const g = nearestGap(d.y)
        let valid = -1
        if (g >= 0) { const el = gapRefs.current[g]; if (el && el.ve) { const wb = el.ve.worldBound; if (d.x >= wb.x - 30 && d.x <= wb.x + wb.width + 30) valid = g } }
        setHoverGap(valid)
    }
    function onRootUp() {
        const d = dragRef.current
        if (!d.down) return
        d.down = false
        if (dragging && hoverGap >= 0) insertAt(hoverGap)
        setDragging(false); setHoverGap(-1)
    }
    function onRootLeave() {
        if (!dragRef.current.down) return
        dragRef.current.down = false
        setDragging(false); setHoverGap(-1)
    }

    function renderGap(gap: number) {
        const show = dragging && hoverGap === gap // Linie nur, wenn hier wirklich abgelegt werden kann
        return <div key={"g" + gap} class={S2.gap}
            ref={(el: any) => { gapRefs.current[gap] = el }}>
            <div class={S2.gapLine} style={{ backgroundColor: show ? "rgb(220,190,90)" : "rgba(0,0,0,0)" }}></div>
        </div>
    }

    function renderItem(it: Item, i: number) {
        const active = i === pc && pc < len           // aktuelle Zeile -> eingerückt
        const isPlayer = !it.fixed
        const bg = isPlayer ? "rgb(40,72,56)" : "rgb(69,52,39)"
        return <div key={"i" + i} class={S2.itemRow} style={{ marginLeft: active ? 30 : 0 }}>
            <div onClick={(!running && isPlayer) ? () => removeAt(i) : undefined} class={S2.itemBox} style={{ backgroundColor: bg }}>
                <MapTile target={it.block.target} to={it.block.to} hidden={it.block.hidden} />
            </div>
        </div>
    }

    const rows: any[] = []
    for (let i = 0; i <= len; i++) {
        rows.push(renderGap(i))
        if (i < len) rows.push(renderItem(items[i], i))
    }

    // Legende der erlaubten Übergänge, gefiltert auf die Farben dieser Runde (< colorCount).
    const legend: number[][] = []
    for (const k in TRANSITIONS) {
        const from = +k
        if (from >= cc) continue
        TRANSITIONS[from].forEach(to => { if (to < cc) legend.push([from, to]) })
    }

    const resColor = result === "win" ? "rgb(90,200,120)" : result === "fail" ? "rgb(220,90,84)" : COL.text
    const resText = running ? "running..."
        : result === "win" ? "Goal state reached"
        : result === "fail" ? "Goal state not reached" : ""

    return <div class={S2.root} onPointerMove={onRootMove} onPointerUp={onRootUp} onPointerLeave={onRootLeave}>
        <div class={S2.bgTile} style={{ backgroundImage: IMG("puzzle_1_background") }}></div>
        <div class={S2.wrap}>
            {/* Lampen + Ziel + Ergebnis */}
            <div class={S2.col}>
                <PixelPanel minWidth={230} center>
                    <div class={S2.titleRow}>
                        <div class={S2.title} style={{ marginBottom: 0 }}>Variables</div>
                        <InfoIcon text={TIPS.vars} setTip={setTip} style={{ marginLeft: 6 }} />
                    </div>
                    <div class={S2.lampRow}>{vars.map((v, i) =>
                        <div class={S2.lampCell}>
                            <div class={S2.lampImg} style={{ backgroundImage: IMG(VAL_IMG[v] || VAL_IMG[0]), backgroundColor: "rgba(0,0,0,0)" }}></div>
                            <div class={S2.labelImg} style={{ backgroundImage: IMG(VAR_IMG[i] || VAR_IMG[0]), backgroundColor: "rgba(0,0,0,0)" }}></div>
                        </div>)}</div>

                    <div class={S2.titleRow} style={{ marginTop: 18 }}>
                        <div class={S2.title} style={{ marginBottom: 0 }}>Goal</div>
                        <InfoIcon text={TIPS.goal} setTip={setTip} style={{ marginLeft: 6 }} />
                    </div>
                    <div class={S2.lampRow}>{config.goal.map((v, i) =>
                        <div class={S2.lampCell}>
                            <Circle color={v} />
                            <div class={S2.labelImg} style={{ backgroundImage: IMG(VAR_IMG[i] || VAR_IMG[0]), backgroundColor: "rgba(0,0,0,0)" }}></div>
                        </div>)}</div>

                    {/* Bei einem Fehler: nur der unerlaubte Übergang (Ist-Farbe -> Zielfarbe). Sonst Ergebnis-Text. */}
                    {result === "illegal" && badTrans
                        ? <div class={S2.errBox}><Circle color={badTrans.from} /><Arrow /><Circle color={badTrans.to} /></div>
                        : <div class={S2.resultText} style={{ color: resColor }}>{resText}</div>}
                </PixelPanel>
            </div>

            {/* Programm */}
            <div class={S2.col}>
                <PixelPanel minWidth={230}>
                    <div class={S2.progHeader}>
                        <div onClick={run} class={S2.btn} style={{ backgroundImage: IMG("play"), backgroundColor: "rgba(0,0,0,0)" }}></div>
                        <div onClick={stepBack} class={S2.btn} style={{ backgroundImage: IMG("stepb"), backgroundColor: "rgba(0,0,0,0)" }}></div>
                        <div onClick={step} class={S2.btn} style={{ backgroundImage: IMG("stepf"), backgroundColor: "rgba(0,0,0,0)" }}></div>
                        <InfoIcon text={TIPS.program} setTip={setTip} style={{ marginLeft: 4 }} />
                    </div>
                    <div class={S2.progBody}>{rows}</div>
                </PixelPanel>
            </div>

            {/* Kachel-Builder rechts neben dem Programm, Legende darunter */}
            <div class={S2.col}>
                <PixelPanel minWidth={230} center>
                    <div class={S2.titleRow}>
                        <div class={S2.title} style={{ marginBottom: 0 }}>Build a tile</div>
                        <InfoIcon text={TIPS.builder} setTip={setTip} style={{ marginLeft: 6 }} />
                    </div>
                    {/* Form = Variable, Farbe = Zielfarbe; Klick rotiert. Ziehen = einfügen. */}
                    <div onPointerDown={onBuilderDown}>
                        <MapTile target={bTarget} to={bTo} big onTarget={cycleTarget} onTo={cycleTo} />
                    </div>
                    <div class={S2.budget}>Available: {budget}</div>
                </PixelPanel>

                <PixelPanel minWidth={230} center marginTop={14}>
                    <div class={S2.titleRow}>
                        <div class={S2.title} style={{ marginBottom: 0 }}>Allowed transitions</div>
                        <InfoIcon text={TIPS.legend} setTip={setTip} style={{ marginLeft: 6 }} />
                    </div>
                    <div>{legend.map(p =>
                        <div class={S2.legendItem}>
                            <div class={S2.tileRow}><Circle color={p[0]} /><Arrow /><Circle color={p[1]} /></div>
                        </div>)}</div>
                </PixelPanel>
            </div>
        </div>

        {dragging
            ? <div class={S2.ghost} style={{ translate: [dragPos.x - 40, dragPos.y - 20] }}>
                <div class={S2.itemBox} style={{ backgroundColor: "rgb(40,72,56)" }}>
                    <MapTile target={bTarget} to={bTo} />
                </div>
            </div>
            : <div></div>}

        {/* Hover-Erklärung — als letztes Kind, damit sie über allen Panels liegt (wie der Ghost) */}
        <InfoTip tip={tip} />

        {/* Vorgehens-Popup beim Betreten der Stufe — ganz zuletzt, liegt über allem (auch der InfoTip). */}
        <HintPopup text={config.hint} />
    </div>
}

// Default-Export: spielt alle Stufen des Zustandsbeobachtungs-Bereichs hintereinander in einer Sitzung ab
// (subLevel = Startstufe, 1-basiert; im normalen Spiel immer 1). Erst nach der letzten Stufe ruft sie die
// übergebene solved() auf — frühere Stufen schalten intern zur nächsten weiter.
const Puzzle2 = ({ subLevel, solved }: { subLevel: number, solved: () => void }) => {
    const start = Math.max(0, Math.min(room2Rounds.length - 1, (subLevel || 1) - 1))
    const [idx, setIdx] = useState(start)
    function roundSolved() {
        if (idx < room2Rounds.length - 1) setIdx(idx + 1)
        else solved()
    }
    return <StateObservationPuzzle key={idx} config={room2Rounds[idx]} solved={roundSolved} />
}
export default Puzzle2
