"use strict"
const MIN_SIZE = 100

const fs = require("fs")
const path = require("path")

const async = require("async")
const log = require("npmlog")
const iferr = require("iferr")

const checksum = require("./checksum.js")
const limit = require("./calllimit.js")

const lstat = limit(fs.lstat, 5)
const readdir = limit(fs.readdir, 5)

function rawRelink(from, to, cb) {
  log.warn("relink", "from", from, "to", to)
  fs.unlink(to, function () {
    fs.link(from, to, cb)
  })
}
const relink = limit(rawRelink, 1)


const inodecache = {}
const hashcache = {}

const dedupe = module.exports = function (dir, cb) {
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
  const tracker = log.newItem(path.basename(dir), files.length)
  const dirs = []
  async.each(files, statAndProcessFile, recurseIntoDirs)
  let fullpath
  function statAndProcessFile (file, done) {
    const nextFile = function () {
      tracker.completeWork(1)
      done.apply(null, arguments)
    }
    const fullpath = path.join(dir, file)
    log.silly("statAndProcessFile", file)
    lstat(fullpath, iferr(logError(nextFile), processFile))
    function processFile (info) {
      if (info.isDirectory()) {
        dirs.push(fullpath)
        return nextFile()
      }
      // don't try to hard link non-plain files
      if (!info.isFile() || info.isBlockDevice() || info.isCharacterDevice() || info.isSymbolicLink() || info.isFIFO() || info.isSocket()) {
        return nextFile()
      }
      if (info.size < MIN_SIZE) {
        return nextFile()
      }
      if (info.ino && inodecache[info.ino]) {
        return nextFile()
      }
      if (info.ino) inodecache[info.ino] = true
      // nothing of this size yet, record and go on
      if (! hashcache[info.size]) {
        hashcache[info.size] = fullpath
        return nextFile()
      }
      // the hashcache isn't a fullpath, so that means
      // its more than one object, compute our own hash
      // and compare
      if (! hashcache[info.size].paths) {
        return checkHash(fullpath, nextFile)
      }
      
      // else it IS a file obj, compute ITS hash
      // then compute OUR hash, then compare
      const prev = hashcache[info.size]
      hashcache[info.size] = {}
      checksum(prev, function (er, sum) {
        if (er) {
          console.error(er)
          delete hashcache[info.size]
          return nextFile()
        }
        hashcache[info.size][sum] = prev
        checkHash(fullpath, nextFile)
      })
      function checkHash(fullpath, nextFile) {
        checksum(fullpath, iferr(logError(nextFile), function (sum) {
          // if there's a collision we'll link
          const existing = hashcache[info.size][sum]
          if (! existing) {
            log.silly("checkHash", "found size not sum match", fullpath, hashcache[info.size])
            hashcache[info.size][sum] = fullpath
            return nextFile()
          }
          relink(existing, fullpath, iferr(logError(next), function () {
            next()
          }))
        }))
      }
    }
  }
  function recurseIntoDirs (er) {
    tracker.finish()
    async.each(dirs, dedupe, cb)
  }
}
