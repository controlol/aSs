const router = require('express').Router();
let smloadr = require('../smloadr/smloadr-class');
const fs = require('fs');
const path = require('path');
let archiver = require('archiver');
let sanitize = require('sanitize-filename');
let querystring = require('querystring');
const axios = require('axios');
const Promise = require('bluebird');
const {mongoError, downloadError, fsError} = require('../utils/error');
// const sqlite3 = require('sqlite3').verbose(); for opening plex database and getting the "key" of a media file based on the path/file location

const SongMatch = require('../models/songMatch.model');
const Playlist = require('../models/playlist.model');

const CONFIG = require('../../src/config.json');
const concurrentDownloads = CONFIG.concurrentDownloads;

const baseurl = 'http://localhost:8888'; //baseurl for API queries

//spotify API limits
const spotifyLimit = 100;

//smloadr settings
let rootFolder = smloadr.setDownloadPath(CONFIG.downloadLocation);
let arl = CONFIG.arl;
smloadr.initApp(arl)
.then(msg => {
  console.log(msg);
})

let quality = CONFIG.quality;
smloadr.setMusicQuality(quality)
.then(result => {
  console.log(result)
})

// download a single track, required: deezerID 
router.route('/track').get( async (req, res, next) => {
  let deezerID = req.query.deezerID ? req.query.deezerID : res.json({error: "No deezerID provided"}),
      playlistID = req.query.playlistID ? req.query.playlistID : null,
      optimizedFS = CONFIG.optimizedFS, //should the FS be optimized for plex or just playlist folders
      exists = false,
      playlistTitle,
      location;

  if (!deezerID || typeof optimizedFS !== "boolean") {
    res.json({error: "Missing parameter"})
    next()
  } 

  if (optimizedFS && !playlistID) res.json({error: "Can not download single track with optimizedFS enabled"});
    
  axios.get("https://deezer.com/us/track/"+deezerID) // try if the track is available
  .then(() => {
    let resMatch = await SongMatch.findOne({deezerID})
    
    location = resMatch.location;

    if (!playlistID) {
      if (location) await Promise.map(location, (location) => {
        fs.access(location, err => {
          if (err) {
            resMatch.location.splice(index, 1); // delete location from array if the track was removed from system
          } else {
            const folder = path.dirname(location);
            res.json({success: `Track already downloaded in ${folder}`})
            resolve()
            next() // track already exists, do not continue
          }
          resolve()
        })
      })

      let msg = downloadTrack(deezerID)
      msg += "- No playlist?"
      res.json({success: msg})

      next() // do not continue
    }

    if (!resMatch) throw new mongoError("no result", "Songmatch", deezerID); // if no playlistID was provided we dont NEED the resMatch

    let resPlaylist = await Playlist.findOne({playlistID})
    if (!resPlaylist) throw new mongoError("no result", "Playlist", playlistID);
    
    

    if (optimizedFS) { // download track to ./artist/album folder
      await new Promise(resolve => {
        fs.access(location[0], err => {
          if (!err) exists = true
          resolve()
        })
      })

      if (!exists) {
        downloadForPlex(deezerID, resMatch)
        .then(msg => {
          resPlaylist.lastDownload = Date();

          resPlaylist.save()
          .then(() => {
            res.json({success: msg})
          })
          .catch(err => {
            //throw new Error({type: "mongo", collection: "playlist", error: "update"})
            let error = new Error("could not update lastdownload from playlist")
            error.name = "mongo"
            error.fault = err
            throw error
          })
        })
        .catch(err => {
          if (err.includes("Deezer does not provide the song anymore")) {
            setBadMatch(deezerID)
            .then(() => {
              res.json({error: `Track ${deezerID} is not available`})
            })
            .catch(err => {
              res.json({error: `Track ${deezerID} is not available`})
            })
            next()
          }
          console.error(err)
          res.json({error: err});
        })
      } else {
        res.json({success: "Track already downloaded"});
      }
    } else { // download track to playlist folder
      await Promise.map(location, (location) => {
        if (location.includes("/"+playlistTitle+"/")) {
          fs.access(location, err => {
            if (err) {
              resMatch.location.splice(index, 1); // delete location from array if the track was removed from system
            } else {
              exists = true;
            }
            resolve()
          })
        } else {
          resolve()
        }
      })

      if (!exists) {
        const msg = await downloadTrack(deezerID, playlistTitle, resMatch)

        resPlaylist.lastDownload = Date();

        resPlaylist.save()
        .then(res.json({success: msg}))
        .catch(err => {throw new mongoError("update", "Playlist", "lastDownload")})
      } else {
        res.json({success: "track already downloaded"})
      }
    }
  })
  .catch(err => {
    console.error(err)

    if (err instanceof mongoError) { // mongo error
      if (err.message === "no result") {
        res.json({error: `could not find "${err.key}" in ${err.collection}`})
      } else if (err.message === "update") {
        res.json({error: `could not update "${err.key}" in ${err.collection}`})
      } else if (err.message === "save") {
        res.json({error: `could not save new document ${err.collection}`})
      }
    } else if (err instanceof fsError) {
      res.json({error: error.message})
    } else if (err instanceof downloadError) {
      if (err.message.includes("track not available")) {
        setBadMatch(deezerID)
        .then(() => {
          res.json({error: `Track ${deezerID} is not available`})
        })
        .catch(err => {
          res.json({error: `Track ${deezerID} is not available`})
        })
        next()
      }

      res.json({error: err})
    } else {
      res.json({error: "unknown error"})
    }
  })
})