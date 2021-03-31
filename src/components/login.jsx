import React, { Component } from 'react';
import '../styles/login.css';
import axios from 'axios';
import Cookies from 'universal-cookie';

const cookies = new Cookies();

class Login extends Component {
  constructor() {
    super();
    this.state = { 
      username: '',
      password: '',
      remember: false,
      status: '',
      submit: 'Log in',
      changeForm: 'Register'
    }

    this.handleInputChange = this.handleInputChange.bind(this);
    this.submitForm = this.submitForm.bind(this);
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value
    });
  }

  submitForm(event) {
    if (this.state.submit === "Log in") {
      this.login(event);
    } else if (this.state.submit === "Register") {
      this.register(event);
    }
  }

  login(event) {
    axios.post('/api/account/login', {
      name: this.state.username,
      password: this.state.password,
      remember: this.state.remember
    })
    .then(res => {
      var name = this.state.username;

      var valid = res.data.valid;
      var cookie = res.data.cookie;
      var expire = new Date(res.data.expire);

      if (valid === 1) {
        //set the cookie
        cookies.set('identity', {id: cookie, name: name}, {expires: expire});
      } else {
        //show error
        this.setState({
          status: res.data.status
        })
      }
    })
    .catch(function(err) {
      console.log("error: ", err)
    })
    event.preventDefault();
  }

  register(event) {
    axios.post('/api/account/register', {
      name: this.state.username,
      password: this.state.password,
      remember: this.state.remember
    })
    .then(res => {
      window.location.replace('/')
    })
    .catch(function(err) {
      console.log("error: ", err)
    })
    event.preventDefault();
  }

  changeForm() {
    const submit = this.state.changeForm;
    const changeForm = this.state.submit;
    this.setState({
      submit, changeForm
    })
  }

  render() { 
    return (<React.Fragment>
              <form className="logincontainer" onSubmit={this.submitForm}>
                <div className="error"> {this.state.status} </div>
                
                <div className="logintitle"> {this.state.submit} </div>
                
                <label htmlFor="username"> Username </label>
                <input id="username" type="text" name="username" onChange={this.handleInputChange}/>
                
                <label htmlFor="password"> Password </label>
                <input id="password" type="password" name="password" onChange={this.handleInputChange}/>
                
                <label htmlFor="remember"> Remember me </label>
                <input id="remember" type="checkbox" name="remember" onChange={this.handleInputChange} />
                  
                <button type="submit"> {this.state.submit} </button> 
                
                <p className="changeloginform" onClick={() => this.changeForm()}> or {this.state.changeForm} </p>
              </form>
            </React.Fragment>);
  }
}
 
export default Login;