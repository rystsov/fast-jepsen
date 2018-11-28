const {Oracle} = require("./src/Oracle");
const {WebKV} = require("./src/WebKV");
const {OnlineChecker} = require("./src/OnlineChecker");
const {WriterReadersTest} = require("./src/WriterReadersTest");
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

    const checker = new OnlineChecker(oracle.initial, 0);

    let test = new WriterReadersTest(checker, oracle, webkv, keys, 1000);
    
    await test.run();
}

start()