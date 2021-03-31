const router = require('express').Router(),
      smloadr = require('../smloadr/smloadr-class'),
      path = require('path'),
      fs = require('fs'),
      archiver = require('archiver'),
      Promise = require('bluebird');

const { mongoError } = require('../utils/error');

const { getSpotifyToken, getPlaylistTrackIDs, getPlaylistTitle } = require('../functions/spotify'),
      { storePlaylist, matchMultipleTracks } = require('../functions/match'),
      { deleteRemovedTracks, doesTrackExist } = require('../functions/files'),
      { getArl, handleDownload } = require('../functions/download');

// const sqlite3 = require('sqlite3').verbose(); for opening plex database and getting the "key" of a media file based on the path/file location

const SongMatch = require('../models/songMatch.model'),
      Playlist = require('../models/playlist.model');

const CONFIG = require('../../src/config.json'),
      concurrentDownloads = CONFIG.concurrentDownloads,
      optimizedFS = CONFIG.optimizedFS;

let currentlySyncingPlaylists = false;

//smloadr settings
const rootFolder = smloadr.setDownloadPath(CONFIG.downloadLocation);

const quality = CONFIG.quality;
smloadr.setMusicQuality(quality)
.then(result => { console.log(result) })

// download a single track, required: deezerID 
router.route('/track').get((req, res) => {
  let deezerID = req.query.deezerID ? req.query.deezerID : null,
      playlistID = req.query.playlistID ? req.query.playlistID : null,
      name = req.universalCookies.get('identity') ? req.universalCookies.get('identity').name : req.query.name ? req.query.name : null; // eventually this should only be available through cookies

  if (!deezerID || typeof optimizedFS !== "boolean" || !name) return res.json({error: "missing parameter"});

  if (optimizedFS && !playlistID) return res.json({error: "can not download single track with optimizedFS enabled"}); // this needs to be possible

  getArl(name)
  .then(arl => {
    handleDownload(deezerID, playlistID, arl)
    .then(success => { return res.json({success}) })
    .catch(error => { return res.json(error) })
  })
  .catch(err => {
    console.error(err)
    return res.json({error: "could not get arl"})
  })
})

// used to download a zip file of all tracks in a playlist
router.route('/playlist').get((req, res) => {
  let playlistID = req.query.playlistID;
  let optimizedFS = CONFIG.optimizedFS;

  Playlist.findOne({playlistID})
  .then(resPlaylist => {
    if (!result) throw new mongoError("no result", "Playlist", null, playlistID);

    let archivePath = path.join(rootFolder, resPlaylist.playlistTitle+".zip");
    playlistTitle = optimizedFS === false ? resPlaylist.playlistTitle : false; 

    let archiveExists = fs.access(archivePath, err => {
      if (err) {
        return false
      } else {
        return true
      }
    })

    if (!CONFIG.allowUploads) {
      return res.json({success: "Uploading to system not allowed"})
    } else if (resPlaylist.lastZip > resPlaylist.lastDownload && archiveExists) { //fs.existsSync(archivePath)
      console.log(`Archive ${playlistTitle} already exists`)
      return res.download(archivePath);
    } else {
      let tracks = [];

      Promise.map(resPlaylist.tracks, spotifyID => {
        return new Promise(resolve => {
          SongMatch.findOne({spotifyID})
          .then(resMatch => {
            for (let i = 0; i < resMatch.location.length; i++) {
              fs.access(resMatch.location[i], err => {
                if (!err) {
                  tracks.push(resMatch.location[i])
                  return resolve()
                }
              })
            }
          })
          .catch(() => { return resolve() })
        })
      })

      /*let tasks = resPlaylist.tracks.map(spotifyID => {
        return new Promise(resolve => {
          SongMatch.findOne({spotifyID})
          .then(resMatch => {
            tracks.push(...resMatch.location);
            resolve()
          })
        })
      })

      Promise.all(tasks)*/
      .then(() => {
        createArchive(playlistTitle, tracks, archivePath)
        .then(archivePath => {
          resPlaylist.lastZip = Date();

          resPlaylist.save()
          .then(() => { return res.download(archivePath) })
          .catch(err => {
            console.error(err);
            return res.json({error: "Could not update lastZip date"});
          })
        })
        .catch(err => {
          console.error(err)
          return res.json({error: "could not create playlist"})
        })
      })
    }
  })
  .catch(err => {
    if (err !== "no result") console.error(err);
    return res.json({error: "Could not find playlist"});
  })
});

