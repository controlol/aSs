import React, { Component } from 'react';
import axios from 'axios';

//import Cookies from 'universal-cookie';
//const cookies = new Cookies();

class SpotifyLogin extends Component {
  constructor() {
    super();
    this.state = {
      arl: '',
      borderColor: "#008CBA"
    }
    this.timeout = null;
    this.handleInputChange = this.handleInputChange.bind(this);
  }

  componentDidMount() {
    this.getArl()
  }

  getArl() {
    axios.get("/api/account/get-arl")
    .then(response => {
      if (response.data.error) return;
      
      this.setState({
        arl: response.data.arl
      })
    })
    .catch(err => {
      console.error(err)
    })
  }

  renderArlBox() {
    return <React.Fragment>
        <form className="arlform" autoComplete="off" onSubmit={e => {e.preventDefault()}}>
          <input type="text" name="arl" placeholder="Enter arl cookie" defaultValue={this.state.arl} onKeyUp={this.handleInputChange} style={{borderColor: this.state.borderColor}}/>
        </form>
      </React.Fragment>
  }

  setArl() {
    axios.post('/api/account/set-arl', {arl: this.state.arl})
    .then(response => { 
      if (response.data.error) return console.error(response.data.error)

      this.setState({
        borderColor: "green"
      })
    })
    .catch(err => { console.error(err) })
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({
      [name]: value,
      borderColor: "#008CBA"
    });

    this.handleTimeout();
  }

  handleTimeout() {
    // Clear the timeout if it has already been set.
    // This will prevent the previous task from executing
    // if it has been less than <MILLISECONDS>
    clearTimeout(this.timeout);

    // Make a new timeout set to go off in 1000ms (1 second)
    this.timeout = setTimeout(() => {this.setArl()}, 1000);
  }

  render() { 
    return (<React.Fragment>
              {this.renderArlBox()}
            </React.Fragment> );
  }
}
 
export default SpotifyLogin;