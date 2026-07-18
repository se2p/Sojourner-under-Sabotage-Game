using System.Collections;
using System.Collections.Generic;
using CreativeSpore.RpgMapEditor;
using Unity.Collections;
using Unity.VisualScripting;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.Serialization;

public class InteractableWorldObject : MonoBehaviour
{
    // EVENTS
    public UnityEvent onPlayerInteract;
    public UnityEvent onPlayerEnter;
    public UnityEvent onPlayerLeave;
    public UnityEvent onPetEnter;
    public UnityEvent onPetLeave;

    // PROPERTIES PUBLIC
    public InteractionIndicator interactionIndicator;
    public GameObject helpTextObj;
    public float helpTextFlashingFrequency = .25f;
    [Tooltip("Green circle")] public float distanceFromPlayerToTrigger = .5f;
    [Tooltip("Grey  circle")] public float distanceFromPetToTrigger = .5f;
    public KeyCode activationKey = KeyCode.Return;

    [Tooltip("If true, the event will only be triggered once.")]
    public bool reEnableAfterLeave;
    
    // PROPERTIES PUBLIC READ-ONLY
    public bool IsPlayerInRange { get; private set; }
    public bool IsPetInRange { get; private set; }

    // PROPERTIES SERIALIZED
    [SerializeField] private bool isActivationKeyPressed;
    [SerializeField] private float distanceToPlayer;
    [SerializeField] private float distanceToPet;
    [SerializeField] private bool fixedPosition;
    [SerializeField] private bool isEnabled;

    // PROPERTIES PRIVATE
    private PlayerController _player;
    private CustomFollowerAI _pet;
    private Renderer _helpTextRenderer;
    private bool _hasHelpText;
    private Vector3? _position = null;
    private bool _ignoreUntilKeyReleased;
    
    // METHODS PUBLIC
    public bool IsEnabled
    {
        get => isEnabled;
        set
        {
            if (value && !isEnabled && Input.GetKey(activationKey))
            {
                _ignoreUntilKeyReleased = true;
            }
            isEnabled = value;
            if (interactionIndicator != null)
            {
                interactionIndicator.gameObject.SetActive(isEnabled);
            }
        }
    }
    public void EnableOnEvent() => IsEnabled = true;

    // UNITY EVENT METHODS
    void Start()
    {
        _player = FindObjectOfType<PlayerController>();
        _pet = FindObjectOfType<CustomFollowerAI>();
        _hasHelpText = helpTextObj != null;
        _helpTextRenderer = _hasHelpText ? helpTextObj.GetComponent<Renderer>() : null;
        if (interactionIndicator == null)
        {
            interactionIndicator = GetComponentInChildren<InteractionIndicator>();
        }
        Reset();
    }

    void Reset()
    {
        IsPlayerInRange = false;
        IsPetInRange = false;
        if (fixedPosition)
        {
            _position = transform.position;
        }
        if (interactionIndicator != null)
        {
            interactionIndicator.gameObject.SetActive(IsEnabled);
        }
    }

    void Update()
    {
        isActivationKeyPressed = isActivationKeyPressed && Input.GetKey(activationKey)
                                 || Input.GetKeyDown(activationKey) && Time.timeSinceLevelLoad > 0.5f;

        // Block interactions while a dialogue is showing: the interact key is also the dialogue
        // continue key, so advancing dialogue must not fire nearby objects. Latch until the key is
        // released so the very press that closes the dialogue (EnableInteraction may clear the flag
        // in the same frame, before or after this Update) can't leak into a trigger.
        if (DialogueSystem.Instance != null && DialogueSystem.Instance.IsDialoguePlaying)
        {
            _ignoreUntilKeyReleased = true;
        }

        if (_ignoreUntilKeyReleased)
        {
            if (!Input.GetKey(activationKey)) _ignoreUntilKeyReleased = false;
            isActivationKeyPressed = false;
        }

        var pos = _position ?? transform.position;
        distanceToPlayer = Vector2.Distance(pos, _player.transform.position);
        distanceToPet = Vector2.Distance(pos, _pet.transform.position);
        var isPlayerCloseEnough = distanceToPlayer <= distanceFromPlayerToTrigger;
        var isPetCloseEnough = distanceToPet <= distanceFromPetToTrigger;
        
        if (_hasHelpText) _helpTextRenderer.enabled = isPlayerCloseEnough && IsEnabled;
        if (isPlayerCloseEnough)
        {
            if (!IsPlayerInRange)
            {
                IsPlayerInRange = true;
                onPlayerEnter?.Invoke();
            }

            if (isActivationKeyPressed && IsEnabled)
            {
                IsEnabled = false;
                onPlayerInteract?.Invoke();
            }
            else if (_hasHelpText)
            {
                Color textColor = _helpTextRenderer.material.color;
                textColor.a =
                    Mathf.Clamp(0.2f + Mathf.Abs(Mathf.Sin(2f * Mathf.PI * helpTextFlashingFrequency * Time.time)), 0f,
                        1f);
                _helpTextRenderer.material.color = textColor;
                
                // disable interaction indicator if help text is visible
                if (interactionIndicator != null)
                {
                    interactionIndicator.gameObject.SetActive(false);
                }
            }
        }
        else
        {
            if (IsPlayerInRange)
            {
                IsPlayerInRange = false;
                onPlayerLeave?.Invoke();
                
                if (reEnableAfterLeave)
                {
                    IsEnabled = true;
                }
                
                // enable interaction indicator again, as the help text is not visible anymore
                if (interactionIndicator != null)
                {
                    interactionIndicator.gameObject.SetActive(IsEnabled);
                }
            }
        }

        if (isPetCloseEnough)
        {
            if (!IsPetInRange)
            {
                IsPetInRange = true;
                onPetEnter?.Invoke();
            }
        }
        else if (IsPetInRange)
        {
            IsPetInRange = false;
            onPetLeave?.Invoke();
        }
    }
    
    
#if UNITY_EDITOR
    void OnDrawGizmosSelected()
    {
        var transform0 = transform;
        var rotation = transform0.rotation;
        var position = transform0.position;
        UnityEditor.Handles.color = Color.green;
        EditorCompatibilityUtils.CircleCap(0, position, rotation, distanceFromPlayerToTrigger);
        UnityEditor.Handles.color = Color.grey;
        EditorCompatibilityUtils.CircleCap(0, position, rotation, distanceFromPetToTrigger);
    }
#endif
}