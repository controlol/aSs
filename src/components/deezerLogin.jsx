import React, { Component } from 'react';
import axios from 'axios';

class DeezerLogin extends Component {
  login() {
    window.location.replace("/api/deezer/auth");
  }
  
  logout() {
    axios.get("/api/deezer/logout")
    .then(this.props.refreshToken)
  }

  button() {
    let value = this.props.type;
    
    if (value === "logout") {
      return <button className="" onClick={() => this.logout()}>Log out of Deezer</button> 
    } else if (value === "login") {
      return <button className="" onClick={() => this.login()}>Log in to Deezer</button>
    }
  }

  username() {
    if (this.props.deezer_name) {
      return <div className=""> You are logged into Deezer as {this.props.deezer_name} </div>
    } else {
      return <div>You are not logged into Deezer</div>
    }
  }

  render() { 
    return (<React.Fragment>
              {this.username()}
              {this.button()}
            </React.Fragment> );
  }
}
 
export default DeezerLogin;