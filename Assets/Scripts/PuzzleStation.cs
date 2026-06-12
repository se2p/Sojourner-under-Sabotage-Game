using UnityEngine;

[RequireComponent(typeof(InteractableWorldObject))]
public class PuzzleStation : MonoBehaviour
{
    private InteractableWorldObject _interactable;

    private void Start()
    {
        _interactable = GetComponent<InteractableWorldObject>();
        _interactable.IsEnabled = false;
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
    }

    private void HandleGameProgressionChanged(GameProgressState state)
    {
        _interactable.IsEnabled =
            state.mode == GameProgressState.Mode.Debugging &&
            state.status == GameProgressState.Status.PUZZLE;
    }

    // Wire this to onPlayerInteract in the Inspector.
    public void OpenPuzzle()
    {
        DebugPuzzleManager.Instance.ShowPuzzle(GameProgressState.CurrentState.room);
    }
}
