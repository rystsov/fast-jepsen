const MongoClient = require('mongodb').MongoClient;

class MongoKV {
    constructor(url) {
        this.url = url;
        this.client = null;
    }

    async read(key) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            const data = await collection.find(
                {"key": key},
                { readConcern: { level: "linearizable" } }
            ).toArray();
            if (data.length==0) {
                return null;
            } else {
                return data[0].val;
            }
        } catch (e) {
            this.reset();
            throw e;
        }
    }

    async create(key, val) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            await collection.insertOne({
                "key": key,
                "val": val
            }, { writeConcern: { w: "majority" } });
        } catch (e) {
            this.reset();
            throw e;
        }
    }

    async update(key, val) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            await collection.updateOne(
                {"key": key}, {$set: {"val": val}},
                { writeConcern: { w: "majority" } }
            );
        } catch (e) {
            this.reset();
            throw e;
        }
    }

    async primary() {
        try {
            const client = await this.connect();
            var info = await client.db("admin").command({replSetGetStatus: 1});
            var name = info.members.filter(x=>x.stateStr=="PRIMARY")[0].name;
            return name.substring(0, name.indexOf(":"));
        } catch (e) {
            this.reset();
            throw e;
        }
    }
    
    connect() {
        return new Promise((respond, reject) => {
            if (this.client != null) {
                respond(this.client);
            } else {
                MongoClient.connect(this.url, {
                    db: { bufferMaxEntries: 0 }
                  }, (err, client) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.client = client;
                        respond(this.client);
                    }
                });
            }
        });
    }

    reset() {
        if (this.client != null) {
            try { this.client.close(); } catch(e) { }
            this.client = null;
        }
    }
}

exports.MongoKV = MongoKV;