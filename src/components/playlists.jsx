import React, { Component } from 'react';
import axios from 'axios';

import '../styles/spotify.css';

import Playlists from './spotifyPlaylist';

import SpotifyWebApi from 'spotify-web-api-js';
const spotifyApi = new SpotifyWebApi();

class Spotify extends Component {
  constructor() {
    super();
    this.state = {
      nowPlaying: {
        name: 'Click button',
        image: '' 
      },
      playlists: {
        name: [],
        id: [],
        trackCount: []
      }
    }
  }

  componentDidMount() {
    this.getPlaylists()
  }

  renderSpotifyPlaylists() {
    if (typeof this.state.playlists.name[0] === "undefined") return <p>Loading playlists...</p>;

    return <div>{this.state.playlists.name.map((name, index) => <Playlists key={this.state.playlists.id[index]} id={this.state.playlists.id[index]} name={name} trackCount={this.state.playlists.trackCount[index]}/>)}</div>;
  }

  getNowPlaying() {
    spotifyApi.getMyCurrentPlaybackState()
      .then((response) => {
        if (response) {
          var contributingArtists = "";
          var name = "";
        
          for (var i = 1; i < response.item.artists.length; i++) contributingArtists += response.item.artists[i].name + ", ";

          name = response.item.artists[0].name + " - " + response.item.name;
          if (contributingArtists) name += " (" + contributingArtists.slice(0,-2) + ")";
          
          this.setState({
            nowPlaying: {
              name: name,
              image: response.item.album.images[0].url
            }
          })
        } else {
          this.setState({
            nowPlaying: {
              name: "Nothing is being played",
              image: ""
            }
          });
        }
      })
      .catch(err => {
        if (err.status === 401) {
          window.location.reload();
        }
      })
  }

  getPlaylists() {
    axios.get('/api/spotify/user-playlists')
    .then(response => {
      this.setState({playlists: response.data});
    })
    .catch(err => {
      console.error(err.status);
    })
  }

  render() {
    return ( 
      <React.Fragment>
        <div className="playlists">
          <div className="playlist playlistsheader">
            <div>D/M/T</div>
            <div>Title</div>
            <button onClick={() => this.getPlaylists()}><span role="img" aria-label="list">&#x1F504;</span></button>
          </div>
          {this.renderSpotifyPlaylists()}
        </div>
      </React.Fragment>
     );
  }
}
 
export default Spotify;