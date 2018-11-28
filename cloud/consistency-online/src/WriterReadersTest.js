const uuid = require("uuid");
const moment = require("moment");
const {SlidingCounters} = require("./SlidingCounters");
const {PreconditionError} = require("./WebKV");

class WriterReadersTest {
    constructor(checker, oracle, db, keys, period) {
        this.db = db;
        this.oracle = oracle;
        this.cps = new SlidingCounters();
        this.isActive = false;
        this.period = period;
        this.regions = [];
        this.keys = keys;
        this.checker = checker;
        this.ts = 1;
    }

    async run() {
        this.regions = (await this.db.topology()).regions;
        
        this.isActive = true;
        const threads = [];
        
        threads.push(this.agg());

        let processId = 0;
        for (let key of this.keys) {
            threads.push(this.startWriter(processId, key));
            processId += 1;

            threads.push(this.startReader(processId, "null", key));
            processId += 1;

            for(let region of this.regions) {
                threads.push(this.startReader(processId, region, key));
                processId += 1;
            }
        }
        
        for (const thread of threads) {
            await thread;
        }
    }

    async agg() {
        const started = time_us();
        let legend = "#legend: time|writes|w-conflicts|w-unknown|null|null-unknown";
        let dims = ["writes:200", "writes:409", "writes:500", "null", "err:null"]
        for (let region of this.regions) {
            legend += "|" + region + "|err:" + region;
            dims.push(region);
            dims.push("err:" + region);
        }
        console.info(legend);

        while (this.isActive) {
            await new Promise((resolve, reject) => {
                setTimeout(() => resolve(true), this.period);
            });
            const time = time_us()
            this.cps.forgetBefore(time - this.period*1000);

            const stat = this.cps.getStat(dims);
            
            let record = "" + Math.floor((time - started) / (this.period * 1000)) + "\t||\t"

            record += stat[0] + "\t" + stat[1] + "\t" + stat[2] + "\t||\t";
            record += stat[3] + "\t" + stat[4] + "\t||\t";

            let  i = 5;

            while (i < stat.length) {
                record += stat[i] + "\t" + stat[i+1] + "\t|\t";
                i+=2;
            }

            record += this.checker.mem() + "\t|\t";

            console.info(record + moment().format("YYYY/MM/DD hh:mm:ss"));
        }
    }

    async startWriter(processId, key) {
        try { 
            let value = 0;
            while (this.isActive) {
                value++;
                const prev = this.oracle.guess(key);
                const next = uuid();
                this.oracle.propose(key, prev, next);
                this.checker.beginWrite(key, this.tick(), processId, prev, next, value);
                try {
                    await this.db.cas(key, prev, next, value);
                } catch (e) {
                    if (e instanceof PreconditionError) {
                        this.checker.conflictWrite(this.tick(), processId);
                        this.cps.inc(time_us(), "writes:409");
                    } else {
                        this.checker.failWrite(this.tick(), processId);
                        this.cps.inc(time_us(), "writes:500");
                    }
                    continue;
                }
                this.checker.endWrite(this.tick(), processId);
                this.oracle.observe(key, next);
                this.cps.inc(time_us(), "writes:200");
            }
        } catch(e) {
            this.isActive = false;
            throw e;
        }
    }

    async startReader(processId, region, key) {
        try {
            while (this.isActive) {
                let record = null;
                this.checker.beginRead(key, this.tick(), processId);
                try {
                    record = await this.db.read(region, key);
                } catch (e) {  
                    this.checker.failRead(this.tick(), processId);
                    this.cps.inc(time_us(), "err:" + region);
                    continue;
                }
                this.checker.endRead(this.tick(), processId, record.writeID, record.value);
                this.oracle.observe(key, record.writeID);
                this.cps.inc(time_us(), region);
            }
        } catch(e) {
            this.isActive = false;
            throw e;
        }
    }

    tick() {
        this.ts+=1;
        return this.ts;
    }
}

function time_us() {
    const [s, ns] = process.hrtime();
    return (s*1e9 + ns) / 1000;
}

exports.WriterReadersTest = WriterReadersTest;