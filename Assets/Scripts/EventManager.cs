using System;
using System.Collections;
using System.Collections.Generic;
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
    }

    public void Start()
    {
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
