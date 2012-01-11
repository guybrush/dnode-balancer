#!/usr/bin/env node

var opti = require('optimist')
  , argv  = opti.argv
  , conf = Array.isArray(argv.c) ? argv.c[0] : argv.c
  , bouncer = require('../index')(conf)
  , _config = bouncer.config()
  , opti = require('optimist')
  , dnode = require('dnode')
  , fs = require('fs')
  , path = require('path')
  , _ = require('underscore')
  , _conn
  , usage =
    [ ' _'                                 
    , '| |_  ___  _ _  ___  ___  ___  ___' 
    , '| . || . || | ||   ||  _|| -_||  _|'
    , '|___||___||___||_|_||___||___||_|v'+bouncer.version()   
    , ''
    , 'bouncer [-r <remote>] [-c <path to configFile] [<command> [<options>]]'
    , ''
    , 'commands:'
    , ''
    , '    version   .. print version-number'
    , '    config    .. get/set config'
    , '    start     .. start bouncer (only works without remote-option)'
    , '    ls        .. list routes'
    , '    add       .. add route'
    , '    del       .. delete route'
    , '    update    .. update route'
    , '    subscribe .. subscribe to events'
    , '    help      .. try `bouncer help <command>` for more info'
    ].join('\n')

var help = {}
help.version   =   'bouncer version .. will print the version of installed bouncer'
help.config    = [ 'bouncer config .. show all config'
                 , ''
                 , 'not implemented yet .. :'
                 , ''
                 , 'bouncer config <key> .. show value of config.<key>'
                 , 'bouncer config <key> <value> .. set config.<key> to <value>'
                 ].join('\n')
help.ls        = [ 'bouncer ls [<appName>] [<filter>]'
                 , ''
                 , 'examples:'
                 , ''
                 , 'nexus ls                       .. list all installed apps with all infos'
                 , 'neuxs ls foo                   .. show all infos about the app "foo"'
                 , 'nexus ls --name --version      .. list all installed apps and'
                 , '                                  filter `package.name` and `package.version`'
                 , 'nexus ls foo --name --version  .. show `package.name` and `package.version` of' 
                 , '                                  of the installed app "foo"'
                 ].join('\n')
help.subscribe = [ 'nexus subscribe <event> .. pipe events to stdout'
                 , ''
                 , '<event> is a wildcarded eventemitter2-event'
                 , ''
                 , 'examples:'
                 , ''
                 , 'nexus subscribe "*"                   .. subscribe to all events'
                 , 'nexus subscribe all                   .. subscribe to all events'
                 , 'nexus subscribe "*::*::*"             .. subscribe to all events'
                 , 'nexus subscribe monitor::<id>::*      .. only events from that monitor'
                 , 'nexus subscribe monitor::<id>::stdout .. listen for an app stdout'
                 , 'nexus subscribe monitor::<id>::stderr .. listen for an app stderr'
                 , 'nexus subscribe monitor::<id>::start  .. the program has been restarted'
                 , 'nexus subscribe monitor::<id>::exit   .. a app exited'
                 , 'nexus subscribe monitor::*::connected .. a app has been started and'
                 , '                                         the monitor-server has connected'
                 , 'nexus subscribe monitor::*::exit      .. a app has exited'
                 , 'nexus subscribe server::*::installed  .. when an app get installed'
                 , 'nexus subscribe server::*::error      .. listen for nexus-server errors'
                 , ''
                 , 'note: in bash you may want to wrap the event with "",'
                 , '      since "*" is a wildcard in bash too..'
                 ].join('\n')
help.start     = [ 'bouncer start -p <port> -h <host>'
                 ].join('\n')

if (!argv._[0]) exit(null, usage)
else if (argv._[0] == 'help') {
  if (!argv._[1] || !help[argv._[1]])
    return exit(null, usage)
  exit(null, help[argv._[1]])
}
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
  var client = dnode({type:'NEXUS_CLI'})
  
  client.connect(opts, function(remote, conn){
    _conn = conn
    nexus = remote
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
      if (['version','config','ls','install','uninstall'
          ,'server','logs','start'
          ].indexOf(argv._[0]) != -1) {
        // no running server required
        parseArgs()
      }
      else return exit('server is not running, can not connect')
    }
    else exit(err)
  })
}

function parseArgs() {
  var cmd = argv._.shift()
  switch (cmd) {
    case 'version':
      exit(null,'v'+nexus.version())
      break
    case 'config':
      nexus.config(exit)
      break
    case 'ls':
      var opts = {}
      opts.name = argv._[0]
      opts.filter = _.without(Object.keys(argv),'_','$0')
      nexus.ls(opts, exit)
      break
    case 'install':
      var pkg = argv._[0]
      if (/^\//.test(pkg)) {
        nexus.install({package:pkg, name:argv._[1]}, exit)
      }
      else {
        path.exists(process.cwd()+'/'+pkg,function(exists){
          if (exists) pkg = process.cwd()+'/'+pkg
          nexus.install({package:pkg, name:argv._[1]}, exit)
        })
      }
      break
    case 'rm':
    case 'uninstall':
      nexus.uninstall(argv._[0], exit)
      break
    case 'ps':
      var opts = {}
      opts.id = argv._[0]
      opts.filter = _.without(Object.keys(argv),'_','$0')
      nexus.ps(opts, exit)
      break
    case 'start':
      var options = process.argv.splice(process.argv.indexOf(argv._[0])+1)
      var script = argv._[0]
      if (/^\//.test(script)) {
        nexus.start({script:script, options:options}, exit)
      }
      else {
        path.exists(process.cwd()+'/'+script,function(exists){
          if (exists) script = process.cwd()+'/'+script
          nexus.start({script:script, options:options}, exit)
        })
      }
      break
    case 'restart':
      nexus.restart(process.argv[3], exit)
      break
    case 'stop':
      nexus.stop(process.argv[3], exit)
      break
    case 'stopall':
      nexus.stopall(exit)
      break
    case 'logs':
      nexus.logs({file:argv._[0],lines:argv.n}, exit)
      break
    case 'cleanlogs':
      nexus.cleanlogs(function(err,data){exit(err,'deleted '+data+' logfiles')})
      break
    case 'server':
      nexus.server({cmd:argv._[0]}, exit)
      break
    case 'subscribe':
      var emit = function(event, data) {console.log(event,'→',data)}
      nexus.subscribe(argv._[0], emit)
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
