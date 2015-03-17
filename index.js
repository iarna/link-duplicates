"use strict"
var fs = require("fs")
var path = require("path")

var async = require("async")
var log = require("npmlog")
var iferr = require("iferr")

var checksum = require("./checksum.js")
var limit = require("./calllimit.js")

var lstat = limit(fs.lstat, 5)
var readdir = limit(fs.readdir, 5)

function rawRelink(from, to, cb) {
  log.warn("relink", "from", from, "to", to)
  fs.unlink(to, function () {
    fs.link(from, to, cb)
  })
}
var relink = limit(rawRelink, 1)


var filecache = {}
var inodecache = {}
var hashcache = {}

var dedupe = module.exports = function (dir, cb) {
  log.verbose("dedupeDir", dir)
  readdir(dir, iferr(cb, function (files) { dedupeFiles(dir, files, cb) }))
}

function logError (cb) {
  return function (er) {
    log.error(er)
    cb()
  }
}

function dedupeFiles (dir,files,cb) {
  var tracker = log.newItem(path.basename(dir), files.length)
  var newFiles = files.filter(function (file) { return ! filecache[path.join(dir, file)] })
  var dirs = []
  async.each(newFiles, statAndProcessFile, recurseIntoDirs)
  var fullpath
  function statAndProcessFile (file, done) {
    var nextFile = function () {
      tracker.completeWork(1)
      done.apply(null, arguments)
    }
    var fullpath = path.join(dir, file)
    log.silly("statAndProcessFile", file)
    lstat(fullpath, iferr(logError(nextFile), processFile))
    function processFile (info) {
      if (info.isDirectory()) {
        dirs.push(fullpath)
        return nextFile()
      }
      // weird stuff we don't try
      if (info.isBlockDevice() || info.isCharacterDevice() || info.isSymbolicLink() || info.isFIFO() || info.isSocket()) {
        return nextFile()
      }
      if (inodecache[info.ino]) {
        inodecache[info.ino].paths.push(fullpath)
        return nextFile()
      }
      var fileobj = filecache[fullpath] = {
        paths: [fullpath],
        stat: info
      }
      inodecache[info.ino] = fileobj
      // nothing of this size yet, record and go on
      if (! hashcache[info.size]) {
        hashcache[info.size] = fileobj
        return nextFile()
      }
      // the hashcache isn't a fileobj, so that means
      // its more than one object, compute our own hash
      // and compare
      if (! hashcache[info.size].paths) {
        return checkHash(fileobj, nextFile)
      }
      
      // else it IS a file obj, compute ITS hash
      // then compute OUR hash, then compare
      var prev = hashcache[info.size]
      hashcache[info.size] = {}
      checksum(prev.paths[0], function (er, sum) {
        if (er) {
          console.error(er)
          delete hashcache[info.size]
          return nextFile()
        }
        hashcache[info.size][sum] = prev
        checkHash(fileobj, nextFile)
      })
      function checkHash(fileobj, nextFile) {
        checksum(fileobj.paths[0], iferr(logError(nextFile), function (sum) {
          // if there's a collision we'll link
          var existing = hashcache[info.size][sum]
          if (! existing) {
            log.silly("checkHash", "found size not sum match", fileobj.paths[0], hashcache[info.size])
            hashcache[info.size][sum] = fileobj
            return nextFile()
          }
          async.each(fileobj.paths, function (file, next) {
            relink(existing.paths[0], file, iferr(logError(next), function () {
              existing.paths.push(file)
              next()
            }))
          }, nextFile)
        }))
      }
    }
  }
  function recurseIntoDirs (er) {
    tracker.finish()
    async.each(dirs, dedupe, cb)
  }
}
