import React, { Component } from 'react';
import axios from 'axios';
import querystring from 'querystring';

import Tracks from './searchTrack';

import '../styles/deezerSearch.css';

class deezerSearch extends Component {
  constructor() {
    super();
    this.state = {
      advancedSearch: false,
      title: '',
      artist: '',
      album: '',
      results: []
    }
    this.timeout = null;
    this.handleInputChange = this.handleInputChange.bind(this);
  }

  componentDidMount() {
    this.getSearchFromKey()
  }

  getSearchFromKey() {
    if (this.props.query) {
      this.searchTrack(this.props.query)
    }
  }

  renderSearchBar() {
    if (this.state.advancedSearch) {
      return <React.Fragment>
              <form className="searchform" autoComplete="off" onSubmit={e => {e.preventDefault()}}>
                <input type="text" name="title" placeholder="Title" onKeyUp={this.handleInputChange}/>
                <input type="text" name="artist" placeholder="Artist" onKeyUp={this.handleInputChange}/>
                <input type="text" name="album" placeholder="Album" onKeyUp={this.handleInputChange}/>
              </form>
              <button onClick={() => {this.updateSearchType()}} className="searchtypebutton"><span role="img" aria-label="simple">&#x1F4D8;</span></button>
            </React.Fragment>;
    } else {
      return <React.Fragment>
              <form className="searchform" autoComplete="off" onSubmit={e => {e.preventDefault()}}>
                <input type="text" name="title" placeholder="Search" onKeyUp={this.handleInputChange}/>
              </form>
              <button onClick={() => {this.updateSearchType()}} className="searchtypebutton"><span role="img" aria-label="advanced">&#x1f4d6;</span></button> 
            </React.Fragment>;
    } 
  }

  handleInputChange(event) {
    const target = event.target;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const name = target.name;

    this.setState({ [name]: value });

    this.handleTimeout()
  }

  handleTimeout() {
    // Clear the timeout if it has already been set.
    // This will prevent the previous task from executing
    // if it has been less than <MILLISECONDS>
    clearTimeout(this.timeout);

    // Make a new timeout set to go off in 500ms (1 second)
    this.timeout = setTimeout(() => { this.searchTrack() }, 500);
  }

  searchTrack(query = null) {
    if (!query) this.state.advancedSearch ? query = this.generateQueryString() : query = this.state.title;
    
    // prevent searching with a empty query
    if (query === '' || !query) return;

    axios.get("/api/match/search?"+querystring.stringify({query}))
    .then(res => {
      if (!res.data.error) { // if there is no error continue
        this.setState({
          results: res.data.tracks
        })
      } else { // otherwise log the error
        console.error(res.data.error)
        this.setState({ results: "noresult" })
      }
    })
    .catch(err => { console.error(err) })
  }

  renderSearchResults() {
    if (this.state.results === "noresult") return <div> No results... </div>;
    if (this.state.results) return <React.Fragment>{this.state.results.map(track => <Tracks key={track.id} title={track.title} id={track.id} artists={track.artist} artistIDs={track.artistID} album={track.album} albumID={track.albumID} duration={track.duration} action={this.props.action} toggleMatchOptions={this.props.toggleMatchOptions} reloadMatches={this.props.reloadMatches} spotifyID={this.props.spotifyID}/>)}</React.Fragment>;
  }

  generateQueryString() {
    let query = `track:"${this.state.title}" `;
    
    if (this.state.artist) query += `artist:"${this.state.artist}" `;
    if (this.state.album) query += `album:"${this.state.album}" `;

    return query;
  }

  updateSearchType() {
    let advancedSearch = !this.state.advancedSearch;
    this.setState({advancedSearch})
  }

  render() { 
    return (<React.Fragment>
              {this.renderSearchBar()}
              {this.renderSearchResults()}
            </React.Fragment>);
  }
}

export default deezerSearch;