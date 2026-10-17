using System;
using UnityEngine;

/// <summary>
/// Drives the fullscreen scan-image overlay (OneJS <c>scanimage.tsx</c>). During the
/// DOOR beat the ship-side <see cref="Telescope"/> shows a planet image while the scan
/// dialogue plays and hides it again once the dialogue finishes, right before the
/// departure <see cref="Teleporter"/> is unlocked.
///
/// Registered in OneJS <c>_objects</c> as <c>scanDisplay</c> (per-scene prefab override
/// on the overlay GameObject, like <see cref="DebugPuzzleManager"/>).
/// </summary>
public class ScanDisplay : MonoBehaviour
{
    public static ScanDisplay Instance => _instance;
    private static ScanDisplay _instance;

    // image = path relative to the OneJS img folder (e.g. "scan/planet_1.png");
    // scanimage.tsx prefixes it with __dirname + "/img/".
    public event Action<string> OnShowImage;
    public event Action OnHideImage;

    private void Awake()
    {
        if (_instance == null) _instance = this;
        else Debug.LogError("There is already a ScanDisplay");
    }

    public void Show(string image) => OnShowImage?.Invoke(image);

    public void Hide() => OnHideImage?.Invoke();
}
