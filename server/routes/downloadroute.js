const router = require('express').Router(),
      smloadr = require('../smloadr/smloadr-class'),
      fs = require('fs'),
      path = require('path'),
      axios = require('axios'),
      Promise = require('bluebird'),
      { mongoError, downloadError, fsError } = require('../utils/error'),
      SongMatch = require('../models/songMatch.model'),
      Playlist = require('../models/playlist.model'),
      { downloadLocation, arl, quality, optimizedFS } = require('../../src/config.json'),
      { downloadTrack } = require('../functions/download')
// const sqlite3 = require('sqlite3').verbose() for opening plex database and getting the "key" of a media file based on the path/file location
// let archiver = require('archiver')
// let sanitize = require('sanitize-filename')
// let querystring = require('querystring')

//smloadr settings
let rootFolder = smloadr.setDownloadPath(downloadLocation)
smloadr.initApp(arl)
.then(msg => console.log(msg))

smloadr.setMusicQuality(quality)
.then(result => console.log(result))

// download a single track, required: deezerID 
router.route('/track').get( async (req, res) => {
  let deezerID = req.query.deezerID ? req.query.deezerID : res.json({error: "No deezerID provided"}),
      playlistID = req.query.playlistID ? req.query.playlistID : null,
      exists = false,
      playlistTitle,
      location

  if (!deezerID || typeof optimizedFS !== "boolean") return res.json({error: "Missing parameter"})

  if (optimizedFS && !playlistID) res.json({error: "Can not download single track with optimizedFS enabled"})
    
  return axios.get("https://deezer.com/us/track/" + deezerID) // try if the track is available
  .then(() => {
    let resMatch = await SongMatch.findOne({deezerID})

    location = resMatch.location

    if (!playlistID) {
      if (location) await Promise.map(location, (location) => {
        return new Promise(resolve => {
          fs.access(location, err => {
            if (err) {
              resMatch.location.splice(index, 1) // delete location from array if the track was removed from system
            } else {
              exists = path.dirname(location)
            }

            return resolve()
          })
        })
      })

      if (exists) return res.json({ success: `Track already downloaded in ${exists}` })

      let msg = await downloadTrack(deezerID)
      msg += "- No playlist?"
      return res.json({ success: msg })
    }

    if (!resMatch) throw new mongoError("no result", "Songmatch", deezerID) // if no playlistID was provided we dont NEED the resMatch

    let resPlaylist = await Playlist.findOne({playlistID})
    if (!resPlaylist) throw new mongoError("no result", "Playlist", { playlistID })

    if (optimizedFS) { // download track to ./artist/album folder
      await new Promise(resolve => {
        fs.access(location[0], err => {
          if (!err) exists = true
          return resolve()
        })
      })

      if (!exists) {
        return downloadForPlex(deezerID, resMatch)
        .then(msg => {
          resPlaylist.lastDownload = new Date()

          return resPlaylist.save()
          .then(() => res.json({ success: msg }))
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
            return setBadMatch(deezerID)
            .then(() => res.json({ error: `Track ${deezerID} is not available` }))
            .catch(err => res.json({ error: `Track ${deezerID} is not available` }))
          }
          console.error(err)
          return res.json({ error: err })
        })
      } else {
        return res.json({ success: "Track already downloaded"})
      }
    } else { // download track to playlist folder
      await Promise.map(location, (location) => {
        if (location.includes("/" + playlistTitle + "/")) {
          fs.access(location, err => {
            if (err) {
              resMatch.location.splice(index, 1) // delete location from array if the track was removed from system
            } else {
              exists = true
            }
            return resolve()
          })
        } else {
          return resolve()
        }
      })

      if (!exists) {
        const msg = await downloadTrack(deezerID, playlistTitle, resMatch)

        resPlaylist.lastDownload = new Date()

        return resPlaylist.save()
        .then(() => res.json({ success: msg }))
        .catch(() => { throw new mongoError("update", "Playlist", "lastDownload") })
      } else {
        return res.json({success: "track already downloaded"})
      }
    }
  })
  .catch(err => {
    console.error(err)

    if (err instanceof mongoError) { // mongo error
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
      if (err.message === "update") return res.json({error: `could not update "${err.key}" in ${err.collection}`})
      if (err.message === "save") return res.json({error: `could not save new document ${err.collection}`})
    }
    if (err instanceof fsError) return res.json({error: error.message})
    if (err instanceof downloadError) {
      if (err.message.includes("track not available")) {
        return setBadMatch(deezerID)
        .then(() => res.json({error: `Track ${deezerID} is not available`}))
        .catch(err => res.json({error: `Track ${deezerID} is not available`}))
      }

      return res.json({error: err})
    } else {
      return res.json({error: "unknown error"})
    }
  })
})