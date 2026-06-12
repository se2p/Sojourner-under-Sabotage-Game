using System;

[Serializable]
public class GameProgressState
{
    public static GameProgressState CurrentState;
    
    public int id;
    public int room;
    public string componentName;
    public int stage;
    public Status status;
    public Mode mode;

    public enum Mode { Testing, Debugging }

    public static string ReplaceStatusStringWithInt(string json)
    {
        return ReplaceEnumStringWithInt<Mode>(
                   ReplaceEnumStringWithInt<Status>(json, "status"), "mode");
    }

    private static string ReplaceEnumStringWithInt<TEnum>(string json, string key) where TEnum : Enum
    {
        foreach (TEnum en in Enum.GetValues(typeof(TEnum)))
        {
            json = json.Replace($"{key}\":\"{en}\"", $"{key}\":{Convert.ToInt32(en)}");
        }
        return json;
    }
    
    public enum Status
    {
        DOOR,
        TALK,
        TEST,
        TESTS_ACTIVE,
        DESTROYED,
        MUTATED,
        DEBUGGING,
        PUZZLE
    }
    
    [Serializable]
    public class DialogueCondition
    {
        public int room = 1;
        public int stage = 1;
        public Status status = Status.TALK;
        public Mode mode = Mode.Testing;

        public DialogueCondition() {}

        public DialogueCondition(GameProgressState currentState)
        {
            room = currentState.room;
            stage = currentState.stage;
            status = currentState.status;
            mode = currentState.mode;
        }

        public override bool Equals(object obj)
        {
            return obj switch
            {
                null => false,
                DialogueCondition c => room == c.room && stage == c.stage && status == c.status && mode == c.mode,
                GameProgressState s => room == s.room && stage == s.stage && status == s.status && mode == s.mode,
                _ => false
            };
        }

        public override int GetHashCode()
        {
            return HashCode.Combine(room, stage, status, mode);
        }

        public override string ToString()
        {
            return $"[Room {room}, Stage {stage}, Status {status}, Mode {mode}]";
        }
    }
}
