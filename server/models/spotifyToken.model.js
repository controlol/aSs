const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const spotifySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  spotifyName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  token: {
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