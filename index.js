module.exports = init

var cluster = require('cluster')
  , numCPUs = require('os').cpus().length
  , httpProxy = require('http-proxy')
  , proxy = new httpProxy.RoutingProxy
  , dnode = require('dnode')
  , _ = require('underscore')
  , http = require('http')
  , https = require('https')
  , fs = require('fs')

//------------------------------------------------------------------------------
//                                                init
//------------------------------------------------------------------------------
  
function init(config, cb) {
  cb                   = cb                   || function() {}
  config               = config               || {}
  config.balancer      = config.balancer      || {}
  config.balancer.port = config.balancer.port || 8000
  config.balancer.host = config.balancer.host || '0.0.0.0'
  config.balancer.errorMsg = config.balancer.errorMsg || 'not in routing-table'
  config.dnode         = config.dnode         || {}
  config.dnode.port    = config.dnode.port    || 3000
  config.dnode.host    = config.dnode.host    || '0.0.0.0'
  
  if (cluster.isMaster) {
    var balancers = []
    var i = 0
    for (var j = 0; j < numCPUs; j++) {
      var balancer = cluster.fork()
      balancer.on('message',function(m){
        if (m.cmd == 'error') { 
          throw new Error('could not start balancer '+j)
          process.exit(1)
        }
        if (m.cmd == 'ready') {
          balancers.push(balancer)
          if (++i == numCPUs) {
            startDnode(config.dnode, setRoutes, cb)
          }
        }
      })
    }
    
    function setRoutes(routes) {
      balancers.map(function(x){x.send({routes:routes})})
    }
  }
  else {
    startBalancer(config.balancer,function(err){
      if (err) return process.send({cmd:'error'})
      process.send({cmd:'ready'})
    })
  }
}
  
//------------------------------------------------------------------------------
//                                                startDnode
//------------------------------------------------------------------------------

function startDnode(conf, setRoutes, cb) {
  var opts = {}
  opts.port = conf.port
  opts.host = conf.host
  
  if (conf.key && conf.cert) {
    opts.key = fs.readFileSync(conf.key)
    opts.cert = fs.readFileSync(conf.cert)
  }
  
  if (conf.ca) {
    var files = fs.readdirSync(conf.ca)
    if (files.length > 0) {
      opts.requestCert = true
      opts.rejectUnauthorized = true
      opts.ca = []
      files.map(function(x){
        opts.ca.push(fs.readFileSync(x))
      })
    }
  }
  var routes = {byId:{},byRoute:{},byConn:{}}
  var server = dnode(function(remote,conn){
    this.ls = function(cb){
      cb(null,routes)
    }
    this.add = function(routeToAdd, cb){
      if (routeToAdd.route && routeToAdd.port) {
        var id
        do id = Math.floor(Math.random() * Math.pow(2,32)).toString(16)
        while (routes.byId[id])
        
        routeToAdd.host = routeToAdd.host || '0.0.0.0'
        var weight = routeToAdd.weight
        if (!weight || weight < 1) weight = 1
        if (weight > 10) weight = 10
        var currRoute = routeToAdd.route
        var currProxy = 
          { host   : routeToAdd.host
          , port   : routeToAdd.port
          , route  : currRoute
          , weight : weight
          , id     : id }
        
        routes.byId[id] = currProxy
        routes.byConn[conn.id] = routes.byConn[conn.id] ||[]
        routes.byConn[conn.id].push(id)
        routes.byRoute[currRoute] = routes.byRoute[currRoute] || []
        routes.byRoute[currRoute].push(id)
        if (routes.byRoute[currRoute] > 2) {
          routes.byRoute[currRoute].push(id)
          var currRoutes = _.uniq(routes.byRoute[currRoute])
          var newRoutes = []
          currRoutes.push(id)
          for (var i=0;i<10;i++) {
            currRoutes.map(function(x){
              if (i%~~(10/routes.byId[x].weight)==0)
                newRoutes.push(x)
            })
          }
          routes.byRoute[currRoute] = newRoutes
        }
        setRoutes(routes)
        cb()
      }
    }
    this.update = function(){}
    this.del = function(id, cb){
      var curr = routes.byId[id]
      routes.byRoute[curr.route] = _.without(routes.byRoute[curr.route],id)
      if (routes.byRoute[curr.route].length == 0)
        delete routes.byRoute[curr.route]
      delete routes.byId[id]
    }
    this.subscribe = function(){}
    this.unsubscribe = function(){}
    var self = this
    conn.on('remote',function(remote){})
    conn.on('end',function(){
      _.each(routes.byConn[conn.id],function(id){
        self.del(id)
      })
      delete routes.byConn[conn.id]
      setRoutes(routes)
    })
  })
  server.listen(opts)
  server.on('ready',function(){cb()})
}

//------------------------------------------------------------------------------
//                                                startBalancer
//------------------------------------------------------------------------------

function startBalancer(conf, cb) {
  var opts = {}
  opts.port = conf.port
  opts.host = conf.host
  
  if (conf.key && conf.cert) {
    opts.key = fs.readFileSync(conf.key)
    opts.cert = fs.readFileSync(conf.cert)
  }
  
  var server
  if (opts.key && opts.cert) {
    server = https.createServer()
  }
  else {
    server = http.createServer()
  }
  
  server.on('request', handleRequest)
  server.on('upgrade', handleUpgrade)
  
  server.listen(opts.port, cb)
  
  var routes = {byId:{},byRoute:{}}
  process.on('message', function(m){
    if (m.routes) routes = m.routes
  })
  
  var sumRequests = {}
  var errorMsg = conf.errorMsg
  
  function handleRequest(req, res) {
    // req.buf = httpProxy.buffer(req)
    // res.on('finish', function onFinish() {req.buf.destroy()})
    var host = req.headers.host
    if (~~host.indexOf(':')) 
      host = host.split(':')[0]
    if (routes.byRoute[host]) {
      sumRequests[host] = sumRequests[host] || 0
      var len = routes.byRoute[host].length
      var id = routes.byRoute[host][sumRequests[host]%len]
      sumRequests[host]++
      var currProxy = { port : routes.byId[id].port
                      , host : routes.byId[id].host 
                      // , buffer : req.buf
                      }
      proxy.proxyRequest(req, res, currProxy)
    } else {
      res.writeHead(502)
      res.end(errorMsg)
    }
  }
  
  function handleUpgrade(req, socket, head) {
    req.head = head
    // req.buf = httpProxy.buffer(req)
    // socket.on('close', function onClose() {req.buf.destroy()})
    var host = req.headers.host
    if (~~host.indexOf(':')) 
      host = host.split(':')[0]
    if (routes.byRoute[host]) {
      sumRequests[host] = sumRequests[host] || 0
      var len = routes.byRoute[host].length
      var id = routes.byRoute[host][sumRequests[host]%len]
      sumRequests[host]++
      var id = routes.byRoute[host][0]
      var currProxy = { port : routes.byId[id].port
                      , host : routes.byId[id].host 
                      // , buffer : req.buf
                      }
      proxy.proxyWebSocketRequest(req, res, req.head, currProxy)
    }
  }
}

