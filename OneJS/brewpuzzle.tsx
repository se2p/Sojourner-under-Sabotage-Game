import { emo } from "onejs/styled"
import { h } from "preact"
import { useRef, useState } from "preact/hooks"
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
            t = resource.loadImage(__dirname + "/img/puzzle_3/" + name + ".png")
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
    accent: "rgb(60, 90, 160)",
    text: "rgb(235, 238, 242)",
    dim: "rgb(150, 156, 166)",
    backdrop: "rgb(10, 12, 16)",
    good: "rgb(90, 200, 120)",
    bad: "rgb(220, 90, 84)",
    highlight: "rgb(220, 190, 90)",
    node: "rgb(52, 46, 62)", // dunkle Knoten-Kreise wie im Mockup
}

// ─────────────────────────────────────────────────────────────────────────────
// RÄTSEL 3: Brauanlage (Tracking Origins, Zeller Kap. 9). BEWUSST OHNE TEXT,
// wie Rätsel 1/2: alles läuft über Symbole und visuelles Feedback.
//
// LUPEN-MODELL: Es gibt keine Gesamtansicht des Abhängigkeitsbaums. Sichtbar
// ist immer GENAU EIN Rezept: die Zutaten- und Eingangsflaschen-Knoten oben,
// Pfeile hinunter auf die Produktflasche. Der Spieler entdeckt die Struktur,
// indem er dem Fehler rückwärts folgt (wie beim echten Debuggen: man sieht das
// Symptom, nicht das Programm). Navigation:
//   - Die Lupe oben links an einer Eingangsflasche steigt in deren Rezept hinab.
//   - Die Breadcrumb-Reihe oben (Mini-Flaschen, ▸-getrennt) zeigt den
//     Abstiegspfad vom Dünger zur aktuellen Ansicht; Klick springt zurück.
//     Das Endrezept ist damit immer erreichbar, und die Breadcrumb IST die
//     Ursprungsspur des Traces.
// Interaktionssprache wie Rätsel 2/4: KLICK auf eine Flasche wählt das
// Test-Ziel (gelber Rand), DRAG legt einen Knoten in den Bottich, KNÖPFE
// führen aus. Die rechten Panels:
//   - Test-Panel (Pflanze): ▶ testet die GEWÄHLTE Flasche; Ergebnis ✓/✗ neben
//     der Mini-Flasche, die Pflanze wird grün (bzw. blüht beim gelösten
//     Dünger) oder bleibt grau. Tests sind UNBEGRENZT (kein Proben-Budget,
//     kein Feststecken möglich), ohne Zählung und ohne Wertung.
//   - Analyse-Panel: Soll (Rezept, oben) und Ist (tatsächlich verwendet,
//     unten) der AKTUELLEN ANSICHT; Ist verdeckt ("?"), bis deren Flasche
//     einmal getestet wurde (Diagnose nur durch Beobachtung, einheitlich in
//     allen Stufen). Der Soll/Ist-Vergleich IST die Kernaufgabe.
//   - Bottich: Neu-Mischen der AKTUELLEN ANSICHT. Knoten hineinziehen (die
//     EINZIGE Drag-Geste), ✓ mischt, ✗ leert; falsche Mischung blinkt rot
//     und leert sich. Erfolg = grüner Knoten-Rand.
// Jede Flasche trägt ein dauerhaftes Verdikt-Badge (✓ sauber / ✗ infiziert /
// – ungetestet), ÜBERALL wo sie auftaucht (auch Breadcrumb-los in der Ansicht):
// die Badges sind das externe Gedächtnis, der Spieler muss sich die Struktur
// erschließen, nicht die Ergebnisse merken. p4 startet mit ✗ und gilt als
// getestet (die beobachtete Prämisse, ganz ohne Text): deshalb ist das
// Endrezept von Anfang an offen. Nach einem Neu-Mischen fallen das eigene
// Badge und alle nachgelagerten auf "–" zurück: das Ergebnis ist veraltet,
// neu testen (Retest-nach-Fix-Zyklus). "Infiziert" wird BERECHNET, nicht
// authored: eigener Schritt weicht vom Rezept ab ODER eine eingehende
// Zwischenmischung ist infiziert.
// Knoten-Positionen werden NICHT mehr authored: das Lupen-Layout (Zutatenreihe
// oben, Flasche unten) ist berechenbar, Rundendaten sind nur noch
// recipe/actual je Schritt + hint. Sprites liegen in img/puzzle_3/
// (16×16 Zutaten/Flaschen/Vials ×2, 32×32 Pflanze/Kessel ×3); es gibt nur
// bottle_p1..p4, also maximal 4 Mischschritte je Stufe.
// "i"-Icons (infotip.tsx) erklären jedes Panel.
// ─────────────────────────────────────────────────────────────────────────────

// Alle Items: Grundzutaten plus die Ausgangsmischungen p1..p4 (Schritt i
// erzeugt "p"+(i+1); p1..p3 tauchen als Zutat nachgelagerter Schritte auf).
const ITEMS: { [id: string]: { color: string } } = {
    crystal: { color: "rgb(70, 120, 200)" },
    fungus: { color: "rgb(200, 70, 66)" },
    blossom: { color: "rgb(210, 190, 80)" },
    moss: { color: "rgb(70, 170, 100)" },
    dust: { color: "rgb(180, 185, 195)" },
    berry: { color: "rgb(150, 80, 180)" },
    p1: { color: "rgb(140, 95, 50)" },   // Wurzel-Mischung
    p2: { color: "rgb(96, 190, 110)" },  // Blatt-Mischung
    p3: { color: "rgb(70, 160, 150)" },  // Wachstums-Mischung
    p4: { color: "rgb(220, 170, 60)" },  // Dünger
}

