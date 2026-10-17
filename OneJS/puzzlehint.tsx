import { emo } from "onejs/styled"
import { h } from "preact"
import { useState } from "preact/hooks"

// Vorgehens-Hinweis, der beim Betreten einer Puzzle-Stufe einmal als Popup erscheint (bis weggeklickt).
// Anders als InfoTip (Bedienungs-Hover, dauerhaft abrufbar) geht es hier um die STRATEGIE der Stufe
// (z.B. "systematisch eingrenzen statt raten") — daher erzwungen sichtbar statt nur auf Hover.
// Jede Puzzle-Instanz wird beim Verlassen komplett demontiert (debugpuzzle.tsx: `if (!puzzleActive) return null`),
// daher reicht ein einfacher useState(true) — beim erneuten Betreten der Stufe erscheint der Hinweis wieder frisch.

// Farben an das Popup des Debug-Bildschirms angeglichen (popup.js/game.css: #popup = rgba(0,0,0,0.8)
// abgerundete dunkle Karte, Button-Blau #135275).
const S = {
    overlay: emo`position: absolute; top: 0; left: 0; right: 0; bottom: 0; align-items: center; justify-content: center;`,
    box: emo`background-color: rgba(0, 0, 0, 0.82); padding: 24px 48px; border-radius: 8px; border-width: 1px; border-color: rgba(255, 255, 255, 0.12); max-width: 460px; align-items: stretch;`,
    text: emo`color: rgb(255, 255, 255); font-size: 15px; white-space: normal; -unity-text-align: upper-left; margin-top: 2px; margin-bottom: 2px;`,
    btnRow: emo`align-items: center; margin-top: 20px;`,
    btn: emo`background-color: rgb(19, 82, 117); padding: 8px 18px; border-radius: 8px; -unity-text-align: middle-center;`,
    btnText: emo`color: rgb(255, 255, 255); font-size: 15px;`,
}

// text: "\n" trennt Zeilen, eine leere Zeile ("\n\n") wird zum Absatz-Abstand (wie InfoTip). Ohne text: kein Popup.
export const HintPopup = ({ text }: { text?: string }) => {
    const [open, setOpen] = useState(true)
    if (!text || !open) return null
    return <div class={S.overlay}>
        <div class={S.box}>
            {/* map in eigenem Container (h erlaubt Array nur als einziges Kind, s. pipeleakpuzzle.tsx) */}
            <div>{text.split("\n").map(l => l ? <div class={S.text}>{l}</div> : <div style={{ height: 8 }}></div>)}</div>
            <div class={S.btnRow}>
                <div onClick={() => setOpen(false)} class={S.btn}><div class={S.btnText}>Got it</div></div>
            </div>
        </div>
    </div>
}
