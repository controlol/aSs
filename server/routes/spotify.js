const router = require('express').Router(),
      { stringify } = require('querystring'),
      request = require('request'), // "Request" library
      axios = require('axios'),
      { getSpotifyToken, getPlaylistTracks, isLoggedin, getUserPlaylists, getPlaylistMatches } = require('../functions/spotify'),
      { storePlaylist } = require('../functions/match'),
      { spotifyID, spotifySecret, domainName } = require('../../src/config.json'),
      redirect_uri = `https://${domainName}/api/spotify/callback`, // Your redirect uri
      stateKey = 'spotify_auth_state',
      { generateRandomString } = require('../utils/generators'),
      SpotifyToken = require('../models/spotifyToken.model')

// this code should be reworked and added to the spotify function file
router.route('/callback').get((req, res) => {
  // your application requests refresh and access tokens
  // after checking the state parameter

  let code = req.query.code || null
  let state = req.query.state || null
  let storedState = req.cookies ? req.cookies[stateKey] : null

  if (state === null || state !== storedState) {
    res.redirect('/#' + stringify({ error: 'state_mismatch' }))
  } else {
    res.clearCookie(stateKey)
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (Buffer.from(spotifyID + ':' + spotifySecret).toString('base64'))
      },
      json: true
    }

    request.post(authOptions, function (error, response, body) {
      if (!error && response.statusCode === 200) {
        const access_token = body.access_token,
              refresh_token = body.refresh_token,
              name = req.cookies ? req.universalCookies.get('identity').name : null

        const options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        }

        // use the access token to access the Spotify Web API
        request.get(options, function (error, response, body) {
          //save the token if successful
          const newToken = new SpotifyToken({ name, spotifyName: body.display_name, token: access_token, refreshToken: refresh_token })

          return newToken.save()
          .then(() => console.log("spotifyToken was saved!"))
          .catch(err => console.log("Could not save spotifyToken", err))
        })

        // redirect to app
        res.redirect('/')
      } else {
        console.log("received invalid token")
        res.status(401).redirect('/')
      }
    })
  }
})

router.route('/auth').get((req, res) => {
  const state = generateRandomString(16)
  res.cookie(stateKey, state)

  // your application requests authorization
  const scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative user-read-playback-state'
  res.redirect('https://accounts.spotify.com/authorize?' +
    stringify({
      response_type: 'code',
      client_id: spotifyID,
      scope: scope,
      redirect_uri,
      state: state
    }))
})

router.route('/gettoken').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null // eventually this should only be available through cookies

  if (!name) {
    return res.status(400).json({ token: null })
  } else {
    return getSpotifyToken("name", name)
    .then(spotifyName => res.json(spotifyName))
    .catch(() => res.status(401).json({ token: null }))
  }
})

router.route('/is-logged-in').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null // eventually this should only be available through cookies

  if (!name) return res.status(400).json({ token: null })

  return isLoggedin(name)
  .then(spotifyName => res.json({name: spotifyName}))
  .catch(() => res.status(401).json({name: null}))
})

router.route('/logout').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : null

  if (!name) return res.status(400).json({ error: 'Not signed in' })

  return SpotifyToken.deleteOne({ name })
  .then(() => res.json(name + " logged out of spotify"))
  .catch(err => res.status(400).json({ error: err }))
})

router.route('/user-playlists').get((req, res) => {
  const name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null // eventually this should only be available through cookies

  if (!name) res.json({ err: "missing parameter" })

  return getSpotifyToken("name", name)
  .then(token => {
    return getUserPlaylists(token.token)
    .then(playlists => res.json(playlists))
    .catch(err => {
      console.error(err)
      return res.json({error: "could not get playlists"})
    })
  })
  .catch(err => res.status(400).json({ error: err.message || err }))
})

router.route('/playlist-tracks').get((req, res) => {
  const playlistID = req.query.playlistID,
        playlistTitle = req.query.playlistTitle,
        name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null // eventually this should only be available through cookies

  if (!name || !playlistID || !playlistTitle) return res.json({error: "missing parameter"})

  return getSpotifyToken("name", name)
  .then(token => {
    return getPlaylistTracks(playlistID, token.token)
    .then(tracks => {
      let trackID = new Array() // array of all spotify trackIDs in a playlist

      for (let i = 0; i < tracks.length; i++) trackID.push(tracks[i].id)

      return storePlaylist(playlistID, playlistTitle, trackID, req.universalCookies.get('identity').name)
      .then(() => {
        return getPlaylistMatches(playlistID, req.universalCookies.get('identity'))
        .then(result => {
          for (let i = 0; i < tracks.length; i++) {
            tracks[i].match = result.match[i]
            tracks[i].byISRC = result.byISRC[i]
          }

          return res.json(tracks)
        })
        .catch(() => res.json({ error: "could not get matches for playlist" }))
      })
      .catch(() => res.json({error: "could not store playlist"}))
    })
    .catch(() => res.json("could not get playlist tracks"))
  })
  .catch(err => res.status(400).json({ error: err.message || err }))
})

router.route('/track-duration').get((req, res) => {
  const trackID = req.query.trackID,
        name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null // eventually this should only be available through cookies

  if (!trackID || !name) res.json({error: "missing parameter"})

  return getSpotifyToken("name", name)
  .then(token => {
    let spotifyToken = token.token

    return axios.get(`https://api.spotify.com/v1/tracks/${trackID}`, { // get trackID to update the playlist
      headers: { Authorization: 'Bearer ' + spotifyToken }
    })
    .then(response => {
      let duration = Math.round(response.data.duration_ms / 1000)
      if (duration%60 < 10) {
        duration = Math.floor(duration/60) + ":0" + duration%60
      } else {
        duration = Math.floor(duration/60) + ":" + duration%60
      }

      return res.json({duration})
    })
    .catch(err => {
      console.error("could not get track duration", err.status)
      return res.json({ error: "could not get track duration" })
    })
  })
  .catch(err => res.status(400).json({ error: err.message || err }))
})

module.exports = router