function productId(i: number): string { return "p" + (i + 1) }
function productIndex(id: string): number {
    return (id.length === 2 && id.charAt(0) === "p") ? (+id.charAt(1)) - 1 : -1
}
// Sprite-Name eines Items: Zutaten heißen wie ihre Datei, Mischungen sind Flaschen (bottle_p1..p4).
function itemSprite(id: string): string { return productIndex(id) >= 0 ? "bottle_" + id : id }

// Hover-Erklärungen der einzelnen Panels (siehe InfoIcon/InfoTip in infotip.tsx).
const TIPS = {
    view: "One mixing step at a time\nClick a bottle to pick a test target\nThe lens on a bottle opens its recipe\nThe trail on top leads back",
    plant: "▶ tests the picked bottle\n✓ clean, ✗ contaminated",
    analysis: "This step's contents\nTop: recipe. Bottom: actually used\nHidden until this bottle was tested\nA difference = the broken step",
    vat: "Re-mix this step:\ndrag its ingredients in, ✓ mixes\nClick a chip to remove it",
}

type Line = { item: string, amount: number }
type BrewStep = { recipe: Line[], actual: Line[] }
// hint: Vorgehens-Popup beim Betreten der Stufe (s. puzzlehint.tsx).
type BrewRound = { steps: BrewStep[], hint: string }

// Multimengen-Vergleich (Reihenfolge egal): gleiche Items mit gleichen Mengen.
function multisetEq(a: Line[], b: Line[]): boolean {
    const m: { [k: string]: number } = {}
    for (let i = 0; i < a.length; i++) m[a[i].item] = (m[a[i].item] || 0) + a[i].amount
    for (let i = 0; i < b.length; i++) m[b[i].item] = (m[b[i].item] || 0) - b[i].amount
    for (const k in m) if (m[k] !== 0) return false
    return true
}

