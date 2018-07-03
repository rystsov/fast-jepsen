const express = require("express");
const bodyParser = require("body-parser");

class RemoteTesterServer {
    constructor(kv, port) {
        this.kv = kv;
        this.gen = 0;
        this.active = false;
        this.info = {
            success: 0,
            failures: 0
        };
        this.port = port;
        this.app = express();
        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.json());
        const router = express.Router();

        router.route("/create").post((req, res) => {
            this.create(req, res);
        });
        router.route("/read/:key").get((req, res) => {
            this.read(req, res);
        });
        router.route("/overwrite").post((req, res) => {
            this.overwrite(req, res);
        });
        router.route("/cas").post((req, res) => {
            this.cas(req, res);
        });
        router.route("/primary").get((req, res) => {
            this.primary(req, res);
        });

        this.app.use('/', router);
    }

    primary(req, res) {
        (async () => {
            res.status(200).json({
                "primary": await this.kv.primary()
            });
        })();
    }

    create(req, res) {
        (async () => {
            try {
                const key = req.body.key;
                const value = req.body.value;
                const writeID = req.body.writeID;
                await this.kv.create(key, writeID, value);
                res.status(200).json({
                    "key": key,
                    "value": value
                });
            } catch (e) {
                res.status(500).json({
                    "message": e.message
                });
            }
        })();
    }

    overwrite(req, res) {
        (async () => {
            try {
                const key = req.body.key;
                const value = req.body.value;
                const writeID = req.body.writeID;
                await this.kv.overwrite(key, writeID,value);
                res.status(200).json({
                    "key": key,
                    "value": value
                });
            } catch (e) {
                res.status(500).json({
                    "message": e.message
                });
            }
        })();
    }

    cas(req, res) {
        (async () => {
            try {
                const key = req.body.key;
                const value = req.body.value;
                const prevWriteID = req.body.prevWriteID;
                const writeID = req.body.writeID;
                await this.kv.cas(key, prevWriteID, writeID, value);
                res.status(200).json({
                    "key": key,
                    "value": value
                });
            } catch (e) {
                res.status(500).json({
                    "message": e.message
                });
            }
        })();
    }

    read(req, res) {
        (async () => {
            const key = req.params.key;
            const read = await this.kv.read(key);
            res.status(200).json({
                "key": key,
                "value": read.value,
                "writeID": read.writeID
            });
        })();
    }
    
    start() {
        this.server = this.app.listen(this.port);
    }

    close() {
        this.server.close();
    }
}

exports.RemoteTesterServer = RemoteTesterServer;
