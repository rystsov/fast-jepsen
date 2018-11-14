const {Oracle} = require("./workload/Oracle");
const {WebKV} = require("./workload/WebKV");
const {History} = require("./workload/History");
const {WriterReadersTest} = require("./workload/WriterReadersTest");
const uuid = require("uuid");

async function start() {
    const webkv = new WebKV("127.0.0.1:13452");
    const topology = await webkv.topology();
    console.log(topology);

    const oracle = new Oracle(uuid());
    const keys = ["key1", "key2"];

    for(let key of keys) {
        try {
            await webkv.create(key, oracle.initial, 0);
        } catch (e) {
            await webkv.overwrite(key, oracle.initial, 0);
        }
    }

    let test = new WriterReadersTest(new History("history.log"), oracle, webkv, keys, 1000);
    
    await test.run();
}

start()