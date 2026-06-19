import { emo } from "onejs/styled"
import { h } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"
const debugPuzzleManager = require("debugPuzzleManager")
// OneJS-Global (per ScriptEngine.SetValue("resource", ...)); loadImage(path) -> Texture2D
declare const resource: { loadImage(path: string): any }

// Zeichenlegende fürs Gitter:
//   '.' leer   'S' Quelle   'C' Endkappe   'o' Verbindung (nur Optik, kein Ventil/Leck)
//   '#' Prüf-Segment ohne Ventil   'V' Prüf-Segment mit Ventil
// Benachbarte (orthogonale) belegte Zellen sind automatisch verbunden.
type RoundConfig = { grid: string[], leakCount: number }

const room1Rounds: RoundConfig[] = [
    // R1: dieselbe Kette (Quelle, 6 Ventile, Endkappe) als Schlange gefaltet — schmaler, dafür in die Höhe
    // mit zwei Knicks. Leere Spalten (1 und 3) trennen die vertikalen Stränge, damit sie sich nicht
    // versehentlich orthogonal verbinden; die Verbindungsstücke laufen nur über die Knick-Zeilen. 1 Leck.
    { grid: [
        "S.VoV",
        "o.o.o",
        "V.V.C",
        "o.o..",
        "VoV..",
    ], leakCount: 1 },
    // R2: relativ gerade — die Quelle (Spalten-Mitte) speist über einen senkrechten Strang zwei waagrechte Arme
    // (oben/unten). WICHTIG: jeder Knick sitzt auf einem VENTIL (die Ecken (0,0)/(4,0) sind Ventile), nie auf einem
    // verbindenden 'o' — so ist jedes stromaufwärtige (abdichtbare) Rohrstück immer eine Gerade. 2 Lecks.
    { grid: [
        "VoVoVC",
        "o.....",
        "S.....",
        "o.....",
        "VoVoVC",
    ], leakCount: 2 },
    // R3: verwinkelt MIT Abzweigungen — waagrechter Hauptstrang plus ein nach unten abknickender Nebenstrang.
    // Die zwei Verzweigungen sitzen auf T-VENTILEN ((0,2) und (0,4) speisen je einen senkrechten Ast), damit kein
    // verbindendes 'o' drei Anschlüsse bekommt: so bleibt jedes abdichtbare 'o' eine reine Gerade. Knicke ebenfalls
    // nur auf Ventilen/Kappe. 3 Lecks.
    { grid: [
        "SoVoVoV",
        "..o.o.o",
        "..C.C.V",
        "......o",
        "......C",
    ], leakCount: 3 },
]

const COL = {
    panel: "rgb(28, 32, 40)",
    pipeClosed: "rgb(70, 76, 86)",
    leak: "rgb(176, 64, 60)",
    hold: "rgb(60, 150, 90)",
    valveClosed: "rgb(150, 70, 66)",
    accent: "rgb(60, 90, 160)",
    text: "rgb(235, 238, 242)",
    backdrop: "rgb(10, 12, 16)", // deckender Vollbild-Hintergrund
    pipeRest: "rgb(84, 45, 17)", // ~#542d11 — brauner Rohr-Innenraum, immer sichtbar (etwas dunkler als #723d17); der Fluss liegt darüber
    pipeRestShut: "rgb(40, 22, 8)", // ~#281608 — dunklerer Innenraum für drucklose (abgesperrte) Rohre statt grauem Overlay
}

// Animierte Farben als RGB-Arrays (nicht in COL): das Gas blendet bei einem Leck nach dunkel über; dafür müssen
// die Kanäle einzeln interpoliert werden (lerpArr) — ein fertiger "rgb(...)"-String ließe sich nicht so verrechnen.
const FLOW_RGB = [196, 208, 220]  // Gasfarbe im Drucktest — HIER ändern (sehr helles, fast graues Blau)
const CLOSED_RGB = [70, 76, 86]  // Ziel-Dunkel, zu dem das Gas bei einem Leck ausfadet

// Reine Geraden haben ein eigenes Vollkachel-Sprite; alles andere (Ecke/Abzweig/Ventil/Quelle/Endkappe)
// wird aus einer Basis ("Mittelteil") + Anschluss-Stummeln je Richtung zusammengesetzt — wie zuvor das Ventil.
// Gibt den Geraden-Sprite zurück, oder null, wenn die Zelle über Basis+Stummel gebaut werden muss.
function straightSprite(dirs: string[]): string | null {
    if (dirs.length !== 2) return null // 1 Anschluss (Quelle/Kappe) oder Ecke/Abzweig -> Basis+Stummel
    const has = (d: string) => dirs.indexOf(d) >= 0
    if (has("N") && has("S")) return "puzzle_1_vertical"
    if (has("W") && has("E")) return "puzzle_1_horizontal"
    return null // Ecke (zwei nicht-gegenüberliegende Anschlüsse) -> Basis+Stummel
}

// Basis-"Mittelteil" je Zelltyp; die Anschluss-Stummel (STUB) werden je anliegender Richtung darüber gelegt.
function baseSprite(cell: Cell): string {
    if (cell.hasValve) return "puzzle_1_valvebase"
    if (cell.kind === "source") return "puzzle_1_s"
    if (cell.kind === "cap") return "puzzle_1_end"
    return "puzzle_1_splitbase" // Ecken/Abzweige (T/Kreuz) und Rohr-Sackgassen
}

