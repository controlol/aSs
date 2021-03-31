/**
 * Replaces characters in strings that are illegal/unsafe for filenames.
 * Unsafe characters are either removed or replaced by a substitute set
 * in the optional `options` object.
 *
 * Illegal Characters on Various Operating Systems
 * / ? < > \ : * | "
 * https://kb.acronis.com/content/39790
 *
 * Unicode Control codes
 * C0 0x00-0x1f & C1 (0x80-0x9f)
 * http://en.wikipedia.org/wiki/C0_and_C1_control_codes
 *
 * Reserved filenames on Unix-based systems (".", "..")
 * Reserved filenames in Windows ("CON", "PRN", "AUX", "NUL", "COM1",
 * "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
 * "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", and
 * "LPT9") case-insesitively and with or without filename extensions.
 *
 * Capped at 255 characters in length for file, 4096 for path
 * http://unix.stackexchange.com/questions/32795/what-is-the-maximum-allowed-filename-and-folder-size-with-ecryptfs
 */

const truncate = require("truncate-utf8-bytes"),
      path = require('path');
const { extname } = require("path");

const illegalRe = /[\/\?<>\\:\*\|"]/g,
      controlRe = /[\x00-\x1f\x80-\x9f]/g,
      reservedRe = /^\.+$/,
      windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i,
      windowsTrailingRe = /[\. ]+$/;

// DO NOT USE THIS PROTOTYPE FOR PATHS!!! IT WILL REPLACE ALL SLASHES AND END UP AS ONE LONG FILENAME!!!
String.prototype.sanitizeFile = function(replacement = "") {
  return truncate(
    this
      .toString()
      .replace('/', replacement)
      .replace(illegalRe, replacement)
      .replace(controlRe, replacement)
      .replace(reservedRe, replacement)
      .replace(windowsReservedRe, replacement)
      .replace(windowsTrailingRe, replacement)
      .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, replacement) // remove emojis
      .replace(/[ _,]+/g, " ") // remove multiple whitespaces
      .trim()
  , 255);
}

String.prototype.sanitizePath = function(replacement = "") {
  return truncate(
    this
      .toString()
      .replace(illegalRe, replacement)
      .replace(controlRe, replacement)
      .replace(reservedRe, replacement)
      .replace(windowsReservedRe, replacement)
      .replace(windowsTrailingRe, replacement)
      .replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, replacement) // remove emojis
      .replace(/[ _,]+/g, ' ') // remove multiple whitespaces
      .trim()
  , 4096);
}

String.prototype.replaceExt = function(newExtension = undefined) {
  if (typeof newExtension !== "string") throw new Error("invalid extension, must be of type string")

  const str = this.toString();

  return str.substring(0, str.length-path.extname(str).length + 1) + (newExtension.charAt(0) === "." ? newExtension.substring(1, newExtension.length) : newExtension);
}