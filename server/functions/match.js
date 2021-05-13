require('../utils/prototypes')

const querystring = require('querystring'),
      axios = require('axios'),
      Promise = require('bluebird'),
      path = require('path'),
      { mongoError, XHRerror } = require('../utils/error'),
      { generateDataString } = require('../utils/generators'),
      { renamePath } = require('../utils/fs'),
      { getSpotifyTrackInfo, getSpotifyToken } = require('./spotify'),
      SongMatch = require('../models/songMatch.model'),
      Playlist = require('../models/playlist.model'),
      CONFIG = require('../../src/config.json'),
      rootFolder = (CONFIG.downloadLocation.charAt(CONFIG.downloadLocation.length-1) !== "/") ? CONFIG.downloadLocation += '/' : CONFIG.downloadLocation

// variables for deezerAPI rate limit
let deezerAPIrateCounter = 0
const deezerAPIintervalMs = 5 * 1000
const deezerAPImaxRequests = 45

const delay = t => new Promise(resolve => setTimeout(resolve, t))

exports.matchByISRC = isrc => {
  // API ratelimiting stuffz
  if (deezerAPIrateCounter >= deezerAPImaxRequests) return delay(100).then(() => this.matchByISRC(isrc))
  deezerAPIrateCounter++

  return new Promise(resolve => {
    return axios.get('https://api.deezer.com/track/isrc:'+isrc)
    .then(response => {
      if (response.data.error) throw new XHRerror("could not find isrc", 504) //A match couldn't be found by ISRC

      return resolve(response.data.id)
    })
    .catch(err => {
      if (err instanceof XHRerror) return resolve(err)
      if (err.isAxiosError) return resolve(new XHRerror("no response from deezer", err.response.status, err.config))
      console.error(err)
      return resolve()
    })
  })
}

exports.matchByQuery = query => {
  return new Promise((resolve, reject) => {
    const trackName = query.substring(query.indexOf("track:")+7, query.indexOf("artist:")-2) // get the trackname from the query given in this function
    if (trackName.trim() === "") return reject(new Error(`not advanced query: ${query}`))

    // API ratelimiting stuffz
    if (deezerAPIrateCounter >= deezerAPImaxRequests) return delay(100).then(() => this.matchByQuery(query))
    deezerAPIrateCounter++

    return this.searchTracks(query)
    .then(tracks => {
      console.log(`There were ${tracks.length} results for ${trackName}`)
      if (tracks.length === 0) res.json({error: "Could not find match by advanced search"}) // error: no results

      for (let i = 0; i < tracks.length; i++) { // loop through the results to see if the trackname is the same
        let track = tracks[i]
        if (track.title.includes(trackName)) { // it found a matching trackname
          return resolve(track.id)
        } else if (i === tracks.length-1) {
          return reject(new XHRerror("did not find a match", 504)) // no matching trackname found
        }
      }
    })
    .catch(err => { // deezer API error
      if (err instanceof XHRerror) return reject(err)
      if (err.isAxiosError) return reject(new XHRerror("no response from deezer", err.response.status, err.config))
      return reject(err)
    })
  })
}

/**
 * search tracks by using a search query, this can be a "advanced search"
 * 
 * @param {String} query 
 */
exports.searchTracks = (query, retry = 0) => { // a retry should be added
  return new Promise((resolve, reject) => {
    if (retry > 3) return reject(new Error("too many retries"))

    // API ratelimiting stuffz
    if (deezerAPIrateCounter >= deezerAPImaxRequests) return delay(100).then(() => { return this.searchTracks(query, retry) })
    deezerAPIrateCounter++

    return axios.get('https://api.deezer.com/search?'+querystring.stringify({q: query})) // Using the deezer search API to search tracks
    .then(response => {
      if (response.data?.data?.length > 0) {
        let tracks = response.data.data
        return resolve(tracks)
      } else {
        throw new XHRerror("no result", 504)
      }
    })
    .catch(err => { // deezer API error
      if (err instanceof XHRerror) return reject(err)
      if (err.isAxiosError) return reject(new XHRerror("no response from deezer", err.response.status, err.config))
      return reject(err)
    })
  })
}

