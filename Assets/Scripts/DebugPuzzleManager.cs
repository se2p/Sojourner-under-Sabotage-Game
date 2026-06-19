using System;
using UnityEngine;

public class DebugPuzzleManager : MonoBehaviour
{
    public static DebugPuzzleManager Instance => _instance;
    private static DebugPuzzleManager _instance;

    public event Action<int> OnShowPuzzle;

    private void Awake()
    {
        if (_instance == null) _instance = this;
        else Debug.LogError("There is already a DebugPuzzleManager");
    }

    public void ShowPuzzle(int room)
    {
        OnShowPuzzle?.Invoke(room);
        BrowserUI.NotifyPuzzleOpen(true);
        Time.timeScale = 0;
    }

    public void PuzzleSolved()
    {
        Time.timeScale = 1;
        BrowserUI.NotifyPuzzleOpen(false);
        StompEventDelegation.OnPuzzleSolved();
    }
}
