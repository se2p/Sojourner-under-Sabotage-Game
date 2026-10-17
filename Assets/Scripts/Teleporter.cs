using System.Collections.Generic;
using CreativeSpore.RpgMapEditor;
using UnityEngine;

/// <summary>
/// Moves the player (and companion) to a target position on interaction. In the
/// debug strand the teleporter replaces the testing strand's door mini-game:
///
///   * <see cref="Kind.Departure"/> sits on the ship and is the room's "door":
///     it is unlocked by the <see cref="Telescope"/> after the planet was scanned,
///     teleports the player to the planet area and reports the room as unlocked so
///     the server advances DOOR -> TALK (<see cref="StompEventDelegation.OnRoomUnlocked"/>).
///   * <see cref="Kind.Transit"/> is a plain "door": it self-enables at
///     <see cref="enableOnStatus"/> and teleports between two areas of the same room
///     (planet outside -> temple). It never reports a room unlock. With
///     <see cref="triggerOnWalkOver"/> it fires automatically as soon as the player
///     walks onto it, instead of requiring an interact key press. The temple entrance
///     is a transit enabled at TALK with <see cref="sendTempleEntered"/>: entering
///     reports a <c>TempleEnteredEvent</c> so the server advances TALK -> PUZZLE
///     (TALK = planet outside, PUZZLE = inside the temple; the status-filtered
///     <see cref="SpawnPosition"/>s respawn the player on the matching side).
///     <see cref="waitForIntroDialogue"/> keeps it locked until the arrival dialogue
///     was talked through (same gating as the telescope).
///   * <see cref="Kind.Return"/> is the portal in the temple that teleports the player
///     back to the ship. By default (<see cref="ReturnTrigger.ItemCollected"/>) it stays
///     hidden until a <see cref="CollectibleItem"/> in the discovery chamber calls
///     <see cref="Activate"/> directly - the server only advances PUZZLE -> DEBUGGING once
///     the player actually steps through the portal (<see cref="DoTeleport"/> sends
///     <see cref="StompEventDelegation.OnPuzzleSolved"/>), so the DEBUGGING-status dialogue
///     plays back on the ship, not still in the temple. <see cref="ReturnTrigger.PuzzleSolved"/>
///     keeps the old behaviour for stations without a collectible item: appear as soon as the
///     server pushes DEBUGGING. <see cref="ReturnTrigger.ComponentFixed"/> only appears once
///     the component has been fixed. It never reports a room unlock.
/// </summary>
[RequireComponent(typeof(InteractableWorldObject))]
public class Teleporter : MonoBehaviour
{
    public enum Kind { Departure, Transit, Return }

    [SerializeField] private Kind kind = Kind.Departure;

    [SerializeField, Tooltip("Where the player (and companion) are moved to on interact.")]
    private Transform target;

    [SerializeField, Tooltip("Debug-strand roomId this teleporter belongs to.")]
    private int roomId = 1;

    [SerializeField, Tooltip("Departure only: report this room as unlocked so the server advances DOOR -> TALK.")]
    private bool sendRoomUnlock = true;

    [SerializeField, Tooltip("Departure only: self-activate on the room's DOOR beat (after the intro dialogue, if any) instead of waiting for a Telescope. Use in rooms without a telescope (room 2+).")]
    private bool activateWithoutTelescope;

    [SerializeField, Tooltip("Transit only: status (mode=Debugging, matching roomId) at which this door becomes usable.")]
    private GameProgressState.Status enableOnStatus = GameProgressState.Status.PUZZLE;

    [SerializeField, Tooltip("If true, the teleporter triggers automatically when the player walks onto it (onPlayerEnter) instead of needing an interact key press. Keep 'distanceFromPlayerToTrigger' on the InteractableWorldObject small (~0.5) for tile-precise triggering.")]
    private bool triggerOnWalkOver;

    [SerializeField, Tooltip("Transit only: report a TempleEnteredEvent on teleport so the server advances TALK -> PUZZLE. Set on the planet -> temple entrance (enableOnStatus = TALK).")]
    private bool sendTempleEntered;

    [SerializeField, Tooltip("Transit only: if the enabling beat has a dialogue, stay locked until the player has talked it through (same gating as the Telescope). Only use when the dialogue plays in the same area as this door.")]
    private bool waitForIntroDialogue;

    [SerializeField, Tooltip("Return only: optional filter. If set, the portal only appears for this component.")]
    private string componentName = "";

