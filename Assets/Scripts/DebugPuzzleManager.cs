using System;
using UnityEngine;

public class DebugPuzzleManager : MonoBehaviour
{
    public static DebugPuzzleManager Instance => _instance;
    private static DebugPuzzleManager _instance;

    // (room/Bereich, subLevel/Startstufe) -> OneJS-Overlay wählt Puzzle-Typ und spielt ab dieser Stufe
    // alle Runden des Bereichs hintereinander in einer Sitzung (siehe die *Puzzle-Wrapper je Datei).
    public event Action<int, int> OnShowPuzzle;

    [Header("Editor-Test")]
    [Tooltip("Raum/Bereich, den die ContextMenu-Testeinträge öffnen (1 = Rohr-Leck, 2 = Zustandsbeobachtung, >=3 Platzhalter).")]
    [SerializeField] private int testRoom = 1;
    [Tooltip("Startstufe des Test-Bereichs, 1-basiert (die folgenden Stufen spielen sich danach automatisch an).")]
    [SerializeField] private int testSubLevel = 1;

    [Header("Debug")]
    [Tooltip("Wenn aktiv, wird das Puzzle nie angezeigt - ShowPuzzle löst sofort PuzzleSolved aus (zum schnellen Durchtesten, auch im WebGL-Build).")]
    [SerializeField] private bool skipPuzzle;

    // Station, die das aktuell offene Puzzle ausgelöst hat: wird gemeldet, sobald die OneJS-Sitzung
    // (alle Runden des Bereichs) durchgespielt ist.
    private PuzzleStation _activeStation;

    // Im Play-Modus per Rechtsklick auf die Komponente aufrufbar: öffnet das Puzzle des gewählten Bereichs/der Stufe
    // ohne PuzzleStation/Server. Wirkt nur in Play-Mode (das OneJS-Overlay ist erst dann auf OnShowPuzzle abonniert).
    [ContextMenu("Show Puzzle [test room]")]
    private void ShowPuzzleTest() => ShowPuzzle(testRoom, testSubLevel, null);

    private void Awake()
    {
        if (_instance == null) _instance = this;
        else Debug.LogError("There is already a DebugPuzzleManager");
    }

    public void ShowPuzzle(int room, int subLevel, PuzzleStation station)
    {
        if (skipPuzzle)
        {
            _activeStation = station;
            PuzzleSolved();
            return;
        }
        _activeStation = station;
        OnShowPuzzle?.Invoke(room, subLevel);
        BrowserUI.NotifyPuzzleOpen(true);
        Time.timeScale = 0;
    }

    public void PuzzleSolved()
    {
        Time.timeScale = 1;
        BrowserUI.NotifyPuzzleOpen(false);
        // Zurück an die auslösende Station: sie meldet den Bereich an den Server. Ohne Station
        // (ContextMenu-Test) direkt das Server-Event wie bisher.
        if (_activeStation != null)
        {
            _activeStation.OnRoundSolved();
            _activeStation = null;
        }
        else
        {
            StompEventDelegation.OnPuzzleSolved();
        }
    }
}
