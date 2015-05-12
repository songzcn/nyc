var _ = require('lodash'),
  fs = require('fs'),
  istanbul = require('istanbul'),
  instrumenter = new istanbul.Instrumenter(),
  mkdirp = require('mkdirp'),
  path = require('path'),
  rimraf = require('rimraf'),
  spawnWrap = require('spawn-wrap'),
  stripBom = require('strip-bom')

function NYC (opts) {
  _.extend(this, {
    subprocessBin: path.resolve(
      __dirname,
      './bin/nyc.js'
    ),
    tempDirectory: './nyc_output',
    cwd: process.env.NYC_CWD || process.cwd(),
    reporter: 'text'
  }, opts)

  var config = require(path.resolve(this.cwd, './package.json')).config || {}
  config = config.nyc || {}

  this.exclude = config.exclude || ['node_modules\/', 'test\/']
  if (!Array.isArray(this.exclude)) this.exclude = [this.exclude]
  this.exclude = _.map(this.exclude, function (p) {
    return new RegExp(p)
  })

  if (!process.env.NYC_CWD) rimraf.sync(this.tmpDirectory())
  mkdirp.sync(this.tmpDirectory())
}

NYC.prototype._wrapRequire = function () {
  var _this = this

  // any JS you require should get coverage added.
  require.extensions['.js'] = function (module, filename) {
    var instrument = true
    var content = fs.readFileSync(filename, 'utf8')

    // only instrument a file if it's not on the exclude list.
    var relFile = path.relative(_this.cwd, filename)
    for (var i = 0, exclude; (exclude = _this.exclude[i]) !== undefined; i++) {
      if (exclude.test(relFile)) instrument = false
    }

    if (instrument) {
      content = instrumenter.instrumentSync(
        content,
        './' + relFile
      )
    }

    module._compile(stripBom(content), filename)
  }
}

NYC.prototype._wrapExit = function () {
  var _this = this,
    outputCoverage = function (arg) {
      if (!global.__coverage__) return

      fs.writeFileSync(
        path.resolve(_this.tmpDirectory(), './', process.pid + '.json'),
        JSON.stringify(global.__coverage__),
        'utf-8'
      )
    }

  // output temp coverage reports as processes exit.
  ;['exit', 'SIGTERM', 'SIGINT', 'SIGHUP'].forEach(function (signal) {
    process.on(signal, function () {
      outputCoverage()
      if (signal === 'SIGTERM') process.exit()
    })
  })
}

NYC.prototype.wrap = function () {
  spawnWrap([this.subprocessBin], {NYC_CWD: this.cwd})
  this._wrapRequire()
  this._wrapExit()
  return this
}

NYC.prototype.report = function (_collector, _reporter) {
  var collector = _collector || new istanbul.Collector(),
    reporter = _reporter || new istanbul.Reporter()

  this._loadReports().forEach(function (report) {
    collector.add(report)
  })

  reporter.add(this.reporter)

  reporter.write(collector, true, function () {})
}

NYC.prototype._loadReports = function () {
  var _this = this,
    files = fs.readdirSync(this.tmpDirectory())

  return _.map(files, function (f) {
    return JSON.parse(fs.readFileSync(
      path.resolve(_this.tmpDirectory(), './', f),
      'utf-8'
    ))
  })
}

NYC.prototype.tmpDirectory = function () {
  return path.resolve(this.cwd, './', this.tempDirectory)
}

module.exports = NYC
