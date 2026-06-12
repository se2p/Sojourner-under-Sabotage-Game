import { emo } from "onejs/styled"
import { h } from "preact"
import { useEffect, useState} from "preact/hooks"
const debugPuzzleManager = require("debugPuzzleManager")

const SimplePuzzle = ({ solved }: { solved: () => void }) =>
    <div class={emo`
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        align-items: center; justify-content: center;
    `}>
        <div class={emo`
            background-color: rgb(28, 32, 40);
            padding: 24px; border-radius: 12px;
            min-width: 320px; align-items: stretch;
        `}>
            <div onClick={solved} class={emo`
                padding: 10px; border-radius: 6px;
                background-color: rgb(60, 90, 160); color: white;
                -unity-text-align: middle-center;
            `}>Debugging abschließen</div>
        </div>
    </div>

const DebugPuzzle = () => {
    const [puzzleActive, setPuzzleActive] = useState(false)

    function showPuzzle(_room: number) {
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

    return puzzleActive ? <SimplePuzzle solved={solved} /> : null
}

export default DebugPuzzle



