var assert = require('assert')
  , http = require('http')
  , https = require('https')
  , dnode = require('dnode')
  , io = require('socket.io')
  , cp = require('child_process')
  , AA = require('async-array')
  , balancerPort = Math.floor(Math.random() * 40000 + 10000)
  , dnodePort = Math.floor(Math.random() * 40000 + 10000)
  , errorMsg = 'not in routing-table'
  , apps = {}
  
describe('initializing', function(){
  var child = cp.spawn
    ( 'node'
    , [ __dirname+'/../bin/cli.js'
      , 'start'
      , '-p', balancerPort
      , '-P', dnodePort
      , '-e', errorMsg
      ] )
  process.on('exit', function(){process.kill(child.pid)})
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
  describe('requesting a route which is not set yet', function(){
    it('should render the error message', function(done) {
      sendRequest('undefined.route', function(res){
        assert.equal(res.statusCode,502)
        res.setEncoding('utf8')
        var data = ''
        res.on('data',function(d){data+=d})
        res.on('end',function(){
          assert.equal(data,errorMsg)
          done()
        })
      })
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
        assert.equal(res.statusCode,200)
        done()
      })
    })
    describe('stopping the app', function(){
      it('should not list the app anymore', function(done){
        stopApp('A', function(err){
          if (err) return done(err)
          setTimeout(function(){
            dnodeServer.ls(function(err,data){
              assert.equal(Object.keys(data.byId).length,0)
              done()
            })
          },100)
        })
      })
    })
  })
  describe('starting multiple apps with the same route', function(){
    var port = Math.floor(Math.random() * 40000 + 10000)
    var route = 'foo.bar'
    it('should distribute the requests properly', function(done){
      new AA([['A',2],['B',2],['C',6]])
        .map(function(x,i,next){
          var port = Math.floor(Math.random() * 40000 + 10000)
          startApp(x[0],port,route,x[1],next)
        })
        .done(function(err,data){
          if (err) return done(err)
          var requestsDone = 0
          apps.A.server.on('request',requestDone)
          apps.B.server.on('request',requestDone)
          apps.C.server.on('request',requestDone)
          function requestDone(){
            if (++requestsDone == 100) {
              assert.ok(apps.A.sumReq<=15)
              assert.ok(apps.B.sumReq<=15)
              assert.ok(apps.C.sumReq>=70)
              done()
            }  
          }
          var requestsTodo = []
          for (var i=0;i<100;i++) sendRequest(route)
        })
        .exec()
    })
  })
})

function startApp(x, port, route, weight, cb){
  apps[x] = {}
  apps[x].sumReq = 0
  apps[x].server = http.createServer(function(req,res){
    apps[x].sumReq++
    res.end('this is server '+x)
  }).listen(port,function(){
    apps[x].client = dnode().connect(dnodePort,function(remote,conn){
      var data = { route  : route
                 , port   : port
                 , host   : '0.0.0.0'
                 , weight : weight }
      remote.add(data,cb)
    })
  })
}

function stopApp(x, cb) {
  if (!apps[x]) cb(new Error('app "'+x+'" does not exist'))
  apps[x].client.on('end',function(){
    apps[x].server.on('close',cb)
    apps[x].server.close()
    delete apps[x]
  })
  apps[x].client.end()
}

function sendRequest(route, cb) {
  cb = cb || function() {}
  var opts = 
    { method  : 'GET' 
    , host    : 'localhost'
    , headers : {host:route}
    , port    : balancerPort
    , path    : '/' }
  var req = http.request(opts, cb)
  req.end()
}

