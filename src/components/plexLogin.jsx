import React, { Component } from 'react';
import axios from 'axios';
//import querystring from 'querystring';

//import Cookies from 'universal-cookie';
//const cookies = new Cookies();

class PlexLogin extends Component {
  constructor() {
    super()
    this.state = {
      username: this.checkLoggedinStatus(),
      password: null
    }
  }

  checkLoggedinStatus() {
    axios.get('/api/plex/check-login')
    .then(response => {
      console.log(response.data);

      const username = response.data.plexName ? response.data.plexName : null;

      this.setState({
        username
      })
    })
    .catch(err => {
      console.error(err);
    })
  }

  login() {
    axios.post("/api/plex/login", {plexName: this.state.username, plexPassword: this.state.password})
    .then(response => {
      console.log(response.data)
    })
  }
  logout() {
    axios.post("/api/plex/logout")
    .then(response => {
      if (response.data.error) console.error(response.data.error);
    })
    .catch(err => {
      console.error(err)
    })
  }

  save() {
    if (this.state.username === null) {
      return <button className="" onClick={() => this.logout()}> Not logged in </button>
    } else if (this.state.username === "") {
      return <button className="" onClick={() => this.logout()}> Remove Login </button>
    } else {
      return <button className="" onClick={() => this.login()}> Save </button>
    }
  }

  form() {
    //if (this.state.username) {
      return <div className=""> 
              <input type="text" name="username" value={this.state.username} placeholder="Plex username or email" onInput={e => this.handleInputChange(e)}/>
              <input type="password" name="password" placeholder="Password" onInput={e => this.handleInputChange(e)}/>
            </div>
    //}
  }

  //update state function automatically knows what to update by input name
  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  render() { 
    return (<React.Fragment>
              {this.form()}
              {this.save()}
            </React.Fragment> );
  }
}
 
export default PlexLogin;