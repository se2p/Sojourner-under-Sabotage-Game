using System;
using System.Collections;
using System.Collections.Generic;
using CreativeSpore.RpgMapEditor;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.SceneManagement;

public class EventManager : MonoBehaviour
{
    public UnityEvent<ComponentBehaviour> onMutatedComponentTestsFailed;
    public UnityEvent<ComponentBehaviour> onComponentDestroyed;
    public UnityEvent<GameProgressState> onGameProgressionChanged;
    public UnityEvent<ComponentBehaviour> onComponentFixed;

    public static EventManager Instance => _instance;
    private static EventManager _instance;
    private static GameProgressState _pendingStateAfterSwitch;
    public readonly Dictionary<string, ComponentBehaviour> Components = new();

    [SerializeField] private string DemoComponentName = "CryoSleep";
    [SerializeField, TextArea] private string OnGameProgressionChangedJson = "{\"id\":1,\"room\":1,\"componentName\":\"Demo\",\"stage\":1,\"status\":\"TEST\"}";
    [SerializeField] private GameProgressState.Mode sceneMode = GameProgressState.Mode.Testing;

    [SerializeField, Tooltip("Debug strand only: how long the fade-in from black takes once the camera has caught up to the spawn position.")]
    private float sceneLoadFadeInDuration = 0.35f;

    private void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
        }
        else
        {
            Debug.LogError("There is already an EventManager instance in the scene!");
        }

        // A puzzle/dialogue interrupted by a scene reload (e.g. a server-driven mode switch
        // while DebugPuzzleManager had paused the game) would otherwise leave Time.timeScale
        // at 0 forever, since it's a global engine setting that survives SceneManager.LoadScene.
        Time.timeScale = 1;
    }

    public void Start()
    {
        // Debug strand only: the player's spawn position is only known once the first
        // GameProgressState arrives (SpawnPosition repositions on that same event), so a
        // freshly (re)loaded Debug scene would otherwise flash the camera settling into
        // place. Keep the screen black until that has happened.
        if (sceneMode == GameProgressState.Mode.Debugging)
        {
            ScreenFader.Instance.SetBlackImmediate();
            onGameProgressionChanged.AddListener(HandleFirstStateForCameraCatchUp);
        }

        foreach (var c in FindObjectsByType<ComponentBehaviour>(FindObjectsInactive.Include, FindObjectsSortMode.None))
        {
            Components.Add(c.componentName, c);
        }

        StompEventDelegation.OnGameStarted();

        if (_pendingStateAfterSwitch != null && _pendingStateAfterSwitch.mode == sceneMode)
        {
            var pending = _pendingStateAfterSwitch;
            _pendingStateAfterSwitch = null;
            StartCoroutine(ApplyStateNextFrame(pending));
        }
    }

    private void HandleFirstStateForCameraCatchUp(GameProgressState _)
    {
        onGameProgressionChanged.RemoveListener(HandleFirstStateForCameraCatchUp);
        StartCoroutine(SnapCameraThenFadeIn());
    }

    private IEnumerator SnapCameraThenFadeIn()
    {
        yield return null; // let SpawnPosition's own listener move the player first
        var follow = FindObjectOfType<FollowObjectBehaviour>();
        if (follow != null) follow.SnapToTarget();
        ScreenFader.Instance.FadeIn(sceneLoadFadeInDuration);
    }

    private IEnumerator ApplyStateNextFrame(GameProgressState state)
    {
        yield return null;
        ApplyState(state);
    }

    public void OnMutatedComponentTestsFailed(string componentName)
    {
        Debug.Log("Mutated component tests failed");
        onMutatedComponentTestsFailed?.Invoke(Components[componentName]);
    }

    [ContextMenu("OnMutatedComponentTestsFailed [Demo]")]
    public void TriggerDemoAlarm()
    {
        OnMutatedComponentTestsFailed(DemoComponentName);
    }
    
    public void OnComponentDestroyed(string componentName)
    {
        Debug.Log("Component "+componentName+" destroyed");
        onComponentDestroyed?.Invoke(Components[componentName]);
    }
    
    [ContextMenu("OnComponentDestroyed [Demo]")]
    public void TriggerDemoComponentDestroyed()
    {
        OnComponentDestroyed(DemoComponentName);
    }
    
    [ContextMenu("OnComponentFixed [Demo]")]
    public void TriggerDemoComponentFixed()
    {
        OnComponentFixed(DemoComponentName);
    }
    
    public void OnGameProgressionChanged(string json)
    {
        var unityJson = GameProgressState.ReplaceStatusStringWithInt(json);
        var gameProgressState = JsonUtility.FromJson<GameProgressState>(unityJson);
        GameProgressState.CurrentState = gameProgressState;
        if(gameProgressState.mode != sceneMode)
        {
            Debug.Log("Mode switched");
            _pendingStateAfterSwitch = gameProgressState;
            SceneManager.LoadScene(gameProgressState.mode == GameProgressState.Mode.Debugging ? "Debug" : "Game");
            return;
        }

        ApplyState(gameProgressState);
    }

    private void ApplyState(GameProgressState gameProgressState)
    {
        var component = Components[gameProgressState.componentName];
        if (component.RoomId >= 0 && component.RoomId != gameProgressState.room)
        {
            Debug.LogWarning($"GameProgressState.room ({gameProgressState.room}) doesn't match the room " +
                              $"componentName \"{gameProgressState.componentName}\" is registered for ({component.RoomId}). " +
                              "Dialogue will be picked for the state's room, but this componentName's interaction will be toggled instead - check the pushed JSON.");
        }
        onGameProgressionChanged?.Invoke(gameProgressState);
        component.HandleGameProgressionChanged(gameProgressState);
    }
    
    [ContextMenu("OnGameProgressionChanged [JSON]")]
    public void TriggerGameProgressionChanged()
    {
        OnGameProgressionChanged(OnGameProgressionChangedJson);
    }
    
    public void OnComponentFixed(string componentName)
    {
        var c = Components[componentName];
        c.HandleComponentFixed();
        onComponentFixed?.Invoke(c);
    }
}
