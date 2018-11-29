const fs = require("fs");

class Logger {
    constructor(path) {
        this.path = path;
        this.log = [];
        this.pending = 0;
        this.isActive = false;
    }

    record(line) {
        this.log.push(line);
        this.pending += 1;
    }

    async start() {
        this.isActive = true;
        
        const file = fs.openSync(this.path, 'a');
        
        while (this.isActive) {
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

        fs.closeSync(file);
    }

    stop() {
        this.isActive = false;
    }
}

exports.Logger = Logger;