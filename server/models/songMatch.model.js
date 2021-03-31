const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const matchSchema = new Schema({
  spotifyID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  deezerID: {
    type: String,
    unique: false,
    trim: true,
    minlength: 3
  },
  location: [String],
  byISRC: {
    type: Boolean,
    default: false
  },
  manual: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
});

const songMatch = mongoose.model('songMatch', matchSchema);

module.exports = songMatch;