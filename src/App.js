import React, { Component } from 'react';
import axios from 'axios';
import Cookies from 'universal-cookie';

import Login from './components/login';
import Navbar from './components/navbar';

import './styles/main.css';

const cookies = new Cookies();

class App extends Component {
  constructor() {
    super();
    this.state = {
      loggedIn: null
    }
  }

  componentDidMount() {
    this.verifyCookie()
  }

  verifyCookie() {
    let cookie = cookies.get('identity');

    if (cookie) {
      let name = cookie.name;
      let id = cookie.id;
      let validate = this.generateRandomString(16);

      axios.post('/api/account/validatecookie', {
        name, id, validate
      })
      .then(res => {
        if (res.data.valid && res.data.validate === validate) {
          if (this) {
            this.setState({loggedIn: true})
          }
          return;
        }
      })
      .catch(() => {
        setTimeout(() => {this.verifyCookie()}, 1000)
        return;
      })
      
    } else {
      console.log("no cookie?")
      return;
    }
  }

  generateRandomString(length) {
    var text = '';
    var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  
    for (var i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  login() {
    if (this.state.loggedIn) {
      return <Navbar/>
    } else {
      console.log("rendering login")
      return <Login/>
    }
  }

  render() {
    return (
      <React.Fragment>
        
        {this.login()}
        
      </React.Fragment>
    );
  }
}

export default App;