// Anschluss-Stummel je Richtung — volle 32×32-Tiles, deckungsgleich über die jeweilige Basis gelegt (N/S/W/E -> u/d/l/r).
const STUB: { [d: string]: string } = { N: "puzzle_1_u", S: "puzzle_1_d", W: "puzzle_1_l", E: "puzzle_1_r" }
// Texturen selbst laden und auf FilterMode.Point stellen, dann cachen. Würde man (wie sonst in OneJS) nur den
// Pfad-String an backgroundImage geben, lädt der Style-Prozessor die Textur intern mit FilterMode.Bilinear — der
// Filter mischt an der Kachelkante den opaken Randpixel mit dem transparenten Nachbarn -> dünner dunkler Saum.
// Eine direkt übergebene Texture2D behält ihren filterMode; Point + ganzzahlige Skalierung -> pixelgenaue Kanten.
const _texCache: { [name: string]: any } = {}
const IMG = (name: string) => {
    let t = _texCache[name]
    if (t === undefined) { // undefined = noch nicht versucht; null = fehlt (nicht erneut laden)
        try {
            t = resource.loadImage(__dirname + "/img/puzzle_1/" + name + ".png")
            if (t) t.filterMode = 0 // FilterMode.Point — keine bilineare Kanten-Mischung; numerisch statt Enum-Member (robuster über die Interop)
        } catch (e) { t = null }
        _texCache[name] = t || null // fehlende Textur (z.B. optionales Panel-Sprite) cachen -> Aufrufer fällt auf eine Farbe zurück
    }
    return t
}

const BG_ASPECT = 2      // Quelltextur ist 64×32 (2:1); Kachelbreite = BG_TILE × BG_ASPECT, damit sie nicht gestaucht wird
const ICON = 128         // 32×32-Knopf-/Status-Sprites im selben S=4-Maßstab (32 × 4)

// Globaler Pixel-Maßstab S=4: jedes Quell-Pixel der 32×32-Sprites wird ×4 gerendert. So haben Rohre, Hintergrund, Panel
// und (künftige) Knopf-Icons ALLE dieselbe Pixelgröße — Voraussetzung: jedes Sprite in 1/4 seiner Bildschirmgröße authoren
// und mit FilterMode.Point (s. IMG) skalieren. Folge: Boards dürfen max. 7 Spalten breit sein (7×128=896 ≤ 16:9-Fläche).
const TILE = 128 // 32 × S(=4)
const ARM_LEN = Math.round(TILE * 0.5)          // halbe Kachel = ein Rohr-Arm
const ARM_TH = Math.round(TILE * 6 / 32)        // Rohr-Dicke = Sprite-Kanalbreite (6 von 32px), damit das Gas nicht über die Wände quillt
const ARM_OFF = Math.round((TILE - ARM_TH) / 2) // Versatz quer zum Rohr (zentriert)
const NODE_EDGE_FRAC = (TILE * 0.33) / ARM_LEN  // ab welchem Arm-Füllgrad (inProg) der Arm die Knotenkante erreicht
const BG_PIXEL_SCALE = 3                         // wie viel gröber der Hintergrund als die Rohre ist (1 = gleich; höher = größere BG-Pixel)
const BG_TILE = TILE * BG_PIXEL_SCALE            // Hintergrund-Maßstab = S(4) × BG_PIXEL_SCALE: 64×32-Quelle -> 768×384 (×12), bewusst gröber als die Rohre
const METRICS = { TILE, ARM_LEN, ARM_TH, ARM_OFF, NODE_EDGE_FRAC, BG_TILE }
type Metrics = typeof METRICS

// Geometrie eines wachsenden Fluss-Overlays innerhalb einer Kachel.
// role "up": Arm zur Quelle hin -> Flüssigkeit kommt von der Außenkante herein.
// role "down": Arm von der Quelle weg -> Flüssigkeit verlässt die Mitte nach außen.
// frac (0..1) ist die Füllung des Arms; len wächst kontinuierlich -> nahtloser Übergang über die Kachelgrenze.
// Nur dynamische Längen + Farbe inline; position/border-radius kommen über eine emo-Klasse (cls.flowArm),
// weil der Inline-Style-Prozessor das Position-Enum nur per PascalCase-Name auflöst ("absolute" -> undefined -> Fehler).
function flowArmStyle(m: Metrics, dir: string, role: "up" | "down", frac: number, color: string): any {
    const len = Math.round(frac * m.ARM_LEN)
    const s: any = { backgroundColor: color }
    if (dir === "N") { s.left = m.ARM_OFF; s.width = m.ARM_TH; s.height = len; s.top = role === "up" ? 0 : m.ARM_LEN - len }
    else if (dir === "S") { s.left = m.ARM_OFF; s.width = m.ARM_TH; s.height = len; s.top = role === "up" ? m.TILE - len : m.ARM_LEN }
    else if (dir === "W") { s.top = m.ARM_OFF; s.height = m.ARM_TH; s.width = len; s.left = role === "up" ? 0 : m.ARM_LEN - len }
    else { s.top = m.ARM_OFF; s.height = m.ARM_TH; s.width = len; s.left = role === "up" ? m.TILE - len : m.ARM_LEN } // E
    return s
}