// Verzögerung über requestAnimationFrame (Time.timeScale=0, daher nie Unity-Zeit).
function rafDelay(ms: number, fn: () => void) {
    const start = Date.now()
    const loop = () => { if (Date.now() - start >= ms) fn(); else requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
}

// Pflanzen-Zustände heißen wie ihre Sprites (plant_none/plant_ok/plant_bloom):
// "none" = keine/falsche Reaktion (verwelkt), "ok" = saubere Zwischenmischung
// (grün), "bloom" = Dünger wirkt (gelöst, rosa Blattspitzen).

// PixelPanel-Rahmen: 9-slice-Sprite (wie stateobservationpuzzle.tsx).
const PANEL_SLICE = 10
const PANEL_SLICE_SCALE = 2
// Zeichenfläche der Rezept-Ansicht (absolute Kinder-Koordinaten).
const VIEW_W = 560
const VIEW_H = 430
const INPUT_Y = 170   // Knoten-Mittelpunkte der Zutatenreihe
const PRODUCT_Y = 350 // Mittelpunkt der Produktflasche
const INPUT_SPACING = 100

// Vollflächiger Kachel-Hintergrund (aus pipeleakpuzzle.tsx übernommen, gleiche 64×32-Textur/2:1-Aspekt).
const BG_ASPECT = 2
const BG_TILE = 384

// Statische Layout-Klassen einmal beim Import registrieren (emo nie pro Frame aufrufen).
const S3 = {
    root: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: ${COL.backdrop}; align-items: center; justify-content: center;`,
    // Gekachelter Hintergrund hinter dem gesamten Rätsel (wie pipeleakpuzzle.tsx).
    bgTile: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-repeat: repeat; background-size: ${BG_TILE * BG_ASPECT}px ${BG_TILE}px;`,
    wrap: emo`flex-direction: row; align-items: flex-start; justify-content: center;`,
    col: emo`align-items: stretch; margin-left: 14px; margin-right: 14px;`,
    viewBox: emo`width: ${VIEW_W}px; height: ${VIEW_H}px; flex-shrink: 0;`,
    abs: emo`position: absolute;`,
    // Absolut platzierter Knoten-Container: Kinder (Knoten, ×n) mittig untereinander; Badge/Lupe absolut in den Ecken.
    nodeCol: emo`position: absolute; align-items: center;`,
    // Knoten: dunkle Kreise wie im Mockup; Zutat 48px, Mischung 56px. Icons/Flaschen
    // sind 16×16-Sprites, ganzzahlig ×2 (FilterMode.Point -> scharfe Pixel).
    ingNode: emo`width: 48px; height: 48px; border-radius: 24px; border-width: 2px; border-color: ${COL.border}; background-color: ${COL.node}; align-items: center; justify-content: center;`,
    ingIcon: emo`width: 32px; height: 32px; flex-shrink: 0;`,
    amtText: emo`color: ${COL.dim}; font-size: 12px; margin-top: 2px; -unity-text-align: middle-center; width: 48px;`,
    prodNode: emo`width: 56px; height: 56px; border-radius: 28px; border-width: 2px; background-color: ${COL.node}; align-items: center; justify-content: center;`,
    bottle: emo`width: 32px; height: 32px; flex-shrink: 0;`,
    bottleMini: emo`width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;`,
    // Verdikt-Badge an der Flasche (✓/✗/–): dauerhafter Wissensstand wie in Rätsel 4.
    badge: emo`position: absolute; left: 40px; top: -8px; width: 22px; height: 22px; border-radius: 11px; border-width: 2px; background-color: ${COL.panel}; align-items: center; justify-content: center;`,
    badgeText: emo`font-size: 13px; -unity-font-style: bold; -unity-text-align: middle-center;`,
    // Lupen-Icon oben links an Eingangsflaschen (Gegenstück zum Verdikt-Badge oben
    // rechts): Klick steigt in deren Rezept hinab (nur Mischungen). Aus Divs
    // gezeichnet (kein Sprite, Emoji im Runtime-Font unzuverlaessig): Kreis + Griff.
    lensBtn: emo`position: absolute; left: -8px; top: -8px; width: 24px; height: 24px; padding: 2px; align-items: center; justify-content: center;`,
    lensRing: emo`position: absolute; left: 3px; top: 3px; width: 12px; height: 12px; border-radius: 8px; border-width: 2px; border-color: ${COL.accent}; background-color: ${COL.panel};`,
    lensHandle: emo`position: absolute; left: 13px; top: 14px; width: 9px; height: 3px; border-radius: 2px; background-color: ${COL.accent};`,
    // Breadcrumb: Abstiegspfad als Mini-Flaschen, aktuelle Ansicht gelb umrandet.
    crumbRow: emo`position: absolute; left: 10px; top: 10px; flex-direction: row; align-items: center;`,
    crumb: emo`width: 40px; height: 40px; border-radius: 8px; border-width: 2px; background-color: ${COL.node}; align-items: center; justify-content: center;`,
    crumbImg: emo`width: 32px; height: 32px; flex-shrink: 0;`,
    crumbSep: emo`color: ${COL.dim}; font-size: 16px; -unity-font-style: bold; margin-left: 5px; margin-right: 5px; -unity-text-align: middle-center;`,
    qmark: emo`color: ${COL.dim}; font-size: 20px; -unity-font-style: bold; -unity-text-align: middle-center; width: 40px;`,
    freshGlyph: emo`color: ${COL.good}; font-size: 16px; -unity-font-style: bold; -unity-text-align: middle-center; margin-top: 2px;`,
    // Pflanze: ein 32×32-Sprite (mit Topf) ×3.
    plantImg: emo`width: 96px; height: 96px; flex-shrink: 0;`,
    resultRow: emo`flex-direction: row; align-items: center; justify-content: center; margin-top: 10px;`,
    resultGlyph: emo`font-size: 20px; -unity-font-style: bold; margin-left: 8px; -unity-text-align: middle-center;`,
    // Analyse: Soll- und Ist-Reihe der aktuellen Ansicht, durch Linie getrennt.
    analysisBox: emo`align-items: center; margin-top: 12px;`,
    divider: emo`width: 200px; height: 2px; background-color: ${COL.border}; margin-top: 8px; margin-bottom: 2px;`,
    // Bottich: 32×32-Kessel-Sprite ×3. Die helle Innenfläche des Sprites (Quell-Pixel
    // x 6..25, y 6..9) ist die Tint-Fläche fürs Flüssigkeits-Overlay (Koordinaten ×3).
    vatZone: emo`align-items: center; justify-content: center; height: 104px;`,
    vatBody: emo`width: 96px; height: 96px; flex-shrink: 0;`,
    vatLiquid: emo`position: absolute; left: 18px; top: 18px; width: 60px; height: 12px;`,
    vatTarget: emo`align-items: center; margin-bottom: 4px;`,
    vatChips: emo`flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: center; margin-top: 6px; max-width: 220px;`,
    chipRow: emo`flex-direction: row; align-items: center; margin: 3px 6px;`,
    swatch: emo`width: 32px; height: 32px; flex-shrink: 0; margin-right: 4px;`,
    swatchBig: emo`width: 48px; height: 48px; flex-shrink: 0;`,
    chipText: emo`color: ${COL.text}; font-size: 12px;`,
    btnRow: emo`flex-direction: row; align-items: center; justify-content: center; margin-top: 10px;`,
    glyphBtn: emo`width: 38px; height: 38px; border-radius: 6px; margin-left: 6px; margin-right: 6px; align-items: center; justify-content: center;`,
    glyphText: emo`color: ${COL.text}; font-size: 18px; -unity-font-style: bold; -unity-text-align: middle-center;`,
    ghost: emo`position: absolute; top: 0; left: 0; opacity: 0.9;`,
    // Stufenende: schlichtes Erfolgs-Overlay über allem, weiter per ▶.
    resultOverlay: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: rgba(10, 12, 16, 0.75); align-items: center; justify-content: center;`,
    winGlyph: emo`color: ${COL.good}; font-size: 56px; -unity-font-style: bold; -unity-text-align: middle-center; margin-bottom: 6px;`,
    panelOuter: emo`align-items: stretch;`,
    panelInnerStretch: emo`padding: 14px; align-items: stretch;`,
    panelInnerCenter: emo`padding: 14px; align-items: center;`,
}

// Pixel-Panel (9-slice-Sprite panel_box.png, wie stateobservationpuzzle.tsx).
const PixelPanel = ({ minWidth, center, marginTop, children }: { minWidth?: number, center?: boolean, marginTop?: number, children?: any }) =>
    <div class={S3.panelOuter} style={{
        minWidth: minWidth || 0, marginTop: marginTop || 0, backgroundImage: IMG("panel_box_stone"),
        unitySliceLeft: PANEL_SLICE, unitySliceRight: PANEL_SLICE, unitySliceTop: PANEL_SLICE, unitySliceBottom: PANEL_SLICE,
        unitySliceScale: PANEL_SLICE_SCALE,
    }}>
        <div class={center ? S3.panelInnerCenter : S3.panelInnerStretch}>{children}</div>
    </div>

// Gepunkteter Pixel-Pfeil von (x1,y1) nach (x2,y2): kleine Quadrate entlang der
// Strecke, das letzte größer als Spitze. Kommt ohne Rotation aus und passt zur
// Pixel-Optik; Start/Ende ausgespart, damit die Knoten frei bleiben.
function arrowDots(x1: number, y1: number, x2: number, y2: number, keyPrefix: string): any[] {
    const dx = x2 - x1, dy = y2 - y1
    const dist = Math.sqrt(dx * dx + dy * dy)
    const startGap = 32, endGap = 36
    const usable = dist - startGap - endGap
    if (usable <= 0) return []
    const n = Math.max(2, Math.floor(usable / 15))
    const dots: any[] = []
    for (let k = 0; k <= n; k++) {
        const t = (startGap + usable * (k / n)) / dist
        const px = x1 + dx * t, py = y1 + dy * t
        const last = k === n
        const s = last ? 12 : 7
        dots.push(<div key={keyPrefix + k} class={S3.abs}
            style={{ left: px - s / 2, top: py - s / 2, width: s, height: s, backgroundColor: last ? "rgb(235, 238, 242)" : "rgb(200, 205, 215)" }}></div>)
    }
    return dots
}

// Stufen für Raum 3. FEHLERORT und FEHLERART variieren je Stufe (sonst spoilert
// Stufe 1 die späteren: wer weiß, wo der Fehler sitzt, muss nichts mehr tracen);
// die Baumform variiert mit (Raute -> Kette -> Raute mit Doppelfehler), sodass
// jede Stufe eine eigene Trace-Lektion hat. Schritt i darf nur p1..pi-1 als
// Eingang verwenden (Indizes aufsteigend); maximal 4 Schritte (Flaschen-Sprites).
const room3Rounds: BrewRound[] = [
    // Stufe 1 (leicht, Raute): FALSCHE ZUTAT, und zwar TIEF im Baum (Schritt 1
    // verwendet fungus statt moss). Der Einstieg erzwingt damit einmal die
    // komplette Schleife: testen -> hinabsteigen -> vergleichen -> mischen ->
    // per Breadcrumb zurück -> nachtesten.
    // Optimaler Trace: p3 testen (✗, Soll=Ist -> Eingang), p1 testen (✗, Ist
    // weicht ab -> fixen), p4 testen (✓) = 3 Tests.
    {
        steps: [
            {
                recipe: [{ item: "moss", amount: 2 }, { item: "crystal", amount: 1 }],
                actual: [{ item: "fungus", amount: 2 }, { item: "crystal", amount: 1 }],
            },
            {
                recipe: [{ item: "blossom", amount: 1 }, { item: "berry", amount: 2 }],
                actual: [{ item: "blossom", amount: 1 }, { item: "berry", amount: 2 }],
            },
            {
                recipe: [{ item: "p1", amount: 1 }, { item: "p2", amount: 1 }, { item: "dust", amount: 1 }],
                actual: [{ item: "p1", amount: 1 }, { item: "p2", amount: 1 }, { item: "dust", amount: 1 }],
            },
            {
                recipe: [{ item: "p3", amount: 1 }, { item: "fungus", amount: 1 }, { item: "blossom", amount: 1 }],
                actual: [{ item: "p3", amount: 1 }, { item: "fungus", amount: 1 }, { item: "blossom", amount: 1 }],
            },
        ],
        hint: [
            "The fertilizer failed (✗), and the fault can sit anywhere along the brewing chain.",
            "",
            "Test a bottle (▶) to check it, use its lens to see its recipe, and use the trail at the top to get back. The step whose actual contents don't match its recipe is the one to re-mix.",
        ].join("\n"),
    },
    // Stufe 2 (mittel, KETTE p1 -> p2 -> p3 -> p4): FALSCHE KONZENTRATION in
    // der Mitte (Schritt 2 nimmt 3x statt 1x dust). Die Kette übt das
    // wiederholte Hinabsteigen und die Regel "eigenes Ist = Soll, also kam der
    // Fehler durch den Eingang herein".
    // Optimaler Trace: p3 (✗, Soll=Ist), p2 (✗, dust×3 -> fixen), p4 (✓) = 3.
    {
        steps: [
            {
                recipe: [{ item: "crystal", amount: 1 }, { item: "berry", amount: 2 }],
                actual: [{ item: "crystal", amount: 1 }, { item: "berry", amount: 2 }],
            },
            {
                recipe: [{ item: "p1", amount: 1 }, { item: "dust", amount: 1 }],
                actual: [{ item: "p1", amount: 1 }, { item: "dust", amount: 3 }],
            },
            {
                recipe: [{ item: "p2", amount: 1 }, { item: "moss", amount: 2 }],
                actual: [{ item: "p2", amount: 1 }, { item: "moss", amount: 2 }],
            },
            {
                recipe: [{ item: "p3", amount: 1 }, { item: "blossom", amount: 1 }, { item: "crystal", amount: 1 }],
                actual: [{ item: "p3", amount: 1 }, { item: "blossom", amount: 1 }, { item: "crystal", amount: 1 }],
            },
        ],
        hint: [
            "A step's contents only show once you have tested its bottle, and the trail can run deep.",
            "",
            "Follow the ✗ backward one bottle at a time: if a bad mixture's own contents match its recipe, the problem came in through one of its input bottles.",
        ].join("\n"),
    },
    // Stufe 3 (schwer, Raute mit ZWEI Fehlern in verschiedenen Ästen):
    // Schritt 2 fehlt die Eingangsmischung p1 komplett (der leicht übersehene
    // Zwischenmischungs-Eingang), Schritt 3 hat die falsche Menge (berry×4
    // statt ×2). Nach dem ersten Fix versagt der Dünger weiter: die
    // zurückgefallenen Verdikte (–) zwingen zum erneuten Tracen in den
    // anderen Ast (ein Fix beweist nicht, dass es der einzige Fehler war).
    // Optimaler Trace: p2 (✗, p1 fehlt -> fixen), p4 (✗!), p3 (✗, berry×4 ->
    // fixen), p4 (✓) = 4 Tests.
    {
        steps: [
            {
                recipe: [{ item: "blossom", amount: 1 }, { item: "crystal", amount: 1 }],
                actual: [{ item: "blossom", amount: 1 }, { item: "crystal", amount: 1 }],
            },
            {
                recipe: [{ item: "p1", amount: 1 }, { item: "fungus", amount: 2 }],
                actual: [{ item: "fungus", amount: 2 }],
            },
            {
                recipe: [{ item: "berry", amount: 2 }, { item: "dust", amount: 1 }],
                actual: [{ item: "berry", amount: 4 }, { item: "dust", amount: 1 }],
            },
            {
                recipe: [{ item: "p2", amount: 1 }, { item: "p3", amount: 1 }, { item: "moss", amount: 1 }],
                actual: [{ item: "p2", amount: 1 }, { item: "p3", amount: 1 }, { item: "moss", amount: 1 }],
            },
        ],
        hint: [
            "Fixing one bad step doesn't always fix the product.",
            "",
            "If the fertilizer still fails after a fix, the old test results are stale (–): trace the failure again, another branch may hide a second fault.",
        ].join("\n"),
    },
]

// Eine Zutaten-Angabe (Analyse und Bottich): Item-Sprite + "×n". Ohne Namen,
// das Sprite identifiziert das Item (Zutat-Icon bzw. Flasche).
const Chip = ({ item, amount, onClick }: { item: string, amount: number, onClick?: () => void }) =>
    <div onClick={onClick} class={S3.chipRow}>
        <div class={S3.swatch} style={{ backgroundImage: IMG(itemSprite(item)) }}></div>
        <div class={S3.chipText}>{"×" + amount}</div>
    </div>

const GlyphBtn = ({ glyph, onClick, primary, disabled }: { glyph: string, onClick: () => void, primary?: boolean, disabled?: boolean }) =>
    <div onClick={onClick} class={S3.glyphBtn} style={{ backgroundColor: primary && !disabled ? COL.accent : "rgb(69, 52, 39)", opacity: disabled ? 0.4 : 1 }}>
        <div class={S3.glyphText}>{glyph}</div>
    </div>

type Verdict = "none" | "ok" | "bad"

function verdictColor(v: Verdict): string { return v === "ok" ? COL.good : v === "bad" ? COL.bad : COL.dim }
function verdictGlyph(v: Verdict): string { return v === "ok" ? "✓" : v === "bad" ? "✗" : "–" }

const BrewPuzzle = ({ config, solved }: { config: BrewRound, solved: () => void }) => {
    const steps = config.steps
    const finalIdx = steps.length - 1
    // Abstiegspfad (Breadcrumb): beginnt immer beim Endrezept; letztes Element = aktuelle Ansicht.
    const [path, setPath] = useState<number[]>(() => [finalIdx])
    const view = path[path.length - 1]
    const [selected, setSelected] = useState(finalIdx)              // Test-Ziel (immer eine sichtbare Flasche)
    // Startprämisse: der Dünger hat sichtbar versagt -> gilt als getestet (✗),
    // deshalb ist sein Rezept von Anfang an offen; alles andere ist unbekannt.
    const [tested, setTested] = useState<boolean[]>(() => steps.map((s, i) => i === finalIdx))
    const [verdicts, setVerdicts] = useState<Verdict[]>(() => steps.map((s, i) => i === finalIdx ? "bad" : "none"))
    const [rebrewed, setRebrewed] = useState<boolean[]>(() => steps.map(() => false))
    const [lastTest, setLastTest] = useState({ step: finalIdx, ok: false })
    const [plantState, setPlantState] = useState("none")
    const [vat, setVat] = useState<{ [item: string]: number }>({})
    const [vatFlash, setVatFlash] = useState(false)                 // rotes Blinken: Mischung misslungen/ungültige Ablage
    const [won, setWon] = useState(false)
    const [showResult, setShowResult] = useState(false)             // Erfolgs-Overlay nach dem Sieg
    const [tip, setTip] = useState<Tip | null>(null)                // aktive Hover-Erklärung (InfoIcon/InfoTip)
    const dragRef = useRef<any>({ down: false, id: "", step: -1, startX: 0, startY: 0, x: 0, y: 0 })
    const [dragging, setDragging] = useState(false)
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
    const vatRef = useRef<any>(null)

    // Was die Station tatsächlich verwendet: nach dem Neu-Mischen das Rezept, sonst die Ist-Liste.
    function usedLines(i: number): Line[] { return rebrewed[i] ? steps[i].recipe : steps[i].actual }

    // Infektionskette: eigener Schritt weicht ab ODER eine Eingangsmischung ist infiziert.
    function infected(i: number): boolean {
        if (!multisetEq(usedLines(i), steps[i].recipe)) return true
        const r = steps[i].recipe
        for (let k = 0; k < r.length; k++) {
            const pi = productIndex(r[k].item)
            if (pi >= 0 && pi < i && infected(pi)) return true
        }
        return false
    }

    // Hängt Schritt j (transitiv über die Rezepte) von Schritt i ab?
    function dependsOn(j: number, i: number): boolean {
        const r = steps[j].recipe
        for (let k = 0; k < r.length; k++) {
            const pi = productIndex(r[k].item)
            if (pi >= 0 && pi < j && (pi === i || dependsOn(pi, i))) return true
        }
        return false
    }

    function flashVat() { setVatFlash(true); rafDelay(450, () => setVatFlash(false)) }

    // Lupe oben links an einer Eingangsflasche: in deren Rezept hinabsteigen.
    // Der Bottich gehört zur Ansicht und leert sich beim Wechsel mit.
    function descend(i: number) {
        if (won) return
        const p = path.slice(); p.push(i)
        setPath(p); setSelected(i); clearVat()
    }
    // Klick auf eine Breadcrumb-Flasche: zurückspringen (Pfad kappen).
    function jumpTo(depth: number) {
        if (won || depth >= path.length - 1) return
        const p = path.slice(0, depth + 1)
        setPath(p); setSelected(p[p.length - 1]); clearVat()
    }

    // ▶ im Test-Panel: die GEWÄHLTE Flasche auf die Pflanze geben.
    function runTest() {
        if (won) return
        const i = selected
        const t = tested.slice(); t[i] = true; setTested(t)
        const ok = !infected(i)
        const v = verdicts.slice(); v[i] = ok ? "ok" : "bad"; setVerdicts(v)
        setLastTest({ step: i, ok: ok })
        setPlantState(ok ? (i === finalIdx ? "bloom" : "ok") : "none")
        // Sieg: erst die Pflanze blühen lassen, dann das Erfolgs-Overlay zeigen.
        if (i === finalIdx && ok) { setWon(true); rafDelay(900, () => setShowResult(true)) }
    }

    function copyVat(c: { [k: string]: number }): { [k: string]: number } {
        const n: { [k: string]: number } = {}
        for (const k in c) n[k] = c[k]
        return n
    }
    function addToVat(item: string) {
        setVat(prev => { const n = copyVat(prev); n[item] = (n[item] || 0) + 1; return n })
    }
    function removeFromVat(item: string) {
        setVat(prev => {
            const n = copyVat(prev)
            if (n[item] > 1) n[item] = n[item] - 1; else delete n[item]
            return n
        })
    }
    function clearVat() { setVat({}) }

    // ✓ im Bottich: Inhalt gegen das Rezept der AKTUELLEN ANSICHT prüfen.
    // Erfolg setzt die Verdikte der Station UND aller nachgelagerten zurück auf
    // "–": die alten Testergebnisse sind veraltet, neu testen (Retest-nach-Fix).
    function mix() {
        if (won) return
        const lines: Line[] = []
        for (const k in vat) lines.push({ item: k, amount: vat[k] })
        if (lines.length === 0) return
        if (multisetEq(lines, steps[view].recipe)) {
            const r = rebrewed.slice(); r[view] = true; setRebrewed(r)
            setVerdicts(prev => {
                const n = prev.slice()
                for (let j = 0; j < steps.length; j++)
                    if (j === view || dependsOn(j, view)) n[j] = "none"
                return n
            })
            clearVat() // Erfolg sichtbar am grün umrandeten Knoten
        } else {
            clearVat()
            flashVat()
        }
    }

    // Drag-and-Drop (Muster aus stateobservationpuzzle.tsx), EINE Bedeutung:
    // Knoten (Zutat oder Eingangsflasche) in den Bottich ziehen = Zutat für die
    // aktuelle Ansicht. Klick ohne Ziehen auf eine Flasche = Test-Ziel wählen.
    function onNodeDown(id: string, step: number, evt: any) {
        if (won) return
        dragRef.current = { down: true, id: id, step: step, startX: evt.position.x, startY: evt.position.y, x: evt.position.x, y: evt.position.y }
    }
    function inBounds(ref: any, x: number, y: number): boolean {
        const el = ref.current
        if (!el || !el.ve) return false
        const wb = el.ve.worldBound
        return x >= wb.x && x <= wb.x + wb.width && y >= wb.y && y <= wb.y + wb.height
    }
    function onRootMove(evt: any) {
        const d = dragRef.current
        if (!d.down) return
        d.x = evt.position.x; d.y = evt.position.y
        if (!dragging && (Math.abs(d.x - d.startX) + Math.abs(d.y - d.startY)) > 6) setDragging(true)
        setDragPos({ x: d.x, y: d.y })
    }
    function onRootUp() {
        const d = dragRef.current
        if (!d.down) return
        d.down = false
        setDragging(false)
        const isProduct = d.step >= 0
        if (!dragging) { // einfacher Klick: Flasche als Test-Ziel wählen (Zutaten ignorieren)
            if (isProduct) setSelected(d.step)
            return
        }
        if (inBounds(vatRef, d.x, d.y)) {
            if (isProduct && d.step >= view) { flashVat(); return } // die eigene Ausgangsflasche mischt sich nicht selbst
            addToVat(d.id)
        } // Ablagen anderswo tun nichts
    }
    function onRootLeave() {
        if (!dragRef.current.down) return
        dragRef.current.down = false
        setDragging(false)
    }

    // ── Rezept-Ansicht aufbauen: erst Pfeile, dann Knoten (Zeichenreihenfolge =
    // Ebenen). Layout ist berechnet, nicht authored: Zutatenreihe oben (mittig
    // verteilt), Produktflasche unten in der Mitte. Als `any` (nicht any[])
    // typisiert: die JSX-Children-Signatur akzeptiert Arrays sonst nicht neben
    // Element-Geschwistern (Preact-Typen, ES3-Ziel).
    const st = steps[view]
    const cx = VIEW_W / 2
    const arrows: any = []
    const nodes: any = []
    const nIn = st.recipe.length
    for (let k = 0; k < nIn; k++) {
        const l = st.recipe[k]
        const ix = cx + (k - (nIn - 1) / 2) * INPUT_SPACING
        arrows.push(arrowDots(ix, INPUT_Y, cx, PRODUCT_Y, "a" + k))
        const pi = productIndex(l.item)
        if (pi >= 0) {
            // Eingangsflasche: wählbar (Klick), ziehbar (Bottich), begehbar (Lupe oben links); Badge = Verdikt.
            const vColor = verdictColor(verdicts[pi])
            nodes.push(<div key={"in" + view + "-" + k} class={S3.nodeCol} style={{ left: ix - 28, top: INPUT_Y - 28 }}>
                <div class={S3.prodNode} onPointerDown={(e: any) => onNodeDown(l.item, pi, e)}
                    style={{ borderColor: selected === pi ? COL.highlight : (rebrewed[pi] ? COL.good : COL.border) }}>
                    <div class={S3.bottle} style={{ backgroundImage: IMG("bottle_" + l.item) }}></div>
                </div>
                <div class={S3.badge} style={{ borderColor: vColor }}>
                    <div class={S3.badgeText} style={{ color: vColor }}>{verdictGlyph(verdicts[pi])}</div>
                </div>
                <div class={S3.amtText}>{"×" + l.amount}</div>
                {/* Lupe oben links (Badge sitzt oben rechts): steigt ins Rezept hinab. */}
                <div class={S3.lensBtn} onClick={() => descend(pi)}>
                    <div class={S3.lensRing}></div>
                    <div class={S3.lensHandle} style={{ rotate: 45 }}></div>
                </div>
            </div>)
        } else {
            // Zutaten-Knoten: nur Drag-Quelle für den Bottich.
            nodes.push(<div key={"in" + view + "-" + k} class={S3.nodeCol} style={{ left: ix - 24, top: INPUT_Y - 24 }}>
                <div class={S3.ingNode} onPointerDown={(e: any) => onNodeDown(l.item, -1, e)}>
                    <div class={S3.ingIcon} style={{ backgroundImage: IMG(itemSprite(l.item)) }}></div>
                </div>
                <div class={S3.amtText}>{"×" + l.amount}</div>
            </div>)
        }
    }
    // Die Produktflasche der Ansicht (unten): wählbar wie die Eingänge, Badge = Verdikt.
    const vvColor = verdictColor(verdicts[view])
    nodes.push(<div key={"prod" + view} class={S3.nodeCol} style={{ left: cx - 28, top: PRODUCT_Y - 28 }}>
        <div class={S3.prodNode} onPointerDown={(e: any) => onNodeDown(productId(view), view, e)}
            style={{ borderColor: selected === view ? COL.highlight : (rebrewed[view] ? COL.good : COL.border) }}>
            <div class={S3.bottle} style={{ backgroundImage: IMG("bottle_" + productId(view)) }}></div>
        </div>
        <div class={S3.badge} style={{ borderColor: vvColor }}>
            <div class={S3.badgeText} style={{ color: vvColor }}>{verdictGlyph(verdicts[view])}</div>
        </div>
    </div>)

    // Breadcrumb: Abstiegspfad vom Endrezept zur aktuellen Ansicht.
    const crumbs: any = []
    for (let k = 0; k < path.length; k++) {
        const kk = k
        if (k > 0) crumbs.push(<div key={"cs" + k} class={S3.crumbSep}>▸</div>)
        crumbs.push(<div key={"c" + k} class={S3.crumb} onClick={() => jumpTo(kk)}
            style={{ borderColor: k === path.length - 1 ? COL.highlight : COL.border }}>
            <div class={S3.crumbImg} style={{ backgroundImage: IMG("bottle_" + productId(path[k])) }}></div>
        </div>)
    }

    // Analyse der aktuellen Ansicht: Soll (Rezept) oben, Ist (verwendet) unten.
    // Ist verdeckt ("?"), bis die Flasche der Ansicht einmal getestet wurde.
    const showActual = tested[view] || rebrewed[view]

    const vatItems: string[] = []
    for (const k in vat) vatItems.push(k)

    return <div class={S3.root} onPointerMove={onRootMove} onPointerUp={onRootUp} onPointerLeave={onRootLeave}>
        <div class={S3.bgTile} style={{ backgroundImage: IMG("puzzle_1_background") }}></div>
        <div class={S3.wrap}>
            {/* Links: die Rezept-Ansicht (Lupe auf genau einen Mischschritt) + Breadcrumb. */}
            <div class={S3.col}>
                <PixelPanel>
                    <div class={S3.viewBox}>
                        {arrows}
                        {nodes}
                        <div class={S3.crumbRow}>{crumbs}</div>
                        {/* Info-"i" oben rechts in der Zeichenfläche (Ecke ist knotenfrei). */}
                        <div class={S3.abs} style={{ left: VIEW_W - 26, top: 0 }}>
                            <InfoIcon text={TIPS.view} setTip={setTip} />
                        </div>
                    </div>
                </PixelPanel>
            </div>

            {/* Rechts: Test-Panel (Pflanze + ▶ + Test-Zähler), Analyse (Soll/Ist), Bottich. */}
            <div class={S3.col}>
                {/* Test-Panel: ▶ gibt die gewählte Flasche auf die Pflanze. */}
                <PixelPanel minWidth={240} center>
                    <InfoIcon text={TIPS.plant} setTip={setTip} corner />
                    <div class={S3.plantImg} style={{ backgroundImage: IMG("plant_" + plantState) }}></div>
                    {/* Zuletzt getestete Flasche + ✓/✗. */}
                    <div class={S3.resultRow}>
                        <div class={S3.bottleMini} style={{ backgroundImage: IMG("bottle_" + productId(lastTest.step)) }}></div>
                        <div class={S3.resultGlyph} style={{ color: lastTest.ok ? COL.good : COL.bad }}>{lastTest.ok ? "✓" : "✗"}</div>
                    </div>
                    {/* Gewählte Flasche + Test-Knopf. */}
                    <div class={S3.btnRow}>
                        <div class={S3.bottleMini} style={{ backgroundImage: IMG("bottle_" + productId(selected)) }}></div>
                        <GlyphBtn glyph="▶" onClick={runTest} primary disabled={won} />
                    </div>
                </PixelPanel>

                {/* Analyse-Panel: Soll- und Ist-Zutaten der aktuellen Ansicht. */}
                <PixelPanel minWidth={240} center marginTop={14}>
                    <InfoIcon text={TIPS.analysis} setTip={setTip} corner />
                    <div class={S3.analysisBox}>
                        <div class={S3.vatChips}>{st.recipe.map(l => <Chip item={l.item} amount={l.amount} />)}</div>
                        <div class={S3.divider}></div>
                        {showActual
                            ? <div class={S3.vatChips}>{usedLines(view).map(l => <Chip item={l.item} amount={l.amount} />)}</div>
                            : <div class={S3.qmark}>?</div>}
                        {rebrewed[view] ? <div class={S3.freshGlyph}>✓</div> : <div></div>}
                    </div>
                </PixelPanel>

                {/* Bottich: Neu-Mischen der aktuellen Ansicht. */}
                <div ref={(el: any) => { vatRef.current = el }}>
                    <PixelPanel minWidth={240} center marginTop={14}>
                        <InfoIcon text={TIPS.vat} setTip={setTip} corner />
                        {/* Ziel-Flasche = die Produktflasche der Ansicht. */}
                        <div class={S3.vatTarget}>
                            <div class={S3.bottleMini} style={{ backgroundImage: IMG("bottle_" + productId(view)) }}></div>
                        </div>
                        <div class={S3.vatZone}>
                            {/* Kessel-Sprite; die Flüssigkeit färbt die helle Innenfläche (Kind, absolut). Beim
                                Fehlschlag blinkt die Flüssigkeit rot (das Sprite selbst lässt sich nicht tinten). */}
                            <div class={S3.vatBody} style={{ backgroundImage: IMG("vat") }}>
                                <div class={S3.vatLiquid} style={{
                                    backgroundColor: vatFlash ? COL.bad : ITEMS[productId(view)].color,
                                    opacity: vatFlash || vatItems.length > 0 ? 1 : 0.25,
                                }}></div>
                            </div>
                        </div>
                        {vatItems.length > 0
                            ? <div class={S3.vatChips}>{vatItems.map(id => <Chip item={id} amount={vat[id]} onClick={() => removeFromVat(id)} />)}</div>
                            : <div></div>}
                        <div class={S3.btnRow}>
                            <GlyphBtn glyph="✓" onClick={mix} primary disabled={won || vatItems.length === 0} />
                            <GlyphBtn glyph="✗" onClick={clearVat} disabled={vatItems.length === 0} />
                        </div>
                    </PixelPanel>
                </div>
            </div>
        </div>

        {dragging
            ? <div class={S3.ghost} style={{ translate: [dragPos.x - 24, dragPos.y - 24] }}>
                <div class={S3.swatchBig} style={{ backgroundImage: IMG(itemSprite(dragRef.current.id)) }}></div>
            </div>
            : <div></div>}

        {/* Stufenende: schlichtes Erfolgs-Overlay (großes ✓) + Weiter-Knopf, über allen Panels. */}
        {showResult
            ? <div class={S3.resultOverlay}>
                <PixelPanel minWidth={280} center>
                    <div class={S3.winGlyph}>✓</div>
                    <div class={S3.btnRow}>
                        <GlyphBtn glyph="▶" onClick={() => solved()} primary />
                    </div>
                </PixelPanel>
            </div>
            : <div></div>}

        {/* Hover-Erklärung — als letztes Kind, damit sie über allen Panels liegt (wie der Ghost) */}
        <InfoTip tip={tip} />

        {/* Vorgehens-Popup beim Betreten der Stufe — ganz zuletzt, liegt über allem (auch der InfoTip). */}
        <HintPopup text={config.hint} />
    </div>
}

// Default-Export: spielt alle Stufen des Brauanlagen-Bereichs hintereinander in einer Sitzung ab
// (subLevel = Startstufe, 1-basiert; im normalen Spiel immer 1). Erst nach der letzten Stufe ruft sie
// die übergebene solved() auf — frühere Stufen schalten intern zur nächsten weiter.
const Puzzle3 = ({ subLevel, solved }: { subLevel: number, solved: () => void }) => {
    const start = Math.max(0, Math.min(room3Rounds.length - 1, (subLevel || 1) - 1))
    const [idx, setIdx] = useState(start)
    function roundSolved() {
        if (idx < room3Rounds.length - 1) setIdx(idx + 1)
        else solved()
    }
    return <BrewPuzzle key={idx} config={room3Rounds[idx]} solved={roundSolved} />
}
export default Puzzle3
