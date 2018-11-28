class WrongHistoryError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, WrongHistoryError)
    }
}

exports.WrongHistoryError = WrongHistoryError;