import React, { Component } from 'react';
import Cookies from 'universal-cookie';
import axios from 'axios';

import Profile from '../img/generic-profile.jpg';
import Logo from '../img/aSs-logo.jpg';

import '../styles/navbar.css';
import Playlists from './playlists';
import Search from './deezerSearch';

import SpotifyLogin from './spotifyLogin';
import SetArl from './setArl';
import DeezerLogin from './deezerLogin'; // currently unused but fully functional
//import PlexLogin from './plexLogin'; // currently unused but fully functional

const cookies = new Cookies();

class Navbar extends Component {
  constructor() {
    super();
    this.state = {
      css: {
        playlists: 'selected', //select playlists by default
        search: '',
        settings: '',
      },
      openSettings: false,
      spotifyName: null,
      deezerToken: this.getDeezerToken(),
      deezer_name: ''
    }
  }

  componentDidMount() {
    this.getSpotifyToken();
  }

  updateTabCSS(button) {
    this.setState({
      playlists: '', search: '', settings: ''
    });
    this.setState({
      css: {[button]: 'selected'}
    });
  }

  loadMain() {
    if (this.state.css.playlists === "selected" && typeof this.state.spotifyName === "string") {
      return <Playlists key="playlists"/>
    } else if (this.state.css.search === "selected") {
      return <Search key="search" action="download"/>
    } else {
      return <h1>Login to spotify first</h1>
    }
  }

  openSettings() {
    const settings = !this.state.openSettings;
    this.setState({
      openSettings: settings
    });
    if (this.state.openSettings) {
      document.body.style.overflow = 'unset';
    } else {
      document.body.style.overflow = 'hidden';
    }
  }

  // Settings menu
  getSpotifyToken() {
    axios.get('/api/spotify/is-logged-in')
    .then(response => {
      const name = response.data.name;

      this.setState({
        spotifyName: name
      })
    })
    .catch(err => {
      console.error(err);
      this.setState({
        spotifyToken: null
      })
    })
  }

  getDeezerToken() {
    axios.get('/api/deezer/gettoken')
    .then(res => {
      const token = res.data.token;
      const name = res.data.name;
      this.setState({
        deezerToken: token,
        deezer_name: name
      })
    })
    .catch(() => {
      this.setState({
        deezerToken: null
      })
    })
  }

  spotifyLoginState() {
    if (this.state.spotifyName) {
      return <SpotifyLogin type="logout" spotify_name={this.state.spotifyName} refreshToken={() => this.getSpotifyToken()}/>
    } else {
      return <SpotifyLogin type="login"/>
    }
  }

  renderArl() {
    if (this.state.spotifyName) {
      return <SetArl type="logout" spotify_name={this.state.spotifyName} refreshToken={() => this.getSpotifyToken()}/>
    } else {
      return <SetArl type="login"/>
    }
  }

  deezerLoginState() {
    if (this.state.deezerToken) {
      return <DeezerLogin type="logout" deezer_name={this.state.deezer_name} refreshToken={() => this.getDeezerToken()}/>
    } else {
      return <DeezerLogin type="login"/>
    }
  }

  renderAccountSettings() {
    if (this.state.openSettings) {
      return (
      <div className="settingsBG">
        <div className="settingsContainer"> 
          <div className="close" msg="close" onClick={e => {this.openSettings(); this.toggleHoverTip(e, false)}} onMouseEnter={e => {this.toggleHoverTip(e, true)}} onMouseLeave={e => {this.toggleHoverTip(e, false)}}><span role="img" aria-label="close">&#x2716;</span></div>
          <div className="logintitle">Settings</div>
          <div className="settings">
            {this.spotifyLoginState()}
            <SetArl />
          </div>
          <button onClick={() => this.signout()}>Sign out</button>
        </div>
      </div>);
    }
  }

  signout() {
    axios.post('/api/account/deletecookie', {
      id: cookies.get('identity').id
    })
    .then(() => {
      cookies.remove('identity');
      window.location.replace("/");
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

  render() {
    return (
      <React.Fragment>
        {this.renderAccountSettings()}
        <div id="tip"></div> 
        <header>
          <div className="logo"><img src={Logo} alt="aSs Logo"/><span>A Spotify Synchronizer</span></div>
          <div id="page" onClick={() => this.updateTabCSS("playlists")} className={this.state.css.playlists}> Playlists </div>
          <div id="page" onClick={() => this.updateTabCSS("search")} className={this.state.css.search}> Search </div>
          <div className="user-settings"><img onClick={() => this.openSettings()} src={Profile} className="profilebutton" alt="settings"/><span>{cookies.get('identity').name}</span></div>
        </header>
        <div className="container">
          {this.loadMain()}
        </div>
      </React.Fragment>
    );
  }
}
 
export default Navbar;