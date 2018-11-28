const {OnlineChecker} = require("./../src/OnlineChecker");
const {ConsistencyViolationError} = require("./../src/ConsistencyViolationError");

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

forkTest();
writeFailReadNewTest();
writeFailReadOldTest();
writeFailReadOldNewTest();
writeFailReadOldNewOldTest();
readWriteParOldTest();
readWriteParNewTest();
writeReadParOldTest();
writeReadParNewTest();
writeReadSeqTest();
writeReadStaleTest();
writeReadWrongValueTest();
writeReadWrongWriteIDTest();

console.info("OK");