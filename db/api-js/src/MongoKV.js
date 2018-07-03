const MongoClient = require('mongodb').MongoClient;

class MongoKV {
    constructor(url) {
        this.url = url;
        this.client = null;
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

    async create(key, writeID, val) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            var status = await collection.insertOne({
                "key": key,
                "writeID": writeID,
                "val": val
            }, { writeConcern: { w: "majority" } });

            if (status.insertedCount != 1) {
                throw new Error(`status.insertedCount (=${status.insertedCount}) != 1`);
            }
        } catch (e) {
            this.reset();
            throw e;
        }
    }

    async overwrite(key, writeID, val) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            var status = await collection.updateOne(
                {"key": key}, {$set: {"writeID": writeID, "val": val}},
                { writeConcern: { w: "majority" } }
            );

            if (status.modifiedCount != 1) {
                throw new Error(`status.modifiedCount (=${status.modifiedCount}) != 1`);
            }
        } catch (e) {
            this.reset();
            throw e;
        }
    }

    async cas(key, prevWriteID, writeID, val) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            var status = await collection.updateOne(
                {"key": key, "writeID": prevWriteID }, {$set: {"val": val, "writeID": writeID}},
                { writeConcern: { w: "majority" } }
            );

            if (status.modifiedCount != 1) {
                throw new Error(`Precondition failed: status.modifiedCount (=${status.modifiedCount}) != 1`);
            }
        } catch (e) {
            this.reset();
            throw e;
        }
    }

    async read(key) {
        try {
            const client = await this.connect();
            const db = client.db("lily");
            const collection = db.collection("storage");
            
            const data = await collection.find(
                {"key": key}
            ).toArray();
            if (data.length==0) {
                return null;
            } else {
                return {
                    "value": data[0].val,
                    "writeID": data[0].writeID
                };
            }
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