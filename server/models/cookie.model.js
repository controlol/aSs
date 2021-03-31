const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cookieSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3
  },
  cookie: {
    type: String,
    required: true,
  },
  expire: {
    type: Date,
    required: true,
  }
}, {
  timestamps: true,
});

const Cookie = mongoose.model('cookies', cookieSchema);

module.exports = Cookie;