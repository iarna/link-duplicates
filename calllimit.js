"use strict"

const defaultMaxRunning = 50

module.exports = function (func, maxRunning) {
  let running = 0
  const queue = []
  if (!maxRunning) maxRunning = defaultMaxRunning
  return function self () {
    const args = Array.prototype.slice.call(arguments)
    if (running >= maxRunning) {
      queue.push(args)
      return
    }
    const cb = args.pop()
    ++ running
    args.push(function () {
      const cbargs = arguments
      -- running
      process.nextTick(function() {
        cb.apply(null, cbargs)
      })
      if (queue.length) {
        const next = queue.shift()
        self.apply(null, next)
      }
    })
    func.apply(null, args)
  }
}
