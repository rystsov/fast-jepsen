class SlidingCounters {
    constructor() {
        this.queue = [];
        this.stat = new Map();
    }
    inc(ts, counter) {
        if (!this.stat.has(counter)) {
            this.stat.set(counter, 0);
        }
        this.stat.set(counter, this.stat.get(counter) + 1);
        this.queue.push({ ts, counter });
    }
    forgetBefore(ts) {
        let dropped = 0;
        while (this.queue.length > 0 && this.queue[0].ts < ts) {
            dropped += 1;
            const record = this.queue.shift();
            this.stat.set(record.counter, this.stat.get(record.counter) - 1);
        }
    }
    getStat(marks) {
        let slice = [];
        for (const mark of marks) {
            let count = 0;
            if (this.stat.has(mark)) {
                count = this.stat.get(mark);
            }
            slice.push(count);
        }
        return slice;
    }
}

exports.SlidingCounters = SlidingCounters;