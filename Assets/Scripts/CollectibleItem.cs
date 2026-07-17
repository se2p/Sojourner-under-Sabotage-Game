using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// An item (tablet/plant/elixir) found in a debug-strand temple's discovery chamber.
/// Picking it up repaints one or more tiles (see <see cref="TileChange"/>, e.g. swapping a
/// "table with tablet" tile for an empty table) and activates the room's Return
/// <see cref="Teleporter"/> (<see cref="returnTeleporter"/>) - the call
/// <see cref="PuzzleStation.OnRoundSolved"/> defers when its deferPuzzleSolvedUntilItemCollected
/// flag is set, so nothing is reported to the server yet. The teleporter itself only reports the
/// puzzle solved (PUZZLE -> DEBUGGING) once the player actually steps through it, so the
/// DEBUGGING-status dialogue plays back on the ship, not still in the temple.
/// </summary>
[RequireComponent(typeof(InteractableWorldObject))]
public class CollectibleItem : MonoBehaviour
{
    [SerializeField, Tooltip("Tiles to repaint once picked up (e.g. the table the item sits on turning empty). Add one entry per tile that should change.")]
    private List<TileChange> tilesOnPickup = new();

    [SerializeField, TextArea, Tooltip("Flavor lines played when the item is picked up. Leave empty for no dialogue.")]
    private List<string> pickupDialogue = new();

    [SerializeField, Tooltip("Return teleporter to activate once this item is picked up. Leave empty to fall back to reporting the puzzle solved immediately on pickup (old behaviour).")]
    private Teleporter returnTeleporter;

    private bool _collected;

    private void Start()
    {
        GetComponent<InteractableWorldObject>().onPlayerInteract.AddListener(Collect);
    }

    private void Collect()
    {
        if (_collected) return;
        _collected = true;

        foreach (var change in tilesOnPickup) change.Apply();
        gameObject.SetActive(false);

        if (pickupDialogue.Count > 0 && DialogueSystem.Instance != null)
            DialogueSystem.Instance.PlayExternalDialogue(pickupDialogue);

        if (returnTeleporter != null) returnTeleporter.Activate();
        else StompEventDelegation.OnPuzzleSolved();
    }
}
