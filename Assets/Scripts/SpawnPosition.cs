using System.Collections;
using System.Collections.Generic;
using CreativeSpore.RpgMapEditor;
using UnityEngine;

public class SpawnPosition : MonoBehaviour
{
    [SerializeField] private int roomId;

    [Header("Debug strand: status-aware spawn")]
    [SerializeField, Tooltip("Match on (mode, room, status) instead of the testing strand's room-only rule. " +
                             "Use this in the Debug scene where ship/planet/temple share one room and only the " +
                             "status differs (DOOR/DEBUGGING = ship, TALK = planet, PUZZLE = temple).")]
    private bool useStatusFilter;

    [SerializeField, Tooltip("Status filter: only match while the current mode equals this (status filter only).")]
    private GameProgressState.Mode mode = GameProgressState.Mode.Debugging;

    [SerializeField, Tooltip("Status filter: reposition the player here when the loaded status is one of these.")]
    private GameProgressState.Status[] statuses;

    private void Start()
    {
        EventManager.Instance.onGameProgressionChanged.AddListener(HandleFirstGameProgressionChanged);
    }

    private void HandleFirstGameProgressionChanged(GameProgressState gps)
    {
        if (Matches(gps))
        {
            var target = transform.position;
            var player = FindObjectOfType<PlayerController>();
            var companion = FindObjectOfType<CustomFollowerAI>();
            if (player != null) player.transform.position = target;
            if (companion != null) companion.transform.position = target;
        }
        EventManager.Instance.onGameProgressionChanged.RemoveListener(HandleFirstGameProgressionChanged);
    }

    private bool Matches(GameProgressState gps)
    {
        if (useStatusFilter)
        {
            // Debug strand: ship/planet/temple share the room, so the status picks the area.
            return gps.mode == mode
                   && gps.room == roomId
                   && System.Array.IndexOf(statuses, gps.status) >= 0;
        }

        // Testing strand (unchanged): at a room's DOOR you still stand in the previous room.
        var currentRoomTarget = (gps.status == GameProgressState.Status.DOOR) ? gps.room - 1 : gps.room;
        return currentRoomTarget > 1 && currentRoomTarget == roomId;
    }
}
