using System;
using System.Collections;
using UnityEngine;

/// <summary>
/// Lazily-created, self-contained full-screen fade-to-black overlay. Needs no
/// scene/prefab wiring: the first call to <see cref="Instance"/> spawns the
/// GameObject and a 1x1 black texture is stretched over the whole screen via
/// <see cref="OnGUI"/>. Used by the debug-strand <see cref="Teleporter"/> to
/// hide the player/companion reposition behind a fade-out / fade-in.
/// </summary>
public class ScreenFader : MonoBehaviour
{
    private static ScreenFader _instance;

    public static ScreenFader Instance
    {
        get
        {
            if (_instance == null)
            {
                var go = new GameObject("ScreenFader");
                _instance = go.AddComponent<ScreenFader>();
            }
            return _instance;
        }
    }

    private Texture2D _blackTex;
    private float _alpha;

    private void Awake()
    {
        if (_instance != null && _instance != this)
        {
            Destroy(gameObject);
            return;
        }
        _instance = this;
        _blackTex = new Texture2D(1, 1);
        _blackTex.SetPixel(0, 0, Color.black);
        _blackTex.Apply();
    }

    private void OnGUI()
    {
        if (_alpha <= 0f) return;
        var prev = GUI.color;
        GUI.color = new Color(0f, 0f, 0f, _alpha);
        GUI.depth = -1000; // draw on top of other IMGUI
        GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), _blackTex);
        GUI.color = prev;
    }

    /// <summary>
    /// Fade to black, run <paramref name="atBlack"/> while the screen is fully
    /// black, then fade back in. Uses unscaled time so it still animates if game
    /// time is frozen.
    /// </summary>
    public void FadeOutIn(Action atBlack, float fadeDuration = 0.35f, float holdDuration = 0.1f)
    {
        StopAllCoroutines();
        StartCoroutine(FadeRoutine(atBlack, fadeDuration, holdDuration));
    }

    /// <summary>
    /// Forces the screen fully black right away, with no transition. Used on
    /// scene load, before the first frame is even shown, so a mismatched
    /// camera/player position never flashes into view.
    /// </summary>
    public void SetBlackImmediate()
    {
        StopAllCoroutines();
        _alpha = 1f;
    }

    /// <summary>Fades from fully black back to clear. Pair with <see cref="SetBlackImmediate"/>.</summary>
    public void FadeIn(float fadeDuration = 0.35f)
    {
        StopAllCoroutines();
        StartCoroutine(Fade(1f, 0f, fadeDuration));
    }

    private IEnumerator FadeRoutine(Action atBlack, float fadeDuration, float holdDuration)
    {
        yield return Fade(0f, 1f, fadeDuration);

        try { atBlack?.Invoke(); }
        catch (Exception e) { Debug.LogException(e); }

        if (holdDuration > 0f) yield return new WaitForSecondsRealtime(holdDuration);

        yield return Fade(1f, 0f, fadeDuration);
        _alpha = 0f;
    }

    private IEnumerator Fade(float from, float to, float duration)
    {
        if (duration <= 0f)
        {
            _alpha = to;
            yield break;
        }

        var t = 0f;
        while (t < duration)
        {
            // Clamp so a single stalled frame (e.g. right after a scene load or a
            // heavy Editor operation like a ContextMenu click) can't jump the fade
            // straight to its end value instead of animating.
            t += Mathf.Min(Time.unscaledDeltaTime, 1f / 30f);
            _alpha = Mathf.Lerp(from, to, t / duration);
            yield return null;
        }
        _alpha = to;
    }
}
