using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Serialization;

[RequireComponent(typeof(InteractableWorldObject))]
public class ComponentBehaviour : MonoBehaviour
{
    public string componentName;

    [SerializeField, Tooltip("Optional: the room this component belongs to, used only to sanity-check incoming GameProgressStates against a mismatched componentName. Leave at -1 to skip the check.")]
    private int roomId = -1;
    public int RoomId => roomId;

    [SerializeField, Tooltip("If true, the first interact while DEBUGGING places the item into this component instead of opening it - the debugger only opens on the interact after that.")]
    private bool requiresItemPlacement;

    [SerializeField, TextArea, Tooltip("Flavor lines played when the item is placed (first interact while requiresItemPlacement is set). Leave empty for no dialogue.")]
    private List<string> placementDialogue = new();

    [SerializeField, Tooltip("Tiles to repaint once the item is placed (e.g. the item appearing on a table, machine lights turning on, etc.). Add one entry per tile that should change.")]
    private List<TileChange> tilesOnPlacement = new();

    private InteractableWorldObject _interactableWorldObject;
    private bool _wasNeverOpened = true;
    private bool _doNotReEnableAfterEditorClose;
    private bool _itemPlaced;

    private void Start()
    {
        _interactableWorldObject = GetComponent<InteractableWorldObject>();
    }

    public void OpenComponent()
    {
        if (requiresItemPlacement && !_itemPlaced)
        {
            PlaceItem();
            return;
        }

        Debug.Log("Opening component " + componentName);
        var state = GameProgressState.CurrentState;
        if (state != null && state.status == GameProgressState.Status.DEBUGGING)
            BrowserUI.OpenDebuggerForComponent(componentName);
        else
            BrowserUI.OpenEditorsForComponent(componentName);

        _wasNeverOpened = false;
        FindObjectOfType<BrowserUI>().onEditorCloseEvent.AddListener(HandleEditorClosed);
    }

    private void PlaceItem()
    {
        _itemPlaced = true;
        foreach (var change in tilesOnPlacement) change.Apply();
        if (placementDialogue.Count > 0 && DialogueSystem.Instance != null)
        {
            // Wait for the dialogue to finish before re-enabling: the same Enter press the player
            // uses to advance the dialogue text would otherwise also re-trigger the interact and
            // open the debugger before the placement text was ever read.
            DialogueSystem.Instance.OnExternalDialogueFinished += OnPlacementDialogueFinished;
            DialogueSystem.Instance.PlayExternalDialogue(placementDialogue);
        }
        else
        {
            EnableComponentInteraction(); // IWO already disabled itself before invoking; re-enable so the next interact opens the debugger
        }
    }

    private void OnPlacementDialogueFinished()
    {
        DialogueSystem.Instance.OnExternalDialogueFinished -= OnPlacementDialogueFinished;
        EnableComponentInteraction();
    }

    private void OnDisable()
    {
        // Avoid a dangling subscription if this component is disabled mid-dialogue.
        if (DialogueSystem.Instance != null)
            DialogueSystem.Instance.OnExternalDialogueFinished -= OnPlacementDialogueFinished;
    }

    private void HandleEditorClosed()
    {
        if (!_doNotReEnableAfterEditorClose)
        {
            EnableComponentInteraction();
        }
    }

    public void DisableComponentInteraction()
    {
        _interactableWorldObject.IsEnabled = false;
        _interactableWorldObject.interactionIndicator.Hide();
        _doNotReEnableAfterEditorClose = true;
    }

    public void EnableComponentInteraction()
    {
        _interactableWorldObject.IsEnabled = true;
        _interactableWorldObject.interactionIndicator.SetVisible(_wasNeverOpened);
        _doNotReEnableAfterEditorClose = false;
    }

    public void HighlightInteraction()
    {
        _interactableWorldObject.IsEnabled = true;
        _interactableWorldObject.interactionIndicator.Show();
        _doNotReEnableAfterEditorClose = false;
    }

    public void HandleComponentFixed()
    {
        DisableComponentInteraction();
    }

    public void HandleGameProgressionChanged(GameProgressState gameProgressState)
    {
        switch (gameProgressState.status)
        {
            case GameProgressState.Status.TEST:
                EnableComponentInteraction();
                Debug.Log("Component " + gameProgressState.componentName + " enabled");
                break;
            case GameProgressState.Status.TESTS_ACTIVE:
                DisableComponentInteraction();
                Debug.Log("Component " + gameProgressState.componentName + " disabled");
                break;
            case GameProgressState.Status.DEBUGGING:
                if (DialogueSystem.Instance != null && DialogueSystem.Instance.HasDialogueToShow)
                {
                    // talk first, interact afterwards: stay disabled until the dialogue is finished
                    DisableComponentInteraction();
                    DialogueSystem.Instance.EnableAfterDialogue(this);
                    Debug.Log("Component " + gameProgressState.componentName + " waits for dialogue before debugging");
                }
                else
                {
                    EnableComponentInteraction();
                    Debug.Log("Component " + gameProgressState.componentName + " enabled for debugging");
                }
                break;
        }
    }
}
