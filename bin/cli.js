#!/usr/bin/env node

var opti = require('optimist')
  , argv  = opti.argv
  , conf = Array.isArray(argv.c) ? argv.c[0] : argv.c
  , balancer = require('../index')
  , db = require('../index')
  //, _config = balancer.config()
  , _pkg = require('../package.json')
  , opti = require('optimist')
  , dnode = require('dnode')
  , fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , _conn
  , usage =
    [ 'this is dnode-balancer v'+_pkg.version   
    , ''
    , 'balancer [-r <remote>] [-c <path to configFile] [<command> [<options>]]'
    , ''
    , 'commands:'
    , ''
    , '    version   .. print version-number'
    , '    config    .. get/set config'
    , '    start     .. start balancer (only works without remote-option)'
    , '    ls        .. list routes'
    , '    add       .. add route'
    , '    del       .. delete route'
    , '    update    .. update route'
    , '    subscribe .. subscribe to events'
    , '    help      .. try `balancer help <command>` for more info'
    ].join('\n')

var help = {}
help.version   =   'balancer version .. will print the version of installed balancer'
help.config    = [ 'balancer config .. show all config'
                 ].join('\n')
help.start     = [ 'balancer start -p <balancerPort>'
                 , '               -h <balancerHost>'
                 , '               -k <balancerTlsKey>'
                 , '               -c <balancerTlsCertificate>'
                 , '               -a <balancerCAdirectoryPath>'
                 , '               -f <filePath>'
                 , '               -P <dnodePort>'
                 , '               -H <dnodeHost>'
                 , '               -K <dnodeTlsKey>'
                 , '               -C <dnodeTlsCertificate>'
                 , '               -A <dnodeCAdirectoryPath>'
                 ].join('\n')
help.ls        = [ 'balancer ls'
                 ].join('\n')
help.add       = [ 'balancer add [-r] <vHost> <targetIp>:<targerPort>'
                 , ''
                 , '-r will enable regexp for vHost'
                 , ''
                 , 'examples:'
                 , ''
                 , 'balancer add foo.bar      0.0.0.0:9001'
                 , 'balancer add blub.bar     0.0.0.0:9002'
                 , 'balancer add arr.blub.bar 0.0.0.0:9003'
                 , 'balancer add -r foo.bar/a 0.0.0.0:9004'
                 ].join('\n')
help.del       = [ 'balancer del <id>'
                 ].join('\n')
help.update    = [ 'balancer update <id> <vHost> <targetIp>:<targerPort>'
                 ].join('\n')
help.subscribe = [ 'balancer subscribe <event> .. pipe events to stdout'
                 , ''
                 , '<event> is a wildcarded eventemitter2-event'
                 , ''
                 , 'events:'
                 , ''
                 , '{error,info}::{balancer,request,ws}'
                 ].join('\n')

if (!argv._[0]) exit(null, usage)
else if (argv._[0] == 'help') {
  if (!argv._[1] || !help[argv._[1]])
    return exit(null, usage)
  exit(null, help[argv._[1]])
} else {
  parseArgs()
}
/*
else {
  var opts = {}
  if (argv.r && _config.remotes[argv.r]) {
    opts.host = _config.remotes[argv.r].host
    opts.port = _config.remotes[argv.r].port
    try {
      if (_config.remotes[argv.r].key)
        opts.key = fs.readFileSync(_config.remotes[argv.r].key)
    } catch(e) { exit('can not read key-file: '+_config.remotes[argv.r].key) }
    try {
      if (_config.remotes[argv.r].cert)
        opts.cert = fs.readFileSync(_config.remotes[argv.r].cert)
    } catch(e) { exit('can not read cert-file: '+_config.remotes[argv.r].cert) }
  } else {
    opts.host = _config.host
    opts.port = _config.port
    try {
      if (_config.key)
        opts.key = fs.readFileSync(_config.key)
    } catch(e) { exit('can not read key-file: '+_config.key) }
    try {
      if (_config.cert)
        opts.cert = fs.readFileSync(_config.cert)
    } catch(e) { exit('can not read cert-file: '+_config.cert) }
  }
  var client = dnode({type:'BALANCER_CLI'})
  
  client.connect(opts, function(remote, conn){
    _conn = conn
    balancer = remote
    process.stdin.resume()
    process.stdin.on('data',function(data) {
      var cmd = data.toString().replace('\n','')
      argv = opti(cmd.split(' ')).argv
      parseArgs()
    })
    parseArgs()
    conn.on('end',function(){exit('disconnected from server')})
  })
  client.on('error',function(err){
    if (err.code == 'ECONNREFUSED' && !argv.r) {
      if (~['version','config','start'].indexOf(argv._[0])) {
        // no running server required
        parseArgs()
      }
      else return exit('server is not running, can not connect')
    }
    else exit(err)
  })
}
*/
function parseArgs() {
  var cmd = argv._.shift()
  switch (cmd) {
    case 'version':
      exit(null,'v'+balancer.version())
      break
    case 'config':
      balancer.config(exit)
      break
    case 'ls':
      var opts = {}
      opts.name = argv._[0]
      opts.filter = _.without(Object.keys(argv),'_','$0')
      balancer.ls(opts, exit)
      break
    case 'start':
      db({balancer:{port:argv.p}
         ,dnode:{port:argv.P}})
      
      break
    case 'logs':
      balancer.logs({file:argv._[0],lines:argv.n}, exit)
      break
    case 'cleanlogs':
      balancer.cleanlogs(function(err,data){exit(err,'deleted '+data+' logfiles')})
      break
    case 'subscribe':
      var emit = function(event, data) {console.log(event,'→',data)}
      balancer.subscribe(argv._[0], emit)
      break
    default:
      exit('unknown command: '+cmd)
  }
}

function exit(err,msg) {
  if (err) console.log('ERROR:',err)
  else console.log(msg)
  _conn && _conn.end()
  process.exit(0)
}
