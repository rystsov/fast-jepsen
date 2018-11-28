const request = require("request");

const TIMEOUT = 30000;

class PreconditionError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, PreconditionError)
    }
}

class WebKV {
    constructor(endpoint) {
        this.endpoint = endpoint;
    }

    async topology() {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'get',
                    url: "http://" + this.endpoint + "/topology",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(JSON.parse(body));
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async create(key, writeID, value) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    json:  {
                        key: key,
                        writeID: writeID,
                        value: value
                    },
                    url: "http://" + this.endpoint + "/create",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(body);
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async overwrite(key, writeID, value) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    json:  {
                        key: key,
                        writeID: writeID,
                        value: value
                    },
                    url: "http://" + this.endpoint + "/overwrite",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(body);
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async cas(key, prevWriteID, writeID, value) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'post',
                    json:  {
                        key: key,
                        prevWriteID: prevWriteID,
                        writeID: writeID,
                        value: value
                    },
                    url: "http://" + this.endpoint + "/cas",
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(body);
                        return;
                    }
                    if (res.statusCode == 409) {
                        reject(new PreconditionError());
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }

    async read(region, key) {
        return new Promise((resolve, reject) => {
            request(
                {
                    method: 'get',
                    url: "http://" + this.endpoint + "/read/" + region + "/" + key,
                    timeout: TIMEOUT
                }, 
                (err, res, body) => {
                    if (err != null) {
                        reject(new Error(err));
                        return;
                    }
                    if (res.statusCode == 200) {
                        resolve(JSON.parse(body));
                        return;
                    }
                    if (res.statusCode == 404 && res.headers["key-missing"]==42) {
                        resolve(null);
                        return;
                    }
                    reject(new Error("Unexpected return code: " + res.statusCode));
                }
            );
        });
    }
}

exports.WebKV = WebKV;
exports.PreconditionError = PreconditionError;