// update playlist settings; sync, removedTracks
router.route('/update-playlist-settings').post((req, res) => {
  let playlistID = req.body.playlistID ? req.body.playlistID : undefined,
      sync = req.body.sync ? req.body.sync : undefined,
      removedTracks = typeof req.body.removedTracks === "number" ? req.body.removedTracks : undefined;

  if (typeof playlistID === "undefined" || typeof sync === "undefined" || typeof removedTracks === "undefined") return res.json({error: "missing parameter"});

  Playlist.findOne({playlistID})
  .then(result => {
    if (!result) throw new mongoError("no result", "Playlist", null, playlistID);

    result.sync = sync;
    result.removedTracks = removedTracks;

    result.save()
    .then(() => { return res.json({success: "updated playlist settings"}) })
    .catch(err => { throw new mongoError("update", "Playlist", err.errors, "sync, removedTracks") })
  })
  .catch(err => {
    if (err instanceof mongoError) {
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
      if (err.message === "update") return res.json({error: `could not update "${err.key}" in ${err.collection}`})
    }
    console.error(err)
    return res.json({error: "no result"})
  })
});

// return the settings for a playlist; sync, removedTracks
router.route('/get-playlist-settings').get((req, res) => {
  const playlistID = req.query.playlistID ? req.query.playlistID : null;

  if (!playlistID) return res.json({error: 'no playlistID'});

  Playlist.findOne({playlistID})
  .then(result => {
    if (!result) throw new mongoError("no result", "Playlist", null, playlistID);

    let sync = false,
        removedTracks = result.removedTracks;

    if (result.sync) sync = true;

    return res.json({sync, removedTracks})
  })
  .catch(err => {
    if (err instanceof mongoError) {
      if (err.message === "no result") return res.json({error: `could not find "${err.key}" in ${err.collection}`})
    }
    console.log(err)
    return res.json({error: "no result"})
  })
});

/**
 * create a archive for a folder
 * 
 * @param {String} playlistTitle 
 * @param {Array} tracks 
 * @param {String} archivePath 
 */
let createArchive = (playlistTitle, tracks, archivePath) => {
  let output = fs.createWriteStream(archivePath);

  var archive = archiver('zip', {
    zlib: { level: 9 } // Sets the compression level.
  });

  return new Promise((resolve, reject) => {
    // listen for all archive data to be written
    // 'close' event is fired only when a file descriptor is involved
    output.on('close', function() {
      console.log(archive.pointer() + ' total bytes');
      return resolve(archivePath);
    });

    // This event is fired when the data source is drained no matter what was the data source.
    // It is not part of this library but rather from the NodeJS Stream API.
    // @see: https://nodejs.org/api/stream.html#stream_event_end
    output.on('end', function() {
      console.log('Data has been drained');
      return resolve(archivePath)
    });

    // good practice to catch warnings (ie stat failures and other non-blocking errors)
    archive.on('warning', function(err) {
      if (err.code === 'ENOENT') {
        // log warning
      } else {
        // throw error
        reject(err)
        throw err;
      }
    });

    // good practice to catch this error explicitly
    archive.on('error', function(err) {
      reject(err)
      throw err;
    });

    // pipe archive data to the response
    archive.pipe(output);

    if (playlistTitle) { // archive a folder
      archive.directory(path.join(rootFolder, playlistTitle), false);
      archive.finalize();
    } else { // archive seperate tracks
      let tasks = tracks.map(location => {
        return new Promise(resolve => {
          fs.access(location, err => {
            if (err) {
              console.log(location, "Could not be found")
            } else {
              archive.file(location, {name: path.basename(location)})
            }
            return resolve()
          })
        })
      })

      Promise.all(tasks)
      .then(() => { archive.finalize() })
    }
  });
}

