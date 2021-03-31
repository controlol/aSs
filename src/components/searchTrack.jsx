import React, { Component } from 'react';
import axios from 'axios';
import querystring from 'querystring';

class Tracks extends Component {
  constructor() {
    super();
    this.state = {
      downloaded: false
    }
  }

  renderTrack(trackName, trackID, provider) {
    return <a href={this.formatLink(trackID, "track", provider)} target="_blank" rel="noopener noreferrer">{trackName}</a>;
  }

  renderAlbum(trackName, trackID, provider) {
    return <a href={this.formatLink(trackID, "album", provider)} target="_blank" rel="noopener noreferrer">{trackName}</a>;
  }
  
  renderArtists(artists, artistIDs, provider, link_enabled) {
    if (link_enabled) {
      if (typeof artists === "object") {
        return <React.Fragment>{artists.map((artist, index) => {
          return <React.Fragment key={artist+this.props.id}>{(index ? ' - ' : '')} <a href={this.formatLink(artistIDs[index], "artist", provider)} target="_blank" rel="noopener noreferrer">{artist}</a></React.Fragment>
        }) }</React.Fragment> 
      } else {
        return <a href={this.formatLink(artistIDs, "artist", provider)} target="_blank" rel="noopener noreferrer">{artists}</a>
      }
    } else {
      if (typeof artists === "object") {
        return <React.Fragment>{artists.map((artist, index) => {
          return <React.Fragment>{(index ? ' - ' : '')} {artist}</React.Fragment>
        }) }</React.Fragment> 
      } else {
        return <React.Fragment>{artists}</React.Fragment>
      }
    }
  }

  renderoptions() {
    if (this.props.action === "download") { // clicking this button will call the download function
      return <React.Fragment>
              <button onClick={() => this.downloadTrack()} msg="Download Track" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}><span role="img" aria-label="download">&#x1F4E5;</span></button>
            </React.Fragment>
    } else if (this.props.action === "match") { // clicking this button will call the (fix) match function
      return <React.Fragment>
              <button onClick={() => {this.updateMatch()}} msg="Fix Match" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}> <span role="img" aria-label="wrong">&#x2705;</span></button>
            </React.Fragment>
    }
  }

  // Creates a link for a provider - deezer or spotify - used to create clickable text
  formatLink(id, type, provider) {
    let url = "";
    //set correct base url
    if (provider === "spotify") {
      url = "https://open.spotify.com";
    } else if (provider === "deezer") {
      url = "https://www.deezer.com";
    }

    //add track/artist + id
    url += `/${type}/${id}`;
    
    return url;
  }

  updateMatch() {
    const spotifyID = this.props.spotifyID;
    const deezerID = this.props.id;

    axios.post('/api/match/update', {
      spotifyID, deezerID
    })
    .then(response => {
      if (response.data.error) {
        console.log(response.data.error);
      }
      // first request the new match so the UI gets updated, then close the match options window
      this.props.reloadMatches();
      this.props.toggleMatchOptions();
    })
  }
  
  downloadTrack() {
    let deezerID = this.props.id;

    axios.get("/api/download/track?"+querystring.stringify({deezerID}))
    .then(res => {
      console.log(res.data)
    })
    .catch(err => {
      console.log(err)
    })
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

  openMatch() {
    window.open("https://www.deezer.com/us/track/"+this.props.match)
  }

  render() {
    return (<div className="track">
              <div className="count"> {this.props.duration} </div>
              <div className="name"> {this.renderTrack(this.props.title, this.props.id, "deezer")} </div>
              <div className="artist"> {this.renderArtists(this.props.artists, this.props.artistIDs, "deezer", true)} </div>
              <div className="album"> {this.renderAlbum(this.props.album, this.props.albumID, "deezer")} </div>
              <div className="trackactions"> {this.renderoptions()} </div>
            </div>);
  }
}
 
export default Tracks;