const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const playlistSchema = new Schema({
  playlistID: { /* from spotify */
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  playlistTitle: {
    type: String,
    trim: true,
    minlength: 1
  },
  tracks: [{ /* from spotify */
      type: String,
      trim: true
  }],
  deletedTracks: [{
    type: String,
    trim: true
  }],
  lastDownload: {
    type: Date
  },
  lastZip: {
    type: Date
  },
  sync: {
    type: Boolean
  },
  removedTracks: {
    type: Number,
    min: 0,
    max: 2,
    default: 0
  },
  owner: {
    type: String,
    required: true
  }
}, {
  timestamps: true,
});

const playlist = mongoose.model('playlist', playlistSchema);

module.exports = playlist;