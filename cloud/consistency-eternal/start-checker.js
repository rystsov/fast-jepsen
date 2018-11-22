class WrongCodeError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, WrongCodeError)
    }
}

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
        this.writesAcceptedMap   = new Map(); // next -> {beginTs, acceptedTs, prev, value, processId}
        this.writesAcceptedQueue = [];        // [{acceptedTs, writeID}]
        this.writesPendingMap    = new Map(); // next -> {beginTs, prev, value, processId}
        this.writesRejectionMap  = new Map();
        this.writesPendingQueue  = [];        // [{beginTs, next}]
        this.head                = null;      // next
        this.writesByProcess     = new Map(); // processId -> next

        this.head = writeID;
        this.writesAcceptedMap.set(writeID, {beginTs: 0, acceptedTs: 0, prev: null, processId: null, value: value});
        this.writesAcceptedQueue.push({acceptedTs: 0, writeID: writeID});

        this.readsPendingMap   = new Map(); // processId -> {beginTs, head, acceptedTs}
        this.readsPendingQueue = []; // [{acceptedTs, processId}]

        this.time = 0;
    }

    beginWrite(time, processId, prev, next, value) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }

        if (this.writesByProcess.has(processId)) {
            throw new WrongHistoryError(`Previous write must end before the next may start`);
        }

        if (this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Previous read must end before the next write may start`);
        }
        
        if (this.writesPendingMap.has(prev)) {
            const dep = this.writesPendingMap.get(prev);
            if (dep.beginTs >= time) {
                throw new WrongHistoryError(`${next} is causally related to ${prev} so the latter should be earlier but its time is ${dep.beginTs} but ${next}'s is ${time}`);
            }
        } else if (this.head == prev) {
            if (!this.writesAcceptedMap.has(prev)) {
                throw new WrongHistoryError(`Latest accepted ${prev} must be in the accepted map`);
            }
            const dep = this.writesAcceptedMap.get(prev);
            if (dep.beginTs >= time) {
                throw new WrongHistoryError(`${next} is causally related to ${prev} so the latter should be earlier but its time is ${dep.beginTs} but ${next}'s is ${time}`);
            }
        }

        if (!this.writesAcceptedMap.has(this.head)) {
            throw new WrongCodeError();
        }
        
        this.time = time;
        this.writesByProcess.set(processId, next);
        this.writesPendingMap.set(next, {beginTs: time, prev: prev, processId: processId, value: value});
        this.writesPendingQueue.push({beginTs: time, next: next });
        this.readsPendingMap.set(processId, {beginTs: time, head: this.head});
        this.readsPendingQueue.push({acceptedTs: this.writesAcceptedMap.get(this.head).acceptedTs, processId: processId});
    }

    observe(time, processId, writeID, value) {
        const begin = this.readsPendingMap.get(processId);
        if (!this.writesAcceptedMap.has(begin.head)) {
            throw new WrongCodeError();
        }
        
        if (this.writesAcceptedMap.has(writeID)) {
            const beginAcceptedTs = this.writesAcceptedMap.get(begin.head).beginAcceptedTs;
            const record = this.writesAcceptedMap.get(writeID);
            if (record.acceptedTs < beginAcceptedTs) {
                throw new ConsistencyViolationError(`Observed ${writeID} at ${time}. But at the moment the observation started ${begin.beginTs} its decentent ${begin.head} was already known (accepted at ${beginAcceptedTs})`);
            }
            if (record.value != value) {
                throw new ConsistencyViolationError(`Observed value:${value} of ${writeID} doesn't match accepted value:${record.value}.`);
            }
        } else if (this.writesPendingMap.has(writeID)) {
            let curr = writeID;
            const chain = [];
            while (true) {
                if (this.writesPendingMap.has(curr)) {
                    chain.push(curr);
                    curr = this.writesPendingMap.get(curr).prev;
                } else {
                    if (curr == this.head) {
                        chain.reverse();
                        for (let wid of chain) {
                            let record = this.writesPendingMap.get(wid);
                            record.acceptedTs = time;
                            this.writesPendingMap.delete(wid);
                            this.writesAcceptedMap.set(wid, record);
                            this.writesAcceptedQueue.push({acceptedTs:record.acceptedTs, writeID: wid});
                        }
                        this.head = writeID;

                        const head = this.writesAcceptedMap.get(writeID);
                        while (this.writesPendingQueue.length > 0) {
                            if (this.writesPendingQueue[0].beginTs < head.beginTs) {
                                const next = this.writesPendingQueue[0].next;
                                if (this.writesPendingMap.has(next)) {
                                    const pending = this.writesPendingMap.get(next);
                                    // todo: add to rejected
                                    this.writesPendingMap.delete(next);
                                }
                                this.writesPendingQueue.shift();
                            } else {
                                break;
                            }
                        }
                        break;
                    } else {
                        chain.push(curr);
                        chain.reverse();
                        const path = chain.join(" -> ");
                        throw new ConsistencyViolationError(`The observed chain: ${path} doesn't lead to the latest accepted value: ${this.head}`);
                    }
                }
            }
        } else {
            throw new ConsistencyViolationError(`Observed (${writeID},${value}) at ${time}. It's either rabish or older than record known ${begin.head} at the moment observation started ${begin.beginTs}`);
        }
    }

    endWrite(time, processId) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        if (!this.writesByProcess.has(processId)) {
            throw new WrongHistoryError(`Process ${processId} should start a write before finishing it`);
        }

        if (!this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Confirmation of a write is equivalent to a read so every write is a read and readsPendingMap must contain write's process id: ${processId}`);
        }

        const head = this.writesByProcess.get(processId);
        this.writesByProcess.delete(processId);

        if (this.writesPendingMap.has(head)) {
            const record = this.writesPendingMap.get(head);
            this.observe(time, processId, head, record.value);
        } else if (this.writesAcceptedMap.has(head)) {
            const record = this.writesPendingMap.get(head);
            this.observe(time, processId, head, record.value);
        } else {
            // 
            throw new WrongHistoryError(`Confirmed ${head} must be either in pending or accepted maps.`);
        }

        this.readsPendingMap.delete(processId);
        this.gc();
    }
    conflictWrite(time, processId) {}

    beginRead(time, processId) { }
    endRead(time, processId, writeID, value) {}

    gc() {
        while (this.readsPendingQueue.length > 0) {
            if (!this.readsPendingMap.has(this.readsPendingQueue[0].processId)) {
                this.readsPendingQueue.shift();
            }
        }
    }
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