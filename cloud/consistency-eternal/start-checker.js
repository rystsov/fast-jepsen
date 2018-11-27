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
            const record = this.writesAcceptedMap.get(head);
            this.observe(time, processId, head, record.value);
        } else {
            throw new ConsistencyViolationError(`A non-desendent write which started later than ${head} was already accepted. Latest write: ${this.head}`);
        }

        this.readsPendingMap.delete(processId);
        this.gc();
    }

    failWrite(time, processId) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        if (!this.writesByProcess.has(processId)) {
            throw new WrongHistoryError(`Process ${processId} should start a write before it may fail`);
        }

        if (!this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Confirmation of a write is equivalent to a read so every write is a read and readsPendingMap must contain write's process id: ${processId}`);
        }

        this.writesByProcess.delete(processId);
        this.readsPendingMap.delete(processId);
        this.gc();
    }

    conflictWrite(time, processId) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        if (!this.writesByProcess.has(processId)) {
            throw new WrongHistoryError(`Process ${processId} should start a write before it may fail`);
        }

        if (!this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Confirmation of a write is equivalent to a read so every write is a read and readsPendingMap must contain write's process id: ${processId}`);
        }

        const head = this.writesByProcess.get(processId);

        if (this.writesAcceptedMap.has(head)) {
            throw new ConsistencyViolationError(`${head} can't be rejected because it's already accepted (probably it's dependency was obserted). Latest write: ${this.head}`);
        } else if (this.writesPendingMap.has(head)) {
            this.writesPendingMap.delete(head);
        }

        this.writesByProcess.delete(processId);
        this.readsPendingMap.delete(processId);
        this.gc();
    }

    beginRead(time, processId) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }

        if (this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Previous read must end before the next read may start`);
        }

        if (this.writesByProcess.has(processId)) {
            throw new WrongHistoryError(`Previous write must end before the next read may start`);
        }

        this.time = time;
        this.readsPendingMap.set(processId, {beginTs: time, head: this.head});
        this.readsPendingQueue.push({acceptedTs: this.writesAcceptedMap.get(this.head).acceptedTs, processId: processId});
    }
    
    endRead(time, processId, writeID, value) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        if (!this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Can't confirm read which hasn't started`);
        }

        if (this.writesPendingMap.has(writeID)) {
            this.observe(time, processId, writeID, value);
        } else if (this.writesAcceptedMap.has(writeID)) {
            this.observe(time, processId, writeID, value);
        } else {
            throw new ConsistencyViolationError(`An observed write: ${writeID} isn't in writesPendingMap or writesAcceptedMap maps. Latest write: ${this.head}`);
        }

        this.readsPendingMap.delete(processId);
        this.gc();
    }

    failRead(time, processId) {
        if (this.time >= time) {
            throw new WrongHistoryError(`Time must go forward got ${time} but ${this.time} is already known`);
        }
        this.time = time;

        if (!this.readsPendingMap.has(processId)) {
            throw new WrongHistoryError(`Can't fail read which hasn't started`);
        }

        this.readsPendingMap.delete(processId);
        this.gc();
    }

    observe(time, processId, writeID, value) {
        const begin = this.readsPendingMap.get(processId);
        if (!this.writesAcceptedMap.has(begin.head)) {
            throw new WrongCodeError();
        }
        
        if (this.writesAcceptedMap.has(writeID)) {
            const beginAcceptedTs = this.writesAcceptedMap.get(begin.head).acceptedTs;
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

    gc() {
        while (this.readsPendingQueue.length > 0) {
            if (!this.readsPendingMap.has(this.readsPendingQueue[0].processId)) {
                this.readsPendingQueue.shift();
            } else {
                break;
            }
        }
    }
}

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

class Clock {
    constructor(ts) {
        this.ts = ts;
    }
    tick() {
        this.ts+=1;
        return this.ts;
    }
}

function expectViolation(action) {
    try {
        action();
        throw new Error("Should be non reachible");
    } catch(e) {
        if (e instanceof ConsistencyViolationError) {
            // expected
        } else {
            throw e;
        }
    }
}

function writeReadSeqTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.endWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0001", 1);
}

function writeReadParOldTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.beginRead("key1", clock.tick(), 1);
    checker.endWrite(clock.tick(), 0);
    checker.endRead(clock.tick(), 1, "0000", 0);
}

function writeReadParNewTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.beginRead("key1", clock.tick(), 1);
    checker.endWrite(clock.tick(), 0);
    checker.endRead(clock.tick(), 1, "0001", 1);
}

function readWriteParOldTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginRead("key1", clock.tick(), 1);
    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.endRead(clock.tick(), 1, "0000", 0);
    checker.endWrite(clock.tick(), 0);
}

function readWriteParNewTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginRead("key1", clock.tick(), 1);
    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.endRead(clock.tick(), 1, "0001", 1);
    checker.endWrite(clock.tick(), 0);
}

function writeReadStaleTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.endWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    expectViolation(() => {
        checker.endRead(clock.tick(), 1, "0000", 0);
    });
}

function writeReadWrongValueTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.endWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    expectViolation(() => {
        checker.endRead(clock.tick(), 1, "0001", 0);
    });
}

function writeReadWrongWriteIDTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.endWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    expectViolation(() => {
        checker.endRead(clock.tick(), 1, "0002", 0);
    });
}

function writeFailReadNewTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.failWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0001", 1);
}

function writeFailReadOldTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.failWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0000", 0);
}

function writeFailReadOldNewTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.failWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0000", 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0001", 1);
}

function writeFailReadOldNewOldTest() {
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 1);
    checker.failWrite(clock.tick(), 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0000", 0);

    checker.beginRead("key1", clock.tick(), 1);
    checker.endRead(clock.tick(), 1, "0001", 1);

    checker.beginRead("key1", clock.tick(), 1);
    
    expectViolation(() => checker.endRead(clock.tick(), 1, "0000", 0));
}

function forkTest() {
    // 0000 <- 0001 <- 0002
    // \                    <- 0003 <- 0004 (*)
    
    const checker = new OnlineChecker("0000", 0);
    const clock = new Clock(1);

    checker.beginWrite("key1", clock.tick(), 0, "0000", "0001", 11);
    checker.beginWrite("key1", clock.tick(), 1, "0001", "0002", 12);
    checker.beginWrite("key1", clock.tick(), 2, "0000", "0003", 21);
    checker.beginWrite("key1", clock.tick(), 3, "0003", "0004", 22);
    
    checker.beginRead("key1", clock.tick(), 4);
    checker.endRead(clock.tick(), 4, "0004", 22);

    expectViolation(() => checker.endWrite(clock.tick(), 0));
    expectViolation(() => checker.endWrite(clock.tick(), 1));
    checker.endWrite(clock.tick(), 3);
    checker.endWrite(clock.tick(), 2);
}

// forkTest();
// writeFailReadNewTest();
// writeFailReadOldTest();
// writeFailReadOldNewTest();
// writeFailReadOldNewOldTest();
// readWriteParOldTest();
// readWriteParNewTest();
// writeReadParOldTest();
// writeReadParNewTest();
// writeReadSeqTest();
// writeReadStaleTest();
// writeReadWrongValueTest();
// writeReadWrongWriteIDTest();

console.info("OK");