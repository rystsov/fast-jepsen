class ConsistencyViolationError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, ConsistencyViolationError)
    }
}

exports.ConsistencyViolationError = ConsistencyViolationError;