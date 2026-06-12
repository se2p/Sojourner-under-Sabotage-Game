mergeInto(LibraryManager.library, {
    OpenEditors: function (componentName) {
        window.openEditor(UTF8ToString(componentName));
    },
    ToggleAlarm: function (active) {
        document.getElementById('alarm').classList.toggle('active', active);
    },
    SendRoomUnlockedEvent: function (roomId) {
        window.es.sendEvent(new RoomUnlockedEvent(roomId));
    },
    SendConversationFinishedEvent: function () {
        window.es.sendEvent(new ConversationFinishedEvent());
    },
    SendGameStartedEvent: function () {
        window.es.sendEvent(new GameStartedEvent());
    },
    OpenDebugger: function (componentName) {
        window.openDebugger(UTF8ToString(componentName));
    },
    SendPuzzleSolvedEvent: function () {
        window.es.sendEvent(new PuzzleSolvedEvent());
    }
});