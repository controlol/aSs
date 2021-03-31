const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const deezerSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  deezerName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  access_token: {
    type: String
  },
  arl: {
    type: String
  }
}, {
  timestamps: true,
});

const deezerTokens = mongoose.model('deezerTokens', deezerSchema);

module.exports = deezerTokens;