/**
 * function to update the database according to the found deezerAPI results
 * 
 * @param {String} spotifyID 
 * @param {String} deezerID 
 * @param {Boolean} byISRC was the track matched using ISRC
 * @param {Boolean} forced was the track matched by user
 */
exports.updateMatch = (spotifyID, deezerID, byISRC = false, forced = false) => {
  return new Promise((resolve, reject) => {
    return SongMatch.findOne({spotifyID})
    .then(result => {
      if (!result) throw new mongoError("no result", "SongMatch", null, spotifyID)

      if (result.deezerID === deezerID) return resolve("deezerID same as current") //update document if it is not the same
      if (forced || !result.manual) return resolve("update not allowed") //only update if forced is true or manual is not true

      result.deezerID = deezerID
      result.manual = forced
      result.byISRC = byISRC

      return result.save()
      .then(() => {
        result.location.forEach(path => { fs.unlink(path) }) // delete any existing tracks because it is a different track now 
        return resolve("updated match")
      })
      .catch(err => { throw new mongoError("update", "SongMatch", err.errors, "deezerID, manual, byISRC") })
    })
    .catch(err => { //add new if it was not found
      if (err instanceof mongoError) {
        if (err.message === "no result") {
          const newMatch = new SongMatch({spotifyID, deezerID, byISRC, manual: forced})
          return newMatch.save()
          .then(() => { return resolve("saved new match") })
          .catch(err => { return reject(new mongoError("save", "SongMatch", err.errors)) })
        }
      } else {
        return reject(err)
      }
    })
  })
}

/**
 * Move all tracks in a playlist, this should only be done if optimizedFS is false
 * 
 * @param {Array} tracks array of spotifyIDs
 * @param {String} oldTitle old playlistTitle
 * @param {String} newTitle  new playlistTitle
 */
exports.updatePlaylistLocation = (tracks, oldTitle, newTitle) => {
  return Promise.map(tracks, spotifyID => {
    return new Promise((resolve, reject) => {
      return SongMatch.findOne({spotifyID})
      .then(result => {
        if (!result) return resolve() // there is no match for this song, thus there is no location stored

        let locationIndex = -1 // create index

        result.location.filter((location, i) => { if (location.includes("/"+oldTitle+"/"))locationIndex = i }) // get the index of the location where the playlist title occurs

        if (locationIndex === -1) return resolve() // the location does not need to be updated

        const file = path.basename(result.location[locationIndex]), // get the filename using locationIndex
              newLocation = path.join(rootFolder, newTitle, file) // create the new path

        result.location[locationIndex] = newLocation // replace/update the location

        return result.save() // store location to mongoDB
        .then(() => resolve())
        .catch(err => { throw err }) //new mongoError("update", "SongMatch", err.errors, "location") })
      })
      .catch(err => {
        if (err instanceof mongoError) return reject(err)
        if (err.name == 'ValidationError') return reject(new mongoError("no result", "SongMatch", err, spotifyID))
        return reject(err)
      })
    })
  })
}

