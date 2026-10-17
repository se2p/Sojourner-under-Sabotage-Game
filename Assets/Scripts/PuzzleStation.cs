using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// One puzzle station = one puzzle area of the debug strand. Opening it plays all of the area's
/// difficulty rounds back-to-back in one sitting inside the OneJS overlay (see debugpuzzle.tsx and the
/// per-room *Puzzle wrappers); only finishing the last round reports the area solved to the server
/// (PUZZLE -> DEBUGGING). The station enables on status PUZZLE.
/// </summary>
[RequireComponent(typeof(InteractableWorldObject))]
public class PuzzleStation : MonoBehaviour
{
    [SerializeField, Tooltip("Opened immediately when solved, instead of waiting for the server's DEBUGGING push (needed when deferPuzzleSolvedUntilItemCollected is set, since status won't reach DEBUGGING until the item is picked up).")]
    private HiddenSectionReveal chamberReveal;

    [SerializeField, Tooltip("If true, don't report PUZZLE solved yet - a CollectibleItem in the revealed chamber activates the Return teleporter instead, and that teleporter reports PUZZLE solved once the player actually steps through it. Status stays PUZZLE until then.")]
    private bool deferPuzzleSolvedUntilItemCollected;

    [SerializeField, TextArea, Tooltip("Flavor lines played immediately when this station is solved and the chamber opens (before the server status changes) - e.g. telling the player to go look at the back of the room. Leave empty for no dialogue.")]
    private List<string> revealDialogue = new();

    private InteractableWorldObject _interactable;
    private bool _solved;

    // Stays locked until the room's PUZZLE-beat intro dialogue (if any) has been talked
    // through, same gating as Telescope/Teleporter's waitForIntroDialogue.
    private bool _waitingForIntro;

    private void Start()
    {
        _interactable = GetComponent<InteractableWorldObject>();
        _interactable.IsEnabled = false;
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnDialogueFinished += HandleDialogueFinished;
    }

    private void OnDestroy()
    {
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnDialogueFinished -= HandleDialogueFinished;
        if (EventManager.Instance != null)
            EventManager.Instance.onGameProgressionChanged.RemoveListener(HandleGameProgressionChanged);
    }

    private void HandleGameProgressionChanged(GameProgressState state)
    {
        if (_solved) return; // gelöste Station bleibt deaktiviert (auch bei erneutem Re-Push)
        var match = state.mode == GameProgressState.Mode.Debugging &&
                    state.status == GameProgressState.Status.PUZZLE;
        if (match && DialogueSystem.Instance != null && DialogueSystem.Instance.HasDialogueFor(state))
        {
            _waitingForIntro = true;
            _interactable.IsEnabled = false;
        }
        else
        {
            _waitingForIntro = false;
            _interactable.IsEnabled = match;
        }
    }

    // Fires when any dialogue finishes; only act while waiting on this station's intro.
    private void HandleDialogueFinished()
    {
        if (!_waitingForIntro || _solved) return;
        _waitingForIntro = false;
        _interactable.IsEnabled = true;
    }

    // Wire this to onPlayerInteract in the Inspector.
    public void OpenPuzzle()
    {
        DebugPuzzleManager.Instance.ShowPuzzle(GameProgressState.CurrentState.room, 1, this);
    }

    // Vom DebugPuzzleManager aufgerufen, wenn alle Runden des Bereichs (in der Sitzung) gelöst sind.
    public void OnRoundSolved()
    {
        _solved = true;
        _interactable.IsEnabled = false; // Bereich erledigt -> Station verbraucht
        if (chamberReveal != null) chamberReveal.Reveal();
        if (revealDialogue.Count > 0 && DialogueSystem.Instance != null)
            DialogueSystem.Instance.PlayExternalDialogue(revealDialogue);
        if (!deferPuzzleSolvedUntilItemCollected)
            StompEventDelegation.OnPuzzleSolved();
    }
}
