exports.generateRandomString = generateRandomString = length => {
  let text = '';
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * generate the search query string for deezer
 * 
 * @param {Object} track contains title and array of artists
 * 
 * @returns {String} query for /api/match/advancedsearch route
 */
exports.generateDataString = (track) => {
  //remove any "featuring" and other extra's from trackname for better search results
  let n = () => {
    let bracket = track.title.indexOf(' ('),
        dash = track.title.indexOf(' - ');
    if (bracket > dash) {
      return bracket;
    } else {
      return dash;
    } 
  }

  let title = n(track.title) === -1 ? track.title : track.title.substring(0, n(track.title));

  let query = `track:"${title}" `;

  // add artists to search query
  for (let i = 0; i < track.artists.length; i++) query += `artist:"${track.artists[i].name}" `;
  
  return query;
}