type Cell = { r: number, c: number, kind: "source" | "cap" | "pipe" | "seg", hasValve: boolean }
type Grid = { rows: number, cols: number, cells: (Cell | null)[][], source: Cell | null, valveIds: number[] }

function parseGrid(rowsStr: string[]): Grid {
    const rows = rowsStr.length
    const cols = Math.max.apply(null, rowsStr.map(r => r.length))
    const cells: (Cell | null)[][] = []
    const valveIds: number[] = []
    let source: Cell | null = null
    for (let r = 0; r < rows; r++) {
        cells[r] = []
        for (let c = 0; c < cols; c++) {
            const ch = rowsStr[r][c] || "."
            let cell: Cell | null = null
            if (ch === "S") cell = { r, c, kind: "source", hasValve: false }
            else if (ch === "C") cell = { r, c, kind: "cap", hasValve: false }
            else if (ch === "o") cell = { r, c, kind: "pipe", hasValve: false }
            else if (ch === "#") cell = { r, c, kind: "seg", hasValve: false }
            else if (ch === "V") cell = { r, c, kind: "seg", hasValve: true }
            cells[r][c] = cell
            if (cell) {
                if (cell.kind === "source") source = cell
                if (cell.hasValve) valveIds.push(r * cols + c)
            }
        }
    }
    return { rows, cols, cells, source, valveIds }
}

function neighbors(grid: Grid, cell: Cell): Cell[] {
    const { cells, rows, cols } = grid
    const out: Cell[] = []
    const cand = [[cell.r - 1, cell.c], [cell.r + 1, cell.c], [cell.r, cell.c - 1], [cell.r, cell.c + 1]]
    for (let i = 0; i < cand.length; i++) {
        const nr = cand[i][0], nc = cand[i][1]
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue
        const n = cells[nr][nc]
        if (n) out.push(n)
    }
    return out
}

function dirsOf(grid: Grid, cell: Cell): string[] {
    const { cells, rows, cols } = grid
    const d: string[] = []
    if (cell.r > 0 && cells[cell.r - 1][cell.c]) d.push("N")
    if (cell.r < rows - 1 && cells[cell.r + 1][cell.c]) d.push("S")
    if (cell.c > 0 && cells[cell.r][cell.c - 1]) d.push("W")
    if (cell.c < cols - 1 && cells[cell.r][cell.c + 1]) d.push("E")
    return d
}

// Druck flutet von der Quelle durch verbundene Zellen. Ein geschlossenes Ventil ist die Grenze: seine Zelle steht
// noch unter Druck (Leitung bis zum Knoten "offen"), aber alles dahinter bleibt drucklos.
function computePressurized(grid: Grid, valves: { [id: number]: boolean }): { [id: number]: boolean } {
    const { cols, source } = grid
    const set: { [id: number]: boolean } = {}
    if (!source) return set
    const queue: Cell[] = [source]
    set[source.r * cols + source.c] = true
    while (queue.length) {
        const cur = queue.shift() as Cell
        const ns = neighbors(grid, cur)
        for (let i = 0; i < ns.length; i++) {
            const n = ns[i]
            const nid = n.r * cols + n.c
            if (set[nid]) continue
            const closed = n.kind === "seg" && n.hasValve && valves[nid] === false
            set[nid] = true // Druck reicht bis zum (auch geschlossenen) Knoten ...
            if (closed) continue // ... aber hinter einem zu Ventil ist nichts mehr unter Druck
            queue.push(n)
        }
    }
    return set
}

function pickLeaks(grid: Grid, candidates: number[], count: number): number[] {
    const { cols, source } = grid
    let cand = candidates
    if (source) {
        cand = candidates.filter(id => {
            const r = Math.floor(id / cols), c = id % cols
            return Math.abs(r - source.r) + Math.abs(c - source.c) !== 1 // nicht direkt an der Quelle
        })
    }
    if (cand.length < count) cand = candidates
    const pool = cand.slice()
    const res: number[] = []
    for (let i = 0; i < count && pool.length; i++) {
        res.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    return res
}

// BFS-Distanz jeder druckbeaufschlagten Zelle von der Quelle (geschlossene Ventile stoppen den Fluss).
// Die Fließ-Animation läuft nur so weit, wie die Rohre offen sind.
function pressurizedDistances(grid: Grid, valves: { [id: number]: boolean }): { dist: { [id: number]: number }, maxDist: number } {
    const { cols, source } = grid
    const dist: { [id: number]: number } = {}
    let maxDist = 0
    if (!source) return { dist, maxDist }
    dist[source.r * cols + source.c] = 0
    const queue: Cell[] = [source]
    while (queue.length) {
        const cur = queue.shift() as Cell
        const cd = dist[cur.r * cols + cur.c]
        const ns = neighbors(grid, cur)
        for (let i = 0; i < ns.length; i++) {
            const n = ns[i]
            const nid = n.r * cols + n.c
            if (dist[nid] !== undefined) continue
            const closed = n.kind === "seg" && n.hasValve && valves[nid] === false
            dist[nid] = cd + 1 // Fluss füllt bis zum (auch geschlossenen) Knoten ...
            if (cd + 1 > maxDist) maxDist = cd + 1
            if (closed) continue // ... aber ein geschlossenes Ventil stoppt die Ausbreitung dahinter
            queue.push(n)
        }
    }
    return { dist, maxDist }
}

// Lineare Interpolation zweier RGB-Arrays (fürs Ausfaden der Gasfarbe, s. FLOW_RGB/CLOSED_RGB oben).
function lerpArr(a: number[], b: number[], t: number): number[] {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ]
}

