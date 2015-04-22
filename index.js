"use strict"

function detect() {
  try {
    eval('let a = 1; const b = 2')
    return true
  }
  catch (e) {
    return false
  }
}

module.exports = detect() ? require("./link-duplicates.js") : require("./es5/link-duplicates.js")
