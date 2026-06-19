using UnityEngine;

/// <summary>
/// Moves the player (and companion) to a target position on interaction. In the
/// debug strand the teleporter replaces the testing strand's door mini-game:
///
///   * <see cref="Kind.Departure"/> sits on the ship and is the room's "door":
///     it is unlocked by the <see cref="Telescope"/> after the planet was scanned,
///     teleports the player to the planet area and reports the room as unlocked so
///     the server advances DOOR -> TALK (<see cref="StompEventDelegation.OnRoomUnlocked"/>).
///   * <see cref="Kind.Return"/> is the portal on the planet that only appears once
///     the room's component has been fixed (<see cref="EventManager.onComponentFixed"/>)
///     and teleports the player back to the ship. It never reports a room unlock.
/// </summary>
[RequireComponent(typeof(InteractableWorldObject))]
public class Teleporter : MonoBehaviour
{
    public enum Kind { Departure, Return }

    [SerializeField] private Kind kind = Kind.Departure;

    [SerializeField, Tooltip("Where the player (and companion) are moved to on interact.")]
    private Transform target;

    [SerializeField, Tooltip("Debug-strand roomId this teleporter belongs to.")]
    private int roomId = 1;

    [SerializeField, Tooltip("Departure only: report this room as unlocked so the server advances DOOR -> TALK.")]
    private bool sendRoomUnlock = true;

    [SerializeField, Tooltip("Return only: optional filter. If set, the portal only appears when the fixed component matches.")]
    private string componentName = "";

    private InteractableWorldObject _interactable;

    private void Start()
    {
        _interactable = GetComponent<InteractableWorldObject>();
        _interactable.IsEnabled = false;
        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
        _interactable.onPlayerInteract.AddListener(Teleport);

        if (kind == Kind.Return)
        {
            // The way back only opens once the room's bug has been fixed.
            EventManager.Instance.onComponentFixed.AddListener(HandleComponentFixed);
        }
        // Departure teleporters are activated by the Telescope, not directly by a status.
    }

    private void HandleComponentFixed(ComponentBehaviour c)
    {
        if (!string.IsNullOrEmpty(componentName) && c != null && c.componentName != componentName) return;
        Activate();
    }

    /// <summary>Make the teleporter interactable (called by <see cref="Telescope"/> for departures).</summary>
    public void Activate()
    {
        _interactable.IsEnabled = true;
        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Show();
    }

    // Wired to onPlayerInteract; InteractableWorldObject already set IsEnabled = false before invoking.
    private void Teleport()
    {
        if (target != null)
        {
            var player = FindObjectOfType<PlayerController>();
            var companion = FindObjectOfType<CustomFollowerAI>();
            if (player != null) player.transform.position = target.position;
            if (companion != null) companion.transform.position = target.position;
        }

        if (kind == Kind.Departure && sendRoomUnlock)
        {
            StompEventDelegation.OnRoomUnlocked(roomId);
        }

        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
    }
}
