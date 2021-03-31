const router = require('express').Router();
var sanitize = require('sanitize-filename');
const Promise = require('bluebird');

require('../utils/prototypes');

const CONFIG = require('../../src/config.json'),
      DEBUG = CONFIG.enableDebug || false;

const { matchByISRC, matchByQuery, searchTracks, updateMatch, storePlaylist } = require('../functions/match');

// The used mongoDB models
const SongMatch = require('../models/songMatch.model');
const Playlist = require('../models/playlist.model');
const { mongoError, XHRerror } = require('../utils/error');

// This route is used for automatic matches, no user input is required from the website
router.route('/advancedsearch').get((req, res) => {
  const query = req.query.query,
        spotifyID = req.query.spotifyID,
        isrc = req.query.isrc,
        name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null; // eventually this should only be available through cookies

  if (!name || !query || !spotifyID || !isrc) return res.json({error: "missing paramater"});

  let byISRC = true;

  SongMatch.findOne({spotifyID})
  .then( async result => {
    if (!result) throw new mongoError("no result", "SongMatch", null, spotifyID);
    if (result.manual || result.byISRC) return res.json({result: "Update not allowed (manual match or with isrc)"});
    
    try {
      let match = await matchByISRC(isrc);
      if (match instanceof XHRerror) {
        match = await matchByQuery(query)
        byISRC = false
      }

      const msg = await updateMatch(spotifyID, match, false, byISRC);

      return res.json({result: msg+byISRC ? " by ISRC" : "", deezerID, byISRC})
    } catch (err) {
      console.error({err})
      return res.json({error: "unknown error"})
    }
  })
  .catch( async err => {
    console.log("not here right")
    if (err instanceof mongoError) {
      try {
        if (err.message === "no result") {
          let match = await matchByISRC(isrc);
          if (match instanceof XHRerror) {
            match = await matchByQuery(query)
            byISRC = false
          }
  
          const msg = await updateMatch(spotifyID, match, false, byISRC);

          console.log("HALLO KANKER")
  
          return res.json({result: msg+byISRC ? " by ISRC" : "", deezerID, byISRC})
        }

        console.error(err.errors)

        if (err.message === "update") return res.json({error: `could not update "${err.key}" in ${err.collection}`});
        if (err.message === "save") return res.json({error: `could not save new document ${err.collection}`});
      } catch (err) {
        console.error({err})
        return res.json({ error: "unknown error" })
      }
    }

    if (err instanceof XHRerror) {
      console.error(err.config)
      return res.json({error: err.message})
    }

    console.error(err)
    return res.json({error: "unknown error"})
  })
});

// This route is used for manual updates through the website
router.route('/update').post((req, res) => {
  const spotifyID = req.body.spotifyID,
        deezerID = req.body.deezerID;

  if (!spotifyID || !deezerID) return res.json({error: "Missing spotifyID or deezerID"});
  
  updateMatch(spotifyID, deezerID, false, true)
  .then(result => { return res.json({result}) })
  .catch(err => {
    if (err instanceof mongoError) {
      console.error(err.errors)
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
      if (err.message === "update") return res.json({error: `could not update "${err.key}" in ${err.collection}`})
      if (err.message === "save") return res.json({error: `could not save new document ${err.collection}`})
    }

    console.error(err)
    return res.json({error: "could not set match"}) 
  })
});

// This route is used to fetch deezerIDs already stored in the databse
router.route('/getmatch').get((req, res) => {
  const playlistID = req.query.playlistID ? req.query.playlistID : null,
        name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null; // eventually this should only be available through cookies

  if (!playlistID || !name) return res.json({error: "missing parameter"});

  let match = [];
  let byISRC = [];

  Playlist.findOne({playlistID})
  .then(result => {
    if (!result) throw new mongoError("no result", "Playlist", null, playlistID);
    let lastDownload = result.lastDownload;

    let tasks = result.tracks.map((spotifyID, index) => {
      return new Promise(resolve => {
        SongMatch.findOne({spotifyID})
        .then(result => {
          if (!result) throw "no result";

          match[index] = result.deezerID;
          byISRC[index] = result.byISRC;
          return resolve();
        })
        .catch(err => {
          if (err !== "no result") console.error(err);
          match[index] = null;
          byISRC[index] = null;
          return resolve();
        })
      })
    })

    Promise.all(tasks)
    .then(() => { return res.json({match, byISRC, lastDownload}) })
  })
  .catch(err => {
    if (err instanceof mongoError) {
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
    }
    console.log(err)
    return res.json({error: "could not get matches"})
  })
});

// save all tracks and playlist info to mongoDB
router.route('/storeplaylist').post((req, res) => {
  const playlistID = req.body.playlistID ? req.body.playlistID.trim() : null, //spotify playlist id
        playlistTitle = req.body.playlistTitle.sanitize() || null, //title of playlist in spotify
        trackID = req.body.trackID ? req.body.trackID : null, //array of all spotify tracks ids in a the playlist
        name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null; // eventually this should only be available through cookies

  if (!playlistID || !playlistTitle || !trackID || !name) return res.json({error: "missing parameter"})
  
  storePlaylist(playlistID, playlistTitle, trackID, name)
  .then(msg => {
    if (msg === "new") return res.json({success: "created new playlist"})
    return res.json({success: "updated playlist"})
  })
  .catch(err => {
    if (err instanceof mongoError) {
      console.error(err.errors)
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
      if (err.message === "update") return res.json({error: `could not update "${err.key}" in ${err.collection}`})
      if (err.message === "save") return res.json({error: `could not save new document ${err.collection}`})
    }

    console.error(err)
    return res.json({error: "unknown error"})
  })
});

// search a track using a supported query
router.route('/search').get((req, res) => {
  let query = req.query.query;

  searchTracks(query)
  .then(result => {
    let tracks = new Array();

    for (let i = 0; i < result.length; i++) {
      let track = {
        id: result[i].id,
        title: result[i].title,
        artist: result[i].artist.name,
        artistID: result[i].artist.id,
        album: result[i].album.title,
        albumID: result[i].album.id,
        duration: result[i].duration
      }

      if (track.duration%60 < 10) {
        track.duration = Math.floor(track.duration/60)+":0"+track.duration%60
      } else {
        track.duration = Math.floor(track.duration/60)+":"+track.duration%60
      }
      
      tracks.push(track); 
    }

    return res.json({tracks});
  })
  .catch(err => {
    if (err instanceof XHRerror) {
      if (DEBUG) console.warn(err)
      return res.json({error: err.message})
    }

    return res.json({error: "no tracks found"})
  })
});

module.exports = router;