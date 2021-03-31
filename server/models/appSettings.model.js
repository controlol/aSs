const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const spotifySchema = new Schema({
  plexServer: {
    type: String,
    required: false,
    trim: true,
    minlength: 3
  },
  plexPort: {
    type: String,
    required: false,
    trim: true,
    minlength: 3
  },
  plexHTTPS: {
    type: Boolean,
  },
  plexPassword: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  }
}, {
  timestamps: true,
});

const spotifyTokens = mongoose.model('spotifyTokens', spotifySchema);

module.exports = spotifyTokens;