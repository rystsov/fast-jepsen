const {WrongHistoryError} = require("./WrongHistoryError");
const {ConsistencyViolationError} = require("./ConsistencyViolationError");
const {WrongCodeError} = require("./WrongCodeError");

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

        this.readsPendingMap   = new Map(); // processId -> {beginTs, head, headAcceptedTs, processId, isGarbage}
        this.readsPendingQueue = [];        //             [{beginTs, head, headAcceptedTs, processId, isGarbage}]

        this.time = 0;
    }

    mem() {
        let consumed = 0;

        consumed += this.writesAcceptedMap.size;
        consumed += this.writesAcceptedQueue.length;
        consumed += this.writesPendingMap.size;
        consumed += this.writesPendingQueue.length;
        consumed += this.writesByProcess.size;
        consumed += this.readsPendingMap.size;
        consumed += this.readsPendingQueue.length;

        return consumed;
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
        
        if (!this.writesAcceptedMap.has(this.head)) {
            throw new WrongHistoryError(`writesAcceptedMap must always contain current head`);
        }
        const readRecord = {
            processId: processId,
            beginTs: time,
            head: this.head,
            headAcceptedTs: this.writesAcceptedMap.get(this.head).acceptedTs,
            isGarbage: false
        };
        this.readsPendingMap.set(processId, readRecord);
        this.readsPendingQueue.push(readRecord);
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

        this.readsPendingMap.get(processId).isGarbage = true;
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
        this.readsPendingMap.get(processId).isGarbage = true;
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
        this.readsPendingMap.get(processId).isGarbage = true;
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
        if (!this.writesAcceptedMap.has(this.head)) {
            throw new WrongHistoryError(`writesAcceptedMap must always contain current head`);
        }
        const readRecord = {
            processId: processId,
            beginTs: time,
            head: this.head,
            headAcceptedTs: this.writesAcceptedMap.get(this.head).acceptedTs,
            isGarbage: false
        };
        this.readsPendingMap.set(processId, readRecord);
        this.readsPendingQueue.push(readRecord);
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

        this.readsPendingMap.get(processId).isGarbage = true;
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

        this.readsPendingMap.get(processId).isGarbage = true;
        this.readsPendingMap.delete(processId);
        this.gc();
    }

    observe(time, processId, writeID, value) {
        const begin = this.readsPendingMap.get(processId);
        if (!this.writesAcceptedMap.has(begin.head)) {
            throw new WrongHistoryError(`writesAcceptedMap must always contain head known at the begining of any ongoing read`);
        }
        
        if (this.writesAcceptedMap.has(writeID)) {
            const record = this.writesAcceptedMap.get(writeID);
            if (record.acceptedTs < begin.headAcceptedTs) {
                throw new ConsistencyViolationError(`Observed ${writeID} at ${time}. But at the moment the observation started ${begin.beginTs} its decentent ${begin.head} was already known (accepted at ${begin.headAcceptedTs})`);
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
        while (this.readsPendingQueue.length > 0 && this.readsPendingQueue[0].isGarbage) {
            this.readsPendingQueue.shift();
        }
        if (this.readsPendingQueue.length == 0) {
            while (this.writesAcceptedQueue.length > 0 && this.writesAcceptedQueue[0].writeID != this.head) {
                this.writesAcceptedMap.delete(this.writesAcceptedQueue[0].writeID);
                this.writesAcceptedQueue.shift();
            }
        } else {
            let headAcceptedTs = this.readsPendingQueue[0].headAcceptedTs;
            while (this.writesAcceptedQueue.length > 0 && this.writesAcceptedQueue[0].acceptedTs < headAcceptedTs) {
                this.writesAcceptedMap.delete(this.writesAcceptedQueue[0].writeID);
                this.writesAcceptedQueue.shift();
            }
        }
        if (this.writesAcceptedQueue.length == 0) {
            throw new WrongCodeError("writesAcceptedQueue must always contain current head");
        }
    }
}

exports.RegisterChecker = RegisterChecker;