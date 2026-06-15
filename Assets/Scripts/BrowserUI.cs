using UnityEngine;
using System.Runtime.InteropServices;
using UnityEngine.Events;
using UnityEngine.Serialization;

public class BrowserUI : MonoBehaviour
{
#if !UNITY_EDITOR && UNITY_WEBGL
    [DllImport("__Internal")]
    private static extern void OpenEditors(string componentName);

    [DllImport("__Internal")]
    private static extern void OpenDebugger(string componentName);

    [DllImport("__Internal")]
    private static extern void ToggleAlarm(bool isOn);

    [DllImport("__Internal")]
    private static extern void SetPuzzleOpen(bool open);
#endif
    
    public UnityEvent onEditorCloseEvent;

    public void Start()
    {
#if !UNITY_EDITOR && UNITY_WEBGL
    UnityEngine.WebGLInput.captureAllKeyboardInput = false;
#endif
    }
    
    public static void OpenEditorsForComponent(string componentName)
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        OpenEditors(componentName);
        Time.timeScale = 0;
#else
        Debug.Log("Not supported on this platform (needs to be the WebGL export)");
#endif
    }

    public static void OpenDebuggerForComponent(string componentName)
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        OpenDebugger(componentName);
        Time.timeScale = 0;
#else
        Debug.Log("Not supported on this platform (needs to be the WebGL export)");
#endif
    }

    public void OnEditorClose()
    {
        Debug.Log("Editor closed");
        Time.timeScale = 1;
        onEditorCloseEvent?.Invoke();
    }

    public static void DoToggleAlarm(bool isOn)
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        ToggleAlarm(isOn);
#else
        Debug.Log("Not supported on this platform (needs to be the WebGL export)");
#endif
    }

    public static void NotifyPuzzleOpen(bool open)
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        SetPuzzleOpen(open);
#else
        Debug.Log("Not supported on this platform (needs to be the WebGL export)");
#endif
    }
}
