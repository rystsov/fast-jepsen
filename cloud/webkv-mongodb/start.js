const {MongoKV} = require("./src/MongoKV");
const {RemoteTesterServer} = require("./src/RemoteTesterServer");
const fs = require("fs");
const process = require("process");

async function start(settings) {
    const kvs = new MongoKV(
        settings.mongodb.host,
        settings.mongodb.port,
        settings.mongodb.userName,
        settings.mongodb.pwd,
        settings.mongodb.poolSize
    );
    await kvs.init();
    const service = new RemoteTesterServer(kvs, settings.port);
    service.start();
}

let settings = fs.readFileSync(process.argv[2], "utf8");
settings = JSON.parse(settings);
start(settings);