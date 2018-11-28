class KeyOracle {
    constructor(initial) {
        this.pending = new Map();
        this.accepted = new Map();
        this.last = initial;
        this.latests = [initial];
        this.cache = []
    }

    guess() {
        if (randomUpTo(1)==0) {
            return this.last;
        } else {
            return this.latests[randomUpTo(this.latests.length - 1)];
        }
    }

    propose(prev, next) {
        if (this.pending.has(next)) {
            throw new Error("Next must be unique");
        }
        if (this.accepted.has(next)) {
            throw new Error("Next must be unique");
        }
        this.pending.set(next, prev);
        this.cache.push(next);

        if (this.cache > 100) {
            const old = this.cache.shift();
            if (this.pending.has(old)) {
                this.pending.delete(old);
            }
            if (this.accepted.has(next)) {
                this.accepted.delete(old);
            }
        }
    }

    observe(value) {
        this.latests.push(value);
        if (this.latests.length > 5) {
            this.latests.shift();
        }
        
        if (this.accepted.has(value)) {
            return;
        }

        this.last = value;

        while (this.pending.has(value)) {
            const to = this.pending.get(value)
            this.accepted.set(value, to);
            this.pending.delete(value);
            value = to;
        }
    }
}

class Oracle {
    constructor(initial) {
        this.initial = initial;
        this.keyOracles = new Map();
    }

    guess(key) {
        return this.oracle(key).guess();
    }

    propose(key, prev, next) {
        return this.oracle(key).propose(prev, next);
    }

    observe(key, value) {
        return this.oracle(key).observe(value);
    }

    oracle(key) {
        if (!this.keyOracles.has(key)) {
            this.keyOracles.set(key, new KeyOracle(this.initial));
        }
        return this.keyOracles.get(key);
    }
}

function randomUpTo(high) {
    return Math.floor(Math.random() * (high + 1))
}

exports.Oracle = Oracle;