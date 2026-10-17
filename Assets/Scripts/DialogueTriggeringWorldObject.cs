using System;
using System.Collections.Generic;
using UnityEngine;

[RequireComponent(typeof(InteractableWorldObject))]
public class DialogueTriggeringWorldObject : MonoBehaviour
{
    [SerializeField] private int roomId;
    [SerializeField, Tooltip("Mode this object belongs to. Testing keeps the original behaviour.")]
    private GameProgressState.Mode mode = GameProgressState.Mode.Testing;
    [SerializeField, Tooltip("Status (in the matching room/mode) at which the object becomes interactable. Debug-strand planet flavor objects typically use TALK.")]
    private GameProgressState.Status enableOnStatus = GameProgressState.Status.TESTS_ACTIVE;
    [SerializeField, TextArea] private List<String> dialogue = new();
    private InteractableWorldObject _interactableWorldObject;

    public void Start()
    {
        _interactableWorldObject = GetComponent<InteractableWorldObject>();
        _interactableWorldObject.interactionIndicator.Hide();
        _interactableWorldObject.IsEnabled = false;
        
        if (dialogue.Count > 0)
        {
            _interactableWorldObject.onPlayerInteract.AddListener(TriggerDialogue);
        }
        
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
    }

    private void HandleGameProgressionChanged(GameProgressState p)
    {
        if (p.room == roomId && p.mode == mode && p.status == enableOnStatus)
        {
            _interactableWorldObject.IsEnabled = true;
            if (_interactableWorldObject.interactionIndicator != null)
                _interactableWorldObject.interactionIndicator.Show();
        }
    }

    private void TriggerDialogue()
    {
        if (dialogue.Count > 0)
        {
            if (DialogueSystem.Instance.IsDialoguePlaying)
            {
                _interactableWorldObject.IsEnabled = true;
                return;
            }
            
            DialogueSystem.Instance.PlayExternalDialogue(dialogue);
            var ii = _interactableWorldObject.interactionIndicator;
            if (ii != null)
            {
                _interactableWorldObject.interactionIndicator = null;
                Destroy(ii.gameObject);
            }
        }
    }
}
