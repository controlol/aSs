import React, { Component } from 'react';
import axios from 'axios';
import querystring from 'querystring';
import Promise from 'bluebird';
import filedownload from 'js-file-download';

import Tracks from './spotifyTrack';

const CONFIG = require('../config.json');

Promise.config({
  // Enable cancellation
  cancellation: true
});

class Playlists extends Component {
  constructor() {
    super();
    this.state = {
      showTracks: false,
      progress: 0,
      showProgress: false,
      showPlaylistOptions: false,
      progressLog: [],
      progressTrack: [],
      progressTitle: '',
      progressLimit: Number,
      sync: undefined,
      removedTracks: undefined,
      playlistColor: "unset",
      tracks: [] // this array will contain objects that describe each track
    }
    this.isHoveringLink = false;
    this.currentTask = '';
  }

  renderPlaylistInfo() {
    if (this.state.showTracks) {
      return <React.Fragment>{this.state.tracks.map((track, index) => <Tracks key={track.title+index} track={track} index={index} generateDataString={() => this.generateDataString(index)} reloadMatches={() => {this.getAllMatches()}}/>)}</React.Fragment>;
    } else {
      return;
    }
  }

  /*getTrackInfo(track, type) {
    let data = [];

    if (type === "name") {
      for (let i = 0; i <= this.trNr.length; i++) {
        if (this.trNr[i] === track) data.push(this.arName[i]);
      }
    } else if (type === "id") {
      for (let i = 0; i < this.trNr.length; i++) {
        if (this.trNr[i] === track) data.push(this.arId[i]);
      }
    }

    return data;
  }*/

  showTracks() {
    this.storePlaylistInfo()

    this.state.showTracks ? this.setState({showTracks: false}) : this.setState({showTracks: true});
  }

  storePlaylistInfo() {
    // only update if new tracks have been added in the meantime
    if (this.state.tracks.length < this.props.trackCount) {
      axios.get('/api/spotify/playlist-tracks?'+querystring.stringify({playlistID: this.props.id, playlistTitle: this.props.name}))
      .then(response => {
        this.setState({
          tracks: response.data
        })
        console.log("stored tracks")
      })
      .catch(err => {
        console.error(err)
      })
    }
  }

  storePlaylistToDB() {
    return new Promise((resolve, reject) => {
      axios.post('/api/match/storeplaylist', {
        trackID: this.trID,
        playlistTitle: this.props.name,
        playlistID: this.props.id
      })
      .then(() => {
        resolve()
      })
      .catch(err => {
        reject(err)
      })
    })
  }

  //Request all the deezerID's from this playlist
  getAllMatches() {
    return new Promise((resolve, reject) => {
      let playlistID = this.props.id;
      axios.get("/api/match/getmatch?"+querystring.stringify({playlistID}))
      .then(result => {
        let tracks = this.state.tracks;

        for (let i = 0; i < result.data.match.length; i++) {
          tracks[i].match = result.data.match[i];
          tracks[i].byISRC = result.data.byISRC[i];
        }

        this.setState({
          tracks
        })

        resolve()
      })
      .catch(err => {
        console.error(err)
        reject()
      })
    })
  }

  preMatch() {
    this.storePlaylistInfo()
    this.toggleShowProgress();
    this.matchTrack()
    .then(() => {
      this.getAllMatches();
    })
  }

  toggleShowProgress() {
    if (this.state.showProgress) {
      this.setState({
        progress: this.props.trackCount,
        showProgress: false
      })
      this.currentTask.cancel();
      document.body.style.overflow = 'unset';
    } else {
      this.setState({
        progress: 0,
        showProgress: true,
        progressLog: [],
        progressLimit: this.props.trackCount
      })
      document.body.style.overflow = 'hidden';
    }
  }

  // request a match for all tracks in a playlist, looping untill all tracks in the playlist have been matched
  // skipping all tracks that already have a match value
  matchTrack() {
    return new Promise((resolve) => {
      let tracks = this.state.tracks;

      this.currentTask = Promise.map(this.state.tracks, (track, index) => {
        return new Promise(resolve => {
          let newTrack = this.state.tracks[index].title;

          if (this.state.tracks[index].match) {
            let progress = this.state.progress+1;
            this.setState({
              progress,
              progressTrack: [newTrack, ...this.state.progressTrack],
              progressLog: ["ID already set", ...this.state.progressLog]
            })
            resolve();
          } else {
            let query = this.generateDataString(index);

            axios.get('/api/match/advancedsearch?'+querystring.stringify({isrc: track.isrc, query, spotifyID: track.id}))
            .then(response => {
              if (response.data.error) throw response.data.error;

              tracks[index].match = response.data.deezerID;
              tracks[index].byISRC = response.data.byISRC;

              let newLog = response.data.error ? response.data.error : response.data.result;
              let progress = this.state.progress+1;
      
              this.setState({
                progressLog: [newLog, ...this.state.progressLog],
                progressTrack: [newTrack, ...this.state.progressTrack],
                progress
              })
              resolve();
            })
            .catch(err => {
              console.error(err);
              let newLog = err;
              let progress = this.state.progress+1;
              this.setState({
                progressLog: [newLog, ...this.state.progressLog],
                progressTrack: [newTrack, ...this.state.progressTrack],
                progress
              })
              resolve();
            })
          }
        })
      }, {concurrency: 5})
      .then(() => {
        this.setState({
          tracks
        })
        resolve()
      })
    })
  }