exports.storePlaylist = (playlistID, playlistTitle, trackID, name) => {
  playlistTitle = playlistTitle.sanitizeFile()
  return new Promise((resolve, reject) => {
    return Playlist.findOne({playlistID})
    .then(result => {
      if (!result) throw new mongoError("no result", "Playlist", null, playlistID)
      let deletedTracks = new Array()

      //add deleted tracks to deleted tracks array
      let tasks = result.tracks.map(track => {
        return new Promise((resolve) => {
          if (!trackID.includes(track)) deletedTracks.push(track)
          return resolve()
        })
      })

      return Promise.all(tasks)
      .then( async () => {
        try {
          result.deletedTracks = result.deletedTracks.length > 0 ? [...result.deletedTracks, ...deletedTracks] : deletedTracks
          result.tracks = trackID
          result.owner = name

          result.deletedTracks.forEach((deletedTrack, index) => { if (result.tracks.includes(deletedTrack)) result.deletedTracks.splice(index, 1) }) // remove tracks that were readded to the playlist from the array

          if (result.playlistTitle !== playlistTitle) {
            console.log("non matching titles")

            if (!CONFIG.optimizedFS) {
              await this.updatePlaylistLocation(result.tracks, result.playlistTitle, playlistTitle) // only move files if the fs is not optimized, someday there will be a equivalent option for plex playlistnames when plex integration gets implemented
              const oldFolder = path.join(rootFolder, result.playlistTitle),
                    newFolder = path.join(rootFolder, playlistTitle).sanitizePath()

              await renamePath(oldFolder, newFolder)
            }

            result.playlistTitle = playlistTitle
          }

          return result.save()
          .then(() => resolve())
          .catch(err => { throw new mongoError("update", "Playlist", err.errors, "deletedTracks, tracks, name, playlistTitle") })
        } catch (err) {
          throw err
        }
      })
      .catch(err => { throw err })
    })
    .catch(err => {
      if (err instanceof mongoError) {
        if (err.message === "no result") {
          let newPlaylist = new Playlist({ playlistID, playlistTitle, tracks: trackID, owner: name })

          return newPlaylist.save()
          .then(() => { return resolve("new") })
          .catch(err => { return reject(new mongoError("save", "Playlist", err.errors)) })
        }
      }

      return reject(err)
    })
  })
}

/**
 * match all tracks in the array (useful for playlists)
 * 
 * @param {Array} tracks array of spotify IDs 
 * @param {String} spotifyToken spotify user token belonging to the playlist owner
 */
exports.matchMultipleTracks = (tracks, spotifyToken) => {
  return Promise.map(tracks, spotifyID => {
    return new Promise(resolve => {
      return SongMatch.findOne({spotifyID})
      .then(result => {
        if (result) return resolve()

        console.log("missing track", spotifyID)

        return getSpotifyTrackInfo(spotifyID, spotifyToken)
        .then(async trackinfo => {
          let byISRC = true

          const query = generateDataString(trackinfo),
                isrc = trackinfo.isrc

          let match = await this.matchByISRC(isrc)
          if (match instanceof XHRerror) {
            match = await this.matchByQuery(query)
            byISRC = false
          }

          await this.updateMatch(spotifyID, match, false, byISRC)

          resolve()
        })
        .catch(err => { throw err })
      })
      .catch(err => { 
        if (err instanceof XHRerror) {
          if (err.status !== 504) console.log(err) // we could add some type of badmatching
          if (err.status === 401) {
            return getSpotifyToken()
            .then(spotifyToken => {
              return this.matchMultipleTracks(tracks, spotifyToken) // no catch
              .then(result => { return resolve(result) })
            })
            .catch(err => reject(err))
          }
          return resolve()
        }
        console.error(err.errors ? err.errors : err) 
        return resolve()
      })
    })
  }, { concurrency: 1 })
}

exports.setBadMatch = deezerID => {
  console.warn("setting badmatch", deezerID)
  return new Promise((resolve, reject) => {
    return SongMatch.findOne({deezerID})
    .then(result => {
      if (!result) throw new mongoError("no result", "Songmatch", null, deezerID)

      result.deezerID = "badmatch"
      result.manual = true

      return result.save()
      .then(() => resolve())
      .catch(err => { throw new mongoError("update", "Songmatch", err.errors, "badmatch") })
    })
    .catch(err => { 
      if (err instanceof mongoError) return reject(err)
      return reject(new mongoError("no result", "SongMatch", err.errors, deezerID)) 
    })
  })
}

// this variable is used to reset the "deezerAPIrateCounter" every "deezerAPIintervalMs" to prevent 429 http status errors, it is assigned to a variable so the interval could be stopped
let resetDeezerAPICounter = setInterval(() => {deezerAPIrateCounter = 0}, deezerAPIintervalMs)