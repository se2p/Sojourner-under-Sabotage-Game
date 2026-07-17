import { emo } from "onejs/styled"
import { h } from "preact"
import { useEffect, useState } from "preact/hooks"
import PipeLeakPuzzle from "pipeleakpuzzle"
import StateObservationPuzzle from "stateobservationpuzzle"
import BrewPuzzle from "brewpuzzle"
import HypothesisPuzzle from "hypothesispuzzle"
const debugPuzzleManager = require("debugPuzzleManager")

// Platzhalter ab Raum 5 (Puzzles dort noch nicht definiert).
const PlaceholderPuzzle = ({ solved }: { solved: () => void }) =>
    <div class={emo`
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgb(10, 12, 16);
        align-items: center; justify-content: center;
    `}>
        <div class={emo`
            background-color: rgb(28, 32, 40);
            padding: 24px; border-radius: 12px; align-items: stretch;
        `}>
            <div style={{ color: "rgb(235, 238, 242)" }} class={emo`
                font-size: 18px; -unity-font-style: bold; margin-bottom: 16px; -unity-text-align: middle-center;
            `}>Another puzzle (placeholder)</div>
            <div onClick={solved} style={{ backgroundColor: "rgb(60, 90, 160)" }} class={emo`
                padding: 10px 18px; border-radius: 6px; -unity-text-align: middle-center;
            `}><div style={{ color: "rgb(235, 238, 242)" }}>Complete puzzle</div></div>
        </div>
    </div>

// Dispatcher: öffnet auf DebugPuzzleManager.ShowPuzzle(room, subLevel) das passende Puzzle ab der
// gegebenen Startstufe und meldet die Lösung über PuzzleSolved zurück, sobald der Bereich seine letzte
// Stufe durchgespielt hat (die *Puzzle-Wrapper spielen die Stufen intern hintereinander ab). Ein Puzzle
// je Datei; ab Raum 4 Platzhalter.
const DebugPuzzle = () => {
    const [puzzleActive, setPuzzleActive] = useState(false)
    const [room, setRoom] = useState(1)
    // Startstufe des Bereichs (im normalen Spiel immer 1) — die Sequenz läuft ab hier intern weiter.
    const [subLevel, setSubLevel] = useState(1)

    function showPuzzle(pRoom: number, pSubLevel: number) {
        setRoom(pRoom)
        setSubLevel(pSubLevel || 1)
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
    // Raum 1: Rohr-Leck-Bereich · Raum 2: Zustandsbeobachtungs-Bereich · Raum 3: Brauanlage ·
    // Raum 4: Hypothesen-Maschine · ab Raum 5: Platzhalter.
    // subLevel ist nur die Startstufe der Sitzung; key bindet sie, damit ein neu geöffnetes Puzzle frisch startet.
    return room === 1 ? <PipeLeakPuzzle key={`1-${subLevel}`} subLevel={subLevel} solved={solved} />
        : room === 2 ? <StateObservationPuzzle key={`2-${subLevel}`} subLevel={subLevel} solved={solved} />
            : room === 3 ? <BrewPuzzle key={`3-${subLevel}`} subLevel={subLevel} solved={solved} />
                : room === 4 ? <HypothesisPuzzle key={`4-${subLevel}`} subLevel={subLevel} solved={solved} />
                    : <PlaceholderPuzzle key={room} solved={solved} />
}

export default DebugPuzzle
