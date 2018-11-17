class FictionHistoryError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, FictionHistoryError)
    }
}

class RegisterChecker {
    constructor() {

    }

    beginWrite(time, processId, prev, next, value) {
        // put to waiting set
    }
    endWrite(time, processId) {
        // go backward and move chain from waiting to accepted

        // 
        
        // going backwards from the begining of this write
        // an remove from waiting set, they 
    }
    conflictWrite(time, processId) {}

    beginRead(time, processId) { }
    endRead(time, processId, writeID, value) {}
}

class OnlineChecker {
    constructor() {
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

    getLastKey(processId) {
        if (!this.lastKey.has(processId)) {
            throw new FictionHistoryError("Can't end a write which wasn't started");
        }
        const key = this.lastKey.get(processId);
        this.lastKey.delete(processId);
        return key;
    }

    getChecker(key) {
        if (!this.keyCheckers.has(key)) {
            this.keyCheckers.set(key, new RegisterChecker());
        }
        return this.keyCheckers.get(key);
    }
}


const lineReader = require("readline").createInterface({
    input: require("fs").createReadStream("history.log")
});

let lines = 0;

lineReader.on("line", function (line) {
    const parts = line.split(",");
    if (parts[2] == "wb") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
        const key = parts[3];
        const prev = parts[4];
        const next = parts[5];
        const value = parseInt(parts[6]);
    } else if (parts[2] == "rb") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
        const key = parts[3];
    } else if (parts[2] == "re") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
        const writeID = parts[3];
        const value = parseInt(parts[4]);
    } else if (parts[2] == "we") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
    } else if (parts[2] == "wc") {
        const time = parseInt(parts[0]);
        const processId = parseInt(parts[1]);
    } else {
        throw new Error("Something unknown" + line);
    }
    
    lines += 1;
});

lineReader.on("close", function () {
    console.info(lines);
});