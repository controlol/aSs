const Promise = require('bluebird'),
      fs = require('fs'),
      { mongoError } = require('../utils/error'),
      Playlist = require('../models/playlist.model'),
      SongMatch = require('../models/songMatch.model'),
      CONFIG = require('../../src/config.json'),
      optimizedFS = CONFIG.optimizedFS,
      DEBUG = CONFIG.enableDebug || false

/**
 * delete all tracks that still exist on disk but were removed from playlist
 * 
 * @param {String} playlistID
 */
exports.deleteRemovedTracks = (playlistID) => {
  return new Promise(resolve => {
    return Playlist.findOne({playlistID})
    .then(result => {
      if (!result) throw new mongoError("no result", "Playlist", null, playlistID)

      let playlistTitle = result.playlistTitle

      if (result.deletedTracks.length === 0) return resolve()

      return Promise.map(result.deletedTracks, spotifyID => {
        return SongMatch.findOne({spotifyID})
        .then(result => {
          if (!result) throw new mongoError("no result", "SongMatch", null, spotifyID)

          let locationIndex = null
          result.location.filter((location, i) => { if (location.includes("/"+playlistTitle+"/")) locationIndex = i }) // get the index of the location where the playlist title occurs
          if (locationIndex !== null) {
            let file = result.location[locationIndex] // get the file location using locationIndex
            fs.unlink(file, err => {
              if (err) {
                console.error(err)
                return resolve()
              }

              result.location.splice(locationIndex, 1)

              return result.save()
              .then(() => {
                console.log("deleted", file)
                return resolve()
              })
              .catch(err => {
                if (DEBUG) console.warn(new mongoError("update", "SongMatch", err.errors, "location", result.location))
                return resolve()
              })
            })
          }
        })
        .catch(err => {
          if (err instanceof mongoError && DEBUG) console.warn(err) 
          if (err.name == 'ValidationError' && DEBUG) console.warn(new mongoError("no result", "SongMatch", err.errors, "spotifyID", spotifyID)) 
          if (DEBUG) console.warn("could not delete removed track", spotifyID)
          return resolve()
        })
      }, { concurrency: 1 })
      .then(() => resolve())
    })
    .catch(err => {
      if (err instanceof mongoError && DEBUG) console.warn(err) 
      if (DEBUG) console.warn(new mongoError("no result", "Playlist", err.errors, "playlistID", playlistID))
      return resolve()
    })
  })
}

/**
 * check if the track was already downloaded
 * 
 * @param {Object} resMatch mongoose query result
 * @param {String} playlistTitle title of the playlist
 */
exports.doesTrackExist = (resMatch, playlistTitle = undefined) => {
  return new Promise(resolve => {
    if (!resMatch) return resolve(false)

    if (optimizedFS) {
      fs.access(resMatch.location[0], err => {
        if (!err) {
          return resolve(true)
        } else {
          resMatch.location = undefined // Delete the location array from the mongo document

          return resMatch.save()
          .then(() => resolve(false))
          .catch(() => resovle(false))
        }
      })
    }

    let exists = false,
        locations = []

    Promise.map(resMatch.location, (location, index) => {
      return new Promise(resolve => {
        if (locations.includes(location)) {
          resMatch.location.splice(index, 1) // splice location if it is a duplicate
          return resolve()
        } else {
          locations.push(location)
        }

        if (location.includes("/"+playlistTitle+"/") || !playlistTitle) {
          fs.access(location, err => {
            err ? resMatch.location.splice(index, 1) : exists = true // splice location if the track was removed from system
            return resolve()
          })
        } else {
          return resolve() 
        }
      })
    }, {concurrency: 1})
    .then(() => {
      return resMatch.save() // update location array in mongo, all duplicates and removed tracks should have been spliced/removed
      .then(() => resolve(exists))
      .catch(() => resolve(exists))
    })
  })
}