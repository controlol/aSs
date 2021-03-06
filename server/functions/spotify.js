require('../utils/prototypes')

const SpotifyToken = require('../models/spotifyToken.model'),
      querystring = require('querystring'),
      axios = require('axios'),
      { XHRerror, mongoError } = require('../utils/error'),
      { spotifyID, spotifySecret } = require('../../src/config.json'),
      baseurl = 'http://localhost:8888',
      spotifyPlaylistLimit = 50,
      spotifyTrackLimit = 100

/**
 * resolves in a spotifyToken and name if the token is valid
 * otherwise rejects null
 * 
 * @param {String} name username from aSs
 * 
 * @returns {Object} token, name
 */
exports.getSpotifyToken = (key, value) => {
  console.log(`received spotifyToken request, ${key === "name" ? "name:" : "token:"} ${value}`)

  return new Promise((resolve, reject) => {
    return SpotifyToken.findOne({ [key]: value })
    .then(result => {
      if (!result) throw "no result"

      return axios.get('https://api.spotify.com/v1/me', {
        headers: { Authorization: 'Bearer ' + result.token }
      })
      .then(() => resolve({ token: result.token, name: result.spotifyName }))
      .catch(err => {
        let message = err.response.data.error.message
        if (message === "The access token expired") {
          console.warn(message, "for", result.name)

          return axios.post('https://accounts.spotify.com/api/token', querystring.stringify({
            grant_type: "refresh_token",
            refresh_token: result.refreshToken
          }), {
            headers: { Authorization: 'Basic ' + (Buffer.from(spotifyID + ':' + spotifySecret).toString('base64')), 'Content-Type': 'application/x-www-form-urlencoded' }
          })
          .then(response => {
            console.log("received new token")
            result.token = response.data.access_token

            return result.save()
            .then(() => {
              console.log("saved new token")
              return resolve({ token: response.data.access_token, name: result.spotifyName })
            })
            .catch(err => reject(new mongoError("update", "SpotifyToken", err.errors, "token")))
          })
          .catch(err => reject(new XHRerror("could not refresh token", err.response.status, err.config)))
        } else {
          return reject(new XHRerror("the refresh token is invalid", err.response.status, err.config))
        }
      })
    })
    .catch(err => {
      if (err.name == 'ValidationError') return reject(new mongoError("no result", "SpotifyToken", err.errors, key, value))
      return reject(err)
    })
  })
}

/**
 * Get all tracks in a spotify playlist
 * 
 * @param {String} spotifyToken 
 * @param {String} playlistID 
 * @param {Array} tracks array of trackIDs from spotify
 * @param {Number} offset how much tracks to offset
 * @param {Number} retry nth retry
 */
exports.getPlaylistTracks = (playlistID, spotifyToken, tracks = [], offset = 0, retry = 0) => { // getmatch request should be done after storing playlist YEET
  return new Promise((resolve, reject) => {
    if (retry > 3) return reject("too many retries")

    return axios.get(`https://api.spotify.com/v1/playlists/${playlistID}/tracks?` + querystring.stringify({limit: spotifyTrackLimit, offset}), { // get trackID to update the playlist
      headers: {Authorization: 'Bearer ' + spotifyToken}
    })
    .then((response) => {
      for (let i = 0; i < response.data.items.length; i++) {
        if (!response.data.items[i].track) continue // for some weird reason 'track' can be null and results in a error here

        let artists = new Array

        for (let k = 0; k < response.data.items[i].track.artists.length; k++) {
          artists.push({
            name: response.data.items[i].track.artists[k].name,
            id: response.data.items[i].track.artists[k].id
          })
        }

        tracks.push({
          title: response.data.items[i].track.name,
          id: response.data.items[i].track.id,
          album: response.data.items[i].track.album.name,
          albumID: response.data.items[i].track.album.id,
          isrc: response.data.items[i].track.external_ids.isrc,
          match: null,
          byISRC: null,
          artists
        })
      }
  
      offset += spotifyTrackLimit

      if (response.data.items.length === spotifyTrackLimit) {
        return this.getPlaylistTracks(playlistID, spotifyToken, tracks, offset)
        .then(result => resolve(result))
        .catch(err => reject(err))
      } else {
        return resolve(tracks)
      }
    })
    .catch(err => {
      if (err.response.status === 401) {
        return this.getSpotifyToken("token", spotifyToken)
        .then(token => {
          return this.getPlaylistTracks(playlistID, token.token, tracks, offset, retry + 1)
          .then(result => resolve(result))
          .catch(err => reject(err))
        })
      } else if (err.isAxiosError) {
        return reject(new XHRerror("no response from spotify", err.response.status, err.config))
      } else {
        console.error(err)
        return reject()
      }
    })
  })
}

