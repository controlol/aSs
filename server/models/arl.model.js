const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const arlSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  cookie: {
    type: String,
    unique: true,
    trim: true,
    minlength: 3
  }
}, {
  timestamps: true,
});

const arl = mongoose.model('arl', arlSchema);

module.exports = arl;