    [SerializeField, Tooltip("Tiles to repaint when the teleporter is activated, e.g. painting the portal onto the empty floor it was hidden under. Add one entry per tile. Leave empty if the tile is painted into the map from the start.")]
    private List<TileChange> tilesOnActivate = new();

    public enum ReturnTrigger { ItemCollected, PuzzleSolved, ComponentFixed }

    [SerializeField, Tooltip("Return only: when the way back appears. ItemCollected (default) = a CollectibleItem in the discovery chamber calls Activate() directly once picked up; the PUZZLE -> DEBUGGING status switch then fires on teleport use, not on pickup. PuzzleSolved = appear as soon as the server pushes DEBUGGING (for stations without a collectible item). ComponentFixed = only after the room's component is fixed.")]
    private ReturnTrigger returnTrigger = ReturnTrigger.ItemCollected;

    private InteractableWorldObject _interactable;
    private PlayerController _player;
    private CustomFollowerAI _companion;
    private FollowObjectBehaviour _cameraFollow;

    // Self-activating departures mirror the Telescope: stay locked until the DOOR beat's
    // intro dialogue (robot announces the next planet) has been talked through.
    private bool _waitingForIntro;

    private void Start()
    {
        _interactable = GetComponent<InteractableWorldObject>();
        _player = FindObjectOfType<PlayerController>();
        _companion = FindObjectOfType<CustomFollowerAI>();
        _cameraFollow = FindObjectOfType<FollowObjectBehaviour>();
        _interactable.IsEnabled = false;
        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
        // Walk-over: trigger on proximity (onPlayerEnter) instead of the interact key.
        if (triggerOnWalkOver) _interactable.onPlayerEnter.AddListener(TryAutoTeleport);
        else _interactable.onPlayerInteract.AddListener(Teleport);

        switch (kind)
        {
            case Kind.Transit:
                // A plain door inside the room: enabled by status, not by another object.
                EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
                if (waitForIntroDialogue && DialogueSystem.Instance != null)
                    DialogueSystem.Instance.OnDialogueFinished += HandleDialogueFinished;
                break;
            case Kind.Return:
                // ItemCollected (default): no auto-listener - a CollectibleItem calls Activate()
                // directly once picked up, and DoTeleport reports the puzzle solved on actual use.
                if (returnTrigger == ReturnTrigger.ComponentFixed)
                    EventManager.Instance.onComponentFixed.AddListener(HandleComponentFixed);
                else if (returnTrigger == ReturnTrigger.PuzzleSolved)
                    EventManager.Instance.onGameProgressionChanged.AddListener(HandleReturnBeat);
                break;
            case Kind.Departure:
                // Normally activated by the Telescope (room 1). Without one, self-activate
                // on the DOOR beat once the intro dialogue has finished.
                if (activateWithoutTelescope)
                {
                    EventManager.Instance.onGameProgressionChanged.AddListener(HandleDoorBeat);
                    if (DialogueSystem.Instance != null)
                        DialogueSystem.Instance.OnDialogueFinished += HandleDialogueFinished;
                }
                break;
        }
    }

    private void OnDestroy()
    {
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnDialogueFinished -= HandleDialogueFinished;
        if (EventManager.Instance == null) return;
        switch (kind)
        {
            case Kind.Transit:
                EventManager.Instance.onGameProgressionChanged.RemoveListener(HandleGameProgressionChanged);
                break;
            case Kind.Return:
                if (returnTrigger == ReturnTrigger.ComponentFixed)
                    EventManager.Instance.onComponentFixed.RemoveListener(HandleComponentFixed);
                else if (returnTrigger == ReturnTrigger.PuzzleSolved)
                    EventManager.Instance.onGameProgressionChanged.RemoveListener(HandleReturnBeat);
                break;
            case Kind.Departure:
                if (activateWithoutTelescope)
                    EventManager.Instance.onGameProgressionChanged.RemoveListener(HandleDoorBeat);
                break;
        }
    }

    private void HandleDoorBeat(GameProgressState state)
    {
        var inDoorBeat = state.mode == GameProgressState.Mode.Debugging
                         && state.room == roomId
                         && state.status == GameProgressState.Status.DOOR;
        SetEnabledAfterIntro(inDoorBeat, state);
    }

    // If the enabling beat has an intro dialogue, keep the teleporter locked until the
    // player has talked to the robot (HandleDialogueFinished unlocks it).
    private void SetEnabledAfterIntro(bool match, GameProgressState state)
    {
        if (match && DialogueSystem.Instance != null && DialogueSystem.Instance.HasDialogueFor(state))
        {
            _waitingForIntro = true;
            SetEnabled(false);
        }
        else
        {
            _waitingForIntro = false;
            SetEnabled(match);
        }
    }

