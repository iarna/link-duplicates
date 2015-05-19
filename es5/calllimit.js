"use strict";

var defaultMaxRunning = 50;

module.exports = function (func, maxRunning) {
  var running = 0;
  var queue = [];
  if (!maxRunning) maxRunning = defaultMaxRunning;
  return function self() {
    var args = Array.prototype.slice.call(arguments);
    if (running >= maxRunning) {
      queue.push(args);
      return;
    }
    var cb = args.pop();
    ++running;
    args.push(function () {
      var cbargs = arguments;
      --running;
      process.nextTick(function () {
        cb.apply(null, cbargs);
      });
      if (queue.length) {
        var next = queue.shift();
        self.apply(null, next);
      }
    });
    func.apply(null, args);
  };
};