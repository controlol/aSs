const { mongoError } = require('../utils/error');

const CONFIG = require('../../src/config.json'),
      allowRegister = CONFIG.allowRegister;

const User = require('../models/user.model'),
      Cookie = require('../models/cookie.model');
const { resolve } = require('bluebird');

exports.getIdentity = name => {
  return Cookie.findOne({name})
  .then(result => {
    if (!result) throw new mongoError("no result", "Cookie", name);

    return resolve({name, uuid: result.cookie})
  })
  .catch(err => {
    if (err instanceof mongoError) {
      if (err.message === "no result") return reject(`could not find "${err.key}" in ${err.collection}`)
    }
    return reject(err)
  })
}

exports.getIdentityString = name => {
  if (typeof name === "Object") return encodeURI(JSON.stringify(name)); // return the encoded string

  return Cookie.findOne({name})
  .then(result => {
    if (!result) throw new mongoError("no result", "Cookie", name);

    return resolve(encodeURI(JSON.stringify({name, uuid: result.cookie})))
  })
  .catch(err => {
    if (err instanceof mongoError) {
      if (err.message === "no result") return reject(`could not find "${err.key}" in ${err.collection}`)
    }
    return reject(err)
  })
}