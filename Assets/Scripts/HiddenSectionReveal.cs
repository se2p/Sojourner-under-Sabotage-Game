using CreativeSpore.RpgMapEditor;
using DG.Tweening;
using UnityEngine;

/// <summary>
/// Opens the hidden temple section once the room's delta-debugging puzzle has been solved. Puzzle
/// solve makes the server advance PUZZLE -> DEBUGGING, so this reveal keys on the DEBUGGING status of
/// its debug-strand room: it removes the blocking tile (mirrors <see cref="Door.Open"/>'s tile swap;
/// collision lives on a Ground layer, layer 2 by default — see the RPG Map Editor collision note in
/// CLAUDE.md) and slides the wall itself out of the way, the same scale+move tween
/// <see cref="HorizontalDoor"/> uses for room doors.
/// </summary>
public class HiddenSectionReveal : MonoBehaviour
{
    private const float SlideDuration = 1f;

    [SerializeField, Tooltip("Debug-strand roomId this reveal belongs to.")]
    private int roomId = 1;

    [SerializeField, Tooltip("World position of the bottom-left blocking tile to remove. Defaults to this object's position.")]
    private Transform blockingTile;

    [SerializeField, Tooltip("How many tiles wide/tall the blocking wall is. Reveal clears this whole block, starting at blockingTile's position as the bottom-left tile.")]
    private Vector2Int wallSizeInTiles = new Vector2Int(2, 2);

    [SerializeField, Tooltip("World-unit distance between adjacent tiles, per axis. Tune this in the Inspector until all tiles of the block clear correctly - it depends on this map's sprite PPU/scale, not a fixed constant.")]
    private Vector2 tileStep = new Vector2(0.32f, 0.32f);

    [SerializeField, Tooltip("Collision layer the blocking tile sits on (Door.cs uses 2).")]
    private int blockLayer = 2;

    [SerializeField, Tooltip("Tile id to paint in place of the wall. -1 (default) leaves the tile empty; set a specific tile id here only if you want a floor texture drawn instead.")]
    private int nonBlockingTileId = -1;

    [SerializeField, Tooltip("Slide to the left (-X) instead of the right (+X) when opening.")]
    private bool slideLeft = true;

    private bool _revealed;
    private Tween _scaleTween;
    private Tween _moveTween;

    private void Start()
    {
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleGameProgressionChanged);
    }

    private void OnDestroy()
    {
        _scaleTween?.Kill();
        _moveTween?.Kill();
        if (EventManager.Instance != null)
            EventManager.Instance.onGameProgressionChanged.RemoveListener(HandleGameProgressionChanged);
    }

    private void HandleGameProgressionChanged(GameProgressState state)
    {
        if (_revealed) return;
        if (state.mode == GameProgressState.Mode.Debugging
            && state.status == GameProgressState.Status.DEBUGGING
            && state.room == roomId)
        {
            Reveal();
        }
    }

    public void Reveal()
    {
        _revealed = true;

        // Clear every tile of the wall's footprint, not just one - blockingTile marks the bottom-left tile.
        var origin = (blockingTile != null ? blockingTile : transform).position;
        for (var x = 0; x < wallSizeInTiles.x; x++)
        for (var y = 0; y < wallSizeInTiles.y; y++)
        {
            var tilePos = origin + new Vector3(x * tileStep.x, y * tileStep.y, 0);
            RpgMapHelper.SetAutoTileByPosition(tilePos, nonBlockingTileId, blockLayer);
        }

        // Slide the wall itself away, mirroring HorizontalDoor.Open() (scale to 0 + move by half its width).
        // Encapsulate ALL child renderers (a 2x2 wall is several tile sprites, not one) so the width covers
        // the whole wall, not just whichever tile GetComponentInChildren happened to return first.
        var renderers = GetComponentsInChildren<Renderer>();
        var width = 1f;
        if (renderers.Length > 0)
        {
            var bounds = renderers[0].bounds;
            for (var i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            width = bounds.size.x;
        }
        var initialPosition = transform.position;
        _scaleTween = transform.DOScaleX(0, SlideDuration);
        _moveTween = transform.DOMoveX(initialPosition.x + (slideLeft ? -width / 2 : width / 2), SlideDuration);
    }
}
