"use strict"
var async = require("async")
var log = require("npmlog")
var dupelinker = require("./index.js")
var dirs = process.argv.length > 2 ? process.argv.slice(2) : ["."]

log.enableProgress()
log.setGaugeTemplate([
    {type: "name", separated: true, length: 50},
    {type: "spinner", separated: true},
    {type: "percent", separated: true, length: 5}
])
async.each(dirs, dupelinker, function (er) {
  if (er) log.error("dupelinker", er)
  log.clearProgress()
})
