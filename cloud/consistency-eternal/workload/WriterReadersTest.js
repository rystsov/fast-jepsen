const uuid = require("uuid");
const moment = require("moment");
const {SlidingCounters} = require("./SlidingCounters");
const {PreconditionError} = require("./WebKV");

class WriterReadersTest {
    constructor(history, oracle, db, keys, period) {
        this.db = db;
        this.oracle = oracle;
        this.cps = new SlidingCounters();
        this.isActive = false;
        this.period = period;
        this.regions = [];
        this.keys = keys;
        this.history = history;
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

            record += this.history.pending + "\t|\t";

            console.info(record + moment().format("YYYY/MM/DD hh:mm:ss"));
        }
    }

    async startWriter(processId, key) {
        let value = 0;
        while (this.isActive) {
            value++;
            const prev = this.oracle.guess(key);
            const next = uuid();
            try {
                this.history.record([this.history.ts(), processId, "wb", key, prev, next, value].join(","));
                this.oracle.propose(key, prev, next);
                await this.db.cas(key, prev, next, value);
                this.history.record([this.history.ts(), processId, "we"].join(","));
                this.oracle.observe(key, next);
                this.cps.inc(time_us(), "writes:200");
            } catch (e) {
                if (e instanceof PreconditionError) {
                    this.history.record([this.history.ts(), processId, "wc"].join(","));
                    this.cps.inc(time_us(), "writes:409");
                } else {
                    this.history.record([this.history.ts(), processId, "wf"].join(","));
                    this.cps.inc(time_us(), "writes:500");
                }
            }
        }
    }

    async startReader(processId, region, key) {
        while (this.isActive) {
            try {
                const rb = [this.history.ts(), processId, "rb", key].join(",");
                const record = await this.db.read(region, key);
                this.history.record(rb);
                this.history.record([this.history.ts(), processId, "re"].join(","));
                this.oracle.observe(key, record.writeID);
                this.cps.inc(time_us(), region);
            } catch (e) {  
                this.cps.inc(time_us(), "err:" + region);
            }
        }
    }
}

function time_us() {
    const [s, ns] = process.hrtime();
    return (s*1e9 + ns) / 1000;
}

exports.WriterReadersTest = WriterReadersTest;