using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Plays a final dialogue once the last debug-strand room's ship component is fixed.
/// Fixing that component doesn't push a new GameProgressState (the server has no next
/// room to advance to and just publishes GameFinishedEvent to the web overlay), so this
/// can't be authored as a normal (room, stage, status, mode) DialogueEntry - it has to
/// react to EventManager.onComponentFixed directly, the same way other one-off dialogue
/// is played via DialogueSystem.PlayExternalDialogue (see Telescope.cs).
/// </summary>
public class GameEndingEpilogue : MonoBehaviour
{
    [SerializeField, Tooltip("RoomId of the final debug-strand room's ComponentBehaviour.")]
    private int finalRoomId = 4;

    [SerializeField, TextArea, Tooltip("Lines shown once the final room's component is fixed.")]
    private List<string> epilogueDialogue = new();

    private void Start()
    {
        EventManager.Instance.onComponentFixed.AddListener(HandleComponentFixed);
    }

    private void OnDestroy()
    {
        if (EventManager.Instance != null)
            EventManager.Instance.onComponentFixed.RemoveListener(HandleComponentFixed);
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnExternalDialogueFinished -= HandleEpilogueFinished;
    }

    private void HandleComponentFixed(ComponentBehaviour c)
    {
        if (c.RoomId != finalRoomId) return;

        if (epilogueDialogue.Count == 0 || DialogueSystem.Instance == null)
        {
            // Nothing to say: let the web app end the session right away.
            BrowserUI.NotifyEpilogueOver();
            return;
        }

        DialogueSystem.Instance.OnExternalDialogueFinished += HandleEpilogueFinished;
        DialogueSystem.Instance.PlayExternalDialogue(epilogueDialogue);
    }

    private void HandleEpilogueFinished()
    {
        DialogueSystem.Instance.OnExternalDialogueFinished -= HandleEpilogueFinished;
        BrowserUI.NotifyEpilogueOver();
    }
}
