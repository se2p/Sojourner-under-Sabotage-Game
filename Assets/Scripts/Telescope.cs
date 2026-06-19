using System;
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Ship-side telescope the player uses to scan the planet during the DOOR beat of a
/// debug-strand room. Scanning plays an optional dialogue and unlocks the room's
/// departure <see cref="Teleporter"/>, gating the trip to the planet behind this step.
/// </summary>
[RequireComponent(typeof(InteractableWorldObject))]
public class Telescope : MonoBehaviour
{
    [SerializeField, Tooltip("Debug-strand roomId this telescope belongs to.")]
    private int roomId = 1;

    [SerializeField, TextArea, Tooltip("Lines shown when scanning the planet. Leave empty for no extra dialogue.")]
    private List<string> scanDialogue = new();

    [SerializeField, Tooltip("The departure teleporter that becomes usable once the planet was scanned.")]
    private Teleporter teleporterToActivate;

    private InteractableWorldObject _interactable;

    private void Start()
    {
        _interactable = GetComponent<InteractableWorldObject>();
        _interactable.IsEnabled = false;
        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
        _interactable.onPlayerInteract.AddListener(Scan);
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
    }

    private void HandleGameProgressionChanged(GameProgressState state)
    {
        var active = state.mode == GameProgressState.Mode.Debugging
                     && state.status == GameProgressState.Status.DOOR
                     && state.room == roomId;
        _interactable.IsEnabled = active;
        if (_interactable.interactionIndicator == null) return;
        if (active) _interactable.interactionIndicator.Show();
        else _interactable.interactionIndicator.Hide();
    }

    // Wired to onPlayerInteract; InteractableWorldObject already set IsEnabled = false before invoking.
    private void Scan()
    {
        if (scanDialogue.Count > 0 && DialogueSystem.Instance != null)
        {
            DialogueSystem.Instance.PlayExternalDialogue(scanDialogue);
        }

        if (teleporterToActivate != null) teleporterToActivate.Activate();

        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
    }
}
