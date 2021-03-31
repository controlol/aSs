const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const plexSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  plexName: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  plexPassword: {
    type: String,
    required: true,
    trim: true
  },
  keyString: {
    type: String,
    required: true
  },
  ivString: {
    type: String,
    required: true
  },
  plexIdentifier: {
    type: String,
    required: true
  }
}, {
  timestamps: true,
});

const plexLogin = mongoose.model('plexLogin', plexSchema);

module.exports = plexLogin;