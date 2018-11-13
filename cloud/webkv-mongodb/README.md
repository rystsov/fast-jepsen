1. update credentials in start.js
2. npm install
3. node ./start.js
4. check that web-interface works:
   
   - request topology:
       
       curl -v 127.0.0.1:13452/topology

   - try read key "key1":

       curl -v 127.0.0.1:13452/read/West%20US%202/key1
       curl -v 127.0.0.1:13452/read/South%20Central%20US/key1
       

   - if exists - try overwrite:

       curl -v -X POST -H "Content-Type: application/json" --data '{"key":"key1","writeID":"0000","value":0 }' 127.0.0.1:13452/overwrite

   - create new:

       curl -v -X POST -H "Content-Type: application/json" --data '{"key":"key2","writeID":"0000","value":0 }' 127.0.0.1:13452/create

   - perform an update

       curl -v -X POST -H "Content-Type: application/json" --data '{"key":"key2","prevWriteID":"0000","writeID":"0001", "value":0 }' 127.0.0.1:13452/cas