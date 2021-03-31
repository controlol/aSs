import React, { Component } from 'react';
import axios from 'axios';

//import Cookies from 'universal-cookie';
//const cookies = new Cookies();

class SpotifyLogin extends Component {
  login() {
    window.location.replace("/api/spotify/auth");
  }
  logout() {
    axios.get("/api/spotify/logout")
    .then(this.props.refreshToken)
  }

  button() {
    let value = this.props.type;
    
    if (value === "logout") {
      return <button className="" onClick={() => this.logout()}>Log out of Spotify</button> 
    } else if (value === "login") {
      return <button className="" onClick={() => this.login()}>Log in to Spotify</button>
    }
  }

  username() {
    if (this.props.spotify_name) {
      return <div className=""> You are logged into Spotify as {this.props.spotify_name} </div>
    } else {
      return <div>You are not logged into Spotify</div>
    }
  }

  render() { 
    return (<React.Fragment>
              {this.username()}
              {this.button()}
            </React.Fragment> );
  }
}
 
export default SpotifyLogin;