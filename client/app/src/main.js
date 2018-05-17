const request = require("request");
const leftPad = require('left-pad');

class KVApiClient {
    constructor(host, port) {
        this.url = `http://${host}:${port}`;
        this.id = host;
    }
    read(key) {
        var url = this.url + "/read/" + key;
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'get',
                    url: url,
                    timeout: 1000
                }, 
                (err, res, body) => {
                    if (err) {
                        reject(new Error(`Error :-(: ${err} on ${url}`));
                        return;
                    }
                    if (res.statusCode == 200) {
                        try {
                            resolve(JSON.parse(res.body).value);
                        } catch(e) {
                            reject("Can't parse: " + res.body);
                        }
                        return;
                    }
                    reject(new Error(`Unexpected return code: ${res.statusCode} on ${url}`));
                }
            );
        });
    }
    create(key, value) {
        var url = this.url + "/create";
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    body: {
                        key: key,
                        value: value
                    },
                    url: url,
                    json: true,
                    timeout: 1000
                }, 
                (err, res, body) => {
                    if (err) {
                        reject(new Error(`Error :-(: ${err} on ${url}`));
                        return;
                    }
                    if (res.statusCode == 200) {
                        try {
                            resolve(res.body);
                        } catch(e) {
                            reject("Can't parse: " + res.body);
                        }
                        return;
                    }
                    reject(new Error(`Unexpected return code: ${res.statusCode} on ${url}`));
                }
            );
        });
    }
    update(key, value) {
        var url = this.url + "/update";
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    body: {
                        key: key,
                        value: value
                    },
                    url: url,
                    json: true,
                    timeout: 1000
                }, 
                (err, res, body) => {
                    if (err) {
                        reject(new Error(`Error :-(: ${err} on ${url}`));
                        return;
                    }
                    if (res.statusCode == 200) {
                        try {
                            resolve(res.body);
                        } catch(e) {
                            reject("Can't parse: " + res.body);
                        }
                        return;
                    }
                    reject(new Error(`Unexpected return code: ${res.statusCode} on ${url}`));
                }
            );
        });
    }
}

const history = new Map();

history.set("key1", []);
history.set("key2", []);
history.set("key3", []);

let isActive = true;

let stat = new Map();
for (let key of ["key1", "key2", "key3"]) {
    stat.set(key, {
        "w":     [0,0],
        "node1": [0,0],
        "node2": [0,0],
        "node3": [0,0]
    });
}

async function init(key, kv) {
    const dash = stat.get(key);
    const log  = history.get(key);
    await kv.create(key, "0");
    await kv.update(key, "0");
    dash.w[0]++;
    log.push(["0", true]);
}

async function write(kv, key) {
    const dash = stat.get(key);
    const log  = history.get(key);
    
    let i=0;
    while (isActive) {
        i++;
        try {
            const attempt = ["" + i, false];
            log.push(attempt);
            await kv.update(key, attempt[0]);
            attempt[1] = true;
            dash.w[0]++;
        } catch (e) {
            dash.w[1]++;
        }
    }
}

async function read(kv, nodeId, key) {
    const dash = stat.get(key);
    const log  = history.get(key);
    
    while (isActive) {
        try {
            let from = log.length - 1;
            while (!log[from][1]) {
                from--;
            }
            const front = from;
            const value = await kv.read(key);
            while (from < log.length) {
                if (log[from][0] == value) {
                    break;
                }
                from++;
            }
            if (from == log.length) {
                isActive = false;
                console.info("read never written or stale data: " + value);
                console.info("known value on the beginning of the read is: " + front);
                return;
            }
            log[from][1] = true;
            dash[nodeId][0]++;
        } catch (e) {
            dash[nodeId][1]++;
        }
    }
}

async function control() {
    let ts = 0;
    while (isActive) {
        await new Promise((resolve, reject) => {
            setTimeout(() => resolve(true), 1000);
        });
        let info = leftPad(ts, 5);

        for (let key of ["key1", "key2", "key3"]) {
            info += " ||";
            const dash = stat.get(key);
            info += leftPad(dash.w[0], 5);
            info += leftPad(dash.w[1], 5);
            info += leftPad(dash.node1[0], 5);
            info += leftPad(dash.node1[1], 5);
            info += leftPad(dash.node2[0], 5);
            info += leftPad(dash.node2[1], 5);
            info += leftPad(dash.node3[0], 5);
            info += leftPad(dash.node3[1], 5);
            dash.node1 = [0, 0];
            dash.node2 = [0, 0];
            dash.node3 = [0, 0];
            dash.w = [0, 0];
        }

        console.info(info);
        ts++;
    }
}

(async () => {
    for (const [node, key] of [["node1", "key1"],["node2", "key2"],["node3", "key3"]]) {
        await init(key, new KVApiClient(node, 8000));
    }
    control();
    for (const [node, key] of [["node1", "key1"],["node2", "key2"],["node3", "key3"]]) {
        write(new KVApiClient(node, 8000), key);
    }

    for (const key of ["key1", "key2", "key3"]) {
        read(new KVApiClient("node1", 8000), "node1", key);
        read(new KVApiClient("node2", 8000), "node2", key);
        read(new KVApiClient("node3", 8000), "node3", key);
    }
})();