    // Fires when any dialogue finishes; only act while waiting on this room's intro.
    private void HandleDialogueFinished()
    {
        if (!_waitingForIntro) return;
        _waitingForIntro = false;
        SetEnabled(true);
    }

    private void HandleGameProgressionChanged(GameProgressState state)
    {
        var match = state.mode == GameProgressState.Mode.Debugging
                    && state.room == roomId
                    && state.status == enableOnStatus;
        if (waitForIntroDialogue) SetEnabledAfterIntro(match, state);
        else SetEnabled(match);
    }

    private void SetEnabled(bool on)
    {
        _interactable.IsEnabled = on;
        // Paint the portal in as it becomes usable, so it is never visible while locked.
        if (on) foreach (var change in tilesOnActivate) change.Apply();
        if (_interactable.interactionIndicator == null) return;
        if (on) _interactable.interactionIndicator.Show();
        else _interactable.interactionIndicator.Hide();
    }

    private void HandleComponentFixed(ComponentBehaviour c)
    {
        if (!string.IsNullOrEmpty(componentName) && c != null && c.componentName != componentName) return;
        Activate();
    }

    // Return + PuzzleSolved: the portal appears the moment the puzzle is solved (the server
    // advanced PUZZLE -> DEBUGGING for this room), sending the player back to the ship to
    // debug the component there.
    private void HandleReturnBeat(GameProgressState state)
    {
        var appear = state.mode == GameProgressState.Mode.Debugging
                     && state.room == roomId
                     && state.status == GameProgressState.Status.DEBUGGING
                     && (string.IsNullOrEmpty(componentName) || state.componentName == componentName);
        if (appear) Activate();
    }

    /// <summary>Make the teleporter interactable (called by <see cref="Telescope"/> for departures).</summary>
    public void Activate()
    {
        SetEnabled(true);
    }

    // Walk-over path: onPlayerEnter fires on proximity regardless of IsEnabled (unlike the interact
    // path, which gates on it and clears it). So check IsEnabled here and clear it to avoid retriggering
    // during the fade / before the player has left the tile.
    private void TryAutoTeleport()
    {
        if (!_interactable.IsEnabled) return;
        _interactable.IsEnabled = false;
        Teleport();
    }

    // Wired to onPlayerInteract; InteractableWorldObject already set IsEnabled = false before invoking.
    private void Teleport()
    {
        // Hide the reposition behind a fade-out / fade-in so the jump isn't jarring.
        ScreenFader.Instance.FadeOutIn(DoTeleport);
    }

    // Runs while the screen is fully black.
    private void DoTeleport()
    {
        if (target != null)
        {
            if (_player != null) MoveActor(_player.gameObject, target.position);
            if (_companion != null)
            {
                MoveActor(_companion.gameObject, target.position);
                _companion.ResetAfterTeleport();
            }

            // Snap the camera onto the player while the screen is black, otherwise
            // its SmoothDamp follow visibly catches up after the fade-in.
            if (_cameraFollow != null) _cameraFollow.SnapToTarget();
        }

        if (kind == Kind.Departure && sendRoomUnlock)
        {
            StompEventDelegation.OnRoomUnlocked(roomId);
        }

        // Temple entrance: tell the server the player is inside (TALK -> PUZZLE).
        if (kind == Kind.Transit && sendTempleEntered)
        {
            StompEventDelegation.OnTempleEntered();
        }

        // Return via ItemCollected: the puzzle is only reported solved (PUZZLE -> DEBUGGING)
        // once the player actually steps through the portal, so the DEBUGGING-status dialogue
        // plays back on the ship instead of still in the temple.
        if (kind == Kind.Return && returnTrigger == ReturnTrigger.ItemCollected)
        {
            StompEventDelegation.OnPuzzleSolved();
        }

        if (_interactable.interactionIndicator != null) _interactable.interactionIndicator.Hide();
    }

    // Teleport via PhysicCharBehaviour so the previous-position used by collision is
    // reset and any residual movement is cleared - otherwise the actor keeps drifting
    // from the new spot for a few frames (and the camera follows that drift).
    private static void MoveActor(GameObject actor, Vector3 position)
    {
        var phys = actor.GetComponent<PhysicCharBehaviour>();
        if (phys != null)
        {
            phys.Dir = Vector3.zero;
            phys.TeleportTo(position);
        }
        else
        {
            actor.transform.position = position;
        }
    }
}
