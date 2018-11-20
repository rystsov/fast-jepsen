class WrongHistoryError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, WrongHistoryError)
    }
}

class ConsistencyViolationError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, ConsistencyViolationError)
    }
}

class RegisterChecker {
    constructor(writeID, value) {
        this.writesAcceptedMap   = new Map(); // next -> {time, prev, processId}
        this.writesAcceptedQueue = [];        // [{time, next}]
        this.writesPendingMap    = new Map(); // next -> {time, prev, processId}
        this.writesPendingQueue  = [];        // [{time, next}]
        this.head                = null;      // next
        this.writesByProcess     = new Map(); // processId -> next

        this.head = writeID;
        this.writesAcceptedMap.set(writeID, {time:0, prev:null, processId:null, value: value});
        this.writesAcceptedQueue.push({time:0, writeID: writeID});

        this.readsPendingMap   = new Map(); // processId -> {time, head}
        this.readsPendingQueue = new Map(); // [{time, processId}]

        this.time = 0;
    }

    beginWrite(time, processId, prev, next, value) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        

        this.writesByProcess.set(processId, next);
        this.writesPendingMap.set(next, {time:time, prev:prev, processId:processId, value: value});
        this.writesPendingQueue.push({time:time, writeID: next});
    }
    endWrite(time, processId) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        if (!this.writesByProcess.has(processId)) {
            throw new WrongHistoryError(`Process ${processId} should start a write before finishing it`);
        }

        const head = this.writesByProcess.get(processId);
        let curr = head;
        const chain = [];
        while (true) {
            if (this.writesPendingMap.has(curr)) {
                chain.push(curr);
                curr = this.writesPendingMap.get(curr).prev;
            } else {
                if (curr == this.head) {
                    chain.reverse();
                    for (let writeID of chain) {
                        let record = this.writesPendingMap.get(writeID);
                        this.writesPendingMap.delete(writeID);
                        this.writesAcceptedMap.set(writeID, record);
                        this.writesAcceptedQueue.push({time:record.time, writeID: writeID});
                    }
                    this.head = head;
                    break;
                } else {
                    chain.push(curr);
                    chain.reverse();
                    const path = chain.join(" -> ");
                    throw new ConsistencyViolationError(`The observed chain: ${path} doesn't lead to the latest accepted value: ${this.head}`);
                }
            }
        }
        
        // go backward and move chain from waiting to accepted

        // how long to keep items in pending
        // if a record is accepted => remove all records which started before the accepted started
        
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
            throw new WrongHistoryError("Can't end a write which wasn't started");
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