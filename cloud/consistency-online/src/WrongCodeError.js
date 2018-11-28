class WrongCodeError extends Error {
    constructor(...args) {
        super(...args)
        Error.captureStackTrace(this, WrongCodeError)
    }
}

exports.WrongCodeError = WrongCodeError;