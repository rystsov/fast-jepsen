const MongoClient = require('mongodb').MongoClient;
const ReadPreference = require('mongodb').ReadPreference;
const MongoError = require('mongodb').MongoError;

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

async function loadTopology(userName, pwd, host, port) {
    let conn = null;
    let replicas = null;
    let primary = null;
    try {
        conn = await connect(`mongodb://${userName}:${pwd}@${host}:${port}/?ssl=true&replicaSet=globaldb&connectTimeoutMS=30000&socketTimeoutMS=30000`);
        const info = await conn.db("admin").command({ismaster: 1});
        primary = info.primary;
        replicas = info.hosts;
    } finally {
        try {
            conn.close();
        } catch(e) {}
    }

    const regionByHost = new Map();
    for (let replica of replicas) {
        try {
            conn = await connect(`mongodb://${userName}:${pwd}@${replica}/?ssl=true&connectTimeoutMS=30000&socketTimeoutMS=30000`);
            const info = await conn.db("admin").command({ismaster: 1});
            regionByHost.set(replica, info.tags.region);
        } finally {
            try {
                conn.close();
            } catch(e) {}
        }
    }
    
    return {
        regions: Array.from(regionByHost.values()),
        primary: regionByHost.get(primary)
    };
}

class PreconditionError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, PreconditionError)
    }
}

class NotPrimaryError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, NotSecondaryError)
    }
}

class NotSecondaryError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, NotSecondaryError)
    }
}

class MongoKV {
    constructor(host, port, userName, pwd, poolSize) {
        this.DB_NAME = "lily";
        this.COLLECTION_NAME = "storage";
        
        this.host = host;
        this.port = port;
        this.userName = userName;
        this.pwd = pwd;
        
        this.regions = null;
        
        this.pool = [];
        for (var i=0;i<poolSize;i++) {
            this.pool.push({
                conn: null
            });
        }
    }

    async acquireConn() {
        let connHolder = { conn: null };
        
        if (this.pool.length > 0) {
            connHolder = this.pool.shift();
        }

        if (connHolder.conn == null) {
            const conn = await connect(`mongodb://${this.userName}:${this.pwd}@${this.host}:${this.port}/?ssl=true&replicaSet=globaldb&connectTimeoutMS=30000&socketTimeoutMS=30000`);
            return conn;
        }

        return connHolder.conn;
    }

    releaseConn(conn) {
        this.pool.push({conn: conn});
    }

    recycleConn(conn) {
        if (conn != null) {
            try {
                conn.close();
            } catch(e) {}
        }
        this.pool.push({conn: null});
    }

    async topology() {
        const topology = await loadTopology(this.userName, this.pwd, this.host, this.port);
        this.regions = topology.regions;
        return topology;
    }

    async create(key, writeID, val) {
        let conn = null;
        let status = null;
        try {
            conn = await this.acquireConn();
            const db = conn.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);
            
            status = await collection.insertOne(
                { "_id": key,
                  "writeID": writeID,
                  "val": val
                },
                { writeConcern: { w: "majority" } }
            );
            this.releaseConn(conn);
        } catch (e) {
            this.recycleConn(conn);
            throw e;
        }
        if (status.insertedCount != 1) {
            throw new Error(`status.insertedCount (=${status.insertedCount}) != 1`);
        }
    }

    async overwrite(key, writeID, val) {
        let conn = null;
        let status = null;
        try {
            conn = await this.acquireConn();
            const db = conn.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);
            
            status = await collection.updateOne(
                { "_id": key},
                { $set: {"writeID": writeID, "val": val}},
                { writeConcern: { w: "majority" } }
            );
            this.releaseConn(conn);
        } catch (e) {
            if (e instanceof MongoError) {
                if (e.code == 10107) {
                    this.releaseConn(conn);
                    throw new NotPrimaryError();
                }
            }
            this.recycleConn(conn);
            throw e;
        }
        if (status.modifiedCount != 1) {
            throw new Error(`status.modifiedCount (=${status.modifiedCount}) != 1`);
        }
    }

    async cas(key, prevWriteID, writeID, val) {
        let conn = null;
        let status = null;
        try {
            conn = await this.acquireConn();
            const db = conn.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);
            
            status = await collection.updateOne(
                {"_id": key, "writeID": prevWriteID },
                {$set: {"val": val, "writeID": writeID}},
                { writeConcern: { w: "majority" } }
            );
            this.releaseConn(conn);
        } catch (e) {
            if (e instanceof MongoError) {
                if (e.code == 10107) {
                    this.releaseConn(conn);
                    throw new NotPrimaryError();
                }
            }
            this.recycleConn(conn);
            throw e;
        }
        if (status.modifiedCount != 1) {
            throw new PreconditionError(`Precondition failed: status.modifiedCount (=${status.modifiedCount}) != 1`);
        }
    }

    async read(region, key) {
        if (region != null && !this.regions.includes(region)) {
            throw new Error("Unknown region: " + region);
        }
        
        let conn = null;
        let data = null
        try {
            conn = await this.acquireConn();
            const db = conn.db(this.DB_NAME);
            const collection = db.collection(this.COLLECTION_NAME);

            // for some reason only "local" (out of linearizable, majority, available and local) is available

            let readPreference = null;
            if (region == null) {
                readPreference = ReadPreference.PRIMARY;
            } else {
                readPreference = new ReadPreference(ReadPreference.SECONDARY, [{"region": region}]);
            }
            
            data = await collection.find(
                { "_id": key},
                { readConcern: { level: "local" },
                  readPreference: readPreference
                }
            ).toArray();

            this.releaseConn(conn);
        } catch (e) {
            if (e.message == "Cannot read property 'wireProtocolHandler' of null") {
                // got this error because we're trying to read from primary
                // thinking that's secondary, kinda expected exception
                // so do not recycle
                this.releaseConn(conn);
                throw new NotSecondaryError();
            } else {
                this.recycleConn(conn);
                throw e;
            }
        }
        if (data.length==0) {
            return null;
        } else {
            return {
                "value": data[0].val,
                "writeID": data[0].writeID
            };
        }
    }

    async init() {
        const topology = await loadTopology(this.userName, this.pwd, this.host, this.port);
        this.regions = topology.regions;
    }

    close() {
        for(let connHolder of this.pool) {
            if (connHolder.conn != null) {
                try {
                    connHolder.close();
                } catch(e) {}
            }
        }
    }
}

exports.MongoKV = MongoKV;
exports.PreconditionError = PreconditionError;
exports.NotSecondaryError = NotSecondaryError;
exports.NotPrimaryError = NotPrimaryError;