// some day this function will be used to track or immediately add the song to plex 
// also requires sqlite3 library to connect to plex database
let addToPlexPlaylist = () => {
  let db = new sqlite3.Database('./db/chinook.db');

  let sql = `SELECT id file FROM media_parts WHERE file LIKE '%Bootlegs%' ORDER BY id`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      throw err;
    }
    rows.forEach((row) => {
      console.log(row);
    });
  });

  // close the database connection
  db.close();
}

//!!! Here will start the functions for automatic downloading and syncronizing the selected playlists

/**
 * synchronizes all playlists that have sync: true in mongodb
 * all tracks will be downloaded 
 * depending on removedTracks: {0,1,2} the removed tracks can be downloaded, deleted or kept
 */
let syncPlaylist = () => {
  if (currentlySyncingPlaylists) return; // do not synchronize again if the previous sync is still going, this should only happen when really large amounts of songs need to be synced
  
  currentlySyncingPlaylists = true;

  Playlist.find({sync: true}) // find all playlists that need to be synced
  .then(result => {
    if (!result) throw "no playlists have to be synchronized"; // if the result is null there are no results, and thus no playlists should be synced

    Promise.map(result, playlist => { // do the following for each playlist
      return new Promise( async (resolve, reject) => {
        const playlistID = playlist.playlistID,
              owner = playlist.owner;
        if (!playlist.playlistTitle.includes("Hardcore")) return resolve();

        console.log(playlist.playlistTitle, "will be synced");
        
        try {
          let spotifyToken = await getSpotifyToken("name", owner);
          const arl = await getArl(owner);
          
          const tracks = await getPlaylistTrackIDs(playlistID, spotifyToken.token);
          const playlistTitle = await getPlaylistTitle(playlistID, spotifyToken.token);

          await storePlaylist(playlistID, playlistTitle, tracks, owner)
          await matchMultipleTracks(tracks, spotifyToken.token)

          await Promise.map(tracks, track => sendTrackToAPI(track, playlistID, playlistTitle, arl), {concurrency: concurrentDownloads})

          if (playlist.removedTracks === 1) { // download removed tracks
            await Promise.map(playlist.deletedTracks, track =>  sendTrackToAPI(track, playlistID, playlistTitle, arl), { concurrency: concurrentDownloads || 5 })
          } else if (playlist.removedTracks === 2) { // delete removed tracks
            await deleteRemovedTracks(playlistID)
          }

          console.log(playlistTitle, "has been downloaded");
          return resolve()
        } catch (err) {
          return reject(err)
        }
      }).reflect()
    }, {concurrency: 1})
    .then(results => {
      currentlySyncingPlaylists = false;
      console.log("Finished syncing all playlists!")
      SongMatch.find({deezerID: "badmatch"})
      .then(result => {
        if (!result) throw "0 badmatch tracks"

        console.log(result.length, "badmatch tracks")
      })
      .catch(err => { console.error(err) })
      results.forEach(result => {
        if (result.isRejected()) console.log(result.reason())
      })
    })
  })
  .catch(err => {
    currentlySyncingPlaylists = false;
    if (err !== "no result") console.error(err)
  })
}

/**
 * Download the track from deezer that belongs to the spotifyID
 * 
 * @param {String} spotifyID 
 * @param {String} playlistID 
 * @param {String} playlistTitle
 * @param {String} cookie the cookie string belonging to the playlist owner
 */
let sendTrackToAPI = (spotifyID, playlistID, playlistTitle, arl) => {
  return new Promise(resolve => {
    SongMatch.findOne({spotifyID})
    .then(async result => {
      if (!result) return resolve();

      let deezerID = result.deezerID;

      const exists = await doesTrackExist(result, playlistTitle);
      if (exists) return resolve()

      if (deezerID === "badmatch") return resolve(); // its known this track is not available

      handleDownload(deezerID, playlistID, arl)
      .then(() => { return resolve() })
      .catch(() => { return resolve() })
    })
  })
}

//setTimeout(syncPlaylist, 15 * 1000); // wait 15 seconds before starting sync
setInterval(syncPlaylist, 15 * 60 * 1000); // run function every 15 minutes, use clearInterval(interval) to stop

module.exports = router;