// ES3-sicherer flacher Clone (kein Object.assign/Spread in der OneJS-Engine voraussetzen)
function clone(o: { [id: number]: boolean }): { [id: number]: boolean } {
    const n: { [id: number]: boolean } = {}
    for (const k in o) n[k as any] = o[k as any]
    return n
}

// Drehwinkel des Ventilrads: offen = 0°, zu = Vierteldrehung im Uhrzeigersinn (positiv = rechts/clockwise).
// Über die exponentielle Annäherung an den Zielwinkel ergibt sich die Richtung von selbst: Schließen erhöht
// den Winkel -> dreht nach rechts; Öffnen verringert ihn -> dreht nach links.
const VALVE_OPEN_DEG = 0
const VALVE_CLOSED_DEG = 90
const VALVE_WOBBLE_DEG = 2.5      // ganz leichtes Wackeln im offenen (entsperrten) Zustand
const VALVE_WOBBLE_SPEED = 0.005  // rad pro ms

// Ventilrad-Sprite über dem valvebase. Eigene rAF-Schleife (nicht der Grid-Render): dreht beim Statuswechsel
// sanft in die Zielstellung und wackelt im offenen Zustand leicht.
// WICHTIG: Rotation als INLINE-Zahl (StyleRotate in Grad), NICHT per emo. emo ruft bei jedem Aufruf
// document.addRuntimeUSS auf (kein Dedupe) und würde den Panel-Stylesheet pro Frame aufblähen -> massiver Lag.
const ValveWheel = ({ open, cls }: { open: boolean, cls: string }) => {
    const angleRef = useRef(open ? VALVE_OPEN_DEG : VALVE_CLOSED_DEG)
    const lastRef = useRef(Math.round(angleRef.current)) // zuletzt gesetzter (ganzzahliger) Winkel
    const [deg, setDeg] = useState(lastRef.current)
    useEffect(() => {
        let raf = 0
        const step = () => {
            const target = open ? VALVE_OPEN_DEG : VALVE_CLOSED_DEG
            angleRef.current += (target - angleRef.current) * 0.18 // sanfte Annäherung -> Drehrichtung folgt aus dem Vorzeichen
            const settled = Math.abs(target - angleRef.current) < 0.5
            let shown = angleRef.current
            if (open && settled) // erst wackeln, wenn ganz offen
                shown = target + Math.sin(Date.now() * VALVE_WOBBLE_SPEED) * VALVE_WOBBLE_DEG
            const r = Math.round(shown)
            if (r !== lastRef.current) { lastRef.current = r; setDeg(r) } // nur bei Änderung re-rendern
            // weiterlaufen, solange noch nicht eingerastet ODER offen (offen wackelt dauerhaft); zu+eingerastet -> rAF stoppt
            if (open || !settled) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
        return () => cancelAnimationFrame(raf)
    }, [open]) // angleRef bleibt über Statuswechsel erhalten -> Drehung startet am aktuellen Winkel
    return <div class={cls} style={{ backgroundImage: IMG("puzzle_1_valve"), rotate: deg }}></div>
}

const PipeLeakPuzzle = ({ config, level, solved }: { config: RoundConfig, level: number, solved: () => void }) => {
    const [grid] = useState(() => parseGrid(config.grid))
    const metrics = METRICS // globaler, fester Pixel-Maßstab (S=4) — für alle Sprites gleich
    // Abdicht-/Leck-Stellen: das Rohrstück direkt vor (stromaufwärts) jedem Ventil. Ventile selbst dienen nur zum Absperren.
    const [seal] = useState(() => {
        const base = pressurizedDistances(grid, {}).dist // Distanzen bei voll offenem Netz -> "davor" = kleinere Distanz
        const set: { [id: number]: boolean } = {}
        // Rohr stromaufwärts ("davor") eines Auslasses (Ventil ODER Endkappe) als Abdicht-/Leck-Stelle.
        // Die Endkappe zählt mit, sonst wäre die letzte Sektion (Rohr vor der Kappe) nicht abdichtbar.
        const addUpstreamPipe = (cell: Cell) => {
            let bestId = -1, bestDist = Infinity
            neighbors(grid, cell).forEach(n => {
                if (n.kind !== "pipe") return
                const nid = n.r * grid.cols + n.c
                if (base[nid] !== undefined && base[nid] < bestDist) { bestDist = base[nid]; bestId = nid }
            })
            if (bestId >= 0) set[bestId] = true
        }
        for (let r = 0; r < grid.rows; r++)
            for (let c = 0; c < grid.cols; c++) {
                const cell = grid.cells[r][c]
                if (cell && (cell.hasValve || cell.kind === "cap")) addUpstreamPipe(cell)
            }
        return { set, list: Object.keys(set).map(k => +k) }
    })
    const [leaks] = useState<number[]>(() => pickLeaks(grid, seal.list, config.leakCount))
    const [valves, setValves] = useState<{ [id: number]: boolean }>(() => {
        const v: { [id: number]: boolean } = {}
        grid.valveIds.forEach(id => v[id] = true)
        return v
    })
    const [marked, setMarked] = useState<{ [id: number]: boolean }>({})
    const [result, setResult] = useState<null | "hold" | "leak">(null)
    const [flowing, setFlowing] = useState(false) // Drucktest-Animation läuft
    const [flowProgress, setFlowProgress] = useState(0)
    const [flowField, setFlowField] = useState<{ dist: { [id: number]: number }, maxDist: number }>({ dist: {}, maxDist: 0 })
    const [flowRgb, setFlowRgb] = useState<number[]>(FLOW_RGB) // fadet bei Druckverlust nach dunkel
    const [shake, setShake] = useState<{ x: number, y: number }>({ x: 0, y: 0 })

    // Statische emo-Klassen einmal pro Mount berechnen (nicht pro Zelle/Frame) — spart viel Render-Overhead.
    const [cls] = useState(() => {
        const { TILE, ARM_OFF, ARM_TH, BG_TILE } = metrics
        return ({
            tile: emo`width: ${TILE}px; height: ${TILE}px; flex-shrink: 0;`,
            row: emo`flex-direction: row; flex-shrink: 0;`,
            abs: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0;`,
            // Vollflächiger Kachel-Hintergrund: 64×32-Textur (2:1) wiederholt, auf BG_TILE×BG_ASPECT skaliert (größer = pixeliger).
            bgTile: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-repeat: repeat; background-size: ${BG_TILE * BG_ASPECT}px ${BG_TILE}px;`,
            center: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; align-items: center; justify-content: center;`,
            node: emo`position: absolute; left: ${ARM_OFF}px; top: ${ARM_OFF}px; width: ${ARM_TH}px; height: ${ARM_TH}px; border-radius: 4px;`,
            flowArm: emo`position: absolute; border-radius: 3px;`,
            // Wackel-Container des Netzes: statische Klasse; der Versatz kommt inline (translate), nicht per emo pro Frame.
            shakeBox: emo`align-items: center; justify-content: center;`,
            // Vollflächiger Wurzel-Container — statisch, damit emo nicht bei jedem Render (Drucktest = pro Frame) feuert.
            root: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${COL.backdrop};`,
            // Steuerung schwebt links mittig über dem Hintergrund (kein Panel mehr): vertikaler Stapel, vertikal zentriert.
            controls: emo`position: absolute; left: 28px; top: 0; bottom: 0; align-items: center; justify-content: center;`,
            // 128×128-Sprite (32×32-Quelle ×4, gestreckt wie die Rohr-Sprites; FilterMode.Point hält es scharf).
            iconImg: emo`width: ${ICON}px; height: ${ICON}px; flex-shrink: 0;`,
            // Zentriert ein Icon (Drucktest-Knopf / Status) im Stapel.
            ctrlRow: emo`align-items: center; margin-bottom: 14px;`,
            // Leck-Lämpchen: eine Reihe runder Lampen, eine je Leck.
            lampRow: emo`flex-direction: row; align-items: center; justify-content: center;`,
            lamp: emo`width: 22px; height: 22px; border-radius: 11px; margin-left: 5px; margin-right: 5px;`,
        })
    })

    // Anschluss-Richtungen je Zelle hängen nur am (konstanten) Grid — einmal vorberechnen statt pro Zelle/Frame.
    const [dirsById] = useState(() => {
        const m: { [id: number]: string[] } = {}
        for (let r = 0; r < grid.rows; r++)
            for (let c = 0; c < grid.cols; c++) {
                const cell = grid.cells[r][c]
                if (cell) m[r * grid.cols + c] = dirsOf(grid, cell)
            }
        return m
    })

    const leakCount = config.leakCount
    // Druckverteilung nur neu bestimmen, wenn sich Ventile ändern — nicht in jedem Animations-Frame.
    const pressurized = useMemo(() => computePressurized(grid, valves), [valves])
    const markedCount = seal.list.filter(id => marked[id]).length

    function toggleValve(id: number) {
        if (flowing) return
        setValves(prev => { const next = clone(prev); next[id] = !next[id]; return next })
        setResult(null)
    }

    function toggleMark(id: number) {
        if (flowing) return
        if (!marked[id] && markedCount >= leakCount) return // mehr als leakCount geht nicht
        setMarked(prev => { const next = clone(prev); next[id] = !next[id]; return next })
        setResult(null)
    }

    function runTest() {
        if (flowing) return
        const allOpen = grid.valveIds.every(id => valves[id] !== false)
        const field = pressurizedDistances(grid, valves) // nur soweit die Rohre offen sind
        const leaking = leaks.some(id => field.dist[id] !== undefined && !marked[id]) // erreichtes, nicht abgedichtetes Leck (Rohr hat kein eigenes Ventil)
        // Gewinn = alle Lecks lokalisiert und abgedichtet: bei voll offenem Netz hält der Druck. Ventile schließen
        // grenzt zwar das Leck ein (Delta-Debugging), zählt aber erst als gelöst, wenn am Ende alles offen dicht ist.
        const win = !leaking && allOpen
        setResult(leaking ? "leak" : "hold")
        startFlow(field, win, leaking)
    }

    // Druck fließt bei jedem Test von der Quelle durch die offenen Rohre. Bei Druckverlust folgt
    // ein Screenshake + Ausfaden der Farbe; bei einem Gewinn-Test ist die Runde nach der Animation gelöst.
    function startFlow(field: { dist: { [id: number]: number }, maxDist: number }, win: boolean, leaking: boolean) {
        setFlowField(field)
        setFlowProgress(0)
        setFlowRgb(FLOW_RGB)
        setShake({ x: 0, y: 0 })
        setFlowing(true)
        // ~konstantes Tempo pro Ring; der lösende (letzte) Durchlauf läuft bewusst langsamer, die übrigen etwas schneller
        const perRing = win ? 400 : 40
        const fillTime = Math.max(win ? 700 : 120, field.maxDist * perRing)
        const tailTime = 320 // Leck: Ausfaden der Farbe; sonst kurze Halte-Phase
        const shakeTime = 250
        const total = fillTime + tailTime
        let start = -1
        let tailFull = false // Füllung einmal auf 100% gesetzt
        const step = (t: number) => {
            const now = (t !== undefined && t !== null && !isNaN(t)) ? t : Date.now()
            if (start < 0) start = now
            const elapsed = now - start
            if (elapsed <= fillTime) {
                // Front wandert kontinuierlich; die Zellen interpolieren ihre Füllung selbst -> gleichmäßiges Ausbreiten
                setFlowProgress(fillTime > 0 ? Math.min(1, elapsed / fillTime) : 1)
            } else {
                if (!tailFull) { tailFull = true; setFlowProgress(1) }
                if (leaking) { // Leck: Farbe ausfaden (langsam) + kurzer, kräftiger Shake
                    const lp = Math.min(1, (elapsed - fillTime) / tailTime)
                    setFlowRgb(lerpArr(FLOW_RGB, CLOSED_RGB, lp))
                    const sp = Math.min(1, (elapsed - fillTime) / shakeTime)
                    const amp = 40 * (1 - sp) // stärkerer Ausschlag, klingt über das kurze shakeTime-Fenster ab
                    setShake({ x: Math.sin(elapsed * 0.09) * amp, y: Math.cos(elapsed * 0.13) * amp * 0.6 })
                }
            }
            if (elapsed < total) requestAnimationFrame(step)
            else {
                setFlowing(false)
                setShake({ x: 0, y: 0 })
                setFlowRgb(FLOW_RGB)
                if (win) solved()
            }
        }
        requestAnimationFrame(step)
    }

    function renderCell(cell: Cell) {
        const id = cell.r * grid.cols + cell.c
        const live = !!pressurized[id]
        const isMarked = !!marked[id]
        const dist = flowField.dist[id]
        const reached = flowing && dist !== undefined
        const D = reached ? (dist as number) : 0
        const front = flowProgress * flowField.maxDist
        // Jeder Arm überspannt nur eine halbe Ring-Distanz (Kante D±0.5 <-> Mitte D), daher läuft die Füllung
        // doppelt so schnell über ihr halbes Fenster: inProg füllt den Arm zur Quelle (front: D-0.5 -> D),
        // outProg die Arme von der Quelle weg (front: D -> D+0.5). So ist der downstream-Arm dieser Zelle genau
        // dann voll, wenn der upstream-Arm der Nachbarzelle beginnt -> durchgehende Front ohne Lücke/Doppelung.
        const inProg = reached ? Math.max(0, Math.min(1, 2 * (front - D) + 1)) : 0
        const outProg = reached ? Math.max(0, Math.min(1, 2 * (front - D))) : 0
        // Knoten erst füllen, wenn der upstream-Arm seine Kante wirklich erreicht (inProg >= NODE_EDGE_FRAC),
        // voll bei inProg = 1 (Arm in der Mitte) — sonst leuchtet der Knoten vor der ankommenden Front auf.
        const nodeFill = reached ? Math.max(0, Math.min(1, (inProg - metrics.NODE_EDGE_FRAC) / (1 - metrics.NODE_EDGE_FRAC))) : 0
        const flowStr = `rgb(${flowRgb[0]}, ${flowRgb[1]}, ${flowRgb[2]})`
        const dirs = dirsById[id]
        // Ventil-Korpus ist deckend -> hinter dem Ventil wird kein Gas gerendert (plan: "Ventil-Kacheln zeigen kein Gas").
        const showGas = !cell.hasValve
        // Nur reine Rohre ('pipe') können als Vollkachel-Gerade gezeichnet werden; Ventil/Quelle/Kappe gehen IMMER
        // über Basis+Stummel — sonst würde z.B. eine durchgehende Quelle (2 gegenüberliegende Anschlüsse) fälschlich
        // als senkrechte Gerade statt als Quell-Sprite gerendert.
        const straight = cell.kind === "pipe" ? straightSprite(dirs) : null
        // Abgesperrt = drucklos (Druck der Quelle erreicht dieses Rohr nicht, z.B. hinter einem zu Ventil).
        // Markiert durch einen dunkleren Rohr-Innenraum (kein grauer Overlay).
        const shutOff = showGas && !live
        const restColor = shutOff ? COL.pipeRestShut : COL.pipeRest
        // Berechneter brauner Ruhe-Innenraum: bei Geraden liefert das Hintergrund-Sprite bereits das Braun, daher
        // dort nur noch im abgesperrten Zustand (zum Abdunkeln darüber) zeichnen. Nicht-Geraden haben kein BG-Sprite.
        const showRest = showGas && (!straight || shutOff)

        return <div class={cls.tile}>
            {/* Rohr-Optik + Markier-/Klickfläche (nur abdichtbare Rohrstücke vor einem Ventil) */}
            <div onClick={seal.set[id] ? () => toggleMark(id) : undefined} class={cls.abs}>
                {/* HINTERGRUND-EBENE — nur Geraden sind in Hinter-/Vordergrund zerlegt: die braune Rohr-Rückwand
                    liegt HINTER dem Gas (s.u. Vordergrund-Wände). Basis+Stummel-Teile haben kein eigenes BG-Sprite. */}
                {straight ? <div class={cls.abs} style={{ backgroundImage: IMG(straight + "background") }}></div> : <div></div>}

                {/* GAS-EBENE — liegt HINTER den Rohr-Sprites und scheint durch deren transparente Fenster.
                    Brauner Innenraum (immer voll sichtbar) als Basis; im Drucktest fließt der cyan-Fluss darüber. */}
                {showGas
                    ? <div class={cls.abs}>
                        {/* Basis: brauner Rohr-Innenraum (volle Arme + Knoten); abgesperrt -> dunkler. Bei Geraden nur im
                            abgesperrten Zustand (sonst zeigt das Hintergrund-Sprite das Braun). map in eigenem Container (h erlaubt Array nur als einziges Kind) */}
                        {showRest
                            ? <div class={cls.abs}>
                                <div class={cls.abs}>{dirs.map(d => <div class={cls.flowArm} style={flowArmStyle(metrics, d, "up", 1, restColor)}></div>)}</div>
                                <div class={cls.node} style={{ backgroundColor: restColor }}></div>
                            </div>
                            : <div></div>}
                        {/* Fluss-Front im Test, wächst über den braunen Innenraum */}
                        {reached
                            ? <div class={cls.abs}>{dirs.map(d => {
                                const nr = cell.r + (d === "N" ? -1 : d === "S" ? 1 : 0)
                                const nc = cell.c + (d === "W" ? -1 : d === "E" ? 1 : 0)
                                const nid = nr * grid.cols + nc
                                const nDist = flowField.dist[nid]
                                if (nDist === undefined) return <div></div> // Arm zu gesperrtem Nachbarn bleibt braun (kein Fluss)
                                const role: "up" | "down" = nDist < D ? "up" : "down"
                                const frac = role === "up" ? inProg : outProg
                                return frac > 0 ? <div class={cls.flowArm} style={flowArmStyle(metrics, d, role, frac, flowStr)}></div> : <div></div>
                            })}</div>
                            : <div></div>}
                        {/* Knoten-Füllung des Flusses — nur bei nodeFill > 0 rendern: OneJS' setStyleFloat behandelt opacity:0 als falsy -> Initial (= 1). */}
                        {reached && nodeFill > 0 ? <div class={cls.node} style={{ backgroundColor: flowStr, opacity: nodeFill }}></div> : <div></div>}
                    </div>
                    : <div></div>}

                {/* ROHR-SPRITE(S) — über dem Gas. Reine Geraden: das Vordergrund-Vollkachel-Sprite (Rohrwände mit
                    transparentem Kanal; die braune Rückwand kam schon als HINTERGRUND-EBENE hinter dem Gas).
                    Alles andere (Ventil, Abzweig/Ecke, Quelle, Endkappe): Basis-"Mittelteil" + Anschluss-Stummel
                    je anliegender Richtung darübergelegt — das Ventil ist deckend (kein Gas), die übrigen Basen
                    haben ein transparentes Fenster, durch das das Gas scheint. */}
                {straight
                    ? <div class={cls.abs} style={{ backgroundImage: IMG(straight) }}></div>
                    : <div class={cls.abs}>
                        <div class={cls.abs} style={{ backgroundImage: IMG(baseSprite(cell)) }}></div>
                        <div class={cls.abs}>{dirs.map(d => <div class={cls.abs} style={{ backgroundImage: IMG(STUB[d]) }}></div>)}</div>
                    </div>}

                {/* Abdicht-Schelle ÜBER dem Rohr, sobald abgedichtet markiert — Sprite je Orientierung
                    (horizontalproof/verticalproof). Liegt im klickbaren Container -> Klick toggelt weiter. */}
                {isMarked && straight ? <div class={cls.abs} style={{ backgroundImage: IMG(straight + "proof") }}></div> : <div></div>}
            </div>

            {/* Ventilrad (eigener Klick, über dem valvebase): dreht beim Sperren nach rechts / beim Entsperren nach
                links und wackelt im offenen Zustand leicht — Logik in ValveWheel. */}
            {cell.hasValve
                ? <div onClick={() => toggleValve(id)} class={cls.abs}>
                    <ValveWheel open={valves[id] !== false} cls={cls.abs} />
                </div>
                : <div></div>}
        </div>
    }

    // Ergebnis-Sprite: Strich (dash) solange Test läuft / kein Test, sonst Haken (Druck hält) / Kreuz (Leck offen).
    const statusIcon = (flowing || !result) ? "puzzle_1_dash" : result === "hold" ? "puzzle_1_check" : "puzzle_1_cross"
    const resultTip = flowing ? "Drucktest läuft …" : result === "hold" ? "Druck hält" : result === "leak" ? "Druck weg – Leck noch offen" : "Noch kein Drucktest"
    // Leck-Lämpchen: eines je Leck — grün sobald abgedichtet (markiert), sonst dunkelrot (noch offen).
    const lamps: any[] = []
    for (let i = 0; i < leakCount; i++)
        lamps.push(<div class={cls.lamp} style={{ backgroundColor: i < markedCount ? COL.hold : COL.valveClosed }}></div>)

    return <div class={cls.root}>
        {/* Rohrnetz mit gekacheltem Hintergrund (füllt jetzt die ganze Fläche) */}
        <div class={cls.center}>
            {/* Gekachelter Hintergrund hinter dem Rohrnetz */}
            <div class={cls.bgTile} style={{ backgroundImage: IMG("puzzle_1_background") }}></div>
            {/* nur das Netz wackelt (die Knöpfe bleiben ruhig) */}
            <div class={cls.shakeBox} style={{ translate: [shake.x, shake.y] }}>
                {grid.cells.map(row => <div class={cls.row}>
                    {row.map(cell => cell ? renderCell(cell) : <div class={cls.tile}></div>)}
                </div>)}
            </div>
        </div>

        {/* Steuerung: schwebt links mittig ÜBER dem Netz (zuletzt gerendert -> oben -> klickbar) */}
        <div class={cls.controls}>
            {/* Drucktest-Knopf (gezeichneter Sprite-Button) */}
            <div class={cls.ctrlRow}>
                <div onClick={runTest} tooltip="Drucktest" class={cls.iconImg} style={{ backgroundImage: IMG("puzzle_1_air") }}></div>
            </div>
            {/* Ergebnis-Status: check Druck hält · cross Leck offen · dash kein Test/läuft (Detail im Tooltip) */}
            <div class={cls.ctrlRow}>
                <div tooltip={resultTip} class={cls.iconImg} style={{ backgroundImage: IMG(statusIcon) }}></div>
            </div>
            {/* Leck-Lämpchen statt Text-Zähler */}
            <div class={cls.lampRow}>{lamps}</div>
        </div>
    </div>
}

// Raum 1: spielt die Rohr-Runden nacheinander; erst nach der letzten ist das Puzzle gelöst.
const PipeLeakSequence = ({ rounds, solved }: { rounds: RoundConfig[], solved: () => void }) => {
    const [roundIndex, setRoundIndex] = useState(0)

    function roundSolved() {
        if (roundIndex + 1 < rounds.length) setRoundIndex(i => i + 1)
        else solved()
    }

    // key={roundIndex}: jede Runde startet mit frischem State (Lecks neu zufällig)
    return <PipeLeakPuzzle
        key={roundIndex}
        config={rounds[roundIndex]}
        level={roundIndex + 1}
        solved={roundSolved} />
}

// Platzhalter für das (noch nicht definierte) zweite Puzzle ab Raum 2.
const OtherPuzzle = ({ solved }: { solved: () => void }) =>
    <div class={emo`
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background-color: ${COL.backdrop};
        align-items: center; justify-content: center;
    `}>
        <div class={emo`
            background-color: ${COL.panel};
            padding: 24px; border-radius: 12px; align-items: stretch;
        `}>
            <div style={{ color: COL.text }} class={emo`
                font-size: 18px; -unity-font-style: bold; margin-bottom: 16px; -unity-text-align: middle-center;
            `}>Zweites Puzzle (Platzhalter)</div>
            <div onClick={solved} style={{ backgroundColor: COL.accent }} class={emo`
                padding: 10px 18px; border-radius: 6px; -unity-text-align: middle-center;
            `}><div style={{ color: COL.text }}>Puzzle abschließen</div></div>
        </div>
    </div>

const DebugPuzzle = () => {
    const [puzzleActive, setPuzzleActive] = useState(false)
    const [room, setRoom] = useState(1)

    function showPuzzle(pRoom: number) {
        setRoom(pRoom)
        setPuzzleActive(true)
    }

    function solved() {
        setPuzzleActive(false)
        debugPuzzleManager.PuzzleSolved()
    }

    useEffect(() => {
        debugPuzzleManager.add_OnShowPuzzle(showPuzzle)
        onEngineReload(() => debugPuzzleManager.remove_OnShowPuzzle(showPuzzle))
        return () => debugPuzzleManager.remove_OnShowPuzzle(showPuzzle)
    }, [])

    if (!puzzleActive) return null
    // Raum 1: Rohr-Leck-Puzzle mehrfach. Ab Raum 2: anderes Puzzle.
    return room === 1
        ? <PipeLeakSequence key={room} rounds={room1Rounds} solved={solved} />
        : <OtherPuzzle key={room} solved={solved} />
}

export default DebugPuzzle
