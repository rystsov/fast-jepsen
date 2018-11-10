const {MongoKV} = require("./src/MongoKV");
const {RemoteTesterServer} = require("./src/RemoteTesterServer");

async function start() {
    const kvs = new MongoKV(
        "rystsov-mongo-42.documents.azure.com",
        10255,
        "rystsov-mongo-42",
        ""
    );
    await kvs.init();
    const service = new RemoteTesterServer(kvs, 13452);
    service.start();
}

start()