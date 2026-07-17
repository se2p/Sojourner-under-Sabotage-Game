using System;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.SceneManagement;

public class GameBootstrap : MonoBehaviour
{
#if !UNITY_EDITOR && UNITY_WEBGL
    [DllImport("__Internal")]
    private static extern string GetGameMode();
#endif

    [SerializeField] private GameProgressState.Mode editorDefaultMode = GameProgressState.Mode.Testing;

    private void Start()
    {
        var mode = editorDefaultMode;

#if !UNITY_EDITOR && UNITY_WEBGL
        var raw = GetGameMode();
        if (!string.IsNullOrEmpty(raw) && Enum.TryParse(raw, out GameProgressState.Mode parsed))
        {
            mode = parsed;
        }
#endif

        SceneManager.LoadScene(mode == GameProgressState.Mode.Debugging ? "Debug" : "Game");
    }
}
