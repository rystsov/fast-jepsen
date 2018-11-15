const fs = require("fs");

class History {
    constructor(path) {
        this.path = path;
        this.clock = 0;
        this.log = [];
        this.pending = 0;
    }

    record(event) {
        this.log.push(event);
        this.pending += 1;
    }

    ts() {
        this.clock += 1;
        return this.clock;
    }

    async dump() {
        const file = await new Promise((resolve, reject) => {
            fs.open(this.path, 'a', (err, fd) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(fd);
                }
            })
        });
        
        while (true) {
            const pending = this.pending;
            if (pending > 0) {
                let data = this.log;
                this.log = [];
                data = data.join("\n") + "\n";
                
                await new Promise((resolve, reject) => {
                    fs.appendFile(file, data, 'utf8', (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(true);
                        }
                    });
                });

                this.pending -= pending;
            }
            await new Promise((resolve, reject) => {
                setTimeout(() => resolve(true), 0);
            });
        }
    }
}

exports.History = History;