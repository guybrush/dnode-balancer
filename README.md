# dnode-balancer (proof of concept)
     ________________
    /                \
    | dnode-balancer |
    \______________  / ____       ___
                   \| / .  \  .-´/   \`-.
                      \____ \/   \___/   \__
                           \_`---´___`---´-´
                            /../..\ /..\..\
                            
* uses [http-proxy] to proxy requests
* provides a [dnode]-interface to set routes
* apps can connect to the dnode-interface and report for duty
* right now this runs with the new cluster-functionality of node

[http-proxy]: https://github.com/nodejitsu/node-http-proxy
[dnode]: https://github.com/substack/dnode

## cli

for now only this works:

    path/to/dnode-balancer/bin/cli.js start -p <balancerPort> \
                                            -h <balancerHost> \
                                            -P <dnodePort>    \
                                            -H <dnodeHost>

## api

    var db = require('dnode-balancer')
    var config = {balancer:{port:9901},dnode:{port:9902}}
    
    db(config,function(err){
      if (err) return console.log('something went wrong',err)
      console.log('balancer running on port '+config.balancer.port)
      console.log('dnode-interface running on port '+config.dnode.port)
      startApp()
    })
    
    
    // this is the app which tells the balancer to proxy requests

    var http = require('http')
    var dnode = require('dnode')
    var port = Math.floor(Math.random() * 40000 + 10000)
    
    function startApp() {
      http.createServer(function(req,res){
        res.end('hello world!')
      }).listen(port,function(){
        console.log('http-server running on port '+port)
        var opts = { port      : config.dnode.port 
                   , reconnect : 500  
                   }
        dnode().connect(opts,function(remote,conn){
          var proxyToThisApp =
            { route     : 'foo.bar.com'
            , host      : 'localhost'
            , port      : port
            , weight    : 10   // 1..10 (more weight = more requests)
            , permanent : true // if this is not set, the route will be deleted
                               // when this dnode-client disconnects
            }
          console.log('reporting for duty')
          remote.add(proxyToThisApp,function(err){
            if (err) return console.error('something went wrong!')
            console.log('dnode-balancer will proxy requests for me now')
          })
        })
      })
    }

to try it out, copy the code from above and start it. 
then run `curl http://localhost:9901 -H "Host:foo.bar.com"` - the output should 
be `hello world!`.
    
