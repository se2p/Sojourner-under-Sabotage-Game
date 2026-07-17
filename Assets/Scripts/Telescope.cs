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

    [SerializeField, TextArea, Tooltip("Lines shown when scanning the planet. The last line is typically the robot saying to use the teleporter. Leave empty for no extra dialogue.")]
    private List<string> scanDialogue = new();

    [SerializeField, Tooltip("Optional fullscreen scan image, path relative to the OneJS img folder (e.g. \"scan/planet_1.png\"). Shown while the scan dialogue plays, hidden when it ends. Leave empty for no image.")]
    private string scanImage = "";

    [SerializeField, Tooltip("The departure teleporter that becomes usable once the planet was scanned.")]
    private Teleporter teleporterToActivate;

    private InteractableWorldObject _interactable;

    // In the DOOR beat there's an intro dialogue (robot explains the planet); the telescope stays
    // locked until the player has talked to the robot, i.e. that dialogue has finished.
    private bool _waitingForIntro;

    private void Start()
    {
        _interactable = GetComponent<InteractableWorldObject>();
        _interactable.IsEnabled = false;
        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
        _interactable.onPlayerInteract.AddListener(Scan);
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnDialogueFinished += HandleDialogueFinished;
    }

    private void OnDestroy()
    {
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnDialogueFinished -= HandleDialogueFinished;
    }

    private void HandleGameProgressionChanged(GameProgressState state)
    {
        var inDoorBeat = state.mode == GameProgressState.Mode.Debugging
                         && state.status == GameProgressState.Status.DOOR
                         && state.room == roomId;

        // If this beat has an intro dialogue, keep the telescope locked until the player has
        // talked to the robot (HandleDialogueFinished unlocks it). Without an intro, enable now.
        if (inDoorBeat && DialogueSystem.Instance != null && DialogueSystem.Instance.HasDialogueFor(state))
        {
            _waitingForIntro = true;
            SetInteractable(false);
        }
        else
        {
            _waitingForIntro = false;
            SetInteractable(inDoorBeat);
        }
    }

    // Fires when any dialogue finishes; only act while we're waiting on this room's intro.
    private void HandleDialogueFinished()
    {
        if (!_waitingForIntro) return;
        _waitingForIntro = false;
        SetInteractable(true);
    }

    private void SetInteractable(bool on)
    {
        _interactable.IsEnabled = on;
        if (_interactable.interactionIndicator == null) return;
        if (on) _interactable.interactionIndicator.Show();
        else _interactable.interactionIndicator.Hide();
    }

    // Wired to onPlayerInteract; InteractableWorldObject already set IsEnabled = false before invoking.
    private void Scan()
    {
        // The fullscreen planet image appears together with the scan text...
        if (!string.IsNullOrEmpty(scanImage) && ScanDisplay.Instance != null)
        {
            ScanDisplay.Instance.Show(scanImage);
        }

        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();

        if (scanDialogue.Count > 0 && DialogueSystem.Instance != null)
        {
            // ...and only once the scan dialogue (last line: "let's use the teleporter")
            // finishes do we close the image and unlock the departure teleporter.
            DialogueSystem.Instance.OnExternalDialogueFinished += OnScanDialogueFinished;
            DialogueSystem.Instance.PlayExternalDialogue(scanDialogue);
        }
        else
        {
            // No dialogue to wait for: finish the scan immediately.
            FinishScan();
        }
    }

    private void OnScanDialogueFinished()
    {
        DialogueSystem.Instance.OnExternalDialogueFinished -= OnScanDialogueFinished;
        FinishScan();
    }

    private void FinishScan()
    {
        if (ScanDisplay.Instance != null) ScanDisplay.Instance.Hide();
        if (teleporterToActivate != null) teleporterToActivate.Activate();
    }

    private void OnDisable()
    {
        // Avoid a dangling subscription if the telescope is disabled mid-scan.
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnExternalDialogueFinished -= OnScanDialogueFinished;
    }
}
