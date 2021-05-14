const express = require('express'),
      router = express.Router(),
      bcrypt = require('bcrypt'),
      { mongoError } = require('../utils/error'),
      CONFIG = require('../../src/config.json'),
      allowRegister = CONFIG.allowRegister,
      User = require('../models/user.model'),
      Cookie = require('../models/cookie.model')

const generateRandomString = length => {
  let text = ''
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  for (let i = 0; i < length; i++) text += possible.charAt(Math.floor(Math.random() * possible.length))
  return text
}

function createCookie(name) {
  let expire = new Date()

  let cookie = generateRandomString(64)
  expire.setDate(expire.getDate() + 14)

  const newCookie = new Cookie({name, cookie, expire})

  return new Promise((resolve, reject) => {
    return newCookie.save()
    .then(() => resolve({cookie, expire}))
    .catch(err => reject("Could not store cookie: ", err))
  })
}

router.route('/login').post((req, res) => {
  let name = req.body.name
  let password = req.body.password

  return User.findOne({name: name})
  .then(user => {
    let hashedPassword = user.password
    let name = user.name

    bcrypt.compare(password, hashedPassword, function(err, result) {
      if (result) {
        return createCookie(name)
        .then(result => res.json({status: "success", valid: 1, cookie: result.cookie, expire: result.expire}))
        .catch(err => {
          console.log(err)
          return res.json({status: "Could not store cookie", valid: 0})
        })
      } else {
        console.error("bcrypt error", err)
        return res.json({status: 'Invalid password!', valid: 0})
      }
    })
  })
  .catch(err => res.json({status: 'Unknown Username!', valid: 0}))
})

router.route('/register').post((req, res, next) => {
  if (!allowRegister) return res.json({error: "registering has been disabled"})

  const name = req.body.name
  let password = req.body.password
  const salt = bcrypt.genSaltSync(10)

  password = bcrypt.hashSync(password, salt)

  const newUser = new User({name, salt, password})

  return newUser.save()
  .then(() => res.json('User added!'))
  .catch(err => res.status(400).json('Error: ' + err))
})

router.route('/validatecookie').post((req, res) => {
  let name = req.body.name
  let cookie = req.body.id
  let validate = req.body.validate

  return Cookie.findOne({name, cookie})
  .then(result => {
    if (new Date(result.expire) > new Date()) return res.json({valid: 1, validate})

    return Cookie.deleteOne({_id: result._id})
    .then(() => res.json({valid: 0, status: "Cookie expired and was deleted"}))
    .catch(() => res.json({valid: 0, status: "Could not delete cookie"}))
  })
  .catch(err => {
    console.log(err)
    return res.json({valid: 0, status: "Could not find cookie"})
  })
})

router.route('/deletecookie').post((req, res) => {
  let cookie = req.body.id

  return Cookie.deleteOne({cookie})
  .then(() => res.json({valid: 1, status: "Cookie was deleted"}))
  .catch(err => {
    console.error(err)
    return res.json({valid: 0, status: "Could not delete cookie"})
  })
})

router.route('/get-arl').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null // eventually this should only be available through cookies

  if (!name) return res.json({error: "missing parameter"})

  return User.findOne({name})
  .then(result => {
    if (!result) throw new mongoError("no result", "User", name)

    return res.json({arl: result.arl ? result.arl : ''})
  })
  .catch(err => {
    if (err instanceof mongoError && err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})

    console.error(err)
    return res.json({error: "unknown error"})
  })
})

router.route('/set-arl').post((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null, // eventually this should only be available through cookies
        arl = req.body.arl ? req.body.arl : null

  if (!name || !arl) return res.json({error: "missing parameter"})

  return User.findOne({name})
  .then(result => {
    if (!result) throw new mongoError("no result", "User", name)

    result.arl = arl

    return result.save()
    .then(() => res.json({success: "updated arl for " + name}))
    .catch(err => { throw new mongoError("update", "User", "arl") })
  })
  .catch(err => {
    if (err instanceof mongoError) {
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
      if (err.message === "update") return res.json({error: `could not update "${err.key}" in ${err.collection}`})
    }
    console.error(err)
    return res.json({error: "unknown error"})
  })
})

module.exports = router