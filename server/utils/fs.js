const fs = require('fs');

const { fsError } = require('./error');

/**
 * Create directories of the given path if they don't exist.
 *
 * @param {String} dirPath
 * @return {boolean}
 */
exports.ensureDir = (dirPath) => {
  return new Promise((resolve, reject) => {
    fs.access(dirPath , err => {
      if (!err) return resolve()

      fs.mkdir(dirPath, { recursive: true, mode: 0o666 }, err => {
        if (err) return reject(new fsError(`mkdir`, dirPath))
        return resolve()
      })
    })
  })
}

exports.renamePath = (path, newPath) => { // perhaps call ensuredir so the dirname always exists?
  return new Promise((resolve, reject) => {
    fs.access(path, err => {
      if (err) return reject(new fsError("access", path));

      fs.rename(path, newPath, (err) => {
        if (err) return reject(new fsError("rename", path, newPath));
        return resolve();
      })
    })
  })
}