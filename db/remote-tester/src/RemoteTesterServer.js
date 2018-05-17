const express = require("express");
const bodyParser = require("body-parser");
const moment = require("moment");

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
        router.route("/update").post((req, res) => {
            this.update(req, res);
        });

        this.app.use('/', router);
    }

    create(req, res) {
        (async () => {
            const key = req.body.key;
            const value = req.body.value;
            await this.kv.create(key, value);
            res.status(200).json({
                "key": key,
                "value": value
            });
        })();
    }

    read(req, res) {
        (async () => {
            const key = req.params.key;
            const value = await this.kv.read(key);
            res.status(200).json({
                "key": key,
                "value": value
            });
        })();
    }

    update(req, res) {
        (async () => {
            const key = req.body.key;
            const value = req.body.value;
            await this.kv.update(key, value);
            res.status(200).json({
                "key": key,
                "value": value
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
