using System.Collections.Generic;
using UnityEngine;
using System.Runtime.InteropServices;
using UnityEngine.Events;
using UnityEngine.Serialization;

public class StompEventDelegation : MonoBehaviour
{
#if !UNITY_EDITOR && UNITY_WEBGL
    [DllImport("__Internal")]
    private static extern void SendRoomUnlockedEvent(int roomId);
    
    [DllImport("__Internal")]
    private static extern void SendConversationFinishedEvent();
    
    [DllImport("__Internal")]
    private static extern void SendGameStartedEvent();

    [DllImport("__Internal")]
    private static extern void SendPuzzleSolvedEvent();
#endif
    
    private const string UnsupportedPlatformMessage = "Not supported on this platform (needs to be the WebGL export)";
    private static int _latestRoomUnlocked = -1;
    
    public static void OnRoomUnlocked(int roomId)
    {
        if (_latestRoomUnlocked >= roomId)
        {
            Debug.Log($"Room {roomId} already unlocked, skipping event.");
            return;
        }
        _latestRoomUnlocked = roomId;
        
#if !UNITY_EDITOR && UNITY_WEBGL
        SendRoomUnlockedEvent(roomId);
#else
        Debug.Log(UnsupportedPlatformMessage);
#endif
    }
    
    public static void OnConversationFinished()
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        SendConversationFinishedEvent();
#else
        Debug.Log(UnsupportedPlatformMessage);
    #endif
    }

    public static void OnGameStarted()
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        SendGameStartedEvent();
#else
        Debug.Log(UnsupportedPlatformMessage);
#endif
    }

    public static void OnPuzzleSolved()
    {
#if !UNITY_EDITOR && UNITY_WEBGL
        SendPuzzleSolvedEvent();
#else
        Debug.Log(UnsupportedPlatformMessage);
#endif
    }
}
