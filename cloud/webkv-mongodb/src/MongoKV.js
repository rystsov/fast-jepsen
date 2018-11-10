const MongoClient = require('mongodb').MongoClient;
const ReadPreference = require('mongodb').ReadPreference;

function connect(connectionString) {
    return new Promise((respond, reject) => {
        MongoClient.connect(
            connectionString,
            (err, client) => {
                if (err) {
                    reject(err);
                } else {
                    respond(client);
                }
            }
        );
    });
}

class MongoKV {
    constructor(host, port, userName, pwd) {
        this.DB_NAME = "lily";
        this.COLLECTION_NAME = "storage";
        
        this.host = host;
        this.port = port;
        this.userName = userName;
        this.pwd = pwd;
        
        this.regionByHost = null;
        this.primary = null;
        this.conn = null;
    }

    async topology() {
        try {
            const conn = await this.connect();
            const info = await conn.db("admin").command({ismaster: 1});
            this.primary = this.regionByHost.get(info.primary);
            return {
                primary: this.primary,
                regions: Array.from(this.regionByHost.values())
            }
        } catch(e) {
            this.close();
            throw e;
        }
    }

    async create(key, writeID, val) {
        try {
            const conn = await this.connect();
            const db = conn.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);
            
            var status = await collection.insertOne(
                { "_id": key,
                  "writeID": writeID,
                  "val": val
                },
                { writeConcern: { w: "majority" } }
            );

            if (status.insertedCount != 1) {
                throw new Error(`status.insertedCount (=${status.insertedCount}) != 1`);
            }
        } catch (e) {
            this.close();
            throw e;
        }
    }

    async overwrite(key, writeID, val) {
        try {
            const client = await this.connect();
            const db = client.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);
            
            var status = await collection.updateOne(
                { "_id": key},
                { $set: {"writeID": writeID, "val": val}},
                { writeConcern: { w: "majority" } }
            );

            if (status.modifiedCount != 1) {
                throw new Error(`status.modifiedCount (=${status.modifiedCount}) != 1`);
            }
        } catch (e) {
            this.close();
            throw e;
        }
    }

    async cas(key, prevWriteID, writeID, val) {
        try {
            const client = await this.connect();
            const db = client.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);
            
            var status = await collection.updateOne(
                {"_id": key, "writeID": prevWriteID },
                {$set: {"val": val, "writeID": writeID}},
                { writeConcern: { w: "majority" } }
            );

            if (status.modifiedCount != 1) {
                throw new Error(`Precondition failed: status.modifiedCount (=${status.modifiedCount}) != 1`);
            }
        } catch (e) {
            this.close();
            throw e;
        }
    }

    async read(region, key) {
        try {
            const client = await this.connect();
            const db = client.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);

            // for some reason only "local" (out of linearizable, majority, available and local) is available
            let readPreference = null;
            if (this.primary == region) {
                readPreference = ReadPreference.PRIMARY;
            } else {
                readPreference = new ReadPreference(ReadPreference.SECONDARY, [{"region": region}]);
            }
            
            const data = await collection.find(
                { "_id": key},
                { readConcern: { level: "local" },
                  readPreference: readPreference
                }
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
            this.close();
            throw e;
        }
    }

    async init() {
        let conn = null;
        let replicas = null;
        try {
            conn = await connect(`mongodb://${this.userName}:${this.pwd}@${this.host}:${this.port}/?ssl=true&replicaSet=globaldb&connectTimeoutMS=20000&socketTimeoutMS=20000`);
            const info = await conn.db("admin").command({ismaster: 1});
            replicas = info.hosts;
        } finally {
            try {
                conn.close();
            } catch(e) {}
        }

        const regionByHost = new Map();
        for (let replica of replicas) {
            try {
                conn = await connect(`mongodb://${this.userName}:${this.pwd}@${replica}/?ssl=true&connectTimeoutMS=20000&socketTimeoutMS=20000`);
                const info = await conn.db("admin").command({ismaster: 1});
                regionByHost.set(replica, info.tags.region);
            } finally {
                try {
                    conn.close();
                } catch(e) {}
            }
        }
        this.regionByHost = regionByHost;
    }

    async connect() {
        if (this.conn == null) {
            const conn = await connect(`mongodb://${this.userName}:${this.pwd}@${this.host}:${this.port}/?ssl=true&replicaSet=globaldb&connectTimeoutMS=20000&socketTimeoutMS=20000`);
            const info = await conn.db("admin").command({ismaster: 1});
            this.conn = conn;
            this.primary = this.regionByHost.get(info.primary);
        }

        return this.conn;
    }

    close() {
        if (this.conn != null) {
            const conn = this.conn;
            this.conn = null;
            try { conn.close(); } catch(e) { }
        }
    }
}

exports.MongoKV = MongoKV;