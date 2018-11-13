const request = require("request");

const moment = require("moment");

const TIMEOUT = 30000;

class PreconditionError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, PreconditionError)
    }
}

class WebKV {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }

    async topology() {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'get',
                    url: "http://" + this.endpoint + "/topology",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(JSON.parse(body));
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async create(key, writeID, value) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    json:  {
                        key: key,
                        writeID: writeID,
                        value: value
                    },
                    url: "http://" + this.endpoint + "/create",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(body);
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async overwrite(key, writeID, value) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    json:  {
                        key: key,
                        writeID: writeID,
                        value: value
                    },
                    url: "http://" + this.endpoint + "/overwrite",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(body);
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async cas(key, prevWriteID, writeID, value) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    json:  {
                        key: key,
                        prevWriteID: prevWriteID,
                        writeID: writeID,
                        value: value
                    },
                    url: "http://" + this.endpoint + "/cas",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(body);
                        return;
                    }
                    if (res.statusCode == 409) {
                        reject(new PreconditionError());
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async read(region, key) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'get',
                    url: "http://" + this.endpoint + "/read/" + region + "/" + key,
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(JSON.parse(body));
                        return;
                    }
                    if (res.statusCode == 404 && res.headers["key-missing"]==42) {
                        resolve(null);
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }
}

class SlidingCounters {
    constructor() {
        this.queue = [];
        this.stat = new Map();
    }
    inc(ts, counter) {
        if (!this.stat.has(counter)) {
            this.stat.set(counter, 0);
        }
        this.stat.set(counter, this.stat.get(counter) + 1);
        this.queue.push({ ts, counter });
    }
    forgetBefore(ts) {
        let dropped = 0;
        while (this.queue.length > 0 && this.queue[0].ts < ts) {
            dropped += 1;
            const record = this.queue.shift();
            this.stat.set(record.counter, this.stat.get(record.counter) - 1);
        }
    }
    getStat(marks) {
        let slice = [];
        for (const mark of marks) {
            let count = 0;
            if (this.stat.has(mark)) {
                count = this.stat.get(mark);
            }
            slice.push(count);
        }
        return slice;
    }
}


class WriterReadersTest {
    // rank is the number of keys to use
    // for each key there is one-writer and |regions|-readers
    constructor(db, rank, period) {
        this.db = db;
        this.cps = new SlidingCounters();
        this.isActive = false;
        this.period = period;
        this.regions = [];
        this.rank = rank;
    }
    async run() {
        this.regions = (await this.db.topology()).regions;
        
        this.isActive = true;
        const threads = [];
        
        threads.push(this.agg());

        for (let i=0;i<this.rank;i++) {
            let key = "okey" + i;
            threads.push(this.startWriter(key));
            threads.push(this.startReader("null", key));
            for(let region of this.regions) {
                threads.push(this.startReader(region, key));
            }
        }
        
        for (const thread of threads) {
            await thread;
        }
    }

    async agg() {
        const started = time_us();
        let legend = "#legend: time|writes|write-errors";
        let dims = ["writes", "err:writes", "null", "err:null"]
        for (let region of this.regions) {
            legend += "|" + region + "|err in " + region;
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
            
            let record = 
                "" + Math.floor((time - started) / (this.period * 1000)) + "\t" + 
                this.cps.getStat(dims).join("\t") +"\t" +
                moment().format("YYYY/MM/DD hh:mm:ss");

            console.info(record);
        }
    }

    async startWriter(key) {
        try {
            await this.db.create(key, "0000", 0);
        } catch (e) {
            await this.db.overwrite(key, "0000", 0);
        }
        
        let value = 0;
        while (this.isActive) {
            try {
                value++;
                await this.db.overwrite(key, "0000", value);
                this.cps.inc(time_us(), "writes");
            } catch (e) {  
                this.cps.inc(time_us(), "err:writes");
            }
        }
    }

    async startReader(region, key) {
        while (this.isActive) {
            try {
                await this.db.read(region, key);
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


async function start() {
    const webkv = new WebKV("127.0.0.1:13452");
    const topology = await webkv.topology();
    console.log(topology);

    //console.info(await webkv.read("null", "key0"));
    //console.info(await webkv.read(topology.regions[0], "key0"));
    //console.info(await webkv.read(topology.regions[1], "key0"));

    let test = new WriterReadersTest(webkv, 3, 1000);
    await test.run();
}

start()