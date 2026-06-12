using System.Collections;
using System.Collections.Generic;
using CreativeSpore.RpgMapEditor;
using UnityEngine;
using UnityEngine.Serialization;

[RequireComponent(typeof(InteractableWorldObject))]
public class ComponentBehaviour : MonoBehaviour
{
    public string componentName;
    private InteractableWorldObject _interactableWorldObject;
    private bool _wasNeverOpened = true;
    private bool _doNotReEnableAfterEditorClose;

    private void Start()
    {
        _interactableWorldObject = GetComponent<InteractableWorldObject>();
    }

    public void OpenComponent()
    {
        Debug.Log("Opening component " + componentName);
        var state = GameProgressState.CurrentState;
        if (state != null && state.status == GameProgressState.Status.DEBUGGING)
            BrowserUI.OpenDebuggerForComponent(componentName);
        else
            BrowserUI.OpenEditorsForComponent(componentName);

        _wasNeverOpened = false;
        FindObjectOfType<BrowserUI>().onEditorCloseEvent.AddListener(HandleEditorClosed);
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
