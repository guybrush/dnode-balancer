var assert = require('assert')
  , http = require('http')
  , https = require('https')
  , dnode = require('dnode')
  , io = require('socket.io')
  , db = require('../index')
  , cp = require('child_process')
  , balancerPort = Math.floor(Math.random() * 40000 + 10000)
  , dnodePort = Math.floor(Math.random() * 40000 + 10000)
  
describe('initializing', function(){
  var child = cp.spawn
    ( 'node'
    , [ __dirname+'/../bin/cli.js'
      , 'start'
      , '-p', balancerPort
      , '-P', dnodePort
      ] )
  child.stderr.on('data',function(d){console.log('stderr:'+d)})
  child.stdout.on('data',function(d){console.log('stdout:'+d)})
  var dnodeServer
  it('should serve the dnode-interface', function(done){
    var opts = {port:dnodePort, reconnect:100}
    var dnodeClient = dnode().connect(opts, function(remote, conn){
      dnodeServer = remote
      done()
    })
  })
  describe('starting an app', function(){
    var port = Math.floor(Math.random() * 40000 + 10000)
    var route = 'foo.bar'
    var weight = 10
    it('should list the app', function(done){
      startApp('A', port, route, weight, function(){
        dnodeServer.ls(function(err,data){
          assert.equal(data.byId[data.byRoute[route][0]].route,route)
          done()
        })
      })
    })
    it('should proxy requests to that app', function(done){
      sendRequest(route, function(res){
        done()
      })
    })
  })
})

function startApp(x, port, route, weight, cb){
  http.createServer(function(req,res){
    res.end('this is server '+x)
  }).listen(port,function(){
    dnode().connect(dnodePort,function(remote,conn){
      var data = { route  : route
                 , port   : port
                 , host   : '0.0.0.0'
                 , weight : weight }
      remote.add(data,cb)
    })
  })
}

function sendRequest(route, cb) {
  var opts = 
    { method  : 'GET' 
    , host    : 'localhost'
    , headers : {host:route}
    , port    : balancerPort
    , path    : '/' }
  var req = http.request(opts, cb)
  req.end()
}

