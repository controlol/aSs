import React, { Component } from 'react';
import axios from 'axios';
import querystring from 'querystring';

import SearchTrack from './searchTrack';
import Search from './deezerSearch';

import {ReactComponent as SpotifyLogo} from '../img/spotify.svg';
import {ReactComponent as DeezerLogo} from '../img/deezer.svg';

class Tracks extends Component {
  constructor() {
    super();
    this.state = {
      renderMatchOptions: false,
      match: null,
      searchResults: [],
      currentMatchInfo: null
    }
    this.doUpdateResults = true;
    this.trackDuration = '';
    this.toggleMatchOptions = this.toggleMatchOptions.bind(this);
  }

  renderTrack(trackName, trackID, provider) {
    return <a href={this.formatLink(trackID, "track", provider)} target="_blank" rel="noopener noreferrer">{trackName}</a>;
  }

  renderAlbum(trackName, trackID, provider) {
    return <a href={this.formatLink(trackID, "album", provider)} target="_blank" rel="noopener noreferrer">{trackName}</a>;
  }
  
  renderArtists(artists, provider, link_enabled) {
    if (link_enabled) {
      if (typeof artists === "object") {
        return <React.Fragment>{artists.map((artist, index) => {
          return <React.Fragment key={artist.name+this.props.track.id}>{(index ? ' - ' : '')} <a href={this.formatLink(artist.id, "artist", provider)} target="_blank" rel="noopener noreferrer">{artist.name}</a></React.Fragment>
        }) }</React.Fragment> 
      } else {
        return <a href={this.formatLink(artists.id, "artist", provider)} target="_blank" rel="noopener noreferrer">{artists.name}</a>
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

  toggleMatchOptions() {
    const matchOption = !this.state.renderMatchOptions;
    if (this.doUpdateResults) {
      this.storeSearchResults()
      .then(() => {
        //disable update search
        this.doUpdateResults = !this.doUpdateResults;
        //update the state
        this.setState({
          renderMatchOptions: matchOption
        })
      })
    } else {
      this.setState({
        renderMatchOptions: matchOption
      })
    }
  }

  //prepare to store new (mostlikely manual) search
  resetResults() {
    this.doUpdateResults = !this.doUpdateResults;
    this.setState({searchResults: []})
  }

  renderMatchOptions() {
    if (this.state.renderMatchOptions) {
      document.body.style.overflow = 'hidden';
      return (
        <div className="settingsBG">
          <div className="matchContainer"> 
            <div className="close" onClick={() => this.toggleMatchOptions()} msg="close" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}><span role="img" aria-label="close">&#x2716;</span></div>
            <div className="logintitle">Match</div>
            <div className="track" style={{fontWeight: "700"}}>
              <div className="count"> min </div>
              <div className="name"> Title </div>
              <div className="artist"> Artist </div>
              <div className="album"> Album </div>
              <div>Match</div>
            </div>
            <div className="track">
              <div className="count"> {this.trackDuration} </div>
              <div className="name"> {this.renderTrack(this.props.track.title, this.props.track.id, "spotify")} </div>
              <div className="artist"> {this.renderArtists(this.props.track.artists, "spotify", true)} </div>
              <div className="album"> {this.renderAlbum(this.props.track.album, this.props.track.albumID, "spotify")} </div>
              <SpotifyLogo height="2rem" width="1.2rem" style={{paddingLeft: ".3rem"}}/>
            </div>
            {this.renderCurrentMatchInfo()}
            <Search key="search" action="match" spotifyID={this.props.track.id} query={this.props.generateDataString()} toggleMatchOptions={this.toggleMatchOptions} reloadMatches={this.props.reloadMatches}/>
          </div>
        </div>
      );
      } else {
        document.body.style.overflow = 'unset';
        return '';
      }
  }

  renderCurrentMatchInfo() {
    if (this.state.currentMatchInfo) {
      console.log(typeof this.state.currentMatchInfo)
      return <div className="track">
              <div className="count"> {this.state.currentMatchInfo.duration} </div>
              <div className="name"> {this.renderTrack(this.state.currentMatchInfo.title, this.state.currentMatchInfo.id, "deezer")} </div>
              <div className="artist"> {this.renderArtists(this.state.currentMatchInfo.artists, "deezer", true)} </div>
              <div className="album"> {this.renderAlbum(this.state.currentMatchInfo.album, this.state.currentMatchInfo.albumID, "deezer")} </div>
              <DeezerLogo height="2rem" width="1.2rem" style={{paddingLeft: ".3rem"}}/>
            </div>
    }
  }

  getTrackDuration() {
    return new Promise((resolve) => {
      axios.get('/api/spotify/track-duration?trackID='+this.props.track.id)
      .then(response => {
        if (response.data.error) throw response.data.error;

        this.trackDuration = response.data.duration;

        resolve();
      })
      .catch(err => {
        console.error(err)
        resolve()
      })
    })
  }

  getMatchedTrackInfo() {
    if (!this.state.currentMatchInfo) {
      let deezerID = this.state.match ? this.state.match : this.props.track.match;
      if (deezerID) {
        axios.get('/api/deezer/searchTrackByID?'+querystring.stringify({deezerID}))
        .then(response => {
          if (response.data.error) throw response.data.error;

          this.setState({
            currentMatchInfo: response.data.track
          })
        })
        .catch(err => {
          console.error(err)
        })
      }
    }
  }

  // search and stores tracks from deezer to (fix) match
  storeSearchResults() {
    let query = this.props.generateDataString();
    
    return new Promise((resolve, reject) => {
      axios.get('/api/match/search?'+querystring.stringify({query}))
      .then(res => {
        if (res.data.error) throw res.data.error;
        this.getMatchedTrackInfo();

        this.getTrackDuration()
        .then(() => {
          this.setState({
            searchResults: res.data.tracks
          })
  
          resolve();
        })
      })
      .catch(err => {
        console.error(err);
        resolve();
      })
    })
  }

  renderSearchResults() {
    if (this.state) return <React.Fragment>{this.state.searchResults.map(track => <SearchTrack key={track.id} spotifyID={this.props.track.id} title={track.title} id={track.id} artists={track.artist} artistIDs={track.artistID} album={track.album} albumID={track.albumID} duration={track.duration} action="match" toggleMatchOptions={() => {this.toggleMatchOptions()}} reloadMatches={this.props.reloadMatches}/>)}</React.Fragment>;
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

  renderoptions() {
    if (this.props.track.match === "badmatch") {
      return <React.Fragment>
              <button msg="Bad match" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}} onClick={() => {this.openMatch()}}> <span role="img" aria-label="exclamation">&#x2757;</span></button>
              <button onClick={() => this.toggleMatchOptions()} className="matchtext"> Fix Match </button>
            </React.Fragment>
    }
    if (this.props.track.byISRC) {
      return <React.Fragment>
              <button msg="Matched by ISRC" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}} onClick={() => {this.openMatch()}}> <span role="img" aria-label="correct">&#x2705;</span></button>
            </React.Fragment>
    }
    if (this.props.track.match === null || this.props.track.match === undefined || typeof this.props.track.match === "undefined") {
      return <React.Fragment>
              <button msg="No match" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}> <span role="img" aria-label="wrong">&#x274C;</span></button>
              <button onClick={() => this.toggleMatchOptions()} className="matchtext"> Match </button> 
            </React.Fragment>
    } 
    return <React.Fragment>
            <button msg="Matched" onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}} onClick={() => {this.openMatch()}}> <span role="img" aria-label="wrong">&#x274E;</span></button>
            <button onClick={() => this.toggleMatchOptions()} className="matchtext"> Fix Match </button>
          </React.Fragment>
  
  }

  openMatch() {
    window.open("https://www.deezer.com/us/track/"+this.props.track.match)
  }

  render() {
    return (<div className="track">
              {this.renderMatchOptions()}
              <div className="count"> {this.props.index+1} </div>
              <div className="name"> {this.renderTrack(this.props.track.title, this.props.track.id, "spotify")} </div>
              <div className="artist"> {this.renderArtists(this.props.track.artists, "spotify", true)} </div>
              <div className="album"> {this.renderAlbum(this.props.track.album, this.props.track.albumID, "spotify")} </div>
              <div className="trackactions"> {this.renderoptions()} </div>
            </div>);
  }
}
 
export default Tracks;