  renderProgress() {
    if (this.state.showProgress) {
      var elem = document.getElementById("progress");
      if (elem) elem.style.width = (this.state.progress) * (100/this.state.progressLimit)+"%";

      return <div className="settingsBG">
              <div className="progressContainer">
              <div className="close" onClick={() => this.toggleShowProgress()} msg="Cancel progress" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}><span role="img" aria-label="close">&#x2716;</span></div>
                <div id="progressBar">
                  <p className="progresstitle">{this.state.progressTitle}</p>
                  <p className="progresstext">{this.state.progress}/{this.state.progressLimit}</p>
                  <div id="progress"></div>
                </div>
                <div className="progressLog">
                  {this.renderProgressLog()}
                </div>
              </div>
            </div>
    } else {
      return '';
    }    
  }

  renderProgressLog() {
    return this.state.progressLog.map((log, index) => {
      return <React.Fragment key={index}><p>{this.state.progressTrack[index]}</p><p> > </p><p>{log}</p></React.Fragment> 
    })
  }

  togglePlaylistOptions() {
    if (this.isHoveringLink) return;
    let showPlaylistOptions = !this.state.showPlaylistOptions;

    !showPlaylistOptions ? this.setState({showTracks: false, playlistColor: "unset"}) : this.setState({playlistColor: "#313131"});

    if (typeof this.state.sync === "undefined" || typeof this.state.removedTracks === "undefined") {
      this.getSettings()
      .then(() => {
        this.setState({
          showPlaylistOptions
        })
      })
    } else {
      this.setState({
        showPlaylistOptions
      })
    }
  }

  renderPlaylistOptions() {
    if (this.state.showPlaylistOptions) {
      return <div className="playlistoptions">
                <div></div>
                <button onClick={() => this.preMatch()} msg="Match before download" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>Match tracks<span role="img" aria-label="correct">&#x2705;</span></button>
                <button onClick={() => this.startDownload()} msg="Start download" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>Start Download<span role="img" aria-label="download">&#x1F4E5;</span></button>
                <button onClick={() => this.showTracks()} msg="Show tracks" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>List tracks<span role="img" aria-label="list">&#x1F4C3;</span></button>
                <div>
                  <button onClick={() => this.toggleSetting("sync")} className="no-glow" msg="Synchronize tracks every 15 minutes" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>Sync playlist<span role="img" aria-label="list">&#x1F504;</span></button>
                  <input onChange={() => this.toggleSetting("sync")} type="checkbox" id="sync" className="switch" checked={this.state.sync}/>
                </div>
                {this.removedTrackSetting()}
              </div>
    }
  }

  removedTrackSetting() {
    if (this.state.removedTracks === 1) { // also download tracks that were in the playlist
      return <button onClick={() => this.toggleSetting("removedTracks")} className="no-glow" msg="Download tracks that have been in the playlist" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>Download tracks<span role="img" aria-label="heart">&#x2764;&#xFE0F;</span></button>
    } else if (this.state.removedTracks === 2) { // delete tracks that were in the playlist before
      return <button onClick={() => this.toggleSetting("removedTracks")} className="no-glow" msg="Delete tracks that were removed from the playlist" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>Delete tracks<span role="img" aria-label="broken-heart">&#x1F494;</span></button>
    } else { // do nothing with tracks that were removed from the playlist
      return <button onClick={() => this.toggleSetting("removedTracks")} className="no-glow" msg="Keep already downloaded tracks in this playlist" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}>Keep tracks<span role="img" aria-label="minus">&#x2796;</span></button>
    }
  }

  getSettings() {
    return new Promise(resolve => {
      axios.get("/api/download/get-playlist-settings?"+querystring.stringify({playlistID: this.props.id}))
      .then(response => {
        if (response.data.error) throw response.data.error;

        this.setState({sync: response.data.sync, removedTracks: response.data.removedTracks})

        resolve()
      })
      .catch(err => {
        this.setState({sync: false})
        console.error(err)
        resolve();
      })
    })
  }

  toggleSetting(key) {
    let data;
    if (key === "sync") {
      data = {
        playlistID: this.props.id,
        sync: !this.state.sync,
        removedTracks: this.state.removedTracks
      }
    } else if (key === "removedTracks") {
      data = {
        playlistID: this.props.id,
        sync: this.state.sync,
        removedTracks: this.state.removedTracks === 2 ? 0 : this.state.removedTracks + 1
      }
    } else {
      console.error("invalid key for playlist option")
      return
    }
    axios.post("/api/download/update-playlist-settings", data)
    .then(response => {
      if (response.data.error) throw response.data.error;

      this.getSettings()
    })
    .catch(err => {
      console.error(err)
    })
  }

  startDownload() {
    this.storePlaylistInfo();
    this.toggleShowProgress();
    this.setState({
      progressTitle: "Finding unmatched tracks..."
    })
    this.matchTrack()
    .then(() => {
      this.setState({
        progress: 0,
        progressLog: [],
        progressTitle: "Downloading tracks..."
      })
      this.currentTask = Promise.map(this.state.tracks, (track, index) => {
        return new Promise(resolve => {
          axios.get('/api/download/track?'+querystring.stringify({deezerID: track.match, playlistID: this.props.id}))
          .then(response => {
            let newLog;
            if (response.data.error) {
              if (typeof response.data.error === "object") {
                newLog = "error: see log for more details";
                console.error(response.data.error);
              } else {
                newLog = response.data.error;
              }
            } else {
              newLog = response.data.success;
            }
            let newTrack = this.state.tracks[index].title;

            let progress = this.state.progress+1;

            this.setState({
              progressLog: [newLog, ...this.state.progressLog],
              progressTrack: [newTrack, ...this.state.progressTrack],
              progress
            })

            resolve()
          })
          .catch(err => {
            let newLog = "No response... retrying?"
            this.setState({
              progressLog: [newLog, ...this.state.progressLog]
            })
            console.error(err)

            resolve();
          })
        })
      }, {concurrency: CONFIG.concurrentDownloads})
      .then(() => {
        if (CONFIG.allowUploads) {
          this.setState({
            progressTitle: "Zipping tracks...",
            progress: 0,
            progressLimit: 100,
            progressLog: []
          })
          setTimeout(() => {
            axios({
              method: 'get',
              url: '/api/download/playlist',
              params: {
                playlistID: this.props.id
              },
              onDownloadProgress: (progressEvent) => {
                let progress= Math.round((progressEvent.loaded * 100) / progressEvent.total);
                this.setState({
                    progress, 
                    progressTitle: "Downloading playlist..."
                })
              },
              responseType: 'blob'
            })
            .then(response => {
              filedownload(response.data, this.props.name.trim()+".zip")
            })
            .catch(err => {
              console.error("Error during transfer",err)
            })
          }, 200)
        }
      })
    });
  }

  //generate the search query string for deezer
  generateDataString(i) {
    //remove any "featuring" and other extra's from trackname for better search results
    let n = function(title) {
      let bracket = title.indexOf(' ('),
          dash = title.indexOf(' - ');
      if (bracket > dash) {
        return bracket;
      } else {
        return dash;
      } 
    }
    let track = n(this.state.tracks[i].title) === -1 ? this.state.tracks[i].title : this.state.tracks[i].title.substring(0, n(this.state.tracks[i].title));
    //console.log(`changed ${this.trTitle[i]} to ${track} with a index of ${n(this.trTitle[i])}`)

    let data = `track:"${track}" `;
    //album can be added in search query but gave worse results in my findings (multiple artists can have the same album name)
    //data += `album:${this.trAlbum[i]} `;

    //get artist names and add to search query
    let artists = this.getArtistInfo(i, "name");
    for (let j = 0; j < artists.length; j++) data += `artist:"${artists[j]}" `;
    
    return data;
  }

  getArtistInfo(i, type) {
    let data = [];

    if (type === "name") {
      for (let j = 0; j < this.state.tracks[i].artists.length; j++) {
        data.push(this.state.tracks[i].artists[j].name)
      }
    } else if (type === "id") {
      for (let j = 0; j < this.state.tracks[i].artists.length; j++) {
        data.push(this.state.tracks[i].artists[j].id)
      }
    }

    return data;
  }

  toggleHoverTip(e, show) {
    let msg = e.target.getAttribute("msg");
    let elem = document.getElementById("tip");
    elem.innerHTML = msg;
    if (show && elem.style) {
      elem.style.opacity = "100%";
    } else {
      elem.style.opacity = "0%";
    }
  }

  render() {
    return (<React.Fragment>
              {this.renderProgress()}
              <div className="playlist" style={{backgroundColor: this.state.playlistColor}} key={this.props.id} onClick={() => {this.togglePlaylistOptions(); this.storePlaylistInfo()}}>
                <div>{this.props.trackCount}</div>
                <div className="playlist-wrapper"><a href={"https://open.spotify.com/playlist/"+this.props.id} target="_blank" rel="noopener noreferrer" onMouseEnter={() => {this.isHoveringLink = true}} onMouseLeave={() => {this.isHoveringLink = false}}> {this.props.name} </a></div>
              </div>
              {this.renderPlaylistOptions()}
              <div className="border-bottom"></div>
              {this.renderPlaylistInfo()}
            </React.Fragment>);
  }
}

export default Playlists;