/**
 * get id from all tracks in a playlist
 * 
 * @param {String} playlistID 
 * @param {String} spotifyToken 
 * @param {Number} offset
 * @param {Array} tracks 
 * 
 * @returns {Array} array of trackIDs in the playlist
 */
exports.getPlaylistTrackIDs = (playlistID, spotifyToken, offset = 0, tracks = new Array()) => {
  return new Promise((resolve, reject) => {
    return axios.get(`https://api.spotify.com/v1/playlists/${playlistID}/tracks?` + querystring.stringify({limit: spotifyTrackLimit, offset}), { // get trackID to update the playlist
      headers: {Authorization: 'Bearer ' + spotifyToken}
    })
    .then(response => {
      for (let i = 0; i < response.data.items.length; i++) {
        if (response.data.items[i].track) tracks.push(response.data.items[i].track.id) // for some weird reason 'track' can be null and results in a error here
      }

      offset += spotifyTrackLimit

      if (response.data.items.length === spotifyTrackLimit) {
        return this.getPlaylistTrackIDs(playlistID, spotifyToken, offset, tracks)
        .then(result => resolve(result))
        .catch(err => reject(err.response || err))
      } else {
        return resolve(tracks)
      }
    })
    .catch(err => {
      if (err.response.status === 401) {
        return this.getSpotifyToken()
        .then(spotifyToken => {
          return this.getPlaylistTrackIDs(playlistID, spotifyToken, offset, tracks)
          .then(result => resolve(result))
          .catch(err => reject(err.response || err))
        })
        .catch(err => reject(err))
      } else {
        return reject(err)
      }
    })
  })
}

/**
 * resolves a spotifyName if a spotifyToken document was found otherwise it rejects
 * 
 * @param {String} name username from aSs
 */
exports.isLoggedin = (name) => {
  return new Promise((resolve, reject) => {
    return SpotifyToken.findOne({ name })
    .then(result => {
      if (!result) throw "no result"

      return resolve(result.spotifyName)
    })
    .catch(err => {
      console.error(err)
      return reject()
    })
  })
}

/**
 * Get all playlists from a spotify user
 * 
 * @param {String} username username from aSs
 * @param {Array} name playlistname
 * @param {Array} id spotify playlist id
 * @param {Array} trackCount amount of tracks in a playlist
 */
exports.getUserPlaylists = (spotifyToken, name = [], id = [], trackCount = [], offset = 0, retry = 0) => {
  return new Promise((resolve, reject) => {
    if (retry > 3) {
      reject("too many retries")
      return
    }

    return axios.get(`https://api.spotify.com/v1/me/playlists/?` + querystring.stringify({limit: spotifyPlaylistLimit, offset}), { // get trackID to update the playlist
      headers: {Authorization: 'Bearer ' + spotifyToken}
    })
    .then(response => {
      for (let i = 0; i < response.data.items.length; i++) {
        name.push(response.data.items[i].name)
        id.push(response.data.items[i].id)
        trackCount.push(response.data.items[i].tracks.total)
      }
      offset += spotifyPlaylistLimit

      if (response.data.items.length === spotifyPlaylistLimit) {
        return this.getUserPlaylists(spotifyToken, name, id, trackCount, offset)
        .then(result => resolve(result))
      } else {
        this.offset = 0
        return resolve({name, id, trackCount})
      }
    })
    .catch(err => {
      if (err.response.status === 401) {
        return this.getSpotifyToken("token", spotifyToken)
        .then(token => {
          return this.getUserPlaylists(token.token, name, id, trackCount, offset, retry + 1)
          .then(result => resolve(result))
          .catch(err => reject(err))
        })
        .catch(() => reject()) // add some value here
      } else {
        console.error(err)
        return reject()
      }
    })
  })
}

