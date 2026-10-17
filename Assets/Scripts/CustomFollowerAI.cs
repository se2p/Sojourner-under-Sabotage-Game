using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif
using System.Collections;
using UnityEngine.Serialization;

namespace CreativeSpore.RpgMapEditor
{
    [RequireComponent(typeof(MovingBehaviour))]
    [RequireComponent(typeof(PhysicCharBehaviour))]
    [RequireComponent(typeof(MapPathFindingBehaviour))]
    [RequireComponent(typeof(DirectionalAnimation))]
    [AddComponentMenu("RpgMapEditor/AI/CustomFollowerAI", 10)]
    public class CustomFollowerAI : MonoBehaviour
    {
        MovingBehaviour m_moving;
        PhysicCharBehaviour m_phyChar;
        MapPathFindingBehaviour m_pathFindingBehaviour;
        DirectionalAnimation m_animCtrl;

        [FormerlySerializedAs("LockAnimDir")] 
        public bool lockAnimDir = false;

        [FormerlySerializedAs("MinDistToReachTarget")] 
        [Tooltip("Distance to stop doing path finding and just go to player position directly")]
        public float minDistToReachTarget = 0.32f;

        public GameObject Target;
        private GameObject _lastTarget;
        private Vector3? _tempTarget;
        private bool _didCollide;

        void Start()
        {
            if (!Target) Target = FindObjectOfType<PlayerController>().gameObject;
            m_moving = GetComponent<MovingBehaviour>();
            m_phyChar = GetComponent<PhysicCharBehaviour>();
            m_pathFindingBehaviour = GetComponent<MapPathFindingBehaviour>();
            m_animCtrl = GetComponent<DirectionalAnimation>();
        }

        public void ChangeTarget(GameObject newTarget)
        {
            _lastTarget = Target;
            Target = newTarget;
        }

        public void ResetTarget()
        {
            if (_lastTarget)
            {
                Target = _lastTarget;
                _lastTarget = null;
            }
        }

        /// <summary>
        /// Call after a teleport so stale pathfinding state from the previous location
        /// does not cause the companion to run against walls at the new position.
        /// </summary>
        public void ResetAfterTeleport()
        {
            _tempTarget = null;
            m_pathFindingBehaviour.ClearPath();
            m_pathFindingBehaviour.enabled = false;
            m_moving.Arrive(transform.position);
            m_animCtrl.IsPlaying = false;
        }

        /// <summary>
        /// Required overload as the events pass componentBehaviours instead of GameObjects as parameters.
        /// </summary>
        /// <param name="newTarget">The new target of the companion</param>
        public void ChangeTarget(ComponentBehaviour newTarget)
        {
            ChangeTarget(newTarget.gameObject);
        }

#if UNITY_EDITOR
        void OnDrawGizmosSelected()
        {
            Handles.color = Color.red;
            Handles.DrawWireDisc(transform.position, Vector3.forward, minDistToReachTarget);
        }
#endif

        void UpdateAnimDir()
        {
            if (m_moving.Veloc.magnitude >= (m_moving.MaxSpeed / 2f))
            {
                m_animCtrl.SetAnimDirection(m_moving.Veloc);
            }
        }

        void FixedUpdate()
        {
            var vPlayerPos = Target.transform.position;
            var position = transform.position;
            vPlayerPos.z = position.z;
            var distanceToTarget = Vector2.Distance(vPlayerPos, position);

            // stop following the path when close enough to target (wait on a random position in range) --
            var isTargetReached = distanceToTarget <= minDistToReachTarget;
            if (isTargetReached)
            {
                if (_tempTarget == null)
                {
                    // define new temp target
                    var p = Random.insideUnitCircle * minDistToReachTarget; //get random position in radius of minDistToReachTarget around the player
                    _tempTarget = vPlayerPos + new Vector3(p.x, p.y, 0);
                }
                else
                {
                    var distanceToTempTarget = Vector2.Distance(_tempTarget.Value, position);
                    if (distanceToTempTarget <= 0.5f)
                    { 
                        // stay
                        m_moving.Arrive(transform.position);
                        m_animCtrl.IsPlaying = false;
                        m_pathFindingBehaviour.enabled = false;
                    }
                    else
                    {
                        //m_moving.Arrive(_tempTarget.Value);
                        m_pathFindingBehaviour.TargetPos = _tempTarget.Value;
                        m_pathFindingBehaviour.enabled = true;
                    }
                }
            }
            else
            {
                _tempTarget = null;
                m_animCtrl.IsPlaying = true;
                m_pathFindingBehaviour.TargetPos = vPlayerPos;
                m_pathFindingBehaviour.enabled = true;
                
                // adaptive speed
                m_moving.MaxSpeed = Mathf.Lerp(0.8f, 1.5f, distanceToTarget - 1f);
                m_moving.MaxForce = m_moving.MaxSpeed - 0.2f;
            }
            // --

            // avoid obstacles --
            var vTurnVel = Vector3.zero;
            if (0 != (m_phyChar.CollFlags & PhysicCharBehaviour.eCollFlags.RIGHT))
            {
                vTurnVel.x = -m_moving.MaxSpeed;
            }
            else if (0 != (m_phyChar.CollFlags & PhysicCharBehaviour.eCollFlags.LEFT))
            {
                vTurnVel.x = m_moving.MaxSpeed;
            }

            if (0 != (m_phyChar.CollFlags & PhysicCharBehaviour.eCollFlags.DOWN))
            {
                vTurnVel.y = m_moving.MaxSpeed;
            }
            else if (0 != (m_phyChar.CollFlags & PhysicCharBehaviour.eCollFlags.UP))
            {
                vTurnVel.y = -m_moving.MaxSpeed;
            }

            if (vTurnVel != Vector3.zero)
            {
                m_moving.ApplyForce(vTurnVel - m_moving.Veloc);
            }
            //---

            //fix to avoid flickering of the creature when collides with wall --
            if (Time.frameCount % 16 == 0)
                // --
            {
                if (!lockAnimDir) UpdateAnimDir();
            }
        }
    }
}