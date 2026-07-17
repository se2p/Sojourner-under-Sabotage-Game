using CreativeSpore.RpgMapEditor;
using UnityEngine;

/// <summary>
/// One tile repaint, same convention as the tile swaps in Door.cs/HiddenSectionReveal.cs.
/// Used wherever more than one tile needs to change at once (e.g. CollectibleItem,
/// ComponentBehaviour's item placement) - add one entry per tile that should change.
/// </summary>
[System.Serializable]
public class TileChange
{
    [Tooltip("World position of the tile to repaint.")]
    public Transform tile;

    [Tooltip("Tile id to paint at this position.")]
    public int tileId;

    [Tooltip("Tilemap layer the tile sits on.")]
    public int layer;

    public void Apply()
    {
        if (tile == null) return;
        RpgMapHelper.SetAutoTileByPosition(tile.position, tileId, layer);
    }
}
