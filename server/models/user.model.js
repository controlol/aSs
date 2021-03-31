const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 15
  },
  salt: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true
  },
  arl: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
});

const User = mongoose.model('User', userSchema);

module.exports = User;