import { emo } from "onejs/styled"
import { h } from "preact"

// Gemeinsames "i"-Icon mit Hover-Erklärung für die Puzzle-Overlays.
// Unitys tooltip-Attribut zeigt nur im Editor etwas an (nicht im WebGL-Build),
// daher eine eigene schwebende Box: das Icon meldet beim Hover Text + Position
// an den Puzzle-Root (setTip), der die Box als LETZTES Kind rendert — wie der
// Drag-Ghost liegt sie damit über allen Panels (UIElements zeichnet in
// Dokument-Reihenfolge; eine im Panel platzierte Box läge unter späteren Panels).
export type Tip = { text: string, x: number, y: number }

const TIP_W = 260 // feste Breite -> Text bricht um und die Randklemmung ist deterministisch

const S = {
    // Ecken-Platzierung innerhalb eines Panels (position MUSS über emo kommen,
    // der Inline-Style-Prozessor löst "absolute" nicht auf — wie PixelPanel).
    corner: emo`position: absolute; top: 10px; right: 12px;`,
    icon: emo`width: 22px; height: 22px; border-radius: 11px; border-width: 2px; border-color: rgb(120, 128, 142); background-color: rgb(46, 52, 62); align-items: center; justify-content: center; flex-shrink: 0;`,
    iconText: emo`color: rgb(200, 206, 216); font-size: 13px; -unity-font-style: bold; -unity-text-align: middle-center;`,
    tipBox: emo`position: absolute; top: 0; left: 0; width: ${TIP_W}px; padding: 8px 10px; background-color: rgb(20, 24, 32); border-width: 2px; border-color: rgb(120, 128, 142); border-radius: 6px;`,
    tipText: emo`color: rgb(235, 238, 242); font-size: 12px; white-space: normal; -unity-text-align: upper-left; margin-top: 1px; margin-bottom: 1px;`,
}

// Das "i"-Icon. corner = absolut in der rechten oberen Panel-Ecke; sonst inline
// (style für Abstände). Beim Hover wird die Box mittig unter dem Icon verankert
// und horizontal an den Bildschirmrand geklemmt (Breite über panel.visualTree).
export const InfoIcon = ({ text, setTip, corner, style }: { text: string, setTip: (t: Tip | null) => void, corner?: boolean, style?: any }) => {
    let el: any = null
    const show = () => {
        if (!el || !el.ve) return
        const wb = el.ve.worldBound
        let x = wb.x + wb.width / 2 - TIP_W / 2
        const y = wb.y + wb.height + 8
        try {
            const screen = el.ve.panel.visualTree.worldBound
            if (x + TIP_W + 10 > screen.width) x = screen.width - TIP_W - 10
        } catch (e) { } // ohne Panel-Zugriff bleibt nur die Links-Klemmung
        if (x < 10) x = 10
        setTip({ text: text, x: x, y: y })
    }
    const icon = <div ref={(e: any) => { el = e }} onPointerEnter={show} onPointerLeave={() => setTip(null)}
        class={S.icon} style={style}>
        <div class={S.iconText}>i</div>
    </div>
    return corner ? <div class={S.corner}>{icon}</div> : icon
}

// Die schwebende Erklärungs-Box — im Puzzle-Root als letztes Kind rendern.
// "\n" im Text trennt Zeilen: jede wird ein eigenes Div (zuverlässiger als
// Auto-Umbruch, der bei fester Breite unschöne Zeilen erzeugt). Eine LEERE
// Zeile ("\n\n") wird zum Absatz-Abstand — so lassen sich mehrere Funktionen
// in einem Tip sauber voneinander absetzen.
export const InfoTip = ({ tip }: { tip: Tip | null }) =>
    tip
        ? <div class={S.tipBox} style={{ translate: [tip.x, tip.y] }}>
            {tip.text.split("\n").map(l => l ? <div class={S.tipText}>{l}</div> : <div style={{ height: 7 }}></div>)}
        </div>
        : <div></div>
