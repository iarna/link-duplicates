"use strict"
const fs = require("fs")

const adler32 = require("adler-32")
const crc32 = require("crc-32")

function combinedsum (buffer, size) {
  return adler32.buf(buffer.slice(0, size)) +
         crc32.buf(buffer.slice(0, size))
}

const limit = require("./calllimit.js")

module.exports = limit(checksum, 1)

const MB = 1024*1024
const forwardbuf = new Buffer(1*MB)
const rearbuf = new Buffer(1*MB)

function checksum (file, cb) {
  fs.open(file, 'r', readForwardChunk);
  let fd
  let forwardsum
  function readForwardChunk (er, newfd) {
    if (er) return cb(er)
    fd = newfd
    fs.read(fd, forwardbuf, 0, 1*MB, 0, handleForwardChunk)
  }
  function handleForwardChunk (er, forwardSize) {
    if (er) return andClose(er)
    forwardsum = combinedsum(forwardbuf, forwardSize)
    if (forwardSize < MB) return andClose(null, forwardsum)
    fs.read(fd, rearbuf, 0, 1*MB, Math.max(0, file.size - 1*MB), handleRearChunk)
  }
  function handleRearChunk (er, rearSize) {
    if (er) return andClose(er)
    const rearsum = combinedsum(rearbuf, rearSize)
    return andClose(null, forwardsum + rearsum)
  }
  function andClose() {
    const args = arguments
    fs.close(fd, function (er) {
      cb.apply(null, args)
    })
  }
}
