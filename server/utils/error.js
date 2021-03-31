exports.mongoError = class mongoError extends Error {
  constructor(message, collection, errors, key, value) {
    super(message)
    this.collection = collection
    this.name = "mongoError"
    this.errors = JSON.stringify(errors, null, 2)
    this.key = key // requested value or updated key
    this.value = value
  }
}

exports.downloadError = class downloadError extends Error {
  constructor(message) {
    super(message)
    this.name = "downloadError"
  }
}

exports.fsError = class fsError extends Error {
  constructor(message, location, location2) {
    super(message)
    this.name = "fsError"
    this.location = location
    this.location2 = location2
  }
}

exports.XHRerror = class XHRerror extends Error {
  constructor(message, status, config) {
    super(message)
    this.name = "XHRerror"
    this.status = status // ie 504
    this.axiosConfig = JSON.stringify(config, null, 2)
  }
}