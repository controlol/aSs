const router = require('express').Router();
const plexAPI = require('plex-api');
const crypto = require("crypto");
const CONFIG = require('../../src/config.json');

const plexLogin = require('../models/plexLogin.model');

const plexDeviceName = "Music sync for Plex";
const plexProduct = "Synchronize music from Spotify";

router.route('/login').post((req, res) => {
  const uuid = req.universalCookies.get('identity') ? req.universalCookies.get('identity').id : null; // This will be used as the Plex Identifier
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null; // Used to get information about the users plex account

  // get post values
  const plexName = req.body.plexName ? req.body.plexName : null;
  let plexPassword = req.body.plexPassword ? req.body.plexPassword : null;

  // Can't continue without the above variables
  if (!plexName || !plexPassword) res.json({error: "missing parameter"});
  if (!name || !uuid) res.json({error: "missing cookie"});

  // Defining key 
  const key = crypto.randomBytes(32);

  // Defining iv 
  const iv = crypto.randomBytes(16);

  // create a key en iv string to save to database
  const ivString = iv.toString('hex');
  const keyString = key.toString('hex');

  // Encrypts output 
  var encryptedPlexPassword = encrypt(plexPassword, key, iv);

  plexLogin.findOne({name})
  .then(result => {
    if (result) { // already found login info for this account
      // Update login info
      result.plexName = plexName;
      result.plexPassword = encryptedPlexPassword;
      result.ivString = ivString;
      
      // Save updated login info
      result.save()
      .then(() => {
        res.json({succes: "updated Plex login"})
      })
      .catch(err => {
        console.error(err);
        res.json({error: "could not save new Plex login", reason: err});
      })
    } else {
      // create new mongodb "query"
      const newLogin = new plexLogin({name, plexName, plexPassword: encryptedPlexPassword, keyString, ivString, plexIdentifier: uuid});

      newLogin.save()
      .then(() => {
        res.json({succes: "saved new Plex login"})
      })
      .catch(err => {
        console.error(err);
        res.json({error: "could not save new Plex login", reason: err});
      })
    }
  })
})

router.route('/check-login').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null; // Used to get information about the users plex account
  
  plexLogin.findOne({name})
  .then(result => {
    res.json({succes: `found user ${name}`, plexName: result.plexName});
  })
  .catch(err => {
    console.error(err);
    res.json({error: `user ${name} not found`})
  })
})

router.route('/logout').post((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null; // Used to get information about the users plex account

  // Need the identity cookie to logout
  if (!name) res.json({error: "missing cookie"});
  
  plexLogin.deleteOne({name})
  .then(() => {
    res.json({succes: `removed Plex login from ${name}`});
  })
  .catch(err => {
    console.error(err);
    res.json({error: err})
  })
})

router.route('/dothing').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null; // Used to get information about the users plex account

  if (!name) res.json({error: "missing cookie"});

  createPlexAPI(name)
  .then(client => {
    client.query("/library/metadata/183766")
    .then(result => {
      //result = result.MediaContainer;

      res.json({succes: result})
    }, err => {
      console.error("Could not connect to server", err);
      res.json({error: err})
    });
  })
  .catch(err => { // send the result
    res.json(err);
  })
})

let createPlexAPI = (name) => {
  return new Promise((resolve, reject) => {
    plexLogin.findOne({name})
    .then(result => {
      if (!result) reject({error: `Didn't find Plex login information for ${name}`}); // if there is no result stop
      
      const plexPassword = decrypt(result.plexPassword, result.keyString, result.ivString);

      let options = {
        hostname: CONFIG.plexHostname,
        port: CONFIG.plexPort,
        https: CONFIG.plexHTTPS,
        username: result.plexName,
        password: plexPassword,
        options: {
          identifier: result.plexIdentifier,
          product: plexProduct,
          deviceName: plexDeviceName
        }
      }

      let client = new plexAPI(options);
      resolve(client);
    })
    .catch(err => {
      console.log(err)
      reject({error: `Didn't find Plex login information for ${name}`});
    })
  })
}

// An encrypt function 
function encrypt(text, key, iv) { 
  // Creating Cipheriv with its parameter 
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv); 

  // Updating text 
  let encrypted = cipher.update(text); 

  // Using concatenation 
  encrypted = Buffer.concat([encrypted, cipher.final()]); 

  // Returning iv and encrypted data 
  return encrypted.toString('hex'); 
} 

// A decrypt function 
function decrypt(text, key, iv) { 
  iv = Buffer.from(iv, 'hex');
  key = Buffer.from(key, 'hex');
  let encryptedText = Buffer.from(text, 'hex');

  // Creating Decipher 
  let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  // Updating encrypted text 
  let decrypted = decipher.update(encryptedText); 
  decrypted = Buffer.concat([decrypted, decipher.final()]); 

  // returns data after decryption 
  return decrypted.toString(); 
}

module.exports = router;