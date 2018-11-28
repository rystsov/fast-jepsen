const {WrongHistoryError} = require("./WrongHistoryError");
const {RegisterChecker} = require("./RegisterChecker");

class OnlineChecker {
    constructor(writeID, value) {
        this.init = {
            writeID: writeID,
            value: value
        };
        this.keyCheckers = new Map();
        this.lastKey = new Map();
    }

    beginWrite(key, time, processId, prev, next, value) {
        this.lastKey.set(processId, key);
        this.getChecker(key).beginWrite(time, processId, prev, next, value);
    }
    endWrite(time, processId) {
        const key = this.getLastKey(processId)
        this.getChecker(key).endWrite(time, processId);
    }
    failWrite(time, processId) {
        const key = this.getLastKey(processId)
        this.getChecker(key).failWrite(time, processId);
    }
    conflictWrite(time, processId) {
        const key = this.getLastKey(processId)
        this.getChecker(key).conflictWrite(time, processId);
    }

    beginRead(key, time, processId) {
        this.lastKey.set(processId, key);
        this.getChecker(key).beginRead(time, processId);
    }
    endRead(time, processId, writeID, value) {
        const key = this.getLastKey(processId)
        this.getChecker(key).endRead(time, processId, writeID, value);
    }
    failRead(time, processId) {
        const key = this.getLastKey(processId)
        this.getChecker(key).failRead(time, processId);
    }

    mem() {
        return 0;
    }

    getLastKey(processId) {
        if (!this.lastKey.has(processId)) {
            throw new WrongHistoryError("Can't end a write which wasn't started");
        }
        const key = this.lastKey.get(processId);
        this.lastKey.delete(processId);
        return key;
    }

    getChecker(key) {
        if (!this.keyCheckers.has(key)) {
            this.keyCheckers.set(key, new RegisterChecker(this.init.writeID, this.init.value));
        }
        return this.keyCheckers.get(key);
    }
}

exports.OnlineChecker = OnlineChecker;