/**
 * stores all tracks from a spotify playlist to the database
 * 
 * @param {Array} trackID Array of spotify trackIDs
 * @param {String} playlistTitle playlist title in spotify
 * @param {String} playlistID playlist id from spotify
 * @param {Object} identity Object containing the identity cookie
 */
exports.storePlaylist = (trackID, playlistTitle, playlistID, identity) => {
  const axiosOptions = {
    method: 'POST',
    url: baseurl + '/api/match/storeplaylist',
    data: {
      trackID,
      playlistTitle,
      playlistID
    },
    headers: { 
      Cookie: "identity=" + encodeURI(JSON.stringify(identity)) + ";"
    }
  }
  return new Promise((resolve, reject) => {
    return axios(axiosOptions)
    .then(response => {
      if (response.data.error) throw response.data.error
      return resolve()
    })
    .catch(err => reject(err))
  })
}

/**
 * returns the matched deezer track for each spotify track in a playlist
 * 
 * @param {String} playlistID playlist id from spotify
 * @param {Object} identity Object containing the identity cookie
 */
exports.getPlaylistMatches = (playlistID, identity) => {
  return new Promise((resolve, reject) => {
    const axiosOptions = {
      method: 'GET',
      url: baseurl + "/api/match/getmatch?" + querystring.stringify({playlistID}),
      headers: { 
        Cookie: "identity=" + encodeURI(JSON.stringify(identity)) + ";"
      }
    }

    return axios(axiosOptions)
    .then(result => resolve(result.data))
    .catch(err => reject(err))
  })
}

/**
 * get the title of a spotify playlist
 * 
 * @param {String} playlistID 
 * @param {String} spotifyToken 
 * 
 * @returns {String} the playlist title
 */
exports.getPlaylistTitle = (playlistID, spotifyToken) => {
  return new Promise((resolve, reject) => {
    return axios.get(`https://api.spotify.com/v1/playlists/${playlistID}`, {
      headers: {Authorization: 'Bearer ' + spotifyToken}
    })
    .then(response => resolve(response.data.name.sanitizeFile())) // replace emojis
    .catch(err => {
      if (err.response.status === 401) {
        return this.getSpotifyToken("token", spotifyToken)
        .then(spotifyToken => {
          return this.getPlaylistTitle(playlistID, spotifyToken)
          .then(result => resolve(result))
          .catch(err => reject(err))
        })
        .catch(err => reject(err))
      } else {
        return reject(err)
      }
    })
  })
}

/**
 * returns info about track
 * 
 * @param {String} spotifyID trackID for spotify
 * @param {String} spotifyToken personal API token
 * 
 * @returns {Object} trackinfo
 */
exports.getSpotifyTrackInfo = (spotifyID, spotifyToken) => {
  return new Promise((resolve, reject) => {
    return axios.get('https://api.spotify.com/v1/tracks/'+spotifyID, {
      headers: {Authorization: 'Bearer ' + spotifyToken}
    })
    .then(response => resolve({title: response.data.name, artists: response.data.artists, isrc: response.data.external_ids.isrc}))
    .catch(err => {
      if (err.response.status === 401) {
        return this.getSpotifyToken("token", spotifyToken)
        .then(spotifyToken => {
          return this.getSpotifyTrackInfo(spotifyID, spotifyToken)
          .then(result => resolve(result))
          .catch(err => reject(err))
        })
        .catch(err => reject(err))
      } else {
        return reject(err)
      }
    })
  })
}

exports.sanitizeString = string => {
  return 
}