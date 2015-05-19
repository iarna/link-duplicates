"use strict";
var MIN_SIZE = 100;

var fs = require("fs");
var path = require("path");

var async = require("async");
var log = require("npmlog");
var iferr = require("iferr");

var checksum = require("./checksum.js");
var limit = require("./calllimit.js");

var lstat = limit(fs.lstat, 5);
var readdir = limit(fs.readdir, 5);

function rawRelink(from, to, cb) {
  log.warn("relink", "from", from, "to", to);
  fs.unlink(to, function () {
    fs.link(from, to, cb);
  });
}
var relink = limit(rawRelink, 1);

var inodecache = {};
var hashcache = {};

var dedupe = module.exports = function (dir, cb) {
  log.verbose("dedupeDir", dir);
  readdir(dir, iferr(cb, function (files) {
    dedupeFiles(dir, files, cb);
  }));
};

function logError(cb) {
  return function (er) {
    log.error(er);
    cb();
  };
}

function dedupeFiles(dir, files, cb) {
  var tracker = log.newItem(path.basename(dir), files.length);
  var dirs = [];
  async.each(files, statAndProcessFile, recurseIntoDirs);
  var fullpath = undefined;
  function statAndProcessFile(file, done) {
    var nextFile = function nextFile() {
      tracker.completeWork(1);
      done.apply(null, arguments);
    };
    var fullpath = path.join(dir, file);
    log.silly("statAndProcessFile", file);
    lstat(fullpath, iferr(logError(nextFile), processFile));
    function processFile(info) {
      if (info.isDirectory()) {
        dirs.push(fullpath);
        return nextFile();
      }
      // don't try to hard link non-plain files
      if (!info.isFile() || info.isBlockDevice() || info.isCharacterDevice() || info.isSymbolicLink() || info.isFIFO() || info.isSocket()) {
        return nextFile();
      }
      if (info.size < MIN_SIZE) {
        return nextFile();
      }
      if (info.ino && inodecache[info.ino]) {
        return nextFile();
      }
      if (info.ino) inodecache[info.ino] = true;
      // nothing of this size yet, record and go on
      if (!hashcache[info.size]) {
        hashcache[info.size] = fullpath;
        return nextFile();
      }
      // the hashcache isn't a fullpath, so that means
      // its more than one object, compute our own hash
      // and compare
      if (!hashcache[info.size].paths) {
        return checkHash(fullpath, nextFile);
      }

      // else it IS a file obj, compute ITS hash
      // then compute OUR hash, then compare
      var prev = hashcache[info.size];
      hashcache[info.size] = {};
      checksum(prev, function (er, sum) {
        if (er) {
          console.error(er);
          delete hashcache[info.size];
          return nextFile();
        }
        hashcache[info.size][sum] = prev;
        checkHash(fullpath, nextFile);
      });
      function checkHash(fullpath, nextFile) {
        checksum(fullpath, iferr(logError(nextFile), function (sum) {
          // if there's a collision we'll link
          var existing = hashcache[info.size][sum];
          if (!existing) {
            log.silly("checkHash", "found size not sum match", fullpath, hashcache[info.size]);
            hashcache[info.size][sum] = fullpath;
            return nextFile();
          }
          relink(existing, fullpath, iferr(logError(next), function () {
            next();
          }));
        }));
      }
    }
  }
  function recurseIntoDirs(er) {
    tracker.finish();
    async.each(dirs, dedupe, cb);
  }
}