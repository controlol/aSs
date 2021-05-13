require('../utils/prototypes')

const path = require('path'),
      Promise = require('bluebird'),
      smloadr = require('../smloadr/smloadr-class'),
      axios = require('axios'),
      { setBadMatch } = require('./match'),
      { doesTrackExist } = require('./files'),
      { renamePath, ensureDir } = require('../utils/fs'),
      { mongoError, fsError, downloadError } = require('../utils/error'),
      User = require('../models/user.model'),
      SongMatch = require('../models/songMatch.model'),
      Playlist = require('../models/playlist.model'),
      CONFIG = require('../../src/config.json'),
      optimizedFS = CONFIG.optimizedFS,
      saveAlbumArt = CONFIG.saveAlbumArt,
      saveLyrics = CONFIG.saveLyrics

/**
 * 
 * @param {String} name username of the arl you want
 */
exports.getArl = name => {
  return new Promise((resolve, reject) => {
    return User.findOne({name})
    .then(result => {
      if (!result) throw new mongoError("no result", "User", null, name)

      return resolve(result.arl)
    })
    .catch(err => {
      if (err instanceof mongoError) return reject(err)
      return reject(new mongoError("no result", "User", err.errors, name))
    })
  })
}

exports.handleDownload = (deezerID, playlistID, arl) => {
  return new Promise( async (resolve, reject) => {
    try {
      await axios.get("https://deezer.com/us/track/" + deezerID) // try if the track is available

      let resMatch = await SongMatch.findOne({deezerID})

      if (!playlistID) { // download a track without a playlistid
        const exists = await doesTrackExist(resMatch)
        if (exists) return resolve("track already exists")

        let msg

        if (optimizedFS) {
          msg = await this.downloadForPlex(deezerID, arl, resMatch)
        } else {
          msg = await this.downloadTrack(deezerID, arl)
        }

        msg += " - no playlist?"
        return resolve(msg)
      }

      if (!resMatch) throw new mongoError("no result", "Songmatch", null, deezerID) // if no playlistID was provided we dont NEED the resMatch

      let resPlaylist = await Playlist.findOne({playlistID})
      if (!resPlaylist) throw new mongoError("no result", "Playlist", null, playlistID)

      playlistTitle = resPlaylist.playlistTitle

      let exists = await doesTrackExist(resMatch, playlistTitle)
      if (exists) return resolve("track already exists")

      let msg

      if (optimizedFS) { // download track to ./artist/album folder
        msg = await this.downloadForPlex(deezerID, arl, resMatch)
      } else { // download track to playlist folder
        msg = await this.downloadTrack(deezerID, arl, playlistTitle, resMatch)
      }

      resPlaylist.lastDownload = Date()

      return resPlaylist.save()
      .then(() => resolve(msg))
      .catch(err => { throw new mongoError("update", "Playlist", err.errors, "lastDownload") })
    } catch (err) {
      if (err instanceof mongoError) { // mongo error
        console.error(err.errors)
        if (err.message === "no result") return reject(`could not find "${err.key}" in ${err.collection}`)
        if (err.message === "update") return reject(`could not update "${err.key}" in ${err.collection}`)
        if (err.message === "save") return reject(`could not save new document ${err.collection}`)

      } else if (err instanceof fsError) {
        if (err.message === "rename") return reject(`could not rename ${err.location} to ${err.location2}`)
        return reject(`could not ${err.message} "${err.location}"`)

      } else if (err instanceof downloadError) {
        if (err.message.includes("track not available")) {
          return setBadMatch(deezerID)
          .then(() => reject(`Track ${deezerID} is not available`))
          .catch(() => reject(`Track ${deezerID} is not available`))
        } else {
          return reject(err)
        }
      } else if (err.isAxiosError) {
        //reject("axios error "+err.response.status})
        return setBadMatch(deezerID)
        .then(() => reject(`Track ${deezerID} is not available`))
        .catch(err => {
          console.error(err)
          return reject(`Track ${deezerID} is not available`)
        })
      } else {
        console.error(err)
        return reject("unknown error")
      }
    }
  })
}

/**
 * download track using smloadr lib 
 * the tracks will be stored in ./artist/album
 * the location of the track is stored in mongoDB
 * 
 * @param {String} deezerID 
 * @param {String} arl
 * @param {Object} resMatch result from mongoDB query
 */
exports.downloadForPlex = (deezerID, arl, resMatch) => {
  return new Promise( async (resolve, reject) => {
    try {
      const msg = await smloadr.startDownload(deezerID, arl)

      if (msg.saveFilePath) {//If the song was already downloaded it won't return a filePath
        if (!resMatch) return resolve(msg.msg)  

        resMatch.location = msg.saveFilePath

        return resMatch.save()
        .then(() => resolve(msg.msg))
        .catch(err => { throw new mongoError("update", "Songmatch", err.errors, "location") })
      } else {
        return resolve(msg.msg)
      }
    } catch (err) {
      return reject(err)
    }
  })
}

/**
 * download a track using the smloadr lib and move it to the correct folder based on playlistTitle
 * the location is stored in mongoDB
 * 
 * @param {String} deezerID 
 * @param {String} arl
 * @param {String} playlistTitle 
 * @param {Object} resMatch result from mongoDB query
 */
exports.downloadTrack = (deezerID, arl, playlistTitle = null, resMatch = null) => {
  return new Promise( async (resolve, reject) => {
    try {
      const result = await smloadr.startDownload(deezerID, arl)

      if (result.saveFilePath && playlistTitle) { // if a playlisttitle was given the file should be moved and stored in the DB, also if no saveFilePath was returned it was already downloaded
        const newTrackLocation = await this.moveTrackFiles(result.saveFilePath, playlistTitle)

        if (!resMatch) return resolve(result.msg)

        resMatch.location = resMatch.location ? [...resMatch.location, newTrackLocation] : newTrackLocation
        return resMatch.save()
        .then(() => resolve(result.msg))
        .catch(err => { throw new mongoError("update", "Songmatch", err.errors, "location") })
      } else {
        return resolve(result.msg)
      }
    } catch (err) { return reject(err) }
  })
}

exports.moveTrackFiles = (pathmp3, playlistTitle) => {
  return new Promise( async (resolve, reject) => {
    const newDirname = path.join(path.dirname(pathmp3), playlistTitle),
          newPath = path.join(newDirname, path.basename(pathmp3))

    try {
      await ensureDir(newDirname)
      await renamePath(pathmp3, newPath)

      if (saveAlbumArt) await renamePath(pathmp3.replaceExt("jpg"), newPath.replaceExt("jpg")).catch()
      if (saveLyrics) await renamePath(pathmp3.replaceExt("lrc"), newPath.replaceExt("lrc")).catch()

      return resolve(newPath)
    } catch (err) {
      return reject(err)
    }
  })
}